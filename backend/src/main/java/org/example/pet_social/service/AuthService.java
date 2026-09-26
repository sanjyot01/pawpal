package org.example.pet_social.service;

import org.example.pet_social.entity.User;
import org.example.pet_social.web.TooManyAttemptsException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;

/**
 * Registration/login with BCrypt hashing. Accounts created before 2026-07-02
 * hold unsalted SHA-256 hashes; login accepts those once and transparently
 * re-hashes to BCrypt on success, so the legacy path shrinks over time.
 */
@Service
public class AuthService {

    private final UserService userService;
    private final UserRegistryService userRegistryService;
    private final LoginRateLimiter rateLimiter;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public AuthService(UserService userService, UserRegistryService userRegistryService, LoginRateLimiter rateLimiter) {
        this.userService = userService;
        this.userRegistryService = userRegistryService;
        this.rateLimiter = rateLimiter;
    }

    /** Returns the created user, or null if the email is already taken (any casing). */
    public User register(String name, String email, String password, String role, boolean active, Long matchPreferencesMask) {
        email = normalizeEmail(email);
        if (userService.getUserByEmail(email) != null) {
            return null;
        }
        User user = new User(name, email, role == null || role.isBlank() ? "PET_OWNER" : role, active);
        user.setPasswordHash(encoder.encode(password));
        user.setMatchPreferencesMask(matchPreferencesMask == null ? 0L : matchPreferencesMask);
        return userRegistryService.registerUser(user);
    }

    /**
     * Google Sign-In: reuse the account matching the verified email, or create
     * one (no password — such accounts can only sign in via Google until the
     * user sets one). Fills avatarUrl from the Google picture if still empty.
     */
    public User findOrCreateGoogleUser(String email, String name, String pictureUrl) {
        email = normalizeEmail(email);
        User existing = userService.getUserByEmail(email);
        if (existing != null) {
            if (existing.getAvatarUrl() == null && pictureUrl != null) {
                existing.setAvatarUrl(pictureUrl);
                userService.registerUser(existing);
            }
            return existing;
        }
        User user = new User(name, email, "PET_OWNER", true);
        user.setAvatarUrl(pictureUrl);
        user.setMatchPreferencesMask(0L);
        return userRegistryService.registerUser(user);
    }

    /**
     * Returns the user on valid credentials, else null.
     *
     * Failed attempts are counted per account so a password spray spread across many source
     * addresses still runs into a wall — LoginRateLimitFilter only sees one IP at a time.
     * Exceeding the budget throws 429 rather than returning null, so the caller can tell
     * "wrong password" apart from "stop trying"; a correct password clears the count.
     */
    public User login(String email, String password) {
        LoginRateLimiter.Decision decision = rateLimiter.checkAccount(email);
        if (!decision.allowed()) {
            throw new TooManyAttemptsException(
                    "Too many failed sign-in attempts for this account. Try again in "
                            + decision.retryAfterSeconds() + " seconds.",
                    decision.retryAfterSeconds());
        }

        User user = userService.getUserByEmail(email);
        if (user == null || user.getPasswordHash() == null) {
            // Counted like any other failure: without this, probing for which addresses exist
            // is free, and a spray against unregistered emails never trips the limit.
            rateLimiter.recordFailedAttempt(email);
            return null;
        }
        String stored = user.getPasswordHash();
        if (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$")) {
            return encoder.matches(password, stored) ? loginSucceeded(user) : loginFailed(email);
        }
        // Legacy unsalted SHA-256 hash: verify, then upgrade to BCrypt
        if (sha256Hex(password).equals(stored)) {
            user.setPasswordHash(encoder.encode(password));
            userService.registerUser(user); // save() — updates the existing row
            return loginSucceeded(user);
        }
        return loginFailed(email);
    }

    private User loginSucceeded(User user) {
        rateLimiter.recordSuccessfulAttempt(user.getEmail());
        return user;
    }

    private User loginFailed(String email) {
        rateLimiter.recordFailedAttempt(email);
        return null;
    }

    /** Emails are matched and stored case-insensitively (lowercased on write). */
    private String normalizeEmail(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    private String sha256Hex(String password) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(password.getBytes()));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
