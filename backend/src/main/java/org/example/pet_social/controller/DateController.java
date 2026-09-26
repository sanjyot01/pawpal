package org.example.pet_social.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.example.pet_social.dto.CompletedDateResponse;
import org.example.pet_social.dto.DateFeedItemResponse;
import org.example.pet_social.dto.DateInvitationResponse;
import org.example.pet_social.dto.PartnerNotificationResponse;
import org.example.pet_social.entity.PartnerInvitation;
import org.example.pet_social.service.PartnerBoardService;
import org.example.pet_social.service.PartnerBoardService.InvitationBody;
import org.example.pet_social.service.PartnerBoardService.RequestSummary;
import org.example.pet_social.web.RequestAuth;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Blind-date board for the mobile app (PetBlindDate/PostDateInvitation screens).
 * Mirrors WalkController; both delegate to the shared PartnerBoardService.
 */
@RestController
@RequestMapping("/api/date")
public class DateController {

    public record CreateRequestBody(Long invitationId) {}
    public record StatusBody(String status) {}

    private final PartnerBoardService board;
    private final RequestAuth requestAuth;

    public DateController(PartnerBoardService board, RequestAuth requestAuth) {
        this.board = board;
        this.requestAuth = requestAuth;
    }

    /** Same distance bound as the walk board — see WalkController.feed. */
    @GetMapping("/invitations/feed")
    public List<DateFeedItemResponse> feed(@RequestParam(required = false) Double lat,
                                           @RequestParam(required = false) Double lng,
                                           @RequestParam(required = false) String species,
                                           @RequestParam(required = false) String age,
                                           @RequestParam(required = false) String vaccine,
                                           @RequestParam(required = false) String breed,
                                           @RequestParam(required = false) Double radiusKm,
                                           HttpServletRequest request) {
        return board.dateFeed(requestAuth.requireUserId(request), lat, lng, species, age, vaccine, breed, radiusKm);
    }

    @GetMapping("/invitations/my")
    public List<DateInvitationResponse> myInvitations(HttpServletRequest request) {
        return board.myDateInvitations(requestAuth.requireUserId(request));
    }

    @GetMapping("/invitations/completed")
    public List<CompletedDateResponse> completed(HttpServletRequest request) {
        return board.completedDates(requestAuth.requireUserId(request));
    }

    @PostMapping("/invitations")
    public DateInvitationResponse create(@RequestBody InvitationBody body, HttpServletRequest request) {
        return board.createDateInvitation(requestAuth.requireUserId(request), body);
    }

    @PutMapping("/invitations/{id}")
    public DateInvitationResponse update(@PathVariable Long id, @RequestBody InvitationBody body,
                                         HttpServletRequest request) {
        return board.updateDateInvitation(requestAuth.requireUserId(request), id, body);
    }

    @DeleteMapping("/invitations/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, HttpServletRequest request) {
        board.cancelInvitation(PartnerInvitation.TYPE_DATE, requestAuth.requireUserId(request), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/requests")
    public RequestSummary createRequest(@RequestBody CreateRequestBody body, HttpServletRequest request) {
        return board.createRequest(PartnerInvitation.TYPE_DATE, requestAuth.requireUserId(request), body.invitationId());
    }

    @GetMapping("/requests/my-sent")
    public List<RequestSummary> mySent(HttpServletRequest request) {
        return board.mySentRequests(PartnerInvitation.TYPE_DATE, requestAuth.requireUserId(request));
    }

    @PutMapping("/requests/{id}")
    public RequestSummary updateRequest(@PathVariable Long id, @RequestBody StatusBody body,
                                        HttpServletRequest request) {
        return board.updateRequestStatus(PartnerInvitation.TYPE_DATE, requestAuth.requireUserId(request), id, body.status());
    }

    @GetMapping("/notifications")
    public List<PartnerNotificationResponse> notifications(HttpServletRequest request) {
        return board.notifications(PartnerInvitation.TYPE_DATE, requestAuth.requireUserId(request));
    }
}