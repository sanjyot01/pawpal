package org.example.pet_social.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * A push target: one Expo/FCM token belonging to one installation of the app.
 *
 * The token — not the user — is the identity here. A user can have several
 * (phone + tablet), and the same physical device can move between accounts when
 * someone logs out and a colleague logs in, which is why registering a token
 * that already exists reassigns its owner instead of inserting a duplicate.
 * Push services reject tokens after an uninstall, so {@link #active} is flipped
 * off rather than the row deleted, keeping delivery history interpretable.
 */
@Entity
@Table(name = "device_tokens",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_device_tokens_token", columnNames = "token")
    },
    indexes = {
        @Index(name = "idx_device_tokens_user", columnList = "user_id,active")
    })
public class DeviceToken {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "device_tokens_seq")
    @SequenceGenerator(name = "device_tokens_seq", sequenceName = "device_tokens_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, foreignKey = @ForeignKey(name = "fk_device_tokens_user"))
    private User user;

    /** Expo push token ("ExponentPushToken[...]") or a raw FCM registration token. */
    @Column(nullable = false, length = 512)
    private String token;

    @Column(nullable = false, length = 16)
    private String platform; // ANDROID | IOS

    @Column(nullable = false)
    private Boolean active = true;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    /** Refreshed on every re-registration, so stale installs are identifiable. */
    @Column(name = "last_seen_at")
    private LocalDateTime lastSeenAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.lastSeenAt = this.createdAt;
        if (this.active == null) {
            this.active = true;
        }
    }

    public DeviceToken() {}

    public DeviceToken(User user, String token, String platform) {
        this.user = user;
        this.token = token;
        this.platform = platform;
    }

    public Long getId() { return id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Long getUserId() { return user != null ? user.getId() : null; }

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }

    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }

    public Boolean getActive() { return active; }
    public void setActive(Boolean active) { this.active = active; }

    public LocalDateTime getCreatedAt() { return createdAt; }

    public LocalDateTime getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(LocalDateTime lastSeenAt) { this.lastSeenAt = lastSeenAt; }
}
