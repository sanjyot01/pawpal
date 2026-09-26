package org.example.pet_social.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.pet_social.dto.AppEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

/**
 * Fire-and-forget publisher for the app-events topic (same JSON-string-payload
 * pattern as TelemetryProducerService). Failures are logged, never propagated —
 * a dropped notification must not fail the API call that produced it.
 */
@Service
public class AppEventsProducer {

    public static final String TOPIC = "app-events";

    private static final Logger log = LoggerFactory.getLogger(AppEventsProducer.class);

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    public AppEventsProducer(KafkaTemplate<String, String> kafkaTemplate, ObjectMapper objectMapper) {
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
    }

    public void publish(AppEvent event) {
        try {
            // Key by recipient so one user's events stay on one partition (ordered)
            kafkaTemplate.send(TOPIC, String.valueOf(event.recipientId()), objectMapper.writeValueAsString(event));
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize app event {}", event, e);
        } catch (Exception e) {
            log.warn("Failed to publish app event {} (broker down?)", event.type(), e);
        }
    }
}