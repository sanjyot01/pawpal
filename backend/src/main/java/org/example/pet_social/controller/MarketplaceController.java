package org.example.pet_social.controller;

import jakarta.validation.Valid;
import org.example.pet_social.dto.MarketplaceItemRequest;
import org.example.pet_social.dto.MarketplaceItemResponse;
import org.example.pet_social.dto.UiFormat;
import org.example.pet_social.entity.MarketplaceItem;
import org.example.pet_social.entity.User;
import org.example.pet_social.repository.MarketplaceItemRepository;
import org.example.pet_social.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/marketplace/items")
public class MarketplaceController {

    private static final String SELLER_EMOJI = "👤"; // 👤 — design uses a generic avatar for sellers

    private final MarketplaceItemRepository itemRepository;
    private final UserService userService;

    public MarketplaceController(MarketplaceItemRepository itemRepository, UserService userService) {
        this.itemRepository = itemRepository;
        this.userService = userService;
    }

    /** MarketplaceScreen grid; category accepts UI labels ('Toy', 'Carrier', ...) or 'All'. */
    @GetMapping
    public List<MarketplaceItemResponse> list(@RequestParam(required = false) String category) {
        List<MarketplaceItem> items;
        if (category == null || category.isBlank() || "All".equalsIgnoreCase(category)) {
            items = itemRepository.findByStatusOrderByCreatedAtDesc("ACTIVE");
        } else {
            items = itemRepository.findByStatusAndCategoryOrderByCreatedAtDesc("ACTIVE", UiFormat.toDbValue(category));
        }
        return items.stream().map(this::toResponse).toList();
    }

    @GetMapping("/seller/{sellerId}")
    public List<MarketplaceItemResponse> bySeller(@PathVariable Long sellerId) {
        return itemRepository.findBySeller_IdOrderByCreatedAtDesc(sellerId).stream()
                .map(this::toResponse)
                .toList();
    }

    @PostMapping
    public ResponseEntity<MarketplaceItemResponse> create(@Valid @RequestBody MarketplaceItemRequest req) {
        User seller = userService.getUserById(req.sellerId());
        if (seller == null || req.name() == null || req.price() == null || req.category() == null) {
            return ResponseEntity.badRequest().build();
        }
        MarketplaceItem item = new MarketplaceItem(seller, req.name(), req.price(), UiFormat.toDbValue(req.category()));
        item.setEmoji(req.emoji());
        item.setOriginalPrice(req.originalPrice());
        item.setCondition(UiFormat.toDbValue(req.condition()));
        item.setDescription(req.description());
        return ResponseEntity.ok(toResponse(itemRepository.save(item)));
    }

    @PutMapping("/{id}/sold")
    public ResponseEntity<Void> markSold(@PathVariable Long id) {
        return itemRepository.findById(id).map(item -> {
            item.setStatus("SOLD");
            itemRepository.save(item);
            return ResponseEntity.noContent().<Void>build();
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }

    private MarketplaceItemResponse toResponse(MarketplaceItem item) {
        return new MarketplaceItemResponse(
                String.valueOf(item.getId()),
                item.getEmoji() == null ? "🛍️" : item.getEmoji(), // 🛍️
                item.getName(),
                item.getPrice() == null ? 0.0 : item.getPrice(),
                item.getOriginalPrice(),
                UiFormat.capitalize(item.getCondition()),
                SELLER_EMOJI,
                item.getSeller().getName(),
                UiFormat.capitalize(item.getCategory())
        );
    }
}
