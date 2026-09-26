package org.example.pet_social.dto;

import java.util.List;

/** Mirrors frontend WalkingPartner (mockData.ts) — cards on FindPartnersScreen. */
public record WalkingPartnerResponse(
        String id,
        String name,
        String emoji,
        String breed,
        String age,
        String distance,
        String time,
        List<String> tags,
        double rating,
        String type,
        String owner,
        boolean online
) {}
