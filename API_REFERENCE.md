# PawPal API Reference

REST API reference for the PawPal backend, written for the frontend/mobile team
(and AI coding assistants) to integrate against. Every response DTO that backs a
screen is shaped 1:1 like the TypeScript interfaces in
`frontend/src/constants/mockData.ts` — same field names, display strings
pre-formatted by the server — so responses can be rendered without re-mapping.

- **Base URL (dev):** `http://localhost:8080` — Android emulator: `http://10.0.2.2:8080`, physical device: your machine's LAN IP
- **Content type:** `application/json; charset=utf-8` (emoji round-trip as UTF-8)
- **Backend source:** `backend/src/main/java/org/example/pet_social/controller/`
- **Schema:** `backend/DATABASE_SCHEMA.md` (v1.1+)

## Quick start for integration

```
1. POST /api/auth/register (or /login)      → save `token`
2. Send `Authorization: Bearer <token>` on EVERY /api/* call
3. Only these work without it:
     POST /api/auth/register | /api/auth/login | /api/auth/google
     POST /api/users/register | /api/users/login   (legacy aliases)
     GET  /api/system/health
```

> **Changed 2026-08-09 — breaking.** The token used to be enforced only on `/api/matches` and
> `/api/messages`. It now covers all of `/api/*`; anything else returns
> `401 {"message":"Missing or invalid Bearer token"}`. Attach the header in one shared place
> (fetch wrapper / axios interceptor) rather than per call.
>
> The gate is deny-by-default — it matches `/api/*` with the allowlist above rather than listing
> protected paths, so new endpoints are protected the moment they exist and a forgotten one fails
> loudly with a 401 instead of shipping open.
>
> **Identity now comes from the token, not the body.** `POST /api/telemetry/location` ignores any
> `userId` you send. Stop sending `userId` to mean "who am I".

## Conventions

- IDs in responses are **strings** (matching the TS interfaces); IDs you send in requests/query params are **numbers**.
- Display fields come pre-formatted: `age: "2y"`, `distance: "0.3 km"`, `date: "Sat, Jun 8"`, `time: "9:00 AM"` or `"2 min ago"`.
- Validation failures return **400** with `{ "message": "field: reason; field2: reason" }` (plus timestamp/path metadata).
- Unexpected errors return a JSON body shaped `{ timestamp, status, error, message, path, correlationId }`.
- A body that isn't valid JSON (truncated, empty, malformed) returns **400** `{ "message": "Malformed request body" }`.
  It used to reach the catch-all as a 500, which logged a stack trace and counted a server error against
  a healthy server for what is entirely the caller's mistake. The parser's own message quotes the offending
  input back, so it is replaced rather than echoed.
- Enum-ish inputs are case-insensitive (`"walk"` == `"WALK"`).

### Scheduling is in local wall-clock time — mind the zone

Invitation `date` and `time` are **display strings the client formatted in its own timezone**
(`"Mon, Jul 5, 2026"` + `"9:00 AM"`), not instants. The backend parses them into a naive
`scheduledAt` and never attaches an offset, so nothing in the payload records which zone they meant.

That matters because `scheduledAt` is the only thing separating an active invitation from a finished
one: there is no upcoming/completed status column. `POST /api/{walk,date}/invitations` is
active while `scheduledAt` is in the future, and moves to `/completed` once it passes.

Asking "has it passed?" therefore has to happen in the **same zone the client wrote it in**, which is
`app.timezone` (`APP_TIMEZONE`, default `America/Toronto`) — *not* the server clock. Left at the
container default of UTC, an evening booking in Toronto was compared against a UTC clock already
past midnight, so it read as finished the moment it was posted: it never appeared in anyone's feed
and showed up under Completed instead. A booking a day out cleared the offset and behaved normally,
which is why only same-day ones broke.

**Set `APP_TIMEZONE` to the timezone your users are actually in.** This is correct for a
single-timezone deployment and wrong for users spread across zones — that needs the client to send
an ISO-8601 timestamp with offset and the column to become a real instant, which is a migration.

