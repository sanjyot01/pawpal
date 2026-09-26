package org.example.pet_social.service;

import jakarta.persistence.EntityManager;
import org.example.pet_social.entity.Comment;
import org.example.pet_social.entity.Event;
import org.example.pet_social.entity.EventAttendee;
import org.example.pet_social.entity.Friendship;
import org.example.pet_social.entity.MarketplaceItem;
import org.example.pet_social.entity.Message;
import org.example.pet_social.entity.Notification;
import org.example.pet_social.entity.PartnerInvitation;
import org.example.pet_social.entity.PartnerRequest;
import org.example.pet_social.entity.Pet;
import org.example.pet_social.entity.Post;
import org.example.pet_social.entity.Review;
import org.example.pet_social.entity.User;
import org.example.pet_social.entity.UserLocation;
import org.example.pet_social.repository.CommentRepository;
import org.example.pet_social.repository.EventAttendeeRepository;
import org.example.pet_social.repository.EventRepository;
import org.example.pet_social.repository.FriendshipRepository;
import org.example.pet_social.repository.MarketplaceItemRepository;
import org.example.pet_social.repository.MessageRepository;
import org.example.pet_social.repository.NotificationRepository;
import org.example.pet_social.repository.PartnerInvitationRepository;
import org.example.pet_social.repository.PartnerRequestRepository;
import org.example.pet_social.repository.PetRepository;
import org.example.pet_social.repository.PostRepository;
import org.example.pet_social.repository.ReviewRepository;
import org.example.pet_social.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;

/**
 * Fills an empty deployment with the world described in {@link DemoSeedCatalog}: owners,
 * pets, posts, comments, events, listings, friendships, conversations and reviews, plus the
 * Redis presence that discovery actually reads.
 *
 * Three things this does that the older TestDataGeneratorService does not, and which are the
 * reason it exists alongside it rather than replacing it:
 *
 * <ol>
 *   <li><b>Presence, not just rows.</b> Seeded users are pushed through the real telemetry
 *       consumer, so they land in users:geo with a live users:presence:* key. Rows in Postgres
 *       alone leave the map and the partner feeds empty — that is the "seed presence, or the
 *       map will be empty" warning in deploy/SINGLE_INSTANCE.md, fixed at the source.</li>
 *   <li><b>Relocatable.</b> The catalogue is written around Toronto, but the whole city is
 *       translated to whatever centre the caller passes. Demoing from another continent with
 *       a distance-bounded partner feed would otherwise show an empty screen.</li>
 *   <li><b>Backdated.</b> created_at is rewritten after insert so the feed reads as a timeline
 *       rather than two hundred things that all happened this second.</li>
 * </ol>
 *
 * Seeding is one-shot: if the world is already present it reports what is there and changes
 * nothing. There is deliberately no delete path — a "reset" that can drop users is not
 * something worth having on a box that might hold real accounts. Start a fresh volume instead.
 */
@Service
public class DemoSeedService {

    private static final Logger log = LoggerFactory.getLogger(DemoSeedService.class);

    /** Presence of this account is what marks a deployment as already seeded. */
    private static final String MARKER_EMAIL = "maya.arjun@pawpal.demo";

    // The centre the catalogue's coordinates are written around. Passing a different centre
    // shifts every seeded point by the same delta, which keeps the neighbourhoods' relative
    // geometry (and therefore the distances between people) intact.
    private static final double CATALOG_CENTER_LAT = 43.6532;
    private static final double CATALOG_CENTER_LON = -79.3832;

    // Fixed seed: two runs against two fresh databases produce the same city.
    private static final long JITTER_SEED = 20260810L;

    /** What a seed run did. */
    public record SeedResult(boolean seeded, String message, Map<String, Integer> counts, List<String> logins) {}

