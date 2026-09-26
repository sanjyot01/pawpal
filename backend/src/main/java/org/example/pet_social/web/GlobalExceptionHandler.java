package org.example.pet_social.web;

import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.time.Instant;
import java.util.stream.Collectors;

/**
 * Catches exceptions that escape controllers and returns a consistent JSON
 * error shape instead of a raw stack trace, while recording an error count
 * per exception type/status for the Prometheus/Grafana stack.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private final MeterRegistry meterRegistry;

    public GlobalExceptionHandler(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleBadRequest(IllegalArgumentException ex, HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, ex, request);
    }

    /** Bean Validation failures on @Valid request bodies → 400 with the field messages. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest request) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .sorted()
                .collect(Collectors.joining("; "));
        return respond(HttpStatus.BAD_REQUEST, new IllegalArgumentException(message), request);
    }

    /**
     * Services throw ResponseStatusException with a deliberate status (400/403/404);
     * without this handler they fall into the catch-all and surface as 500s.
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException ex, HttpServletRequest request) {
        HttpStatus status = HttpStatus.resolve(ex.getStatusCode().value());
        // Carry any headers the exception set — Retry-After on a 429 is part of the answer,
        // not decoration, and a client that honours it is the one we want to keep.
        return respond(status == null ? HttpStatus.INTERNAL_SERVER_ERROR : status,
                new Exception(ex.getReason() == null ? ex.getMessage() : ex.getReason()), request, ex.getHeaders());
    }

    /**
     * A missing or unparseable query parameter is the caller's mistake, not ours.
     * Without these it lands in the catch-all as a 500, which tells the client
     * nothing and files a server-error metric against a healthy server.
     */
    @ExceptionHandler({MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ErrorResponse> handleBadParameter(Exception ex, HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, ex, request);
    }

    /**
     * A body that isn't valid JSON is the same class of caller mistake as a bad
     * query parameter, but it was still reaching the catch-all: a truncated
     * request logged a stack trace and counted against the 5xx metric on an
     * otherwise healthy server. The parser's own message quotes the offending
     * input, so it is replaced rather than echoed back.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadableBody(HttpMessageNotReadableException ex, HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, new IllegalArgumentException("Malformed request body"), request);
    }

    /**
     * Unknown path → 404. Prometheus scraping a disabled /actuator/prometheus was
     * generating a 500 and a full stack trace every 5 seconds, which buries real
     * errors in the log and inflates the 5xx error metric.
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(NoResourceFoundException ex, HttpServletRequest request) {
        return respond(HttpStatus.NOT_FOUND, ex, request);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception ex, HttpServletRequest request) {
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, ex, request);
    }

    private ResponseEntity<ErrorResponse> respond(HttpStatus status, Exception ex, HttpServletRequest request) {
        return respond(status, ex, request, HttpHeaders.EMPTY);
    }

    private ResponseEntity<ErrorResponse> respond(HttpStatus status, Exception ex, HttpServletRequest request,
                                                  HttpHeaders headers) {
        String correlationId = String.valueOf(request.getAttribute(RequestLoggingFilter.CORRELATION_ID_ATTRIBUTE));

        meterRegistry.counter("errors.count",
                "exception", ex.getClass().getSimpleName(),
                "status", String.valueOf(status.value())
        ).increment();

        if (status.is5xxServerError()) {
            log.error("Unhandled exception on {} {} correlationId={}", request.getMethod(), request.getRequestURI(), correlationId, ex);
        } else {
            log.warn("Request error on {} {} correlationId={} message={}", request.getMethod(), request.getRequestURI(), correlationId, ex.getMessage());
        }

        ErrorResponse body = new ErrorResponse(
                Instant.now(),
                status.value(),
                status.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI(),
                correlationId
        );
        return ResponseEntity.status(status).headers(headers).body(body);
    }
}