### Error bodies always carry `message`

Three code paths produce errors and they do not share a shape, but every one of them has a `message`
field — which is what lets the mobile client parse all of them with one function:

| Source | Shape |
|---|---|
| `GlobalExceptionHandler` (validation, 4xx/5xx) | `{ timestamp, status, error, message, path, correlationId }` |
| Controllers returning a status directly | `{ "message": "Invalid email or password" }` |
| `JwtAuthFilter` / `LoginRateLimitFilter` | `{ "message": "Missing or invalid Bearer token" }` |

Clients must read `message` and never render the raw body: it can contain a `correlationId` and, on a
5xx, internal detail that means nothing to a user. `frontend/mobile/src/utils/api.ts` does this once,
centrally — see [Client error handling](FRONTEND_MOBILE_API_MAPPING.md#client-error-handling).

## Screen → endpoint map

| Screen | Data | Call |
|---|---|---|
| SplashScreen → Login/SignUp | token | `POST /api/auth/login`, `POST /api/auth/register` |
| HomeMapScreen | `NearbyPet[]` | `GET /api/pets/nearby` |
| FindPartnersScreen (cards) | `WalkingPartner[]` | `GET /api/pets/partners` |
| FindPartnersScreen (My Invitations) | `Invitation[]` | `GET /api/invitations?userId=` |
| PostInvitationScreen | `Invitation` | `POST /api/invitations` |
| EditInvitationScreen | `Invitation` | `PUT /api/invitations/{id}` |
| Connect button (Walk) | match thread | `POST /api/matches` with `matchType: "WALK"` |
| PetBlindDateScreen (deck) | `BlindDatePet[]` | `GET /api/pets/blind-dates` |
| Send Match Request (Date) | match thread | `POST /api/matches` with `matchType: "BLIND_DATE"` |
| WalkRequestDetail / NotificationDetail | match + chat | `GET /api/matches/{id}` + `GET /api/messages/thread?...contextType=match` |
| Accept / Deny / Block | match | `PUT /api/matches/{id}/accept` &#124; `/deny` &#124; `/block` |
| MarketplaceScreen | `MarketplaceItem[]` | `GET /api/marketplace/items` |
| MarketplaceChatScreen | chat | `GET /api/messages/thread?...contextType=listing&contextId={itemId}` |
| NotificationsScreen | `Notification[]` | `GET /api/notifications?userId=` |
| MeProfileScreen / ConnectPetProfileScreen | pets | `GET /api/pets/owner/{ownerId}`, `POST /api/pets` |
| Pet profile reviews | reviews | `GET /api/reviews/pet/{petId}`, `POST /api/reviews` |

---

## 1. Auth — `/api/auth`

No token required. This is the contract `frontend/mobile` already codes against.

### POST `/api/auth/register`

```json
// request
{ "name": "Sarah K.", "email": "sarah@example.com", "password": "secret123" }
// "role" optional: PET_OWNER (default) | PET_SITTER | VET | BUSINESS

// 200
{ "token": "eyJhbGciOi...", "userId": 42, "name": "Sarah K.", "email": "sarah@example.com", "role": "PET_OWNER" }

// 400 — email taken
{ "message": "An account with this email already exists." }
```

Password must be ≥ 6 characters. Passwords are stored as BCrypt hashes.

### POST `/api/auth/login`

```json
// request
{ "email": "sarah@example.com", "password": "secret123" }

// 200 — same shape as register
// 401
{ "message": "Invalid email or password" }
```

The token is a JWT valid for 7 days. Send it as `Authorization: Bearer <token>`.

> Legacy aliases `POST /api/users/register` and `POST /api/users/login` still work
> (old body shape, response has `id` instead of `userId` and now also includes `token`).
> New code should use `/api/auth`.

---

## 2. Pets & discovery — `/api/pets`

> **Discovery is bounded by distance (2026-08-11).** Every endpoint in this section, plus
> `/api/{walk,date}/invitations/feed`, accepts an optional **`radiusKm`** and returns only
> results inside it, sorted nearest-first. Omitted → `app.discovery.default-radius-km` (25 km).
> Supplied → clamped to `app.discovery.max-radius-km` (100 km), because the value comes from the
> client. Without `lat`/`lon` there is nothing to measure against, so no bound is applied.
>
> Callers are excluded from their own results. The identity used is the **JWT**, not the `userId`
> query parameter, so you cannot request a feed filtered as somebody else; the parameter remains
> only as a fallback for the legacy unauthenticated callers.

### GET `/api/pets/nearby?lat=43.65&lon=-79.38&radiusKm=5&limit=50`

Pets around a map point. Locations come from the Redis geo index (`users:geo`),
which is fed by `POST /api/telemetry/location` — users appear on the map after
their app has reported a location at least once.

```json
// 200 → NearbyPet[]
[ { "id": "7", "name": "Buddy", "emoji": "🐕", "breed": "Golden Retriever",
    "latitude": 43.651, "longitude": -79.381, "owner": "Sarah K." } ]
```

### GET `/api/pets/partners?userId=42&lat=43.65&lon=-79.38&species=DOG`

Walking-partner cards. All params optional: `userId` excludes your own pets,
`lat`/`lon` enable the `distance` field (else `""`), `species` filters (DOG/CAT/ALL).

```json
// 200 → WalkingPartner[]
[ { "id": "7", "name": "Buddy", "emoji": "🐕", "breed": "Golden Retriever",
    "age": "2y", "distance": "0.3 km", "time": "7:00 AM",
    "tags": ["Friendly", "Vaccinated"], "rating": 4.8, "type": "Dog",
    "owner": "Sarah K.", "online": true } ]
```

`online` reflects the user's live Redis presence flag. `rating` is the aggregate
of `/api/reviews` (0.0 when unreviewed).

### GET `/api/pets/blind-dates?userId=42&lat=&lon=&species=`

Same candidate pool, `BlindDatePet` card shape:

```json
[ { "id": "9", "name": "Luna", "emoji": "🐱", "breed": "Persian Cat", "age": "2y",
    "gender": "Female", "distance": "0.4 km", "tags": ["Calm", "Vaccinated"],
    "species": "Cat", "vaccinated": true } ]
```

### GET `/api/pets/owner/{ownerId}` · GET `/api/pets/{id}`

Full profiles (`PetResponse`): `{ id, ownerId, owner, name, emoji, species, breed,
age, gender, bio, tags, vaccinated, rating, preferredWalkTime, availableForPlaydate }`

### POST `/api/pets`

```json
// request — name + ownerId required; species: DOG | CAT | BIRD | RABBIT | OTHER
{ "ownerId": 42, "name": "Buddy", "species": "DOG", "breed": "Golden Retriever",
  "gender": "MALE", "dateOfBirth": "2024-03-01", "bio": "Loves the park",
  "avatarEmoji": "🐕", "personalityTags": ["Friendly"], "vaccinated": true,
  "neutered": false, "availableForPlaydate": true, "preferredWalkTime": "7:00 AM" }
// 200 → PetResponse
```

---

## 3. Walk invitations — `/api/invitations`

Invitations are WALK-type rows in the `events` table.

### GET `/api/invitations?userId=42`

The user's own upcoming invitations ("My Invitations" rail):

```json
// 200 → Invitation[]
[ { "id": "3", "route": "Riverside Park Trail", "date": "Sat, Jun 8",
    "time": "9:00 AM", "spotsLeft": 2, "totalSpots": 4, "emoji": "🌿" } ]
```

### GET `/api/invitations/open?excludeUserId=42`

Upcoming, not-full walks by other users (browse/join list). Same shape.

### POST `/api/invitations`

```json
// request — organizerId, route, dateTime required; dateTime is local ISO
{ "organizerId": 42, "route": "Riverside Park Trail", "dateTime": "2026-07-05T09:00:00",
  "totalSpots": 4, "emoji": "🌿", "description": "Easy pace",
  "latitude": 43.65, "longitude": -79.38 }
// 200 → Invitation
```

### PUT `/api/invitations/{id}` — partial update (send only changed fields) → `Invitation`
### DELETE `/api/invitations/{id}` — cancel → 204
### POST `/api/invitations/{id}/join?userId=43`

RSVPs the user, decrements `spotsLeft`, and notifies the organizer
(WALK_REQUEST notification with `relatedType: "event"`).

```json
// 200 → updated Invitation
// 400 → { "message": "walk-full" } or { "message": "already-joined" }
```

---

## 4. Match requests — `/api/matches` 🔒 Bearer token required

The Connect / Send-Match-Request → Accept/Deny/Block flow for both the Walk and
Date tabs. The acting user is always taken **from the token** — no userId params.
Status lifecycle: `pending → accepted | denied | blocked`. A denied pair can be
re-requested (reopens the thread); a blocked pair returns 409 on new attempts.

### POST `/api/matches`

```json
// request — matchType: WALK | BLIND_DATE | PLAYDATE | FRIENDSHIP
{ "requesterPetId": 7, "targetPetId": 9, "matchType": "BLIND_DATE",
  "notes": "Luna would love to meet Buddy!", "meetingDate": "2026-07-06T15:00:00" }

// 200 → MatchResponse (oriented to the caller)
{ "id": "5", "matchType": "blind_date", "status": "pending", "direction": "outgoing",
  "myPet":    { "id": "7", "name": "Buddy", "emoji": "🐕", "breed": "Golden Retriever" },
  "otherPet": { "id": "9", "name": "Luna",  "emoji": "🐱", "breed": "Persian Cat" },
  "otherOwnerId": 43, "otherOwnerName": "Alex M.",
  "notes": "Luna would love to meet Buddy!",
  "meetingDate": "Mon, Jul 6", "meetingTime": "3:00 PM", "time": "Just now" }

// 400 → pet not found / own pet / same owner
// 403 → requesterPet isn't owned by the token's user
// 409 → { "message": "match already exists", "matchId": 5 }  or  { "message": "blocked" }
```

Creating a request notifies the other owner (`WALK_REQUEST` or `BLIND_DATE`
notification with `relatedType: "match"`, `relatedId` = match id).

### GET `/api/matches?status=pending` — all threads involving the caller's pets (`status` filter optional)
### GET `/api/matches/{id}` — one thread (participants only, else 403)
### PUT `/api/matches/{id}/accept` · `/deny` · `/block`

Only the **receiving** side can resolve a request (the requester gets 400).
Accepting notifies the requester (`MATCH` notification). All return the updated `MatchResponse`.

---

## 5. Messages — `/api/messages` 🔒 Bearer token required

Chat for match threads, marketplace listings, and general DMs. A thread is
`(other user, contextType, contextId)`; omit context for a plain DM.
`contextType`: `match` (contextId = match id) or `listing` (contextId = marketplace item id).

### POST `/api/messages`

```json
// request
{ "receiverId": 43, "content": "Is 5pm ok?", "contextType": "LISTING", "contextId": 2 }

// 200 → MessageResponse
{ "id": "11", "senderId": 42, "receiverId": 43, "mine": true, "content": "Is 5pm ok?",
  "contextType": "listing", "contextId": 2, "read": false, "time": "Just now" }
```

Sending also creates a `MESSAGE` notification for the receiver.

### GET `/api/messages/thread?otherUserId=43&contextType=listing&contextId=2`

All messages in the thread, oldest first (`MessageResponse[]`, `mine` oriented to caller).

### GET `/api/messages/conversations`

Inbox — the latest message per partner:

```json
[ { "otherUserId": 43, "otherUserName": "Alex M.", "lastMessage": "Is 5pm ok?",
    "time": "2 min ago", "lastMessageMine": false, "unread": true,
    "contextType": "listing", "contextId": 2 } ]
```

### PUT `/api/messages/read?otherUserId=43` → `{ "updated": 3 }`
### GET `/api/messages/unread-count` → `{ "count": 3 }`

---

## 6. Marketplace — `/api/marketplace/items`

### GET `/api/marketplace/items?category=Carrier`

Active listings, newest first. `category` accepts UI labels (`Toy`, `Carrier`,
`Food`, `Accessory`) or `All`/omitted.

```json
// 200 → MarketplaceItem[]
[ { "id": "2", "emoji": "🎒", "name": "Pet Carrier Bag", "price": 25.0,
    "originalPrice": 60.0, "condition": "Good", "sellerEmoji": "👤",
    "sellerName": "Alex M.", "category": "Carrier" } ]
```

### GET `/api/marketplace/items/seller/{sellerId}` — a seller's listings (any status)
### POST `/api/marketplace/items`

```json
// request — sellerId, name, price, category required
{ "sellerId": 42, "name": "Pet Carrier Bag", "emoji": "🎒", "price": 25,
  "originalPrice": 60, "condition": "Good", "category": "Carrier",
  "description": "Barely used" }
// 200 → MarketplaceItem
```

### PUT `/api/marketplace/items/{id}/sold` → 204

To chat about an item: `POST /api/messages` with `contextType: "LISTING"`,
`contextId` = item id, `receiverId` = the seller's user id (get it from
`/api/marketplace/items/seller/...` context or keep it alongside the item in app state).

