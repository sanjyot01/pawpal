package org.example.pet_social.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.pet_social.service.LoginRateLimiter;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Per-address throttle in front of the token-minting endpoints (registered on those exact
 * paths in WebConfig, ahead of JwtAuthFilter). It runs before the body is parsed and before
 * any password hashing, which is the whole point: the cost being defended against is the
 * ~100 ms of BCrypt each attempt would otherwise buy for the price of one HTTP request.
 *
 * The per-account half of the limit lives in AuthService, where the email is already
 * parsed and the outcome of the attempt is known.
 */
public class LoginRateLimitFilter extends OncePerRequestFilter {

    private final LoginRateLimiter rateLimiter;
    private final boolean trustForwardedFor;

    public LoginRateLimitFilter(LoginRateLimiter rateLimiter, boolean trustForwardedFor) {
        this.rateLimiter = rateLimiter;
        this.trustForwardedFor = trustForwardedFor;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        // Preflight carries no credentials and triggers no hashing.
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            chain.doFilter(request, response);
            return;
        }

        LoginRateLimiter.Decision decision = rateLimiter.checkIp(clientIp(request));
        if (decision.allowed()) {
            chain.doFilter(request, response);
            return;
        }

        // The servlet API's SC_* constants stop at the original HTTP/1.1 codes; 429 came later.
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setHeader("Retry-After", String.valueOf(decision.retryAfterSeconds()));
        response.setContentType("application/json");
        response.getWriter().write("{\"message\":\"Too many attempts. Try again in "
                + decision.retryAfterSeconds() + " seconds.\"}");
    }

    /**
     * X-Forwarded-For is client-supplied and trivially spoofed, which would hand an attacker
     * a fresh budget per forged header — so it is only read when the deployment actually sits
     * behind a proxy that rewrites it (app.ratelimit.trust-forwarded-for). The single-instance
     * deployment takes connections directly, so it stays off there.
     */
    private String clientIp(HttpServletRequest request) {
        if (trustForwardedFor) {
            String forwarded = request.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank()) {
                // Left-most entry is the original client; everything after it is a proxy hop.
                int comma = forwarded.indexOf(',');
                String first = (comma < 0 ? forwarded : forwarded.substring(0, comma)).trim();
                if (!first.isEmpty()) {
                    return first;
                }
            }
        }
        return request.getRemoteAddr();
    }
}
