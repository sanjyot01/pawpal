package org.example.pet_social.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.example.pet_social.entity.DeviceToken;
import org.example.pet_social.entity.Notification;
import org.example.pet_social.repository.DeviceTokenRepository;
import org.example.pet_social.repository.NotificationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Delivers a saved {@link Notification} to the user's Android/iOS devices via the
 * Expo push service (which fronts FCM, so Android delivery follows FCM semantics).
 *
 * Called from the Kafka app-events consumer, never from a request thread — a push
 * round-trip must not sit inside an API call, and a push failure must never fail
 * the action that triggered it.
 *
 * Android specifics this handles:
 * - channelId per category, required since Android 8 (Oreo). A channel the app has
 *   not created is dropped silently by the OS, so these ids must match the ones the
 *   client registers via expo-notifications.
 * - priority "high" only for conversational/actionable categories. Marking everything
 *   high is what gets an app throttled by FCM and flagged by Android vitals.
 * - ttl so a stale "someone messaged you" doesn't surface hours later after doze.
 * - data payload carrying relatedType/relatedId so a tap deep-links to the right
 *   screen instead of the app's home.
 */
@Service
public class PushNotificationService {

    private static final Logger log = LoggerFactory.getLogger(PushNotificationService.class);

    /** Expo caps a single push request at 100 messages. */
    private static final int MAX_BATCH = 100;

    private final DeviceTokenRepository deviceTokenRepository;
    private final NotificationRepository notificationRepository;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final boolean enabled;
    private final Counter sentCounter;
    private final Counter failedCounter;
    private final Counter prunedCounter;

    public PushNotificationService(DeviceTokenRepository deviceTokenRepository,
                                   NotificationRepository notificationRepository,
                                   ObjectMapper objectMapper,
                                   MeterRegistry meterRegistry,
                                   @Value("${app.push.enabled:true}") boolean enabled,
                                   @Value("${app.push.expo-url:https://exp.host/--/api/v2/push/send}") String expoUrl,
                                   @Value("${app.push.access-token:}") String accessToken,
                                   @Value("${app.push.connect-timeout-ms:3000}") int connectTimeoutMs,
                                   @Value("${app.push.read-timeout-ms:10000}") int readTimeoutMs) {
        this.deviceTokenRepository = deviceTokenRepository;
        this.notificationRepository = notificationRepository;
        this.objectMapper = objectMapper;
        this.enabled = enabled;

        // Explicit timeouts: this runs on the Kafka consumer thread, so an unresponsive
        // push service would otherwise stall notification processing indefinitely.
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(connectTimeoutMs);
        requestFactory.setReadTimeout(readTimeoutMs);

        RestClient.Builder builder = RestClient.builder()
                .baseUrl(expoUrl)
                .requestFactory(requestFactory);
        // Only required once an Expo project enables enhanced push security; harmless otherwise.
        if (!accessToken.isBlank()) {
            builder = builder.defaultHeader("Authorization", "Bearer " + accessToken);
        }
        this.restClient = builder.build();

        this.sentCounter = Counter.builder("push.notifications.sent")
                .description("Push messages accepted by the push service")
                .register(meterRegistry);
        this.failedCounter = Counter.builder("push.notifications.failed")
                .description("Push messages the push service rejected")
                .register(meterRegistry);
        this.prunedCounter = Counter.builder("push.notifications.tokens.pruned")
                .description("Device tokens deactivated after the push service reported them dead")
                .register(meterRegistry);
    }

    /** Fire-and-forget: logs and swallows everything, including a push service outage.
     *  Deliberately not @Transactional — that would pin a Hikari connection for the whole
     *  push round-trip; the only write (token pruning) carries its own transaction. */
    public void send(Notification notification) {
        if (!enabled || notification == null || notification.getRecipientId() == null) {
            return;
        }
        try {
            List<DeviceToken> targets = deviceTokenRepository.findByUser_IdAndActiveTrue(notification.getRecipientId());
            if (targets.isEmpty()) {
                return; // user never registered a device, or uninstalled everywhere
            }

            long badge = notificationRepository.countByRecipient_IdAndIsReadFalse(notification.getRecipientId());
            List<Map<String, Object>> messages = new ArrayList<>(targets.size());
            for (DeviceToken target : targets) {
                messages.add(buildMessage(target, notification, badge));
            }

            for (int start = 0; start < messages.size(); start += MAX_BATCH) {
                List<Map<String, Object>> chunk = messages.subList(start, Math.min(start + MAX_BATCH, messages.size()));
                dispatch(chunk, targets.subList(start, start + chunk.size()));
            }
        } catch (Exception e) {
            log.warn("Push delivery failed for notification {}", notification.getId(), e);
            failedCounter.increment();
        }
    }

