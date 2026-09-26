package org.example.pet_social.service;

import org.example.pet_social.dto.MarketChatResponse;
import org.example.pet_social.dto.MarketItemResponse;
import org.example.pet_social.dto.UiFormat;
import org.example.pet_social.entity.MarketplaceItem;
import org.example.pet_social.entity.Message;
import org.example.pet_social.entity.User;
import org.example.pet_social.repository.MarketplaceItemRepository;
import org.example.pet_social.repository.MessageRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Mobile marketplace (/api/market/*) over the same marketplace_items table the
 * legacy /api/marketplace endpoints use — raw enum values, photo/location
 * fields, WITHDRAWN soft delete (hard deletes would orphan the item's chats).
 */
@Service
public class MarketService {

    public record ItemBody(String name, String category, String condition, Double price,
                           Double originalPrice, String description, String location,
                           Double latitude, Double longitude, String photoUrl, String status,
                           List<String> imageUrls) {}

    // This is a casual pet-gear marketplace, not a general classifieds site — cap the
    // selling price so listings stay in "used leash/carrier" territory. originalPrice
    // (what it cost new) is informational only and isn't capped.
    private static final double MAX_PRICE = 500.0;

    private final MarketplaceItemRepository itemRepository;
    private final MessageRepository messageRepository;
    private final UserService userService;

    public MarketService(MarketplaceItemRepository itemRepository,
                         MessageRepository messageRepository,
                         UserService userService) {
        this.itemRepository = itemRepository;
        this.messageRepository = messageRepository;
        this.userService = userService;
    }

    /** Browse feed: everyone else's listings — sellers already manage their own via "My Listings". */
    public List<MarketItemResponse> listItems(Long userId, String category) {
        String normalized = category == null || category.isBlank() || "ALL".equalsIgnoreCase(category)
                ? null : UiFormat.toDbValue(category);
        List<MarketplaceItem> items = normalized == null
                ? itemRepository.findByStatusOrderByCreatedAtDesc("ACTIVE")
                : itemRepository.findByStatusAndCategoryOrderByCreatedAtDesc("ACTIVE", normalized);
        List<MarketplaceItem> othersOnly = items.stream()
                .filter(i -> !userId.equals(i.getSellerId()))
                .toList();
        return withUnread(othersOnly, userId);
    }

    public List<MarketItemResponse> myItems(Long userId) {
        List<MarketplaceItem> items = itemRepository.findBySeller_IdOrderByCreatedAtDesc(userId).stream()
                .filter(i -> !"WITHDRAWN".equals(i.getStatus()))
                .toList();
        return withUnread(items, userId);
    }

    // open-in-view is false, so the session closes with the repository call. The DTO reads
    // item.seller (lazy) while mapping, so the write and the mapping must share one transaction.
    @Transactional
    public MarketItemResponse create(Long userId, ItemBody body) {
        validate(body);
        User seller = userService.getUserById(userId);
        MarketplaceItem item = new MarketplaceItem(seller, body.name(),
                body.price(), UiFormat.toDbValue(body.category()));
        apply(item, body);
        return MarketItemResponse.from(itemRepository.save(item), 0);
    }

    @Transactional
    public MarketItemResponse update(Long userId, Long itemId, ItemBody body) {
        validate(body);
        MarketplaceItem item = owned(userId, itemId);
        item.setName(body.name());
        item.setPrice(body.price());
        item.setCategory(UiFormat.toDbValue(body.category()));
        apply(item, body);
        if (body.status() != null) {
            String status = body.status().toUpperCase(Locale.ROOT);
            if (!List.of("ACTIVE", "SOLD").contains(status)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status must be ACTIVE or SOLD");
            }
            item.setStatus(status);
        }
        return MarketItemResponse.from(itemRepository.save(item), 0);
    }

    /** Soft delete: withdrawn items vanish from every list but their chats survive. */
    @Transactional
    public void withdraw(Long userId, Long itemId) {
        MarketplaceItem item = owned(userId, itemId);
        item.setStatus("WITHDRAWN");
        itemRepository.save(item);
    }

    /** Marketplace inbox: one row per (item, chat partner), newest first. */
    public List<MarketChatResponse> chats(Long userId) {
        List<Message> messages = messageRepository.findListingMessagesInvolving(userId);

        // Messages come newest-first, so the first message per key is the latest one
        record ChatKey(Long itemId, Long otherUserId) {}
        Map<ChatKey, Message> latest = new LinkedHashMap<>();
        Map<ChatKey, Integer> unread = new HashMap<>();
        for (Message m : messages) {
            if (m.getContextId() == null) continue;
            boolean mine = m.getSenderId().equals(userId);
            Long otherId = mine ? m.getReceiverId() : m.getSenderId();
            ChatKey key = new ChatKey(m.getContextId(), otherId);
            latest.putIfAbsent(key, m);
            if (!mine && !Boolean.TRUE.equals(m.getIsRead())) {
                unread.merge(key, 1, Integer::sum);
            }
        }
        if (latest.isEmpty()) {
            return List.of();
        }

        Map<Long, MarketplaceItem> items = new HashMap<>();
        for (MarketplaceItem item : itemRepository.findAllById(
                latest.keySet().stream().map(ChatKey::itemId).distinct().toList())) {
            items.put(item.getId(), item);
        }

        List<MarketChatResponse> out = new ArrayList<>(latest.size());
        for (Map.Entry<ChatKey, Message> entry : latest.entrySet()) {
            ChatKey key = entry.getKey();
            Message m = entry.getValue();
            boolean mine = m.getSenderId().equals(userId);
            User other = mine ? m.getReceiver() : m.getSender();
            MarketplaceItem item = items.get(key.itemId());
            out.add(new MarketChatResponse(
                    String.valueOf(key.itemId()),
                    String.valueOf(key.otherUserId()),
                    other.getName(),
                    other.getAvatarUrl(),
                    item == null ? null : item.getName(),
                    item == null ? null : item.getPhotoUrl(),
                    item == null ? null : item.getPrice(),
                    item == null ? null : item.getStatus(),
                    item != null && userId.equals(item.getSellerId()),
                    m.getContent(),
                    m.getCreatedAt() == null ? null : m.getCreatedAt().toString(),
                    mine,
                    unread.getOrDefault(key, 0)));
        }
        return out;
    }

    private List<MarketItemResponse> withUnread(List<MarketplaceItem> items, Long userId) {
        Map<Long, Long> unreadByItem = new HashMap<>();
        for (Object[] row : messageRepository.countUnreadGroupedByContextId(userId, "LISTING")) {
            unreadByItem.put(((Number) row[0]).longValue(), ((Number) row[1]).longValue());
        }
        return items.stream()
                .map(i -> MarketItemResponse.from(i, unreadByItem.getOrDefault(i.getId(), 0L).intValue()))
                .toList();
    }

    private MarketplaceItem owned(Long userId, Long itemId) {
        MarketplaceItem item = itemRepository.findById(itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "item not found"));
        if (!userId.equals(item.getSellerId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "not your listing");
        }
        return item;
    }

    private void validate(ItemBody body) {
        if (body.name() == null || body.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name is required");
        }
        if (body.price() == null || body.price() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "price must be a non-negative number");
        }
        if (body.price() > MAX_PRICE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "price must be $" + MAX_PRICE + " or less");
        }
        if (body.category() == null || body.category().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "category is required");
        }
        if (body.location() == null || body.location().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "pickup location is required");
        }
        if (body.imageUrls() == null || body.imageUrls().stream().noneMatch(u -> u != null && !u.isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "at least one photo is required");
        }
    }

    private void apply(MarketplaceItem item, ItemBody body) {
        item.setOriginalPrice(body.originalPrice());
        item.setCondition(body.condition() == null ? null : UiFormat.toDbValue(body.condition()));
        item.setDescription(body.description());
        item.setLocation(body.location());
        item.setLatitude(body.latitude());
        item.setLongitude(body.longitude());
        if (body.imageUrls() != null) {
            List<String> capped = body.imageUrls().stream()
                    .filter(u -> u != null && !u.isBlank())
                    .limit(5)
                    .toList();
            item.setImageUrls(capped.isEmpty() ? null : String.join("|", capped));
            // photoUrl mirrors the first photo so older screens (chat list thumbnails) keep working
            item.setPhotoUrl(capped.isEmpty() ? null : capped.get(0));
        } else if (body.photoUrl() != null) {
            item.setPhotoUrl(body.photoUrl());
        }
    }
}