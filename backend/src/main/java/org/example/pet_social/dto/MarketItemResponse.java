package org.example.pet_social.dto;

import org.example.pet_social.entity.MarketplaceItem;
import org.example.pet_social.entity.User;

import java.util.List;

/**
 * Marketplace item as the mobile app's MarketItem interface expects it: raw
 * enum values (TOY, LIKE_NEW, ACTIVE) — unlike the legacy display-formatted
 * MarketplaceItemResponse, which capitalizes them for frontend1.
 */
public record MarketItemResponse(
        String id,
        String sellerUserId,
        String name,
        String description,
        String category,
        Double price,
        Double originalPrice,
        String condition,
        String photoUrl,
        String location,
        String status,
        String sellerName,
        String sellerAvatarUrl,
        Integer unreadMessageCount,
        List<String> imageUrls,
        String createdAt
) {
    public static MarketItemResponse from(MarketplaceItem item, int unreadMessageCount) {
        User seller = item.getSeller();
        return new MarketItemResponse(
                String.valueOf(item.getId()),
                String.valueOf(item.getSellerId()),
                item.getName(),
                item.getDescription(),
                item.getCategory(),
                item.getPrice(),
                item.getOriginalPrice(),
                item.getCondition(),
                item.getPhotoUrl(),
                item.getLocation(),
                item.getStatus(),
                seller == null ? null : seller.getName(),
                seller == null ? null : seller.getAvatarUrl(),
                unreadMessageCount,
                item.getImageUrls() == null || item.getImageUrls().isBlank()
                        ? List.of()
                        : List.of(item.getImageUrls().split("\\|")),
                item.getCreatedAt() == null ? null : item.getCreatedAt().toString()
        );
    }
}