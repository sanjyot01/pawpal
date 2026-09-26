package org.example.pet_social.service;

import java.util.List;

/**
 * The hand-written world that {@link DemoSeedService} persists: twenty owners across real
 * Toronto neighbourhoods, their pets, and the posts, events, listings, reviews and
 * conversations between them.
 *
 * It is written out rather than generated because generated data reads as generated —
 * "TestUser_417" with a random preferences bitmask fills a table without filling a screen.
 * Everything here is cross-referenced by email and pet name so the graph holds together:
 * the person who comments on a post is someone the author has actually walked with, and
 * the reviews are written by people who met at the events listed below.
 *
 * Coordinates are the real centres of each neighbourhood; DemoSeedService scatters each
 * person within a few hundred metres of theirs, which is what makes the map and the
 * distance-bounded partner feeds look like a city instead of a single pin.
 */
final class DemoSeedCatalog {

    private DemoSeedCatalog() {}

    record Neighbourhood(String name, double latitude, double longitude) {}

    record Person(String email, String name, String role, String neighbourhood, String bio, long preferencesMask) {}

    record DemoPet(String ownerEmail, String name, String species, String breed, String emoji, int ageMonths,
                   String gender, String size, String temperament, double weightKg, boolean vaccinated,
                   boolean neutered, boolean availableForPlaydate, String tags, String walkTime, String bio) {}

    record DemoPost(String authorEmail, String petName, String content, int likes, int shares, int hoursAgo) {}

    record DemoComment(int postIndex, String authorEmail, String content, int likes) {}

    record DemoEvent(String organizerEmail, String title, String description, String neighbourhood, String type,
                     String species, int maxAttendees, String emoji, int daysFromNow, int hourOfDay,
                     List<String> attendeeEmails) {}

    record DemoListing(String sellerEmail, String name, String emoji, double price, Double originalPrice,
                       String condition, String category, String neighbourhood, String description, String status) {}

    record DemoReview(String reviewerEmail, String petName, int rating, String comment) {}

    record DemoConversation(String firstEmail, String secondEmail, List<String> lines, int startedHoursAgo) {}

    /**
     * A walk or blind-date invitation — the rows behind the Home map pins, the Find Partners
     * board and the Blind Date deck. These are what those three screens read
     * (/api/walk|date/invitations/feed); pets and owners alone leave all of them empty.
     */
    record DemoInvitation(String hostEmail, String type, String place, String neighbourhood, String message,
                          String petName, Integer durationMinutes, Integer maxSpots, int daysFromNow,
                          String time, List<String> requesterEmails) {}

    static final List<Neighbourhood> NEIGHBOURHOODS = List.of(
            new Neighbourhood("Trinity Bellwoods", 43.6469, -79.4137),
            new Neighbourhood("High Park", 43.6465, -79.4637),
            new Neighbourhood("Leslieville", 43.6626, -79.3306),
            new Neighbourhood("The Beaches", 43.6710, -79.2966),
            new Neighbourhood("Liberty Village", 43.6376, -79.4207),
            new Neighbourhood("Riverdale", 43.6699, -79.3520),
            new Neighbourhood("Roncesvalles", 43.6478, -79.4497),
            new Neighbourhood("The Annex", 43.6700, -79.4000),
            new Neighbourhood("Distillery District", 43.6503, -79.3596),
            new Neighbourhood("Corktown", 43.6558, -79.3606),
            new Neighbourhood("The Junction", 43.6653, -79.4692),
            new Neighbourhood("Danforth", 43.6787, -79.3494));

