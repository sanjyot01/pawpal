package org.example.pet_social.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * A walk or blind-date invitation posted by a host — backs the mobile app's
 * /api/walk/invitations/* and /api/date/invitations/* namespaces. One table
 * for both boards: the flows are identical, only a few fields differ
 * (WALK: route/duration/spots/multiple host pets; DATE: location/single pet).
 * Date and time are stored as the pre-formatted display strings the app sends
 * ("Mon, Jul 5, 2026", "9:00 AM") — the app never sends ISO datetimes here.
 */
@Entity
@Table(name = "partner_invitations", indexes = {
    @Index(name = "idx_partner_inv_type_status", columnList = "invitation_type,status,created_at"),
    @Index(name = "idx_partner_inv_host", columnList = "host_id,invitation_type")
})
public class PartnerInvitation {

    public static final String TYPE_WALK = "WALK";
    public static final String TYPE_DATE = "DATE";
    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_CANCELLED = "CANCELLED";

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "partner_invitations_seq")
    @SequenceGenerator(name = "partner_invitations_seq", sequenceName = "partner_invitations_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "host_id", nullable = false, foreignKey = @ForeignKey(name = "fk_partner_inv_host"))
    private User host;

    @Column(name = "invitation_type", nullable = false, length = 8)
    private String type; // WALK | DATE

    // WALK: route text ("Riverside Park Trail"); DATE: meeting location
    @Column(nullable = false)
    private String place;

    @Column(name = "invite_date", nullable = false)
    private String date; // display string, e.g. "Mon, Jul 5, 2026"

    @Column(name = "invite_time", nullable = false)
    private String time; // display string, e.g. "9:00 AM"

    // date+time parsed into a real instant at write time — the display strings above stay the
    // source of truth for rendering, this is purely so WALK expiry can compare against "now".
    // Null on rows saved before this column existed, or if the strings didn't parse.
    @Column(name = "scheduled_at")
    private LocalDateTime scheduledAt;

    @Column(length = 1000)
    private String message;

    @Column(name = "duration_minutes")
    private Integer durationMinutes; // WALK only

    @Column(name = "max_spots")
    private Integer maxSpots; // WALK only

    // CSV of the host's pet ids joining (WALK: many, DATE: exactly one)
    @Column(name = "host_pet_ids")
    private String hostPetIds;

    // Pipe-separated photo URLs the host attached (DATE: up to 5)
    @Column(name = "image_urls", length = 2500)
    private String imageUrls;

    @Column
    private Double latitude;

    @Column
    private Double longitude;

    // WALK only: the route's destination, so browsers can see the actual road route
    // (not just the start pin) via RouteMapPicker's routing service.
    @Column(name = "end_latitude")
    private Double endLatitude;

    @Column(name = "end_longitude")
    private Double endLongitude;

    @Column(nullable = false)
    private String status = STATUS_ACTIVE;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        if (this.status == null) {
            this.status = STATUS_ACTIVE;
        }
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public PartnerInvitation() {}

    public PartnerInvitation(User host, String type, String place, String date, String time) {
        this.host = host;
        this.type = type;
        this.place = place;
        this.date = date;
        this.time = time;
    }

    public Long getId() { return id; }

    public User getHost() { return host; }
    public void setHost(User host) { this.host = host; }
    public Long getHostId() { return host != null ? host.getId() : null; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getPlace() { return place; }
    public void setPlace(String place) { this.place = place; }

    public String getDate() { return date; }
    public void setDate(String date) { this.date = date; }

    public String getTime() { return time; }
    public void setTime(String time) { this.time = time; }

    public LocalDateTime getScheduledAt() { return scheduledAt; }
    public void setScheduledAt(LocalDateTime scheduledAt) { this.scheduledAt = scheduledAt; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public Integer getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(Integer durationMinutes) { this.durationMinutes = durationMinutes; }

    public Integer getMaxSpots() { return maxSpots; }
    public void setMaxSpots(Integer maxSpots) { this.maxSpots = maxSpots; }

    public String getHostPetIds() { return hostPetIds; }
    public void setHostPetIds(String hostPetIds) { this.hostPetIds = hostPetIds; }

    public String getImageUrls() { return imageUrls; }
    public void setImageUrls(String imageUrls) { this.imageUrls = imageUrls; }

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }

    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }

    public Double getEndLatitude() { return endLatitude; }
    public void setEndLatitude(Double endLatitude) { this.endLatitude = endLatitude; }

    public Double getEndLongitude() { return endLongitude; }
    public void setEndLongitude(Double endLongitude) { this.endLongitude = endLongitude; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}