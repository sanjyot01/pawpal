package org.example.pet_social.controller;

import jakarta.validation.Valid;
import org.example.pet_social.dto.MatchCreateRequest;
import org.example.pet_social.dto.MatchResponse;
import org.example.pet_social.entity.Notification;
import org.example.pet_social.entity.Pet;
import org.example.pet_social.entity.PetMatch;
import org.example.pet_social.repository.NotificationRepository;
import org.example.pet_social.repository.PetMatchRepository;
import org.example.pet_social.repository.PetRepository;
import org.example.pet_social.web.JwtAuthFilter;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Walk-request / blind-date-request flow ("Connect" → thread → Accept/Deny/Block)
 * on top of the pet_matches table. Requires a Bearer token (JwtAuthFilter); the
 * authenticated user is taken from the token, never from the request body.
 *
 * Status lifecycle: PENDING → ACCEPTED | DENIED | BLOCKED (BLOCKED also stops
 * future requests between the two pets; DENIED allows a new request later).
 */
@RestController
@RequestMapping("/api/matches")
public class MatchController {

    private final PetMatchRepository matchRepository;
    private final PetRepository petRepository;
    private final NotificationRepository notificationRepository;

    public MatchController(PetMatchRepository matchRepository,
                           PetRepository petRepository,
                           NotificationRepository notificationRepository) {
        this.matchRepository = matchRepository;
        this.petRepository = petRepository;
        this.notificationRepository = notificationRepository;
    }

    /** All request threads involving the caller's pets, optionally filtered by status. */
    @GetMapping
    public List<MatchResponse> myMatches(@RequestParam(required = false) String status, HttpServletRequest request) {
        Long userId = authUserId(request);
        return matchRepository.findMatchesForUser(userId).stream()
                .filter(m -> status == null || m.getMatchStatus().equalsIgnoreCase(status))
                .map(m -> MatchResponse.from(m, userId))
                .toList();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Object> get(@PathVariable Long id, HttpServletRequest request) {
        Long userId = authUserId(request);
        return matchRepository.findById(id)
                .map(m -> isParticipant(m, userId)
                        ? ResponseEntity.ok((Object) MatchResponse.from(m, userId))
                        : forbidden())
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** "Connect" / "Send Match Request". */
    @PostMapping
    public ResponseEntity<Object> create(@Valid @RequestBody MatchCreateRequest req, HttpServletRequest request) {
        Long userId = authUserId(request);
        Pet requester = petRepository.findById(req.requesterPetId()).orElse(null);
        Pet target = petRepository.findById(req.targetPetId()).orElse(null);
        if (requester == null || target == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "pet not found"));
        }
        if (!requester.getOwner().getId().equals(userId)) {
            return forbidden();
        }
        if (requester.getId().equals(target.getId())) {
            return ResponseEntity.badRequest().body(Map.of("message", "cannot match a pet with itself"));
        }
        if (requester.getOwner().getId().equals(target.getOwner().getId())) {
            return ResponseEntity.badRequest().body(Map.of("message", "cannot match two pets of the same owner"));
        }
        // One thread per pet pair, either direction (the DB unique constraint only
        // covers the ordered pair, so the reverse-pair check lives here)
        var existing = matchRepository.findMatchBetweenPets(requester.getId(), target.getId());
        if (existing.isPresent()) {
            PetMatch match = existing.get();
            if ("BLOCKED".equals(match.getMatchStatus())) {
                return ResponseEntity.status(409).body(Map.of("message", "blocked"));
            }
            if ("DENIED".equals(match.getMatchStatus()) || "REJECTED".equals(match.getMatchStatus())) {
                // A denied request may be retried: reopen the same row
                match.setInitiatedByUser(requester.getOwner());
                match.setMatchStatus("PENDING");
                match.setMatchType(normalizedType(req.matchType()));
                match.setNotes(req.notes());
                match.setMeetingDate(req.meetingDate());
                matchRepository.save(match);
                notifyTarget(match, requester, target);
                return ResponseEntity.ok(MatchResponse.from(match, userId));
            }
            return ResponseEntity.status(409).body(Map.of("message", "match already exists", "matchId", match.getId()));
        }

        PetMatch match = new PetMatch(requester, target, requester.getOwner());
        match.setMatchType(normalizedType(req.matchType()));
        match.setNotes(req.notes());
        match.setMeetingDate(req.meetingDate());
        matchRepository.save(match);
        notifyTarget(match, requester, target);
        return ResponseEntity.ok(MatchResponse.from(match, userId));
    }

