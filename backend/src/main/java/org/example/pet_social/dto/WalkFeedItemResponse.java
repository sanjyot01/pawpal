package org.example.pet_social.dto;

import java.util.List;

/**
 * Walk board feed card — 1:1 with the app's WalkFeedItem interface (plus
 * latitude/longitude, which HomeMapScreen uses for map pins). The flat pet*
 * fields duplicate the first entry of pets[] for older card layouts.
 */
public record WalkFeedItemResponse(
        String id,
        String route,
        String date,
        String time,
        Integer durationMinutes,
        Integer maxSpots,
        Integer spotsLeft,
        String message,
        String ownerId,
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
        List<FeedPetInfo> pets,
        Double latitude,
        Double longitude,
        Double endLatitude,
        Double endLongitude
) {}