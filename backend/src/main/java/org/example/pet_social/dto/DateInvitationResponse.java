package org.example.pet_social.dto;

import java.util.List;

/** "My Date Invitations" card — 1:1 with the app's DateInvitation interface. */
public record DateInvitationResponse(
        String id,
        String hostUserId,
        String hostPetId,
        String location,
        String date,
        String time,
        String message,
        String status,
        Integer pendingRequestCount,
        String petName,
        String petSpecies,
        String petBreed,
        String petProfilePhotoUrl,
        String petAge,
        List<String> imageUrls
) {}