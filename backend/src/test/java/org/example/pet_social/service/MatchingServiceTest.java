package org.example.pet_social.service;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.geo.Circle;
import org.springframework.data.geo.Distance;
import org.springframework.data.geo.GeoResult;
import org.springframework.data.geo.GeoResults;
import org.springframework.data.geo.Metrics;
import org.springframework.data.geo.Point;
import org.springframework.data.redis.connection.RedisGeoCommands;
import org.springframework.data.redis.core.GeoOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class MatchingServiceTest {

    private StringRedisTemplate redis;
    private GeoOperations<String, String> geoOps;
    private MatchingService matchingService;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        redis = mock(StringRedisTemplate.class);
        geoOps = mock(GeoOperations.class);
        when(redis.opsForGeo()).thenReturn(geoOps);
        matchingService = new MatchingService(redis, mock(DashboardService.class), new SimpleMeterRegistry(), true);
    }

    @Test
    void doesNotMatchTheRequesterWithThemselves() {
        // The requester is always the nearest member to their own coordinates, so they lead
        // every result set — this is the case that made a single account match itself.
        geoReturns("42", "77");
        pipelineReturnsAvailableCandidates(1);

        Optional<Long> match = matchingService.findNearestMatch(42L, 43.65, -79.38, 0L);

        assertEquals(Optional.of(77L), match);
    }

    @Test
    void returnsNoMatchWhenTheRequesterIsTheOnlyOneInRange() {
        geoReturns("42");

        Optional<Long> match = matchingService.findNearestMatch(42L, 43.65, -79.38, 0L);

        assertTrue(match.isEmpty());
        // Nothing left to look up once the caller is dropped, so no metadata round trip
        verify(redis, never()).executePipelined(any(org.springframework.data.redis.core.RedisCallback.class));
    }

    @Test
    void stillMatchesOthersWhenTheRequesterIsUnknown() {
        geoReturns("77");
        pipelineReturnsAvailableCandidates(1);

        assertEquals(Optional.of(77L), matchingService.findNearestMatch(null, 43.65, -79.38, 0L));
    }

    @Test
    void skipsCandidatesMissingARequiredPreferenceBit() {
        geoReturns("42", "77");
        // preferences = 1, so a request for bit 2 must not be satisfied by this candidate
        pipelineReturnsAvailableCandidates(1);

        assertTrue(matchingService.findNearestMatch(42L, 43.65, -79.38, 2L).isEmpty());
    }

    /** Makes the geo search return these member ids, nearest-first, at every radius. */
    private void geoReturns(String... memberIds) {
        List<GeoResult<RedisGeoCommands.GeoLocation<String>>> content = new ArrayList<>();
        double distanceKm = 0.5;
        for (String memberId : memberIds) {
            // GeoResult rejects a null distance; matching ignores the value, only the order.
            content.add(new GeoResult<>(
                    new RedisGeoCommands.GeoLocation<>(memberId, new Point(-79.38, 43.65)),
                    new Distance(distanceKm, Metrics.KILOMETERS)));
            distanceKm += 0.5;
        }
        when(geoOps.radius(anyString(), any(Circle.class), any(RedisGeoCommands.GeoRadiusCommandArgs.class)))
                .thenReturn(new GeoResults<>(content));
    }

    /**
     * The pipeline returns two replies per candidate in candidate order: the metadata hash,
     * then the presence probe. Candidates here are active, present, and hold preference bit 1.
     */
    @SuppressWarnings("unchecked")
    private void pipelineReturnsAvailableCandidates(int candidateCount) {
        List<Object> replies = new ArrayList<>();
        for (int i = 0; i < candidateCount; i++) {
            replies.add(Map.of("active", "true", "preferences", "1"));
            replies.add(Boolean.TRUE);
        }
        when(redis.executePipelined(any(org.springframework.data.redis.core.RedisCallback.class))).thenReturn(replies);
    }
}
