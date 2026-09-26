package org.example.pet_social.dto;

/** Mirrors frontend MarketplaceItem (mockData.ts) — cards on MarketplaceScreen. */
public record MarketplaceItemResponse(
        String id,
        String emoji,
        String name,
        double price,
        Double originalPrice,
        String condition,
        String sellerEmoji,
        String sellerName,
        String category
) {}
