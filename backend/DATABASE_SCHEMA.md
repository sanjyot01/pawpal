# PawPal Database Schema Documentation

Complete database schema for the PawPal pet social networking platform.

## Overview

The PawPal database consists of **12 core tables** supporting:
- User management and authentication (BCrypt password hashes, JWT bearer tokens)
- Pet profiles and ownership
- Social networking (friendships, posts, comments)
- Events and meetups (walk invitations are WALK-type events)
- Direct messaging (thread-scoped to matches/listings via context columns)
- Pet matching and compatibility (walk/blind-date request flow)
- Second-hand marketplace listings
- In-app notification feed (with deep-link references)
- Pet reviews feeding the aggregate pets.rating

---

## Entity Relationship Diagram (Text Format)

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│  USERS   │1──────*│   PETS   │*──────*│PET_MATCHES│
└──────────┘         └──────────┘         └──────────┘
     │ 1                  │ *
     │                    │
     │ *                  │
┌──────────┐         ┌──────────┐
│FRIENDSHIPS│        │  POSTS   │
└──────────┘         └──────────┘
     │                    │ 1
     │                    │
     │                    │ *
     │               ┌──────────┐
     │               │ COMMENTS │
     │               └──────────┘
     │ 1
     │
     │ *
┌──────────┐         ┌──────────┐         ┌──────────┐
│ MESSAGES │         │  EVENTS  │1──────*│EVENT_     │
└──────────┘         └──────────┘         │ATTENDEES │
                                           └──────────┘
