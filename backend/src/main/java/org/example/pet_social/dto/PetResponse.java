package org.example.pet_social.dto;

import org.example.pet_social.entity.Pet;

import java.util.List;

/** Full pet profile for owner-facing screens (MeProfile, ConnectPetProfile). */
public record PetResponse(
        String id,
        Long ownerId,
        String owner,
        String name,
        String emoji,
        String species,
        String breed,
        String age,
        String gender,
        String bio,
        List<String> tags,
        boolean vaccinated,
        Double rating,
        String preferredWalkTime,
        Boolean availableForPlaydate
) {
    public static PetResponse from(Pet pet) {
        return new PetResponse(
                String.valueOf(pet.getId()),
                pet.getOwnerId(),
                pet.getOwner() != null ? pet.getOwner().getName() : "",
                pet.getName(),
                UiFormat.petEmoji(pet),
                UiFormat.speciesLabel(pet.getSpecies()),
                pet.getBreed(),
                UiFormat.age(pet.getDateOfBirth()),
                UiFormat.capitalize(pet.getGender()),
                pet.getBio(),
                UiFormat.tags(pet),
                Boolean.TRUE.equals(pet.getIsVaccinated()),
                pet.getRating(),
                pet.getPreferredWalkTime(),
                pet.getIsAvailableForPlaydate()
        );
    }
}
