package org.example.pet_social.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * A join/interest request on a {@link PartnerInvitation}: requester asks,
 * the invitation's host resolves it. Per-requester status lifecycle
 * PENDING → ACCEPTED | REJECTED | BLOCKED (blocked is final, rejected may be
 * re-opened by requesting again). The request id is also the chat-thread key:
 * messages carry contextType WALK_REQUEST/DATE_REQUEST + contextId = this id.
 */
@Entity
@Table(name = "partner_requests",
    uniqueConstraints = @UniqueConstraint(name = "uq_partner_req_inv_requester", columnNames = {"invitation_id", "requester_id"}),
    indexes = {
        @Index(name = "idx_partner_req_invitation", columnList = "invitation_id,status"),
        @Index(name = "idx_partner_req_requester", columnList = "requester_id,request_type")
    })
public class PartnerRequest {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_ACCEPTED = "ACCEPTED";
    public static final String STATUS_REJECTED = "REJECTED";
    public static final String STATUS_BLOCKED = "BLOCKED";

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "partner_requests_seq")
    @SequenceGenerator(name = "partner_requests_seq", sequenceName = "partner_requests_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invitation_id", nullable = false, foreignKey = @ForeignKey(name = "fk_partner_req_invitation"))
    private PartnerInvitation invitation;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requester_id", nullable = false, foreignKey = @ForeignKey(name = "fk_partner_req_requester"))
    private User requester;

    // Denormalized from the invitation so requester-side queries don't need the join
    @Column(name = "request_type", nullable = false, length = 8)
    private String type; // WALK | DATE

    @Column(nullable = false)
    private String status = STATUS_PENDING;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        if (this.status == null) {
            this.status = STATUS_PENDING;
        }
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public PartnerRequest() {}

    public PartnerRequest(PartnerInvitation invitation, User requester) {
        this.invitation = invitation;
        this.requester = requester;
        this.type = invitation.getType();
    }

    public Long getId() { return id; }

    public PartnerInvitation getInvitation() { return invitation; }
    public void setInvitation(PartnerInvitation invitation) { this.invitation = invitation; }
    public Long getInvitationId() { return invitation != null ? invitation.getId() : null; }

    public User getRequester() { return requester; }
    public void setRequester(User requester) { this.requester = requester; }
    public Long getRequesterId() { return requester != null ? requester.getId() : null; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}