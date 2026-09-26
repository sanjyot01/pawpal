package org.example.pet_social.service;

import org.example.pet_social.entity.User;
import org.example.pet_social.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Re-seeds users:meta:* from Postgres on startup.
 *
 * Why this exists: users:meta used to share a key with the per-ping presence fields
 * under a 6h TTL, so any user who stopped sending telemetry silently lost their
 * `active`/`preferences` and became unmatchable. Those fields are only written at
 * registration, so the damage was permanent for existing accounts — a dev database
 * was found with 43 users, 127 geo positions and 2 surviving meta keys.
 *
 * Postgres is the source of truth for both fields, so rewriting them is authoritative
 * rather than merely a repair, and running it every boot makes any environment
 * self-heal instead of needing a manual redis-cli fix.
 *
 * Paged and pipelined deliberately: loading every user at once to write a Redis key
 * is the same mistake as the dashboard gauge that hydrated the whole user table on
 * every scrape.
 */
@Component
public class UserMetaBackfillRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(UserMetaBackfillRunner.class);
    private static final String META_PREFIX = "users:meta:";
    private static final int PAGE_SIZE = 500;

    private final UserRepository userRepository;
    private final StringRedisTemplate redisTemplate;
    private final boolean enabled;

    public UserMetaBackfillRunner(UserRepository userRepository,
                                  StringRedisTemplate redisTemplate,
                                  @Value("${app.matching.backfill-meta-on-startup:true}") boolean enabled) {
        this.userRepository = userRepository;
        this.redisTemplate = redisTemplate;
        this.enabled = enabled;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled) {
            return;
        }
        try {
            long written = 0;
            Pageable page = PageRequest.of(0, PAGE_SIZE);
            Slice<User> slice;
            do {
                slice = userRepository.findAllBy(page);
                List<User> users = slice.getContent();
                if (!users.isEmpty()) {
                    writeBatch(users);
                    written += users.size();
                }
                page = page.next();
            } while (slice.hasNext());

            log.info("Seeded users:meta for {} users (matching metadata is authoritative from Postgres)", written);
        } catch (Exception e) {
            // Never block startup on this: matching degrades, the app still serves.
            log.warn("users:meta backfill failed; existing users may not appear as match candidates", e);
        }
    }

    private void writeBatch(List<User> users) {
        redisTemplate.executePipelined((RedisCallback<Object>) connection -> {
            for (User user : users) {
                byte[] key = (META_PREFIX + user.getId()).getBytes(StandardCharsets.UTF_8);
                long mask = user.getMatchPreferencesMask() == null ? 0L : user.getMatchPreferencesMask();
                Map<byte[], byte[]> meta = new HashMap<>();
                meta.put(bytes("active"), bytes(String.valueOf(user.isActive())));
                meta.put(bytes("preferences"), bytes(String.valueOf(mask)));
                connection.hashCommands().hMSet(key, meta);
            }
            return null;
        });
    }

    private static byte[] bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }
}
