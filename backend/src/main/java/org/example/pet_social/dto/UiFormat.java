package org.example.pet_social.dto;

import org.example.pet_social.entity.Pet;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Formatting helpers that translate raw entity values into the display strings
 * the mobile app renders directly (see frontend/src/constants/mockData.ts).
 * Keeping the formatting server-side means the TS interfaces map 1:1 onto DTOs.
 */
public final class UiFormat {

    private static final DateTimeFormatter INVITE_DATE = DateTimeFormatter.ofPattern("EEE, MMM d", Locale.ENGLISH);
    private static final DateTimeFormatter INVITE_TIME = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH);

    private UiFormat() {}

    public static String petEmoji(Pet pet) {
        if (pet.getAvatarEmoji() != null && !pet.getAvatarEmoji().isBlank()) {
            return pet.getAvatarEmoji();
        }
        String species = pet.getSpecies() == null ? "" : pet.getSpecies().toUpperCase(Locale.ROOT);
        return switch (species) {
            case "DOG" -> "🐕";   // 🐕
            case "CAT" -> "🐱";   // 🐱
            default -> "🐾";      // 🐾
        };
    }

    /** DB species (DOG/CAT/...) → UI union 'Dog' | 'Cat' | 'Other'. */
    public static String speciesLabel(String species) {
        if (species == null) return "Other";
        return switch (species.toUpperCase(Locale.ROOT)) {
            case "DOG" -> "Dog";
            case "CAT" -> "Cat";
            default -> "Other";
        };
    }

    /** Age in the compact card format: "2y" for years, "8mo" under a year. */
    public static String age(LocalDate dateOfBirth) {
        if (dateOfBirth == null) return "";
        Period p = Period.between(dateOfBirth, LocalDate.now());
        if (p.getYears() > 0) return p.getYears() + "y";
        return Math.max(p.getMonths(), 1) + "mo";
    }

    /** CSV personality tags plus a derived 'Vaccinated' tag. */
    public static List<String> tags(Pet pet) {
        List<String> tags = new ArrayList<>();
        if (pet.getPersonalityTags() != null && !pet.getPersonalityTags().isBlank()) {
            for (String t : pet.getPersonalityTags().split(",")) {
                if (!t.isBlank()) tags.add(t.trim());
            }
        }
        if (Boolean.TRUE.equals(pet.getIsVaccinated()) && !tags.contains("Vaccinated")) {
            tags.add("Vaccinated");
        }
        return tags;
    }

    public static String distanceKm(Double km) {
        if (km == null) return "";
        return String.format(Locale.ENGLISH, "%.1f km", km);
    }

    public static String invitationDate(LocalDateTime dt) {
        return dt == null ? "" : INVITE_DATE.format(dt);
    }

    public static String invitationTime(LocalDateTime dt) {
        return dt == null ? "" : INVITE_TIME.format(dt);
    }

    /** "2 min ago" / "1 hr ago" / "Yesterday" / "3 days ago" for notification rows. */
    public static String relativeTime(LocalDateTime createdAt) {
        if (createdAt == null) return "";
        Duration d = Duration.between(createdAt, LocalDateTime.now());
        long minutes = Math.max(d.toMinutes(), 0);
        if (minutes < 1) return "Just now";
        if (minutes < 60) return minutes + " min ago";
        long hours = d.toHours();
        if (hours < 24) return hours + " hr ago";
        long days = d.toDays();
        if (days == 1) return "Yesterday";
        return days + " days ago";
    }

    /** DB category (BLIND_DATE) → NotifCategory union value ('blind_date'). */
    public static String notifCategory(String dbCategory) {
        return dbCategory == null ? "" : dbCategory.toLowerCase(Locale.ROOT);
    }

    public static String notifEmoji(String dbCategory) {
        if (dbCategory == null) return "🔔"; // 🔔
        return switch (dbCategory.toUpperCase(Locale.ROOT)) {
            case "BLIND_DATE" -> "💕";    // 💕
            case "WALK_REQUEST" -> "🚶";  // 🚶
            case "MESSAGE" -> "💬";       // 💬
            case "LIKE" -> "❤️";          // ❤️
            case "INVITATION" -> "🌿";    // 🌿
            case "MATCH" -> "✨";               // ✨
            case "REVIEW" -> "⭐";              // ⭐
            case "MARKETPLACE" -> "🛍️"; // 🛍️
            default -> "🔔";              // 🔔
        };
    }

    public static String notifLabel(String dbCategory) {
        if (dbCategory == null) return "";
        return switch (dbCategory.toUpperCase(Locale.ROOT)) {
            case "BLIND_DATE" -> "Blind Date";
            case "WALK_REQUEST" -> "Walk Request";
            case "MESSAGE" -> "Message";
            case "LIKE" -> "Like";
            case "INVITATION" -> "Invitation";
            case "MATCH" -> "Match";
            case "REVIEW" -> "Review";
            case "MARKETPLACE" -> "Marketplace";
            default -> capitalize(dbCategory);
        };
    }

    /** DB enum-ish value (LIKE_NEW, TOY) → display label ('Like New', 'Toy'). */
    public static String capitalize(String dbValue) {
        if (dbValue == null || dbValue.isBlank()) return "";
        String[] words = dbValue.toLowerCase(Locale.ROOT).split("[_\\s]+");
        StringBuilder sb = new StringBuilder();
        for (String w : words) {
            if (w.isBlank()) continue;
            if (sb.length() > 0) sb.append(' ');
            sb.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1));
        }
        return sb.toString();
    }

    /** Display label ('Like New', 'Toy') → DB value (LIKE_NEW, TOY). */
    public static String toDbValue(String label) {
        if (label == null || label.isBlank()) return null;
        return label.trim().toUpperCase(Locale.ROOT).replaceAll("\\s+", "_");
    }

    public static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371.0 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
