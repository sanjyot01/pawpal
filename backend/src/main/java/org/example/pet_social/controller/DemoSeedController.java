package org.example.pet_social.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.example.pet_social.service.DemoSeedService;
import org.example.pet_social.web.JwtAuthFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Populates a fresh deployment with a demo-ready world (see {@link DemoSeedService}).
 *
 * Two locks, because this writes users and content:
 * <ul>
 *   <li>The bean only exists when app.demo-seed.enabled is true, and it defaults to false —
 *       unlike the load-generation endpoints, which default on and have to be switched off.</li>
 *   <li>It lives under /api/, so JwtAuthFilter requires a valid Bearer token. Register an
 *       account first, then seed with that account's token.</li>
 * </ul>
 */
@RestController
@ConditionalOnProperty(name = "app.demo-seed.enabled", havingValue = "true")
@RequestMapping("/api/demo")
public class DemoSeedController {

    private static final Logger log = LoggerFactory.getLogger(DemoSeedController.class);

    private final DemoSeedService demoSeedService;

    public DemoSeedController(DemoSeedService demoSeedService) {
        this.demoSeedService = demoSeedService;
    }

    /**
     * Seeds the world, once. Re-running is a no-op that reports the existing counts.
     *
     * lat/lon relocate the seeded city — pass the coordinates you will be demoing from, or
     * the partner feeds (bounded to app.discovery.max-radius-km) will have nothing to show
     * you. Omit them to keep the catalogue's Toronto placement.
     */
    @PostMapping("/seed")
    public ResponseEntity<DemoSeedService.SeedResult> seed(@RequestParam(required = false) Double lat,
                                                           @RequestParam(required = false) Double lon,
                                                           HttpServletRequest request) {
        if ((lat == null) != (lon == null)) {
            throw new IllegalArgumentException("lat and lon must be supplied together");
        }
        Long callerUserId = (Long) request.getAttribute(JwtAuthFilter.AUTH_USER_ID);
        log.info("Demo seed requested by user {} (centre lat={} lon={})", callerUserId, lat, lon);
        return ResponseEntity.ok(demoSeedService.seed(callerUserId, lat, lon));
    }

    @GetMapping("/seed/status")
    public Map<String, Object> status() {
        return Map.of(
                "seeded", demoSeedService.alreadySeeded(),
                "counts", demoSeedService.currentCounts(),
                "logins", demoSeedService.loginList());
    }
}
