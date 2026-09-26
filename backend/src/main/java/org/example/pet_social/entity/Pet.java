package org.example.pet_social.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "pets", indexes = {
    @Index(name = "idx_pets_owner", columnList = "owner_id"),
    @Index(name = "idx_pets_species", columnList = "species"),
    @Index(name = "idx_pets_playdate", columnList = "is_available_for_playdate")
})
public class Pet {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "pets_seq")
    @SequenceGenerator(name = "pets_seq", sequenceName = "pets_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false, foreignKey = @ForeignKey(name = "fk_pets_owner"))
    private User owner;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String species; // DOG, CAT, BIRD, RABBIT, etc.

    @Column
    private String breed;

    @Column(name = "date_of_birth")
    private LocalDate dateOfBirth;

    @Column
    private String gender; // MALE, FEMALE, UNKNOWN

    @Column
    private String size; // SMALL, MEDIUM, LARGE, EXTRA_LARGE

    @Column
    private String temperament; // FRIENDLY, SHY, ENERGETIC, CALM, PLAYFUL, AGGRESSIVE

    @Column(length = 1000)
    private String bio;

    @Column(name = "profile_photo_url")
    private String profilePhotoUrl;

    @Column
    private Double weight; // in kg

    @Column(name = "is_neutered")
    private Boolean isNeutered;

    @Column(name = "is_vaccinated")
    private Boolean isVaccinated;

    @Column(name = "is_available_for_playdate")
    private Boolean isAvailableForPlaydate;

    // Emoji shown as the pet's avatar in the mobile app (map pins, cards, chat)
    @Column(name = "avatar_emoji", length = 8)
    private String avatarEmoji;

    // Comma-separated UI tags, e.g. "Friendly,Calm pace"; 'Vaccinated' is derived from isVaccinated
    @Column(name = "personality_tags")
    private String personalityTags;

    // Aggregate owner-review rating 0.0-5.0 shown on partner cards
    @Column
    private Double rating;

    // Preferred daily walk time shown on partner cards, e.g. "7:00 AM"
    @Column(name = "preferred_walk_time")
    private String preferredWalkTime;

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
    public Pet() {}

    // Constructor with essential fields
    public Pet(User owner, String name, String species, String breed) {
        this.owner = owner;
        this.name = name;
        this.species = species;
        this.breed = breed;
    }

    // Getters and Setters
    public Long getId() { return id; }

    public User getOwner() { return owner; }
    public void setOwner(User owner) { this.owner = owner; }
    public Long getOwnerId() { return owner != null ? owner.getId() : null; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getSpecies() { return species; }
    public void setSpecies(String species) { this.species = species; }

    public String getBreed() { return breed; }
    public void setBreed(String breed) { this.breed = breed; }

    public LocalDate getDateOfBirth() { return dateOfBirth; }
    public void setDateOfBirth(LocalDate dateOfBirth) { this.dateOfBirth = dateOfBirth; }

    public String getGender() { return gender; }
    public void setGender(String gender) { this.gender = gender; }

    public String getSize() { return size; }
    public void setSize(String size) { this.size = size; }

    public String getTemperament() { return temperament; }
    public void setTemperament(String temperament) { this.temperament = temperament; }

    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }

    public String getProfilePhotoUrl() { return profilePhotoUrl; }
    public void setProfilePhotoUrl(String profilePhotoUrl) { this.profilePhotoUrl = profilePhotoUrl; }

    public Double getWeight() { return weight; }
    public void setWeight(Double weight) { this.weight = weight; }

    public Boolean getIsNeutered() { return isNeutered; }
    public void setIsNeutered(Boolean isNeutered) { this.isNeutered = isNeutered; }

    public Boolean getIsVaccinated() { return isVaccinated; }
    public void setIsVaccinated(Boolean isVaccinated) { this.isVaccinated = isVaccinated; }

    public Boolean getIsAvailableForPlaydate() { return isAvailableForPlaydate; }
    public void setIsAvailableForPlaydate(Boolean isAvailableForPlaydate) {
        this.isAvailableForPlaydate = isAvailableForPlaydate;
    }

    public String getAvatarEmoji() { return avatarEmoji; }
    public void setAvatarEmoji(String avatarEmoji) { this.avatarEmoji = avatarEmoji; }

    public String getPersonalityTags() { return personalityTags; }
    public void setPersonalityTags(String personalityTags) { this.personalityTags = personalityTags; }

    public Double getRating() { return rating; }
    public void setRating(Double rating) { this.rating = rating; }

    public String getPreferredWalkTime() { return preferredWalkTime; }
    public void setPreferredWalkTime(String preferredWalkTime) { this.preferredWalkTime = preferredWalkTime; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
