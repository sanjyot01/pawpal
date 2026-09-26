package org.example.pet_social.repository;

import org.example.pet_social.entity.Event;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface EventRepository extends JpaRepository<Event, Long> {

    // Find events by organizer
    List<Event> findByOrganizer_Id(Long organizerId);

    // Find events by status
    Page<Event> findByStatus(String status, Pageable pageable);

    // Find upcoming events (by date)
    @Query("SELECT e FROM Event e WHERE e.eventDateTime > :now AND e.status = 'UPCOMING' ORDER BY e.eventDateTime ASC")
    List<Event> findUpcomingEvents(@Param("now") LocalDateTime now);

    // Find events by type
    List<Event> findByEventType(String eventType);

    // Find events by species filter
    List<Event> findByPetSpecies(String petSpecies);

    // Find nearby events (requires geospatial query)
    @Query("SELECT e FROM Event e WHERE e.latitude BETWEEN :minLat AND :maxLat AND e.longitude BETWEEN :minLon AND :maxLon AND e.status = 'UPCOMING'")
    List<Event> findNearbyEvents(
        @Param("minLat") Double minLat,
        @Param("maxLat") Double maxLat,
        @Param("minLon") Double minLon,
        @Param("maxLon") Double maxLon
    );
}
