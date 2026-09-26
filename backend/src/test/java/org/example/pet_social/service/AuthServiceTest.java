package org.example.pet_social.service;

import org.example.pet_social.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.security.MessageDigest;
import java.util.HexFormat;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class AuthServiceTest {

    private UserService userService;
    private UserRegistryService userRegistryService;
    private LoginRateLimiter rateLimiter;
    private AuthService authService;

    @BeforeEach
    void setUp() {
        userService = mock(UserService.class);
        userRegistryService = mock(UserRegistryService.class);
        rateLimiter = mock(LoginRateLimiter.class);
        when(rateLimiter.checkAccount(anyString())).thenReturn(LoginRateLimiter.Decision.ALLOWED);
        // registerUser echoes back the user it was given, like the real registry does
        when(userRegistryService.registerUser(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
        authService = new AuthService(userService, userRegistryService, rateLimiter);
    }

    @Test
    void registerStoresLowercasedEmailAndBcryptHash() {
        when(userService.getUserByEmail("mixed.case@example.com")).thenReturn(null);

        User created = authService.register("Name", "  Mixed.Case@Example.COM ", "secret123", null, true, null);

        assertNotNull(created);
        assertEquals("mixed.case@example.com", created.getEmail());
        assertTrue(created.getPasswordHash().startsWith("$2"), "password must be BCrypt-hashed");
        assertTrue(new BCryptPasswordEncoder().matches("secret123", created.getPasswordHash()));
        assertEquals("PET_OWNER", created.getRole());
    }

    @Test
    void registerRejectsDuplicateEmailInAnyCasing() {
        when(userService.getUserByEmail("taken@example.com")).thenReturn(new User("X", "taken@example.com", "PET_OWNER", true));

        assertNull(authService.register("Y", "TAKEN@example.com", "secret123", null, true, null));
        verify(userRegistryService, never()).registerUser(any());
    }

    @Test
    void loginAcceptsCorrectPasswordAndRejectsWrongOne() {
        User user = new User("N", "u@example.com", "PET_OWNER", true);
        user.setPasswordHash(new BCryptPasswordEncoder().encode("right-pass"));
        when(userService.getUserByEmail("u@example.com")).thenReturn(user);

        assertSame(user, authService.login("u@example.com", "right-pass"));
        assertNull(authService.login("u@example.com", "wrong-pass"));
    }

    @Test
    void loginUpgradesLegacySha256HashToBcrypt() throws Exception {
        User user = new User("N", "legacy@example.com", "PET_OWNER", true);
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        user.setPasswordHash(HexFormat.of().formatHex(md.digest("oldpass".getBytes())));
        when(userService.getUserByEmail("legacy@example.com")).thenReturn(user);

        assertSame(user, authService.login("legacy@example.com", "oldpass"));
        assertTrue(user.getPasswordHash().startsWith("$2"), "hash must be upgraded to BCrypt on login");
        verify(userService).registerUser(user); // upgraded hash persisted
        assertNull(authService.login("legacy@example.com", "not-oldpass"));
    }

    @Test
    void loginReturnsNullForUnknownUserOrPasswordlessGoogleAccount() {
        when(userService.getUserByEmail("nobody@example.com")).thenReturn(null);
        assertNull(authService.login("nobody@example.com", "x"));

        User googleOnly = new User("G", "google@example.com", "PET_OWNER", true);
        when(userService.getUserByEmail("google@example.com")).thenReturn(googleOnly);
        assertNull(authService.login("google@example.com", "anything"));
    }

    @Test
    void loginCountsFailuresAndClearsThemOnSuccess() {
        User user = new User("N", "rl@example.com", "PET_OWNER", true);
        user.setPasswordHash(new BCryptPasswordEncoder().encode("right-pass"));
        when(userService.getUserByEmail("rl@example.com")).thenReturn(user);

        assertNull(authService.login("rl@example.com", "wrong-pass"));
        verify(rateLimiter).recordFailedAttempt("rl@example.com");

        assertSame(user, authService.login("rl@example.com", "right-pass"));
        verify(rateLimiter).recordSuccessfulAttempt("rl@example.com");
    }

    @Test
    void loginCountsAttemptsAgainstUnknownAccountsToo() {
        when(userService.getUserByEmail("ghost@example.com")).thenReturn(null);

        assertNull(authService.login("ghost@example.com", "x"));

        // Otherwise probing for which emails are registered costs an attacker nothing
        verify(rateLimiter).recordFailedAttempt("ghost@example.com");
    }

    @Test
    void loginRejectsWithTooManyRequestsOnceTheAccountBudgetIsSpent() {
        when(rateLimiter.checkAccount("locked@example.com"))
                .thenReturn(new LoginRateLimiter.Decision(false, 42L));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> authService.login("locked@example.com", "any-pass"));

        assertEquals(HttpStatus.TOO_MANY_REQUESTS.value(), ex.getStatusCode().value());
        assertTrue(ex.getReason().contains("42"), "the caller is told how long to wait");
        // The throttle must short-circuit before the expensive part, or it defends nothing
        verify(userService, never()).getUserByEmail(anyString());
    }

    @Test
    void findOrCreateGoogleUserNormalizesEmailAndReusesExistingAccount() {
        User existing = new User("E", "who@example.com", "PET_OWNER", true);
        when(userService.getUserByEmail("who@example.com")).thenReturn(existing);

        assertSame(existing, authService.findOrCreateGoogleUser("Who@Example.com", "Who", null));

        when(userService.getUserByEmail("new@example.com")).thenReturn(null);
        User created = authService.findOrCreateGoogleUser("NEW@example.com", "New", "http://pic");
        assertEquals("new@example.com", created.getEmail());
        assertEquals("http://pic", created.getAvatarUrl());
    }
}
