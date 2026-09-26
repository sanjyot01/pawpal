package org.example.pet_social.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record NotificationCreateRequest(
        @NotNull(message = "recipientId is required") Long recipientId,
        Long senderId,
        @NotBlank(message = "category is required")
        @Pattern(regexp = "(?i)BLIND_DATE|WALK_REQUEST|MESSAGE|LIKE|INVITATION|MATCH|REVIEW|MARKETPLACE",
                 message = "category must be one of: BLIND_DATE, WALK_REQUEST, MESSAGE, LIKE, INVITATION, MATCH, REVIEW, MARKETPLACE")
        String category,
        String petName,
        String petEmoji,
        @NotBlank(message = "preview is required") @Size(max = 500) String preview,
        @Pattern(regexp = "(?i)MATCH|EVENT|MESSAGE|PET|LISTING",
                 message = "relatedType must be one of: MATCH, EVENT, MESSAGE, PET, LISTING")
        String relatedType,
        Long relatedId
) {}
