package org.example.pet_social.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.pet_social.dto.AppEvent;
import org.example.pet_social.dto.CompletedDateResponse;
import org.example.pet_social.dto.CompletedWalkResponse;
import org.example.pet_social.dto.DateFeedItemResponse;
import org.example.pet_social.dto.DateInvitationResponse;
import org.example.pet_social.dto.FeedCard;
import org.example.pet_social.dto.FeedPetInfo;
import org.example.pet_social.dto.PartnerNotificationResponse;
import org.example.pet_social.dto.UiFormat;
import org.example.pet_social.dto.WalkFeedItemResponse;
import org.example.pet_social.dto.WalkInvitationResponse;
import org.example.pet_social.entity.PartnerInvitation;
import org.example.pet_social.entity.PartnerRequest;
import org.example.pet_social.entity.Pet;
import org.example.pet_social.entity.User;
import org.example.pet_social.repository.MessageRepository;
import org.example.pet_social.repository.PartnerInvitationRepository;
import org.example.pet_social.repository.PartnerRequestRepository;
import org.example.pet_social.repository.PetRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import static org.example.pet_social.entity.PartnerInvitation.STATUS_ACTIVE;
import static org.example.pet_social.entity.PartnerInvitation.STATUS_CANCELLED;
import static org.example.pet_social.entity.PartnerInvitation.TYPE_DATE;
import static org.example.pet_social.entity.PartnerInvitation.TYPE_WALK;

/**
 * One engine for both partner boards (walk invitations and blind dates) —
 * the flows are identical, so WalkController/DateController delegate here
 * with a type discriminator. Performance shape:
 *  - the caller-agnostic feed is cached in Redis (feed:board:{type}, 30s TTL,
 *    invalidated on every invitation/request write that changes it), so the
 *    hot polling path skips the invitation/pet/user joins entirely;
 *  - per-caller personalization (my request, unread badge, distance) is three
 *    indexed queries + haversine in-process;
 *  - notification side effects go through Kafka (app-events), off this path.
 */
@Service
public class PartnerBoardService {

    public record InvitationBody(String route, String location, String date, String time, String message,
                                 Integer durationMinutes, Integer maxSpots, List<Long> hostPetIds,
                                 Long hostPetId, Double latitude, Double longitude, List<String> imageUrls,
                                 Double endLatitude, Double endLongitude) {}

    public record RequestSummary(String id, String invitationId, String status) {}

    public record UnreadSummary(String invitationId, long unreadCount) {}

    private static final Logger log = LoggerFactory.getLogger(PartnerBoardService.class);
    private static final Duration FEED_TTL = Duration.ofSeconds(30);

    private final PartnerInvitationRepository invitationRepository;
    private final PartnerRequestRepository requestRepository;
    private final PetRepository petRepository;
    private final MessageRepository messageRepository;
    private final UserService userService;
    private final AppEventsProducer appEventsProducer;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final double defaultRadiusKm;
    private final double maxRadiusKm;

    /**
     * The wall clock invitations are written in. date/time arrive as display strings the
     * phone formatted in its own zone ("Mon, Jul 5, 2026" + "9:00 AM") and scheduledAt keeps
     * them as that same naive local time -- so "has it passed?" has to be asked in that zone.
     * Comparing against the server clock instead read a 9pm booking in Toronto as already over,
     * because the container runs UTC and it was already 1am there: the invitation vanished from
     * the feed the moment it was posted and surfaced under Completed. A booking a day out
     * cleared the offset and behaved, which is why only same-day ones broke.
     */
    private final ZoneId zone;

    public PartnerBoardService(PartnerInvitationRepository invitationRepository,
                               PartnerRequestRepository requestRepository,
                               PetRepository petRepository,
                               MessageRepository messageRepository,
                               UserService userService,
                               AppEventsProducer appEventsProducer,
                               StringRedisTemplate redisTemplate,
                               ObjectMapper objectMapper,
                               @Value("${app.discovery.default-radius-km:25}") double defaultRadiusKm,
                               @Value("${app.discovery.max-radius-km:100}") double maxRadiusKm,
                               @Value("${app.timezone:America/Toronto}") String timezone) {
        this.invitationRepository = invitationRepository;
        this.requestRepository = requestRepository;
        this.petRepository = petRepository;
        this.messageRepository = messageRepository;
        this.userService = userService;
        this.appEventsProducer = appEventsProducer;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.defaultRadiusKm = defaultRadiusKm;
        this.maxRadiusKm = maxRadiusKm;
        this.zone = ZoneId.of(timezone);
    }

    // ---------------------------------------------------------------- feed

    public List<WalkFeedItemResponse> walkFeed(Long userId, Double lat, Double lng) {
        return walkFeed(userId, lat, lng, null);
    }

