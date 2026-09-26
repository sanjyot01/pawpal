package org.example.pet_social.dto;

/**
 * One row of the walk/date notifications feed — 1:1 with the app's
 * WalkNotification interface. Used for both received (host view: requester*
 * fields set) and sent (requester view: host* fields set) directions.
 */
public record PartnerNotificationResponse(
        String id,
        String type,        // walk_request | date_request
        String direction,   // received | sent
        String status,      // PENDING | ACCEPTED | REJECTED | BLOCKED
        String createdAt,   // ISO local datetime
        String message,
        String invitationId,
        String invitationRoute,
        String invitationLocation,
        String invitationDate,
        String invitationTime,
        Integer invitationDurationMinutes,
        // Received (host view): requester info
        String requesterUserId,
        String requesterName,
        String requesterAvatarUrl,
        String requesterPetName,
        String requesterPetSpecies,
        String requesterPetBreed,
        String requesterPetAge,
        String requesterPetPhotoUrl,
        Boolean requesterPetIsVaccinated,
        Boolean requesterPetIsNeutered,
        // Sent (requester view): host/poster info
        String hostUserId,
        String hostName,
        String hostAvatarUrl,
        String hostPetName,
        String hostPetSpecies,
        String hostPetBreed,
        String hostPetPhotoUrl,
        Integer unreadMessageCount
) {}