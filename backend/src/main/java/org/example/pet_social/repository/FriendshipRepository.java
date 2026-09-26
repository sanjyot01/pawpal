package org.example.pet_social.repository;

import org.example.pet_social.entity.Friendship;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FriendshipRepository extends JpaRepository<Friendship, Long> {

    // Find all friendships for a user (both directions)
    @Query("SELECT f FROM Friendship f WHERE (f.user.id = :userId OR f.friend.id = :userId) AND f.status = :status")
    List<Friendship> findByUserIdAndStatus(@Param("userId") Long userId, @Param("status") String status);

    // Find pending friend requests received by a user
    @Query("SELECT f FROM Friendship f WHERE f.friend.id = :userId AND f.status = 'PENDING'")
    List<Friendship> findPendingRequestsForUser(@Param("userId") Long userId);

    // Find pending friend requests sent by a user
    @Query("SELECT f FROM Friendship f WHERE f.user.id = :userId AND f.status = 'PENDING'")
    List<Friendship> findPendingRequestsByUser(@Param("userId") Long userId);

    // Check if friendship exists between two users (either direction)
    @Query("SELECT f FROM Friendship f WHERE ((f.user.id = :userId1 AND f.friend.id = :userId2) OR (f.user.id = :userId2 AND f.friend.id = :userId1))")
    Optional<Friendship> findFriendshipBetween(@Param("userId1") Long userId1, @Param("userId2") Long userId2);

    // Me-tab "friends" stat: accepted friendships in either direction
    @Query("SELECT COUNT(f) FROM Friendship f WHERE (f.user.id = :userId OR f.friend.id = :userId) AND f.status = 'ACCEPTED'")
    Long countAcceptedForUser(@Param("userId") Long userId);
}
