package org.example.pet_social.dto;

import org.example.pet_social.entity.Message;
import org.example.pet_social.entity.User;

/**
 * One chat bubble. Superset of both client shapes: the legacy frontend1 reads
 * `mine`/`time`, the mobile app's ChatMessage reads `isOwn`/`createdAt`/
 * `senderName`/`senderAvatarUrl`. Both orientations are relative to the
 * requesting (authenticated) user.
 */
public record MessageResponse(
        String id,
        Long senderId,
        Long receiverId,
        boolean mine,
        boolean isOwn,
        String content,
        String contextType,
        Long contextId,
        boolean read,
        String time,
        String createdAt,
        String senderName,
        String senderAvatarUrl
) {
    public static MessageResponse from(Message m, Long viewerUserId) {
        boolean own = m.getSenderId().equals(viewerUserId);
        User sender = m.getSender();
        return new MessageResponse(
                String.valueOf(m.getId()),
                m.getSenderId(),
                m.getReceiverId(),
                own,
                own,
                m.getContent(),
                m.getContextType() == null ? null : m.getContextType().toLowerCase(),
                m.getContextId(),
                Boolean.TRUE.equals(m.getIsRead()),
                UiFormat.relativeTime(m.getCreatedAt()),
                m.getCreatedAt() == null ? null : m.getCreatedAt().toString(),
                sender == null ? null : sender.getName(),
                sender == null ? null : sender.getAvatarUrl()
        );
    }
}
