package org.example.pet_social.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "pet_matches",
    uniqueConstraints = {
        @UniqueConstraint(columnNames = {"pet_id_1", "pet_id_2"})
    },
    indexes = {
        @Index(name = "idx_matches_pet1", columnList = "pet_id_1,match_status"),
        @Index(name = "idx_matches_pet2", columnList = "pet_id_2,match_status"),
        @Index(name = "idx_matches_initiator", columnList = "initiated_by_user_id")
    })
public class PetMatch {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "pet_matches_seq")
    @SequenceGenerator(name = "pet_matches_seq", sequenceName = "pet_matches_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pet_id_1", nullable = false, foreignKey = @ForeignKey(name = "fk_pet_matches_pet1"))
    private Pet pet1; // First pet in the match

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pet_id_2", nullable = false, foreignKey = @ForeignKey(name = "fk_pet_matches_pet2"))
    private Pet pet2; // Second pet in the match

    @Column(name = "match_status", nullable = false)
    private String matchStatus; // PENDING, ACCEPTED, REJECTED, COMPLETED

    @Column(name = "compatibility_score")
    private Double compatibilityScore; // 0.0 to 1.0

    @Column(name = "match_type")
    private String matchType; // PLAYDATE, BREEDING, FRIENDSHIP

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "initiated_by_user_id", foreignKey = @ForeignKey(name = "fk_pet_matches_initiator"))
    private User initiatedByUser;

    @Column(name = "meeting_date")
    private LocalDateTime meetingDate;

    @Column(length = 1000)
    private String notes;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        if (this.matchStatus == null) {
            this.matchStatus = "PENDING";
        }
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    // Default constructor
    public PetMatch() {}

    // Constructor with essential fields
    public PetMatch(Pet pet1, Pet pet2, User initiatedByUser) {
        this.pet1 = pet1;
        this.pet2 = pet2;
        this.initiatedByUser = initiatedByUser;
    }

    // Getters and Setters
    public Long getId() { return id; }

    public Pet getPet1() { return pet1; }
    public void setPet1(Pet pet1) { this.pet1 = pet1; }
    public Long getPetId1() { return pet1 != null ? pet1.getId() : null; }

    public Pet getPet2() { return pet2; }
    public void setPet2(Pet pet2) { this.pet2 = pet2; }
    public Long getPetId2() { return pet2 != null ? pet2.getId() : null; }

    public String getMatchStatus() { return matchStatus; }
    public void setMatchStatus(String matchStatus) { this.matchStatus = matchStatus; }

    public Double getCompatibilityScore() { return compatibilityScore; }
    public void setCompatibilityScore(Double compatibilityScore) { this.compatibilityScore = compatibilityScore; }

    public String getMatchType() { return matchType; }
    public void setMatchType(String matchType) { this.matchType = matchType; }

    public User getInitiatedByUser() { return initiatedByUser; }
    public void setInitiatedByUser(User initiatedByUser) { this.initiatedByUser = initiatedByUser; }
    public Long getInitiatedByUserId() { return initiatedByUser != null ? initiatedByUser.getId() : null; }

    public LocalDateTime getMeetingDate() { return meetingDate; }
    public void setMeetingDate(LocalDateTime meetingDate) { this.meetingDate = meetingDate; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