    public List<WalkFeedItemResponse> walkFeed(Long userId, Double lat, Double lng, Double radiusKm) {
        Map<Long, PartnerRequest> myRequests = myRequestsByInvitation(TYPE_WALK, userId);
        Map<Long, Long> unreadByRequest = countMap(
                messageRepository.countUnreadGroupedByContextId(userId, contextTypeFor(TYPE_WALK)));
        List<WalkFeedItemResponse> out = new ArrayList<>();
        for (FeedCard card : withinRadius(personalizableFeed(TYPE_WALK, userId), lat, lng, radiusKm)) {
            PartnerRequest mine = myRequests.get(card.id());
            Double distanceKm = distanceKm(lat, lng, card.latitude(), card.longitude());
            FeedPetInfo first = card.pets().isEmpty() ? null : card.pets().get(0);
            out.add(new WalkFeedItemResponse(
                    String.valueOf(card.id()), card.place(), card.date(), card.time(),
                    card.durationMinutes(), card.maxSpots(), card.spotsLeft(), card.message(),
                    String.valueOf(card.hostId()), card.hostName(), card.hostAvatarUrl(),
                    first == null ? null : first.petId(),
                    first == null ? null : first.petName(),
                    first == null ? null : first.petSpecies(),
                    first == null ? null : first.petBreed(),
                    first == null ? null : first.petGender(),
                    first == null ? null : first.petAge(),
                    first == null ? null : first.petProfilePhotoUrl(),
                    first == null ? null : first.petIsVaccinated(),
                    first == null ? null : first.petIsNeutered(),
                    distanceKm, distanceKm == null ? null : UiFormat.distanceKm(distanceKm),
                    mine == null ? null : String.valueOf(mine.getId()),
                    mine == null ? null : mine.getStatus(),
                    mine == null ? 0 : unreadByRequest.getOrDefault(mine.getId(), 0L).intValue(),
                    card.pets(), card.latitude(), card.longitude(),
                    card.endLatitude(), card.endLongitude()));
        }
        return out;
    }

    public List<DateFeedItemResponse> dateFeed(Long userId, Double lat, Double lng,
                                               String species, String age, String vaccine, String breed) {
        return dateFeed(userId, lat, lng, species, age, vaccine, breed, null);
    }

    public List<DateFeedItemResponse> dateFeed(Long userId, Double lat, Double lng,
                                               String species, String age, String vaccine, String breed,
                                               Double radiusKm) {
        Map<Long, PartnerRequest> myRequests = myRequestsByInvitation(TYPE_DATE, userId);
        Map<Long, Long> unreadByRequest = countMap(
                messageRepository.countUnreadGroupedByContextId(userId, contextTypeFor(TYPE_DATE)));
        List<DateFeedItemResponse> out = new ArrayList<>();
        for (FeedCard card : withinRadius(personalizableFeed(TYPE_DATE, userId), lat, lng, radiusKm)) {
            FeedPetInfo pet = card.pets().isEmpty() ? null : card.pets().get(0);
            if (!matchesDateFilters(pet, species, age, vaccine, breed)) continue;
            PartnerRequest mine = myRequests.get(card.id());
            Double distanceKm = distanceKm(lat, lng, card.latitude(), card.longitude());
            out.add(new DateFeedItemResponse(
                    String.valueOf(card.id()), String.valueOf(card.hostId()),
                    card.place(), card.date(), card.time(), card.message(),
                    card.hostName(), card.hostAvatarUrl(),
                    pet == null ? null : pet.petId(),
                    pet == null ? null : pet.petName(),
                    pet == null ? null : pet.petSpecies(),
                    pet == null ? null : pet.petBreed(),
                    pet == null ? null : pet.petGender(),
                    pet == null ? null : pet.petAge(),
                    pet == null ? null : pet.petProfilePhotoUrl(),
                    pet == null ? null : pet.petIsVaccinated(),
                    pet == null ? null : pet.petIsNeutered(),
                    distanceKm, distanceKm == null ? null : UiFormat.distanceKm(distanceKm),
                    mine == null ? null : String.valueOf(mine.getId()),
                    mine == null ? null : mine.getStatus(),
                    mine == null ? 0 : unreadByRequest.getOrDefault(mine.getId(), 0L).intValue(),
                    card.latitude(), card.longitude(), card.imageUrls()));
        }
        return out;
    }

    /** Cached caller-agnostic feed, minus the caller's own invitations. */
    private List<FeedCard> personalizableFeed(String type, Long userId) {
        return baseFeed(type).stream().filter(c -> c.hostId() != userId).toList();
    }

    /**
     * Drops cards outside the search radius and orders what is left nearest-first.
     *
     * These feeds computed a distance for every card and used it only to render the "4.2 km
     * away" label, so a walk on another continent sat in a list titled "Nearby Walking
     * Partners" — sorted by invitation id, which put it above one across the street. The
     * distance was always there; nothing acted on it.
     *
     * Cards with no coordinates are kept, at the end: an invitation whose host never set a
     * location is unplaceable, not far away, and silently hiding it would lose posts that
     * are otherwise valid. Without a caller position there is nothing to compare against,
     * so the feed is returned untouched.
     */
    private List<FeedCard> withinRadius(List<FeedCard> cards, Double lat, Double lng, Double radiusKm) {
        if (lat == null || lng == null) {
            return cards;
        }
        double limitKm = radiusKm == null || radiusKm <= 0 ? defaultRadiusKm : Math.min(radiusKm, maxRadiusKm);
        return cards.stream()
                .filter(card -> {
                    Double distanceKm = distanceKm(lat, lng, card.latitude(), card.longitude());
                    return distanceKm == null || distanceKm <= limitKm;
                })
                .sorted(Comparator.comparingDouble(card -> {
                    Double distanceKm = distanceKm(lat, lng, card.latitude(), card.longitude());
                    return distanceKm == null ? Double.MAX_VALUE : distanceKm;
                }))
                .toList();
    }

    private List<FeedCard> baseFeed(String type) {
        String key = "feed:board:" + type;
        try {
            String cached = redisTemplate.opsForValue().get(key);
            if (cached != null) {
                return objectMapper.readValue(cached, new TypeReference<List<FeedCard>>() {});
            }
        } catch (Exception e) {
            log.warn("feed cache read failed for {}", type, e);
        }

        List<FeedCard> cards = buildBaseFeed(type);
        try {
            redisTemplate.opsForValue().set(key, objectMapper.writeValueAsString(cards), FEED_TTL);
        } catch (Exception e) {
            log.warn("feed cache write failed for {}", type, e);
        }
        return cards;
    }

