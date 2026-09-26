package org.example.pet_social.repository;

import org.example.pet_social.entity.EventAttendee;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface EventAttendeeRepository extends JpaRepository<EventAttendee, Long> {

    // Find all attendees for an event
    List<EventAttendee> findByEvent_Id(Long eventId);

    // Find attendees by RSVP status
    List<EventAttendee> findByEvent_IdAndRsvpStatus(Long eventId, String rsvpStatus);

    // Find all events a user is attending
    List<EventAttendee> findByUser_Id(Long userId);

    // Check if user is attending a specific event
    Optional<EventAttendee> findByEvent_IdAndUser_Id(Long eventId, Long userId);

    // Count attendees for an event by status
    Long countByEvent_IdAndRsvpStatus(Long eventId, String rsvpStatus);
}
