package org.example.pet_social.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record MarketplaceItemRequest(
        @NotNull(message = "sellerId is required") Long sellerId,
        @NotBlank(message = "name is required") @Size(max = 255) String name,
        @Size(max = 8) String emoji,
        @NotNull(message = "price is required") @Positive(message = "price must be positive") Double price,
        @Positive(message = "originalPrice must be positive") Double originalPrice,
        String condition,
        @NotBlank(message = "category is required") String category,
        @Size(max = 2000, message = "description must be at most 2000 characters") String description
) {}
