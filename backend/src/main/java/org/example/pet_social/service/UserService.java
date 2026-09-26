package org.example.pet_social.service;

import org.example.pet_social.entity.User;
import org.example.pet_social.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class UserService {

    private final UserRepository userRepository;

    // Constructor Injection (Best practice for Spring Boot)
    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public User registerUser(User user) {
        // Here is where we would add logic later, like validating email format and role
        return userRepository.save(user);
    }

    public User getUserById(Long id) {
        return userRepository.findById(id).orElse(null);
    }

    /**
     * Email lookup is case-insensitive: gmail treats Sanjyot@ and sanjyot@ as the
     * same inbox, and case-sensitive matching let one person register twice. If
     * legacy case-variant duplicate rows exist, the oldest account wins so people
     * keep the account they created first.
     */
    public User getUserByEmail(String email) {
        if (email == null || email.isBlank()) {
            return null;
        }
        List<User> matches = userRepository.findByEmailIgnoreCaseOrderByIdAsc(email.trim());
        return matches.isEmpty() ? null : matches.get(0);
    }
}

