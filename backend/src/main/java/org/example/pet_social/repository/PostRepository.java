package org.example.pet_social.repository;

import org.example.pet_social.entity.Post;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PostRepository extends JpaRepository<Post, Long> {

    // Find all posts by a user
    Page<Post> findByUser_Id(Long userId, Pageable pageable);

    // Find posts by a specific pet
    Page<Post> findByPet_Id(Long petId, Pageable pageable);

    // Find public posts (for general feed)
    Page<Post> findByVisibility(String visibility, Pageable pageable);

    // Find posts by multiple users (for friend feed)
    @Query("SELECT p FROM Post p WHERE p.user.id IN :userIds ORDER BY p.createdAt DESC")
    Page<Post> findByUserIds(@Param("userIds") List<Long> userIds, Pageable pageable);

    // Count posts by user
    Long countByUser_Id(Long userId);
}