```

---

## Table Definitions

### 1. USERS

**Purpose:** Core user accounts for pet owners, sitters, vets, and businesses.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing user ID |
| name | VARCHAR | NOT NULL | User's display name |
| email | VARCHAR | NOT NULL, UNIQUE | User's email address |
| role | VARCHAR | NOT NULL | PET_OWNER, PET_SITTER, VET, BUSINESS |
| is_active | BOOLEAN | NOT NULL | Account active status |
| match_preferences_mask | BIGINT | DEFAULT 0 | Bitmask of walking-partner matching preferences, consumed by the matching engine |
| created_at | TIMESTAMP | NOT NULL | Account creation timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE on `email`
- INDEX on `role` (`idx_users_role`)

**Sample Data:**
```sql
INSERT INTO users (name, email, role, is_active) VALUES
('Alice Smith', 'alice@example.com', 'PET_OWNER', true),
('Bob Johnson', 'bob@example.com', 'PET_SITTER', true),
('Dr. Carol Vet', 'carol@vetclinic.com', 'VET', true);
```

---

### 2. PETS

**Purpose:** Pet profiles owned by users.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing pet ID |
| owner_id | BIGINT | NOT NULL, FK → users.id | Owner's user ID |
| name | VARCHAR | NOT NULL | Pet's name |
| species | VARCHAR | NOT NULL | DOG, CAT, BIRD, RABBIT, etc. |
| breed | VARCHAR | | Breed/mix description |
| date_of_birth | DATE | | Pet's birthdate |
| gender | VARCHAR | | MALE, FEMALE, UNKNOWN |
| size | VARCHAR | | SMALL, MEDIUM, LARGE, EXTRA_LARGE |
| temperament | VARCHAR | | FRIENDLY, SHY, ENERGETIC, CALM, PLAYFUL, AGGRESSIVE |
| bio | VARCHAR(1000) | | Pet's bio/description |
| profile_photo_url | VARCHAR | | URL to pet's profile photo |
| weight | DOUBLE | | Weight in kg |
| is_neutered | BOOLEAN | | Spay/neuter status |
| is_vaccinated | BOOLEAN | | Vaccination status |
| is_available_for_playdate | BOOLEAN | | Available for meetups |
| avatar_emoji | VARCHAR(8) | | Emoji avatar shown in the app (map pins, cards); falls back to species default |
| personality_tags | VARCHAR | | Comma-separated UI tags, e.g. "Friendly,Calm pace" ('Vaccinated' is derived) |
| rating | DOUBLE | | Aggregate owner-review rating 0.0-5.0 shown on partner cards |
| preferred_walk_time | VARCHAR | | Preferred daily walk time shown on partner cards, e.g. "7:00 AM" |
| created_at | TIMESTAMP | NOT NULL | Record creation |
| updated_at | TIMESTAMP | NOT NULL | Last update |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `owner_id`
- INDEX on `species`

**Sample Data:**
```sql
INSERT INTO pets (owner_id, name, species, breed, size, temperament, is_available_for_playdate) VALUES
(1, 'Max', 'DOG', 'Golden Retriever', 'LARGE', 'FRIENDLY', true),
(1, 'Luna', 'CAT', 'Siamese', 'MEDIUM', 'SHY', true),
(2, 'Rocky', 'DOG', 'Beagle', 'MEDIUM', 'ENERGETIC', true);
```

---

### 3. FRIENDSHIPS

**Purpose:** Social connections between users (bidirectional).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing ID |
| user_id | BIGINT | NOT NULL, FK → users.id | First user in friendship |
| friend_id | BIGINT | NOT NULL, FK → users.id | Second user in friendship |
| status | VARCHAR | NOT NULL | PENDING, ACCEPTED, BLOCKED |
| created_at | TIMESTAMP | NOT NULL | Request creation |
| updated_at | TIMESTAMP | NOT NULL | Last status change |

**Constraints:**
- UNIQUE (user_id, friend_id) - Prevents duplicate connections

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `(user_id, friend_id)`
- INDEX on `user_id`
- INDEX on `friend_id`

**Sample Data:**
```sql
INSERT INTO friendships (user_id, friend_id, status) VALUES
(1, 2, 'ACCEPTED'),
(1, 3, 'PENDING');
```

---

### 4. POSTS

**Purpose:** Social feed posts by users about pets or general content.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing post ID |
| user_id | BIGINT | NOT NULL, FK → users.id | Post author |
| pet_id | BIGINT | FK → pets.id | Associated pet (optional) |
| content | VARCHAR(5000) | NOT NULL | Post text content |
| media_url | VARCHAR | | Photo/video URL |
| media_type | VARCHAR | | IMAGE, VIDEO, NONE |
| like_count | INTEGER | DEFAULT 0 | Number of likes |
| comment_count | INTEGER | DEFAULT 0 | Number of comments |
| share_count | INTEGER | DEFAULT 0 | Number of shares |
| visibility | VARCHAR | DEFAULT 'PUBLIC' | PUBLIC, FRIENDS, PRIVATE |
| created_at | TIMESTAMP | NOT NULL | Post creation |
| updated_at | TIMESTAMP | NOT NULL | Last edit |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `user_id`
- INDEX on `pet_id`
- INDEX on `(visibility, created_at)` for feed queries

**Sample Data:**
```sql
INSERT INTO posts (user_id, pet_id, content, visibility, like_count) VALUES
(1, 1, 'Max had an amazing day at the park today! 🐕', 'PUBLIC', 15),
(2, 3, 'Rocky learned a new trick! So proud!', 'PUBLIC', 8);
```

---

### 5. COMMENTS

**Purpose:** Comments on posts.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing comment ID |
| post_id | BIGINT | NOT NULL, FK → posts.id | Parent post |
| user_id | BIGINT | NOT NULL, FK → users.id | Comment author |
| content | VARCHAR(2000) | NOT NULL | Comment text |
| like_count | INTEGER | DEFAULT 0 | Number of likes |
| created_at | TIMESTAMP | NOT NULL | Comment creation |
| updated_at | TIMESTAMP | NOT NULL | Last edit |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `post_id`
- INDEX on `user_id`

**Sample Data:**
```sql
INSERT INTO comments (post_id, user_id, content) VALUES
(1, 2, 'Max is adorable! Would love to arrange a playdate!'),
(1, 3, 'Beautiful dog! What park did you visit?');
```

---

### 6. EVENTS

**Purpose:** Pet-related meetups, playdates, and community events.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing event ID |
| organizer_id | BIGINT | NOT NULL, FK → users.id | Event creator |
| title | VARCHAR | NOT NULL | Event title |
| description | VARCHAR(3000) | | Event details |
| event_date_time | TIMESTAMP | NOT NULL | When event occurs |
| location_name | VARCHAR | | Venue/park name |
| latitude | DOUBLE | | GPS latitude |
| longitude | DOUBLE | | GPS longitude |
| event_type | VARCHAR | | PLAYDATE, WALK, TRAINING, MEETUP, PARTY, OTHER |
| pet_species | VARCHAR | | Filter: DOG, CAT, ALL |
| max_attendees | INTEGER | | Maximum capacity |
| current_attendees | INTEGER | DEFAULT 0 | Current RSVP count |
| status | VARCHAR | DEFAULT 'UPCOMING' | UPCOMING, ONGOING, COMPLETED, CANCELLED |
| cover_photo_url | VARCHAR | | Event banner image |
| emoji | VARCHAR(8) | | Emoji shown on invitation cards in the app (walk invitations are WALK-type events) |
| created_at | TIMESTAMP | NOT NULL | Event creation |
| updated_at | TIMESTAMP | NOT NULL | Last update |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `organizer_id`
- INDEX on `event_date_time`
- INDEX on `(latitude, longitude)` for location queries

**Sample Data:**
```sql
INSERT INTO events (organizer_id, title, event_date_time, location_name, event_type, pet_species, max_attendees) VALUES
(1, 'Central Park Dog Playdate', '2026-06-20 10:00:00', 'Central Park Great Lawn', 'PLAYDATE', 'DOG', 20),
(2, 'Puppy Training Workshop', '2026-06-25 14:00:00', 'Community Center', 'TRAINING', 'DOG', 15);
```

---

### 7. EVENT_ATTENDEES

**Purpose:** Tracks RSVPs for events.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing ID |
| event_id | BIGINT | NOT NULL, FK → events.id | Event reference |
| user_id | BIGINT | NOT NULL, FK → users.id | Attending user |
| pet_id | BIGINT | FK → pets.id | Attending pet (optional) |
| rsvp_status | VARCHAR | NOT NULL | GOING, MAYBE, NOT_GOING |
| created_at | TIMESTAMP | NOT NULL | RSVP creation |
| updated_at | TIMESTAMP | NOT NULL | Last status change |

**Constraints:**
- UNIQUE (event_id, user_id) - One RSVP per user per event

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `(event_id, user_id)`
- INDEX on `event_id`
- INDEX on `user_id`

**Sample Data:**
```sql
INSERT INTO event_attendees (event_id, user_id, pet_id, rsvp_status) VALUES
(1, 1, 1, 'GOING'),
(1, 2, 3, 'GOING'),
(2, 1, 1, 'MAYBE');
```

---

### 8. MESSAGES

**Purpose:** Direct messaging between users.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing message ID |
| sender_id | BIGINT | NOT NULL, FK → users.id | Message sender |
| receiver_id | BIGINT | NOT NULL, FK → users.id | Message recipient |
| content | VARCHAR(2000) | NOT NULL | Message text |
| message_type | VARCHAR | DEFAULT 'TEXT' | TEXT, IMAGE, LOCATION |
| media_url | VARCHAR | | Attachment URL |
| context_type | VARCHAR | | Thread scope: MATCH (pet_matches.id), LISTING (marketplace_items.id), NULL = general DM |
| context_id | BIGINT | | ID of the match/listing the thread belongs to |
| is_read | BOOLEAN | DEFAULT FALSE | Read status |
| read_at | TIMESTAMP | | When message was read |
| created_at | TIMESTAMP | NOT NULL | Message sent time |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `(sender_id, receiver_id)` for conversations
- INDEX on `(receiver_id, is_read)` for unread counts
- INDEX on `(context_type, context_id)` for thread lookups

**Sample Data:**
```sql
INSERT INTO messages (sender_id, receiver_id, content, is_read) VALUES
(1, 2, 'Hi! Would love to meet up for a dog playdate!', false),
(2, 1, 'That sounds great! When are you free?', false);
```

---

### 9. PET_MATCHES

**Purpose:** Track pet compatibility and playdate matches.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing match ID |
| pet_id_1 | BIGINT | NOT NULL, FK → pets.id | First pet |
| pet_id_2 | BIGINT | NOT NULL, FK → pets.id | Second pet |
| match_status | VARCHAR | DEFAULT 'PENDING' | PENDING, ACCEPTED, REJECTED, COMPLETED |
| compatibility_score | DOUBLE | | Algorithm score 0.0-1.0 |
| match_type | VARCHAR | | PLAYDATE, BREEDING, FRIENDSHIP |
| initiated_by_user_id | BIGINT | FK → users.id | Who initiated |
| meeting_date | TIMESTAMP | | Scheduled meetup |
| notes | VARCHAR(1000) | | Match notes |
| created_at | TIMESTAMP | NOT NULL | Match creation |
| updated_at | TIMESTAMP | NOT NULL | Last update |

**Constraints:**
- UNIQUE (pet_id_1, pet_id_2) - One match per pet pair

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `(pet_id_1, pet_id_2)`
- INDEX on `pet_id_1`
- INDEX on `pet_id_2`
- INDEX on `initiated_by_user_id`

**Sample Data:**
```sql
INSERT INTO pet_matches (pet_id_1, pet_id_2, initiated_by_user_id, compatibility_score, match_type, match_status) VALUES
(1, 3, 1, 0.92, 'PLAYDATE', 'ACCEPTED');
```

---

### 10. MARKETPLACE_ITEMS

**Purpose:** Second-hand pet gear listings (MarketplaceScreen).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing item ID |
| seller_id | BIGINT | NOT NULL, FK → users.id | Selling user |
| name | VARCHAR | NOT NULL | Item title |
| emoji | VARCHAR(8) | | Emoji thumbnail shown on the card |
| price | DOUBLE | NOT NULL | Asking price |
| original_price | DOUBLE | | Strikethrough original price (optional) |
| condition | VARCHAR | | NEW, LIKE_NEW, GOOD, SEALED |
| category | VARCHAR | NOT NULL | TOY, CARRIER, FOOD, ACCESSORY |
| description | VARCHAR(2000) | | Listing details |
| status | VARCHAR | NOT NULL, DEFAULT 'ACTIVE' | ACTIVE, RESERVED, SOLD |
| created_at | TIMESTAMP | NOT NULL | Listing creation |
| updated_at | TIMESTAMP | NOT NULL | Last update |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `seller_id` (`idx_marketplace_seller`)
- INDEX on `(category, status)` (`idx_marketplace_category`)
- INDEX on `(status, created_at)` (`idx_marketplace_status`) for the default feed

---

### 11. NOTIFICATIONS

**Purpose:** In-app notification feed (NotificationsScreen). Sender/pet display
fields are denormalized snapshots — a notification shows what was true at send
time, even if the sender later renames themselves or their pet.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing notification ID |
| recipient_id | BIGINT | NOT NULL, FK → users.id | User who sees the notification |
| sender_id | BIGINT | FK → users.id | Triggering user (NULL for system notifications) |
| category | VARCHAR | NOT NULL | BLIND_DATE, WALK_REQUEST, MESSAGE, LIKE, INVITATION, MATCH, REVIEW, MARKETPLACE |
| sender_name | VARCHAR | | Snapshot of sender display name |
| pet_name | VARCHAR | | Snapshot of the related pet's name |
| pet_emoji | VARCHAR(8) | | Snapshot of the related pet's emoji |
| preview | VARCHAR(500) | NOT NULL | One-line preview text |
| related_type | VARCHAR | | Deep link target type: MATCH, EVENT, MESSAGE, PET, LISTING |
| related_id | BIGINT | | ID of the related entity the app should open on tap |
| is_read | BOOLEAN | NOT NULL, DEFAULT FALSE | Read status (`isNew` in the app = NOT is_read) |
| created_at | TIMESTAMP | NOT NULL | When the notification fired |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `(recipient_id, created_at)` (`idx_notifications_recipient`) for the feed
- INDEX on `(recipient_id, is_read)` (`idx_notifications_unread`) for badge counts

---

### 12. REVIEWS

**Purpose:** 1-5 star reviews of pets after walks/dates. `pets.rating` holds the
running average and is recomputed by `ReviewController` on every write.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing review ID |
| reviewer_id | BIGINT | NOT NULL, FK → users.id | Reviewing user |
| pet_id | BIGINT | NOT NULL, FK → pets.id | Reviewed pet |
| rating | INTEGER | NOT NULL | 1-5 stars |
| comment | VARCHAR(1000) | | Review text |
| created_at | TIMESTAMP | NOT NULL | Review creation |
| updated_at | TIMESTAMP | NOT NULL | Last edit |

**Constraints:**
- UNIQUE (reviewer_id, pet_id) — one review per reviewer per pet (re-posting updates it)
- Application guard: cannot review your own pet

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `(reviewer_id, pet_id)`
- INDEX on `pet_id` (`idx_reviews_pet`)
- INDEX on `reviewer_id` (`idx_reviews_reviewer`)

---

### 13. DEVICE_TOKENS

**Purpose:** Android/iOS push targets (Expo push tokens, which front FCM). One row per app
installation; `PushNotificationService` fans a notification out to a user's active tokens.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing token ID |
| user_id | BIGINT | NOT NULL, FK → users.id | Owning user |
| token | VARCHAR(512) | NOT NULL, UNIQUE | `ExponentPushToken[...]` or raw FCM token |
| platform | VARCHAR(16) | NOT NULL | ANDROID / IOS |
| active | BOOLEAN | NOT NULL | False once the push service reports it dead |
| created_at | TIMESTAMP | | First registration |
| last_seen_at | TIMESTAMP | | Refreshed on every re-registration |

**Constraints:**
- UNIQUE (token) — the *token* is the identity, not the user. Registering an existing token
  reassigns its owner rather than inserting a duplicate, so a shared phone that changes accounts
  stops receiving the previous user's notifications.

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `token` (`uk_device_tokens_token`)
- INDEX on `(user_id, active)` (`idx_device_tokens_user`) — `active` is in the index so dead
  tokens from uninstalls never reach the heap during delivery

**Lifecycle:** rows are deactivated, never deleted, when the push service returns
`DeviceNotRegistered` (uninstall or token rotation). Keeping the row makes delivery history
interpretable and prevents an immediate re-insert of the same dead token.

**Migration:** created by `V2__add_device_tokens.sql`, not the V1 baseline — see
[Database Initialization](#database-initialization) for why.

---

## Data Relationships

### One-to-Many Relationships

1. **Users → Pets** (1:N)
   - One user can own multiple pets
   - `pets.owner_id` → `users.id`

2. **Users → Posts** (1:N)
   - One user can create multiple posts
   - `posts.user_id` → `users.id`

3. **Posts → Comments** (1:N)
   - One post can have multiple comments
   - `comments.post_id` → `posts.id`

4. **Users → Events** (1:N - as organizer)
   - One user can organize multiple events
   - `events.organizer_id` → `users.id`

5. **Events → EventAttendees** (1:N)
   - One event can have multiple attendees
   - `event_attendees.event_id` → `events.id`

### Many-to-Many Relationships

1. **Users ↔ Users** (Friendships)
   - Through `friendships` table
   - Bidirectional with status tracking

2. **Users ↔ Events** (Attendance)
   - Through `event_attendees` table
   - With RSVP status

3. **Pets ↔ Pets** (Matches)
   - Through `pet_matches` table
   - With compatibility scoring

### One-to-One Optional Relationships

1. **Posts → Pets** (N:1 optional)
   - A post can be about a specific pet
   - `posts.pet_id` → `pets.id`

---

## Indexing Strategy

**Status: implemented.** As of 2026-06-16 every index below is declared as a JPA `@Index` on its entity (`@Table(indexes = {...})`) and gets created automatically by Hibernate (`ddl-auto: update`) — not a manual migration script. All FK columns (`owner_id`, `user_id`, `pet_id`, etc.) are also now real `@ManyToOne`/`@JoinColumn` associations with DB-level foreign-key constraints, since Postgres (unlike MySQL) does not auto-index FK columns — the explicit indexes below are what actually make those joins/filters fast.

```sql
-- User lookups
-- idx on email comes from the UNIQUE constraint (implicit index)
CREATE INDEX idx_users_role ON users(role);
-- (no separate is_active index: boolean column, low selectivity, not worth the write overhead)

