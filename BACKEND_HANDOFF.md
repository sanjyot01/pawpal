# Backend Handoff — Status, Gaps & Workarounds

**Date:** 2026-07-02 · **Branch:** `feature/sanjyot-db-schema` · **Owner:** Sanjyot (backend)

This is the honest state of the backend for the frontend team. Read together with:

| Doc | What it's for |
|---|---|
| `API_REFERENCE.md` | The integration contract — every endpoint with request/response examples |
| `PawPal.postman_collection.json` | One-click E2E test suite (Import → Run → all green) |
| `backend/DATABASE_SCHEMA.md` | Schema reference (v1.2.0, 12 tables) |
| `backend/README.md` | Infra/monitoring details (Kafka, Redis, Grafana) |

## Quick start (frontend dev machine)

```bash
git clone https://github.com/huangjIT/capstone.git && cd capstone
git checkout feature/sanjyot-db-schema
cd backend
docker compose up -d            # needs Docker Desktop
./mvnw spring-boot:run          # needs JDK 21; mvnw.cmd on Windows → :8080
```

Android emulator reaches it at `http://10.0.2.2:8080` (already configured in
`frontend/mobile/src/utils/api.ts`). Physical device: your machine's LAN IP.

---

## ✅ Implemented and verified

| Feature | Endpoints | Notes |
|---|---|---|
| Auth (register/login) | `POST /api/auth/register`, `/login` | Matches the mobile app's contract exactly (`{token,userId,name,email}`); BCrypt + 7-day JWT |
| Pet create/read | `POST /api/pets`, `GET /api/pets/{id}`, `/owner/{ownerId}` | |
| Discovery (map, partners, blind dates) | `GET /api/pets/nearby`, `/partners`, `/blind-dates` | DTOs match `mockData.ts` interfaces 1:1 |
| Walk invitations | `GET/POST/PUT/DELETE /api/invitations`, `POST .../join` | Backed by WALK-type events |
| Match requests (Connect → Accept/Deny/Block) | `/api/matches` 🔒 | Reverse-pair/self/same-owner guards; denied is retryable, blocked is final |
| Chat | `/api/messages` 🔒 | Threads scoped to match or listing; inbox, mark-read, unread count |
| Marketplace | `GET/POST /api/marketplace/items`, `PUT .../sold` | |
| Reviews → pet rating | `POST /api/reviews`, `GET /api/reviews/pet/{id}` | Aggregates into the `rating` on partner cards |
| Notifications + deep links | `/api/notifications` | `relatedType`/`relatedId`/`senderId` on every event the backend generates |
| Location ingest | `POST /api/telemetry/location` | Kafka → Redis geo; feeds nearby/distance |

🔒 = requires `Authorization: Bearer <token>`.

---

## ❌ Not implemented — with frontend workarounds

### 1. Missing CRUD endpoints (most likely to bite you)

| Missing | Impact | Workaround until built |
|---|---|---|
| `PUT /api/users/{id}` — edit user profile | Me tab can't save name/bio changes | Render profile read-only, or hold edits client-side. **Ask backend when you get to this screen — small job.** |
| User profile fields (avatar, bio, location) don't exist on the `users` table | Me tab's bio/location have nowhere to live | Same as above — needs a schema addition |
| `PUT /api/pets/{id}`, `DELETE /api/pets/{id}` | Can create pets but not edit/delete them | Same — small job, ask when needed |
| Edit/delete a marketplace listing | Only `PUT .../sold` exists | Mark sold instead of deleting |
| Activity stats (Walks Matched / Date Requests / Items Sold on Me tab) | No endpoint | Show placeholders; data exists in DB, endpoint is a quick add |

### 2. Auth caveats

- **⚠️ Changed 2026-08-09: the Bearer token is now enforced on ALL of `/api/*`.** The only
  endpoints that work without one are `POST /api/auth/register|login|google`, their
  `/api/users/register|login` aliases, and `GET /api/system/health`. Everything else returns
  `401 {"message":"Missing or invalid Bearer token"}`.
  **If any screen still calls the API without the header, it breaks now** — the previous advice to
  "send it anyway" was the migration path, and this is that migration. Attach it in one place
  (a shared fetch wrapper / axios interceptor) rather than per call.
- **Identity comes from the token, not the body.** `POST /api/telemetry/location` ignores any
  `userId` you send and uses the authenticated user — so the body is just `{latitude, longitude}`.
  Assume the same direction of travel elsewhere: stop sending `userId` for "who am I".
- **Google SSO now exists** — `POST /api/auth/google` with `{ "idToken": "..." }` verifies the
  Google token, finds or creates the account, and returns the same `{token, userId, ...}` shape as
  login. The Login screen's Google button can be wired up.
- **No token refresh / logout endpoint.** Token lives 7 days; on any 401, clear the
  stored token and route to Login. "Logout" = delete the token client-side.
- Passwords: min 6 chars enforced server-side; error messages are human-readable.

### 3. No media upload

`profile_photo_url`, `media_url`, `cover_photo_url` columns exist but there is **no
upload endpoint and no file storage**. The design's emoji-based avatars (`avatarEmoji`
on pets, emoji on listings) are fully supported — build with emoji, treat photos as
a later sprint.

