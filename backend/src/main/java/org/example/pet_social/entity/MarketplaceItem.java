package org.example.pet_social.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "marketplace_items", indexes = {
    @Index(name = "idx_marketplace_seller", columnList = "seller_id"),
    @Index(name = "idx_marketplace_category", columnList = "category,status"),
    @Index(name = "idx_marketplace_status", columnList = "status,created_at")
})
public class MarketplaceItem {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "marketplace_items_seq")
    @SequenceGenerator(name = "marketplace_items_seq", sequenceName = "marketplace_items_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "seller_id", nullable = false, foreignKey = @ForeignKey(name = "fk_marketplace_seller"))
    private User seller;

    @Column(nullable = false)
    private String name;

    // Emoji thumbnail shown on the item card (design uses emoji, not photos)
    @Column(length = 8)
    private String emoji;

    @Column(nullable = false)
    private Double price;

    @Column(name = "original_price")
    private Double originalPrice;

    @Column
    private String condition; // NEW, LIKE_NEW, GOOD, FAIR, SEALED

    @Column(nullable = false)
    private String category; // TOY, CARRIER, FOOD, ACCESSORY, OTHER

    @Column(length = 2000)
    private String description;

    // Photo URL uploaded client-side (Firebase Storage); emoji remains the fallback thumbnail.
    // Always mirrors the first entry of imageUrls — kept for older clients/rows with one photo.
    @Column(name = "photo_url")
    private String photoUrl;

    // Pipe-separated photo URLs (up to 5) — see PartnerInvitation.imageUrls for the same pattern
    @Column(name = "image_urls", length = 2500)
    private String imageUrls;

    // Pickup location label + coordinates from the mobile app's post form
    @Column
    private String location;

    @Column
    private Double latitude;

    @Column
    private Double longitude;

    @Column(nullable = false)
    private String status; // ACTIVE, RESERVED, SOLD, WITHDRAWN

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        if (this.status == null) {
            this.status = "ACTIVE";
        }
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public MarketplaceItem() {}

    public MarketplaceItem(User seller, String name, Double price, String category) {
        this.seller = seller;
        this.name = name;
        this.price = price;
        this.category = category;
    }

    public Long getId() { return id; }

    public User getSeller() { return seller; }
    public void setSeller(User seller) { this.seller = seller; }
    public Long getSellerId() { return seller != null ? seller.getId() : null; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getEmoji() { return emoji; }
    public void setEmoji(String emoji) { this.emoji = emoji; }

    public Double getPrice() { return price; }
    public void setPrice(Double price) { this.price = price; }

    public Double getOriginalPrice() { return originalPrice; }
    public void setOriginalPrice(Double originalPrice) { this.originalPrice = originalPrice; }

    public String getCondition() { return condition; }
    public void setCondition(String condition) { this.condition = condition; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getPhotoUrl() { return photoUrl; }
    public void setPhotoUrl(String photoUrl) { this.photoUrl = photoUrl; }

    public String getImageUrls() { return imageUrls; }
    public void setImageUrls(String imageUrls) { this.imageUrls = imageUrls; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }

    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