    private final UserService userService;
    private final UserRepository userRepository;
    private final UserRegistryService userRegistryService;
    private final TelemetryConsumerService telemetryConsumerService;
    private final PetRepository petRepository;
    private final PostRepository postRepository;
    private final CommentRepository commentRepository;
    private final EventRepository eventRepository;
    private final EventAttendeeRepository eventAttendeeRepository;
    private final MarketplaceItemRepository marketplaceItemRepository;
    private final FriendshipRepository friendshipRepository;
    private final MessageRepository messageRepository;
    private final NotificationRepository notificationRepository;
    private final ReviewRepository reviewRepository;
    private final PartnerInvitationRepository invitationRepository;
    private final PartnerRequestRepository partnerRequestRepository;
    private final EntityManager entityManager;
    private final TransactionTemplate transactionTemplate;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final String demoPassword;

    public DemoSeedService(UserService userService,
                           UserRepository userRepository,
                           UserRegistryService userRegistryService,
                           TelemetryConsumerService telemetryConsumerService,
                           PetRepository petRepository,
                           PostRepository postRepository,
                           CommentRepository commentRepository,
                           EventRepository eventRepository,
                           EventAttendeeRepository eventAttendeeRepository,
                           MarketplaceItemRepository marketplaceItemRepository,
                           FriendshipRepository friendshipRepository,
                           MessageRepository messageRepository,
                           NotificationRepository notificationRepository,
                           ReviewRepository reviewRepository,
                           PartnerInvitationRepository invitationRepository,
                           PartnerRequestRepository partnerRequestRepository,
                           EntityManager entityManager,
                           TransactionTemplate transactionTemplate,
                           @Value("${app.demo-seed.password:pawpal-demo}") String demoPassword) {
        this.userService = userService;
        this.userRepository = userRepository;
        this.userRegistryService = userRegistryService;
        this.telemetryConsumerService = telemetryConsumerService;
        this.petRepository = petRepository;
        this.postRepository = postRepository;
        this.commentRepository = commentRepository;
        this.eventRepository = eventRepository;
        this.eventAttendeeRepository = eventAttendeeRepository;
        this.marketplaceItemRepository = marketplaceItemRepository;
        this.friendshipRepository = friendshipRepository;
        this.messageRepository = messageRepository;
        this.notificationRepository = notificationRepository;
        this.reviewRepository = reviewRepository;
        this.invitationRepository = invitationRepository;
        this.partnerRequestRepository = partnerRequestRepository;
        this.entityManager = entityManager;
        this.transactionTemplate = transactionTemplate;
        this.demoPassword = demoPassword;
    }

    public boolean alreadySeeded() {
        return userService.getUserByEmail(MARKER_EMAIL) != null;
    }

    /**
     * @param callerUserId the account that asked for the seed — it gets its own notifications
     *                     so the presenter's bell is not empty on the account they demo from
     * @param centerLat    centre to relocate the seeded city to, or null to keep Toronto
     * @param centerLon    see above
     */
    public SeedResult seed(Long callerUserId, Double centerLat, Double centerLon) {
        if (alreadySeeded()) {
            return new SeedResult(false, "Already seeded — nothing was changed.", currentCounts(), loginList());
        }

        double latOffset = centerLat == null ? 0.0 : centerLat - CATALOG_CENTER_LAT;
        double lonOffset = centerLon == null ? 0.0 : centerLon - CATALOG_CENTER_LON;

        long startedAt = System.currentTimeMillis();
        // One transaction for the whole world: a half-written city is worse than none, and
        // the presence writes below must not run against users that were rolled back.
        Map<String, Double[]> positions =
                transactionTemplate.execute(status -> persistWorld(callerUserId, latOffset, lonOffset));

        publishPresence(positions == null ? Map.of() : positions);

        Map<String, Integer> counts = currentCounts();
        log.info("Demo seed complete in {} ms: {}", System.currentTimeMillis() - startedAt, counts);
        return new SeedResult(true, "Seeded. Every account uses the same demo password.", counts, loginList());
    }