    static final List<Person> PEOPLE = List.of(
            new Person("maya.arjun@pawpal.demo", "Maya Arjun", "PET_OWNER", "Trinity Bellwoods",
                    "Software developer, weekend hiker. Miso and I do the Bellwoods loop every morning before standup.", 7L),
            new Person("daniel.okafor@pawpal.demo", "Daniel Okafor", "PET_OWNER", "High Park",
                    "High Park regular. Looking for calm walking partners — my rescue is reactive around bigger groups.", 5L),
            new Person("priya.raman@pawpal.demo", "Priya Raman", "VET", "Roncesvalles",
                    "Small-animal vet on Roncesvalles. Happy to answer the question you were going to google at 2am.", 15L),
            new Person("jonas.lindqvist@pawpal.demo", "Jonas Lindqvist", "PET_OWNER", "Leslieville",
                    "Two beagles, zero free time. Early risers especially welcome.", 3L),
            new Person("amara.sesay@pawpal.demo", "Amara Sesay", "PET_SITTER", "The Beaches",
                    "Boarding and drop-in visits along the boardwalk. Insured, six years at it, references on request.", 31L),
            new Person("wei.chen@pawpal.demo", "Wei Chen", "PET_OWNER", "Liberty Village",
                    "Condo dog dad. Nova needs considerably more running than my knees can supply.", 7L),
            new Person("sofia.mendes@pawpal.demo", "Sofia Mendes", "PET_OWNER", "Riverdale",
                    "Riverdale Park East most evenings after six. Say hi if you see a terrier ignoring me.", 1L),
            new Person("theo.abara@pawpal.demo", "Theo Abara", "BUSINESS", "Distillery District",
                    "I run Barkside Bakery in the Distillery. Free sample for anyone who stops to say hello.", 15L),
            new Person("hannah.oleary@pawpal.demo", "Hannah O'Leary", "PET_OWNER", "The Annex",
                    "Grad student, permanently attached to one extremely loud terrier.", 5L),
            new Person("rahul.deshpande@pawpal.demo", "Rahul Deshpande", "PET_OWNER", "Corktown",
                    "New to the city and learning it one walk at a time. Coffee first, then distance.", 7L),
            new Person("keiko.tanaka@pawpal.demo", "Keiko Tanaka", "PET_OWNER", "The Junction",
                    "Junction local. Three cats, two of whom are — regrettably — leash trained.", 3L),
            new Person("marcus.bell@pawpal.demo", "Marcus Bell", "PET_SITTER", "Danforth",
                    "Dog walking along the Danforth. Small groups only, four at a time, never more.", 31L),
            new Person("elena.petrova@pawpal.demo", "Elena Petrova", "PET_OWNER", "High Park",
                    "Trail runner. Bruno keeps pace better than most of my human running partners.", 7L),
            new Person("samuel.adeyemi@pawpal.demo", "Samuel Adeyemi", "PET_OWNER", "Leslieville",
                    "Retired. Three walks a day, and I know every squirrel on Queen East by sight.", 1L),
            new Person("clara.nguyen@pawpal.demo", "Clara Nguyen", "PET_OWNER", "Trinity Bellwoods",
                    "Illustrator. My dog appears in most of my work, with or without her consent.", 5L),
            new Person("omar.haddad@pawpal.demo", "Omar Haddad", "PET_OWNER", "The Beaches",
                    "Boardwalk at sunrise, every day, rain included. Bring coffee and keep up.", 3L),
            new Person("isabelle.roy@pawpal.demo", "Isabelle Roy", "VET", "The Annex",
                    "Veterinary behaviourist. Reactive dogs are my entire practice — no judgement here, ever.", 15L),
            new Person("tom.whitfield@pawpal.demo", "Tom Whitfield", "PET_OWNER", "Riverdale",
                    "Two rescues in one very small apartment. It works, somehow.", 7L),
            new Person("anika.bose@pawpal.demo", "Anika Bose", "PET_OWNER", "Liberty Village",
                    "Off-leash hours at the Liberty dog park most weeknights. Coco makes friends faster than I do.", 5L),
            new Person("felix.moreau@pawpal.demo", "Felix Moreau", "PET_OWNER", "Roncesvalles",
                    "Bilingual dog, trilingual owner. Long walks strongly preferred over short ones.", 7L));

