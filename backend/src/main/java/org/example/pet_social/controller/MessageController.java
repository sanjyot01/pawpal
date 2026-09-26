package org.example.pet_social.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.example.pet_social.dto.AppEvent;
import org.example.pet_social.dto.ConversationResponse;
import org.example.pet_social.dto.MessageResponse;
import org.example.pet_social.dto.MessageSendRequest;
import org.example.pet_social.dto.UiFormat;
import org.example.pet_social.entity.Message;
import org.example.pet_social.entity.PartnerRequest;
import org.example.pet_social.entity.User;
import org.example.pet_social.repository.MessageRepository;
import org.example.pet_social.service.AppEventsProducer;
import org.example.pet_social.service.PartnerBoardService;
import org.example.pet_social.service.UnreadCountService;
import org.example.pet_social.service.UserService;
import org.example.pet_social.web.JwtAuthFilter;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Chat threads (walk request, blind date, marketplace, general DM) over the
 * messages table. Requires a Bearer token; the sender is always the
 * authenticated user. Threads are scoped by (other user, contextType, contextId);
 * the mobile app's per-thread getters below mark incoming messages read on
 * fetch, since the app has no explicit mark-read call. Notification fan-out
 * rides the app-events Kafka topic, off the send hot path.
 */
@RestController
@RequestMapping("/api/messages")
public class MessageController {

    private final MessageRepository messageRepository;
    private final UserService userService;
    private final PartnerBoardService partnerBoardService;
    private final UnreadCountService unreadCountService;
    private final AppEventsProducer appEventsProducer;

    public MessageController(MessageRepository messageRepository,
                             UserService userService,
                             PartnerBoardService partnerBoardService,
                             UnreadCountService unreadCountService,
                             AppEventsProducer appEventsProducer) {
        this.messageRepository = messageRepository;
        this.userService = userService;
        this.partnerBoardService = partnerBoardService;
        this.unreadCountService = unreadCountService;
        this.appEventsProducer = appEventsProducer;
    }

    private static final int PENDING_MESSAGE_LIMIT = 5;