    /** Returns each seeded user's email → {lat, lon}, for the presence pass after commit. */
    private Map<String, Double[]> persistWorld(Long callerUserId, double latOffset, double lonOffset) {
        Random jitter = new Random(JITTER_SEED);
        LocalDateTime now = LocalDateTime.now();

        Map<String, DemoSeedCatalog.Neighbourhood> hoods = new HashMap<>();
        for (DemoSeedCatalog.Neighbourhood hood : DemoSeedCatalog.NEIGHBOURHOODS) {
            hoods.put(hood.name(), hood);
        }

        Map<String, User> usersByEmail = new LinkedHashMap<>();
        Map<String, Double[]> positionsByEmail = new LinkedHashMap<>();
        String passwordHash = encoder.encode(demoPassword);

        for (DemoSeedCatalog.Person person : DemoSeedCatalog.PEOPLE) {
            User user = new User(person.name(), person.email(), person.role(), true);
            user.setPasswordHash(passwordHash);
            user.setBio(person.bio());
            user.setLocation(person.neighbourhood() + ", Toronto");
            user.setMatchPreferencesMask(person.preferencesMask());
            // Through the registry, not the repository: this is what writes users:meta:*,
            // which matching reads for the active flag and the preferences bitmask.
            User saved = userRegistryService.registerUser(user);
            usersByEmail.put(person.email(), saved);

            DemoSeedCatalog.Neighbourhood hood = hoods.get(person.neighbourhood());
            positionsByEmail.put(person.email(), scatter(hood, jitter, latOffset, lonOffset));
        }

        Map<String, Pet> petsByName = new LinkedHashMap<>();
        for (DemoSeedCatalog.DemoPet demoPet : DemoSeedCatalog.PETS) {
            User owner = usersByEmail.get(demoPet.ownerEmail());
            Pet pet = new Pet(owner, demoPet.name(), demoPet.species(), demoPet.breed());
            pet.setDateOfBirth(LocalDate.now().minusMonths(demoPet.ageMonths()));
            pet.setGender(demoPet.gender());
            pet.setSize(demoPet.size());
            pet.setTemperament(demoPet.temperament());
            pet.setWeight(demoPet.weightKg());
            pet.setIsVaccinated(demoPet.vaccinated());
            pet.setIsNeutered(demoPet.neutered());
            pet.setIsAvailableForPlaydate(demoPet.availableForPlaydate());
            pet.setAvatarEmoji(demoPet.emoji());
            pet.setPersonalityTags(demoPet.tags());
            pet.setPreferredWalkTime(demoPet.walkTime());
            pet.setBio(demoPet.bio());
            petsByName.put(demoPet.name(), petRepository.save(pet));
        }

        List<Post> posts = new ArrayList<>();
        for (DemoSeedCatalog.DemoPost demoPost : DemoSeedCatalog.POSTS) {
            Post post = new Post(usersByEmail.get(demoPost.authorEmail()), demoPost.content());
            post.setPet(petsByName.get(demoPost.petName()));
            post.setLikeCount(demoPost.likes());
            post.setShareCount(demoPost.shares());
            post.setCommentCount(0);
            post.setVisibility("PUBLIC");
            post.setMediaType("NONE");
            Post saved = postRepository.save(post);
            posts.add(saved);
            backdate("posts", saved.getId(), now.minusHours(demoPost.hoursAgo()));
        }

        for (DemoSeedCatalog.DemoComment demoComment : DemoSeedCatalog.COMMENTS) {
            Post post = posts.get(demoComment.postIndex());
            Comment comment = new Comment(post, usersByEmail.get(demoComment.authorEmail()), demoComment.content());
            comment.setLikeCount(demoComment.likes());
            Comment saved = commentRepository.save(comment);
            post.setCommentCount(post.getCommentCount() + 1);
            // A comment lands somewhere between its post and now, never before it.
            int postAge = DemoSeedCatalog.POSTS.get(demoComment.postIndex()).hoursAgo();
            backdate("comments", saved.getId(), now.minusHours(Math.max(0, postAge - 1)));
        }
        postRepository.saveAll(posts);

        for (DemoSeedCatalog.DemoEvent demoEvent : DemoSeedCatalog.EVENTS) {
            DemoSeedCatalog.Neighbourhood hood = hoods.get(demoEvent.neighbourhood());
            Event event = new Event(usersByEmail.get(demoEvent.organizerEmail()), demoEvent.title(),
                    LocalDate.now().plusDays(demoEvent.daysFromNow()).atTime(demoEvent.hourOfDay(), 0));
            event.setDescription(demoEvent.description());
            event.setLocationName(demoEvent.neighbourhood());
            event.setLatitude(hood.latitude() + latOffset);
            event.setLongitude(hood.longitude() + lonOffset);
            event.setEventType(demoEvent.type());
            event.setPetSpecies(demoEvent.species());
            event.setMaxAttendees(demoEvent.maxAttendees());
            event.setEmoji(demoEvent.emoji());
            event.setStatus("UPCOMING");
            event.setCurrentAttendees(demoEvent.attendeeEmails().size());
            Event savedEvent = eventRepository.save(event);

            for (String attendeeEmail : demoEvent.attendeeEmails()) {
                eventAttendeeRepository.save(
                        new EventAttendee(savedEvent, usersByEmail.get(attendeeEmail), "GOING"));
            }
        }

        int listingAgeHours = 6;
        for (DemoSeedCatalog.DemoListing demoListing : DemoSeedCatalog.LISTINGS) {
            DemoSeedCatalog.Neighbourhood hood = hoods.get(demoListing.neighbourhood());
            MarketplaceItem item = new MarketplaceItem(usersByEmail.get(demoListing.sellerEmail()),
                    demoListing.name(), demoListing.price(), demoListing.category());
            item.setEmoji(demoListing.emoji());
            item.setOriginalPrice(demoListing.originalPrice());
            item.setCondition(demoListing.condition());
            item.setDescription(demoListing.description());
            item.setLocation(demoListing.neighbourhood());
            item.setLatitude(hood.latitude() + latOffset);
            item.setLongitude(hood.longitude() + lonOffset);
            item.setStatus(demoListing.status());
            MarketplaceItem saved = marketplaceItemRepository.save(item);
            backdate("marketplace_items", saved.getId(), now.minusHours(listingAgeHours));
            listingAgeHours += 9;
        }

        for (DemoSeedCatalog.DemoReview demoReview : DemoSeedCatalog.REVIEWS) {
            reviewRepository.save(new Review(usersByEmail.get(demoReview.reviewerEmail()),
                    petsByName.get(demoReview.petName()), demoReview.rating(), demoReview.comment()));
        }
        applyReviewRatings(petsByName);

        int conversationCount = 0;
        for (DemoSeedCatalog.DemoConversation conversation : DemoSeedCatalog.CONVERSATIONS) {
            User first = usersByEmail.get(conversation.firstEmail());
            User second = usersByEmail.get(conversation.secondEmail());
            // People who talk to each other are friends; the feed and the Me tab both read this.
            friendshipRepository.save(new Friendship(first, second, "ACCEPTED"));

            int lineIndex = 0;
            for (String line : conversation.lines()) {
                boolean fromFirst = lineIndex % 2 == 0;
                Message message = new Message(fromFirst ? first : second, fromFirst ? second : first, line);
                message.setMessageType("TEXT");
                // Everything but the last line of each thread has been read, so the unread
                // badge shows a believable number instead of every message ever sent.
                message.setIsRead(lineIndex < conversation.lines().size() - 1);
                Message saved = messageRepository.save(message);
                backdate("messages", saved.getId(),
                        now.minusHours(conversation.startedHoursAgo()).plusMinutes(lineIndex * 7L));
                lineIndex++;
            }
            conversationCount++;
        }
        log.debug("Seeded {} conversations", conversationCount);

        seedInvitations(usersByEmail, petsByName, hoods, latOffset, lonOffset, jitter);
        seedFriendshipWeb(usersByEmail);
        seedNotifications(usersByEmail, petsByName, now);
        seedCallerNotifications(callerUserId, usersByEmail, petsByName, now);

        return positionsByEmail;
    }

