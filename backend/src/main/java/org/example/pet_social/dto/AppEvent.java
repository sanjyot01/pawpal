package org.example.pet_social.dto;

/**
 * Domain event published to the {@code app-events} Kafka topic so side effects
 * (notification rows, cache invalidation) happen off the request hot path.
 * Keyed by recipientId so one user's events stay ordered.
 */
public record AppEvent(
        String type,       // MESSAGE_SENT | WALK_REQUEST_CREATED | DATE_REQUEST_CREATED | REQUEST_STATUS_CHANGED
        Long actorId,      // who caused it (sender/requester/host)
        Long recipientId,  // whose feed it lands in
        String refType,    // deep-link type stored on the notification (MESSAGE, PARTNER_REQUEST, ...)
        Long refId,        // deep-link id (message id, partner request id, ...)
        String text        // preview text
) {
    public static final String MESSAGE_SENT = "MESSAGE_SENT";
    public static final String WALK_REQUEST_CREATED = "WALK_REQUEST_CREATED";
    public static final String DATE_REQUEST_CREATED = "DATE_REQUEST_CREATED";
    public static final String REQUEST_STATUS_CHANGED = "REQUEST_STATUS_CHANGED";
}