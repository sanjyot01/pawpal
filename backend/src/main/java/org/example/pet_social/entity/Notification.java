package org.example.pet_social.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * In-app notification feed item. Sender/pet display fields are denormalized
 * snapshots: a notification records what was true at send time and must not
 * change if the sender later renames themselves or their pet.
 */
@Entity
@Table(name = "notifications", indexes = {
    @Index(name = "idx_notifications_recipient", columnList = "recipient_id,created_at"),
    @Index(name = "idx_notifications_unread", columnList = "recipient_id,is_read")
})
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "notifications_seq")
    @SequenceGenerator(name = "notifications_seq", sequenceName = "notifications_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipient_id", nullable = false, foreignKey = @ForeignKey(name = "fk_notifications_recipient"))
    private User recipient;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id", foreignKey = @ForeignKey(name = "fk_notifications_sender"))
    private User sender; // nullable: system notifications have no sender

    @Column(nullable = false)
    private String category; // BLIND_DATE, WALK_REQUEST, MESSAGE, LIKE, INVITATION, MATCH, REVIEW, MARKETPLACE

    @Column(name = "sender_name")
    private String senderName;

    @Column(name = "pet_name")
    private String petName;

    @Column(name = "pet_emoji", length = 8)
    private String petEmoji;

    @Column(length = 500, nullable = false)
    private String preview;

    // Deep link: what tapping the notification should open (MATCH, EVENT, MESSAGE, PET, LISTING)
    @Column(name = "related_type")
    private String relatedType;

    @Column(name = "related_id")
    private Long relatedId;

    @Column(name = "is_read", nullable = false)
    private Boolean isRead = false;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        if (this.isRead == null) {
            this.isRead = false;
        }
    }

    public Notification() {}

    public Notification(User recipient, String category, String preview) {
        this.recipient = recipient;
        this.category = category;
        this.preview = preview;
    }

    public Long getId() { return id; }

    public User getRecipient() { return recipient; }
    public void setRecipient(User recipient) { this.recipient = recipient; }
    public Long getRecipientId() { return recipient != null ? recipient.getId() : null; }

    public User getSender() { return sender; }
    public void setSender(User sender) { this.sender = sender; }
    public Long getSenderId() { return sender != null ? sender.getId() : null; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getSenderName() { return senderName; }
    public void setSenderName(String senderName) { this.senderName = senderName; }

    public String getPetName() { return petName; }
    public void setPetName(String petName) { this.petName = petName; }

    public String getPetEmoji() { return petEmoji; }
    public void setPetEmoji(String petEmoji) { this.petEmoji = petEmoji; }

    public String getPreview() { return preview; }
    public void setPreview(String preview) { this.preview = preview; }

    public String getRelatedType() { return relatedType; }
    public void setRelatedType(String relatedType) { this.relatedType = relatedType; }

    public Long getRelatedId() { return relatedId; }
    public void setRelatedId(Long relatedId) { this.relatedId = relatedId; }

    public void setRelated(String relatedType, Long relatedId) {
        this.relatedType = relatedType;
        this.relatedId = relatedId;
    }

    public Boolean getIsRead() { return isRead; }
    public void setIsRead(Boolean isRead) { this.isRead = isRead; }

    public LocalDateTime getCreatedAt() { return createdAt; }
}