---

## 6b. Demo seeding — `/api/demo` 🔒 Bearer token required

Present only when `app.demo-seed.enabled=true` (`APP_DEMO_SEED_ENABLED`). **Defaults to false** —
the opposite of the load-test endpoints — because it writes user accounts.

### POST `/api/demo/seed?lat=43.4802&lon=-80.5179`

Fills an empty deployment with 20 owners, 26 pets, 14 walk/date invitations with their pending
requests, 18 posts, 19 comments, 6 events, 14 listings, conversations, reviews and notifications,
and pushes every seeded user through the telemetry consumer so they appear in `users:geo` with
live presence.

`lat`/`lon` are optional and must be supplied together. They **relocate the whole seeded city**,
preserving the neighbourhoods' relative geometry. Pass the coordinates you will be demoing from —
the feeds above are distance-bounded, so a catalogue seeded on another continent returns nothing.

```json
{ "seeded": true, "message": "Seeded. Every account uses the same demo password.",
  "counts": { "users": 22, "pets": 26, "invitations": 14, "posts": 18, "…": 0 },
  "logins": ["maya.arjun@pawpal.demo", "…"] }
```

One-shot: running it again returns `"seeded": false` with the existing counts and changes nothing.
There is no delete path — to start over, destroy the Postgres volume. Every seeded account signs
in with `APP_DEMO_SEED_PASSWORD`. The account that calls this also receives three notifications,
so the caller's own bell isn't empty.

