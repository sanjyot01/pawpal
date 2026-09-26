package org.example.pet_social.repository;

import org.example.pet_social.entity.PartnerRequest;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PartnerRequestRepository extends JpaRepository<PartnerRequest, Long> {

    Optional<PartnerRequest> findByInvitation_IdAndRequester_Id(Long invitationId, Long requesterId);

    // Requester side: everything I've sent on one board
    @EntityGraph(attributePaths = {"invitation", "invitation.host"})
    List<PartnerRequest> findByTypeAndRequester_IdOrderByCreatedAtDesc(String type, Long requesterId);

    // Host side: everything requested on my invitations of one board
    @EntityGraph(attributePaths = {"invitation", "requester"})
    List<PartnerRequest> findByTypeAndInvitation_Host_IdOrderByCreatedAtDesc(String type, Long hostId);

    // My requests against a set of invitations (feed personalization)
    List<PartnerRequest> findByRequester_IdAndInvitation_IdIn(Long requesterId, List<Long> invitationIds);

    // spotsLeft: accepted requests per invitation
    @Query("SELECT r.invitation.id, COUNT(r) FROM PartnerRequest r " +
           "WHERE r.invitation.id IN :invitationIds AND r.status = 'ACCEPTED' GROUP BY r.invitation.id")
    List<Object[]> countAcceptedByInvitation(@Param("invitationIds") List<Long> invitationIds);

    // pendingRequestCount badge on "My Invitations"
    @Query("SELECT r.invitation.id, COUNT(r) FROM PartnerRequest r " +
           "WHERE r.invitation.id IN :invitationIds AND r.status = 'PENDING' GROUP BY r.invitation.id")
    List<Object[]> countPendingByInvitation(@Param("invitationIds") List<Long> invitationIds);

    long countByInvitation_IdAndStatus(Long invitationId, String status);
}