package org.example.pet_social.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * A 1-5 star review of a pet after a walk/date. pets.rating holds the running
 * average and is recomputed on every write (see ReviewController).
 */
@Entity
@Table(name = "reviews",
    uniqueConstraints = {
        @UniqueConstraint(columnNames = {"reviewer_id", "pet_id"})
    },
    indexes = {
        @Index(name = "idx_reviews_pet", columnList = "pet_id"),
        @Index(name = "idx_reviews_reviewer", columnList = "reviewer_id")
    })
public class Review {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "reviews_seq")
    @SequenceGenerator(name = "reviews_seq", sequenceName = "reviews_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewer_id", nullable = false, foreignKey = @ForeignKey(name = "fk_reviews_reviewer"))
    private User reviewer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pet_id", nullable = false, foreignKey = @ForeignKey(name = "fk_reviews_pet"))
    private Pet pet;

    @Column(nullable = false)
    private Integer rating; // 1-5

    @Column(length = 1000)
    private String comment;

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

    public Review() {}

    public Review(User reviewer, Pet pet, Integer rating, String comment) {
        this.reviewer = reviewer;
        this.pet = pet;
        this.rating = rating;
        this.comment = comment;
    }

    public Long getId() { return id; }

    public User getReviewer() { return reviewer; }
    public void setReviewer(User reviewer) { this.reviewer = reviewer; }
    public Long getReviewerId() { return reviewer != null ? reviewer.getId() : null; }

    public Pet getPet() { return pet; }
    public void setPet(Pet pet) { this.pet = pet; }
    public Long getPetId() { return pet != null ? pet.getId() : null; }

    public Integer getRating() { return rating; }
    public void setRating(Integer rating) { this.rating = rating; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
