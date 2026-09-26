package org.example.pet_social.dto;

/** Mirrors frontend NearbyPet (mockData.ts) — pins on HomeMapScreen. */
public record NearbyPetResponse(
        String id,
        String name,
        String emoji,
        String breed,
        double latitude,
        double longitude,
        String owner
) {}
