package org.example.pet_social.service;

import org.example.pet_social.dto.BlindDatePetResponse;
import org.example.pet_social.dto.NearbyPetResponse;
import org.example.pet_social.dto.UiFormat;
import org.example.pet_social.dto.WalkingPartnerResponse;
import org.example.pet_social.entity.Pet;
import org.example.pet_social.repository.PetRepository;
import org.springframework.data.geo.Circle;
import org.springframework.data.geo.Distance;
import org.springframework.data.geo.GeoResult;
import org.springframework.data.geo.GeoResults;
import org.springframework.data.geo.Metrics;
import org.springframework.data.geo.Point;
import org.springframework.data.redis.connection.RedisGeoCommands;
import org.springframework.data.redis.core.GeoOperations;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Read-side queries that power the mobile app's discovery screens.
 * Locations live in Redis (users:geo, written by the telemetry pipeline);
 * pet/owner profiles live in Postgres. This service joins the two and
 * returns DTOs shaped exactly like the frontend interfaces.
 *
 * Discovery is driven from the geo index, not the pet table: Redis answers "who is inside
 * the radius" in one GEOSEARCH, and only those owners are then read from Postgres. The
 * feeds used to do the reverse — load every playdate-available pet in the database and ask
 * Redis for each owner's position one at a time — which was both a per-pet round trip and
 * the reason a partner on another continent showed up on a screen labelled "nearby".
 */
@Service
public class PetQueryService {

    private static final String GEO_KEY = "users:geo";
    private static final String PRESENCE_PREFIX = "users:presence:";

    private final PetRepository petRepository;
    private final StringRedisTemplate redis;
    private final GeoOperations<String, String> geoOps;
    private final double defaultRadiusKm;
    private final double maxRadiusKm;
    private final int maxResults;

    public PetQueryService(PetRepository petRepository, StringRedisTemplate redis,
                           @Value("${app.discovery.default-radius-km:25}") double defaultRadiusKm,
                           @Value("${app.discovery.max-radius-km:100}") double maxRadiusKm,
                           @Value("${app.discovery.max-results:100}") int maxResults) {
        this.petRepository = petRepository;
        this.redis = redis;
        this.geoOps = redis.opsForGeo();
        this.defaultRadiusKm = defaultRadiusKm;
        this.maxRadiusKm = maxRadiusKm;
        this.maxResults = maxResults;
    }

    /** Pets around a map viewport — one pin per pet of each user found in the geo index. */
    public List<NearbyPetResponse> findNearbyPets(double latitude, double longitude, double radiusKm, int limit) {
        int effectiveLimit = limit <= 0 ? maxResults : Math.min(limit, maxResults);
        Circle circle = new Circle(new Point(longitude, latitude), new Distance(clampRadius(radiusKm), Metrics.KILOMETERS));
        RedisGeoCommands.GeoRadiusCommandArgs args = RedisGeoCommands.GeoRadiusCommandArgs
                .newGeoRadiusArgs().includeCoordinates().sortAscending().limit(effectiveLimit);

        GeoResults<RedisGeoCommands.GeoLocation<String>> results = geoOps.radius(GEO_KEY, circle, args);
        if (results == null) {
            return List.of();
        }

        // Collect the positions first, then read every owner's pets in one query — the pin
        // list used to issue a separate SELECT per user inside the loop.
        Map<Long, Point> positionByOwner = new HashMap<>();
        for (GeoResult<RedisGeoCommands.GeoLocation<String>> result : results) {
            Long userId = parseLong(result.getContent().getName());
            Point point = result.getContent().getPoint();
            if (userId != null && point != null) {
                positionByOwner.put(userId, point);
            }
        }
        if (positionByOwner.isEmpty()) {
            return List.of();
        }

        List<NearbyPetResponse> out = new ArrayList<>();
        for (Pet pet : petRepository.findWithOwnerByOwnerIdIn(List.copyOf(positionByOwner.keySet()))) {
            Point point = positionByOwner.get(pet.getOwnerId());
            if (point == null) {
                continue;
            }
            out.add(new NearbyPetResponse(
                    String.valueOf(pet.getId()),
                    pet.getName(),
                    UiFormat.petEmoji(pet),
                    pet.getBreed(),
                    point.getY(),   // Redis points are (lon, lat)
                    point.getX(),
                    pet.getOwner().getName()
            ));
        }
        return out;
    }

    /** Walking-partner cards: playdate-available pets of other active users, nearest first. */
    public List<WalkingPartnerResponse> findWalkingPartners(Long requestingUserId, Double latitude, Double longitude,
                                                            String species, Double radiusKm) {
        List<WalkingPartnerResponse> out = new ArrayList<>();
        for (Candidate candidate : candidates(requestingUserId, latitude, longitude, species, radiusKm)) {
            Pet pet = candidate.pet();
            out.add(new WalkingPartnerResponse(
                    String.valueOf(pet.getId()),
                    pet.getName(),
                    UiFormat.petEmoji(pet),
                    pet.getBreed(),
                    UiFormat.age(pet.getDateOfBirth()),
                    UiFormat.distanceKm(candidate.distanceKm()),
                    pet.getPreferredWalkTime() == null ? "" : pet.getPreferredWalkTime(),
                    UiFormat.tags(pet),
                    pet.getRating() == null ? 0.0 : pet.getRating(),
                    UiFormat.speciesLabel(pet.getSpecies()),
                    pet.getOwner().getName(),
                    isOwnerOnline(pet.getOwnerId())
            ));
        }
        return out;
    }

