package org.example.pet_social.service;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class LoginRateLimiterTest {

    private StringRedisTemplate redis;
    private ValueOperations<String, String> valueOps;
    private LoginRateLimiter limiter;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        redis = mock(StringRedisTemplate.class);
        valueOps = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(valueOps);
        // 3 attempts / 60s per IP, 2 failures / 900s per account — small numbers so the
        // boundary is easy to state.
        limiter = new LoginRateLimiter(redis, new SimpleMeterRegistry(), true, 3, 60, 2, 900);
    }

    @Test
    void allowsAttemptsUpToTheLimitThenBlocks() {
        when(valueOps.increment(anyString())).thenReturn(1L, 2L, 3L, 4L);
        when(redis.getExpire(anyString(), eq(TimeUnit.SECONDS))).thenReturn(37L);

        assertTrue(limiter.checkIp("203.0.113.7").allowed());
        assertTrue(limiter.checkIp("203.0.113.7").allowed());
        assertTrue(limiter.checkIp("203.0.113.7").allowed(), "the third attempt is still within a limit of 3");

        LoginRateLimiter.Decision blocked = limiter.checkIp("203.0.113.7");
        assertFalse(blocked.allowed());
        assertEquals(37L, blocked.retryAfterSeconds(), "the caller is told the real remaining window");
    }

    @Test
    void setsTheWindowOnlyOnTheIncrementThatCreatedTheKey() {
        when(valueOps.increment(anyString())).thenReturn(1L, 2L);

        limiter.checkIp("198.51.100.4");
        limiter.checkIp("198.51.100.4");

        // A second EXPIRE would slide the window forward on every attempt, so a steady
        // stream of requests would keep resetting its own limit.
        verify(redis, times(1)).expire("ratelimit:login:ip:198.51.100.4", Duration.ofSeconds(60));
    }

    @Test
    void reArmsTheWindowWhenTheKeyLostItsExpiry() {
        when(valueOps.increment(anyString())).thenReturn(9L);
        when(redis.getExpire(anyString(), eq(TimeUnit.SECONDS))).thenReturn(-1L);

        LoginRateLimiter.Decision decision = limiter.checkIp("192.0.2.9");

        assertFalse(decision.allowed());
        assertEquals(60L, decision.retryAfterSeconds());
        // Redis runs with maxmemory-policy noeviction: a key with no TTL is a permanent ban.
        verify(redis).expire("ratelimit:login:ip:192.0.2.9", Duration.ofSeconds(60));
    }

    @Test
    void failsOpenWhenRedisIsUnreachable() {
        when(valueOps.increment(anyString())).thenThrow(new QueryTimeoutException("redis down"));

        assertTrue(limiter.checkIp("203.0.113.7").allowed(),
                "a broken cache must not lock the whole user base out of a healthy app");
    }

    @Test
    void accountCheckReadsTheCounterWithoutSpendingIt() {
        when(valueOps.get(anyString())).thenReturn("1");

        assertTrue(limiter.checkAccount("someone@example.com").allowed());

        // Only recordFailedAttempt() may increment — otherwise a correct password on the
        // first try would still consume the account's budget.
        verify(valueOps, never()).increment(anyString());
    }

    @Test
    void accountIsBlockedOnceFailuresExceedTheBudget() {
        when(valueOps.get(anyString())).thenReturn("3");
        when(redis.getExpire(anyString(), eq(TimeUnit.SECONDS))).thenReturn(400L);

        LoginRateLimiter.Decision decision = limiter.checkAccount("victim@example.com");

        assertFalse(decision.allowed());
        assertEquals(400L, decision.retryAfterSeconds());
    }

    @Test
    void accountKeysAreHashedAndCaseInsensitive() {
        when(valueOps.get(anyString())).thenReturn(null);

        limiter.checkAccount("  Mixed.Case@Example.COM ");
        limiter.checkAccount("mixed.case@example.com");

        // Same account either way, and the raw address never becomes a Redis key
        verify(valueOps, times(2)).get("ratelimit:login:account:7a126a993c9ece5663288f1e48a453a6");
    }

    @Test
    void successClearsTheFailureCounter() {
        limiter.recordSuccessfulAttempt("user@example.com");

        verify(redis).delete(anyString());
    }

    @Test
    void disabledLimiterNeverTouchesRedis() {
        LoginRateLimiter off = new LoginRateLimiter(redis, new SimpleMeterRegistry(), false, 3, 60, 2, 900);

        assertTrue(off.checkIp("203.0.113.7").allowed());
        assertTrue(off.checkAccount("user@example.com").allowed());
        off.recordFailedAttempt("user@example.com");

        verify(valueOps, never()).increment(anyString());
        verify(valueOps, never()).get(anyString());
    }

    @Test
    void blankIdentifiersAreAllowedRatherThanSharingOneBucket() {
        // An empty key would put every anonymous caller into a single counter and lock
        // them all out together.
        assertTrue(limiter.checkIp("").allowed());
        assertTrue(limiter.checkIp(null).allowed());
        assertTrue(limiter.checkAccount(null).allowed());

        verify(valueOps, never()).increment(any());
    }
}
