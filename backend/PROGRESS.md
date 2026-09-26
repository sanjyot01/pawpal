# PawPal Backend — Progression Report

**Date:** 2026-06-16
**Scope:** Full audit of `pet_social/backend` source tree, configuration, and schema docs.

> **Correction (2026-06-16, after reading `Project Proposal Group 3 Capstone (2).docx`):** Section 2.2 and the "Recommended order of work" below originally framed the Kafka/Redis matching engine as pre-migration residue to remove. That's wrong — per the capstone proposal, Sprint 3's actual deliverable is "Kafka/Redis geospatial dispatch logic for walking partner matching," which is exactly what `MatchingService`/`TelemetryProducerService`/`TelemetryConsumerService` already implement as a PoC. **Treat the matching engine as a feature to rename and evolve, not delete.** Only the driver/vehicle-flavored naming (`capabilityMask`, `driverId` alias, `demo.ps1`'s `vehicleType`) is actual residue. See `TELEMETRY_ARCHITECTURE.md` for the full target design this PoC is evolving toward.
>
> **Note on the Figma design:** the linked file (`figma.com/design/vMnjFIIFZn4yIJYpu59Nsz/pawpal`) could not be inspected — tried both the standard share link and the `m=dev` Dev Mode link. Figma renders entirely client-side and neither is accessible without an authenticated session or a personal access token. Everything below is derived from the codebase only. The "Pending" section flags where a real screen/field list from Figma would likely change priorities (profile pages, feed, chat, matching UI especially) — re-run this audit with Figma access (token, exported frames/screenshots, or a manual description) once available to validate it.
>
> **Update (2026-06-16, later same day):** items #1, #6, and #9 in Section 3, and the naming-residue list in Section 4.7, are now **RESOLVED** — see `TELEMETRY_ARCHITECTURE.md`/`README.md`'s "Recently completed" notes. All 8 PawPal entities now use real `@ManyToOne`/`@JoinColumn` FK relationships with DB constraints, indexes matching `DATABASE_SCHEMA.md`'s strategy, and `GenerationType.SEQUENCE` ids (for Hibernate batch-insert support). The driver/delivery naming (`capabilityMask`, `deliveryLatitude`/`deliveryLongitude`, `driverId` alias, `demo.ps1`'s `vehicleType`, `DashboardService`'s `dispatch.*` metrics) has been renamed throughout. Left as-is below for the historical record of what was found.
>
> **Update (2026-08-09):** several gaps recorded below are now closed. Body left unchanged, per the
> convention above — this note is the current state. Full detail and rationale in
> `SCALABILITY_REVIEW_2026-08-09.md`.
>
> - **§4.2 Security — largely resolved.** BCrypt + JWT exist, and the Bearer gate now covers **all
>   of `/api/*`** with a small public allowlist (register/login/google + health), so it is
>   deny-by-default rather than an enumerated list of protected paths. CORS is configured via
>   `app.cors.allowed-origins`. `/api/test-data/*` and `/api/inspector/*` are gated behind
>   `app.test-endpoints.enabled` and disabled in the AWS deployments — so the unbounded load
>   generator noted below is no longer internet-reachable. **Rate limiting is still missing**, and
>   login's unthrottled BCrypt (~100 ms CPU/attempt) remains the sharpest edge.
> - **§4.3 Data integrity — resolved.** Bean Validation is in use on request DTOs, FK constraints
>   exist, and **Flyway now owns the schema** (`ddl-auto: validate`), so migrations are versioned
>   and reviewable. Enum-like `String` fields are still unconstrained.
> - **§4.4 Testing — partially resolved.** 13 tests now (auth, user service, exception handling,
>   context load), up from the single smoke test. Still no coverage for matching logic, telemetry
>   processing, or dashboard aggregation — the highest-value gap remaining.
> - **§4.7 Secrets — partially resolved.** `deploy/` uses `.env` + SSM Parameter Store;
>   `docker-compose.aws.yml` still carries a plaintext JWT secret and should be rotated.
>
> **Update (2026-08-11):** body still unchanged, per the convention above.
>
> - **Rate limiting — now closed.** The gap called "the sharpest edge" in the 2026-08-09 note is
>   fixed. Login is throttled per source address (20/60s, in a filter ahead of BCrypt) and per
>   account (10 failures/900s, cleared on success), both answering `429` + `Retry-After`, both
>   Redis-backed and both failing open. Detail in `SECURITY_FIXES.md` §8.
> - **§4.7 Secrets — now resolved.** `docker-compose.aws.yml` carries no plaintext values; every
>   secret is `${VAR:?message}` from a gitignored `.env`, so compose refuses to start and names
>   what is missing instead of falling back to a default shared by every deployment.
> - **§4.4 Testing — improved, same shape.** 39 JVM tests, up from 13, and the new ones cover the
>   two areas the note called the highest-value gap: matching (self-exclusion, preference
>   filtering) and the distance-bounded discovery feeds, plus the rate limiter's window,
>   fail-open and boundary behaviour. Telemetry processing and dashboard aggregation are still
>   uncovered.
> - **New finding, found and fixed the same day.** The discovery feeds returned every open
>   invitation in the database and used distance only for the label — see `SECURITY_FIXES.md` §9.
>   Worth recording because the earlier reviews missed it: they audited
>   `/api/pets/{partners,blind-dates}`, but the mobile app reads
>   `/api/{walk,date}/invitations/feed`, which is different code. Auditing the endpoint you assume
>   the client calls is not the same as auditing the one it does.
> - **Redis key layout changed.** Section 1 below describes `users:meta:{id}` carrying `lastSeen`
>   under a 6h TTL. That hash is now split: `users:meta:*` holds durable `active`/`preferences`
>   with **no TTL**, and `users:presence:*` holds `lastSeen`/`available` and expires. The old
>   single-key design silently made any user idle for 6h unmatchable.

---

## 1. What this codebase actually is

**Confirmed by the project owner:** this backend was migrated from a driver-dispatch engine to the PawPal pet-social platform. The dispatch/telemetry/matching code below is **pre-migration residue, not an intentionally kept second system** — it still runs and shares the `users` table with the PawPal schema, but it represents cleanup debt, not a design decision to revisit.

| | Dispatch/Telemetry Residue (pre-migration) | PawPal Social Domain (current direction) |
|---|---|---|
| **Status** | Still fully functional, but obsolete | Schema only — no services/controllers |
| **Entities** | `User` (partial), `UserLocation` | `Pet`, `Friendship`, `Post`, `Comment`, `Event`, `EventAttendee`, `Message`, `PetMatch` |
| **Purpose** | Real-time geospatial dispatch matching (Kafka → Redis GEO → radius search) — not a PawPal feature | Pet profiles, social feed, events, messaging, pet-to-pet matching |
| **Reachable via HTTP?** | Yes | No |

This split is the single most important fact for planning next steps: **the social-network features implied by "PawPal" don't exist as APIs yet**, even though their database shape is fully designed — and the working endpoints that do exist today belong to the engine PawPal replaced, not to PawPal itself.

---

## 2. Completed

### 2.1 Infrastructure
- Docker Compose: PostgreSQL 16, Redis Stack (GEO + RedisInsight), Kafka in KRaft mode (no Zookeeper), Prometheus, Grafana.
- `Dockerfile`: multi-stage Maven build → `eclipse-temurin:21-jre-jammy` runtime, non-root `spring` user, ZGC JVM flags, heap caps, OOM heap dump.
- `monitoring/prometheus.yml` scrapes the app's `/actuator/prometheus` every 5s.

### 2.2 Geospatial matching engine (Sprint 3 PoC — keep & evolve, rename away from driver/vehicle terms)
- `POST /api/users/register` (`UserController` → `UserRegistryService`): persists a `User` row, seeds Redis metadata hash `users:meta:{id}` (`active`, `capability`, `lastSeen`) with a 6h TTL.
- `POST /api/telemetry/location` (`TelemetryController` → `TelemetryProducerService`): publishes `UserLocation` to Kafka topic `user-telemetry`, keyed by `userId` for per-user ordering. Returns `202 Accepted`.
- `TelemetryConsumerService`: `@KafkaListener` (group `user-group`, concurrency 3) writes into Redis GEO set `users:geo` and refreshes user metadata. Also exposes `processTelemetry()` for synchronous (non-Kafka) use by test-data tooling.
- `POST /api/match` (`MatchingController` → `MatchingService`): expanding-radius (2km → 5km → 10km) Redis GEO search, filters candidates by `active` flag and capability-bitmask AND-match, returns nearest valid user or `404 {"message":"no-match"}`.
- `GET /api/system/health` — trivial liveness string.
- `GET /dashboard/api/inspect` (`InspectorController`) — raw Redis debug view (telemetry count, geo set size, meta key count).

### 2.3 Operational tooling
- `DashboardService`: aggregates Postgres user counts + Redis counters into a metrics map; registers Micrometer `Counter`s (`dispatch.telemetry.processed`, `dispatch.match.success/failed`) and `Gauge`s (`dispatch.users.total/available/in_geo`).
- `DashboardController`: serves `dashboard.html` (Thymeleaf), `GET /dashboard/api/metrics`, `POST /dashboard/api/reset`.
- `dashboard.html`: live-polling (2s) UI with Chart.js graphs (data distribution, match success rate, user status, telemetry trend) and an activity log; controls to trigger test-data generation inline.
- `TestDataGeneratorService`: bulk user generation (random role/capability), bulk telemetry generation (NYC bounding box), and a background-thread continuous stream generator (configurable users/rps/duration). Exposed via `TestDataController` (`/api/test-data/users`, `/telemetry`, `/stream`, `/stats`, `/telemetry/single`, `/telemetry/bulk`).
- `demo.ps1` — end-to-end smoke script (health → register → telemetry → match → dump metrics to `logs/`). **Stale**: posts a `vehicleType` field `User` no longer has.

### 2.4 PawPal persistence layer (schema-complete, logic-incomplete)
All 9 entities + Spring Data repositories exist and structurally match `DATABASE_SCHEMA.md`:

| Entity | Repository highlights |
|---|---|
| `User` | `findByIsActiveTrue`, `findByEmail`, `findByRole` |
| `Pet` | `findByOwnerId`, `findBySpecies`, `findByIsAvailableForPlaydate`, `findByOwnerIdAndSpecies` |
| `Friendship` | `findByUserIdAndStatus`, `findPendingRequestsForUser`, `findFriendshipBetween` (bidirectional) |
| `Post` | paged `findByUserId/PetId/Visibility`, `findByUserIds` (feed query), `countByUserId` |
| `Comment` | paged `findByPostId`, `findByUserId`, `countByPostId` |
| `Event` | `findByOrganizerId`, paged `findByStatus`, `findUpcomingEvents`, `findByEventType/PetSpecies`, `findNearbyEvents` (lat/lon bounding box, **not** true geo radius) |
| `EventAttendee` | `findByEventId(AndUserId/AndRsvpStatus)`, `findByUserId`, `countByEventIdAndRsvpStatus` |
| `Message` | `findConversation` (paged, bidirectional), unread filters, `findRecentConversations` (native `DISTINCT ON`, Postgres-specific) |
| `PetMatch` | `findMatchesForPet`/`findMatchesForPetByStatus` (bidirectional), `findMatchBetweenPets` (either direction), `findByInitiatedByUserIdAndMatchStatus` |

`DATABASE_SCHEMA.md` documents column-level detail, sample data, an ERD, and a suggested index list for all 9 tables.

### 2.5 Documentation
- `README.md` — rewritten 2026-06-16 to reflect the dispatch/PawPal split, accurate endpoint list, and known gaps.
- `DATABASE_SCHEMA.md` — full schema reference for the PawPal domain.

---

## 3. Data model issues found during this audit

These apply to the existing entities regardless of what the Figma screens turn out to need — worth fixing before building controllers on top of them.

1. **No real foreign keys.** Every relationship (`Pet.ownerId`, `Post.userId/petId`, `Comment.postId/userId`, `Event.organizerId`, `EventAttendee.eventId/userId/petId`, `Message.senderId/receiverId`, `PetMatch.petId1/petId2`, `Friendship.userId/friendId`) is a bare `@Column Long`, not `@ManyToOne`/`@JoinColumn`. Hibernate's `ddl-auto: update` therefore creates plain `BIGINT` columns with **no FK constraint** — deleting a `User` or `Pet` silently orphans every dependent row.
2. **Reverse-pair duplicates not prevented.** `Friendship` (`UNIQUE(user_id, friend_id)`) and `PetMatch` (`UNIQUE(pet_id_1, pet_id_2)`) only block the exact ordered pair — `(A,B)` and `(B,A)` can both exist. The repositories already work around this with "either direction" query methods, which is itself a sign the DB constraint isn't sufficient.
3. **No self-friendship guard.** `DATABASE_SCHEMA.md` documents "cannot friend yourself" as a rule, but nothing in code enforces it (no service exists yet to enforce it in).
4. **All enum-like fields are unconstrained Strings**: `role`, `status`, `species`, `gender`, `size`, `temperament`, `eventType`, `petSpecies`, `rsvpStatus`, `matchStatus`, `matchType`, `messageType`, `visibility`. No `@Enumerated`, `@Pattern`, or DB `CHECK` constraint — typos corrupt data silently.
5. **Inconsistent boolean modeling.** `User.isActive` is primitive `boolean` (never null). `Pet.isNeutered/isVaccinated/isAvailableForPlaydate` and `Message.isRead` are boxed `Boolean` (nullable/tri-state). No stated reason for the split.
6. **`User.capabilityMask` is dispatch-only baggage** sitting on the same table PawPal's `Pet`/`Post`/etc. key off of via `ownerId`/`userId`.
7. **`User` has no profile fields** a social app would need: no avatar/photo, no bio, no location, no password/credential field at all. `Pet` has `profilePhotoUrl`; the human profile has nothing comparable.
8. **Geo capability is in the wrong place for "find nearby pets."** Redis GEO indexing exists only for dispatch users (`users:geo`), not pets. `Pet` has no location field. `Event` has `latitude/longitude` but `findNearbyEvents` does a naive `BETWEEN` range scan, not a real radius query.
9. **`UserLocation` still carries dispatch naming** (`@JsonAlias("driverId")` on `userId`) — harmless today, but a sign of incomplete renaming from an earlier delivery-dispatch iteration of this project.

---

## 4. Pending / not started

### 4.1 PawPal feature APIs (biggest gap)
No service or controller exists for any of: **Pet, Post, Comment, Event, EventAttendee, Message, Friendship, PetMatch.** Repositories are ready; nothing calls them from HTTP. Concretely missing:
- Pet profile CRUD
- Friend request send/accept/block flow
- Social feed (create/read posts, like/comment, visibility filtering)
- Event creation + RSVP flow
- Direct messaging (send/read/conversation list/unread count)
- Pet-to-pet match proposal/accept flow with compatibility scoring

### 4.2 Security
- No Spring Security, no JWT/session auth, no password field on `User`. **Every existing endpoint — including registration and matching — is fully public.**
- No CORS configuration.
- No rate limiting on any endpoint (relevant given `/api/test-data/stream` can spin up unbounded background load generators).

### 4.3 Data integrity / validation
- ~~No Bean Validation anywhere~~ — **partly done.** `AuthController`'s request records carry
  `@NotBlank`/`@Email`/`@Size`, and `MethodArgumentNotValidException` maps to a 400 listing the failed
  fields. This is the boundary that actually enforces anything: the mobile app is not the only client,
  so the client-side checks in `frontend/mobile/src/utils/validation.ts` exist for the round trip and the
  inline message, never as a gate. Still to do: the same treatment on pet, invitation and market bodies,
  which currently validate ad hoc inside controllers.
- No DB-level FK constraints, no enum constraints (see Section 3).
- ~~No schema migration tool~~ — **done.** Flyway owns the schema (`backend/src/main/resources/db/migration`)
  and `ddl-auto` is `validate`, so entity/migration drift fails at startup instead of silently mutating tables.

### 4.4 Testing
- ~~Exactly one test exists~~ — **40 tests now** across `AuthServiceTest`, `LoginRateLimiterTest`,
  `MatchingServiceTest`, `PetQueryServiceTest`, `UserServiceTest` and `GlobalExceptionHandlerTest`,
  running on H2 so `@SpringBootTest` needs no Docker (`src/test/resources/application.yml`).
- Still uncovered: telemetry processing, dashboard aggregation, and repository/entity behaviour.
- Unit tests alone have twice missed demo-breaking failures that only appear against real
  infrastructure and a real device — boot the stack and drive the emulator before calling something
  done. See [`E2E_TESTING.md`](../E2E_TESTING.md).

### 4.5 Geospatial story for PawPal
- "Nearby pets/playdates" has no real implementation path yet — would need either a `Pet`/`User` location field + reuse of Redis GEO, or a Postgres extension (PostGIS) for proper radius queries, since `Event.findNearbyEvents`'s bounding-box approach doesn't account for longitude distortion at different latitudes and doesn't return distance-sorted results.

### 4.6 Design alignment (unverified)
- Cannot confirm whether the current 9-entity schema actually covers everything in the Figma high-fidelity wireframes (e.g., notifications, multi-photo pet galleries, reviews/ratings for sitters/vets, saved/blocked-user lists, onboarding flow fields). **Revisit this section once Figma content is accessible.**

### 4.7 Misc cleanup
- `demo.ps1` references a removed `vehicleType` field — it's a pre-migration script and should be deleted or rewritten against PawPal endpoints once they exist.
- No `.env`/secrets management — Postgres/Redis/Kafka credentials are plaintext in `application.yml` and `docker-compose.yml`.
- **Naming residue to clean up (not the engine itself)**: `User.capabilityMask` (rename/repurpose into pet-walking match criteria), `UserLocation`'s `driverId` JSON alias (drop), `demo.ps1`'s `vehicleType` field (remove/rewrite). `UserController`/`TelemetryController`/`MatchingController` and their services should stay and be wired to real `Pet`/`User` profiles — they're the Sprint 3 matching feature, not legacy code.

---

## 5. Recommended order of work

1. **Get real Figma content** (token, export, or manual screen/field description) and re-run the "design alignment" check — this should drive feature prioritization more than anything else here.
2. **Rename and rewire the matching engine onto real Pet/User profiles** — it's the capstone's Sprint 3 deliverable (Kafka/Redis geospatial walking-partner matching), not residue. Drop only the driver/vehicle-flavored naming (see 4.7).
3. **Harden the existing PawPal entities before building on them**: add `@ManyToOne`/`@JoinColumn` FKs, Bean Validation, and either `@Enumerated` enums or `@Pattern` checks on the free-text status/type fields. Much cheaper now, before real data exists.
4. **Introduce Flyway** once entity shapes stabilize from step 3, replacing `ddl-auto: update`.
5. **Build PawPal services/controllers incrementally**, in dependency order: `User` profile fields (avatar/bio/location) → `Pet` CRUD → `Friendship` → `Post`/`Comment` (feed) → `Event`/`EventAttendee` → `Message` → `PetMatch`.
6. **Add real auth** (session or JWT) for the new PawPal endpoints from the start — don't repeat the old dispatch system's "fully public" mistake.
7. **Add a real test suite** alongside each new service (unit tests for business logic, `@DataJpaTest` for repository query correctness, `@SpringBootTest` for controller flows).