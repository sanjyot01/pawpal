package org.example.pet_social.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.example.pet_social.entity.User;
import org.example.pet_social.service.AuthService;
import org.example.pet_social.service.GoogleAuthService;
import org.example.pet_social.service.JwtService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Auth contract the mobile app codes against (see frontend/mobile LoginScreen /
 * SignUpScreen): POST /api/auth/register|login → { token, userId, name, email }.
 * /api/users/register|login remain as backward-compatible aliases.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    public record RegisterBody(
            @NotBlank(message = "Name is required") String name,
            @NotBlank(message = "Email is required") @Email(message = "Email should be valid") String email,
            @NotBlank(message = "Password is required") @Size(min = 6, message = "Password must be at least 6 characters") String password,
            String role
    ) {}

    public record LoginBody(
            @NotBlank(message = "Email is required") String email,
            @NotBlank(message = "Password is required") String password
    ) {}

    public record GoogleBody(@NotBlank(message = "idToken is required") String idToken) {}

    private final AuthService authService;
    private final JwtService jwtService;
    private final GoogleAuthService googleAuthService;

    public AuthController(AuthService authService, JwtService jwtService, GoogleAuthService googleAuthService) {
        this.authService = authService;
        this.jwtService = jwtService;
        this.googleAuthService = googleAuthService;
    }

    @PostMapping("/register")
    public ResponseEntity<Object> register(@Valid @RequestBody RegisterBody body) {
        User user = authService.register(body.name(), body.email(), body.password(), body.role(), true, 0L);
        if (user == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "An account with this email already exists."));
        }
        return ResponseEntity.ok(tokenResponse(user));
    }

    @PostMapping("/login")
    public ResponseEntity<Object> login(@Valid @RequestBody LoginBody body) {
        User user = authService.login(body.email(), body.password());
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("message", "Invalid email or password"));
        }
        return ResponseEntity.ok(tokenResponse(user));
    }

    /** Google Sign-In: verify the ID token, find-or-create the account, issue an app JWT. */
    @PostMapping("/google")
    public ResponseEntity<Object> google(@Valid @RequestBody GoogleBody body) {
        return googleAuthService.verify(body.idToken())
                .<ResponseEntity<Object>>map(identity -> {
                    User user = authService.findOrCreateGoogleUser(identity.email(), identity.name(), identity.pictureUrl());
                    return ResponseEntity.ok(tokenResponse(user));
                })
                .orElseGet(() -> ResponseEntity.status(401).body(Map.of("message", "Invalid Google ID token")));
    }

    private Map<String, Object> tokenResponse(User user) {
        return Map.of(
                "token", jwtService.issue(user.getId(), user.getEmail()),
                "userId", user.getId(),
                "name", user.getName(),
                "email", user.getEmail(),
                "role", user.getRole()
        );
    }
}