-- Pet queries
CREATE INDEX idx_pets_owner ON pets(owner_id);
CREATE INDEX idx_pets_species ON pets(species);
CREATE INDEX idx_pets_playdate ON pets(is_available_for_playdate);

-- Social feed queries
CREATE INDEX idx_posts_user ON posts(user_id);
CREATE INDEX idx_posts_pet ON posts(pet_id);
CREATE INDEX idx_posts_visibility ON posts(visibility, created_at);
CREATE INDEX idx_comments_post ON comments(post_id);
CREATE INDEX idx_comments_user ON comments(user_id);

-- Friendship queries
CREATE INDEX idx_friendships_user ON friendships(user_id, status);
CREATE INDEX idx_friendships_friend ON friendships(friend_id, status);

-- Event queries
CREATE INDEX idx_events_organizer ON events(organizer_id);
CREATE INDEX idx_events_datetime ON events(event_date_time);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_species ON events(pet_species);
-- (no lat/lon composite index: naive range scans don't get real geo benefits;
--  "nearby" queries should go through Redis GEOSEARCH instead, see TELEMETRY_ARCHITECTURE.md)
CREATE INDEX idx_event_attendees_event ON event_attendees(event_id);
CREATE INDEX idx_event_attendees_user ON event_attendees(user_id);

