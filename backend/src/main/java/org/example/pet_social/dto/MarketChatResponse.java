package org.example.pet_social.dto;

/** One row of the marketplace chats inbox — 1:1 with the app's MarketChat interface. */
public record MarketChatResponse(
        String itemId,
        String otherUserId,
        String otherUserName,
        String otherUserAvatarUrl,
        String itemName,
        String itemPhotoUrl,
        Double itemPrice,
        String itemStatus,
        Boolean isSeller,
        String lastMessage,
        String lastMessageAt,
        Boolean lastMessageIsOwn,
        Integer unreadCount
) {}