package org.example.pet_social.web;

import org.example.pet_social.service.JwtService;
import org.example.pet_social.service.LoginRateLimiter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    /** Allowed browser origins, from app.cors.allowed-origins (comma-separated). */
    private final String[] allowedOrigins;

    /** Whether a proxy in front of this app rewrites X-Forwarded-For (see LoginRateLimitFilter). */
    private final boolean trustForwardedFor;

    public WebConfig(@Value("${app.cors.allowed-origins:http://localhost:8081}") String allowedOrigins,
                     @Value("${app.ratelimit.trust-forwarded-for:false}") boolean trustForwardedFor) {
        this.allowedOrigins = allowedOrigins.split("\\s*,\\s*");
        this.trustForwardedFor = trustForwardedFor;
    }

    /** Restrict CORS to the configured origins instead of the previous wildcard. */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*");
    }

    /**
     * Throttle the endpoints that mint tokens. Ordered ahead of JwtAuthFilter because these
     * are exactly the paths that filter lets through unauthenticated — nothing else stands
     * between an anonymous caller and a BCrypt hash.
     */
    @Bean
    public FilterRegistrationBean<LoginRateLimitFilter> loginRateLimitFilter(LoginRateLimiter rateLimiter) {
        FilterRegistrationBean<LoginRateLimitFilter> registration =
                new FilterRegistrationBean<>(new LoginRateLimitFilter(rateLimiter, trustForwardedFor));
        // Must stay in step with JwtAuthFilter.PUBLIC_PATHS: every public path that costs
        // real CPU belongs here. /api/system/health is the one that deliberately does not.
        registration.addUrlPatterns(
                "/api/auth/login",
                "/api/auth/register",
                "/api/auth/google",
                "/api/users/login",
                "/api/users/register");
        registration.setOrder(5);
        return registration;
    }

    @Bean
    public FilterRegistrationBean<JwtAuthFilter> jwtAuthFilter(JwtService jwtService) {
        FilterRegistrationBean<JwtAuthFilter> registration = new FilterRegistrationBean<>(new JwtAuthFilter(jwtService));
        // Whole API surface behind the token gate; the filter itself allowlists the
        // token-minting endpoints and the health probe (see JwtAuthFilter.PUBLIC_PATHS).
        // The /dashboard HTML page is a browser tool (can't send a Bearer header) —
        // restrict it at the network layer or with a prod profile instead of this filter.
        registration.addUrlPatterns("/api/*");
        registration.setOrder(10);
        return registration;
    }
}
