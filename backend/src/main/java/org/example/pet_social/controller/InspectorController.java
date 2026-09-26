package org.example.pet_social.controller;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

// Unauthenticated introspection endpoint — disabled in real deployments via
// APP_TEST_ENDPOINTS_ENABLED=false (see docker-compose.aws.yml).
@RestController
@ConditionalOnProperty(name = "app.test-endpoints.enabled", havingValue = "true", matchIfMissing = true)
@RequestMapping("/api/inspector")
public class InspectorController {

    private final StringRedisTemplate redisTemplate;

    public InspectorController(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @GetMapping("/inspect")
    public ResponseEntity<Map<String, Object>> inspect() {
        String telemetryCount = redisTemplate.opsForValue().get("metrics:telemetry:count");
        Long geoCount = 0L;
        try {
            geoCount = redisTemplate.opsForZSet().zCard("users:geo");
        } catch (Exception e) {
            // fallback
            geoCount = 0L;
        }

        // SCAN, not KEYS: KEYS is a single blocking O(N) pass over the whole keyspace and
        // stalls every other Redis caller (telemetry writes, matching) while it runs.
        long metaKeys = 0L;
        try (Cursor<String> cursor = redisTemplate.scan(
                ScanOptions.scanOptions().match("users:meta:*").count(1000).build())) {
            while (cursor.hasNext()) {
                cursor.next();
                metaKeys++;
            }
        } catch (Exception e) {
            metaKeys = 0L;
        }

        return ResponseEntity.ok(Map.of(
            "telemetryCount", telemetryCount != null ? Long.parseLong(telemetryCount) : 0L,
            "usersInGeo", geoCount,
            "userMetaKeys", metaKeys
        ));
    }
}