    private void invalidateFeed(String type) {
        try {
            redisTemplate.delete("feed:board:" + type);
        } catch (Exception e) {
            log.warn("feed cache invalidation failed for {}", type, e);
        }
    }

    private List<FeedCard> buildBaseFeed(String type) {
        List<PartnerInvitation> invitations = invitationRepository.findByTypeAndStatusOrderByCreatedAtDesc(type, STATUS_ACTIVE)
                .stream().filter(inv -> !isExpiredInvitation(inv)).toList();
        Map<Long, Long> accepted = countMap(requestRepository.countAcceptedByInvitation(ids(invitations)));
        Map<Long, Pet> petsById = loadPets(invitations);

        List<FeedCard> cards = new ArrayList<>(invitations.size());
        for (PartnerInvitation inv : invitations) {
            User host = inv.getHost();
            List<FeedPetInfo> pets = petIds(inv).stream()
                    .map(petsById::get)
                    .filter(Objects::nonNull)
                    .map(PartnerBoardService::petInfo)
                    .toList();
            int spotsLeft = inv.getMaxSpots() == null ? 0
                    : (int) Math.max(0, inv.getMaxSpots() - accepted.getOrDefault(inv.getId(), 0L));
            cards.add(new FeedCard(inv.getId(), host.getId(), host.getName(), host.getAvatarUrl(),
                    inv.getPlace(), inv.getDate(), inv.getTime(), inv.getMessage(),
                    inv.getDurationMinutes(), inv.getMaxSpots(), spotsLeft,
                    inv.getLatitude(), inv.getLongitude(), pets, imageUrls(inv),
                    inv.getEndLatitude(), inv.getEndLongitude()));
        }
        return cards;
    }

    // ------------------------------------------------------ my invitations

    public List<WalkInvitationResponse> myWalkInvitations(Long userId) {
        List<PartnerInvitation> mine = invitationRepository
                .findByTypeAndHost_IdAndStatusOrderByCreatedAtDesc(TYPE_WALK, userId, STATUS_ACTIVE)
                .stream().filter(inv -> !isExpiredInvitation(inv)).toList();
        Map<Long, Long> pending = countMap(requestRepository.countPendingByInvitation(ids(mine)));
        Map<Long, Long> accepted = countMap(requestRepository.countAcceptedByInvitation(ids(mine)));
        return mine.stream().map(inv -> toWalkInvitation(inv, pending, accepted)).toList();
    }

    public List<DateInvitationResponse> myDateInvitations(Long userId) {
        List<PartnerInvitation> mine = invitationRepository
                .findByTypeAndHost_IdAndStatusOrderByCreatedAtDesc(TYPE_DATE, userId, STATUS_ACTIVE)
                .stream().filter(inv -> !isExpiredInvitation(inv)).toList();
        Map<Long, Long> pending = countMap(requestRepository.countPendingByInvitation(ids(mine)));
        Map<Long, Pet> petsById = loadPets(mine);
        return mine.stream().map(inv -> toDateInvitation(inv, pending, petsById)).toList();
    }

    /**
     * Walks whose time has passed: everything I hosted (always, even with zero
     * participants) plus everything I was accepted into. Newest-completed first.
     */
    public List<CompletedWalkResponse> completedWalks(Long userId) {
        record Entry(LocalDateTime at, CompletedWalkResponse resp) {}
        List<Entry> entries = new ArrayList<>();

        List<PartnerInvitation> hosted = invitationRepository
                .findByTypeAndHost_IdAndStatusOrderByCreatedAtDesc(TYPE_WALK, userId, STATUS_ACTIVE)
                .stream().filter(this::isExpiredInvitation).toList();
        if (!hosted.isEmpty()) {
            List<PartnerRequest> hostRequests = requestRepository
                    .findByTypeAndInvitation_Host_IdOrderByCreatedAtDesc(TYPE_WALK, userId);
            Map<Long, List<PartnerRequest>> acceptedByInvitation = new HashMap<>();
            for (PartnerRequest r : hostRequests) {
                if (PartnerRequest.STATUS_ACCEPTED.equals(r.getStatus())) {
                    acceptedByInvitation.computeIfAbsent(r.getInvitationId(), k -> new ArrayList<>()).add(r);
                }
            }
            Map<Long, Pet> firstPetByRequester = firstPetByOwner(
                    hostRequests.stream().map(PartnerRequest::getRequesterId).distinct().toList());
            for (PartnerInvitation inv : hosted) {
                List<CompletedWalkResponse.Participant> participants = acceptedByInvitation
                        .getOrDefault(inv.getId(), List.of()).stream()
                        .map(r -> {
                            User requester = r.getRequester();
                            Pet pet = firstPetByRequester.get(requester.getId());
                            return new CompletedWalkResponse.Participant(
                                    String.valueOf(requester.getId()), requester.getName(), requester.getAvatarUrl(),
                                    pet == null ? null : pet.getName(), pet == null ? null : pet.getProfilePhotoUrl());
                        })
                        .toList();
                entries.add(new Entry(inv.getScheduledAt(), new CompletedWalkResponse(
                        String.valueOf(inv.getId()), inv.getPlace(), inv.getDate(), inv.getTime(),
                        inv.getDurationMinutes(), "HOST", null, null, participants)));
            }
        }

        for (PartnerRequest r : requestRepository.findByTypeAndRequester_IdOrderByCreatedAtDesc(TYPE_WALK, userId)) {
            if (!PartnerRequest.STATUS_ACCEPTED.equals(r.getStatus())) continue;
            PartnerInvitation inv = r.getInvitation();
            if (!isExpiredInvitation(inv)) continue;
            User host = inv.getHost();
            entries.add(new Entry(inv.getScheduledAt(), new CompletedWalkResponse(
                    String.valueOf(inv.getId()), inv.getPlace(), inv.getDate(), inv.getTime(),
                    inv.getDurationMinutes(), "PARTICIPANT", host.getName(), host.getAvatarUrl(), List.of())));
        }

        entries.sort(Comparator.comparing(Entry::at, Comparator.nullsLast(Comparator.reverseOrder())));
        return entries.stream().map(Entry::resp).toList();
    }

