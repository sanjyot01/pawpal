package org.example.pet_social.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.example.pet_social.dto.BlindDatePetResponse;
import org.example.pet_social.dto.MyPetResponse;
import org.example.pet_social.dto.NearbyPetResponse;
import org.example.pet_social.dto.PetCreateRequest;
import org.example.pet_social.dto.PetResponse;
import org.example.pet_social.dto.WalkingPartnerResponse;
import org.example.pet_social.entity.Pet;
import org.example.pet_social.repository.PetRepository;
import org.example.pet_social.service.PetQueryService;
import org.example.pet_social.service.UserService;
import org.example.pet_social.entity.User;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.example.pet_social.web.RequestAuth;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/pets")
public class PetController {

    private final PetRepository petRepository;
    private final PetQueryService petQueryService;
    private final UserService userService;
    private final RequestAuth requestAuth;

    public PetController(PetRepository petRepository, PetQueryService petQueryService,
                         UserService userService, RequestAuth requestAuth) {
        this.petRepository = petRepository;
        this.petQueryService = petQueryService;
        this.userService = userService;
        this.requestAuth = requestAuth;
    }

    /** HomeMapScreen: pet pins around the viewport (locations come from Redis users:geo). */
    @GetMapping("/nearby")
    public List<NearbyPetResponse> nearby(@RequestParam double lat,
                                          @RequestParam double lon,
                                          @RequestParam(defaultValue = "5") double radiusKm,
                                          @RequestParam(defaultValue = "50") int limit) {
        return petQueryService.findNearbyPets(lat, lon, radiusKm, limit);
    }

    /**
     * FindPartnersScreen: walking-partner cards.
     * radiusKm is optional and clamped server-side (app.discovery.max-radius-km); omitting it
     * uses the default radius rather than the entire index.
     */
    @GetMapping("/partners")
    public List<WalkingPartnerResponse> partners(@RequestParam(required = false) Long userId,
                                                 @RequestParam(required = false) Double lat,
                                                 @RequestParam(required = false) Double lon,
                                                 @RequestParam(required = false) String species,
                                                 @RequestParam(required = false) Double radiusKm,
                                                 HttpServletRequest request) {
        return petQueryService.findWalkingPartners(viewerId(userId, request), lat, lon, species, radiusKm);
    }

    /** PetBlindDateScreen: swipe deck. */
    @GetMapping("/blind-dates")
    public List<BlindDatePetResponse> blindDates(@RequestParam(required = false) Long userId,
                                                 @RequestParam(required = false) Double lat,
                                                 @RequestParam(required = false) Double lon,
                                                 @RequestParam(required = false) String species,
                                                 @RequestParam(required = false) Double radiusKm,
                                                 HttpServletRequest request) {
        return petQueryService.findBlindDatePets(viewerId(userId, request), lat, lon, species, radiusKm);
    }

    /**
     * Who is looking — the id that gets excluded from their own feed. The token wins over the
     * userId query parameter whenever one is present, so a caller cannot put someone else's id
     * on the URL and be served a feed filtered for them. The parameter stays as the fallback
     * for the legacy unauthenticated callers this endpoint still accepts.
     */
    private Long viewerId(Long userIdParam, HttpServletRequest request) {
        return requestAuth.optionalUserId(request).orElse(userIdParam);
    }

    @GetMapping("/owner/{ownerId}")
    public List<PetResponse> byOwner(@PathVariable Long ownerId) {
        return petRepository.findWithOwnerByOwnerId(ownerId).stream().map(PetResponse::from).toList();
    }

    @GetMapping("/{id}")
    public ResponseEntity<PetResponse> get(@PathVariable Long id) {
        return petRepository.findById(id)
                .map(pet -> ResponseEntity.ok(PetResponse.from(pet)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** Mobile Me tab: the authenticated user's own pets. */
    @GetMapping("/my")
    public List<MyPetResponse> myPets(HttpServletRequest request) {
        return petRepository.findWithOwnerByOwnerId(requestAuth.requireUserId(request)).stream()
                .map(MyPetResponse::from)
                .toList();
    }

    @PostMapping
    public ResponseEntity<Object> create(@Valid @RequestBody PetCreateRequest req, HttpServletRequest request) {
        // Identity: Bearer token when present (mobile app), else legacy body ownerId (frontend1)
        Long ownerId = requestAuth.optionalUserId(request).orElse(req.ownerId());
        if (ownerId == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "ownerId or Bearer token required"));
        }
        User owner = userService.getUserById(ownerId);
        if (owner == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "owner not found"));
        }
        Pet pet = new Pet(owner, req.name(), req.species() == null ? "OTHER" : req.species().toUpperCase(), req.breed());
        applyFields(pet, req);
        pet.setIsAvailableForPlaydate(req.availableForPlaydate() == null || req.availableForPlaydate());
        return ResponseEntity.ok(MyPetResponse.from(petRepository.save(pet)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Object> update(@PathVariable Long id,
                                         @Valid @RequestBody PetCreateRequest req,
                                         HttpServletRequest request) {
        Long userId = requestAuth.requireUserId(request);
        Pet pet = petRepository.findById(id).orElse(null);
        if (pet == null) return ResponseEntity.notFound().build();
        if (!userId.equals(pet.getOwnerId())) {
            return ResponseEntity.status(403).body(Map.of("message", "not your pet"));
        }
        pet.setName(req.name());
        if (req.species() != null) pet.setSpecies(req.species().toUpperCase());
        pet.setBreed(req.breed());
        applyFields(pet, req);
        if (req.availableForPlaydate() != null) pet.setIsAvailableForPlaydate(req.availableForPlaydate());
        return ResponseEntity.ok(MyPetResponse.from(petRepository.save(pet)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Object> delete(@PathVariable Long id, HttpServletRequest request) {
        Long userId = requestAuth.requireUserId(request);
        Pet pet = petRepository.findById(id).orElse(null);
        if (pet == null) return ResponseEntity.notFound().build();
        if (!userId.equals(pet.getOwnerId())) {
            return ResponseEntity.status(403).body(Map.of("message", "not your pet"));
        }
        try {
            petRepository.delete(pet);
            petRepository.flush();
        } catch (org.springframework.dao.DataIntegrityViolationException ex) {
            // Reviews, matches or posts still reference this pet — refuse rather than cascade silently
            return ResponseEntity.status(409).body(Map.of("message",
                    "pet has related records (reviews/matches/posts) and cannot be deleted"));
        }
        return ResponseEntity.noContent().build();
    }

    private void applyFields(Pet pet, PetCreateRequest req) {
        pet.setGender(req.gender());
        pet.setDateOfBirth(req.dateOfBirth());
        pet.setBio(req.bio());
        if (req.avatarEmoji() != null) pet.setAvatarEmoji(req.avatarEmoji());
        if (req.personalityTags() != null) {
            pet.setPersonalityTags(String.join(",", req.personalityTags()));
        }
        pet.setIsVaccinated(req.vaccinated());
        pet.setIsNeutered(req.neutered());
        if (req.profilePhotoUrl() != null) pet.setProfilePhotoUrl(req.profilePhotoUrl());
        if (req.preferredWalkTime() != null) pet.setPreferredWalkTime(req.preferredWalkTime());
    }
}
