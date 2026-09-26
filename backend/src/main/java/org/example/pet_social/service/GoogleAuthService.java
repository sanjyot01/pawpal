package org.example.pet_social.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Optional;

/**
 * Verifies a Google Sign-In ID token via Google's tokeninfo endpoint
 * (signature, expiry and issuer are checked server-side by Google), then
 * enforces audience + email_verified here. Dependency-free on purpose —
 * swap for google-api-client JWT verification if offline validation is needed.
 */
@Service
public class GoogleAuthService {

    /** Verified identity claims extracted from the Google ID token. */
    public record GoogleIdentity(String email, String name, String pictureUrl) {}

    private static final Logger log = LoggerFactory.getLogger(GoogleAuthService.class);
    private static final String TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo?id_token=";

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final ObjectMapper objectMapper;
    private final String expectedAudience;

    public GoogleAuthService(ObjectMapper objectMapper,
                             @Value("${app.auth.google.client-id:}") String expectedAudience) {
        this.objectMapper = objectMapper;
        this.expectedAudience = expectedAudience;
    }

    /** Empty result = token invalid/expired/wrong audience/unverified email. */
    public Optional<GoogleIdentity> verify(String idToken) {
        if (idToken == null || idToken.isBlank()) {
            return Optional.empty();
        }
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(TOKENINFO_URL + URLEncoder.encode(idToken, StandardCharsets.UTF_8)))
                    .timeout(Duration.ofSeconds(5))
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.info("Google tokeninfo rejected an ID token (HTTP {})", response.statusCode());
                return Optional.empty();
            }
            JsonNode claims = objectMapper.readTree(response.body());
            if (!expectedAudience.isBlank() && !expectedAudience.equals(claims.path("aud").asText())) {
                log.warn("Google ID token audience mismatch: {}", claims.path("aud").asText());
                return Optional.empty();
            }
            if (!"true".equals(claims.path("email_verified").asText())) {
                return Optional.empty();
            }
            String email = claims.path("email").asText(null);
            if (email == null || email.isBlank()) {
                return Optional.empty();
            }
            String name = claims.path("name").asText("");
            return Optional.of(new GoogleIdentity(
                    email,
                    name.isBlank() ? email.substring(0, email.indexOf('@')) : name,
                    claims.path("picture").asText(null)));
        } catch (Exception e) {
            log.error("Google ID token verification failed", e);
            return Optional.empty();
        }
    }
}