    static final List<DemoPet> PETS = List.of(
            new DemoPet("maya.arjun@pawpal.demo", "Miso", "DOG", "Shiba Inu", "🐕", 30, "FEMALE", "SMALL",
                    "ENERGETIC", 9.2, true, true, true, "Energetic,Good with dogs,Off-leash trained", "6:30 AM",
                    "Deeply dramatic about puddles. Otherwise faultless."),
            new DemoPet("daniel.okafor@pawpal.demo", "Kofi", "DOG", "Rhodesian Ridgeback mix", "🐕‍🦺", 54,
                    "MALE", "LARGE", "SHY", 34.0, true, true, true, "Calm pace,Needs space,Great one-on-one", "7:00 AM",
                    "Rescue, three years in. Brilliant with one steady friend, overwhelmed by a crowd."),
            new DemoPet("priya.raman@pawpal.demo", "Simba", "CAT", "Bengal", "🐈", 26, "MALE", "SMALL",
                    "PLAYFUL", 5.4, true, true, false, "Indoor,High energy", "", "Opens doors. We have accepted this."),
            new DemoPet("priya.raman@pawpal.demo", "Nutmeg", "DOG", "Cavalier King Charles Spaniel", "🐶", 18,
                    "FEMALE", "SMALL", "FRIENDLY", 7.8, true, false, true, "Friendly,Good with kids,Calm pace", "5:30 PM",
                    "Has never met a stranger. Will attempt to sit on you."),
            new DemoPet("jonas.lindqvist@pawpal.demo", "Otto", "DOG", "Beagle", "🐕", 60, "MALE", "MEDIUM",
                    "FRIENDLY", 12.5, true, true, true, "Friendly,Nose-driven,Good with dogs", "6:00 AM",
                    "Follows his nose into every hedge on Queen East. Worth it for the enthusiasm."),
            new DemoPet("jonas.lindqvist@pawpal.demo", "Pepper", "DOG", "Beagle", "🐕", 36, "FEMALE", "MEDIUM",
                    "ENERGETIC", 11.0, true, true, true, "Energetic,Vocal,Good with dogs", "6:00 AM",
                    "Otto's shadow and considerably louder about it."),
            new DemoPet("amara.sesay@pawpal.demo", "Duchess", "DOG", "Standard Poodle", "🐩", 72, "FEMALE",
                    "LARGE", "CALM", 24.0, true, true, true, "Calm pace,Great with puppies,Off-leash trained", "8:00 AM",
                    "Semi-retired from agility. Now supervises other people's puppies professionally."),
            new DemoPet("wei.chen@pawpal.demo", "Nova", "DOG", "Border Collie", "🐕", 24, "FEMALE", "MEDIUM",
                    "ENERGETIC", 17.5, true, false, true, "High energy,Needs a job,Off-leash trained", "6:45 AM",
                    "Will herd you, your friends, and any pigeon that makes eye contact."),
            new DemoPet("sofia.mendes@pawpal.demo", "Bandit", "DOG", "Jack Russell Terrier", "🐕", 42, "MALE",
                    "SMALL", "ENERGETIC", 7.1, true, true, true, "Energetic,Small but mighty", "6:15 PM",
                    "Convinced he is a much larger dog. Nobody has corrected him."),
            new DemoPet("theo.abara@pawpal.demo", "Biscuit", "DOG", "Golden Retriever", "🦮", 84, "MALE",
                    "LARGE", "CALM", 32.0, true, true, true, "Friendly,Calm pace,Good with kids", "7:30 AM",
                    "Shop dog at the bakery. Has never once stolen anything, which surprises everyone."),
            new DemoPet("hannah.oleary@pawpal.demo", "Wren", "DOG", "Cairn Terrier", "🐕", 20, "FEMALE",
                    "SMALL", "ENERGETIC", 6.3, true, false, true, "Energetic,Vocal,Good with dogs", "8:30 AM",
                    "Small, loud, and entirely certain she is in charge."),
            new DemoPet("rahul.deshpande@pawpal.demo", "Idli", "CAT", "Domestic Shorthair", "🐈", 14, "FEMALE",
                    "SMALL", "SHY", 3.9, true, true, false, "Indoor,Shy,Slow to warm up", "",
                    "Lives under the couch. Emerges for cheese."),
            new DemoPet("rahul.deshpande@pawpal.demo", "Ziggy", "DOG", "Whippet", "🐕", 33, "MALE", "MEDIUM",
                    "CALM", 13.2, true, true, true, "Calm pace,Sprinter,Couch specialist", "7:15 AM",
                    "Two speeds: asleep, and faster than everything in the park."),
            new DemoPet("keiko.tanaka@pawpal.demo", "Mochi", "CAT", "Ragdoll", "🐈", 48, "FEMALE", "MEDIUM",
                    "CALM", 5.8, true, true, false, "Indoor,Leash trained,Very calm", "",
                    "Walks on a harness. Draws a crowd every single time."),
            new DemoPet("keiko.tanaka@pawpal.demo", "Yuzu", "CAT", "Scottish Fold", "🐈‍⬛", 22, "MALE",
                    "SMALL", "PLAYFUL", 4.6, true, false, false, "Indoor,Playful", "",
                    "Believes every bag is for him. He is often right."),
            new DemoPet("marcus.bell@pawpal.demo", "Rufus", "DOG", "Labrador Retriever", "🦮", 66, "MALE",
                    "LARGE", "FRIENDLY", 30.5, true, true, true, "Friendly,Good with dogs,Water dog", "7:00 AM",
                    "Comes to work with me. Sets the tone for the whole group."),
            new DemoPet("elena.petrova@pawpal.demo", "Bruno", "DOG", "Vizsla", "🐕", 39, "MALE", "LARGE",
                    "ENERGETIC", 26.0, true, true, true, "High energy,Runner,Off-leash trained", "5:45 AM",
                    "Ten kilometres is a warm-up. Please do not offer him fifteen."),
            new DemoPet("samuel.adeyemi@pawpal.demo", "Sadie", "DOG", "Cocker Spaniel", "🐶", 96, "FEMALE",
                    "MEDIUM", "CALM", 13.9, true, true, true, "Calm pace,Senior,Good with kids", "9:00 AM",
                    "Eight years old and still insists on carrying her own leash."),
            new DemoPet("clara.nguyen@pawpal.demo", "Poppy", "DOG", "Dachshund", "🐕", 28, "FEMALE", "SMALL",
                    "PLAYFUL", 5.2, true, true, true, "Playful,Small but mighty,Good with dogs", "5:00 PM",
                    "Professional model, unpaid. Featured in roughly forty of my drawings."),
            new DemoPet("omar.haddad@pawpal.demo", "Zeus", "DOG", "German Shepherd", "🐕‍🦺", 45,
                    "MALE", "EXTRA_LARGE", "FRIENDLY", 38.0, true, true, true, "Friendly,Well trained,Good with dogs",
                    "6:00 AM", "Enormous, gentle, and terrified of the vacuum."),
            new DemoPet("isabelle.roy@pawpal.demo", "Juniper", "DOG", "Australian Shepherd", "🐕", 31, "FEMALE",
                    "MEDIUM", "PLAYFUL", 19.4, true, true, true, "Playful,Needs a job,Great with puppies", "7:45 AM",
                    "My demo dog for behaviour consults. Endlessly patient with nervous ones."),
            new DemoPet("tom.whitfield@pawpal.demo", "Pixel", "CAT", "Domestic Shorthair", "🐈‍⬛", 40,
                    "MALE", "SMALL", "SHY", 4.8, true, true, false, "Indoor,Shy", "",
                    "Tuxedo. Judges everyone equally."),
            new DemoPet("tom.whitfield@pawpal.demo", "Marlow", "DOG", "Greyhound", "🐕", 78, "MALE", "LARGE",
                    "CALM", 29.0, true, true, true, "Calm pace,Senior,Couch specialist", "8:00 AM",
                    "Retired racer. Twenty-two hours of sleep, two hours of blinding speed."),
            new DemoPet("anika.bose@pawpal.demo", "Coco", "DOG", "French Bulldog", "🐶", 25, "FEMALE", "SMALL",
                    "FRIENDLY", 11.3, true, false, true, "Friendly,Good with kids,Short walks", "6:30 PM",
                    "Makes friends in under four seconds. Snores like a chainsaw."),
            new DemoPet("felix.moreau@pawpal.demo", "Gaston", "DOG", "Bernese Mountain Dog", "🐕", 50, "MALE",
                    "EXTRA_LARGE", "CALM", 44.0, true, true, true, "Calm pace,Gentle giant,Good with kids", "7:30 AM",
                    "Forty-four kilos of enthusiasm for sitting down."),
            new DemoPet("felix.moreau@pawpal.demo", "Colette", "DOG", "Papillon", "🐕", 17, "FEMALE", "SMALL",
                    "PLAYFUL", 3.6, true, false, true, "Playful,Quick learner,Good with dogs", "7:30 AM",
                    "Learns a new trick roughly every week. Gaston is not impressed."));