    @PostMapping
    @Transactional
    public ResponseEntity<Object> send(@Valid @RequestBody MessageSendRequest req, HttpServletRequest request) {
        Long userId = authUserId(request);
        User sender = userService.getUserById(userId);
        User receiver = userService.getUserById(req.receiverId());
        if (receiver == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "receiver not found"));
        }
        if (receiver.getId().equals(userId)) {
            return ResponseEntity.badRequest().body(Map.of("message", "cannot message yourself"));
        }

        // Resolve the thread context: mobile aliases first, then the legacy explicit pair
        String contextType = null;
        Long contextId = null;
        if (req.walkRequestId() != null) {
            contextType = "WALK_REQUEST";
            contextId = req.walkRequestId();
        } else if (req.dateRequestId() != null) {
            contextType = "DATE_REQUEST";
            contextId = req.dateRequestId();
        } else if (req.marketItemId() != null) {
            contextType = "LISTING";
            contextId = req.marketItemId();
        } else if (req.contextType() != null && !req.contextType().isBlank()) {
            contextType = req.contextType().toUpperCase(Locale.ROOT);
            contextId = req.contextId();
        }
        if ("WALK_REQUEST".equals(contextType) || "DATE_REQUEST".equals(contextType)) {
            PartnerRequest pr = partnerBoardService.requestForThread(contextType, contextId);
            if (pr == null || !(userId.equals(pr.getRequesterId()) || userId.equals(pr.getInvitation().getHostId()))) {
                return ResponseEntity.status(403).body(Map.of("message", "not a participant of this request"));
            }
            // While the host hasn't accepted yet, cap the thread so a stranger can't spam
            // an unlimited number of messages before the host has even responded.
            if (PartnerRequest.STATUS_PENDING.equals(pr.getStatus())
                    && messageRepository.countByContextTypeAndContextId(contextType, contextId) >= PENDING_MESSAGE_LIMIT) {
                return ResponseEntity.status(403).body(Map.of("message",
                        "5-message limit reached while this request is pending. You can message freely once it's accepted."));
            }
        }

        Message message = new Message(sender, receiver, req.content());
        message.setContextType(contextType);
        message.setContextId(contextId);
        messageRepository.save(message);

        // Receiver's badge changed now; the notification row is created async via Kafka
        unreadCountService.invalidate(receiver.getId());
        appEventsProducer.publish(new AppEvent(AppEvent.MESSAGE_SENT, userId, receiver.getId(),
                "MESSAGE", message.getId(), truncate(req.content(), 200)));

        return ResponseEntity.ok(MessageResponse.from(message, userId));
    }

    /** Full thread with one user (optionally scoped to a match/listing), oldest first. */
    @GetMapping("/thread")
    public List<MessageResponse> thread(@RequestParam Long otherUserId,
                                        @RequestParam(required = false) String contextType,
                                        @RequestParam(required = false) Long contextId,
                                        HttpServletRequest request) {
        Long userId = authUserId(request);
        String normalizedType = contextType == null || contextType.isBlank()
                ? null : contextType.toUpperCase(Locale.ROOT);
        return messageRepository.findThread(userId, otherUserId, normalizedType, contextId).stream()
                .map(m -> MessageResponse.from(m, userId))
                .toList();
    }

    /** Mobile app: chat of one walk request (participants only; marks incoming read). */
    @GetMapping("/walk-request/{requestId}")
    @Transactional
    public ResponseEntity<Object> walkRequestThread(@PathVariable Long requestId, HttpServletRequest request) {
        return contextThread("WALK_REQUEST", requestId, authUserId(request));
    }

    /** Mobile app: chat of one blind-date request. */
    @GetMapping("/date-request/{requestId}")
    @Transactional
    public ResponseEntity<Object> dateRequestThread(@PathVariable Long requestId, HttpServletRequest request) {
        return contextThread("DATE_REQUEST", requestId, authUserId(request));
    }

    /** Mobile app: chat about one marketplace item with one user. */
    @GetMapping("/market-item/{itemId}/{otherUserId}")
    @Transactional
    public List<MessageResponse> marketItemThread(@PathVariable Long itemId,
                                                  @PathVariable Long otherUserId,
                                                  HttpServletRequest request) {
        Long userId = authUserId(request);
        List<MessageResponse> thread = messageRepository
                .findThread(userId, otherUserId, "LISTING", itemId).stream()
                .map(m -> MessageResponse.from(m, userId))
                .toList();
        // Polled endpoint — skip the read-marking UPDATE unless something is actually unread.
        if (thread.stream().anyMatch(m -> !m.mine() && !m.read())
                && messageRepository.markContextRead(userId, "LISTING", itemId) > 0) {
            unreadCountService.invalidate(userId);
        }
        return thread;
    }

    /** Mobile app badge counts: { WALK, DATE, MARKET } (Redis-cached, 15s TTL). */
    @GetMapping("/unread-counts")
    public Map<String, Long> unreadCounts(HttpServletRequest request) {
        return unreadCountService.getCounts(authUserId(request));
    }

    /** Inbox: latest message per conversation partner. */
    @GetMapping("/conversations")
    public List<ConversationResponse> conversations(HttpServletRequest request) {
        Long userId = authUserId(request);
        return messageRepository.findRecentConversations(userId).stream()
                .map(m -> {
                    boolean mine = m.getSenderId().equals(userId);
                    User other = mine ? m.getReceiver() : m.getSender();
                    return new ConversationResponse(
                            other.getId(),
                            other.getName(),
                            m.getContent(),
                            UiFormat.relativeTime(m.getCreatedAt()),
                            mine,
                            !mine && !Boolean.TRUE.equals(m.getIsRead()),
                            m.getContextType() == null ? null : m.getContextType().toLowerCase(Locale.ROOT),
                            m.getContextId()
                    );
                })
                .toList();
    }

    @PutMapping("/read")
    @Transactional
    public Map<String, Integer> markThreadRead(@RequestParam Long otherUserId, HttpServletRequest request) {
        Long userId = authUserId(request);
        int updated = messageRepository.markThreadRead(userId, otherUserId);
        if (updated > 0) {
            unreadCountService.invalidate(userId);
        }
        return Map.of("updated", updated);
    }

    @GetMapping("/unread-count")
    public Map<String, Long> unreadCount(HttpServletRequest request) {
        return Map.of("count", messageRepository.countByReceiver_IdAndIsRead(authUserId(request), false));
    }

    private ResponseEntity<Object> contextThread(String contextType, Long requestId, Long userId) {
        if (!isRequestParticipant(contextType, requestId, userId)) {
            return ResponseEntity.status(403).body(Map.of("message", "not a participant of this request"));
        }
        List<MessageResponse> thread = messageRepository.findByContext(contextType, requestId).stream()
                .map(m -> MessageResponse.from(m, userId))
                .toList();
        // The app polls this endpoint; only issue the read-marking UPDATE when the fetched
        // thread actually contains unread incoming messages, not once per poll.
        if (thread.stream().anyMatch(m -> !m.mine() && !m.read())
                && messageRepository.markContextRead(userId, contextType, requestId) > 0) {
            unreadCountService.invalidate(userId);
        }
        return ResponseEntity.ok(thread);
    }

    private boolean isRequestParticipant(String contextType, Long requestId, Long userId) {
        if (requestId == null) return false;
        PartnerRequest pr = partnerBoardService.requestForThread(contextType, requestId);
        return pr != null && (userId.equals(pr.getRequesterId())
                || userId.equals(pr.getInvitation().getHostId()));
    }

    private String truncate(String text, int max) {
        return text.length() <= max ? text : text.substring(0, max - 1) + "…";
    }

    private Long authUserId(HttpServletRequest request) {
        Object attr = request.getAttribute(JwtAuthFilter.AUTH_USER_ID);
        if (attr == null) {
            throw new IllegalStateException("JwtAuthFilter did not run for this request");
        }
        return (Long) attr;
    }
}