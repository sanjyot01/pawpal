package org.example.pet_social.repository;

import org.example.pet_social.entity.Review;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ReviewRepository extends JpaRepository<Review, Long> {

    @EntityGraph(attributePaths = "reviewer")
    List<Review> findByPet_IdOrderByCreatedAtDesc(Long petId);

    Optional<Review> findByReviewer_IdAndPet_Id(Long reviewerId, Long petId);

    @Query("SELECT AVG(r.rating) FROM Review r WHERE r.pet.id = :petId")
    Double averageRatingForPet(@Param("petId") Long petId);
}
