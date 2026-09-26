package org.example.pet_social.dto;

import java.util.List;

/**
 * A walk whose scheduled time has passed — the mobile app's "Completed Walks"
 * list. HOST rows always appear (even with zero participants) and carry the
 * accepted-participant roster; PARTICIPANT rows are walks the caller was
 * accepted into and carry the host's info instead.
 */
public record CompletedWalkResponse(
        String id,
        String route,
        String date,
        String time,
        Integer durationMinutes,
        String role,          // HOST | PARTICIPANT
        String hostName,      // PARTICIPANT only
        String hostAvatarUrl, // PARTICIPANT only
        List<Participant> participants // HOST only
) {
    public record Participant(
            String userId,
            String name,
            String avatarUrl,
            String petName,
            String petPhotoUrl
    ) {}
}
