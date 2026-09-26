package org.example.pet_social.service;

import org.example.pet_social.repository.UserRepository;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;

import java.util.HashMap;
import java.util.Map;

/**
 * Dashboard Service
 * Aggregates metrics and statistics for the dashboard
 */
@Service
public class DashboardService {

    private final UserRepository userRepository;
    private final StringRedisTemplate redisTemplate;
    private final MeterRegistry meterRegistry;

    private final Counter telemetryCounter;
    private final Counter matchSuccessCounter;
    private final Counter matchFailedCounter;

    static final String TELEMETRY_COUNT_KEY = "metrics:telemetry:count";
    private static final String MATCH_SUCCESS_KEY = "metrics:match:success";
    private static final String MATCH_FAILED_KEY = "metrics:match:failed";
    private static final String GEO_KEY = "users:geo";

    public DashboardService(UserRepository userRepository, StringRedisTemplate redisTemplate, MeterRegistry meterRegistry) {
        this.userRepository = userRepository;
        this.redisTemplate = redisTemplate;
        this.meterRegistry = meterRegistry;

        // Register counters
        this.telemetryCounter = Counter.builder("matching.telemetry.processed")
                .description("Total telemetry messages processed")
                .register(meterRegistry);

        this.matchSuccessCounter = Counter.builder("matching.match.success")
                .description("Number of successful matches")
                .register(meterRegistry);

        this.matchFailedCounter = Counter.builder("matching.match.failed")
                .description("Number of failed matches")
                .register(meterRegistry);

        // Register gauges backed by functions
        Gauge.builder("matching.users.total", userRepository, UserRepository::count)
                .description("Total number of users in Postgres")
                .register(meterRegistry);

        Gauge.builder("matching.users.available", this, DashboardService::availableUsersCount)
                .description("Number of available users")
                .register(meterRegistry);

        Gauge.builder("matching.users.in_geo", this, DashboardService::usersInGeoCount)
                .description("Number of users in Redis geo index")
                .register(meterRegistry);
    }

    // Helper used by Micrometer gauges
    private double availableUsersCount() {
        try {
            return userRepository.countByIsActiveTrue();
        } catch (Exception e) {
            return 0.0;
        }
    }

    private double usersInGeoCount() {
        try {
            Long count = redisTemplate.opsForZSet().zCard(GEO_KEY);
            return count != null ? count.doubleValue() : 0.0;
        } catch (Exception e) {
            return 0.0;
        }
    }

    /**
     * Get all dashboard metrics
     */
    public Map<String, Object> getDashboardMetrics() {
        Map<String, Object> metrics = new HashMap<>();

        // User metrics
        long totalUsers = userRepository.count();
        long activeUsers = userRepository.countByIsActiveTrue();

        // Telemetry metrics
        String telemetryCountStr = redisTemplate.opsForValue().get(TELEMETRY_COUNT_KEY);
        long telemetryCount = telemetryCountStr != null ? Long.parseLong(telemetryCountStr) : 0L;

        // Match metrics
        String matchSuccessStr = redisTemplate.opsForValue().get(MATCH_SUCCESS_KEY);
        String matchFailedStr = redisTemplate.opsForValue().get(MATCH_FAILED_KEY);
        long matchSuccess = matchSuccessStr != null ? Long.parseLong(matchSuccessStr) : 0L;
        long matchFailed = matchFailedStr != null ? Long.parseLong(matchFailedStr) : 0L;

        // Geo index metrics - get number of members in the geo set
        Long usersInGeo = 0L;
        try {
            usersInGeo = redisTemplate.opsForZSet().zCard(GEO_KEY);
            if (usersInGeo == null) {
                usersInGeo = 0L;
            }
        } catch (Exception e) {
            usersInGeo = 0L;
        }

        // Build response
        metrics.put("users", Map.of(
            "total", totalUsers,
            "available", activeUsers,
            "inGeoIndex", usersInGeo
        ));

        metrics.put("telemetry", Map.of(
            "totalProcessed", telemetryCount
        ));

        metrics.put("matching", Map.of(
            "successfulMatches", matchSuccess,
            "failedMatches", matchFailed,
            "successRate", matchSuccess + matchFailed > 0 
                ? String.format("%.2f%%", (100.0 * matchSuccess) / (matchSuccess + matchFailed))
                : "N/A"
        ));

        metrics.put("summary", Map.of(
            "status", "RUNNING",
            "timestamp", System.currentTimeMillis(),
            "dataPoints", telemetryCount,
            "activeProcessing", usersInGeo != null && usersInGeo > 0
        ));

        return metrics;
    }

    /**
     * Increment telemetry counter
     */
    public void incrementTelemetryCount() {
        redisTemplate.opsForValue().increment(TELEMETRY_COUNT_KEY);
        try { telemetryCounter.increment(); } catch (Exception ignored) {}
    }

    // Micrometer-only increment, for callers (e.g. TelemetryConsumerService) that already
    // pipeline the Redis INCR for TELEMETRY_COUNT_KEY themselves to avoid a separate round-trip.
    public void recordTelemetryProcessed() {
        try { telemetryCounter.increment(); } catch (Exception ignored) {}
    }

    /**
     * Increment successful match counter
     */
    public void incrementMatchSuccess() {
        redisTemplate.opsForValue().increment(MATCH_SUCCESS_KEY);
        try { matchSuccessCounter.increment(); } catch (Exception ignored) {}
    }

    /**
     * Increment failed match counter
     */
    public void incrementMatchFailed() {
        redisTemplate.opsForValue().increment(MATCH_FAILED_KEY);
        try { matchFailedCounter.increment(); } catch (Exception ignored) {}
    }

    /**
     * Reset all metrics (for testing)
     */
    public void resetMetrics() {
        redisTemplate.delete(TELEMETRY_COUNT_KEY);
        redisTemplate.delete(MATCH_SUCCESS_KEY);
        redisTemplate.delete(MATCH_FAILED_KEY);
    }
}

