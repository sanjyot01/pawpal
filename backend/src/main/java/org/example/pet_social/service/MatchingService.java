package org.example.pet_social.service;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.data.geo.Circle;
import org.springframework.data.geo.Distance;
import org.springframework.data.geo.GeoResult;
import org.springframework.data.geo.GeoResults;
import org.springframework.data.geo.Metrics;
import org.springframework.data.geo.Point;
import org.springframework.data.redis.connection.RedisGeoCommands;
import org.springframework.data.redis.core.GeoOperations;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;

/**
 * Walking-partner matching engine.
 * Responsibilities:
 * - search candidates in Redis by radius
 * - load per-user metadata
 * - filter by availability and matching-preferences bitmask
 * - return the nearest valid user
 * Candidate search is bounded (GEOSEARCH COUNT, nearest-first) and metadata is
 * fetched in one pipelined round-trip per radius — an unbounded search plus one
 * HGETALL per candidate is O(city population) per request at load-test density.
 */
@Service
public class MatchingService {

    private static final String GEO_KEY = "users:geo";
    private static final String META_PREFIX = "users:meta:";
    private static final String PRESENCE_PREFIX = "users:presence:";

    // SLA expansion radii in meters.
    private final List<Double> radiiMeters = List.of(2000.0, 5000.0, 10000.0);

    // Candidate cap per expansion step. Results come back nearest-first, so the cap must
    // grow with the radius — a wider search with the same cap would return the exact same
    // nearest members that already failed the filter. Caps bound the worst case at
    // 50+100+200 metadata reads per request instead of O(city population).
    private static final List<Integer> CANDIDATE_LIMITS = List.of(50, 100, 200);

    private final StringRedisTemplate redis;
    private final GeoOperations<String, String> geoOps;
    private final DashboardService dashboardService;
    private final Timer matchingTimer;
    private final boolean requireFreshPresence;

    @Autowired
    public MatchingService(StringRedisTemplate redis, DashboardService dashboardService, MeterRegistry meterRegistry,
                           @Value("${app.matching.require-fresh-presence:true}") boolean requireFreshPresence) {
        this.redis = redis;
        this.geoOps = redis.opsForGeo();
        this.dashboardService = dashboardService;
        this.requireFreshPresence = requireFreshPresence;
        this.matchingTimer = Timer.builder("matching.duration")
                .description("Time to resolve a walking-partner match request")
                .publishPercentiles(0.5, 0.95, 0.99)
                .register(meterRegistry);
    }

    /**
     * @param requesterUserId the authenticated caller, excluded from the results. A user is
     *                        always the nearest member to their own position, so without this
     *                        every request matched the caller with themselves. Null only for
     *                        callers that have no identity (none today) and disables the skip.
     */
    public Optional<Long> findNearestMatch(Long requesterUserId, double latitude, double longitude, long requiredPreferencesMask) {
        return matchingTimer.record(() -> findNearestMatchInternal(requesterUserId, latitude, longitude, requiredPreferencesMask));
    }

    private Optional<Long> findNearestMatchInternal(Long requesterUserId, double latitude, double longitude, long requiredPreferencesMask) {
        String selfId = requesterUserId == null ? null : String.valueOf(requesterUserId);
        Point point = new Point(longitude, latitude);

        for (int step = 0; step < radiiMeters.size(); step++) {
            // Redis geo radius search in kilometers, nearest-first and capped.
            Circle radius = new Circle(point, new Distance(radiiMeters.get(step) / 1000.0, Metrics.KILOMETERS));
            RedisGeoCommands.GeoRadiusCommandArgs args = RedisGeoCommands.GeoRadiusCommandArgs.newGeoRadiusArgs()
                    .limit(CANDIDATE_LIMITS.get(step))
                    .sortAscending();

            GeoResults<RedisGeoCommands.GeoLocation<String>> results = geoOps.radius(GEO_KEY, radius, args);

            if (results == null || results.getContent().isEmpty()) {
                continue;
            }

            List<String> candidateIds = new ArrayList<>(results.getContent().size());
            for (GeoResult<RedisGeoCommands.GeoLocation<String>> geoResult : results.getContent()) {
                String candidateId = geoResult.getContent().getName();
                // Drop the caller here rather than after the metadata fetch: they are the
                // nearest member to their own coordinates, so this is the one candidate
                // guaranteed to be in every result set.
                if (candidateId.equals(selfId)) {
                    continue;
                }
                candidateIds.add(candidateId);
            }

            if (candidateIds.isEmpty()) {
                continue;
            }

            // One pipelined round-trip fetches every candidate's durable metadata plus a
            // presence probe; two replies per candidate, in candidate (nearest-first) order.
            List<Object> replies = redis.executePipelined((RedisCallback<Object>) connection -> {
                for (String id : candidateIds) {
                    connection.hashCommands().hGetAll((META_PREFIX + id).getBytes(StandardCharsets.UTF_8));
                    connection.keyCommands().exists((PRESENCE_PREFIX + id).getBytes(StandardCharsets.UTF_8));
                }
                return null;
            });

            for (int i = 0; i < candidateIds.size(); i++) {
                int metaIdx = i * 2;
                int presenceIdx = metaIdx + 1;
                Object raw = metaIdx < replies.size() ? replies.get(metaIdx) : null;
                if (!(raw instanceof Map<?, ?> meta) || meta.isEmpty()) {
                    continue;
                }

                // Presence expires when a user stops pinging, so "out walking right now" is
                // a live signal rather than the profile flag matching used to rely on.
                if (requireFreshPresence) {
                    Object seen = presenceIdx < replies.size() ? replies.get(presenceIdx) : null;
                    if (!Boolean.TRUE.equals(seen)) {
                        continue;
                    }
                }

                boolean active = Boolean.parseBoolean(String.valueOf(meta.get("active")));
                long candidatePreferencesMask = parseLong(meta.get("preferences"));

                // Candidate must be active and satisfy all required preference bits.
                if (active && (candidatePreferencesMask & requiredPreferencesMask) == requiredPreferencesMask) {
                    // Successful match - increment dashboard metric
                    try {
                        dashboardService.incrementMatchSuccess();
                    } catch (Exception ignored) {
                    }
                    return Optional.of(Long.parseLong(candidateIds.get(i)));
                }
            }
        }

        // No match found across all radii
        try {
            dashboardService.incrementMatchFailed();
        } catch (Exception ignored) {
        }

        return Optional.empty();
    }

    /**
     * Parse a long safely.
     * If the value is missing or malformed, treat it as zero.
     */
    private long parseLong(Object value) {
        if (value == null) {
            return 0L;
        }

        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return 0L;
        }
    }
}
