package org.example.pet_social.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

/**
 * Serves both clients: the legacy frontend1 sends ownerId in the body
 * (vaccinated/neutered names), the mobile app sends no ownerId (identity
 * comes from the Bearer token) and uses isVaccinated/isNeutered/profilePhotoUrl.
 */
public record PetCreateRequest(
        Long ownerId, // legacy only; ignored when a valid token is present
        @NotBlank(message = "name is required") String name,
        @Pattern(regexp = "(?i)DOG|CAT|BIRD|RABBIT|OTHER",
                 message = "species must be one of: DOG, CAT, BIRD, RABBIT, OTHER")
        String species,
        String breed,
        @Pattern(regexp = "(?i)MALE|FEMALE|UNKNOWN", message = "gender must be MALE, FEMALE or UNKNOWN")
        String gender,
        LocalDate dateOfBirth,
        @Size(max = 1000, message = "bio must be at most 1000 characters") String bio,
        @Size(max = 8) String avatarEmoji,
        List<String> personalityTags,
        @JsonAlias("isVaccinated") Boolean vaccinated,
        @JsonAlias("isNeutered") Boolean neutered,
        String profilePhotoUrl,
        Boolean availableForPlaydate,
        String preferredWalkTime
) {}