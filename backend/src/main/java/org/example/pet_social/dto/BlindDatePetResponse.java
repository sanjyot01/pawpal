package org.example.pet_social.dto;

import java.util.List;

/** Mirrors frontend BlindDatePet (mockData.ts) — swipe cards on PetBlindDateScreen. */
public record BlindDatePetResponse(
        String id,
        String name,
        String emoji,
        String breed,
        String age,
        String gender,
        String distance,
        List<String> tags,
        String species,
        boolean vaccinated
) {}