### GET `/api/demo/seed/status` → `{ seeded, counts, logins }`

---

## 7. Notifications — `/api/notifications`

### GET `/api/notifications?userId=42`

Newest first. `isNew` = unread. `relatedType`/`relatedId`/`senderId` drive deep links:

```json
[ { "id": "1", "category": "walk_request", "emoji": "🚶", "senderName": "Verify Bob",
    "petName": "Buddy", "petEmoji": "🐕", "time": "2 min ago",
    "preview": "Bob joined your walk: Riverside Park Trail", "isNew": true,
    "categoryLabel": "Walk Request",
    "relatedType": "event", "relatedId": 3, "senderId": 43 } ]
```

Deep-link rules:

| `category` | `relatedType` | Navigate to |
|---|---|---|
| `walk_request`, `blind_date`, `match` | `match` | Match thread: `GET /api/matches/{relatedId}` |
| `walk_request` (join) / `invitation` | `event` | Invitation detail (`relatedId` = invitation id) |
| `message`, `marketplace` | `message` | Chat with `senderId`: `GET /api/messages/thread?otherUserId={senderId}` |
| `review` | `pet` | Pet profile: `GET /api/pets/{relatedId}` |

### GET `/api/notifications/unread-count?userId=42` → `{ "count": 3 }`
### PUT `/api/notifications/{id}/read` → 204
### PUT `/api/notifications/read-all?userId=42` → `{ "updated": 5 }`
### POST `/api/notifications` — push a custom feed item (mostly for internal/testing use)