    static final List<DemoPost> POSTS = List.of(
            new DemoPost("maya.arjun@pawpal.demo", "Miso", "Bellwoods at 6:30 is empty and the light is unreal. Miso disagrees — she wants the 8am crowd.", 42, 3, 2),
            new DemoPost("elena.petrova@pawpal.demo", "Bruno", "12k this morning through High Park. Bruno finished fresher than I did, which is becoming a pattern.", 67, 5, 5),
            new DemoPost("theo.abara@pawpal.demo", "Biscuit", "New batch of peanut butter biscuits out of the oven. Biscuit has been supervising from the doorway for an hour.", 128, 21, 7),
            new DemoPost("daniel.okafor@pawpal.demo", "Kofi", "Small win: Kofi walked past two dogs today without freezing. Eighteen months of work for that sentence.", 214, 12, 9),
            new DemoPost("keiko.tanaka@pawpal.demo", "Mochi", "Took Mochi out on the harness in the Junction and stopped traffic. Again.", 89, 7, 12),
            new DemoPost("jonas.lindqvist@pawpal.demo", "Otto", "Otto found something unspeakable in a hedge. We are both being punished with a bath.", 56, 2, 16),
            new DemoPost("amara.sesay@pawpal.demo", "Duchess", "Boarding is full through the long weekend — thank you all. Duchess is running orientation for the new arrivals.", 31, 1, 20),
            new DemoPost("wei.chen@pawpal.demo", "Nova", "Nova has learned to open the balcony door. Accepting suggestions, ideally before the weekend.", 103, 9, 26),
            new DemoPost("clara.nguyen@pawpal.demo", "Poppy", "Poppy sat still for eleven whole seconds so I could finish a sketch. Framed it out of respect.", 76, 4, 31),
            new DemoPost("isabelle.roy@pawpal.demo", "Juniper", "Reminder that a dog who barks at other dogs is not a bad dog — usually just a scared one. Juniper is proof; she was worse than yours.", 187, 34, 38),
            new DemoPost("omar.haddad@pawpal.demo", "Zeus", "Sunrise on the boardwalk, minus four, not a soul out. Zeus thinks this is the correct temperature.", 94, 6, 44),
            new DemoPost("sofia.mendes@pawpal.demo", "Bandit", "Bandit stared down a Great Dane in Riverdale Park today. The Dane left. I have never been prouder or more concerned.", 141, 18, 50),
            new DemoPost("marcus.bell@pawpal.demo", "Rufus", "Four dogs, one leash hand, zero incidents. Rufus does most of the actual management.", 62, 3, 57),
            new DemoPost("felix.moreau@pawpal.demo", "Colette", "Colette learned to spin this week. Gaston watched the entire session and then lay down.", 84, 5, 63),
            new DemoPost("priya.raman@pawpal.demo", "Nutmeg", "PSA from the clinic: it is tick season and it started early this year. Check behind the ears.", 156, 47, 70),
            new DemoPost("tom.whitfield@pawpal.demo", "Marlow", "Marlow ran for eight seconds today, then slept for six hours. Retired athlete behaviour.", 71, 4, 78),
            new DemoPost("anika.bose@pawpal.demo", "Coco", "Liberty dog park off-leash hours are the best part of my week. Coco has a whole social calendar I am not consulted on.", 58, 2, 86),
            new DemoPost("samuel.adeyemi@pawpal.demo", "Sadie", "Eight years old today. Sadie got a whole egg for breakfast and has been insufferable since.", 233, 15, 95));

