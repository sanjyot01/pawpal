package org.example.pet_social.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.example.pet_social.entity.UserLocation;
import org.example.pet_social.service.TelemetryProducerService;
import org.example.pet_social.web.JwtAuthFilter;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/telemetry")
public class TelemetryController {

    private final TelemetryProducerService producerService;

    public TelemetryController(TelemetryProducerService producerService) {
        this.producerService = producerService;
    }

    // This endpoint handles continuous user location pings
    @PostMapping("/location")
    public ResponseEntity<String> updateLocation(@RequestBody UserLocation location, HttpServletRequest request) {
        // Identity comes from the verified JWT, never the request body — a client can
        // only ever report its own position, not spoof another user's.
        Long authUserId = (Long) request.getAttribute(JwtAuthFilter.AUTH_USER_ID);
        producerService.sendLocation(new UserLocation(authUserId, location.latitude(), location.longitude()));

        // We return a 202 Accepted status because we have accepted the data into the broker,
        // but haven't necessarily finished routing it in the database yet.
        return ResponseEntity.accepted().body("Telemetry queued in Kafka");
    }
}