### 4. No real-time anything

- **Chat is polling-based.** No WebSocket/SSE. Poll `GET /api/messages/thread` (e.g.
  every 3–5s while a chat screen is open) and `unread-count` on the tab bar.
- **No push notifications** (FCM/APNs). The in-app feed only updates when you call
  `GET /api/notifications`. Poll on app foreground + notification screen open.

### 5. Location is opt-in and client-driven

Users only appear on the map / get `distance` values after the app POSTs
`/api/telemetry/location`. **The app must send location periodically while
foregrounded** (the old `frontend/src` screens never did this — that's why the map
falls back to mock pins). One POST on app-open + every ~60s is plenty for the demo.

### 6. Invitation model doesn't cover the whole design form

The Post Invitation screen designs show start→end route, walking pace, and duration.
The backend stores a **single route text**, date/time, spots, emoji, description.
- Workaround: concatenate "Start → End" into `route`; put pace/duration in `description`.
- "Draft" status doesn't exist server-side (only UPCOMING/CANCELLED) — the
  Active/Draft badges in the mock are cosmetic.
- "Withdraw" = `DELETE /api/invitations/{id}` (sets CANCELLED).

### 7. Matching engine vs. match requests are separate systems

`POST /api/match` (Redis geospatial "find nearest compatible walker", Sprint-3
engine) and `/api/matches` (request threads) are **not connected**. There's no
"suggest a partner then one-tap connect" pipeline yet. UI flow that works today:
browse `/api/pets/partners` → Connect via `POST /api/matches`.

### 8. Blocking is per pet-pair, not per user

`PUT /api/matches/{id}/block` blocks that pet pair from re-matching. There is **no
user-level block list** — a blocked user can still message you and their other pets
can still send requests. Flag this in UX if blocking matters for the demo.

### 9. Social feed doesn't exist as an API

`posts`, `comments`, `friendships` tables + repositories exist but have **no
endpoints** (the current 20-screen design has no Feed tab, so this was deprioritized).

### 10. Scale/quality debt (doesn't block the demo)

- No pagination on list endpoints (full lists returned) — fine at demo scale. The discovery feeds
  are now bounded by *distance* instead (25 km default, 100 km cap), which also bounds their size.
- Rate limiting covers the auth endpoints only (per IP + per account, `429` + `Retry-After`).
  `/api/test-data/*` and `/api/inspector/*` remain gated behind `app.test-endpoints.enabled` and
  switched off in the AWS deployments. Everything else is unthrottled.
- CORS is configurable via `app.cors.allowed-origins` (still permissive in dev config).
- Schema is owned by **Flyway** (`backend/src/main/resources/db/migration`) with
  `ddl-auto: validate` — the app refuses to start if entities and schema disagree.
- Test suite is the Postman collection + 13 JVM tests; still no coverage of matching or telemetry.
- Enum-ish values validated at the API layer only, stored as free strings in the DB.
- `frontend/src` (the older web-style wiring) doesn't send Bearer tokens and predates
  matches/messages/reviews — **treat `frontend/mobile` + `API_REFERENCE.md` as the
  source of truth**, not `frontend/src/services`.

---

## Screen-by-screen readiness for the mobile team

| Screen | Backend ready? | Notes |
|---|---|---|
| Splash / Login / SignUp | ✅ | Contract already matches your code; Google button = stub |
| HomeMapScreen | ✅* | *Must send telemetry first (see §5) |
| FindPartnersScreen | ✅ | Partners + My Invitations |
| Post/Edit Invitation | ✅* | *Route is one text field; pace/duration → description (§6) |
| WalkRequestDetail (thread + Accept/Deny/Block) | ✅ | `/api/matches` + `/api/messages?contextType=match` |
| PetBlindDateScreen + request flow | ✅ | Same match API, `matchType: BLIND_DATE` |
| NotificationDetail | ✅ | Deep-link fields on every notification |
| Marketplace + MarketplaceChat | ✅* | *Emoji thumbnails, no photos; chat via `contextType: listing` |
| NotificationsScreen | ✅ | Poll-based (§4) |
| MeProfileScreen | ⚠️ | Pets + reviews readable; **no user edit, no pet edit, no stats** (§1) |
| OwnerProfile / ConnectPetProfile | ✅ | `GET /api/pets/{id}` + reviews |

---

## Suggested backend priorities after handoff (for whoever picks it up)

1. `PUT /api/users/{id}` + profile fields, `PUT/DELETE /api/pets/{id}` — unblocks the Me tab
2. ~~Enforce Bearer on all `/api/**`~~ — **done 2026-08-09** (see §2 above)
3. Activity-stats endpoint for the Me tab
4. WebSocket or polling-contract hardening for chat
5. ~~Push notifications~~ — **backend done 2026-08-09.** Remaining work is client-side: register the
   Expo push token at `POST /api/notifications/device-token` on launch and on rotation, `DELETE` it
   on logout, and create Android channels with ids `messages`, `requests`, `social`. Channel ids
   that don't match are dropped silently by Android, with no error anywhere — this is the single
   easiest way to "implement push" and see nothing arrive.
5. Media upload (S3/local) for pet & listing photos
6. Flyway + pagination + real test suite (pre-req for the Sprint-4 50k-user load test)