    private Map<String, Object> buildMessage(DeviceToken target, Notification n, long badge) {
        String category = n.getCategory() == null ? "MESSAGE" : n.getCategory();

        Map<String, Object> data = new HashMap<>();
        data.put("notificationId", String.valueOf(n.getId()));
        data.put("category", category);
        if (n.getRelatedType() != null) {
            data.put("relatedType", n.getRelatedType());
            data.put("relatedId", n.getRelatedId());
        }

        Map<String, Object> message = new HashMap<>();
        message.put("to", target.getToken());
        message.put("title", titleFor(category, n.getSenderName()));
        message.put("body", n.getPreview());
        message.put("data", data);
        message.put("sound", "default");
        message.put("badge", badge);
        message.put("channelId", channelFor(category));
        message.put("priority", highPriority(category) ? "high" : "default");
        message.put("ttl", ttlFor(category).toSeconds());
        return message;
    }

    private void dispatch(List<Map<String, Object>> chunk, List<DeviceToken> chunkTargets) throws Exception {
        // Read the body as a String and parse with the app's ObjectMapper rather than
        // asking RestClient to bind straight to JsonNode: the bare RestClient's default
        // converters can't build a JsonNode deserializer here, and this mirrors how the
        // Kafka producer/consumer already handle JSON in this codebase.
        String raw = restClient.post()
                .contentType(MediaType.APPLICATION_JSON)
                .body(chunk)
                .retrieve()
                .body(String.class);

        JsonNode response = raw == null ? null : objectMapper.readTree(raw);
        if (response == null || !response.has("data")) {
            failedCounter.increment(chunk.size());
            return;
        }

        // Expo returns one receipt per message, positionally aligned with the request.
        JsonNode receipts = response.get("data");
        List<String> dead = new ArrayList<>();
        for (int i = 0; i < receipts.size() && i < chunkTargets.size(); i++) {
            JsonNode receipt = receipts.get(i);
            if ("ok".equals(receipt.path("status").asText())) {
                sentCounter.increment();
                continue;
            }
            failedCounter.increment();
            String error = receipt.path("details").path("error").asText("");
            // The app was uninstalled or the token rotated; it will never deliver again.
            if ("DeviceNotRegistered".equals(error)) {
                dead.add(chunkTargets.get(i).getToken());
            } else {
                log.warn("Push rejected: {}", receipt.path("message").asText(""));
            }
        }

        if (!dead.isEmpty()) {
            prunedCounter.increment(deviceTokenRepository.deactivateTokens(dead));
        }
    }

    /** Must match the channels the client creates with expo-notifications. */
    private String channelFor(String category) {
        return switch (category) {
            case "MESSAGE" -> "messages";
            case "WALK_REQUEST", "BLIND_DATE", "INVITATION" -> "requests";
            default -> "social";
        };
    }

    private boolean highPriority(String category) {
        // Someone waiting on a reply justifies waking the device; a like does not.
        return switch (category) {
            case "MESSAGE", "WALK_REQUEST", "BLIND_DATE", "INVITATION" -> true;
            default -> false;
        };
    }

    private Duration ttlFor(String category) {
        // A walk invite is worthless tomorrow morning; a match or review still reads fine.
        return switch (category) {
            case "MESSAGE" -> Duration.ofHours(4);
            case "WALK_REQUEST", "BLIND_DATE", "INVITATION" -> Duration.ofHours(6);
            default -> Duration.ofDays(1);
        };
    }

    private String titleFor(String category, String senderName) {
        String who = senderName == null || senderName.isBlank() ? "Someone" : senderName;
        return switch (category) {
            case "MESSAGE" -> who;
            case "WALK_REQUEST" -> "Walk request";
            case "BLIND_DATE" -> "Pet blind date";
            case "INVITATION" -> "New invitation";
            case "MATCH" -> "It's a match!";
            case "REVIEW" -> "New review";
            case "MARKETPLACE" -> "Marketplace";
            default -> "PawPal";
        };
    }
}
