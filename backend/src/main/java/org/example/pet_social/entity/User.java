package org.example.pet_social.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "users", indexes = {
    @Index(name = "idx_users_role", columnList = "role")
})
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "users_seq")
    @SequenceGenerator(name = "users_seq", sequenceName = "users_seq", allocationSize = 50)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(nullable = false)
    private String role; // e.g., PET_OWNER, PET_SITTER, VET, BUSINESS

    @Column(name = "is_active", nullable = false)
    private boolean isActive; // True if account is active and available for connections

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    // Profile fields shown on the Me tab of the mobile app (see /api/users/me)
    @Column(length = 1000)
    private String bio;

    @Column
    private String location;

    @Column(name = "avatar_url")
    private String avatarUrl;

    // Bitmask of walking-partner matching preferences (e.g. accepts large dogs, walks at night).
    // Consumed by MatchingService when filtering candidates.
    @Column(name = "match_preferences_mask")
    private Long matchPreferencesMask = 0L;

    public Long getMatchPreferencesMask() { return matchPreferencesMask; }
    public void setMatchPreferencesMask(Long matchPreferencesMask) { this.matchPreferencesMask = matchPreferencesMask; }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    // Default constructor required by JPA
    public User() {}

    public User(String name, String email, String role, boolean isActive) {
        this.name = name;
        this.email = email;
        this.role = role;
        this.isActive = isActive;
    }

    // Getters and Setters
    public Long getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public boolean isActive() { return isActive; }
    public void setActive(boolean active) { isActive = active; }

    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }

    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }

    public LocalDateTime getCreatedAt() { return createdAt; }
}