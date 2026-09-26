package org.example.pet_social.service;

import org.example.pet_social.entity.User;
import org.example.pet_social.entity.UserLocation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Test Data Generator Service
 * Generates test users and telemetry data for demonstration
 */
@Service
public class TestDataGeneratorService {

    private static final Logger log = LoggerFactory.getLogger(TestDataGeneratorService.class);

    private final UserRegistryService userRegistryService;
    private final TelemetryProducerService telemetryProducerService;
    private final TelemetryConsumerService telemetryConsumerService; // direct processing for PoC
    private final DashboardService dashboardService;

    // Toronto coordinates for testing (Sprint 4 load test target: 50k+ users walking dogs after 5pm)
    private static final double TORONTO_LAT_MIN = 43.58;
    private static final double TORONTO_LAT_MAX = 43.86;
    private static final double TORONTO_LON_MIN = -79.64;
    private static final double TORONTO_LON_MAX = -79.12;

    private final String[] userRoles = {"PET_OWNER", "PET_SITTER", "VET", "BUSINESS"};
    private final long[] preferenceMasks = {1, 3, 5, 7, 15, 31};

    // Sample email domains for test data
    private final String[] emailDomains = {"gmail.com", "yahoo.com", "outlook.com", "example.com"};

    private Random random = new Random();
    private int generatedUserCount = 0;
    private int generatedTelemetryCount = 0;

    public TestDataGeneratorService(
            UserRegistryService userRegistryService,
            TelemetryProducerService telemetryProducerService,
            TelemetryConsumerService telemetryConsumerService,
            DashboardService dashboardService) {
        this.userRegistryService = userRegistryService;
        this.telemetryProducerService = telemetryProducerService;
        this.telemetryConsumerService = telemetryConsumerService;
        this.dashboardService = dashboardService;
    }

    /**
     * Generate N test users and register them
     */
    public void generateTestUsers(int count) {
        log.info("Starting to generate {} test users...", count);
        long startTime = System.currentTimeMillis();

        for (int i = 1; i <= count; i++) {
            try {
                String userName = "TestUser_" + i;
                String email = "testuser" + i + "@" + emailDomains[random.nextInt(emailDomains.length)];
                String role = userRoles[random.nextInt(userRoles.length)];
                long preferencesMask = preferenceMasks[random.nextInt(preferenceMasks.length)];

                User user = new User(userName, email, role, true);
                user.setMatchPreferencesMask(preferencesMask);

                userRegistryService.registerUser(user);
                generatedUserCount++;

                if (i % 100 == 0) {
                    log.info("Generated {} users...", i);
                }
            } catch (Exception e) {
                log.error("Failed to generate user {}: {}", i, e.getMessage());
            }
        }

        long endTime = System.currentTimeMillis();
        long duration = endTime - startTime;
        log.info("✅ Generated {} users in {} ms ({} users/sec)",
            generatedUserCount, duration, (generatedUserCount * 1000) / duration);
    }

    /**
     * Generate N telemetry records from random users
     */
    public void generateTestTelemetry(int count, int maxUserId) {
        log.info("Starting to generate {} telemetry records from {} users...", count, maxUserId);
        long startTime = System.currentTimeMillis();

        for (int i = 1; i <= count; i++) {
            try {
                // Random user ID (1 to maxUserId)
                long userId = random.nextInt(maxUserId) + 1;

                // Random location within Toronto bounds
                double latitude = TORONTO_LAT_MIN + (TORONTO_LAT_MAX - TORONTO_LAT_MIN) * random.nextDouble();
                double longitude = TORONTO_LON_MIN + (TORONTO_LON_MAX - TORONTO_LON_MIN) * random.nextDouble();

                UserLocation location = new UserLocation(userId, latitude, longitude);
                // For a simple PoC, process telemetry directly without requiring Kafka roundtrip
                try {
                    telemetryConsumerService.processTelemetry(location);
                } catch (Exception e) {
                    // fallback to sending via Kafka
                    telemetryProducerService.sendLocation(location);
                }
                generatedTelemetryCount++;

                if (i % 500 == 0) {
                    log.info("Generated {} telemetry records...", i);
                }
            } catch (Exception e) {
                log.error("Failed to generate telemetry {}: {}", i, e.getMessage());
            }
        }

        long endTime = System.currentTimeMillis();
        long duration = endTime - startTime;
        log.info("✅ Generated {} telemetry records in {} ms ({} records/sec)",
            generatedTelemetryCount, duration, (generatedTelemetryCount * 1000) / duration);
    }

    /**
     * Continuous telemetry stream (simulate live users)
     */
    public void startContinuousTelemetryStream(int userCount, int recordsPerSecond, int durationSeconds) {
        log.info("Starting continuous telemetry stream: {} users, {} rec/sec for {} seconds",
            userCount, recordsPerSecond, durationSeconds);

        new Thread(() -> {
            long endTime = System.currentTimeMillis() + (durationSeconds * 1000L);
            long startTime = System.currentTimeMillis();
            int recordCount = 0;

            while (System.currentTimeMillis() < endTime) {
                try {
                    long tickStart = System.currentTimeMillis();
                    for (int i = 0; i < recordsPerSecond; i++) {
                        long userId = random.nextInt(userCount) + 1;
                        double latitude = TORONTO_LAT_MIN + (TORONTO_LAT_MAX - TORONTO_LAT_MIN) * random.nextDouble();
                        double longitude = TORONTO_LON_MIN + (TORONTO_LON_MAX - TORONTO_LON_MIN) * random.nextDouble();

                        UserLocation location = new UserLocation(userId, latitude, longitude);
                        telemetryProducerService.sendLocation(location);
                        //dashboardService.incrementTelemetryCount();
                        recordCount++;
                    }

                    // Sleep only for the remainder of the second — a flat 1000ms sleep on top
                    // of however long the blast took made the offered rate bursty and lower
                    // than requested (the throughput-oscillation issue from the 2026-06-16 notes).
                    long remaining = 1000 - (System.currentTimeMillis() - tickStart);
                    if (remaining > 0) {
                        Thread.sleep(remaining);
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }

            long actualDuration = System.currentTimeMillis() - startTime;
            log.info("✅ Continuous stream complete: {} records in {} ms ({} records/sec)",
                recordCount, actualDuration, (recordCount * 1000) / actualDuration);
        }).start();
    }

    /**
     * Get generation statistics
     */
    public Map<String, Object> getGenerationStats() {
        return Map.of(
            "generatedUsers", generatedUserCount,
            "generatedTelemetry", generatedTelemetryCount,
            "totalDataPoints", generatedUserCount + generatedTelemetryCount
        );
    }
}

