package org.example.pet_social.service;

import org.example.pet_social.entity.DeviceToken;
import org.example.pet_social.entity.User;
import org.example.pet_social.repository.DeviceTokenRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Locale;

/**
 * Device-token lifecycle. The client re-registers on every launch and whenever the
 * push service rotates its token, so register() has to be idempotent and has to
 * handle the token moving to a different account (shared device, or logout/login).
 */
@Service
public class DeviceTokenService {

    private static final Logger log = LoggerFactory.getLogger(DeviceTokenService.class);

    private final DeviceTokenRepository deviceTokenRepository;

    public DeviceTokenService(DeviceTokenRepository deviceTokenRepository) {
        this.deviceTokenRepository = deviceTokenRepository;
    }

    /**
     * Claims a token for this user. If the token already exists it is reassigned and
     * reactivated rather than duplicated — otherwise a logged-out teammate's phone would
     * keep receiving the previous account's notifications.
     */
    @Transactional
    public DeviceToken register(User user, String token, String platform) {
        String normalizedPlatform = platform == null || platform.isBlank()
                ? "ANDROID"
                : platform.trim().toUpperCase(Locale.ROOT);

        return deviceTokenRepository.findByToken(token)
                .map(existing -> {
                    existing.setUser(user);
                    existing.setPlatform(normalizedPlatform);
                    existing.setActive(true);
                    existing.setLastSeenAt(LocalDateTime.now());
                    return deviceTokenRepository.save(existing);
                })
                .orElseGet(() -> deviceTokenRepository.save(new DeviceToken(user, token, normalizedPlatform)));
    }

    /** Called on logout. Deactivates rather than deletes so delivery history stays readable. */
    @Transactional
    public void unregister(Long userId, String token) {
        deviceTokenRepository.findByToken(token).ifPresent(existing -> {
            // Only the owner may retire a token; otherwise anyone could silence another user.
            if (!existing.getUserId().equals(userId)) {
                log.warn("Refusing to unregister token owned by user {} on behalf of {}", existing.getUserId(), userId);
                return;
            }
            existing.setActive(false);
            deviceTokenRepository.save(existing);
        });
    }
}