-- Message queries
CREATE INDEX idx_sender_receiver ON messages(sender_id, receiver_id);
CREATE INDEX idx_receiver_read ON messages(receiver_id, is_read);
CREATE INDEX idx_messages_conversation ON messages(sender_id, receiver_id, created_at);

-- Match queries
CREATE INDEX idx_matches_pet1 ON pet_matches(pet_id_1, match_status);
CREATE INDEX idx_matches_pet2 ON pet_matches(pet_id_2, match_status);
CREATE INDEX idx_matches_initiator ON pet_matches(initiated_by_user_id);

-- Marketplace queries
CREATE INDEX idx_marketplace_seller ON marketplace_items(seller_id);
CREATE INDEX idx_marketplace_category ON marketplace_items(category, status);
CREATE INDEX idx_marketplace_status ON marketplace_items(status, created_at);

-- Notification queries
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, created_at);
CREATE INDEX idx_notifications_unread ON notifications(recipient_id, is_read);

-- Message thread scoping
CREATE INDEX idx_messages_context ON messages(context_type, context_id);

-- Review queries
CREATE INDEX idx_reviews_pet ON reviews(pet_id);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);
```

---

## Frontend API Mapping

Every screen in `frontend/` that previously rendered `mockData.ts` now has a
backing endpoint whose response DTO matches the TypeScript interface 1:1
(same field names, display strings formatted server-side in `dto/UiFormat`).
Frontend calls live in `frontend/src/services/*.ts`; the signed-in user comes
from the in-memory session set by `authService` on login/register.

| Screen | TS interface (mockData.ts) | Endpoint | Backing tables |
|--------|---------------------------|----------|----------------|
| HomeMapScreen | `NearbyPet` | `GET /api/pets/nearby?lat&lon&radiusKm` | Redis `users:geo` → `pets` + `users` |
| FindPartnersScreen | `WalkingPartner` | `GET /api/pets/partners?userId&lat&lon&species` | `pets` + `users` (+ Redis geo/meta for distance & online) |
| FindPartnersScreen (My Invitations) | `Invitation` | `GET /api/invitations?userId` | `events` (event_type = WALK) |
| PostInvitationScreen | `Invitation` | `POST /api/invitations` | `events` |
| EditInvitationScreen | `Invitation` | `PUT /api/invitations/{id}` | `events` |
| WalkRequestDetailScreen (join) | `Invitation` | `POST /api/invitations/{id}/join?userId` | `event_attendees` + `notifications` |
| PetBlindDateScreen | `BlindDatePet` | `GET /api/pets/blind-dates?userId&lat&lon&species` | `pets` + `users` |
| NotificationsScreen | `Notification` | `GET /api/notifications?userId`, `PUT /api/notifications/read-all` | `notifications` |
| MarketplaceScreen | `MarketplaceItem` | `GET /api/marketplace/items?category` | `marketplace_items` + `users` |
| LoginScreen / SignupScreen | `AuthUser` | `POST /api/users/login`, `POST /api/users/register` | `users` |
| MeProfileScreen / ConnectPetProfileScreen | — | `GET /api/pets/owner/{ownerId}`, `POST /api/pets` | `pets` |
| Connect / Send Match Request + Accept/Deny/Block | — | `POST /api/matches`, `PUT /api/matches/{id}/accept·deny·block` 🔒 | `pet_matches` + `notifications` |
| WalkRequestDetail / NotificationDetail / MarketplaceChat (chat) | — | `POST /api/messages`, `GET /api/messages/thread·conversations` 🔒 | `messages` (context-scoped) |
| Pet profile reviews | — | `POST /api/reviews`, `GET /api/reviews/pet/{petId}` | `reviews` → aggregates into `pets.rating` |

🔒 = requires `Authorization: Bearer <token>` from `/api/auth/login|register`.
**See `../API_REFERENCE.md` (repo root) for the full endpoint documentation with
request/response examples — that file is the integration contract for the app.**

---

## Redis Integration

In addition to PostgreSQL, PawPal uses Redis for:

### 1. Geospatial Indexing
```
Key: users:geo
Type: GEO
Purpose: Real-time location tracking for nearby user discovery
```

### 2. User Metadata (durable)
```
Key Pattern: users:meta:{userId}
Type: HASH
Fields:
  - active: boolean
  - preferences: long
TTL: none — these are profile facts, written at registration
```

### 2b. Presence (volatile)
```
Key Pattern: users:presence:{userId}
Type: HASH
Fields:
  - lastSeen: epoch millis
  - available: boolean
TTL: 6 hours, refreshed by every telemetry ping
```

These were a single key until 2026-08-09. The per-ping `EXPIRE` also expired the
registration-written `active`/`preferences` fields, so a user idle for six hours silently became
unmatchable. Splitting them by lifetime fixes that and gives the TTL a clear meaning: presence
expiring *is* the signal that someone is no longer out walking, which is what matching now filters
on.

### 3. Metrics
```
Keys:
  - metrics:telemetry:count
  - metrics:match:success
  - metrics:match:failed
Type: STRING (counters)
```

---

## Database Initialization

### Step 1: Start Infrastructure
```bash
docker-compose up -d
```

### Step 2: Verify PostgreSQL
```bash
psql -h localhost -U admin -d pet_social_db
```

### Step 3: Flyway migrations
Flyway owns the schema and runs on startup from `src/main/resources/db/migration`. Hibernate is set
to `ddl-auto: validate`, so the app **fails to start** if the entities and the migrated schema
disagree, rather than silently altering tables.

- `V1__baseline_schema.sql` — the pre-Flyway schema, generated from the JPA metadata with
  Hibernate's schema exporter (so it matches the entities, not a recollection of them).
- `V2__add_device_tokens.sql` — push-notification targets.

Databases created before Flyway have tables but no `flyway_schema_history`. `baseline-on-migrate`
marks those as already at V1 and skips it — which is exactly why anything new must land in **V2 or
later**, or those databases would never receive it. A fresh database runs V1 then V2.

Check state with:
```bash
psql -h localhost -U admin -d pet_social_db \
  -c 'select version, description, success from flyway_schema_history order by installed_rank'
```

### Step 4: Adding a migration
Never edit an applied migration — Flyway checksums them and will refuse to start on a mismatch.
Add `V3__...sql` instead, and update the entities to match in the same commit.

---

## Sample Queries

### Find nearby pet owners
```sql
SELECT u.*, p.*
FROM users u
JOIN pets p ON p.owner_id = u.id
WHERE u.is_active = true
AND p.is_available_for_playdate = true
AND p.species = 'DOG';
```

### Get user's social feed (friends' posts)
```sql
SELECT p.*, u.name as author_name
FROM posts p
JOIN users u ON p.user_id = u.id
WHERE p.user_id IN (
    SELECT friend_id FROM friendships WHERE user_id = ? AND status = 'ACCEPTED'
    UNION
    SELECT user_id FROM friendships WHERE friend_id = ? AND status = 'ACCEPTED'
)
AND p.visibility IN ('PUBLIC', 'FRIENDS')
ORDER BY p.created_at DESC
LIMIT 50;
```

### Find upcoming events near location
```sql
SELECT e.*, u.name as organizer_name
FROM events e
JOIN users u ON e.organizer_id = u.id
WHERE e.status = 'UPCOMING'
AND e.event_date_time > NOW()
AND e.latitude BETWEEN ? AND ?
AND e.longitude BETWEEN ? AND ?
ORDER BY e.event_date_time ASC;
```

### Get unread message count
```sql
SELECT COUNT(*)
FROM messages
WHERE receiver_id = ?
AND is_read = false;
```

### Find compatible pet matches
```sql
SELECT p1.*, p2.*, pm.compatibility_score
FROM pet_matches pm
JOIN pets p1 ON pm.pet_id_1 = p1.id
JOIN pets p2 ON pm.pet_id_2 = p2.id
WHERE (pm.pet_id_1 = ? OR pm.pet_id_2 = ?)
AND pm.match_status = 'ACCEPTED'
ORDER BY pm.compatibility_score DESC;
```

---

## Constraints and Validation

### Database-Level Constraints
- NOT NULL for required fields
- UNIQUE constraints on email, friendship pairs, RSVP pairs, pet-match pairs
- **Implemented (2026-06-16):** real foreign-key constraints on every relationship (`pets.owner_id`, `posts.user_id`/`pet_id`, `comments.post_id`/`user_id`, `events.organizer_id`, `event_attendees.event_id`/`user_id`/`pet_id`, `messages.sender_id`/`receiver_id`, `pet_matches.pet_id_1`/`pet_id_2`/`initiated_by_user_id`, `friendships.user_id`/`friend_id`), via JPA `@ManyToOne`/`@JoinColumn(foreignKey = ...)`. No explicit CASCADE configured yet (default `RESTRICT`-like behavior) — revisit once delete flows are designed.

### Application-Level Validation (still pending — no service layer exists yet for these entities)
- Email format validation
- Enum validation (role, status, etc.) — fields are still plain `String`
- Date range validation (events in future)
- Friendship: Cannot friend yourself
- Match: Cannot match same pet
- Reverse-pair duplicate prevention for friendships/matches (the unique constraint only blocks the exact ordered pair, not the swapped one — see `PROGRESS.md`)

---

## Migration Strategy

### Phase 1: Core Users & Pets
1. Create `users` table
2. Create `pets` table
3. Test user registration and pet creation

### Phase 2: Social Features
4. Create `friendships` table
5. Create `posts` table
6. Create `comments` table
7. Test social feed

### Phase 3: Events
8. Create `events` table
9. Create `event_attendees` table
10. Test event creation and RSVP

### Phase 4: Messaging & Matching
11. Create `messages` table
12. Create `pet_matches` table
13. Test messaging and matching algorithms

---

## Backup and Maintenance

### Daily Backups
```bash
pg_dump -h localhost -U admin pet_social_db > backup_$(date +%Y%m%d).sql
```

### Table Maintenance
```sql
-- Vacuum and analyze tables weekly
VACUUM ANALYZE users;
VACUUM ANALYZE pets;
VACUUM ANALYZE posts;
-- ... etc
```

---

## Security Considerations

1. **Password Storage:** Not yet implemented - use bcrypt when added
2. **API Authentication:** Not yet implemented - add JWT/OAuth
3. **Row-Level Security:** Consider for multi-tenant scenarios
4. **Audit Logging:** Add triggers for sensitive operations
5. **Data Encryption:** Encrypt PII fields (email, location)

---

## Schema Version

**Version:** 1.2.0
**Date:** 2026-07-02
**Status:** Match/message/review release (adds reviews; message thread context; notification deep links; BCrypt+JWT auth)
**Entities:** 12 tables
**Total Columns:** 160+

---

## Next Steps

1. ✅ Entities created
2. ✅ Repositories created
3. ✅ REST API endpoints for app screens (pets, invitations, notifications, marketplace)
4. ✅ Match request flow (connect → accept/deny/block) with reverse-pair guard
5. ✅ MessageController with match/listing thread scoping
6. ✅ Reviews + aggregate pet rating
7. ✅ BCrypt + JWT (see API_REFERENCE.md)
8. ✅ Bearer token enforced on all /api/** endpoints (deny-by-default allowlist in `JwtAuthFilter`)
9. ⏳ Media upload (pet/listing/message photos)
10. ⏳ Posts/comments/friendships service layer (no Feed tab in current design)
11. ✅ Flyway migrations replacing ddl-auto: update
12. ✅ `device_tokens` table + Android push delivery (Expo/FCM)
13. ⏳ Rate limiting at the edge; dead-letter topic for poison telemetry

---

**Generated for:** PawPal Pet Social Platform
**Technology:** Spring Boot 4.0.6 + PostgreSQL 16 + Redis Stack
