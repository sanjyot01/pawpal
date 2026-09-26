package org.example.pet_social.controller;

import org.example.pet_social.entity.UserLocation;
import org.example.pet_social.service.TestDataGeneratorService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Test Data Controller
 * Endpoints for generating and managing test data.
 * Unauthenticated and able to generate unbounded load (/stream spawns producer threads),
 * so real deployments disable it via APP_TEST_ENDPOINTS_ENABLED=false.
 */
@RestController
@ConditionalOnProperty(name = "app.test-endpoints.enabled", havingValue = "true", matchIfMissing = true)
@RequestMapping("/api/test-data")
public class TestDataController {

    private static final Logger log = LoggerFactory.getLogger(TestDataController.class);
    private final TestDataGeneratorService testDataGeneratorService;
    private final org.example.pet_social.service.TelemetryConsumerService telemetryConsumerService;

    public TestDataController(TestDataGeneratorService testDataGeneratorService, org.example.pet_social.service.TelemetryConsumerService telemetryConsumerService) {
        this.testDataGeneratorService = testDataGeneratorService;
        this.telemetryConsumerService = telemetryConsumerService;
    }

    /**
     * Generate N test users
     * Usage: POST /api/test-data/users?count=1000
     */
    @PostMapping("/users")
    public ResponseEntity<Map<String, String>> generateUsers(
            @RequestParam(defaultValue = "100") int count) {
        log.info("Generating {} test users", count);
        testDataGeneratorService.generateTestUsers(count);
        return ResponseEntity.ok(Map.of("status", "Users generation started", "count", String.valueOf(count)));
    }

    /**
     * Generate N telemetry records
     * Usage: POST /api/test-data/telemetry?count=5000&maxUserId=1000
     */
    @PostMapping("/telemetry")
    public ResponseEntity<Map<String, String>> generateTelemetry(
            @RequestParam(defaultValue = "1000") int count,
            @RequestParam(defaultValue = "100") Integer maxUserId) {
        log.info("Generating {} telemetry records from {} users", count, maxUserId);
        testDataGeneratorService.generateTestTelemetry(count, maxUserId);
        return ResponseEntity.ok(Map.of(
            "status", "Telemetry generation started",
            "count", String.valueOf(count),
            "users", String.valueOf(maxUserId)
        ));
    }

    /**
     * Start continuous telemetry stream
     * Usage: POST /api/test-data/stream?users=500&rps=100&duration=60
     */
    @PostMapping("/stream")
    public ResponseEntity<Map<String, String>> startStream(
            @RequestParam(defaultValue = "100") Integer users,
            @RequestParam(defaultValue = "50", name = "rps") int recordsPerSecond,
            @RequestParam(defaultValue = "30") int duration) {
        log.info("Starting continuous stream: {} users, {} rec/sec for {} seconds",
            users, recordsPerSecond, duration);
        testDataGeneratorService.startContinuousTelemetryStream(users, recordsPerSecond, duration);
        return ResponseEntity.ok(Map.of(
            "status", "Continuous stream started",
            "users", String.valueOf(users),
            "recordsPerSecond", String.valueOf(recordsPerSecond),
            "durationSeconds", String.valueOf(duration)
        ));
    }

    /**
     * Get test data generation statistics
     */
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats() {
        return ResponseEntity.ok(testDataGeneratorService.getGenerationStats());
    }

    /**
     * Process a single telemetry record synchronously (PoC helper).
     * POST /api/test-data/telemetry/single
     */
    @PostMapping("/telemetry/single")
    public ResponseEntity<Map<String, String>> processSingleTelemetry(@RequestBody UserLocation location) {
        try {
            telemetryConsumerService.processTelemetry(location);
            return ResponseEntity.ok(Map.of("status", "processed", "userId", String.valueOf(location.userId())));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("status", "error", "error", e.getMessage()));
        }
    }

    /**
     * Process a bulk array of telemetry records synchronously (PoC helper).
     * POST /api/test-data/telemetry/bulk
     */
    @PostMapping("/telemetry/bulk")
    public ResponseEntity<Map<String, Object>> processBulkTelemetry(@RequestBody java.util.List<UserLocation> locations) {
        int processed = 0;
        for (UserLocation loc : locations) {
            try {
                telemetryConsumerService.processTelemetry(loc);
                processed++;
            } catch (Exception e) {
                // continue on error
            }
        }
        return ResponseEntity.ok(Map.of("status", "processed", "count", processed));
    }
}

