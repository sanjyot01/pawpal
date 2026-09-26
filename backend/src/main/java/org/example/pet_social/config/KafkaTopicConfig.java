package org.example.pet_social.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

/**
 * Explicit topic definitions so partition counts are code-controlled instead of
 * broker auto-create defaults. The 2026-06-16 throughput session proved the
 * auto-created user-telemetry topic's single partition was the hard ceiling on
 * consumer parallelism (1 partition = max 1 consumer thread per group) — three
 * partitions let the batch listener actually fan out. KafkaAdmin grows the
 * partition count of an existing topic when it's lower; it never shrinks it.
 */
@Configuration
public class KafkaTopicConfig {

    @Bean
    public NewTopic userTelemetryTopic(@Value("${app.kafka.telemetry-partitions:3}") int partitions) {
        return TopicBuilder.name("user-telemetry")
                .partitions(partitions)
                .replicas(1)
                .build();
    }

    /** Low-volume domain events (notifications, cache invalidation) — one partition is plenty. */
    @Bean
    public NewTopic appEventsTopic() {
        return TopicBuilder.name("app-events")
                .partitions(1)
                .replicas(1)
                .build();
    }
}