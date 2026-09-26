package org.example.pet_social.dto;

import java.util.List;

/** "My Invitations" card — 1:1 with the app's WalkInvitation interface. */
public record WalkInvitationResponse(
        String id,
        String route,
        String date,
        String time,
        Integer durationMinutes,
        Integer maxSpots,
        Integer spotsLeft,
        String message,
        String status,
        List<String> hostPetIds,
        Integer pendingRequestCount,
        Double latitude,
        Double longitude,
        Double endLatitude,
        Double endLongitude
) {}