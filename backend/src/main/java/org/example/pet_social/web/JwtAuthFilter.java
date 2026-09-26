package org.example.pet_social.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.pet_social.service.JwtService;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

/**
 * Bearer-token gate for the whole API surface (registered on /api/* in WebConfig).
 * Only the endpoints that mint tokens (register/login/google) and the health probe
 * are public — everything else requires a valid JWT. On success the authenticated
 * userId is exposed as request attribute {@link #AUTH_USER_ID}.
 */
public class JwtAuthFilter extends OncePerRequestFilter {

    public static final String AUTH_USER_ID = "authUserId";

    // Endpoints reachable without a token: the ones that issue tokens, and the
    // health probe (load balancers and uptime checks can't log in).
    private static final List<String> PUBLIC_PATHS = List.of(
            "/api/auth/register",
            "/api/auth/login",
            "/api/auth/google",
            "/api/users/register", // legacy aliases of /api/auth/*, kept for the original frontend
            "/api/users/login",
            "/api/system/health");

    private final JwtService jwtService;

    public JwtAuthFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        // CORS preflight requests carry no Authorization header by design
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            chain.doFilter(request, response);
            return;
        }
        if (PUBLIC_PATHS.contains(request.getRequestURI())) {
            chain.doFilter(request, response);
            return;
        }
        String header = request.getHeader("Authorization");
        String token = header != null && header.startsWith("Bearer ") ? header.substring(7) : null;
        Optional<Long> userId = jwtService.verify(token);
        if (userId.isEmpty()) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"message\":\"Missing or invalid Bearer token\"}");
            return;
        }
        request.setAttribute(AUTH_USER_ID, userId.get());
        chain.doFilter(request, response);
    }
}
