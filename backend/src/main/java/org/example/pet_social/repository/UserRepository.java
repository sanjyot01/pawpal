package org.example.pet_social.repository;

import org.example.pet_social.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    // Spring automatically generates the SQL for this just by reading the method name!
    List<User> findByIsActiveTrue();

    // COUNT(*) in the database. Dashboard gauges run on every Prometheus scrape —
    // loading every active user as an entity just to call size() does not scale.
    long countByIsActiveTrue();

    // Case-insensitive: emails are stored lowercase for new accounts, but rows
    // created before 2026-07-17 may carry mixed case (and case-variant duplicates).
    List<User> findByEmailIgnoreCaseOrderByIdAsc(String email);

    List<User> findByRole(String role);

    // Paged projection for the startup users:meta backfill — a Slice avoids the extra
    // COUNT(*) a Page would issue on every page.
    org.springframework.data.domain.Slice<User> findAllBy(org.springframework.data.domain.Pageable pageable);
}