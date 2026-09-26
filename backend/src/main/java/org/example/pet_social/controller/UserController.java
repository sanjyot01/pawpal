package org.example.pet_social.controller;

import jakarta.validation.Valid;
import org.example.pet_social.dto.AuthResponse;
import org.example.pet_social.dto.LoginRequest;
import org.example.pet_social.dto.SignupRequest;
import org.example.pet_social.entity.User;
import org.example.pet_social.service.AuthService;
import org.example.pet_social.service.JwtService;
import org.example.pet_social.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Legacy auth alias kept for the original frontend/src services; new clients
 * should use /api/auth (AuthController). Both share AuthService (BCrypt).
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;
    private final AuthService authService;
    private final JwtService jwtService;

    public UserController(UserService userService, AuthService authService, JwtService jwtService) {
        this.userService = userService;
        this.authService = authService;
        this.jwtService = jwtService;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> registerUser(@Valid @RequestBody SignupRequest req) {
        User user = authService.register(req.getName(), req.getEmail(), req.getPassword(),
                req.getRole(), req.isActive(), req.getMatchPreferencesMask());
        if (user == null) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(toResponse(user));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> loginUser(@RequestBody LoginRequest req) {
        User user = authService.login(req.getEmail(), req.getPassword());
        if (user == null) {
            return ResponseEntity.status(401).build();
        }
        return ResponseEntity.ok(toResponse(user));
    }

    @GetMapping("/{id}")
    public ResponseEntity<AuthResponse> getUser(@PathVariable Long id) {
        User user = userService.getUserById(id);
        if (user == null) return ResponseEntity.notFound().build();
        // Public profile lookup — never mint a token here (a token belongs only to the
        // authenticated owner, issued at login/register). Returning one would let anyone
        // impersonate any account via GET /api/users/{id}.
        return ResponseEntity.ok(profileResponse(user));
    }

    /** Login/register response: includes the caller's own freshly issued token. */
    private AuthResponse toResponse(User u) {
        return new AuthResponse(u.getId(), u.getName(), u.getEmail(), u.getRole(), u.isActive(),
                jwtService.issue(u.getId(), u.getEmail()));
    }

    /** Read-only profile view: identical shape, but without a token. */
    private AuthResponse profileResponse(User u) {
        return new AuthResponse(u.getId(), u.getName(), u.getEmail(), u.getRole(), u.isActive());
    }
}
