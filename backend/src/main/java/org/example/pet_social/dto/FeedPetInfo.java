package org.example.pet_social.dto;

/** One pet on a walk-feed card (the app's WalkFeedItem.pets[] entry). */
public record FeedPetInfo(
        String petId,
        String petName,
        String petSpecies,
        String petBreed,
        String petGender,
        String petAge,
        String petProfilePhotoUrl,
        Boolean petIsVaccinated,
        Boolean petIsNeutered
) {}