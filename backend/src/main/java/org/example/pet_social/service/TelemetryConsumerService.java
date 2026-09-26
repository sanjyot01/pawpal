package org.example.pet_social.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.example.pet_social.entity.UserLocation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.geo.Point;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class TelemetryConsumerService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryConsumerService.class);

    private final ObjectMapper objectMapper;
    private final StringRedisTemplate redisTemplate;
    private final DashboardService dashboardService;
    private final Timer processingTimer;
    private final Timer deserializeTimer;
    private final Timer redisPipelineTimer;
    private final DistributionSummary batchSizeSummary;
    private final Counter parseErrorCounter;
    private final Counter batchErrorCounter;
    private final AtomicInteger pipelineInFlight = new AtomicInteger(0);
    // Tracks distinct @KafkaListener thread names actually seen processing a message -
    // proves how much real parallelism the consumer side achieves, independent of the
    // configured `concurrency` value (which only requests threads; partitions cap how many get used).
    private final Set<String> consumerThreadsSeen = ConcurrentHashMap.newKeySet();

    private static final String GEO_KEY = "users:geo";
    // Volatile presence, refreshed on every ping and allowed to expire. Kept separate from
    // users:meta:* (durable active/preferences, no TTL) — they shared one hash until the
    // per-ping EXPIRE started taking the matching fields with it, silently making any user
    // idle for 6h unmatchable. Expiry here is the point: no ping means not out walking.
    private static final String PRESENCE_PREFIX = "users:presence:";
    static final Duration PRESENCE_TTL = Duration.ofHours(6);

    public TelemetryConsumerService(ObjectMapper objectMapper, StringRedisTemplate redisTemplate, DashboardService dashboardService, MeterRegistry meterRegistry) {
        this.objectMapper = objectMapper;
        this.redisTemplate = redisTemplate;
        this.dashboardService = dashboardService;
        this.processingTimer = Timer.builder("telemetry.processing.duration")
                .description("Time to write a telemetry record into the Redis geo index + metadata")
                .publishPercentiles(0.5, 0.95, 0.99)
                .register(meterRegistry);
        this.deserializeTimer = Timer.builder("telemetry.deserialize.duration")
                .description("Time to parse the Kafka message JSON into a UserLocation")
                .publishPercentiles(0.5, 0.95, 0.99)
                .register(meterRegistry);
        this.redisPipelineTimer = Timer.builder("telemetry.redis.pipeline.duration")
                .description("Time spent inside executePipelined() for one Kafka batch (one or more telemetry records)")
                .publishPercentiles(0.5, 0.95, 0.99)
                .register(meterRegistry);
        // Diagnoses the throughput oscillation: if polls hand the listener small, uneven
        // batches, the pipeline amortization is lost — this shows the actual distribution.
        this.batchSizeSummary = DistributionSummary.builder("telemetry.kafka.batch.size")
                .description("Records handed to the batch listener per poll")
                .publishPercentiles(0.5, 0.95, 0.99)
                .register(meterRegistry);
        // Processing is deliberately at-most-once (a lost ping is superseded by the next
        // one); these counters exist so a systematic failure can't hide as low traffic.
        this.parseErrorCounter = Counter.builder("telemetry.consume.parse.errors")
                .description("Telemetry messages dropped because they failed to parse")
                .register(meterRegistry);
        this.batchErrorCounter = Counter.builder("telemetry.consume.batch.errors")
                .description("Telemetry batches dropped because the Redis write failed")
                .register(meterRegistry);
        Gauge.builder("telemetry.redis.pipeline.inflight", pipelineInFlight, AtomicInteger::get)
                .description("Number of threads currently blocked inside the Redis pipeline call - pegged near concurrency means connection contention")
                .register(meterRegistry);
        Gauge.builder("telemetry.kafka.consumer.distinct.threads", consumerThreadsSeen, Set::size)
                .description("Distinct @KafkaListener thread names that have processed at least one message - the real achieved parallelism, vs the requested 'concurrency' value")
                .register(meterRegistry);
    }

    // Batch listener. Concurrency must not exceed the topic's partition count (extra threads
    // sit idle — proven in the 2026-06-16 session when the topic had 1 auto-created partition).
    // KafkaTopicConfig now declares user-telemetry with app.kafka.telemetry-partitions (default 3),
    // so the same property drives both sides and they can't drift apart.
    @KafkaListener(topics = "user-telemetry", groupId = "user-group",
            concurrency = "${app.kafka.telemetry-partitions:3}")
    public void consumeTelemetryBatch(List<String> messages) {
        consumerThreadsSeen.add(Thread.currentThread().getName());
        batchSizeSummary.record(messages.size());

        List<UserLocation> locations = new ArrayList<>(messages.size());
        for (String message : messages) {
            try {
                UserLocation loc = deserializeTimer.record(() -> {
                    try {
                        return objectMapper.readValue(message, UserLocation.class);
                    } catch (Exception e) {
                        throw new RuntimeException(e);
                    }
                });
                if (loc == null || loc.userId() == null) {
                    log.warn("Received invalid telemetry - message={}", message);
                    parseErrorCounter.increment();
                    continue;
                }
                locations.add(loc);
            } catch (Exception e) {
                log.error("Failed to parse telemetry message: {}", message, e);
                parseErrorCounter.increment();
            }
        }

        if (locations.isEmpty()) {
            return;
        }

        processingTimer.record(() -> processBatchInternal(locations));
    }

    // Public method to process telemetry directly (bypass Kafka) - useful for PoC/testing
    public void processTelemetry(UserLocation loc) {
        if (loc == null || loc.userId() == null) {
            log.warn("processTelemetry called with invalid loc={}", loc);
            return;
        }

        processingTimer.record(() -> processTelemetryInternal(loc));
    }

    private void processTelemetryInternal(UserLocation loc) {
        processBatchInternal(List.of(loc));
    }

    // One Redis pipeline for the whole Kafka batch - amortizes the round-trip cost across
    // the batch. All commands MUST go through the callback's connection: template ops
    // (geoOps.add, opsForHash, ...) inside executePipelined check out their OWN pooled
    // connections, so nothing rode the pipeline and each command was a separate round trip
    // (and the nested checkouts were the pool contention the in-flight gauge kept showing).
    private void processBatchInternal(List<UserLocation> locations) {
        byte[] geoKey = bytes(GEO_KEY);
        byte[] countKey = bytes(DashboardService.TELEMETRY_COUNT_KEY);
        byte[] lastSeenField = bytes("lastSeen");
        byte[] availableField = bytes("available");
        byte[] trueValue = bytes("true");
        try {
            pipelineInFlight.incrementAndGet();
            try {
                redisPipelineTimer.record(() -> redisTemplate.executePipelined((RedisCallback<Object>) connection -> {
                    byte[] now = bytes(String.valueOf(Instant.now().toEpochMilli()));
                    for (UserLocation loc : locations) {
                        String member = String.valueOf(loc.userId());
                        Point point = new Point(loc.longitude(), loc.latitude()); // Point(x=lon,y=lat)
                        connection.geoCommands().geoAdd(geoKey, point, bytes(member));

                        byte[] presenceKey = bytes(PRESENCE_PREFIX + member);
                        Map<byte[], byte[]> presence = new HashMap<>();
                        presence.put(lastSeenField, now);
                        presence.put(availableField, trueValue);
                        connection.hashCommands().hMSet(presenceKey, presence);
                        connection.keyCommands().expire(presenceKey, PRESENCE_TTL.toSeconds());
                    }
                    connection.stringCommands().incrBy(countKey, locations.size());
                    return null;
                }));
            } finally {
                pipelineInFlight.decrementAndGet();
            }

            log.debug("Processed telemetry batch of {} records", locations.size());

            for (int i = 0; i < locations.size(); i++) {
                dashboardService.recordTelemetryProcessed();
            }
        } catch (Exception e) {
            log.error("Failed to process telemetry batch of size {}", locations.size(), e);
            batchErrorCounter.increment();
        }
    }

    private static byte[] bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }
}
