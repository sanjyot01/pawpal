package org.example.pet_social.web;

import java.time.Instant;

/**
 * Structured JSON error shape returned by GlobalExceptionHandler instead of
 * a raw stack trace / Spring's default error page.
 */
public record ErrorResponse(
        Instant timestamp,
        int status,
        String error,
        String message,
        String path,
        String correlationId
) {}