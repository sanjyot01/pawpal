package org.example.pet_social.repository;

import org.example.pet_social.entity.Message;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MessageRepository extends JpaRepository<Message, Long> {

    // Find conversation between two users
    @Query("SELECT m FROM Message m WHERE (m.sender.id = :userId1 AND m.receiver.id = :userId2) OR (m.sender.id = :userId2 AND m.receiver.id = :userId1) ORDER BY m.createdAt DESC")
    Page<Message> findConversation(@Param("userId1") Long userId1, @Param("userId2") Long userId2, Pageable pageable);

    // Find all messages sent by a user
    List<Message> findBySender_Id(Long senderId);

    // Find all messages received by a user
    List<Message> findByReceiver_Id(Long receiverId);

    // Find unread messages for a user
    List<Message> findByReceiver_IdAndIsRead(Long receiverId, Boolean isRead);

    // Count unread messages
    Long countByReceiver_IdAndIsRead(Long receiverId, Boolean isRead);

    // Messages of one thread (two users + optional match/listing context), oldest first
    @Query("SELECT m FROM Message m WHERE " +
           "((m.sender.id = :userId1 AND m.receiver.id = :userId2) OR (m.sender.id = :userId2 AND m.receiver.id = :userId1)) " +
           "AND ((:contextType IS NULL AND m.contextType IS NULL) OR m.contextType = :contextType) " +
           "AND ((:contextId IS NULL AND m.contextId IS NULL) OR m.contextId = :contextId) " +
           "ORDER BY m.createdAt ASC")
    List<Message> findThread(@Param("userId1") Long userId1, @Param("userId2") Long userId2,
                             @Param("contextType") String contextType, @Param("contextId") Long contextId);

    // Mark everything the other user sent me in this thread as read
    @Modifying
    @Query("UPDATE Message m SET m.isRead = true, m.readAt = CURRENT_TIMESTAMP " +
           "WHERE m.receiver.id = :userId AND m.sender.id = :otherUserId AND m.isRead = false")
    int markThreadRead(@Param("userId") Long userId, @Param("otherUserId") Long otherUserId);

    // Unread badge counts grouped by thread kind (WALK_REQUEST / DATE_REQUEST / LISTING)
    @Query("SELECT m.contextType, COUNT(m) FROM Message m " +
           "WHERE m.receiver.id = :userId AND m.isRead = false AND m.contextType IS NOT NULL " +
           "GROUP BY m.contextType")
    List<Object[]> countUnreadGroupedByContextType(@Param("userId") Long userId);

    // Unread per thread of one kind (e.g. per walk request id) for badges on cards
    @Query("SELECT m.contextId, COUNT(m) FROM Message m " +
           "WHERE m.receiver.id = :userId AND m.isRead = false AND m.contextType = :contextType " +
           "GROUP BY m.contextId")
    List<Object[]> countUnreadGroupedByContextId(@Param("userId") Long userId, @Param("contextType") String contextType);

    // Whole thread by context alone (participants are enforced by the caller)
    @Query("SELECT m FROM Message m JOIN FETCH m.sender JOIN FETCH m.receiver " +
           "WHERE m.contextType = :contextType AND m.contextId = :contextId ORDER BY m.createdAt ASC")
    List<Message> findByContext(@Param("contextType") String contextType, @Param("contextId") Long contextId);

    // Total messages in one context thread — backs the 5-message cap while a walk/date request is still pending
    long countByContextTypeAndContextId(String contextType, Long contextId);

    // Mark everything sent to me inside one context thread as read
    @Modifying
    @Query("UPDATE Message m SET m.isRead = true, m.readAt = CURRENT_TIMESTAMP " +
           "WHERE m.receiver.id = :userId AND m.contextType = :contextType AND m.contextId = :contextId AND m.isRead = false")
    int markContextRead(@Param("userId") Long userId, @Param("contextType") String contextType, @Param("contextId") Long contextId);

    // All marketplace chat messages involving one user (grouped into chats in MarketService)
    @Query("SELECT m FROM Message m JOIN FETCH m.sender JOIN FETCH m.receiver " +
           "WHERE m.contextType = 'LISTING' AND (m.sender.id = :userId OR m.receiver.id = :userId) " +
           "ORDER BY m.createdAt DESC")
    List<Message> findListingMessagesInvolving(@Param("userId") Long userId);

    // Find recent conversations for a user (latest message per unique partner, newest first).
    // Postgres requires the DISTINCT ON expression to match the first ORDER BY expression
    // exactly, which bind parameters break — so partner_id is computed once in a subquery.
    @Query(value = "SELECT * FROM (" +
                   "  SELECT DISTINCT ON (t.partner_id) t.* FROM (" +
                   "    SELECT m.*, CASE WHEN m.sender_id = :userId THEN m.receiver_id ELSE m.sender_id END AS partner_id " +
                   "    FROM messages m WHERE m.sender_id = :userId OR m.receiver_id = :userId" +
                   "  ) t ORDER BY t.partner_id, t.created_at DESC" +
                   ") latest ORDER BY latest.created_at DESC",
           nativeQuery = true)
    List<Message> findRecentConversations(@Param("userId") Long userId);
}
