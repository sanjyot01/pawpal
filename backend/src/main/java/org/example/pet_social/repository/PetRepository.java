package org.example.pet_social.repository;

import org.example.pet_social.entity.Pet;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PetRepository extends JpaRepository<Pet, Long> {

    List<Pet> findByOwner_Id(Long ownerId);

    // Fetch-join variants so DTO mapping can read owner.name without lazy-load surprises
    @Query("SELECT p FROM Pet p JOIN FETCH p.owner WHERE p.owner.id = :ownerId")
    List<Pet> findWithOwnerByOwnerId(@Param("ownerId") Long ownerId);

    @Query("SELECT p FROM Pet p JOIN FETCH p.owner o " +
           "WHERE p.isAvailableForPlaydate = true AND o.isActive = true AND o.id <> :excludeOwnerId")
    List<Pet> findPlaydateCandidates(@Param("excludeOwnerId") Long excludeOwnerId);

    /**
     * Same candidate pool, narrowed to owners Redis already placed inside the search radius.
     * Discovery reads this rather than findPlaydateCandidates so the row count scales with
     * the neighbourhood instead of the user table.
     */
    @Query("SELECT p FROM Pet p JOIN FETCH p.owner o " +
           "WHERE p.isAvailableForPlaydate = true AND o.isActive = true " +
           "AND o.id <> :excludeOwnerId AND o.id IN :ownerIds")
    List<Pet> findPlaydateCandidatesForOwners(@Param("excludeOwnerId") Long excludeOwnerId,
                                              @Param("ownerIds") List<Long> ownerIds);

    List<Pet> findBySpecies(String species);

    List<Pet> findByIsAvailableForPlaydate(Boolean isAvailable);

    List<Pet> findByOwner_IdAndSpecies(Long ownerId, String species);

    Long countByOwner_Id(Long ownerId);

    // Batch-load hosts' pets for the walk/date feeds (avoids one query per feed card)
    @Query("SELECT p FROM Pet p JOIN FETCH p.owner WHERE p.owner.id IN :ownerIds")
    List<Pet> findWithOwnerByOwnerIdIn(@Param("ownerIds") List<Long> ownerIds);

    @Query("SELECT p FROM Pet p JOIN FETCH p.owner WHERE p.id IN :ids")
    List<Pet> findWithOwnerByIdIn(@Param("ids") List<Long> ids);
}
