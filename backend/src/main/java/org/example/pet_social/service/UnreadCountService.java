package org.example.pet_social.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.pet_social.repository.MessageRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Grouped unread-message badges ({WALK, DATE, MARKET}) with a short-TTL Redis
 * cache in front of the GROUP BY query. Every board screen polls this endpoint
 * on focus, so the cache absorbs most of that traffic; writers (message send,
 * thread read) invalidate the affected user's entry so badges never lag more
 * than one poll. Redis being down degrades to querying Postgres directly.
 */
@Service
public class UnreadCountService {

    private static final Logger log = LoggerFactory.getLogger(UnreadCountService.class);
    private static final String KEY_PREFIX = "unread:counts:";
    private static final Duration TTL = Duration.ofSeconds(15);

    private final MessageRepository messageRepository;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public UnreadCountService(MessageRepository messageRepository,
                              StringRedisTemplate redisTemplate,
                              ObjectMapper objectMapper) {
        this.messageRepository = messageRepository;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    /** Unread counts keyed the way the app reads them: WALK / DATE / MARKET. */
    public Map<String, Long> getCounts(Long userId) {
        String key = KEY_PREFIX + userId;
        try {
            String cached = redisTemplate.opsForValue().get(key);
            if (cached != null) {
                return objectMapper.readValue(cached, new TypeReference<LinkedHashMap<String, Long>>() {});
            }
        } catch (Exception e) {
            log.warn("unread-counts cache read failed for user {}", userId, e);
        }

        Map<String, Long> counts = compute(userId);
        try {
            redisTemplate.opsForValue().set(key, objectMapper.writeValueAsString(counts), TTL);
        } catch (Exception e) {
            log.warn("unread-counts cache write failed for user {}", userId, e);
        }
        return counts;
    }

    /** Call whenever a user's unread set changes (message received / thread read). */
    public void invalidate(Long userId) {
        try {
            redisTemplate.delete(KEY_PREFIX + userId);
        } catch (Exception e) {
            log.warn("unread-counts cache invalidation failed for user {}", userId, e);
        }
    }

    private Map<String, Long> compute(Long userId) {
        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put("WALK", 0L);
        counts.put("DATE", 0L);
        counts.put("MARKET", 0L);
        List<Object[]> rows = messageRepository.countUnreadGroupedByContextType(userId);
        for (Object[] row : rows) {
            String contextType = (String) row[0];
            long count = ((Number) row[1]).longValue();
            switch (contextType) {
                case "WALK_REQUEST" -> counts.merge("WALK", count, Long::sum);
                case "DATE_REQUEST" -> counts.merge("DATE", count, Long::sum);
                case "LISTING" -> counts.merge("MARKET", count, Long::sum);
                default -> { /* MATCH / GENERAL threads have no app badge */ }
            }
        }
        return counts;
    }
}