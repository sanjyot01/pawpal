package org.example.pet_social.entity;

public record UserLocation(
		Long userId,
		double latitude,
		double longitude
) {}
