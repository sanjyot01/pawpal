package org.example.pet_social.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "event_attendees",
    uniqueConstraints = {
        @UniqueConstraint(columnNames = {"event_id", "user_id"})
    },
    indexes = {
        @Index(name = "idx_event_attendees_event", columnList = "event_id"),
        @Index(name = "idx_event_attendees_user", columnList = "user_id")
    })
public class EventAttendee {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "event_attendees_seq")
    @SequenceGenerator(name = "event_attendees_seq", sequenceName = "event_attendees_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id", nullable = false, foreignKey = @ForeignKey(name = "fk_event_attendees_event"))
    private Event event;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, foreignKey = @ForeignKey(name = "fk_event_attendees_user"))
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pet_id", foreignKey = @ForeignKey(name = "fk_event_attendees_pet"))
    private Pet pet; // Optional: which pet is attending

    @Column(name = "rsvp_status", nullable = false)
    private String rsvpStatus; // GOING, MAYBE, NOT_GOING

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
    public EventAttendee() {}

    // Constructor with essential fields
    public EventAttendee(Event event, User user, String rsvpStatus) {
        this.event = event;
        this.user = user;
        this.rsvpStatus = rsvpStatus;
    }

    // Getters and Setters
    public Long getId() { return id; }

    public Event getEvent() { return event; }
    public void setEvent(Event event) { this.event = event; }
    public Long getEventId() { return event != null ? event.getId() : null; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Long getUserId() { return user != null ? user.getId() : null; }

    public Pet getPet() { return pet; }
    public void setPet(Pet pet) { this.pet = pet; }
    public Long getPetId() { return pet != null ? pet.getId() : null; }

    public String getRsvpStatus() { return rsvpStatus; }
    public void setRsvpStatus(String rsvpStatus) { this.rsvpStatus = rsvpStatus; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
