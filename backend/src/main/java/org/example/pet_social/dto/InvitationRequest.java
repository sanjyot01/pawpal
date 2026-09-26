package org.example.pet_social.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

/**
 * Create/update body for a walk invitation (stored as a WALK-type Event).
 * Presence of organizerId/route/dateTime is enforced in the controller on
 * create only — the same record doubles as a partial-update body for PUT.
 */
public record InvitationRequest(
        Long organizerId,
        @Size(max = 255, message = "route must be at most 255 characters") String route,
        LocalDateTime dateTime,
        @Min(value = 1, message = "totalSpots must be between 1 and 50")
        @Max(value = 50, message = "totalSpots must be between 1 and 50")
        Integer totalSpots,
        @Size(max = 8) String emoji,
        @Size(max = 3000, message = "description must be at most 3000 characters") String description,
        Double latitude,
        Double longitude
) {}
