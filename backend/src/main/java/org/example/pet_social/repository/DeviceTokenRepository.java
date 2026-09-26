package org.example.pet_social.repository;

import org.example.pet_social.entity.DeviceToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Repository
public interface DeviceTokenRepository extends JpaRepository<DeviceToken, Long> {

    Optional<DeviceToken> findByToken(String token);

    /** Delivery targets for one user. */
    List<DeviceToken> findByUser_IdAndActiveTrue(Long userId);

    /** Bulk deactivation for tokens the push service reported as dead. Transactional here
     *  rather than around the caller, so no DB connection is held during the push HTTP call. */
    @Modifying
    @Transactional
    @Query("UPDATE DeviceToken d SET d.active = false WHERE d.token IN :tokens")
    int deactivateTokens(@Param("tokens") List<String> tokens);
}
