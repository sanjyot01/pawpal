package org.example.pet_social.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.example.pet_social.dto.MatchRequest;
import org.example.pet_social.service.MatchingService;
import org.example.pet_social.web.JwtAuthFilter;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * HTTP endpoint for dispatch matching.
 * Keep this controller thin: parse the request body, delegate the decision to
 * MatchingService, and return a stable JSON response shape.
 *
 * The caller's identity comes from the JWT, never the request body — it is what
 * excludes them from their own results, so a client must not be able to spoof it.
 */
@RestController
@RequestMapping("/api/match")
public class MatchingController {

    private final MatchingService matchingService;

    public MatchingController(MatchingService matchingService) {
        this.matchingService = matchingService;
    }

    @PostMapping
    public ResponseEntity<Object> findMatch(@RequestBody MatchRequest body, HttpServletRequest request) {
        Long requesterUserId = (Long) request.getAttribute(JwtAuthFilter.AUTH_USER_ID);
        return matchingService.findNearestMatch(requesterUserId, body.searchLatitude(), body.searchLongitude(), body.preferencesMask())
                .map(userId -> ResponseEntity.ok(matchedBody(userId)))
                .orElseGet(() -> ResponseEntity.status(404).body(noMatchBody()));
    }

    private Object matchedBody(Long userId) {
        return Map.of("userId", userId);
    }

    private Object noMatchBody() {
        return Map.of("message", "no-match");
    }
}
