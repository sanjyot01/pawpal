package org.example.pet_social.dto;

/** Mirrors frontend Notification (mockData.ts) — rows on NotificationsScreen. */
public record NotificationResponse(
        String id,
        String category,
        String emoji,
        String senderName,
        String petName,
        String petEmoji,
        String time,
        String preview,
        boolean isNew,
        String categoryLabel,
        String relatedType,
        Long relatedId,
        Long senderId
) {}
