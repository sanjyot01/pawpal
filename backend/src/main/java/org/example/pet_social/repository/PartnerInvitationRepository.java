package org.example.pet_social.repository;

import org.example.pet_social.entity.PartnerInvitation;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PartnerInvitationRepository extends JpaRepository<PartnerInvitation, Long> {

    // Feed: newest active invitations of one board (host fetched for owner name/avatar)
    @EntityGraph(attributePaths = "host")
    List<PartnerInvitation> findByTypeAndStatusOrderByCreatedAtDesc(String type, String status);

    // "My Invitations" rail
    @EntityGraph(attributePaths = "host")
    List<PartnerInvitation> findByTypeAndHost_IdAndStatusOrderByCreatedAtDesc(String type, Long hostId, String status);
}