    static final List<DemoComment> COMMENTS = List.of(
            new DemoComment(0, "clara.nguyen@pawpal.demo", "The 8am crowd is right and Miso knows it.", 4),
            new DemoComment(0, "hannah.oleary@pawpal.demo", "Wren and I are there most mornings — say hi next time.", 2),
            new DemoComment(1, "wei.chen@pawpal.demo", "Nova would love this. Are you doing the loop again Saturday?", 3),
            new DemoComment(1, "omar.haddad@pawpal.demo", "12k before work is a personal attack on the rest of us.", 9),
            new DemoComment(2, "anika.bose@pawpal.demo", "Coco and I will be there before noon. Save two.", 6),
            new DemoComment(3, "isabelle.roy@pawpal.demo", "This is enormous. Eighteen months of consistency is the whole game — well done.", 27),
            new DemoComment(3, "amara.sesay@pawpal.demo", "Genuinely thrilled for you both. Kofi has come so far.", 11),
            new DemoComment(3, "tom.whitfield@pawpal.demo", "Needed to read this today. Marlow had a rough week.", 5),
            new DemoComment(4, "priya.raman@pawpal.demo", "Mochi is the most famous cat on Dundas West at this point.", 8),
            new DemoComment(5, "samuel.adeyemi@pawpal.demo", "Beagles. It is always beagles.", 14),
            new DemoComment(7, "isabelle.roy@pawpal.demo", "Border collie with a closed door is a puzzle, not a barrier. Try a vertical handle cover.", 22),
            new DemoComment(7, "elena.petrova@pawpal.demo", "Give her a job before 8am and the door stops being interesting.", 16),
            new DemoComment(9, "daniel.okafor@pawpal.demo", "Saving this to send to everyone who has ever tutted at us in the park.", 41),
            new DemoComment(9, "sofia.mendes@pawpal.demo", "Booked a consult after reading this. Thank you.", 7),
            new DemoComment(11, "jonas.lindqvist@pawpal.demo", "Terriers simply do not have object permanence about their own size.", 19),
            new DemoComment(14, "marcus.bell@pawpal.demo", "Pulled two off Rufus this week already. Everyone check tonight.", 12),
            new DemoComment(14, "felix.moreau@pawpal.demo", "Gaston's coat makes this a twenty-minute job. Worth it.", 5),
            new DemoComment(17, "theo.abara@pawpal.demo", "Bring her by the bakery, birthday biscuit is on the house.", 31),
            new DemoComment(17, "keiko.tanaka@pawpal.demo", "Happy birthday Sadie! Eight looks good on her.", 8));

    static final List<DemoEvent> EVENTS = List.of(
            new DemoEvent("amara.sesay@pawpal.demo", "Saturday Puppy Social",
                    "Under-12-months only, so the little ones get a fair go without being flattened. Vaccination records required — bring a photo of the card, that is fine.",
                    "The Beaches", "PLAYDATE", "DOG", 20, "🐶", 3, 10,
                    List.of("priya.raman@pawpal.demo", "hannah.oleary@pawpal.demo", "felix.moreau@pawpal.demo", "anika.bose@pawpal.demo")),
            new DemoEvent("elena.petrova@pawpal.demo", "High Park Trail Run — Dogs Welcome",
                    "8k at a conversational pace. Off-leash-reliable dogs only, and please be honest with yourself about that.",
                    "High Park", "WALK", "DOG", 12, "🏃", 5, 7,
                    List.of("wei.chen@pawpal.demo", "omar.haddad@pawpal.demo", "maya.arjun@pawpal.demo")),
            new DemoEvent("isabelle.roy@pawpal.demo", "Reactive Dog Walk (Parallel Walking)",
                    "Structured parallel walk for dogs who struggle with greetings. Everyone stays at distance, nobody is asked to say hello. Free.",
                    "The Annex", "TRAINING", "DOG", 8, "🦮", 6, 18,
                    List.of("daniel.okafor@pawpal.demo", "tom.whitfield@pawpal.demo", "sofia.mendes@pawpal.demo")),
            new DemoEvent("theo.abara@pawpal.demo", "Barkside Bakery Anniversary",
                    "Three years on Mill Street. Free biscuit per dog, coffee for the humans, and the good camera will be out for portraits.",
                    "Distillery District", "PARTY", "ALL", 60, "🎂", 9, 12,
                    List.of("clara.nguyen@pawpal.demo", "anika.bose@pawpal.demo", "samuel.adeyemi@pawpal.demo",
                            "keiko.tanaka@pawpal.demo", "rahul.deshpande@pawpal.demo")),
            new DemoEvent("marcus.bell@pawpal.demo", "Danforth Morning Pack Walk",
                    "Loose, friendly group walk from Withrow Park. Any size, any pace — we split into two groups if the spread gets wide.",
                    "Danforth", "WALK", "DOG", 25, "🐕", 2, 8,
                    List.of("jonas.lindqvist@pawpal.demo", "samuel.adeyemi@pawpal.demo", "tom.whitfield@pawpal.demo")),
            new DemoEvent("priya.raman@pawpal.demo", "Ask-a-Vet in the Park",
                    "I will be on the bench by the south gate for two hours. Bring the question you have been putting off. No charge, no appointment.",
                    "Roncesvalles", "MEETUP", "ALL", 30, "🩺", 12, 11,
                    List.of("maya.arjun@pawpal.demo", "felix.moreau@pawpal.demo", "hannah.oleary@pawpal.demo", "wei.chen@pawpal.demo")));