    /**
     * Notifications addressed to whoever ran the seed.
     *
     * Without these the presenter signs in to their own account and finds an empty bell —
     * the seeded tray belongs to seeded accounts, and the demo account is not one of them.
     * Three unread from three different people is enough for the badge to mean something.
     */
    private void seedCallerNotifications(Long callerUserId, Map<String, User> usersByEmail,
                                         Map<String, Pet> petsByName, LocalDateTime now) {
        if (callerUserId == null) {
            return;
        }
        User caller = userService.getUserById(callerUserId);
        if (caller == null || usersByEmail.containsKey(caller.getEmail())) {
            return;
        }

        record Greeting(String senderEmail, String category, String petName, String preview, int minutesAgo) {}
        List<Greeting> greetings = List.of(
                new Greeting("amara.sesay@pawpal.demo", "WALK_REQUEST", "Duchess",
                        "Duchess would like to join your next walk — Duchess is great with new dogs.", 12),
                new Greeting("theo.abara@pawpal.demo", "MARKETPLACE", "Biscuit",
                        "Theo replied about the biscuit sampler: fresh batch Tuesday, happy to hold one.", 95),
                new Greeting("isabelle.roy@pawpal.demo", "MATCH", "Juniper",
                        "Juniper accepted your playdate request! Say hello.", 260));

        for (Greeting greeting : greetings) {
            User sender = usersByEmail.get(greeting.senderEmail());
            Pet pet = petsByName.get(greeting.petName());
            Notification notification = new Notification(caller, greeting.category(), greeting.preview());
            notification.setSender(sender);
            notification.setSenderName(sender.getName());
            notification.setPetName(pet.getName());
            notification.setPetEmoji(pet.getAvatarEmoji());
            notification.setIsRead(false);
            Notification saved = notificationRepository.save(notification);
            backdate("notifications", saved.getId(), now.minusMinutes(greeting.minutesAgo()));
        }
    }

