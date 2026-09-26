package org.example.pet_social.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * Throttles the token-minting endpoints. Every one of them is expensive on purpose —
 * BCrypt costs ~100 ms of CPU per attempt and Google verification makes an outbound
 * call — so an unthrottled /api/auth/login is a CPU exhaustion primitive: a handful of
 * connections saturate every Tomcat worker on the box and the rest of the API stops
 * responding. That is the "no rate limiting" finding in deploy/SINGLE_INSTANCE.md.
 *
 * Two independent windows, because they stop different attacks:
 * <ul>
 *   <li><b>per IP</b> — counts every attempt, and is what caps the CPU burn.</li>
 *   <li><b>per account</b> — counts only <em>failed</em> attempts, and is what stops a
 *       password-spray spread across many source addresses. Failures are cleared on a
 *       successful login, so a user who eventually types the right password is not
 *       punished for the typos before it.</li>
 * </ul>
 *
 * Counters live in Redis so the limit is per deployment rather than per JVM and survives
 * an app restart (an attacker could otherwise reset their budget by crashing the app).
 * Every Redis failure fails <em>open</em>: a broken cache must not lock the whole user
 * base out of an otherwise healthy application.
 */
@Service
public class LoginRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(LoginRateLimiter.class);

    private static final String IP_PREFIX = "ratelimit:login:ip:";
    private static final String ACCOUNT_PREFIX = "ratelimit:login:account:";

    /** Outcome of a limit check: allowed, or blocked with how long the caller should wait. */
    public record Decision(boolean allowed, long retryAfterSeconds) {
        public static final Decision ALLOWED = new Decision(true, 0L);
    }

    private final StringRedisTemplate redis;
    private final boolean enabled;
    private final int ipAttempts;
    private final Duration ipWindow;
    private final int accountFailures;
    private final Duration accountWindow;
    private final Counter ipBlockedCounter;
    private final Counter accountBlockedCounter;

    public LoginRateLimiter(
            StringRedisTemplate redis,
            MeterRegistry meterRegistry,
            @Value("${app.ratelimit.login.enabled:true}") boolean enabled,
            @Value("${app.ratelimit.login.ip-attempts:20}") int ipAttempts,
            @Value("${app.ratelimit.login.ip-window-seconds:60}") long ipWindowSeconds,
            @Value("${app.ratelimit.login.account-failures:10}") int accountFailures,
            @Value("${app.ratelimit.login.account-window-seconds:900}") long accountWindowSeconds) {
        this.redis = redis;
        this.enabled = enabled;
        this.ipAttempts = ipAttempts;
        this.ipWindow = Duration.ofSeconds(ipWindowSeconds);
        this.accountFailures = accountFailures;
        this.accountWindow = Duration.ofSeconds(accountWindowSeconds);
        this.ipBlockedCounter = Counter.builder("auth.ratelimit.blocked")
                .description("Auth attempts rejected with 429 by the login rate limiter")
                .tag("scope", "ip")
                .register(meterRegistry);
        this.accountBlockedCounter = Counter.builder("auth.ratelimit.blocked")
                .description("Auth attempts rejected with 429 by the login rate limiter")
                .tag("scope", "account")
                .register(meterRegistry);
    }

    /** Counts one attempt from this address. Called before the request body is even parsed. */
    public Decision checkIp(String clientIp) {
        if (!enabled || clientIp == null || clientIp.isBlank()) {
            return Decision.ALLOWED;
        }
        return hit(IP_PREFIX + clientIp, ipAttempts, ipWindow, ipBlockedCounter);
    }

    /**
     * Reads the failure counter for an account without incrementing it — the increment
     * belongs to {@link #recordFailedAttempt}, so a correct password never consumes budget.
     */
    public Decision checkAccount(String email) {
        if (!enabled || email == null || email.isBlank()) {
            return Decision.ALLOWED;
        }
        String key = ACCOUNT_PREFIX + accountKey(email);
        try {
            String raw = redis.opsForValue().get(key);
            if (raw == null || Long.parseLong(raw) <= accountFailures) {
                return Decision.ALLOWED;
            }
            accountBlockedCounter.increment();
            return new Decision(false, ttlSeconds(key, accountWindow));
        } catch (NumberFormatException ex) {
            return Decision.ALLOWED;
        } catch (RuntimeException ex) {
            return failOpen(key, ex);
        }
    }

    public void recordFailedAttempt(String email) {
        if (!enabled || email == null || email.isBlank()) {
            return;
        }
        hit(ACCOUNT_PREFIX + accountKey(email), accountFailures, accountWindow, accountBlockedCounter);
    }

    /** Clears the failure budget after a successful sign-in. */
    public void recordSuccessfulAttempt(String email) {
        if (!enabled || email == null || email.isBlank()) {
            return;
        }
        try {
            redis.delete(ACCOUNT_PREFIX + accountKey(email));
        } catch (RuntimeException ex) {
            log.warn("Could not clear the login failure counter: {}", ex.toString());
        }
    }

    /** Fixed-window counter: INCR, and set the expiry on the increment that created the key. */
    private Decision hit(String key, int limit, Duration window, Counter blockedCounter) {
        try {
            Long count = redis.opsForValue().increment(key);
            if (count == null) {
                return Decision.ALLOWED;
            }
            if (count == 1L) {
                redis.expire(key, window);
            }
            if (count <= limit) {
                return Decision.ALLOWED;
            }
            blockedCounter.increment();
            return new Decision(false, ttlSeconds(key, window));
        } catch (RuntimeException ex) {
            return failOpen(key, ex);
        }
    }

    private long ttlSeconds(String key, Duration window) {
        Long ttl = redis.getExpire(key, TimeUnit.SECONDS);
        if (ttl == null || ttl < 0) {
            // The INCR landed but the EXPIRE after it didn't, so the key has no expiry and
            // Redis runs with maxmemory-policy noeviction — nothing would ever reclaim it and
            // the address stays blocked forever. Re-arm the window instead of leaking a ban.
            redis.expire(key, window);
            return window.toSeconds();
        }
        return ttl;
    }

    private Decision failOpen(String key, RuntimeException ex) {
        log.warn("Rate-limit check failed for {} - allowing the request: {}", key, ex.toString());
        return Decision.ALLOWED;
    }

    /**
     * Accounts are keyed by a hash of the normalized email, matching AuthService's
     * case-insensitive lookup. Hashing bounds the key size (the email arrives from an
     * untrusted body) and keeps a list of real user emails out of the Redis keyspace.
     */
    private String accountKey(String email) {
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(normalized.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash, 0, 16);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }
}
