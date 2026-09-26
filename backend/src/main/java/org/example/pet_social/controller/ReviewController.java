package org.example.pet_social.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.example.pet_social.dto.UiFormat;
import org.example.pet_social.entity.Notification;
import org.example.pet_social.entity.Pet;
import org.example.pet_social.entity.Review;
import org.example.pet_social.entity.User;
import org.example.pet_social.repository.NotificationRepository;
import org.example.pet_social.repository.PetRepository;
import org.example.pet_social.repository.ReviewRepository;
import org.example.pet_social.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Pet reviews (1-5 stars). Writing a review recomputes pets.rating, which is
 * what the walking-partner cards display.
 */
@RestController
@RequestMapping("/api/reviews")
public class ReviewController {

    public record ReviewCreateRequest(
            @NotNull(message = "reviewerId is required") Long reviewerId,
            @NotNull(message = "petId is required") Long petId,
            @NotNull(message = "rating is required")
            @Min(value = 1, message = "rating must be between 1 and 5")
            @Max(value = 5, message = "rating must be between 1 and 5")
            Integer rating,
            @Size(max = 1000, message = "comment must be at most 1000 characters") String comment
    ) {}

    public record ReviewResponse(String id, Long reviewerId, String reviewerName, int rating, String comment, String time) {
        static ReviewResponse from(Review r) {
            return new ReviewResponse(String.valueOf(r.getId()), r.getReviewerId(), r.getReviewer().getName(),
                    r.getRating(), r.getComment(), UiFormat.relativeTime(r.getCreatedAt()));
        }
    }

    private final ReviewRepository reviewRepository;
    private final PetRepository petRepository;
    private final NotificationRepository notificationRepository;
    private final UserService userService;

    public ReviewController(ReviewRepository reviewRepository, PetRepository petRepository,
                            NotificationRepository notificationRepository, UserService userService) {
        this.reviewRepository = reviewRepository;
        this.petRepository = petRepository;
        this.notificationRepository = notificationRepository;
        this.userService = userService;
    }

    @GetMapping("/pet/{petId}")
    public List<ReviewResponse> forPet(@PathVariable Long petId) {
        return reviewRepository.findByPet_IdOrderByCreatedAtDesc(petId).stream()
                .map(ReviewResponse::from)
                .toList();
    }

    /** Create or update (one review per reviewer per pet), then refresh the pet's average rating. */
    @PostMapping
    @Transactional
    public ResponseEntity<Object> create(@Valid @RequestBody ReviewCreateRequest req) {
        User reviewer = userService.getUserById(req.reviewerId());
        Pet pet = petRepository.findById(req.petId()).orElse(null);
        if (reviewer == null || pet == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "reviewer or pet not found"));
        }
        if (pet.getOwner().getId().equals(reviewer.getId())) {
            return ResponseEntity.badRequest().body(Map.of("message", "cannot review your own pet"));
        }

        boolean isNew = true;
        Review review = reviewRepository.findByReviewer_IdAndPet_Id(reviewer.getId(), pet.getId()).orElse(null);
        if (review == null) {
            review = new Review(reviewer, pet, req.rating(), req.comment());
        } else {
            isNew = false;
            review.setRating(req.rating());
            review.setComment(req.comment());
        }
        reviewRepository.save(review);

        Double average = reviewRepository.averageRatingForPet(pet.getId());
        pet.setRating(average == null ? null : Math.round(average * 10.0) / 10.0);
        petRepository.save(pet);

        if (isNew) {
            Notification n = new Notification(pet.getOwner(), "REVIEW",
                    reviewer.getName() + " left a " + req.rating() + "-star review"
                            + (req.comment() == null || req.comment().isBlank() ? "" : ": \"" + req.comment() + "\""));
            n.setSender(reviewer);
            n.setSenderName(reviewer.getName());
            n.setPetName(pet.getName());
            n.setPetEmoji(UiFormat.petEmoji(pet));
            n.setRelated("PET", pet.getId());
            notificationRepository.save(n);
        }
        return ResponseEntity.ok(ReviewResponse.from(review));
    }
}
