package org.example.pet_social.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "messages", indexes = {
    @Index(name = "idx_sender_receiver", columnList = "sender_id,receiver_id"),
    @Index(name = "idx_receiver_read", columnList = "receiver_id,is_read"),
    @Index(name = "idx_messages_conversation", columnList = "sender_id,receiver_id,created_at"),
    @Index(name = "idx_messages_context", columnList = "context_type,context_id")
})
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "messages_seq")
    @SequenceGenerator(name = "messages_seq", sequenceName = "messages_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id", nullable = false, foreignKey = @ForeignKey(name = "fk_messages_sender"))
    private User sender;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "receiver_id", nullable = false, foreignKey = @ForeignKey(name = "fk_messages_receiver"))
    private User receiver;

    @Column(length = 2000, nullable = false)
    private String content;

    @Column(name = "message_type")
    private String messageType; // TEXT, IMAGE, LOCATION

    @Column(name = "media_url")
    private String mediaUrl; // For images or other media

    // Scopes the message to a thread: a match request chat (MATCH + pet_matches.id),
    // a marketplace listing chat (LISTING + marketplace_items.id), or GENERAL DM (null)
    @Column(name = "context_type")
    private String contextType;

    @Column(name = "context_id")
    private Long contextId;

    @Column(name = "is_read", nullable = false)
    private Boolean isRead = false;

    @Column(name = "read_at")
    private LocalDateTime readAt;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        if (this.isRead == null) {
            this.isRead = false;
        }
        if (this.messageType == null) {
            this.messageType = "TEXT";
        }
    }

    // Default constructor
    public Message() {}

    // Constructor with essential fields
    public Message(User sender, User receiver, String content) {
        this.sender = sender;
        this.receiver = receiver;
        this.content = content;
    }

    // Getters and Setters
    public Long getId() { return id; }

    public User getSender() { return sender; }
    public void setSender(User sender) { this.sender = sender; }
    public Long getSenderId() { return sender != null ? sender.getId() : null; }

    public User getReceiver() { return receiver; }
    public void setReceiver(User receiver) { this.receiver = receiver; }
    public Long getReceiverId() { return receiver != null ? receiver.getId() : null; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public String getMessageType() { return messageType; }
    public void setMessageType(String messageType) { this.messageType = messageType; }

    public String getMediaUrl() { return mediaUrl; }
    public void setMediaUrl(String mediaUrl) { this.mediaUrl = mediaUrl; }

    public String getContextType() { return contextType; }
    public void setContextType(String contextType) { this.contextType = contextType; }

    public Long getContextId() { return contextId; }
    public void setContextId(Long contextId) { this.contextId = contextId; }

    public Boolean getIsRead() { return isRead; }
    public void setIsRead(Boolean isRead) {
        this.isRead = isRead;
        if (isRead != null && isRead && this.readAt == null) {
            this.readAt = LocalDateTime.now();
        }
    }

    public LocalDateTime getReadAt() { return readAt; }

    public LocalDateTime getCreatedAt() { return createdAt; }

    // Helper method
    public void markAsRead() {
        this.isRead = true;
        this.readAt = LocalDateTime.now();
    }
}
