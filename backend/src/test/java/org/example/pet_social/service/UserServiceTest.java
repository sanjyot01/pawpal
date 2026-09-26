package org.example.pet_social.service;

import org.example.pet_social.entity.User;
import org.example.pet_social.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class UserServiceTest {

    private UserRepository userRepository;
    private UserService userService;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        userService = new UserService(userRepository);
    }

    @Test
    void getUserByEmailTrimsInputAndMatchesCaseInsensitively() {
        User user = new User("N", "a@b.com", "PET_OWNER", true);
        when(userRepository.findByEmailIgnoreCaseOrderByIdAsc("A@B.com")).thenReturn(List.of(user));

        assertSame(user, userService.getUserByEmail("  A@B.com  "));
    }

    @Test
    void getUserByEmailReturnsOldestWhenLegacyDuplicatesExist() {
        User older = new User("Old", "dup@x.com", "PET_OWNER", true);
        User newer = new User("New", "Dup@x.com", "PET_OWNER", true);
        // repository orders by id ascending — oldest account first
        when(userRepository.findByEmailIgnoreCaseOrderByIdAsc("dup@x.com")).thenReturn(List.of(older, newer));

        assertSame(older, userService.getUserByEmail("dup@x.com"));
    }

    @Test
    void getUserByEmailHandlesBlankAndMissing() {
        assertNull(userService.getUserByEmail(null));
        assertNull(userService.getUserByEmail("   "));
        when(userRepository.findByEmailIgnoreCaseOrderByIdAsc("none@x.com")).thenReturn(List.of());
        assertNull(userService.getUserByEmail("none@x.com"));
    }
}
