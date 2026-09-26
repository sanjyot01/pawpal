package org.example.pet_social.dto;

import java.util.List;

/**
 * Caller-agnostic slice of a walk/date feed card, cached in Redis as JSON
 * (feed:board:{WALK|DATE}, short TTL). Per-caller fields — distance, my
 * request status, unread counts — are layered on top per request in
 * PartnerBoardService, so one cached list serves every user.
 */
public record FeedCard(
        long id,
        long hostId,
        String hostName,
        String hostAvatarUrl,
        String place,
        String date,
        String time,
        String message,
        Integer durationMinutes,
        Integer maxSpots,
        int spotsLeft,
        Double latitude,
        Double longitude,
        List<FeedPetInfo> pets,
        List<String> imageUrls,
        Double endLatitude,
        Double endLongitude
) {}