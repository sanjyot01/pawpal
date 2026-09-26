package org.example.pet_social.dto;

import java.util.List;

/**
 * A blind date whose scheduled time has passed — the mobile app's "Completed
 * Dates" list. HOST rows always appear (even with zero requesters) and carry
 * the accepted-requester roster; PARTICIPANT rows are dates the caller was
 * accepted into and carry the host's info instead. Mirrors CompletedWalkResponse.
 */
public record CompletedDateResponse(
        String id,
        String location,
        String date,
        String time,
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
