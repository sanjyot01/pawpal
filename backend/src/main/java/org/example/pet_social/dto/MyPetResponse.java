package org.example.pet_social.dto;

import org.example.pet_social.entity.Pet;

/**
 * Pet shape the mobile app's Me tab / Add-Edit Pet screens code against
 * (raw enum values + photo URL, unlike the legacy display-formatted PetResponse).
 */
public record MyPetResponse(
        String id,
        String name,
        String species,
        String breed,
        String gender,
        String bio,
        String profilePhotoUrl,
        Boolean isVaccinated,
        Boolean isNeutered,
        String dateOfBirth
) {
    public static MyPetResponse from(Pet p) {
        return new MyPetResponse(
                String.valueOf(p.getId()),
                p.getName(),
                p.getSpecies(),
                p.getBreed(),
                p.getGender(),
                p.getBio(),
                p.getProfilePhotoUrl(),
                p.getIsVaccinated(),
                p.getIsNeutered(),
                p.getDateOfBirth() == null ? null : p.getDateOfBirth().toString()
        );
    }
}