    @PutMapping("/{id}/accept")
    public ResponseEntity<Object> accept(@PathVariable Long id, HttpServletRequest request) {
        return respond(id, request, "ACCEPTED");
    }

    @PutMapping("/{id}/deny")
    public ResponseEntity<Object> deny(@PathVariable Long id, HttpServletRequest request) {
        return respond(id, request, "DENIED");
    }

    @PutMapping("/{id}/block")
    public ResponseEntity<Object> block(@PathVariable Long id, HttpServletRequest request) {
        return respond(id, request, "BLOCKED");
    }

    private ResponseEntity<Object> respond(Long id, HttpServletRequest request, String newStatus) {
        Long userId = authUserId(request);
        PetMatch match = matchRepository.findById(id).orElse(null);
        if (match == null) {
            return ResponseEntity.notFound().build();
        }
        if (!isParticipant(match, userId)) {
            return forbidden();
        }
        // Only the side that did NOT send the request can resolve it
        if (userId.equals(match.getInitiatedByUserId())) {
            return ResponseEntity.badRequest().body(Map.of("message", "the requester cannot accept/deny their own request"));
        }
        match.setMatchStatus(newStatus);
        matchRepository.save(match);

        if ("ACCEPTED".equals(newStatus)) {
            Pet acceptedPet = match.getInitiatedByUserId().equals(match.getPet1().getOwner().getId())
                    ? match.getPet2() : match.getPet1();
            Notification n = new Notification(match.getInitiatedByUser(), "MATCH",
                    acceptedPet.getName() + " accepted your " + displayType(match.getMatchType()) + " request! Say hello.");
            n.setSender(acceptedPet.getOwner());
            n.setSenderName(acceptedPet.getOwner().getName());
            n.setPetName(acceptedPet.getName());
            n.setPetEmoji(org.example.pet_social.dto.UiFormat.petEmoji(acceptedPet));
            n.setRelated("MATCH", match.getId());
            notificationRepository.save(n);
        }
        return ResponseEntity.ok(MatchResponse.from(match, userId));
    }

    private void notifyTarget(PetMatch match, Pet requester, Pet target) {
        String category = "WALK".equals(match.getMatchType()) ? "WALK_REQUEST" : "BLIND_DATE";
        Notification n = new Notification(target.getOwner(), category,
                requester.getName() + " sent a " + displayType(match.getMatchType()) + " request to " + target.getName()
                        + (match.getNotes() == null || match.getNotes().isBlank() ? "" : ": " + match.getNotes()));
        n.setSender(requester.getOwner());
        n.setSenderName(requester.getOwner().getName());
        n.setPetName(requester.getName());
        n.setPetEmoji(org.example.pet_social.dto.UiFormat.petEmoji(requester));
        n.setRelated("MATCH", match.getId());
        notificationRepository.save(n);
    }

    private String normalizedType(String matchType) {
        return matchType == null || matchType.isBlank() ? "PLAYDATE" : matchType.toUpperCase(Locale.ROOT);
    }

    private String displayType(String matchType) {
        return matchType == null ? "match" : matchType.toLowerCase(Locale.ROOT).replace('_', ' ');
    }

    private boolean isParticipant(PetMatch match, Long userId) {
        return match.getPet1().getOwner().getId().equals(userId)
                || match.getPet2().getOwner().getId().equals(userId);
    }

    private Long authUserId(HttpServletRequest request) {
        Object attr = request.getAttribute(JwtAuthFilter.AUTH_USER_ID);
        if (attr == null) {
            throw new IllegalStateException("JwtAuthFilter did not run for this request");
        }
        return (Long) attr;
    }

    private ResponseEntity<Object> forbidden() {
        return ResponseEntity.status(403).body(Map.of("message", "not a participant of this match"));
    }
}
