package org.example.pet_social; // (or whatever your exact package is)

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class PetSocialApplication {

    public static void main(String[] args) {
        SpringApplication.run(PetSocialApplication.class, args);
    }

    // This explicitly creates the ObjectMapper bean so your TelemetryProducerService can use it
    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper();
    }
}

