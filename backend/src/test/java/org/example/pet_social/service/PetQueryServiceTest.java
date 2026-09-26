package org.example.pet_social.service;

import org.example.pet_social.dto.WalkingPartnerResponse;
import org.example.pet_social.entity.Pet;
import org.example.pet_social.entity.User;
import org.example.pet_social.repository.PetRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.geo.Circle;
import org.springframework.data.geo.Distance;
import org.springframework.data.geo.GeoResult;
import org.springframework.data.geo.GeoResults;
import org.springframework.data.geo.Metrics;
import org.springframework.data.geo.Point;
import org.springframework.data.redis.connection.RedisGeoCommands;
import org.springframework.data.redis.core.GeoOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class PetQueryServiceTest {

    private PetRepository petRepository;
    private StringRedisTemplate redis;
    private GeoOperations<String, String> geoOps;
    private PetQueryService petQueryService;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        petRepository = mock(PetRepository.class);
        redis = mock(StringRedisTemplate.class);
        geoOps = mock(GeoOperations.class);
        when(redis.opsForGeo()).thenReturn(geoOps);
        // default 25 km, max 100 km, 100 results
        petQueryService = new PetQueryService(petRepository, redis, 25.0, 100.0, 100);
    }

    @Test
    void onlyOffersOwnersInsideTheRadius() {
        geoReturns(ownerAt(2L, 1.4), ownerAt(3L, 8.1));
        when(petRepository.findPlaydateCandidatesForOwners(anyLong(), any()))
                .thenReturn(List.of(pet(2L, "Miso"), pet(3L, "Otto")));

        List<WalkingPartnerResponse> partners =
                petQueryService.findWalkingPartners(1L, 43.65, -79.38, null, 10.0);

        assertEquals(2, partners.size());
        // The DB is asked only about owners Redis placed in range, never the whole table —
        // the unbounded query is what let a partner on another continent onto this screen.
        verify(petRepository, never()).findPlaydateCandidates(anyLong());
        ArgumentCaptor<List<Long>> ownerIds = ArgumentCaptor.forClass(List.class);
        verify(petRepository).findPlaydateCandidatesForOwners(eq(1L), ownerIds.capture());
        assertEquals(List.of(2L, 3L), ownerIds.getValue().stream().sorted().toList());
    }

    @Test
    void ordersResultsNearestFirst() {
        geoReturns(ownerAt(2L, 9.0), ownerAt(3L, 0.4));
        // Deliberately returned in the far-then-near order the DB happens to produce
        when(petRepository.findPlaydateCandidatesForOwners(anyLong(), any()))
                .thenReturn(List.of(pet(2L, "FarAway"), pet(3L, "NextDoor")));

        List<WalkingPartnerResponse> partners =
                petQueryService.findWalkingPartners(1L, 43.65, -79.38, null, 25.0);

        assertEquals("NextDoor", partners.get(0).name());
        assertEquals("FarAway", partners.get(1).name());
    }

    @Test
    void clampsAnOversizedRadiusToTheConfiguredMaximum() {
        geoReturns();

        petQueryService.findWalkingPartners(1L, 43.65, -79.38, null, 20000.0);

        assertEquals(100.0, capturedRadiusKm(), 0.0001,
                "a client asking for the whole planet must not turn the bound back off");
    }

    @Test
    void usesTheDefaultRadiusWhenTheClientSendsNone() {
        geoReturns();

        petQueryService.findWalkingPartners(1L, 43.65, -79.38, null, null);

        assertEquals(25.0, capturedRadiusKm(), 0.0001);
    }

    @Test
    void excludesTheRequesterFromTheirOwnFeed() {
        geoReturns(ownerAt(1L, 0.0), ownerAt(2L, 3.0));
        when(petRepository.findPlaydateCandidatesForOwners(anyLong(), any()))
                .thenReturn(List.of(pet(2L, "Miso")));

        petQueryService.findWalkingPartners(1L, 43.65, -79.38, null, 25.0);

        ArgumentCaptor<List<Long>> ownerIds = ArgumentCaptor.forClass(List.class);
        verify(petRepository).findPlaydateCandidatesForOwners(eq(1L), ownerIds.capture());
        assertFalse(ownerIds.getValue().contains(1L), "the requester is not their own walking partner");
    }

    @Test
    void skipsTheDatabaseEntirelyWhenNobodyIsInRange() {
        geoReturns();

        assertTrue(petQueryService.findWalkingPartners(1L, 43.65, -79.38, null, 25.0).isEmpty());
        verify(petRepository, never()).findPlaydateCandidatesForOwners(anyLong(), any());
    }

    @Test
    void fallsBackToAnUnrankedPageWhenTheCallerSendsNoLocation() {
        when(petRepository.findPlaydateCandidates(anyLong())).thenReturn(List.of(pet(2L, "Miso")));

        List<WalkingPartnerResponse> partners =
                petQueryService.findWalkingPartners(1L, null, null, null, null);

        assertEquals(1, partners.size());
        // Nothing to measure against, so no geo query is issued at all
        verify(geoOps, never()).radius(anyString(), any(Circle.class), any());
    }

    private double capturedRadiusKm() {
        ArgumentCaptor<Circle> circle = ArgumentCaptor.forClass(Circle.class);
        verify(geoOps).radius(anyString(), circle.capture(), any(RedisGeoCommands.GeoRadiusCommandArgs.class));
        Distance distance = circle.getValue().getRadius();
        return distance.getMetric() == Metrics.KILOMETERS ? distance.getValue() : distance.in(Metrics.KILOMETERS).getValue();
    }

    private GeoResult<RedisGeoCommands.GeoLocation<String>> ownerAt(long ownerId, double distanceKm) {
        return new GeoResult<>(
                new RedisGeoCommands.GeoLocation<>(String.valueOf(ownerId), new Point(-79.38, 43.65)),
                new Distance(distanceKm, Metrics.KILOMETERS));
    }

    @SafeVarargs
    private void geoReturns(GeoResult<RedisGeoCommands.GeoLocation<String>>... results) {
        when(geoOps.radius(anyString(), any(Circle.class), any(RedisGeoCommands.GeoRadiusCommandArgs.class)))
                .thenReturn(new GeoResults<>(new ArrayList<>(List.of(results))));
    }

    private Pet pet(long ownerId, String name) {
        User owner = new User("Owner " + ownerId, "owner" + ownerId + "@example.com", "PET_OWNER", true);
        ReflectionTestUtils.setField(owner, "id", ownerId);
        Pet pet = new Pet(owner, name, "DOG", "Shiba Inu");
        pet.setIsAvailableForPlaydate(true);
        return pet;
    }
}
