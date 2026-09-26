package org.example.pet_social.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.example.pet_social.dto.MarketChatResponse;
import org.example.pet_social.dto.MarketItemResponse;
import org.example.pet_social.service.MarketService;
import org.example.pet_social.service.MarketService.ItemBody;
import org.example.pet_social.web.RequestAuth;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Mobile marketplace namespace. The legacy /api/marketplace/* endpoints stay
 * untouched for frontend1; both operate on the same table.
 */
@RestController
@RequestMapping("/api/market")
public class MarketController {

    private final MarketService marketService;
    private final RequestAuth requestAuth;

    public MarketController(MarketService marketService, RequestAuth requestAuth) {
        this.marketService = marketService;
        this.requestAuth = requestAuth;
    }

    @GetMapping("/items")
    public List<MarketItemResponse> items(@RequestParam(required = false) String category,
                                          HttpServletRequest request) {
        return marketService.listItems(requestAuth.requireUserId(request), category);
    }

    @GetMapping("/items/my")
    public List<MarketItemResponse> myItems(HttpServletRequest request) {
        return marketService.myItems(requestAuth.requireUserId(request));
    }

    @PostMapping("/items")
    public MarketItemResponse create(@RequestBody ItemBody body, HttpServletRequest request) {
        return marketService.create(requestAuth.requireUserId(request), body);
    }

    @PutMapping("/items/{id}")
    public MarketItemResponse update(@PathVariable Long id, @RequestBody ItemBody body,
                                     HttpServletRequest request) {
        return marketService.update(requestAuth.requireUserId(request), id, body);
    }

    @DeleteMapping("/items/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, HttpServletRequest request) {
        marketService.withdraw(requestAuth.requireUserId(request), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/chats")
    public List<MarketChatResponse> chats(HttpServletRequest request) {
        return marketService.chats(requestAuth.requireUserId(request));
    }
}