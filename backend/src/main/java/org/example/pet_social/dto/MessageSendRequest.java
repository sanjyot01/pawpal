package org.example.pet_social.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Two ways to scope the message to a thread: the legacy explicit pair
 * (contextType + contextId) or the mobile app's aliases (walkRequestId /
 * dateRequestId / marketItemId) — MessageController maps the aliases onto
 * the pair. Omit all of them for a general DM.
 */
public record MessageSendRequest(
        @NotNull(message = "receiverId is required") Long receiverId,
        @NotBlank(message = "content is required")
        @Size(max = 2000, message = "content must be at most 2000 characters")
        String content,
        @Pattern(regexp = "(?i)MATCH|LISTING|WALK_REQUEST|DATE_REQUEST",
                 message = "contextType must be MATCH, LISTING, WALK_REQUEST or DATE_REQUEST (omit for a general DM)")
        String contextType,
        Long contextId,
        Long walkRequestId,
        Long dateRequestId,
        Long marketItemId
) {}