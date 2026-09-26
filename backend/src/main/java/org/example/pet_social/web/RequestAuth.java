package org.example.pet_social.web;

import jakarta.servlet.http.HttpServletRequest;
import org.example.pet_social.service.JwtService;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

/**
 * Token-identity resolution for controllers whose URL patterns can't be gated
 * by JwtAuthFilter without breaking the open legacy endpoints that share the
 * same prefix (e.g. /api/pets/nearby stays public while POST /api/pets should
 * trust the token when one is sent). Behind the filter, prefer the request
 * attribute it already set; otherwise verify the Bearer header directly.
 */
@Component
public class RequestAuth {

    private final JwtService jwtService;

    public RequestAuth(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    /** The authenticated userId, if a valid Bearer token accompanied the request. */
    public Optional<Long> optionalUserId(HttpServletRequest request) {
        Object attr = request.getAttribute(JwtAuthFilter.AUTH_USER_ID);
        if (attr instanceof Long userId) {
            return Optional.of(userId);
        }
        String header = request.getHeader("Authorization");
        String token = header != null && header.startsWith("Bearer ") ? header.substring(7) : null;
        return jwtService.verify(token);
    }

    /** The authenticated userId, or 401 if the token is missing/invalid. */
    public Long requireUserId(HttpServletRequest request) {
        return optionalUserId(request)
                .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "Missing or invalid Bearer token"));
    }
}