    /** Blind-date swipe deck: same candidate pool, different card shape. */
    public List<BlindDatePetResponse> findBlindDatePets(Long requestingUserId, Double latitude, Double longitude,
                                                        String species, Double radiusKm) {
        List<BlindDatePetResponse> out = new ArrayList<>();
        for (Candidate candidate : candidates(requestingUserId, latitude, longitude, species, radiusKm)) {
            Pet pet = candidate.pet();
            out.add(new BlindDatePetResponse(
                    String.valueOf(pet.getId()),
                    pet.getName(),
                    UiFormat.petEmoji(pet),
                    pet.getBreed(),
                    UiFormat.age(pet.getDateOfBirth()),
                    UiFormat.capitalize(pet.getGender()),
                    UiFormat.distanceKm(candidate.distanceKm()),
                    UiFormat.tags(pet),
                    UiFormat.speciesLabel(pet.getSpecies()),
                    Boolean.TRUE.equals(pet.getIsVaccinated())
            ));
        }
        return out;
    }

    /** A pet offered to the requester, with how far away its owner is (null when unknown). */
    private record Candidate(Pet pet, Double distanceKm) {}

    /**
     * The shared candidate pool for both discovery feeds, bounded by distance and sorted
     * nearest-first. Without a caller position there is nothing to measure against, so the
     * feed falls back to an unranked page of the pool rather than pretending to sort it.
     */
    private List<Candidate> candidates(Long requestingUserId, Double latitude, Double longitude,
                                       String species, Double radiusKm) {
        long exclude = requestingUserId == null ? -1L : requestingUserId;

        if (latitude == null || longitude == null) {
            return filterBySpecies(petRepository.findPlaydateCandidates(exclude), species).stream()
                    .limit(maxResults)
                    .map(pet -> new Candidate(pet, null))
                    .toList();
        }

        Map<Long, Double> distanceByOwner = ownersWithinRadius(latitude, longitude, radiusKm, exclude);
        if (distanceByOwner.isEmpty()) {
            return List.of();
        }

        List<Pet> pets = petRepository.findPlaydateCandidatesForOwners(exclude, List.copyOf(distanceByOwner.keySet()));
        return filterBySpecies(pets, species).stream()
                .map(pet -> new Candidate(pet, distanceByOwner.get(pet.getOwnerId())))
                .sorted(Comparator.comparingDouble(c -> c.distanceKm() == null ? Double.MAX_VALUE : c.distanceKm()))
                .limit(maxResults)
                .toList();
    }

    /**
     * One GEOSEARCH answers both "who is close enough" and "how far", so the feed no longer
     * pays a Redis round trip per pet. The radius is clamped: a client asking for 20000 km
     * would otherwise turn the bound back into the whole index.
     */
    private Map<Long, Double> ownersWithinRadius(double latitude, double longitude, Double radiusKm, long excludeOwnerId) {
        double effectiveRadiusKm = clampRadius(radiusKm);
        Circle circle = new Circle(new Point(longitude, latitude), new Distance(effectiveRadiusKm, Metrics.KILOMETERS));
        RedisGeoCommands.GeoRadiusCommandArgs args = RedisGeoCommands.GeoRadiusCommandArgs
                .newGeoRadiusArgs().includeDistance().sortAscending().limit(maxResults);

        GeoResults<RedisGeoCommands.GeoLocation<String>> results = geoOps.radius(GEO_KEY, circle, args);
        if (results == null) {
            return Map.of();
        }

        Map<Long, Double> distanceByOwner = new HashMap<>();
        for (GeoResult<RedisGeoCommands.GeoLocation<String>> result : results) {
            Long ownerId = parseLong(result.getContent().getName());
            if (ownerId == null || ownerId == excludeOwnerId) {
                continue;
            }
            distanceByOwner.put(ownerId, result.getDistance() == null ? null : result.getDistance().getValue());
        }
        return distanceByOwner;
    }

    private double clampRadius(Double radiusKm) {
        if (radiusKm == null || radiusKm <= 0) {
            return defaultRadiusKm;
        }
        return Math.min(radiusKm, maxRadiusKm);
    }

    private List<Pet> filterBySpecies(List<Pet> pets, String species) {
        if (species == null || species.isBlank() || "ALL".equalsIgnoreCase(species)) {
            return pets;
        }
        String wanted = species.toUpperCase(Locale.ROOT);
        return pets.stream().filter(p -> wanted.equalsIgnoreCase(p.getSpecies())).toList();
    }

    /** Online means "pinged recently" — the presence key expires when telemetry stops.
     *  The profile's `active` flag is a durable setting and never expires, so it can't
     *  answer this question. */
    private boolean isOwnerOnline(Long ownerId) {
        if (ownerId == null) {
            return false;
        }
        return Boolean.TRUE.equals(redis.hasKey(PRESENCE_PREFIX + ownerId));
    }

    private Long parseLong(String value) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
