package org.example.pet_social.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

/** "Connect" / "Send Match Request" body: walk or blind-date request between two pets. */
public record MatchCreateRequest(
        @NotNull(message = "requesterPetId is required") Long requesterPetId,
        @NotNull(message = "targetPetId is required") Long targetPetId,
        @Pattern(regexp = "(?i)WALK|BLIND_DATE|PLAYDATE|FRIENDSHIP",
                 message = "matchType must be one of: WALK, BLIND_DATE, PLAYDATE, FRIENDSHIP")
        String matchType,
        @Size(max = 1000, message = "notes must be at most 1000 characters") String notes,
        LocalDateTime meetingDate
) {}
