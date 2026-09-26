package org.example.pet_social.controller;



import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system")
public class HealthController {

    @GetMapping("/health")
    public ResponseEntity<String> systemHealthCheck() {
        return ResponseEntity.ok("Pet Social Backend is LIVE and routing traffic.");
    }
}
