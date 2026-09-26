package org.example.pet_social.service;

import org.example.pet_social.entity.User;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Service
public class UserRegistryService {

    private final UserService userService; // DB persistence (existing)
    private final StringRedisTemplate redisTemplate;

    // Durable profile facts used by matching. Deliberately has NO TTL: this hash used to
    // share a key with the per-ping presence fields, whose 6h refresh expired the whole
    // hash — so a user idle for 6h silently became unmatchable until they re-registered.
    // Volatile presence now lives under users:presence:* (see TelemetryConsumerService).
    private static final String META_PREFIX = "users:meta:";

    public UserRegistryService(UserService userService, StringRedisTemplate redisTemplate) {
        this.userService = userService;
        this.redisTemplate = redisTemplate;
    }

    /**
     * Persist user in DB and write initial metadata to Redis.
     */
    public User registerUser(User user) {
        User saved = userService.registerUser(user);

        String metaKey = META_PREFIX + saved.getId();
        long preferencesMask = saved.getMatchPreferencesMask() == null ? 0L : saved.getMatchPreferencesMask();
        Map<String, String> meta = new HashMap<>();
        meta.put("active", String.valueOf(saved.isActive()));
        meta.put("preferences", String.valueOf(preferencesMask));

        redisTemplate.opsForHash().putAll(metaKey, meta);

        return saved;
    }

    public void updateActiveStatus(Long userId, boolean active) {
        String metaKey = META_PREFIX + userId;
        redisTemplate.opsForHash().put(metaKey, "active", String.valueOf(active));
    }

    public void updatePreferences(Long userId, long preferencesMask) {
        String metaKey = META_PREFIX + userId;
        redisTemplate.opsForHash().put(metaKey, "preferences", String.valueOf(preferencesMask));
    }

    public void removeUserMeta(Long userId) {
        String metaKey = META_PREFIX + userId;
        redisTemplate.delete(metaKey);
    }
}