    /**
     * Blind dates whose time has passed: everything I hosted (always, even with
     * zero requesters) plus every date I was accepted into. Newest-completed first.
     */
    public List<CompletedDateResponse> completedDates(Long userId) {
        record Entry(LocalDateTime at, CompletedDateResponse resp) {}
        List<Entry> entries = new ArrayList<>();

        List<PartnerInvitation> hosted = invitationRepository
                .findByTypeAndHost_IdAndStatusOrderByCreatedAtDesc(TYPE_DATE, userId, STATUS_ACTIVE)
                .stream().filter(this::isExpiredInvitation).toList();
        if (!hosted.isEmpty()) {
            List<PartnerRequest> hostRequests = requestRepository
                    .findByTypeAndInvitation_Host_IdOrderByCreatedAtDesc(TYPE_DATE, userId);
            Map<Long, List<PartnerRequest>> acceptedByInvitation = new HashMap<>();
            for (PartnerRequest r : hostRequests) {
                if (PartnerRequest.STATUS_ACCEPTED.equals(r.getStatus())) {
                    acceptedByInvitation.computeIfAbsent(r.getInvitationId(), k -> new ArrayList<>()).add(r);
                }
            }
            Map<Long, Pet> firstPetByRequester = firstPetByOwner(
                    hostRequests.stream().map(PartnerRequest::getRequesterId).distinct().toList());
            for (PartnerInvitation inv : hosted) {
                List<CompletedDateResponse.Participant> participants = acceptedByInvitation
                        .getOrDefault(inv.getId(), List.of()).stream()
                        .map(r -> {
                            User requester = r.getRequester();
                            Pet pet = firstPetByRequester.get(requester.getId());
                            return new CompletedDateResponse.Participant(
                                    String.valueOf(requester.getId()), requester.getName(), requester.getAvatarUrl(),
                                    pet == null ? null : pet.getName(), pet == null ? null : pet.getProfilePhotoUrl());
                        })
                        .toList();
                entries.add(new Entry(inv.getScheduledAt(), new CompletedDateResponse(
                        String.valueOf(inv.getId()), inv.getPlace(), inv.getDate(), inv.getTime(),
                        "HOST", null, null, participants)));
            }
        }

        for (PartnerRequest r : requestRepository.findByTypeAndRequester_IdOrderByCreatedAtDesc(TYPE_DATE, userId)) {
            if (!PartnerRequest.STATUS_ACCEPTED.equals(r.getStatus())) continue;
            PartnerInvitation inv = r.getInvitation();
            if (!isExpiredInvitation(inv)) continue;
            User host = inv.getHost();
            entries.add(new Entry(inv.getScheduledAt(), new CompletedDateResponse(
                    String.valueOf(inv.getId()), inv.getPlace(), inv.getDate(), inv.getTime(),
                    "PARTICIPANT", host.getName(), host.getAvatarUrl(), List.of())));
        }

        entries.sort(Comparator.comparing(Entry::at, Comparator.nullsLast(Comparator.reverseOrder())));
        return entries.stream().map(Entry::resp).toList();
    }

    // ------------------------------------------------------ invitation CRUD

    public WalkInvitationResponse createWalkInvitation(Long userId, InvitationBody body) {
        PartnerInvitation inv = newInvitation(userId, TYPE_WALK, body.route(), body);
        inv.setDurationMinutes(body.durationMinutes() == null ? 60 : body.durationMinutes());
        inv.setMaxSpots(body.maxSpots() == null ? 4 : body.maxSpots());
        inv.setHostPetIds(ownedPetCsv(userId, body.hostPetIds()));
        invitationRepository.save(inv);
        invalidateFeed(TYPE_WALK);
        return toWalkInvitation(inv, Map.of(), Map.of());
    }

