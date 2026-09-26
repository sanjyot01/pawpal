package org.example.pet_social.repository;

import org.example.pet_social.entity.Comment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CommentRepository extends JpaRepository<Comment, Long> {

    // Find all comments for a post
    Page<Comment> findByPost_Id(Long postId, Pageable pageable);

    // Find comments by a specific user
    List<Comment> findByUser_Id(Long userId);

    // Count comments for a post
    Long countByPost_Id(Long postId);
}
