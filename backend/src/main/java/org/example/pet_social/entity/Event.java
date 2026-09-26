package org.example.pet_social.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "events", indexes = {
    @Index(name = "idx_events_organizer", columnList = "organizer_id"),
    @Index(name = "idx_events_datetime", columnList = "event_date_time"),
    @Index(name = "idx_events_type", columnList = "event_type"),
    @Index(name = "idx_events_species", columnList = "pet_species")
})
public class Event {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "events_seq")
    @SequenceGenerator(name = "events_seq", sequenceName = "events_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organizer_id", nullable = false, foreignKey = @ForeignKey(name = "fk_events_organizer"))
    private User organizer; // User who created the event

    @Column(nullable = false)
    private String title;

    @Column(length = 3000)
    private String description;

    @Column(name = "event_date_time", nullable = false)
    private LocalDateTime eventDateTime;

    @Column(name = "location_name")
    private String locationName;

    @Column
    private Double latitude;

    @Column
    private Double longitude;

    @Column(name = "event_type")
    private String eventType; // PLAYDATE, WALK, TRAINING, MEETUP, PARTY, OTHER

    @Column(name = "pet_species")
    private String petSpecies; // Optional filter: DOG, CAT, ALL

    @Column(name = "max_attendees")
    private Integer maxAttendees;

    @Column(name = "current_attendees")
    private Integer currentAttendees = 0;

    @Column
    private String status; // UPCOMING, ONGOING, COMPLETED, CANCELLED

    @Column(name = "cover_photo_url")
    private String coverPhotoUrl;

    // Emoji shown on invitation cards in the mobile app (e.g. 🌿 for park routes)
    @Column(length = 8)
    private String emoji;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        if (this.status == null) {
            this.status = "UPCOMING";
        }
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    // Default constructor
    public Event() {}

    // Constructor with essential fields
    public Event(User organizer, String title, LocalDateTime eventDateTime) {
        this.organizer = organizer;
        this.title = title;
        this.eventDateTime = eventDateTime;
    }

    // Getters and Setters
    public Long getId() { return id; }

    public User getOrganizer() { return organizer; }
    public void setOrganizer(User organizer) { this.organizer = organizer; }
    public Long getOrganizerId() { return organizer != null ? organizer.getId() : null; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public LocalDateTime getEventDateTime() { return eventDateTime; }
    public void setEventDateTime(LocalDateTime eventDateTime) { this.eventDateTime = eventDateTime; }

    public String getLocationName() { return locationName; }
    public void setLocationName(String locationName) { this.locationName = locationName; }

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }

    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }

    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }

    public String getPetSpecies() { return petSpecies; }
    public void setPetSpecies(String petSpecies) { this.petSpecies = petSpecies; }

    public Integer getMaxAttendees() { return maxAttendees; }
    public void setMaxAttendees(Integer maxAttendees) { this.maxAttendees = maxAttendees; }

    public Integer getCurrentAttendees() { return currentAttendees; }
    public void setCurrentAttendees(Integer currentAttendees) { this.currentAttendees = currentAttendees; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getCoverPhotoUrl() { return coverPhotoUrl; }
    public void setCoverPhotoUrl(String coverPhotoUrl) { this.coverPhotoUrl = coverPhotoUrl; }

    public String getEmoji() { return emoji; }
    public void setEmoji(String emoji) { this.emoji = emoji; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }

    // Helper methods
    public void incrementAttendees() {
        this.currentAttendees = (this.currentAttendees == null ? 0 : this.currentAttendees) + 1;
    }

    public void decrementAttendees() {
        this.currentAttendees = Math.max(0, (this.currentAttendees == null ? 0 : this.currentAttendees) - 1);
    }

    public boolean isFull() {
        return maxAttendees != null && currentAttendees >= maxAttendees;
    }
}