    /**
     * Walk and blind-date invitations, plus the requests other people have sent to them.
     *
     * These are the rows the app's three busiest screens actually read — HomeMapScreen and
     * FindPartnersScreen call /api/walk/invitations/feed, PetBlindDateScreen calls the date
     * equivalent. Seeding owners and pets without these leaves the map with no pins, the
     * partner board empty and the swipe deck with nothing in it, however full the pets table
     * looks. The pending requests give the invitation cards their "N requests" badge.
     */
    private void seedInvitations(Map<String, User> usersByEmail, Map<String, Pet> petsByName,
                                 Map<String, DemoSeedCatalog.Neighbourhood> hoods,
                                 double latOffset, double lonOffset, Random jitter) {
        DateTimeFormatter dateLabel = DateTimeFormatter.ofPattern("EEE, MMM d, yyyy", Locale.ENGLISH);

        for (DemoSeedCatalog.DemoInvitation demo : DemoSeedCatalog.INVITATIONS) {
            User host = usersByEmail.get(demo.hostEmail());
            Pet pet = petsByName.get(demo.petName());
            LocalDate day = LocalDate.now().plusDays(demo.daysFromNow());

            PartnerInvitation invitation = new PartnerInvitation(host, demo.type(), demo.place(),
                    day.format(dateLabel), demo.time());
            invitation.setMessage(demo.message());
            invitation.setDurationMinutes(demo.durationMinutes());
            invitation.setMaxSpots(demo.maxSpots());
            invitation.setHostPetIds(String.valueOf(pet.getId()));
            invitation.setScheduledAt(day.atTime(parseHour(demo.time()), parseMinute(demo.time())));
            invitation.setStatus(PartnerInvitation.STATUS_ACTIVE);

            // Meeting points are scattered like the people are, so the feed's distance sort
            // has something to sort by rather than a dozen cards all claiming 0.0 km.
            Double[] point = scatter(hoods.get(demo.neighbourhood()), jitter, latOffset, lonOffset);
            invitation.setLatitude(point[0]);
            invitation.setLongitude(point[1]);

            PartnerInvitation saved = invitationRepository.save(invitation);

            for (String requesterEmail : demo.requesterEmails()) {
                User requester = usersByEmail.get(requesterEmail);
                if (requester == null || requester.getId().equals(host.getId())) {
                    continue;
                }
                partnerRequestRepository.save(new PartnerRequest(saved, requester));
            }
        }
    }