### POST `/api/notifications/device-token` — register for Android/iOS push *(added 2026-08-09)*

```json
{ "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]", "platform": "ANDROID" }
```
→ `{ "status": "registered" }`

Call on app launch **and** whenever the push service rotates the token. Idempotent: re-registering
an existing token reassigns it to the current user rather than duplicating, so a shared device that
changes accounts stops receiving the previous user's notifications. `platform` defaults to
`ANDROID`.

### DELETE `/api/notifications/device-token` — stop push on this device → 204

Same body. Call on logout. Only the token's owner can retire it.

#### What the client still has to do

Registering a token is not sufficient on Android. The app must also create notification **channels**
with these exact ids, because the backend sets `channelId` per category and Android silently drops
notifications for a channel it doesn't know about — no error surfaces anywhere:

| Channel id | Used for | Priority sent |
|---|---|---|
| `messages` | new chat messages | high |
| `requests` | walk/date/invitation requests | high |
| `social` | matches, reviews, marketplace | default |

Each push carries a `data` payload for deep linking:

```json
{ "notificationId": "123", "category": "WALK_REQUEST", "relatedType": "MATCH", "relatedId": 42 }
```

Route on `relatedType`/`relatedId` the same way `NotificationDetail` already does for the in-app
feed. Notifications also carry a `badge` count (the user's unread total) and a category-appropriate
TTL, so a stale walk invite expires rather than surfacing hours later after the device wakes.

---

## 8. Reviews — `/api/reviews`

### POST `/api/reviews`

One review per reviewer per pet (posting again updates it). Recomputes the pet's
average `rating` shown on partner cards, and notifies the owner on first review.

```json
// request — rating 1..5; cannot review your own pet
{ "reviewerId": 43, "petId": 7, "rating": 5, "comment": "Buddy is so well-behaved!" }

// 200
{ "id": "1", "reviewerId": 43, "reviewerName": "Alex M.", "rating": 5,
  "comment": "Buddy is so well-behaved!", "time": "Just now" }
```

### GET `/api/reviews/pet/{petId}` → `ReviewResponse[]` (newest first)

---

## 9. Location & matching engine (existing, unchanged)

- `POST /api/telemetry/location` `{ "userId": 42, "latitude": 43.65, "longitude": -79.38 }` → 202.
  Feeds the Redis geo index. **Call this periodically while the app is foregrounded**
  or the user won't appear in `/api/pets/nearby` or get `distance` values.
- `POST /api/match` `{ "searchLatitude", "searchLongitude", "preferencesMask" }` →
  `{ "userId": 7 }` or 404 `{ "message": "no-match" }` — the low-level expanding-radius matcher.
- `GET /api/system/health` — liveness probe.

---

## Running the backend locally

```bash
cd backend
docker compose up -d          # Postgres 16, Redis Stack, Kafka, Prometheus, Grafana
./mvnw spring-boot:run        # or mvnw.cmd on Windows — serves on :8080
```

Tables are created by **Flyway** on startup (`backend/src/main/resources/db/migration`);
Hibernate runs with `ddl-auto: validate` and refuses to boot if entities and schema disagree.
Demo data: use `POST /api/auth/register` + `POST /api/pets` + `POST /api/telemetry/location`,
or the bulk generators under `/api/test-data/*` (see `backend/README.md`). The test-data and
inspector endpoints are gated behind `app.test-endpoints.enabled` — on locally, off in deployed
environments.

---

## 10. Mobile-app v2 endpoints (added 2026-07-13) 🔒 all require Bearer token

Token-derived identity throughout — none of these take a `userId` param. Full
request/response shapes are specified in `FRONTEND_MOBILE_API_MAPPING.md` (they
match the TS interfaces in `frontend/mobile/src/screens/*` 1:1).

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/google` `{idToken}` → `{token,userId,name,email,role}` |
| Profile | `GET/PUT /api/users/me` · `GET /api/users/me/stats` → `{posts,pets,friends}` |
| Pets | `GET /api/pets/my` · `POST /api/pets` (token-owned) · `PUT/DELETE /api/pets/{id}` (owner only) |
| Walk board | `GET /api/walk/invitations/feed?lat&lng` · `GET .../my` · `POST/PUT/DELETE /api/walk/invitations[/{id}]` · `POST /api/walk/requests` `{invitationId}` · `GET /api/walk/requests/my-sent[-unread]` · `PUT /api/walk/requests/{id}` `{status}` (host only) · `GET /api/walk/notifications` |
| Date board | same shape under `/api/date/*` (single `hostPetId`, `location` instead of `route`) |
| Market | `GET /api/market/items?category=` · `GET /api/market/items/my` · `POST/PUT/DELETE /api/market/items[/{id}]` (DELETE = withdraw) · `GET /api/market/chats` |
| Messages | `POST /api/messages` with `walkRequestId`/`dateRequestId`/`marketItemId` alias · `GET /api/messages/walk-request/{id}` · `/date-request/{id}` · `/market-item/{itemId}/{otherUserId}` (mark read on fetch) · `GET /api/messages/unread-counts` → `{WALK,DATE,MARKET}` |

Performance notes: board feeds and unread counts are Redis-cached (30 s / 15 s TTL,
write-invalidated); notification rows are created asynchronously via the `app-events`
Kafka topic, so message/request POSTs never wait on notification writes.

## Known gaps (backend roadmap)

- Legacy endpoints (`/api/pets/nearby|partners|blind-dates`, `/api/invitations`,
  `/api/marketplace`, `/api/notifications`, …) still accept client-supplied ids for
  frontend1 compatibility; the mobile app should only use the token-derived endpoints above.
  All of them now require the Bearer token even so.
- Media upload (pet photos, listing photos, message images) — the mobile app uploads to
  Firebase Storage client-side and sends URL strings; there is still no server-side upload endpoint.
- Social feed (posts/comments/friendships) has repositories but no endpoints (no Feed tab in the design).
- **Login is rate limited (2026-08-11).** Two independent windows, both answering `429` with a
  `Retry-After` header, on `/api/auth/{login,register,google}` and the `/api/users/*` aliases:
  - **per IP** — 20 attempts/60s, enforced in a servlet filter *before* the body is parsed, so a
    blocked request never reaches BCrypt. This is the CPU-exhaustion defence.
  - **per account** — 10 *failed* attempts/900s, cleared by a successful login, so a spray spread
    across many source addresses still hits a wall.

  Repeating one email trips the account budget first: 11 × `401`, then `429`. Spreading attempts
  across different emails trips the IP budget instead. Counters live in Redis and **fail open** —
  if Redis is unreachable the request is allowed, because a broken cache must not lock the whole
  user base out of a healthy application. Tunable via `app.ratelimit.login.*`.
- Chat is still poll-based; no WebSocket.
- **Matching now requires live presence.** A user only appears as a walking partner if they have
  pinged `POST /api/telemetry/location` recently (6h presence TTL). Seeding accounts without
  sending telemetry for them will produce empty match results — that is intended behaviour, not a
  bug. Set `app.matching.require-fresh-presence=false` for demos that need the old behaviour.
