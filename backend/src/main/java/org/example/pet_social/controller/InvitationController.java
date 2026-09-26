package org.example.pet_social.controller;

import jakarta.validation.Valid;
import org.example.pet_social.dto.InvitationRequest;
import org.example.pet_social.dto.InvitationResponse;
import org.example.pet_social.dto.UiFormat;
import org.example.pet_social.entity.Event;
import org.example.pet_social.entity.EventAttendee;
import org.example.pet_social.entity.Notification;
import org.example.pet_social.entity.User;
import org.example.pet_social.repository.EventAttendeeRepository;
import org.example.pet_social.repository.EventRepository;
import org.example.pet_social.repository.NotificationRepository;
import org.example.pet_social.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Walk invitations from the app map onto WALK-type rows in the events table —
 * no separate invitations table (see DATABASE_SCHEMA.md, API mapping section).
 */
@RestController
@RequestMapping("/api/invitations")
public class InvitationController {

    private static final String TYPE_WALK = "WALK";
    private static final String DEFAULT_EMOJI = "🌿"; // 🌿

    private final EventRepository eventRepository;
    private final EventAttendeeRepository attendeeRepository;
    private final NotificationRepository notificationRepository;
    private final UserService userService;

    public InvitationController(EventRepository eventRepository,
                                EventAttendeeRepository attendeeRepository,
                                NotificationRepository notificationRepository,
                                UserService userService) {
        this.eventRepository = eventRepository;
        this.attendeeRepository = attendeeRepository;
        this.notificationRepository = notificationRepository;
        this.userService = userService;
    }

    /** FindPartnersScreen "My Invitations": upcoming walks the user organizes. */
    @GetMapping
    public List<InvitationResponse> mine(@RequestParam Long userId) {
        return eventRepository.findByOrganizer_Id(userId).stream()
                .filter(e -> TYPE_WALK.equals(e.getEventType()) && "UPCOMING".equals(e.getStatus()))
                .map(this::toResponse)
                .toList();
    }

    /** Open walks anyone can request to join (WalkRequestDetailScreen list source). */
    @GetMapping("/open")
    public List<InvitationResponse> open(@RequestParam(required = false) Long excludeUserId) {
        return eventRepository.findUpcomingEvents(LocalDateTime.now()).stream()
                .filter(e -> TYPE_WALK.equals(e.getEventType()))
                .filter(e -> excludeUserId == null || !excludeUserId.equals(e.getOrganizerId()))
                .filter(e -> !e.isFull())
                .map(this::toResponse)
                .toList();
    }

    /** PostInvitationScreen. */
    @PostMapping
    public ResponseEntity<InvitationResponse> create(@Valid @RequestBody InvitationRequest req) {
        User organizer = userService.getUserById(req.organizerId());
        if (organizer == null || req.route() == null || req.dateTime() == null) {
            return ResponseEntity.badRequest().build();
        }
        Event event = new Event(organizer, req.route(), req.dateTime());
        event.setEventType(TYPE_WALK);
        event.setLocationName(req.route());
        event.setDescription(req.description());
        event.setMaxAttendees(req.totalSpots() == null ? 4 : req.totalSpots());
        event.setEmoji(req.emoji() == null ? DEFAULT_EMOJI : req.emoji());
        event.setLatitude(req.latitude());
        event.setLongitude(req.longitude());
        return ResponseEntity.ok(toResponse(eventRepository.save(event)));
    }

    /** EditInvitationScreen. */
    @PutMapping("/{id}")
    public ResponseEntity<InvitationResponse> update(@PathVariable Long id, @Valid @RequestBody InvitationRequest req) {
        return eventRepository.findById(id).map(event -> {
            if (req.route() != null) {
                event.setTitle(req.route());
                event.setLocationName(req.route());
            }
            if (req.dateTime() != null) event.setEventDateTime(req.dateTime());
            if (req.totalSpots() != null) event.setMaxAttendees(req.totalSpots());
            if (req.emoji() != null) event.setEmoji(req.emoji());
            if (req.description() != null) event.setDescription(req.description());
            if (req.latitude() != null) event.setLatitude(req.latitude());
            if (req.longitude() != null) event.setLongitude(req.longitude());
            return ResponseEntity.ok(toResponse(eventRepository.save(event)));
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> cancel(@PathVariable Long id) {
        return eventRepository.findById(id).map(event -> {
            event.setStatus("CANCELLED");
            eventRepository.save(event);
            return ResponseEntity.noContent().<Void>build();
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** Join a walk: RSVP + notify the organizer (WALK_REQUEST notification). */
    @PostMapping("/{id}/join")
    @Transactional
    public ResponseEntity<Object> join(@PathVariable Long id, @RequestParam Long userId) {
        Event event = eventRepository.findById(id).orElse(null);
        User joiner = userService.getUserById(userId);
        if (event == null || joiner == null) {
            return ResponseEntity.notFound().build();
        }
        if (event.isFull()) {
            return ResponseEntity.badRequest().body(Map.of("message", "walk-full"));
        }
        if (attendeeRepository.findByEvent_IdAndUser_Id(id, userId).isPresent()) {
            return ResponseEntity.badRequest().body(Map.of("message", "already-joined"));
        }

        attendeeRepository.save(new EventAttendee(event, joiner, "GOING"));
        event.incrementAttendees();
        eventRepository.save(event);

        Notification notif = new Notification(event.getOrganizer(), "WALK_REQUEST",
                joiner.getName() + " joined your walk: " + event.getTitle());
        notif.setSender(joiner);
        notif.setSenderName(joiner.getName());
        notif.setRelated("EVENT", event.getId());
        notificationRepository.save(notif);

        return ResponseEntity.ok(toResponse(event));
    }

    private InvitationResponse toResponse(Event e) {
        int total = e.getMaxAttendees() == null ? 0 : e.getMaxAttendees();
        int current = e.getCurrentAttendees() == null ? 0 : e.getCurrentAttendees();
        return new InvitationResponse(
                String.valueOf(e.getId()),
                e.getTitle(),
                UiFormat.invitationDate(e.getEventDateTime()),
                UiFormat.invitationTime(e.getEventDateTime()),
                Math.max(total - current, 0),
                total,
                e.getEmoji() == null ? DEFAULT_EMOJI : e.getEmoji()
        );
    }
}
