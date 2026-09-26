package org.example.pet_social.repository;

import org.example.pet_social.entity.PetMatch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PetMatchRepository extends JpaRepository<PetMatch, Long> {

    // Find all matches for a pet (either direction)
    @Query("SELECT pm FROM PetMatch pm WHERE pm.pet1.id = :petId OR pm.pet2.id = :petId")
    List<PetMatch> findMatchesForPet(@Param("petId") Long petId);

    // Find matches by status
    @Query("SELECT pm FROM PetMatch pm WHERE (pm.pet1.id = :petId OR pm.pet2.id = :petId) AND pm.matchStatus = :status")
    List<PetMatch> findMatchesForPetByStatus(@Param("petId") Long petId, @Param("status") String status);

    // Find match between two pets (either direction)
    @Query("SELECT pm FROM PetMatch pm WHERE (pm.pet1.id = :petId1 AND pm.pet2.id = :petId2) OR (pm.pet1.id = :petId2 AND pm.pet2.id = :petId1)")
    Optional<PetMatch> findMatchBetweenPets(@Param("petId1") Long petId1, @Param("petId2") Long petId2);

    // Find all pending matches initiated by a user
    List<PetMatch> findByInitiatedByUser_IdAndMatchStatus(Long initiatedByUserId, String matchStatus);

    // All matches involving any pet the user owns (fetch-joined for DTO mapping)
    @Query("SELECT pm FROM PetMatch pm " +
           "JOIN FETCH pm.pet1 p1 JOIN FETCH p1.owner " +
           "JOIN FETCH pm.pet2 p2 JOIN FETCH p2.owner " +
           "WHERE p1.owner.id = :userId OR p2.owner.id = :userId " +
           "ORDER BY pm.updatedAt DESC")
    List<PetMatch> findMatchesForUser(@Param("userId") Long userId);

    // Find matches by type
    List<PetMatch> findByMatchType(String matchType);
}
