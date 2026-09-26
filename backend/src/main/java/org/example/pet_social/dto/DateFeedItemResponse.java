package org.example.pet_social.dto;

import java.util.List;

/** Blind-date board feed card — 1:1 with the app's DateFeedItem interface. */
public record DateFeedItemResponse(
        String id,
        String hostUserId,
        String location,
        String date,
        String time,
        String message,
        String ownerName,
        String ownerAvatarUrl,
        String petId,
        String petName,
        String petSpecies,
        String petBreed,
        String petGender,
        String petAge,
        String petProfilePhotoUrl,
        Boolean petIsVaccinated,
        Boolean petIsNeutered,
        Double distanceKm,
        String distanceLabel,
        String myRequestId,
        String myRequestStatus,
        Integer unreadMessageCount,
        Double latitude,
        Double longitude,
        List<String> imageUrls
) {}