    /** "6:30 AM" → 6, "5:00 PM" → 17. The display string is the only time the catalogue carries. */
    private int parseHour(String time) {
        String[] parts = time.split("[: ]");
        int hour = Integer.parseInt(parts[0]) % 12;
        return time.toUpperCase(Locale.ENGLISH).contains("PM") ? hour + 12 : hour;
    }

    private int parseMinute(String time) {
        return Integer.parseInt(time.split("[: ]")[1]);
    }

    /**
     * Pet ratings are shown on partner cards but stored on the pet, not derived — so after
     * writing the reviews, roll them up into the column the cards actually read.
     */
    private void applyReviewRatings(Map<String, Pet> petsByName) {
        Map<String, int[]> totals = new HashMap<>();
        for (DemoSeedCatalog.DemoReview review : DemoSeedCatalog.REVIEWS) {
            int[] sumAndCount = totals.computeIfAbsent(review.petName(), key -> new int[2]);
            sumAndCount[0] += review.rating();
            sumAndCount[1]++;
        }
        List<Pet> updated = new ArrayList<>();
        for (Pet pet : petsByName.values()) {
            int[] sumAndCount = totals.get(pet.getName());
            // Unreviewed pets keep a plausible default rather than rendering as 0.0 stars.
            double rating = sumAndCount == null
                    ? 4.5
                    : Math.round((10.0 * sumAndCount[0] / sumAndCount[1])) / 10.0;
            pet.setRating(rating);
            updated.add(pet);
        }
        petRepository.saveAll(updated);
    }

    /**
     * Friendships beyond the conversation pairs, so the graph is a neighbourhood rather than
     * five isolated pairs. Everyone is connected to the next two people in the catalogue,
     * which is enough for friend counts and friends-only feeds to look inhabited.
     */
    private void seedFriendshipWeb(Map<String, User> usersByEmail) {
        List<User> users = new ArrayList<>(usersByEmail.values());
        for (int i = 0; i < users.size(); i++) {
            for (int step = 1; step <= 2; step++) {
                User user = users.get(i);
                User friend = users.get((i + step) % users.size());
                if (user.getId().equals(friend.getId())
                        || friendshipRepository.findFriendshipBetween(user.getId(), friend.getId()).isPresent()) {
                    continue;
                }
                // Every seventh pair is left pending, so the requests screen has something in it.
                friendshipRepository.save(new Friendship(user, friend, i % 7 == 0 ? "PENDING" : "ACCEPTED"));
            }
        }
    }

    /** A believable notification tray for the first few accounts a presenter is likely to open. */
    private void seedNotifications(Map<String, User> usersByEmail, Map<String, Pet> petsByName, LocalDateTime now) {
        record Seed(String recipient, String sender, String category, String petName, String preview, boolean read, int hoursAgo) {}

        List<Seed> seeds = List.of(
                new Seed("maya.arjun@pawpal.demo", "clara.nguyen@pawpal.demo", "WALK_REQUEST", "Poppy",
                        "Poppy sent a walk request to Miso: Bellwoods at 7?", false, 1),
                new Seed("maya.arjun@pawpal.demo", "rahul.deshpande@pawpal.demo", "REVIEW", "Ziggy",
                        "Rahul left Miso a 4-star review.", false, 4),
                new Seed("maya.arjun@pawpal.demo", "priya.raman@pawpal.demo", "LIKE", "Nutmeg",
                        "Priya liked your post about the Bellwoods loop.", true, 9),
                new Seed("daniel.okafor@pawpal.demo", "isabelle.roy@pawpal.demo", "INVITATION", "Juniper",
                        "Isabelle invited Kofi to the reactive dog walk on Thursday.", false, 2),
                new Seed("daniel.okafor@pawpal.demo", "amara.sesay@pawpal.demo", "MATCH", "Duchess",
                        "Duchess accepted your playdate request! Say hello.", false, 6),
                new Seed("wei.chen@pawpal.demo", "elena.petrova@pawpal.demo", "WALK_REQUEST", "Bruno",
                        "Bruno sent a walk request to Nova: Saturday trail run, 7am.", false, 3),
                new Seed("anika.bose@pawpal.demo", "theo.abara@pawpal.demo", "MARKETPLACE", "Biscuit",
                        "Theo replied about the cooling mat: happy to hold it until Friday.", true, 14));

        for (Seed seed : seeds) {
            User recipient = usersByEmail.get(seed.recipient());
            User sender = usersByEmail.get(seed.sender());
            Pet pet = petsByName.get(seed.petName());
            Notification notification = new Notification(recipient, seed.category(), seed.preview());
            notification.setSender(sender);
            notification.setSenderName(sender.getName());
            notification.setPetName(pet.getName());
            notification.setPetEmoji(pet.getAvatarEmoji());
            notification.setIsRead(seed.read());
            Notification saved = notificationRepository.save(notification);
            backdate("notifications", saved.getId(), now.minusHours(seed.hoursAgo()));
        }
    }