    public DateInvitationResponse createDateInvitation(Long userId, InvitationBody body) {
        if (body.hostPetId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "hostPetId is required");
        }
        PartnerInvitation inv = newInvitation(userId, TYPE_DATE, body.location(), body);
        inv.setHostPetIds(ownedPetCsv(userId, List.of(body.hostPetId())));
        invitationRepository.save(inv);
        invalidateFeed(TYPE_DATE);
        return toDateInvitation(inv, Map.of(), loadPets(List.of(inv)));
    }

    public WalkInvitationResponse updateWalkInvitation(Long userId, Long id, InvitationBody body) {
        PartnerInvitation inv = ownedInvitation(TYPE_WALK, userId, id);
        applyCommon(inv, body.route(), body);
        if (body.durationMinutes() != null) inv.setDurationMinutes(body.durationMinutes());
        if (body.maxSpots() != null) inv.setMaxSpots(body.maxSpots());
        if (body.hostPetIds() != null) inv.setHostPetIds(ownedPetCsv(userId, body.hostPetIds()));
        invitationRepository.save(inv);
        invalidateFeed(TYPE_WALK);
        Map<Long, Long> pending = countMap(requestRepository.countPendingByInvitation(List.of(id)));
        Map<Long, Long> accepted = countMap(requestRepository.countAcceptedByInvitation(List.of(id)));
        return toWalkInvitation(inv, pending, accepted);
    }

    public DateInvitationResponse updateDateInvitation(Long userId, Long id, InvitationBody body) {
        PartnerInvitation inv = ownedInvitation(TYPE_DATE, userId, id);
        applyCommon(inv, body.location(), body);
        if (body.hostPetId() != null) inv.setHostPetIds(ownedPetCsv(userId, List.of(body.hostPetId())));
        invitationRepository.save(inv);
        invalidateFeed(TYPE_DATE);
        Map<Long, Long> pending = countMap(requestRepository.countPendingByInvitation(List.of(id)));
        return toDateInvitation(inv, pending, loadPets(List.of(inv)));
    }

    public void cancelInvitation(String type, Long userId, Long id) {
        PartnerInvitation inv = ownedInvitation(type, userId, id);
        inv.setStatus(STATUS_CANCELLED);
        invitationRepository.save(inv);
        invalidateFeed(type);
    }

    // -------------------------------------------------------------- requests

    @Transactional
    public RequestSummary createRequest(String type, Long userId, Long invitationId) {
        PartnerInvitation inv = invitationRepository.findById(invitationId)
                .filter(i -> type.equals(i.getType()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "invitation not found"));
        if (!STATUS_ACTIVE.equals(inv.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invitation is no longer active");
        }
        if (isExpiredInvitation(inv)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "this " + (TYPE_WALK.equals(type) ? "walk" : "date") + " has already happened");
        }
        if (inv.getHostId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "cannot request your own invitation");
        }
        PartnerRequest existing = requestRepository.findByInvitation_IdAndRequester_Id(invitationId, userId).orElse(null);
        if (existing != null) {
            if (PartnerRequest.STATUS_BLOCKED.equals(existing.getStatus())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "blocked");
            }
            if (PartnerRequest.STATUS_REJECTED.equals(existing.getStatus())) {
                existing.setStatus(PartnerRequest.STATUS_PENDING); // re-request re-opens
                requestRepository.save(existing);
                notifyRequestCreated(type, userId, inv, existing);
            }
            return new RequestSummary(String.valueOf(existing.getId()),
                    String.valueOf(invitationId), existing.getStatus());
        }
        if (TYPE_WALK.equals(type) && inv.getMaxSpots() != null
                && requestRepository.countByInvitation_IdAndStatus(invitationId, PartnerRequest.STATUS_ACCEPTED) >= inv.getMaxSpots()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "walk-full");
        }
        User requester = userService.getUserById(userId);
        PartnerRequest request = requestRepository.save(new PartnerRequest(inv, requester));
        notifyRequestCreated(type, userId, inv, request);
        return new RequestSummary(String.valueOf(request.getId()), String.valueOf(invitationId), request.getStatus());
    }

    public List<RequestSummary> mySentRequests(String type, Long userId) {
        return requestRepository.findByTypeAndRequester_IdOrderByCreatedAtDesc(type, userId).stream()
                .map(r -> new RequestSummary(String.valueOf(r.getId()),
                        String.valueOf(r.getInvitationId()), r.getStatus()))
                .toList();
    }

    public List<UnreadSummary> mySentUnread(String type, Long userId) {
        List<PartnerRequest> mine = requestRepository.findByTypeAndRequester_IdOrderByCreatedAtDesc(type, userId);
        Map<Long, Long> unreadByRequest = countMap(
                messageRepository.countUnreadGroupedByContextId(userId, contextTypeFor(type)));
        return mine.stream()
                .map(r -> new UnreadSummary(String.valueOf(r.getInvitationId()),
                        unreadByRequest.getOrDefault(r.getId(), 0L)))
                .toList();
    }

    @Transactional
    public RequestSummary updateRequestStatus(String type, Long userId, Long requestId, String status) {
        String normalized = status == null ? "" : status.toUpperCase(Locale.ROOT);
        PartnerRequest request = requestRepository.findById(requestId)
                .filter(r -> type.equals(r.getType()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "request not found"));
        // PENDING is only a valid target as an "unblock" — reopening a request the host
        // themselves blocked, never a generic reset of an accepted/rejected request.
        boolean isUnblock = PartnerRequest.STATUS_PENDING.equals(normalized)
                && PartnerRequest.STATUS_BLOCKED.equals(request.getStatus());
        if (!isUnblock && !List.of(PartnerRequest.STATUS_ACCEPTED, PartnerRequest.STATUS_REJECTED, PartnerRequest.STATUS_BLOCKED)
                .contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status must be ACCEPTED, REJECTED or BLOCKED");
        }
        PartnerInvitation inv = request.getInvitation();
        if (!inv.getHostId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "only the host can resolve a request");
        }
        if (PartnerRequest.STATUS_ACCEPTED.equals(normalized) && TYPE_WALK.equals(type)
                && inv.getMaxSpots() != null
                && !PartnerRequest.STATUS_ACCEPTED.equals(request.getStatus())
                && requestRepository.countByInvitation_IdAndStatus(inv.getId(), PartnerRequest.STATUS_ACCEPTED) >= inv.getMaxSpots()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "walk-full");
        }
        request.setStatus(normalized);
        requestRepository.save(request);
        invalidateFeed(type); // spotsLeft may have changed
        String verb = isUnblock ? "reopened" : normalized.toLowerCase(Locale.ROOT);
        appEventsProducer.publish(new AppEvent(AppEvent.REQUEST_STATUS_CHANGED, userId, request.getRequesterId(),
                "PARTNER_REQUEST", request.getId(),
                "Your " + (TYPE_WALK.equals(type) ? "walk" : "date") + " request was " + verb
                        + ": " + inv.getPlace()));
        return new RequestSummary(String.valueOf(request.getId()),
                String.valueOf(request.getInvitationId()), request.getStatus());
    }

    // --------------------------------------------------------- notifications

    @Transactional(readOnly = true)
    public List<PartnerNotificationResponse> notifications(String type, Long userId) {
        String uiType = TYPE_WALK.equals(type) ? "walk_request" : "date_request";
        Map<Long, Long> unreadByRequest = countMap(
                messageRepository.countUnreadGroupedByContextId(userId, contextTypeFor(type)));

        List<PartnerNotificationResponse> out = new ArrayList<>();

        // Received: requests on my invitations, enriched with the requester's first pet
        List<PartnerRequest> received = requestRepository.findByTypeAndInvitation_Host_IdOrderByCreatedAtDesc(type, userId);
        Map<Long, Pet> requesterFirstPet = firstPetByOwner(received.stream().map(PartnerRequest::getRequesterId).toList());
        for (PartnerRequest r : received) {
            PartnerInvitation inv = r.getInvitation();
            User requester = r.getRequester();
            Pet pet = requesterFirstPet.get(requester.getId());
            out.add(new PartnerNotificationResponse(
                    String.valueOf(r.getId()), uiType, "received", r.getStatus(),
                    r.getCreatedAt().toString(), inv.getMessage(),
                    String.valueOf(inv.getId()),
                    TYPE_WALK.equals(type) ? inv.getPlace() : null,
                    TYPE_DATE.equals(type) ? inv.getPlace() : null,
                    inv.getDate(), inv.getTime(), inv.getDurationMinutes(),
                    String.valueOf(requester.getId()), requester.getName(), requester.getAvatarUrl(),
                    pet == null ? null : pet.getName(),
                    pet == null ? null : pet.getSpecies(),
                    pet == null ? null : pet.getBreed(),
                    pet == null ? null : UiFormat.age(pet.getDateOfBirth()),
                    pet == null ? null : pet.getProfilePhotoUrl(),
                    pet == null ? null : pet.getIsVaccinated(),
                    pet == null ? null : pet.getIsNeutered(),
                    null, null, null, null, null, null, null,
                    unreadByRequest.getOrDefault(r.getId(), 0L).intValue()));
        }

        // Sent: my requests, enriched with the host and the invitation's first pet
        List<PartnerRequest> sent = requestRepository.findByTypeAndRequester_IdOrderByCreatedAtDesc(type, userId);
        Map<Long, Pet> petsById = loadPets(sent.stream().map(PartnerRequest::getInvitation).toList());
        for (PartnerRequest r : sent) {
            PartnerInvitation inv = r.getInvitation();
            User host = inv.getHost();
            List<Long> hostPets = petIds(inv);
            Pet pet = hostPets.isEmpty() ? null : petsById.get(hostPets.get(0));
            out.add(new PartnerNotificationResponse(
                    String.valueOf(r.getId()), uiType, "sent", r.getStatus(),
                    r.getCreatedAt().toString(), inv.getMessage(),
                    String.valueOf(inv.getId()),
                    TYPE_WALK.equals(type) ? inv.getPlace() : null,
                    TYPE_DATE.equals(type) ? inv.getPlace() : null,
                    inv.getDate(), inv.getTime(), inv.getDurationMinutes(),
                    null, null, null, null, null, null, null, null, null, null,
                    String.valueOf(host.getId()), host.getName(), host.getAvatarUrl(),
                    pet == null ? null : pet.getName(),
                    pet == null ? null : pet.getSpecies(),
                    pet == null ? null : pet.getBreed(),
                    pet == null ? null : pet.getProfilePhotoUrl(),
                    unreadByRequest.getOrDefault(r.getId(), 0L).intValue()));
        }

        out.sort(Comparator.comparing(PartnerNotificationResponse::createdAt).reversed());
        return out;
    }

    /**
     * Both request participants, for message-thread authorization: [hostId, requesterId].
     * Force-initializes the lazy invitation while the session is open — the caller
     * (MessageController) reads pr.getInvitation().getHostId() after this method returns,
     * by which point open-in-view=false has already closed the session.
     */
    @Transactional(readOnly = true)
    public PartnerRequest requestForThread(String contextType, Long requestId) {
        String type = "WALK_REQUEST".equals(contextType) ? TYPE_WALK : TYPE_DATE;
        PartnerRequest pr = requestRepository.findById(requestId)
                .filter(r -> type.equals(r.getType()))
                .orElse(null);
        if (pr != null) {
            pr.getInvitation().getHostId();
        }
        return pr;
    }

    // ---------------------------------------------------------------- helpers

    private PartnerInvitation newInvitation(Long userId, String type, String place, InvitationBody body) {
        if (place == null || place.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    (TYPE_WALK.equals(type) ? "route" : "location") + " is required");
        }
        if (body.date() == null || body.time() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "date and time are required");
        }
        User host = userService.getUserById(userId);
        PartnerInvitation inv = new PartnerInvitation(host, type, place, body.date(), body.time());
        inv.setMessage(body.message());
        inv.setLatitude(body.latitude());
        inv.setLongitude(body.longitude());
        inv.setEndLatitude(body.endLatitude());
        inv.setEndLongitude(body.endLongitude());
        inv.setImageUrls(imageCsv(body.imageUrls()));
        inv.setScheduledAt(parseScheduledAt(body.date(), body.time()));
        return inv;
    }

    private void applyCommon(PartnerInvitation inv, String place, InvitationBody body) {
        if (place != null && !place.isBlank()) inv.setPlace(place);
        if (body.date() != null) inv.setDate(body.date());
        if (body.time() != null) inv.setTime(body.time());
        inv.setMessage(body.message());
        if (body.latitude() != null) inv.setLatitude(body.latitude());
        if (body.longitude() != null) inv.setLongitude(body.longitude());
        if (body.endLatitude() != null) inv.setEndLatitude(body.endLatitude());
        if (body.endLongitude() != null) inv.setEndLongitude(body.endLongitude());
        if (body.imageUrls() != null) inv.setImageUrls(imageCsv(body.imageUrls()));
        if (body.date() != null || body.time() != null) {
            inv.setScheduledAt(parseScheduledAt(inv.getDate(), inv.getTime()));
        }
    }

    // Matches exactly what the app's formatDate()/formatTime() produce, e.g. "Mon, Jul 5, 2026" + "9:00 AM".
    private static final DateTimeFormatter SCHEDULED_AT_FORMAT =
            DateTimeFormatter.ofPattern("EEE, MMM d, yyyy h:mm a", Locale.ENGLISH);

    /** Best-effort parse of the display date+time strings into a real instant; null if unparseable. */
    private static LocalDateTime parseScheduledAt(String date, String time) {
        if (date == null || time == null) return null;
        try {
            return LocalDateTime.parse(date + " " + time, SCHEDULED_AT_FORMAT);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /** An invitation (walk or date) whose scheduled time has passed. */
    private boolean isExpiredInvitation(PartnerInvitation inv) {
        return inv.getScheduledAt() != null && inv.getScheduledAt().isBefore(LocalDateTime.now(zone));
    }

    /** Pipe-joined image URLs, capped to 5 — mirrors ownedPetCsv's CSV-column pattern. */
    private static String imageCsv(List<String> urls) {
        if (urls == null || urls.isEmpty()) return null;
        List<String> capped = urls.stream().filter(u -> u != null && !u.isBlank()).limit(5).toList();
        return capped.isEmpty() ? null : String.join("|", capped);
    }

    private static List<String> imageUrls(PartnerInvitation inv) {
        if (inv.getImageUrls() == null || inv.getImageUrls().isBlank()) return List.of();
        return List.of(inv.getImageUrls().split("\\|"));
    }

    private PartnerInvitation ownedInvitation(String type, Long userId, Long id) {
        PartnerInvitation inv = invitationRepository.findById(id)
                .filter(i -> type.equals(i.getType()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "invitation not found"));
        if (!inv.getHostId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "not your invitation");
        }
        return inv;
    }

    /** CSV of the given pet ids, keeping only pets the user actually owns. */
    private String ownedPetCsv(Long userId, List<Long> petIds) {
        if (petIds == null || petIds.isEmpty()) return null;
        List<String> owned = petRepository.findWithOwnerByIdIn(petIds).stream()
                .filter(p -> userId.equals(p.getOwnerId()))
                .map(p -> String.valueOf(p.getId()))
                .toList();
        return owned.isEmpty() ? null : String.join(",", owned);
    }

    private void notifyRequestCreated(String type, Long requesterId, PartnerInvitation inv, PartnerRequest request) {
        User requester = userService.getUserById(requesterId);
        String eventType = TYPE_WALK.equals(type) ? AppEvent.WALK_REQUEST_CREATED : AppEvent.DATE_REQUEST_CREATED;
        String text = (requester == null ? "Someone" : requester.getName())
                + (TYPE_WALK.equals(type) ? " wants to join your walk: " : " requested a blind date: ")
                + inv.getPlace();
        appEventsProducer.publish(new AppEvent(eventType, requesterId, inv.getHostId(),
                "PARTNER_REQUEST", request.getId(), text));
    }

    /** My requests on one board, keyed by invitation id (one query per feed call). */
    private Map<Long, PartnerRequest> myRequestsByInvitation(String type, Long userId) {
        Map<Long, PartnerRequest> byInvitation = new HashMap<>();
        for (PartnerRequest r : requestRepository.findByTypeAndRequester_IdOrderByCreatedAtDesc(type, userId)) {
            byInvitation.putIfAbsent(r.getInvitationId(), r);
        }
        return byInvitation;
    }

    public static String contextTypeFor(String type) {
        return TYPE_WALK.equals(type) ? "WALK_REQUEST" : "DATE_REQUEST";
    }

    private WalkInvitationResponse toWalkInvitation(PartnerInvitation inv, Map<Long, Long> pending, Map<Long, Long> accepted) {
        int spotsLeft = inv.getMaxSpots() == null ? 0
                : (int) Math.max(0, inv.getMaxSpots() - accepted.getOrDefault(inv.getId(), 0L));
        return new WalkInvitationResponse(String.valueOf(inv.getId()), inv.getPlace(), inv.getDate(), inv.getTime(),
                inv.getDurationMinutes(), inv.getMaxSpots(), spotsLeft, inv.getMessage(), inv.getStatus(),
                petIds(inv).stream().map(String::valueOf).toList(),
                pending.getOrDefault(inv.getId(), 0L).intValue(),
                inv.getLatitude(), inv.getLongitude(), inv.getEndLatitude(), inv.getEndLongitude());
    }

    private DateInvitationResponse toDateInvitation(PartnerInvitation inv, Map<Long, Long> pending, Map<Long, Pet> petsById) {
        List<Long> ids = petIds(inv);
        Pet pet = ids.isEmpty() ? null : petsById.get(ids.get(0));
        return new DateInvitationResponse(String.valueOf(inv.getId()), String.valueOf(inv.getHostId()),
                ids.isEmpty() ? null : String.valueOf(ids.get(0)),
                inv.getPlace(), inv.getDate(), inv.getTime(), inv.getMessage(), inv.getStatus(),
                pending.getOrDefault(inv.getId(), 0L).intValue(),
                pet == null ? null : pet.getName(),
                pet == null ? null : pet.getSpecies(),
                pet == null ? null : pet.getBreed(),
                pet == null ? null : pet.getProfilePhotoUrl(),
                pet == null ? null : UiFormat.age(pet.getDateOfBirth()),
                imageUrls(inv));
    }

    private static FeedPetInfo petInfo(Pet pet) {
        return new FeedPetInfo(String.valueOf(pet.getId()), pet.getName(), pet.getSpecies(), pet.getBreed(),
                pet.getGender(), UiFormat.age(pet.getDateOfBirth()), pet.getProfilePhotoUrl(),
                pet.getIsVaccinated(), pet.getIsNeutered());
    }

    private static List<Long> ids(List<PartnerInvitation> invitations) {
        return invitations.stream().map(PartnerInvitation::getId).toList();
    }

    private static List<Long> petIds(PartnerInvitation inv) {
        if (inv.getHostPetIds() == null || inv.getHostPetIds().isBlank()) return List.of();
        List<Long> out = new ArrayList<>();
        for (String part : inv.getHostPetIds().split(",")) {
            try {
                out.add(Long.parseLong(part.trim()));
            } catch (NumberFormatException ignored) {
                // skip malformed entries
            }
        }
        return out;
    }

    /** Batch-load every pet referenced by the invitations' hostPetIds. */
    private Map<Long, Pet> loadPets(List<PartnerInvitation> invitations) {
        List<Long> allIds = invitations.stream().flatMap(i -> petIds(i).stream()).distinct().toList();
        if (allIds.isEmpty()) return Map.of();
        Map<Long, Pet> byId = new LinkedHashMap<>();
        for (Pet pet : petRepository.findWithOwnerByIdIn(allIds)) {
            byId.put(pet.getId(), pet);
        }
        return byId;
    }

    /** First (oldest) pet per owner, batch-loaded. */
    private Map<Long, Pet> firstPetByOwner(List<Long> ownerIds) {
        if (ownerIds.isEmpty()) return Map.of();
        Map<Long, Pet> byOwner = new HashMap<>();
        for (Pet pet : petRepository.findWithOwnerByOwnerIdIn(ownerIds.stream().distinct().toList())) {
            byOwner.merge(pet.getOwnerId(), pet,
                    (a, b) -> a.getId() <= b.getId() ? a : b);
        }
        return byOwner;
    }

    /** Applies the Pet Blind Date board's Species/Age/Vaccine/Breed filters against a card's first pet. */
    private static boolean matchesDateFilters(FeedPetInfo pet, String species, String age, String vaccine, String breed) {
        if (pet == null) return species == null && age == null && vaccine == null && breed == null;
        if (species != null && !species.isBlank()) {
            String s = pet.petSpecies() == null ? "" : pet.petSpecies();
            boolean isDog = "DOG".equalsIgnoreCase(s);
            boolean isCat = "CAT".equalsIgnoreCase(s);
            boolean matches = switch (species) {
                case "Dog" -> isDog;
                case "Cat" -> isCat;
                case "Other" -> !isDog && !isCat;
                default -> true;
            };
            if (!matches) return false;
        }
        if (vaccine != null && !vaccine.isBlank()) {
            boolean vaccinated = Boolean.TRUE.equals(pet.petIsVaccinated());
            if ("Yes".equals(vaccine) && !vaccinated) return false;
            if ("No".equals(vaccine) && vaccinated) return false;
        }
        if (breed != null && !breed.isBlank()) {
            if (pet.petBreed() == null || !pet.petBreed().equalsIgnoreCase(breed)) return false;
        }
        if (age != null && !age.isBlank() && !ageBucket(pet.petAge()).equals(age)) return false;
        return true;
    }

    /** Buckets a formatted pet age ("2y", "5mo") into the board's filter ranges. */
    private static String ageBucket(String petAge) {
        if (petAge == null || petAge.isBlank()) return "";
        if (petAge.endsWith("mo")) return "0-1y";
        if (petAge.endsWith("y")) {
            try {
                int years = Integer.parseInt(petAge.substring(0, petAge.length() - 1));
                if (years <= 1) return "0-1y";
                if (years <= 3) return "1-3y";
                if (years <= 7) return "3-7y";
                return "7y+";
            } catch (NumberFormatException ignored) {
                return "";
            }
        }
        return "";
    }

    private static Map<Long, Long> countMap(List<Object[]> rows) {
        Map<Long, Long> map = new HashMap<>();
        for (Object[] row : rows) {
            map.put(((Number) row[0]).longValue(), ((Number) row[1]).longValue());
        }
        return map;
    }

    private static Double distanceKm(Double lat, Double lng, Double invLat, Double invLng) {
        if (lat == null || lng == null || invLat == null || invLng == null) return null;
        return Math.round(UiFormat.haversineKm(lat, lng, invLat, invLng) * 10.0) / 10.0;
    }
}