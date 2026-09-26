package org.example.pet_social.dto;

/**
 * Request payload for walking-partner matching.
 * searchLatitude/searchLongitude describe where the user is looking for a
 * nearby match; preferencesMask is the bitmask of matching preferences to
 * require on the candidate.
 */
public record MatchRequest(
        double searchLatitude,
        double searchLongitude,
        long preferencesMask
) {}