    /**
     * Puts every seeded user on the map through the real telemetry consumer, so their geo
     * entry and presence key are written by exactly the code path a live ping uses — and
     * expire on the same 6h TTL. Runs after the transaction commits: presence for a user
     * whose row was rolled back would be a candidate that resolves to nothing.
     */
    private void publishPresence(Map<String, Double[]> positionsByEmail) {
        int placed = 0;
        for (Map.Entry<String, Double[]> entry : positionsByEmail.entrySet()) {
            User user = userService.getUserByEmail(entry.getKey());
            if (user == null) {
                continue;
            }
            Double[] position = entry.getValue();
            try {
                telemetryConsumerService.processTelemetry(new UserLocation(user.getId(), position[0], position[1]));
                placed++;
            } catch (RuntimeException ex) {
                log.warn("Could not place {} on the map: {}", entry.getKey(), ex.toString());
            }
        }
        log.info("Placed {} seeded users into users:geo with live presence", placed);
    }

    /** A point within roughly 600m of the neighbourhood centre, translated to the demo centre. */
    private Double[] scatter(DemoSeedCatalog.Neighbourhood hood, Random jitter, double latOffset, double lonOffset) {
        double latJitter = (jitter.nextDouble() - 0.5) * 0.011;   // ~±600 m
        double lonJitter = (jitter.nextDouble() - 0.5) * 0.015;   // ~±600 m at this latitude
        return new Double[]{
                hood.latitude() + latOffset + latJitter,
                hood.longitude() + lonOffset + lonJitter
        };
    }

    /**
     * created_at is set by @PrePersist and has no setter, which is correct for real writes and
     * useless for seed data — every post would claim to be from the same second. One targeted
     * update per row afterwards is the least invasive way to give the demo a timeline.
     * The table name is a constant from this class, never caller input.
     */
    private void backdate(String table, Long id, LocalDateTime when) {
        entityManager.createNativeQuery("update " + table + " set created_at = :ts where id = :id")
                .setParameter("ts", when)
                .setParameter("id", id)
                .executeUpdate();
    }

    public Map<String, Integer> currentCounts() {
        Map<String, Integer> counts = new LinkedHashMap<>();
        counts.put("users", (int) userRepository.count());
        counts.put("pets", (int) petRepository.count());
        counts.put("posts", (int) postRepository.count());
        counts.put("comments", (int) commentRepository.count());
        counts.put("events", (int) eventRepository.count());
        counts.put("marketplaceItems", (int) marketplaceItemRepository.count());
        counts.put("friendships", (int) friendshipRepository.count());
        counts.put("messages", (int) messageRepository.count());
        counts.put("reviews", (int) reviewRepository.count());
        counts.put("notifications", (int) notificationRepository.count());
        counts.put("invitations", (int) invitationRepository.count());
        counts.put("invitationRequests", (int) partnerRequestRepository.count());
        return counts;
    }

    /** Sign-in hints for whoever is running the demo; the password is the same for all of them. */
    public List<String> loginList() {
        return DemoSeedCatalog.PEOPLE.stream().map(DemoSeedCatalog.Person::email).toList();
    }
}
