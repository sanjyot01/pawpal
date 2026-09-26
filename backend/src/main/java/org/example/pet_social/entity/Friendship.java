package org.example.pet_social.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "friendships",
    uniqueConstraints = {
        @UniqueConstraint(columnNames = {"user_id", "friend_id"})
    },
    indexes = {
        @Index(name = "idx_friendships_user", columnList = "user_id,status"),
        @Index(name = "idx_friendships_friend", columnList = "friend_id,status")
    })
public class Friendship {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "friendships_seq")
    @SequenceGenerator(name = "friendships_seq", sequenceName = "friendships_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, foreignKey = @ForeignKey(name = "fk_friendships_user"))
    private User user; // User who initiated or is part of the friendship

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "friend_id", nullable = false, foreignKey = @ForeignKey(name = "fk_friendships_friend"))
    private User friend; // The other user in the friendship

    @Column(nullable = false)
    private String status; // PENDING, ACCEPTED, BLOCKED

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    // Default constructor
    public Friendship() {}

    // Constructor with essential fields
    public Friendship(User user, User friend, String status) {
        this.user = user;
        this.friend = friend;
        this.status = status;
    }

    // Getters and Setters
    public Long getId() { return id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Long getUserId() { return user != null ? user.getId() : null; }

    public User getFriend() { return friend; }
    public void setFriend(User friend) { this.friend = friend; }
    public Long getFriendId() { return friend != null ? friend.getId() : null; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