    static final List<DemoListing> LISTINGS = List.of(
            new DemoListing("wei.chen@pawpal.demo", "Ruffwear Front Range harness (L)", "🦺", 45.0, 89.0,
                    "LIKE_NEW", "ACCESSORY", "Liberty Village",
                    "Nova outgrew it in four months. Two walks of wear, all buckles perfect. Red.", "ACTIVE"),
            new DemoListing("jonas.lindqvist@pawpal.demo", "Midwest 42\" wire crate", "🪚", 60.0, 145.0,
                    "GOOD", "CARRIER", "Leslieville",
                    "Divider panel and tray included. Some scuffs on the base, structurally perfect.", "ACTIVE"),
            new DemoListing("theo.abara@pawpal.demo", "Barkside biscuit sampler (12 pack)", "🍪", 18.0, null,
                    "NEW", "FOOD", "Distillery District",
                    "Peanut butter, pumpkin and oat. Baked Tuesday, no preservatives, best within two weeks.", "ACTIVE"),
            new DemoListing("amara.sesay@pawpal.demo", "Kong Extreme, size L — two of them", "🧸", 22.0, 38.0,
                    "GOOD", "TOY", "The Beaches",
                    "Survived a boarding house full of labs, which is the only review that matters.", "ACTIVE"),
            new DemoListing("felix.moreau@pawpal.demo", "Winter coat, XXL (Bernese fit)", "🧥", 55.0, 120.0,
                    "LIKE_NEW", "ACCESSORY", "Roncesvalles",
                    "Gaston wore it twice and decided he prefers the cold. Waterproof shell, fleece lining.", "ACTIVE"),
            new DemoListing("keiko.tanaka@pawpal.demo", "Cat harness + 3m lead", "🐈", 15.0, 32.0,
                    "GOOD", "ACCESSORY", "The Junction",
                    "The one Mochi actually tolerates. Escape-proof, adjustable, mint green.", "ACTIVE"),
            new DemoListing("samuel.adeyemi@pawpal.demo", "Orthopaedic memory foam bed (M)", "🛏️", 40.0, 95.0,
                    "GOOD", "OTHER", "Leslieville",
                    "Sadie has three. She has committed to one. Washable cover, no odours.", "ACTIVE"),
            new DemoListing("elena.petrova@pawpal.demo", "Hands-free running belt + bungee lead", "🏃", 28.0, 52.0,
                    "LIKE_NEW", "ACCESSORY", "High Park",
                    "Great kit, wrong size for me. Fits 28-34\" waist. Two pockets, reflective.", "ACTIVE"),
            new DemoListing("clara.nguyen@pawpal.demo", "Custom pet portrait (A4, ink)", "🎨", 85.0, null,
                    "NEW", "OTHER", "Trinity Bellwoods",
                    "Hand-drawn from your photos, roughly a week turnaround. Examples on my profile.", "ACTIVE"),
            new DemoListing("marcus.bell@pawpal.demo", "Slip leads, pack of 4", "🧵", 24.0, 44.0,
                    "NEW", "ACCESSORY", "Danforth",
                    "Over-ordered for the walking business. Six foot, rope, four colours.", "ACTIVE"),
            new DemoListing("anika.bose@pawpal.demo", "Cooling mat, medium", "🧊", 20.0, 45.0,
                    "GOOD", "OTHER", "Liberty Village",
                    "Made last August survivable for a flat-faced dog. Pressure-activated, no fridge needed.", "RESERVED"),
            new DemoListing("rahul.deshpande@pawpal.demo", "Cat tree, 1.5m", "🌳", 50.0, 130.0,
                    "GOOD", "OTHER", "Corktown",
                    "Idli refuses to use anything above the second platform. Sisal posts barely touched.", "ACTIVE"),
            new DemoListing("omar.haddad@pawpal.demo", "Long line, 15m biothane", "🪢", 30.0, 55.0,
                    "LIKE_NEW", "ACCESSORY", "The Beaches",
                    "Doesn't hold water or smell, unlike every rope one I've owned. Black.", "SOLD"),
            new DemoListing("hannah.oleary@pawpal.demo", "Puzzle feeder bundle (3)", "🧩", 26.0, 60.0,
                    "GOOD", "TOY", "The Annex",
                    "Wren solved all three inside a month. Someone else's dog deserves a turn.", "ACTIVE"));

