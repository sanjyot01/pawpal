package org.example.pet_social.dto;

import org.example.pet_social.entity.User;

/** Me-tab profile — 1:1 with the mobile app's UserProfile interface. */
public record UserProfileResponse(
        String id,
        String name,
        String email,
        String bio,
        String location,
        String avatarUrl
) {
    public static UserProfileResponse from(User u) {
        return new UserProfileResponse(String.valueOf(u.getId()), u.getName(), u.getEmail(),
                u.getBio(), u.getLocation(), u.getAvatarUrl());
    }
}