package org.example.pet_social.web;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GlobalExceptionHandlerTest {

    private GlobalExceptionHandler handler;
    private HttpServletRequest request;

    @BeforeEach
    void setUp() {
        handler = new GlobalExceptionHandler(new SimpleMeterRegistry());
        request = mock(HttpServletRequest.class);
        when(request.getAttribute(RequestLoggingFilter.CORRELATION_ID_ATTRIBUTE)).thenReturn("test-cid");
        when(request.getMethod()).thenReturn("POST");
        when(request.getRequestURI()).thenReturn("/api/test");
    }

    @Test
    void responseStatusExceptionKeepsItsDeliberateStatusAndReason() {
        ResponseEntity<ErrorResponse> res = handler.handleResponseStatus(
                new ResponseStatusException(HttpStatus.BAD_REQUEST, "hostPetId is required"), request);

        assertEquals(400, res.getStatusCode().value());
        assertEquals("hostPetId is required", res.getBody().message());
    }

    @Test
    void unexpectedExceptionStillMapsTo500() {
        ResponseEntity<ErrorResponse> res = handler.handleUnexpected(new RuntimeException("boom"), request);
        assertEquals(500, res.getStatusCode().value());
    }

    @Test
    void illegalArgumentMapsTo400() {
        ResponseEntity<ErrorResponse> res = handler.handleBadRequest(new IllegalArgumentException("bad input"), request);
        assertEquals(400, res.getStatusCode().value());
        assertEquals("bad input", res.getBody().message());
    }

    /** Caller sent ?lng= when the endpoint wants ?lon= — their mistake, not a server error. */
    @Test
    void missingRequestParameterMapsTo400() {
        ResponseEntity<ErrorResponse> res = handler.handleBadParameter(
                new MissingServletRequestParameterException("lon", "double"), request);
        assertEquals(400, res.getStatusCode().value());
    }

    /** An unknown path must not report the server as broken; Prometheus polling a
     *  disabled /actuator/prometheus was logging a 500 and a stack trace every 5s. */
    @Test
    void unknownPathMapsTo404() {
        ResponseEntity<ErrorResponse> res = handler.handleNotFound(
                new NoResourceFoundException(HttpMethod.GET, "/actuator/prometheus", "actuator/prometheus"), request);
        assertEquals(404, res.getStatusCode().value());
    }

    /** A truncated or non-JSON body used to reach the catch-all and answer 500,
     *  filing a server-error metric for what is entirely the caller's mistake. */
    @Test
    void malformedBodyMapsTo400WithoutEchoingTheInput() {
        ResponseEntity<ErrorResponse> res = handler.handleUnreadableBody(
                new HttpMessageNotReadableException(
                        "JSON parse error: Unexpected character ('n' (code 110))",
                        mock(HttpInputMessage.class)),
                request);

        assertEquals(400, res.getStatusCode().value());
        // The parser quotes the offending bytes back; that is not for the client.
        assertEquals("Malformed request body", res.getBody().message());
    }
}