    static final List<DemoReview> REVIEWS = List.of(
            new DemoReview("hannah.oleary@pawpal.demo", "Duchess", 5, "Duchess babysat Wren through her worst adolescent phase. Endless patience."),
            new DemoReview("felix.moreau@pawpal.demo", "Duchess", 5, "Colette learned how to be a dog from this one. Cannot recommend enough."),
            new DemoReview("maya.arjun@pawpal.demo", "Rufus", 5, "Rufus sets the tone for the whole group walk. Miso is calmer for a day after."),
            new DemoReview("tom.whitfield@pawpal.demo", "Juniper", 5, "Juniper let Marlow take twenty minutes to approach and never once pushed. Remarkable dog."),
            new DemoReview("daniel.okafor@pawpal.demo", "Juniper", 5, "The first dog Kofi has greeted calmly in a year. That is entirely down to how she reads him."),
            new DemoReview("wei.chen@pawpal.demo", "Bruno", 4, "Fantastic running partner for Nova, though he genuinely does not tire."),
            new DemoReview("clara.nguyen@pawpal.demo", "Biscuit", 5, "The most patient model in the city. Sat for a full forty minutes."),
            new DemoReview("anika.bose@pawpal.demo", "Biscuit", 5, "Coco adores him. He tolerates her completely, which is its own kind of love."),
            new DemoReview("sofia.mendes@pawpal.demo", "Otto", 4, "Great with Bandit. Loses roughly a star for the hedge incident."),
            new DemoReview("samuel.adeyemi@pawpal.demo", "Marlow", 5, "Perfect pace for a senior dog. Sadie has found her person."),
            new DemoReview("keiko.tanaka@pawpal.demo", "Nutmeg", 5, "Somehow gets on with cats. I did not think that was possible."),
            new DemoReview("rahul.deshpande@pawpal.demo", "Miso", 4, "Ziggy's favourite. Very vocal about puddles, as advertised."),
            new DemoReview("omar.haddad@pawpal.demo", "Nova", 5, "Outsmarts every dog on the boardwalk including mine. Brilliant to watch."),
            new DemoReview("elena.petrova@pawpal.demo", "Zeus", 5, "Gigantic and unfailingly gentle. Bruno's steadiest friend."),
            new DemoReview("jonas.lindqvist@pawpal.demo", "Gaston", 5, "Both beagles bounce off him and he simply does not mind. Saint."),
            new DemoReview("priya.raman@pawpal.demo", "Sadie", 5, "Textbook senior spaniel. Whatever Samuel is doing, it is working."));

