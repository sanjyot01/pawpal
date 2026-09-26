package org.example.pet_social.dto;

/** Mirrors frontend Invitation (mockData.ts) — backed by a WALK-type Event row. */
public record InvitationResponse(
        String id,
        String route,
        String date,
        String time,
        int spotsLeft,
        int totalSpots,
        String emoji
) {}
