package org.example.pet_social.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.pet_social.dto.AppEvent;
import org.example.pet_social.entity.Notification;
import org.example.pet_social.entity.User;
import org.example.pet_social.repository.NotificationRepository;
import org.example.pet_social.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Consumes app-events and materializes the side effects that used to run
 * synchronously inside request handlers: legacy notification-feed rows and
 * Redis unread-count invalidation. Batch listener because the app's global
 * Kafka listener type is batch (see application.yml).
 */
@Service
public class AppEventsConsumer {

    private static final Logger log = LoggerFactory.getLogger(AppEventsConsumer.class);

    private final ObjectMapper objectMapper;
    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final UnreadCountService unreadCountService;
    private final PushNotificationService pushNotificationService;

    public AppEventsConsumer(ObjectMapper objectMapper,
                             NotificationRepository notificationRepository,
                             UserRepository userRepository,
                             UnreadCountService unreadCountService,
                             PushNotificationService pushNotificationService) {
        this.objectMapper = objectMapper;
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
        this.unreadCountService = unreadCountService;
        this.pushNotificationService = pushNotificationService;
    }

    @KafkaListener(topics = AppEventsProducer.TOPIC, groupId = "app-events-group", concurrency = "1")
    public void consume(List<String> messages) {
        for (String message : messages) {
            try {
                handle(objectMapper.readValue(message, AppEvent.class));
            } catch (Exception e) {
                log.error("Failed to process app event: {}", message, e);
            }
        }
    }

    private void handle(AppEvent event) {
        User recipient = userRepository.findById(event.recipientId()).orElse(null);
        if (recipient == null) {
            return;
        }
        User actor = event.actorId() == null ? null : userRepository.findById(event.actorId()).orElse(null);

        Notification n = new Notification(recipient, categoryFor(event.type()), event.text());
        if (actor != null) {
            n.setSender(actor);
            n.setSenderName(actor.getName());
        }
        n.setRelated(event.refType(), event.refId());
        notificationRepository.save(n);

        // A new message changes the recipient's unread badge; drop the cached counts
        if (AppEvent.MESSAGE_SENT.equals(event.type())) {
            unreadCountService.invalidate(event.recipientId());
        }

        // Deliver to the device. Runs here rather than in the request handler so the push
        // round-trip stays off the API's critical path; it swallows its own failures.
        pushNotificationService.send(n);
    }

    private String categoryFor(String eventType) {
        return switch (eventType) {
            case AppEvent.MESSAGE_SENT -> "MESSAGE";
            case AppEvent.WALK_REQUEST_CREATED -> "WALK_REQUEST";
            case AppEvent.DATE_REQUEST_CREATED -> "BLIND_DATE";
            case AppEvent.REQUEST_STATUS_CHANGED -> "MATCH";
            default -> "MESSAGE";
        };
    }
}