    static final List<DemoInvitation> INVITATIONS = List.of(
            new DemoInvitation("maya.arjun@pawpal.demo", "WALK", "Trinity Bellwoods south gate", "Trinity Bellwoods",
                    "Easy 40-minute loop before work. Miso sets a brisk pace but waits at the corners.",
                    "Miso", 40, 4, 1, "6:30 AM", List.of("clara.nguyen@pawpal.demo", "hannah.oleary@pawpal.demo")),
            new DemoInvitation("elena.petrova@pawpal.demo", "WALK", "Grenadier Pond, High Park", "High Park",
                    "Proper 8k at pace. Off-leash-reliable dogs only, and please be honest about that.",
                    "Bruno", 75, 6, 2, "7:00 AM", List.of("wei.chen@pawpal.demo", "omar.haddad@pawpal.demo")),
            new DemoInvitation("marcus.bell@pawpal.demo", "WALK", "Withrow Park", "Danforth",
                    "Weekly pack walk. Any size, any pace — we split into two groups if the spread gets wide.",
                    "Rufus", 60, 8, 2, "8:00 AM", List.of("jonas.lindqvist@pawpal.demo", "samuel.adeyemi@pawpal.demo", "tom.whitfield@pawpal.demo")),
            new DemoInvitation("isabelle.roy@pawpal.demo", "WALK", "Sir Winston Churchill Park", "The Annex",
                    "Parallel walk for dogs who struggle with greetings. We stay at distance the whole way. Free.",
                    "Juniper", 45, 4, 3, "6:00 PM", List.of("daniel.okafor@pawpal.demo")),
            new DemoInvitation("omar.haddad@pawpal.demo", "WALK", "Woodbine Beach boardwalk", "The Beaches",
                    "Sunrise on the boardwalk. Rain does not cancel this. Coffee afterwards at the kiosk.",
                    "Zeus", 50, 5, 1, "6:00 AM", List.of("amara.sesay@pawpal.demo")),
            new DemoInvitation("samuel.adeyemi@pawpal.demo", "WALK", "Jimmie Simpson Park", "Leslieville",
                    "Slow senior-dog amble. Two benches, several stops, no hurry whatsoever.",
                    "Sadie", 30, 4, 2, "9:00 AM", List.of("tom.whitfield@pawpal.demo")),
            new DemoInvitation("anika.bose@pawpal.demo", "WALK", "Liberty Village dog park", "Liberty Village",
                    "Off-leash hour. Coco is small and fast and will befriend your dog immediately.",
                    "Coco", 45, 10, 3, "6:30 PM", List.of("wei.chen@pawpal.demo", "rahul.deshpande@pawpal.demo")),
            new DemoInvitation("felix.moreau@pawpal.demo", "WALK", "Sorauren Park", "Roncesvalles",
                    "Long one. Gaston is slow, Colette is not, so there is a pace for everyone.",
                    "Gaston", 90, 6, 4, "7:30 AM", List.of("priya.raman@pawpal.demo")),

            new DemoInvitation("clara.nguyen@pawpal.demo", "DATE", "Trinity Bellwoods dog bowl", "Trinity Bellwoods",
                    "Poppy is looking for a small, playful friend. Short legs, big opinions.",
                    "Poppy", null, null, 2, "5:00 PM", List.of("sofia.mendes@pawpal.demo", "hannah.oleary@pawpal.demo")),
            new DemoInvitation("priya.raman@pawpal.demo", "DATE", "High Park picnic tables", "High Park",
                    "Nutmeg has never met a stranger and would like to keep that record going.",
                    "Nutmeg", null, null, 3, "4:30 PM", List.of("anika.bose@pawpal.demo")),
            new DemoInvitation("wei.chen@pawpal.demo", "DATE", "Liberty Village green", "Liberty Village",
                    "Nova needs a friend with stamina. Herding attempts are included at no extra cost.",
                    "Nova", null, null, 1, "6:00 PM", List.of("elena.petrova@pawpal.demo", "isabelle.roy@pawpal.demo")),
            new DemoInvitation("tom.whitfield@pawpal.demo", "DATE", "Riverdale Park East", "Riverdale",
                    "Marlow would like a calm friend who also considers lying down a full activity.",
                    "Marlow", null, null, 4, "3:00 PM", List.of("samuel.adeyemi@pawpal.demo")),
            new DemoInvitation("hannah.oleary@pawpal.demo", "DATE", "Christie Pits", "The Annex",
                    "Wren is small, loud and convinced she runs the park. Seeking someone unbothered by that.",
                    "Wren", null, null, 2, "5:30 PM", List.of("maya.arjun@pawpal.demo", "clara.nguyen@pawpal.demo")),
            new DemoInvitation("keiko.tanaka@pawpal.demo", "DATE", "Vine Avenue Parkette", "The Junction",
                    "Mochi walks on a harness and would like to meet a cat who also does. Long shot, posting anyway.",
                    "Mochi", null, null, 5, "2:00 PM", List.of("rahul.deshpande@pawpal.demo")));

    static final List<DemoConversation> CONVERSATIONS = List.of(
            new DemoConversation("maya.arjun@pawpal.demo", "clara.nguyen@pawpal.demo", List.of(
                    "Bellwoods tomorrow at 7? Miso needs to burn something off before I start work.",
                    "Yes — Poppy is climbing the walls. South gate?",
                    "South gate works. I'll bring the good coffee.",
                    "Then I'll bring the ball she refuses to give back. See you at 7."), 9),
            new DemoConversation("daniel.okafor@pawpal.demo", "isabelle.roy@pawpal.demo", List.of(
                    "Kofi got past two dogs on Bloor today without freezing up.",
                    "That's the whole eighteen months paying off. How was his body language after?",
                    "Loose. He shook it off and kept going, which is new.",
                    "Perfect. Keep the distance where it is for another fortnight before you close any of it."), 20),
            new DemoConversation("wei.chen@pawpal.demo", "elena.petrova@pawpal.demo", List.of(
                    "Is the Saturday trail run still on? Nova has decided the balcony door is a puzzle.",
                    "Still on, 7am at the Grenadier gate. Bring her, it'll help.",
                    "Warning: she will try to herd the group.",
                    "Bruno will simply outrun the problem. See you Saturday."), 32),
            new DemoConversation("anika.bose@pawpal.demo", "theo.abara@pawpal.demo", List.of(
                    "Are you doing the anniversary thing again this year?",
                    "Ninth of the month, from noon. Free biscuit per dog and I'm bringing the good camera.",
                    "Coco will be there in something embarrassing.",
                    "She always is. Save me a portrait slot."), 46),
            new DemoConversation("jonas.lindqvist@pawpal.demo", "marcus.bell@pawpal.demo", List.of(
                    "Room for two beagles on the Tuesday pack walk?",
                    "Always. Both good with the big ones?",
                    "Otto yes. Pepper is loud but harmless.",
                    "That's the whole group, honestly. Withrow at 8."), 58));
}
