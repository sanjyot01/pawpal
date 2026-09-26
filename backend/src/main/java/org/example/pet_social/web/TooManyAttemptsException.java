package org.example.pet_social.web;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * 429 that carries a Retry-After header.
 *
 * The per-address half of the login throttle is a servlet filter and sets the header itself.
 * The per-account half is thrown from AuthService, where the only route to the response is
 * GlobalExceptionHandler — which builds the body and, without this, would drop the one piece
 * of information a well-behaved client needs to back off correctly.
 */
public class TooManyAttemptsException extends ResponseStatusException {

    private final long retryAfterSeconds;

    public TooManyAttemptsException(String reason, long retryAfterSeconds) {
        super(HttpStatus.TOO_MANY_REQUESTS, reason);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    @Override
    public HttpHeaders getHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfterSeconds));
        return headers;
    }
}
