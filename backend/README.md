# Pet Social (PawPal) Backend

This is the backend for a PROG8751 capstone project ("Pet Social Companion App"). Per the project proposal, the core technical thesis is **real-time, geospatial walking-partner matching**: GPS telemetry ingested asynchronously through Kafka, indexed in Redis for fast proximity search, with PostgreSQL holding persistent pet/user/health data. The codebase currently contains two layers at different stages of maturity:

1. **The Kafka/Redis geospatial matching engine (Sprint 3's deliverable)** — real-time location telemetry over Kafka, Redis geo-indexing (`GEOADD`/`GEOSEARCH`), and radius-expanding preferences matching. Fully functional today (REST endpoints, a live dashboard, test-data generators) as a proof-of-concept of the walking-partner-matching feature. As of 2026-06-16 it's been renamed away from its earlier driver/delivery-dispatch naming (`matchPreferencesMask`, `searchLatitude`/`searchLongitude`, no more `driverId`/`vehicleType`) — the Kafka→Redis architecture itself was always the intended design, just with leftover naming from whatever template it was bootstrapped from.
2. **The PawPal pet-social domain schema** — JPA entities and repositories for users, pets, friendships, posts, comments, events, messages, and pet matches (see [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md)), now with real foreign-key relationships and indexes (see "Recently completed" below). **No services or REST controllers exist for this domain yet** — it's persistence-layer only.

If you're looking for pet profiles, a social feed, or messaging *endpoints*, they aren't there yet. What works today is registration, location telemetry ingestion, and nearest-match dispatch — built as a vertical slice ahead of the rest of the PawPal domain, and the direct basis for the walking-partner matching feature once it's wired to real `Pet`/`User` profiles instead of a generic preferences bitmask.

## 🏗️ Architecture Overview

```
┌─────────────┐      ┌──────────┐      ┌─────────────┐
│   Client    │─────▶│  Spring  │─────▶│ PostgreSQL  │
│             │      │   Boot   │      │ (Users +    │
└─────────────┘      └──────────┘      │  PawPal     │
                           │            │  entities)  │
                           ├──────────▶ Redis (Geo Index + metadata)
                           │
                           └──────────▶ Kafka (Telemetry topic)
```

### Core Technologies

- **Spring Boot 4.0.6** (Java 21)
- **PostgreSQL 16** — persistence, schema owned by **Flyway** (`ddl-auto: validate`)
- **Redis Stack** — geospatial indexing (`users:geo`), durable match metadata (`users:meta:*`) and expiring presence (`users:presence:*`)
- **Apache Kafka 7.5.0** (KRaft mode, single broker) — telemetry message streaming
- **Prometheus + Grafana** — metrics & monitoring
- **Docker Compose** — infrastructure orchestration

## 📋 Prerequisites

- Java 21+
- Maven 3.9+ (or use the bundled `./mvnw` / `mvnw.cmd`)
- Docker & Docker Compose
- 8GB RAM minimum (for all services)

## 🚀 Quick Start

### 1. Start Infrastructure Services

```bash
docker-compose up -d
```

This starts:
- PostgreSQL (port 5432)
- Redis Stack (port 6379, RedisInsight on 8001)
- Kafka, KRaft mode (port 9092)
- Prometheus (port 9090)
- Grafana (port 3000, admin/admin)

### 2. Run Spring Boot Application

```bash
./mvnw spring-boot:run
```

Or build and run JAR:

```bash
./mvnw clean package
java -jar target/pet_social-0.0.1-SNAPSHOT.jar
```

### 3. Verify System Health

```bash
curl http://localhost:8080/api/system/health
```

### 4. Access Dashboard

Open browser: http://localhost:8080/dashboard

There's also a smoke-test script, `demo.ps1`, that walks the whole flow (health check → register users → send telemetry → run matches → dump dashboard metrics), using the current field names (no more stale `vehicleType`).

## 📊 Monitoring & Observability

| Service | URL | Credentials |
|---------|-----|-------------|
| Application Dashboard | http://localhost:8080/dashboard | None |
| Redis Inspector (debug) | http://localhost:8080/dashboard/api/inspect | None |
| RedisInsight | http://localhost:8001 | None |
| Prometheus | http://localhost:9090 | None |
| Grafana | http://localhost:3000 | admin/admin |
| Actuator Metrics | http://localhost:8080/actuator/prometheus | None |

`monitoring/prometheus.yml` scrapes `host.docker.internal:8080/actuator/prometheus` every 5s plus itself; there is no pre-built Grafana dashboard/datasource provisioning, so Grafana starts empty.

## 🔌 API Endpoints

### Authentication (read this first)

**All of `/api/*` requires `Authorization: Bearer <token>`.** The only exceptions are the
endpoints that mint a token and the health probe:

```
POST /api/auth/register        POST /api/users/register   (legacy alias)
POST /api/auth/login           POST /api/users/login      (legacy alias)
POST /api/auth/google
GET  /api/system/health
```

Everything else returns `401 {"message":"Missing or invalid Bearer token"}` without one. The gate
is deny-by-default: it matches `/api/*` with the small allowlist above, rather than an enumerated
list of protected paths, so a newly added controller is protected the moment it exists. A forgotten
endpoint now fails visibly with a 401 instead of shipping open.

Beyond the matching/telemetry surface documented here, the app also serves pets, walks, dates,
marketplace, messaging, reviews, invitations and notifications — see `API_REFERENCE.md` at the
repository root for the full list.

### Health Check
```bash
GET /api/system/health          # public
```

### User Registration
```bash
POST /api/users/register
Content-Type: application/json

{
  "name": "Alice Smith",
  "email": "alice@example.com",
  "role": "PET_OWNER",
  "isActive": true
}
```
`role` is a free-text string in current code (no enum validation) — conventionally one of `PET_OWNER`, `PET_SITTER`, `VET`, `BUSINESS`. `matchPreferencesMask` is an optional field (defaults to `0`) — a bitmask of walking-partner matching preferences consumed by the matching engine below.

### Location Telemetry
```bash
POST /api/telemetry/location
Authorization: Bearer <token>
Content-Type: application/json

{
  "latitude": 43.6532,
  "longitude": -79.3832
}
```
The user id comes from the verified token, **not the body** — a client can only ever report its own
position. Any `userId` sent in the body is ignored (it used to be trusted, which let anyone write
anyone else's location).

Returns `202 Accepted` once queued onto the Kafka topic `user-telemetry`; a consumer asynchronously
writes it into the Redis geo index and refreshes `users:presence:{userId}`.

### Find Match
```bash
POST /api/match
Content-Type: application/json

{
  "searchLatitude": 40.7128,
  "searchLongitude": -74.0060,
  "preferencesMask": 5
}
```
Returns `{"userId": <id>}` (200) or `{"message": "no-match"}` (404).

### Push Notification Registration
```bash
POST   /api/notifications/device-token     # body: { "token": "ExponentPushToken[...]", "platform": "ANDROID" }
DELETE /api/notifications/device-token     # body: { "token": "..." } — call on logout
```
Register on launch and whenever the push service rotates the token; registration is idempotent and
reassigns a token that already exists, so a shared device changing accounts stops receiving the
previous user's notifications. The client must also create Android channels with ids `messages`,
`requests` and `social` — the OS silently drops notifications for a channel it doesn't know.

### Test Data Generation
```bash
POST /api/test-data/users?count=100
POST /api/test-data/telemetry?count=1000&maxUserId=100
POST /api/test-data/stream?users=100&rps=100&duration=30
GET  /api/test-data/stats
POST /api/test-data/telemetry/single      # synchronous single-record processing, body: UserLocation
POST /api/test-data/telemetry/bulk        # synchronous bulk processing, body: UserLocation[]
```
Gated behind `app.test-endpoints.enabled` (default `true` locally, forced `false` in the AWS
deployments). `/stream` spawns producer threads on demand, so on an internet-reachable box it lets
anyone run a load test against you. `/api/inspector/*` is gated by the same flag.

### Dashboard
```bash
GET  /dashboard                 # HTML dashboard (Thymeleaf)
GET  /dashboard/api/metrics     # JSON metrics powering the dashboard
POST /dashboard/api/reset       # reset in-memory/Redis counters
GET  /dashboard/api/inspect     # raw Redis inspection (telemetry count, geo set size, meta key count)
```

## 🗄️ Database Schema

The `users` table backs both the dispatch system and (partially) the PawPal domain:

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR NOT NULL,
    email VARCHAR NOT NULL UNIQUE,
    role VARCHAR NOT NULL,
    is_active BOOLEAN NOT NULL,
    match_preferences_mask BIGINT DEFAULT 0,
    created_at TIMESTAMP
);
```

Schema is owned by **Flyway** (`src/main/resources/db/migration`), not Hibernate. `ddl-auto` is
`validate`, so the app refuses to start if the entities and the migrated schema disagree, instead
of silently altering tables at boot.

`V1__baseline_schema.sql` was generated from the JPA metadata with Hibernate's schema exporter, so
it matches the entities exactly. Databases created before Flyway landed have tables but no
`flyway_schema_history`; `baseline-on-migrate` marks them as already at V1 and skips it, which is
why anything new (like `device_tokens`) lives in **V2 onward** — otherwise those databases would
never receive it. A fresh database runs V1 then V2 and lands in the same place.

In addition to `users`, eight more tables exist as JPA entities + Spring Data repositories, now with real foreign-key relationships and indexes, but **no service or controller layer wired up yet**: `pets`, `friendships`, `posts`, `comments`, `events`, `event_attendees`, `messages`, `pet_matches`. Full column-level documentation, sample data, ERD, and indexes for all nine tables live in [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md).

### Redis Data Structures

**Geo Index:**
```
Key: users:geo
Type: GEOSPATIAL (Redis GEO commands)
Purpose: Store user locations for radius searches
```

**User Metadata (durable — no TTL):**
```
Key: users:meta:{userId}
Type: HASH
Fields:
  - active: true/false
  - preferences: bitmask (long)
TTL: none
```

**Presence (volatile — expiry is the point):**
```
Key: users:presence:{userId}
Type: HASH
Fields:
  - lastSeen: epoch milliseconds
  - available: true/false
TTL: 6 hours, refreshed by every telemetry ping
```

These were one key until 2026-08-09. The per-ping `EXPIRE` took the registration-written
matching fields with it, so any user idle for six hours silently became unmatchable. Splitting
by lifetime fixes that and makes the expiry meaningful: no ping means not out walking, which is
exactly what matching should treat as unavailable.

**Metrics:**
```
metrics:telemetry:count (STRING)
metrics:match:success (STRING)
metrics:match:failed (STRING)
```

## ⚙️ Configuration

All configuration lives in `src/main/resources/application.yml` — there is no `.env` file or externalized secrets management; credentials below are plaintext defaults suitable for local dev only.

**Database:**
```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/pet_social_db
    username: admin
    password: rootpassword
```

**Redis:**
```yaml
spring:
  data:
    redis:
      host: localhost
      port: 6379
```

**Kafka:**
```yaml
spring:
  kafka:
    bootstrap-servers: localhost:9092
    consumer:
      group-id: dispatch-group   # producer key-serializer/value-serializer use JSON; consumer group used by TelemetryController's producer config
```

The actual Kafka consumer (`TelemetryConsumerService`) listens with `@KafkaListener` on topic `user-telemetry` using group id `user-group` and concurrency `3` — independent of the `dispatch-group` id configured for the default consumer factory.

### Environment Variables

Override default configs (Spring Boot relaxed binding):
```bash
export SPRING_DATASOURCE_URL=jdbc:postgresql://prod-db:5432/pet_social
export SPRING_DATA_REDIS_HOST=prod-redis
export SPRING_KAFKA_BOOTSTRAP_SERVERS=prod-kafka:9092
```

## 🧪 Testing

### Run Tests
```bash
./mvnw test
```

There is currently exactly one test in the project: `PetSocialApplicationTests.contextLoads()`, a no-op Spring context smoke test. There is no test coverage for matching, telemetry, dashboard metrics, or any repository/entity behavior.

### Manual Testing Workflow

1. Start infrastructure: `docker-compose up -d`
2. Run application: `./mvnw spring-boot:run`
3. Open dashboard: http://localhost:8080/dashboard
4. Generate test data using the dashboard controls (calls `/api/test-data/*`)
5. Watch metrics update live (dashboard polls `/dashboard/api/metrics` every 2s)

### Test Data Scenarios

**Scenario 1: Basic Flow**
```bash
# Register user
curl -X POST http://localhost:8080/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","role":"PET_OWNER","isActive":true}'

# Send location
curl -X POST http://localhost:8080/api/telemetry/location \
  -H "Content-Type: application/json" \
  -d '{"userId":1,"latitude":40.7128,"longitude":-74.0060}'

# Find match
curl -X POST http://localhost:8080/api/match \
  -H "Content-Type: application/json" \
  -d '{"searchLatitude":40.7128,"searchLongitude":-74.0060,"preferencesMask":0}'
```

**Scenario 2: Load Testing**
```bash
# Generate 1000 users
curl -X POST "http://localhost:8080/api/test-data/users?count=1000"

# Generate 10000 telemetry records
curl -X POST "http://localhost:8080/api/test-data/telemetry?count=10000&maxUserId=1000"

# Monitor at /dashboard
```

## 🎯 Matching Algorithm

`MatchingService` performs geospatial searches against the Redis `users:geo` index with escalating
radii, **nearest-first and capped** at each step:

| Step | Radius | Candidate cap |
|---|---|---|
| 1 | 2 km | 50 |
| 2 | 5 km | 100 |
| 3 | 10 km | 200 |

The cap has to grow with the radius. Results come back nearest-first, so widening the search while
keeping the same cap would return the same nearest members that already failed the filter, making
the expansion pointless. Capping at all matters because an unbounded 10 km search in Toronto covers
most of the city — the search used to be unbounded, with a separate blocking `HGETALL` per
candidate, which is O(city population) round-trips for a single match request.

### Filtering Criteria

Candidate metadata for a radius is fetched in **one pipelined round-trip**, then each candidate
must satisfy:
- ✅ a live `users:presence:{userId}` key — i.e. pinged recently, so actually out walking
- ✅ `active == true` (from `users:meta:{userId}`)
- ✅ `(candidate.preferences & required.preferences) == required.preferences`

The presence check is what connects matching to the telemetry pipeline; before it, matching read
only registration-time fields and ignored telemetry entirely. Disable with
`app.matching.require-fresh-presence=false` for demos that seed users without streaming telemetry
for them.

Returns the nearest matching user within the smallest satisfied radius, or 404 `no-match`. Every
call increments a success/failure counter via `DashboardService`.

**Implementation:** `src/main/java/org/example/pet_social/service/MatchingService.java`

## 📈 Performance Tuning

### JVM Configuration (Production, from `Dockerfile`)

```bash
JAVA_OPTS="-XX:+UseZGC -Xms1g -Xmx2g -XX:+HeapDumpOnOutOfMemoryError -XX:MaxMetaspaceSize=256m"
```

**ZGC Benefits:**
- Sub-millisecond GC pauses
- Intended to handle high concurrent telemetry load
- Helps keep P99 latency stable under load

### Kafka Consumer Tuning

`TelemetryConsumerService` runs with `concurrency = 3` parallel listener threads on group `user-group`.

### Redis Performance

Uses the default Spring Data Redis (Lettuce) connection factory — no custom pool tuning is currently configured in `application.yml`.

## 🐳 Docker Deployment

### Build Image
```bash
docker build -t pet-social-backend:latest .
```

### Run Container
```bash
docker run -p 8080:8080 \
  -e SPRING_DATASOURCE_URL=jdbc:postgresql://host.docker.internal:5432/pet_social_db \
  -e SPRING_DATA_REDIS_HOST=host.docker.internal \
  -e SPRING_KAFKA_BOOTSTRAP_SERVERS=host.docker.internal:9092 \
  pet-social-backend:latest
```

### Multi-Stage Build

The Dockerfile uses:
1. **Stage 1 (Builder):** `maven:3.9.9-eclipse-temurin-21`, dependency caching via `mvn dependency:go-offline`, then `mvn clean package -DskipTests`
2. **Stage 2 (Runtime):** `eclipse-temurin:21-jre-jammy`, copies only the built JAR

**Security Features:**
- Runs as a non-root `spring:spring` user
- JVM heap capped (`-Xms1g -Xmx2g`) with heap dump on OOM

## 📦 Project Structure

```
src/main/java/org/example/pet_social/
├── controller/
│   ├── UserController.java       # POST /api/users/register
│   ├── TelemetryController.java  # POST /api/telemetry/location
│   ├── MatchingController.java   # POST /api/match
│   ├── DashboardController.java  # GET/POST /dashboard/**
│   ├── InspectorController.java  # GET /dashboard/api/inspect (raw Redis debug view)
│   ├── HealthController.java     # GET /api/system/health
│   └── TestDataController.java   # POST /api/test-data/**
├── service/
│   ├── UserService.java               # basic User CRUD
│   ├── UserRegistryService.java       # registers User + seeds Redis metadata
│   ├── MatchingService.java           # geo radius search + capability filter
│   ├── TelemetryProducerService.java  # publishes UserLocation to Kafka
│   ├── TelemetryConsumerService.java  # @KafkaListener; writes geo index + metadata
│   ├── DashboardService.java          # aggregates metrics for the dashboard
│   └── TestDataGeneratorService.java  # bulk user/telemetry generation, continuous stream
├── repository/
│   ├── UserRepository.java            # used by the matching engine
│   └── (PawPal-only, no service/controller yet)
│       PetRepository.java, FriendshipRepository.java, PostRepository.java,
│       CommentRepository.java, EventRepository.java, EventAttendeeRepository.java,
│       MessageRepository.java, PetMatchRepository.java
│       (all use real @ManyToOne associations now, e.g. findByOwner_Id, not findByOwnerId)
├── entity/
│   ├── User.java          # hybrid: email/role/isActive (PawPal) + matchPreferencesMask (matching engine)
│   ├── UserLocation.java  # record; telemetry payload (userId, latitude, longitude)
│   └── (PawPal domain, persistence-only, now with real FK associations + indexes)
│       Pet.java, Friendship.java, Post.java, Comment.java, Event.java,
│       EventAttendee.java, Message.java, PetMatch.java
├── dto/
│   └── MatchRequest.java  # record(searchLatitude, searchLongitude, preferencesMask)
└── PetSocialApplication.java
```

See [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) for full column-level detail on every PawPal entity and its repository's query methods.

## 🔍 Troubleshooting

### PostgreSQL Connection Issues
```bash
docker-compose ps postgres
docker-compose logs postgres
psql -h localhost -U admin -d pet_social_db
```

### Redis Connection Issues
```bash
docker-compose ps redis
docker exec -it pet-social-redis redis-cli
127.0.0.1:6379> PING
```

### Kafka Issues
```bash
docker-compose logs kafka
docker exec -it pet-social-kafka kafka-topics --list --bootstrap-server localhost:9092
```

### Application Won't Start
```bash
java -version  # Should be 21+
./mvnw clean install
```

## 📝 Development Notes

### Recently completed (2026-06-16)
- All driver/delivery-flavored naming renamed: `User.capabilityMask` → `matchPreferencesMask`, `MatchRequest`'s `deliveryLatitude`/`deliveryLongitude`/`capabilitiesMask` → `searchLatitude`/`searchLongitude`/`preferencesMask`, `UserLocation`'s `driverId` JSON alias removed, `DashboardService`'s `dispatch.*` Micrometer metrics → `matching.*`, `demo.ps1`/`api-test.http` updated to match.
- Every PawPal relationship (`Pet.ownerId`, `Post.userId`/`petId`, `Friendship.userId`/`friendId`, etc.) converted from a bare `Long` column to a real `@ManyToOne`/`@JoinColumn` association with an actual DB foreign-key constraint.
- Indexes added on every FK column and the query patterns `DATABASE_SCHEMA.md` documents (Postgres doesn't auto-index FK columns, so this is a real perf fix, not just integrity).
- All 9 entities switched from `GenerationType.IDENTITY` to `GenerationType.SEQUENCE`, which is required for Hibernate's JDBC batch inserts (`hibernate.jdbc.batch_size`, now configured in `application.yml`) to actually take effect.

### Recently completed (2026-08-09)

See [`SCALABILITY_REVIEW_2026-08-09.md`](SCALABILITY_REVIEW_2026-08-09.md) for the full review and
rationale.

- **Matching bounded and pipelined** — nearest-first `GEOSEARCH` with growing per-radius caps, and
  one pipelined round-trip for candidate metadata instead of an `HGETALL` per candidate.
- **Auth is deny-by-default** — the JWT filter covers all of `/api/*` with a small public allowlist
  (register/login/google + the health probe), replacing an enumerated list where any forgotten
  endpoint shipped open. Telemetry identity now comes from the verified token, not the request body.
- **Flyway owns the schema**, `ddl-auto: validate`.
- **Redis keys split by lifetime** — durable `users:meta:*`, expiring `users:presence:*`.
- **Android push notifications** via Expo/FCM, delivered off the Kafka `app-events` pipeline.
- **Multi-node deployment** — 2-node + witness topology in [`deploy/`](deploy/README.md).
- **Metrics for the previously invisible** — Kafka batch-size distribution, telemetry parse/batch
  error counters, push delivery counters.
- **Caller mistakes answer 4xx, not 5xx** — `GlobalExceptionHandler` maps bad parameters, unknown
  paths and unparseable request bodies to 400/404. Each one previously reached the catch-all as a
  500, logging a stack trace and counting a server error against a healthy server. The remaining
  5xx counter now means something.

### Scheduling timezone (`APP_TIMEZONE`)

Invitation date/time are display strings the phone formatted in **its** zone, and `scheduledAt`
keeps them as that same naive local time. Whether a booking has passed — the only thing separating
an active invitation from a completed one, since there is no status column for it — is therefore a
question that has to be asked in that zone.

`app.timezone` (default `America/Toronto`) supplies it. Left at the container default of UTC, a
9 PM Toronto booking was compared against a UTC clock already past midnight and read as finished
the moment it was posted: gone from the feed, listed under Completed. Set this to the timezone your
users are in. Multi-timezone deployments need real instants instead — the client sending ISO-8601
with an offset and the column changing type, which is a migration rather than a config flag.

### Error contract

Every error body carries a `message`, whatever produced it — the `ErrorResponse` envelope from
`GlobalExceptionHandler`, a controller returning a status directly, or the raw JSON written by
`JwtAuthFilter` and `LoginRateLimitFilter`. That invariant is what lets the mobile client parse all
of them with a single function, so keep it when adding endpoints.

A 5xx `message` is an internal detail (`"JSON parse error: Unexpected character..."`) and clients are
expected to replace it with their own copy rather than render it. `HttpMessageNotReadableException`
is deliberately not echoed for the same reason: the parser quotes the offending input back.

### Known Issues
1. **Plain HTTP in the single-instance deployment:** tokens and the Grafana admin password cross
   the network in the clear. Fine for a demo, not for anything real. (`docker-compose.aws.yml` no
   longer carries plaintext secrets — every one is `${VAR:?}` sourced from a gitignored `.env`, so
   compose refuses to start and names the missing variable rather than falling back to a shared
   default.)
2. **Rate limiting is per-source, and sources are cheap:** login is now throttled per IP and per
   account (see "Rate limiting" above), which stops single-source BCrypt exhaustion and password
   spraying. It does not stop a botnet spread thinly across thousands of addresses — that still
   wants the WAF/ALB.
3. **No dead-letter topic:** telemetry processing is deliberately at-most-once (the next ping
   supersedes a lost one), and error counters now make failures visible, but poison messages are
   still dropped rather than parked.
4. **Ingest ceiling unmeasured:** ~720–1,000 records/sec on a laptop is the last real number. The
   5–10k/sec/node target is unvalidated; the batch-size metric and fixed generator pacing exist
   now to settle it.
5. **Single Kafka broker at RF 1**, and all writes funnel to one Redis primary — replicas are
   failover, not write capacity. Scaling writes needs `users:geo` sharded by city tile, since one
   key lives on one shard regardless of cluster size.
6. **Reverse-pair duplicates still possible:** `Friendship`'s and `PetMatch`'s unique constraints
   only block the exact ordered pair, not the swapped one — needs service-layer validation.
7. **Enum-like fields are still plain `String`:** `role`, `status`, `species`, etc. have no
   `@Enumerated` or `@Pattern` validation.
8. **Matching has no self-exclusion:** `POST /api/match` can return the requesting user as their
   own walking partner. Harmless but conspicuous in a demo — use two accounts.
9. **Prometheus/Grafana are empty by default.** `management.endpoints.web.exposure.include`
   defaults to `health,info` and the Prometheus endpoint is disabled, so a scraper gets a 404
   and dashboards stay blank. Set `MGMT_ENDPOINTS=health,info,prometheus` and
   `MGMT_PROMETHEUS_ENABLED=true` in environments where you want metrics.
10. **Query-parameter naming is inconsistent:** some endpoints take `lon`, others `lng`
    (e.g. `GET /api/pets/nearby?lat&lon` vs the walk feed's `lat&lng`). Sending the wrong one
    now returns a clear 400 rather than a 500, but the names should be unified.

### Matching Preferences Bitmask Reference (matching engine only)

```
Bit 0 (1):   Basic preference
Bit 1 (2):   Extended preference
Bit 2 (4):   Premium preference
Bit 3 (8):   Advanced preference
Bit 4 (16):  Expert preference
Bit 5 (32):  Special preference

Examples:
- 5 (binary: 101) = Basic + Premium
- 7 (binary: 111) = Basic + Extended + Premium
- 31 (binary: 11111) = All preferences
```

This bitmask is unrelated to the PawPal domain (`Pet`, `Post`, etc.) — it's solely consumed by `MatchingService` to filter walking-partner candidates. The bit meanings above are placeholders; defining real pet-walking preference flags (e.g. "walks large dogs," "available at night") is still pending.

## 🛣️ Roadmap

### Phase 1: Wire up the PawPal domain
- [ ] Add services + REST controllers for Pet, Post, Comment, Event, EventAttendee, Message, Friendship, PetMatch (repositories already exist)
- [ ] Implement authentication (Spring Security + JWT)
- [ ] Add input validation (Bean Validation on entities/DTOs)
- [ ] Wire the matching engine onto real `Pet`/`User` profiles instead of the generic preferences bitmask, and define real pet-walking preference flags

### Phase 2: Pet Social Features (depends on Phase 1)
- [ ] Pet CRUD endpoints
- [ ] Friendship request/accept flow
- [ ] Social feed (posts + comments)
- [ ] Image upload integration
- [ ] Pet compatibility matching algorithm

### Phase 3: User Experience
- [x] Mobile app (React Native / Expo — see `frontend/mobile`)
- [ ] Real-time messaging (WebSocket) — messaging currently polls
- [ ] Event management + RSVP flow
- [x] Push notifications (FCM via Expo) — backend complete; the client still needs to register its
      token at `POST /api/notifications/device-token` and create Android channels `messages`,
      `requests`, `social` (mismatched channel ids are dropped silently by the OS)

### Phase 4: Production Readiness
- [ ] Comprehensive test suite (unit + integration)
- [x] Schema migrations (Flyway) instead of `ddl-auto: update`
- [ ] CI/CD pipeline (GitHub Actions)
- [x] Cloud deployment — 2-node + witness topology in [`deploy/`](deploy/README.md)
- [x] Rate limiting on the auth endpoints (in-app, per IP + per account)
- [ ] Rate limiting at the edge (WAF/ALB) — for distributed sources the in-app limiter can't see
- [ ] Load test at the 50k-user target, with p95/p99 captured
- [ ] Load testing & optimization
- [ ] Security audit

## 🤝 Contributing

### Code Style
- Follow Spring Boot best practices
- Use constructor injection
- Add JavaDoc for public methods
- Write unit tests for new features

### Commit Messages
```
feat: Add pet profile endpoint
fix: Resolve Redis connection timeout
docs: Update API documentation
test: Add matching service unit tests
```

## 📄 License

This project is part of a capstone project.

## 🆘 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review application logs: `logs/app.log`
3. Inspect Redis data: http://localhost:8001 or `GET /dashboard/api/inspect`
4. Check Prometheus metrics: http://localhost:9090

## 📚 Additional Resources

- [Spring Boot Documentation](https://docs.spring.io/spring-boot/docs/current/reference/html/)
- [Redis Geospatial Commands](https://redis.io/commands/?group=geo)
- [Kafka Documentation](https://kafka.apache.org/documentation/)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [Prometheus Metrics](https://prometheus.io/docs/introduction/overview/)

---

**Built with ☕ and Spring Boot**