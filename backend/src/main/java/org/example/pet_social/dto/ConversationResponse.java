package org.example.pet_social.dto;

/** Inbox row: the latest message per conversation partner. */
public record ConversationResponse(
        Long otherUserId,
        String otherUserName,
        String lastMessage,
        String time,
        boolean lastMessageMine,
        boolean unread,
        String contextType,
        Long contextId
) {}
