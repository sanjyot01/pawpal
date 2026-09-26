package org.example.pet_social.controller;

import org.example.pet_social.service.DashboardService;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Dashboard Controller
 * Provides dashboard UI and metrics endpoints
 */
@Controller
@RequestMapping("/dashboard")
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    /**
     * Serve the dashboard HTML page
     */
    @GetMapping
    public String getDashboard() {
        return "dashboard";
    }

    /**
     * Get dashboard metrics as JSON (for AJAX calls)
     */
    @GetMapping("/api/metrics")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> getMetrics() {
        return ResponseEntity.ok(dashboardService.getDashboardMetrics());
    }

    /**
     * Reset all metrics (for demo purposes)
     */
    @PostMapping("/api/reset")
    @ResponseBody
    public ResponseEntity<Map<String, String>> resetMetrics() {
        dashboardService.resetMetrics();
        return ResponseEntity.ok(Map.of("status", "Metrics reset successfully"));
    }
}

