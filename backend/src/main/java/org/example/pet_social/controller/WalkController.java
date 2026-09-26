package org.example.pet_social.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.example.pet_social.dto.CompletedWalkResponse;
import org.example.pet_social.dto.PartnerNotificationResponse;
import org.example.pet_social.dto.WalkFeedItemResponse;
import org.example.pet_social.dto.WalkInvitationResponse;
import org.example.pet_social.entity.PartnerInvitation;
import org.example.pet_social.service.PartnerBoardService;
import org.example.pet_social.service.PartnerBoardService.InvitationBody;
import org.example.pet_social.service.PartnerBoardService.RequestSummary;
import org.example.pet_social.service.PartnerBoardService.UnreadSummary;
import org.example.pet_social.web.RequestAuth;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Walk board for the mobile app (FindPartners/HomeMap/PostInvitation screens).
 * Identity always comes from the Bearer token (JwtAuthFilter covers /api/walk/*).
 */
@RestController
@RequestMapping("/api/walk")
public class WalkController {

    public record CreateRequestBody(Long invitationId) {}
    public record StatusBody(String status) {}

    private final PartnerBoardService board;
    private final RequestAuth requestAuth;

    public WalkController(PartnerBoardService board, RequestAuth requestAuth) {
        this.board = board;
        this.requestAuth = requestAuth;
    }

    /**
     * The board behind HomeMapScreen and FindPartnersScreen. When lat/lng are supplied the
     * feed is bounded to radiusKm (default app.discovery.default-radius-km, clamped to
     * max-radius-km) and ordered nearest-first; without them it cannot be, so it isn't.
     */
    @GetMapping("/invitations/feed")
    public List<WalkFeedItemResponse> feed(@RequestParam(required = false) Double lat,
                                           @RequestParam(required = false) Double lng,
                                           @RequestParam(required = false) Double radiusKm,
                                           HttpServletRequest request) {
        return board.walkFeed(requestAuth.requireUserId(request), lat, lng, radiusKm);
    }

    @GetMapping("/invitations/my")
    public List<WalkInvitationResponse> myInvitations(HttpServletRequest request) {
        return board.myWalkInvitations(requestAuth.requireUserId(request));
    }

    @GetMapping("/invitations/completed")
    public List<CompletedWalkResponse> completed(HttpServletRequest request) {
        return board.completedWalks(requestAuth.requireUserId(request));
    }

    @PostMapping("/invitations")
    public WalkInvitationResponse create(@RequestBody InvitationBody body, HttpServletRequest request) {
        return board.createWalkInvitation(requestAuth.requireUserId(request), body);
    }

    @PutMapping("/invitations/{id}")
    public WalkInvitationResponse update(@PathVariable Long id, @RequestBody InvitationBody body,
                                         HttpServletRequest request) {
        return board.updateWalkInvitation(requestAuth.requireUserId(request), id, body);
    }

    @DeleteMapping("/invitations/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, HttpServletRequest request) {
        board.cancelInvitation(PartnerInvitation.TYPE_WALK, requestAuth.requireUserId(request), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/requests")
    public RequestSummary createRequest(@RequestBody CreateRequestBody body, HttpServletRequest request) {
        return board.createRequest(PartnerInvitation.TYPE_WALK, requestAuth.requireUserId(request), body.invitationId());
    }

    @GetMapping("/requests/my-sent")
    public List<RequestSummary> mySent(HttpServletRequest request) {
        return board.mySentRequests(PartnerInvitation.TYPE_WALK, requestAuth.requireUserId(request));
    }

    @GetMapping("/requests/my-sent-unread")
    public List<UnreadSummary> mySentUnread(HttpServletRequest request) {
        return board.mySentUnread(PartnerInvitation.TYPE_WALK, requestAuth.requireUserId(request));
    }

    @PutMapping("/requests/{id}")
    public RequestSummary updateRequest(@PathVariable Long id, @RequestBody StatusBody body,
                                        HttpServletRequest request) {
        return board.updateRequestStatus(PartnerInvitation.TYPE_WALK, requestAuth.requireUserId(request), id, body.status());
    }

    @GetMapping("/notifications")
    public List<PartnerNotificationResponse> notifications(HttpServletRequest request) {
        return board.notifications(PartnerInvitation.TYPE_WALK, requestAuth.requireUserId(request));
    }
}