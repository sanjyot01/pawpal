# Scalability Review & Remediation — 2026-08-09

Code-level review of the backend against the Sprint 4 target (50k-user Toronto simulation,
5,000–10,000 telemetry events/sec/node on the 2-node + 1-witness AWS topology), followed by
the fixes applied in the same session. Companion to
`THROUGHPUT_OPTIMIZATION_2026-06-16.md`, which covers the telemetry pipeline specifically.

**Headline finding:** the telemetry ingest path — the part that has had the most optimization
attention — is *not* the first thing that breaks under the target load. The matching engine and
a Micrometer gauge both fail earlier, and the single-EC2 deployment caps everything regardless.

## 1. Bottlenecks, ranked by projected failure order

Ordering is by what fails first as load rises toward the target, not by discovery order. Each
component has a different cost model, which is what makes the ranking possible:
matching was O(candidates) per request, the gauge is O(users) per scrape, ingest is
O(1) round-trips per 1,000 records.

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Matching: unbounded geo search + one Redis round-trip per candidate | Critical | **Fixed** |
| 2 | Dashboard gauge loads the whole user table on every Prometheus scrape | Critical | **Fixed** |
| 3 | App, Postgres, Kafka and Redis all on one EC2 instance | Critical | **Fixed** (`deploy/`) |
| 4 | Hikari pool (20) vs Tomcat threads (200) mismatch | High | **Fixed** |
| 5 | Ingest ceiling is a plan, not a measurement | High | Partly fixed (now measurable) |
| 6 | Unauthenticated endpoints; `KEYS` scan; spoofable telemetry | High | **Fixed** |
| 7 | Schema managed by `ddl-auto: update` | Medium | **Fixed** (Flyway) |
| 8 | Silent data-loss paths (no DLQ; TTL erases matching metadata) | Medium | **Fixed** (DLQ still open) |

### 1. Matching: unbounded geo search + N+1 Redis reads — FIXED

`MatchingService` called `GEORADIUS` with no `COUNT` limit and no sort, then issued a separate
blocking `HGETALL` per candidate. At 50k users in Toronto a 10 km radius covers most of the
city, so a single match request could issue tens of thousands of sequential Redis calls —
repeated across all three expansion radii when no match was found. Cost grew linearly with user
density, which is exactly what the load test increases. Every stalled match also stalls the
Redis instance that telemetry ingest writes to.

**Fix:** the search is now bounded and nearest-first (`limit()` + `sortAscending()`), and all
candidate metadata for a radius is fetched in **one pipelined round-trip** instead of one
`HGETALL` per candidate.

The candidate cap **grows with each expansion step (50 → 100 → 200)**. This is the
non-obvious part: because results come back nearest-first, a wider radius with the same cap
would return the exact same nearest members that already failed the filter, making the
expansion pointless. Worst case per request is now 350 metadata reads across 4 round-trips,
down from O(city population) sequential calls.

### 2. Dashboard gauge loads the entire user table — FIXED

`DashboardService.availableUsersCount()` called `userRepository.findByIsActiveTrue().size()`,
hydrating every active user as a JPA entity just to count them — on every Prometheus scrape
(typically every 15s) *and* every dashboard request. At 50k users that is 50k entities
materialized repeatedly, competing with real traffic for the same Hikari connections and heap.
The observability system becomes the load.

**Fix:** added `UserRepository.countByIsActiveTrue()` (a derived `COUNT(*)`) and used it in both
the gauge and `getDashboardMetrics()`.

### 3. Single-instance deployment — FIXED

`docker-compose.aws.yml` co-located app, Postgres, Kafka and Redis on one instance with a 2 GB
app heap: Kafka replication factor 1, Redis unreplicated, one app instance, no load balancer,
port 8080 exposed directly to the internet. Whatever the code can do, the ceiling is this box,
and any container dying is a full outage.

**Fix:** the 2-node + witness topology now exists as deployable compose files in `deploy/`
(node A: app + Kafka + Redis replica; node B: app + Redis primary; witness: Sentinel only).
Apps behind an ALB in a public subnet, everything else private, Postgres on RDS, secrets from
SSM. The app talks to Redis **through Sentinel**, so a primary failover needs no redeploy.
Node A owns Flyway migrations so two instances can't race for the migration lock at startup.
See `deploy/README.md` for bring-up order, verification commands, a failover drill, and the
security-group matrix. Remaining Phase 2 work is unchanged: single Kafka broker at RF 1, and
one Redis primary for all writes.

### 4. Connection-pool arithmetic — FIXED

Tomcat defaults to 200 request threads against a 20-connection Hikari pool: up to 180 threads
queue for a connection with a 30s default timeout, so the failure mode under sustained
DB-heavy load is cascading 500s rather than graceful degradation.

**Fix:** `server.tomcat.threads.max` capped at 50 (`SERVER_TOMCAT_MAX_THREADS` to override).
Still to do: re-tune both numbers against a real load test, and check the total against
Postgres `max_connections` (default 100) before running a second app instance.

### 5. Ingest ceiling — now measurable

The last measured figure is ~720–1,000 records/sec on a laptop with one partition, with an
unexplained oscillation between ~500–1,000/sec. The 5–10k/sec target remains plausible but
unproven.

**Fixed:** added `telemetry.kafka.batch.size` (the distribution summary
`THROUGHPUT_OPTIMIZATION_2026-06-16.md` §4.1 said was needed to diagnose the oscillation), and
fixed the load generator's pacing — `startContinuousTelemetryStream` slept a flat 1000 ms *on
top of* however long the send blast took, so the offered rate was both bursty and below the
requested rate. It now sleeps only the remainder of each second.

**Structural limits that remain** (measurement first, then redesign):
- All consumer threads funnel into **one Redis primary**. Replicas provide failover, not write
  capacity.
- The geo index is **a single key** (`users:geo`), so even Redis Cluster would not spread these
  writes — one key lives on one shard. Real write scaling needs the index sharded by city tile
  or geohash prefix (`geo:{tile}`), querying the tile containing the search circle plus its
  neighbours.

### 6. Attack surface — FIXED

`JwtAuthFilter` was registered against an enumerated list of eleven URL patterns, so any
endpoint nobody remembered to add shipped open. Exposed at the time of review: the telemetry
POST (which trusted the `userId` in the request body — anyone could write any user's position),
`/api/match`, pet browsing, invitations, reviews, and marketplace. `InspectorController` ran
`KEYS users:meta:*`, a single blocking O(N) pass over the keyspace that stalls every other
Redis caller while it runs.

**Fixes:**
- The filter now covers **all of `/api/*`**, with an explicit allowlist in
  `JwtAuthFilter.PUBLIC_PATHS`: the three token-minting endpoints, their two legacy
  `/api/users/*` aliases, and `/api/system/health` (load balancers cannot log in). The posture
  flipped from allow-by-default to **deny-by-default** — a newly added controller is now born
  protected, and forgetting one causes an immediately visible 401 instead of a silently open
  endpoint.
- `TelemetryController` takes the user id from the verified JWT and ignores any id in the body,
  so a client can only ever report its own position.
- `TestDataController` and `InspectorController` are gated behind
  `app.test-endpoints.enabled` (`APP_TEST_ENDPOINTS_ENABLED`), which `docker-compose.aws.yml`
  now sets to `false`. `/api/test-data/stream` spawns producer threads on demand — on an
  internet-reachable box, that lets anyone run a load test against you.
- `KEYS` replaced with cursor-based `SCAN`.

**Closed 2026-08-11:** rate limiting shipped in-app rather than waiting for the WAF/ALB, because
the single-instance deployment has no edge to put it at. `LoginRateLimitFilter` counts attempts
per source address (20/60s) ahead of body parsing, so a rejected request never reaches BCrypt;
`AuthService` counts *failures* per account (10/900s, cleared on success) so a spray across many
addresses still hits a wall. Redis-backed, so the limit is per deployment rather than per JVM and
survives a restart — an attacker cannot reset their budget by crashing the app. Every Redis error
fails open by design.

Not a substitute for the edge: this caps a single source, not a botnet spread thinly across
thousands of addresses. The WAF item stays on the Phase 2 list.

### 7. `ddl-auto: update` — FIXED

Already failed silently once (see `THROUGHPUT_OPTIMIZATION_2026-06-16.md` §1): adding NOT NULL
columns to a populated table left the schema stale while the app kept running. At 50k-row
tables, boot-time DDL can also take long locks.

**Fix:** Flyway owns the schema (`src/main/resources/db/migration`), and Hibernate is set to
`ddl-auto: validate` — it now refuses to start on entity/schema drift instead of silently
mutating tables. `V1__baseline_schema.sql` was generated from the JPA metadata with Hibernate's
schema exporter, so it matches the entities rather than someone's recollection of them.

The split between V1 and V2 is the part worth understanding. Existing databases have tables but
no `flyway_schema_history`, so `baseline-on-migrate` marks them as already at V1 and skips it —
which means anything genuinely new can't live in V1 or those databases would never get it.
Hence `V2__add_device_tokens.sql`. Fresh databases run V1 then V2 and land in the same place.

Tests keep building their schema from the entities (H2), since the migrations are PostgreSQL DDL.
That split is also what makes drift detectable: the app boots `validate` against a Flyway-built
database, so a missing migration fails at startup rather than in production.

### 8. Silent data loss — partly fixed

Two paths:

- **Poison messages.** The consumer logs parse failures and commits offsets — deliberate
  at-most-once handling for telemetry, where the next ping supersedes the lost one and a retry
  loop would be worse than a gap. What was missing was visibility.
  **Fixed:** added `telemetry.consume.parse.errors` and `telemetry.consume.batch.errors`, so a
  systematic failure can no longer masquerade as low traffic. A dead-letter topic is still
  worth adding.
- **TTL erases matching metadata — FIXED.** The consumer refreshed a 6-hour `EXPIRE` on
  `users:meta:{id}`, but that same hash held the `active` and `preferences` fields written once
  at registration, so a user idle for more than 6 hours silently became unmatchable. Under a
  multi-day soak test this presents as mysterious match-rate decay.
  **Fix:** the key is split by lifetime. `users:meta:*` keeps durable profile facts and carries
  **no TTL**; `users:presence:*` holds `lastSeen`/`available`, is refreshed by every ping, and is
  *meant* to expire — no ping means not out walking.

**Related design gap — FIXED.** Matching previously filtered on `active`/`preferences` only,
both written at registration, so it ignored telemetry freshness entirely: the two systems being
load-tested weren't actually connected. Matching now also requires a live `users:presence:*` key,
fetched in the same pipelined round-trip as the metadata, so "available" means "pinged recently"
rather than "ticked a box at signup". `PetQueryService`'s online indicator moved to the same
signal for the same reason. Controlled by `app.matching.require-fresh-presence` (default true;
set false for demos that seed users without streaming telemetry for them).

## 2. What is already sound

Worth stating explicitly, because the review focused on what breaks:

- **Async ingest by design.** `202 Accepted` + Kafka decouples spike absorption from processing;
  per-user partition keys preserve chronological order where it matters.
- **Batch consumption with one pipelined Redis call per batch**, amortising the round-trip
  across up to 1,000 records.
- **Partition count declared in code** (`KafkaTopicConfig`) and shared with listener concurrency
  through one property, so the two cannot drift apart — the exact failure mode diagnosed on
  2026-06-16.
- **JPA hygiene:** `open-in-view: false`, fetch-joins against N+1s, pagination on feeds, JDBC
  batching with SEQUENCE ids, entity-level indexes on the hot query paths.
- **Stateless auth.** JWT verified per request with no DB hit — the property that makes
  horizontal scaling an infrastructure change rather than a code change.
- **Caching where polling concentrates.** `UnreadCountService` serves badge counts from a 15s
  Redis cache with write-side invalidation, degrading to Postgres when Redis is down.
- **Observability as method.** Micrometer p50/p95/p99 timers and purpose-built gauges were added
  *before* optimising; the 1-partition root cause was found because of them.

## 3. Target AWS architecture

### Phase 1 — capstone budget (~3 small EC2 + free-tier RDS)

The proposal's 2-node + 1-witness topology, actually implemented:

- **ALB in front of two app instances**, one per node. No session affinity needed — auth is
  already stateless. Removes both the single point of failure and the single-box CPU ceiling.
- **Node A: app + Kafka broker. Node B: app + Redis primary.** Never co-locate the broker with
  the Redis primary; they compete for the same disk I/O and network on the hottest path.
- **Witness (t3.nano): quorum only.** Runs Redis Sentinel (and later a Kafka controller vote) to
  arbitrate failover, carrying zero data-plane workload. Its purpose is split-brain prevention
  via an odd-numbered vote.
- **Postgres → RDS** (t4g.micro, free tier): managed backups, and the database's disk I/O
  isolated from Kafka's.
- **Secrets → SSM Parameter Store.** `docker-compose.aws.yml` currently carries DB credentials
  and the JWT signing secret in plaintext.
- **Only the ALB is public.** App instances and datastores move to private subnets.

### Phase 2 — with real budget

| Concern | Phase 1 (owned) | Phase 2 (managed) | Why |
|---|---|---|---|
| App tier | 2× EC2 + ALB | ECS Fargate + auto-scaling | Scale on CPU/RPS; deploys become task-definition updates |
| Kafka | 1 broker on EC2 | Amazon MSK (3 brokers, RF 3) | Survives broker loss; no self-managed KRaft quorum |
| Redis | primary + replica + Sentinel | ElastiCache, cluster mode | Only pays off *after* sharding `users:geo` — one key, one shard |
| Postgres | RDS single-AZ | RDS Multi-AZ + read replica | Automatic failover; reads move off the writer |
| Edge | ALB + security groups | + WAF rate rules, CloudFront | Throttle login and telemetry before the JVM pays for it |
| Secrets | SSM Parameter Store | Secrets Manager + rotation | Automatic rotation, IAM-scoped per service |
| Observability | self-hosted Prom/Grafana | Managed Prometheus + Grafana | Monitoring survives what it monitors |
| Delivery | `compose up` on the box | ECR + GitHub Actions | Zero-downtime deploys behind the ALB health check |

The interesting exception is Redis: the scaling work there is in the **data model**, not the
service tier. See §1.5.

## 3b. Android push notifications

The in-app feed already worked end to end (`AppEventsProducer` → Kafka `app-events` →
`AppEventsConsumer` → `notifications` row), but nothing ever reached the device — users only
learned about a walk request by opening the app. Delivery now hangs off that same pipeline.

- `device_tokens` stores Expo/FCM tokens. The **token**, not the user, is the identity:
  registering a token that already exists reassigns its owner, because a shared phone moving
  between accounts must not keep receiving the previous user's notifications. Dead tokens are
  deactivated, not deleted.
- `PushNotificationService` sends via Expo (which fronts FCM). Android specifics it gets right:
  a **channelId per category** (mandatory since Android 8 — a channel the client hasn't created
  is dropped silently by the OS); **`priority: high` only** for conversational/actionable
  categories, since marking everything high is what gets an app throttled by FCM and flagged in
  Android vitals; a **ttl** so a stale "someone messaged you" doesn't surface after doze; and a
  **data payload** carrying `relatedType`/`relatedId` so a tap deep-links to the right screen.
- Delivery runs on the Kafka consumer thread, never a request thread, and swallows its own
  failures — a push outage must not fail the API call that triggered it. It is deliberately not
  `@Transactional`: that would pin a Hikari connection for the whole push round-trip. The one
  write (pruning tokens the service reports as `DeviceNotRegistered`) carries its own
  transaction. Outbound timeouts are explicit so an unresponsive push service can't stall the
  consumer.
- Sends are batched to Expo's 100-message limit, and `push.notifications.{sent,failed}` plus
  `push.notifications.tokens.pruned` make delivery health visible.

**Client side, still to do:** register the Expo push token against
`POST /api/notifications/device-token` on launch and on token rotation, `DELETE` it on logout,
and create Android channels with ids `messages`, `requests` and `social` — ids that don't match
mean the OS silently drops those notifications.

## 4. Files changed in this session

- `service/MatchingService.java` — bounded nearest-first `GEOSEARCH`, growing per-radius caps,
  pipelined metadata fetch
- `repository/UserRepository.java` — `countByIsActiveTrue()`
- `service/DashboardService.java` — count query in gauge and metrics map
- `service/TelemetryConsumerService.java` — batch-size distribution, parse/batch error counters
- `service/TestDataGeneratorService.java` — compensated stream pacing
- `controller/TelemetryController.java` — identity from JWT, not the request body
- `controller/TestDataController.java`, `controller/InspectorController.java` — property gate;
  `KEYS` → `SCAN`
- `web/JwtAuthFilter.java` — public-path allowlist
- `web/WebConfig.java` — filter registered on `/api/*`
- `application.yml` — Tomcat thread cap, `app.test-endpoints.enabled`
- `docker-compose.aws.yml` — `APP_TEST_ENDPOINTS_ENABLED: "false"`
- `demo.ps1` — captures and sends tokens (login fallback for pre-existing users)
- `.gitignore` — ignore `logs/` and `.env`

Second pass (same day):
- `entity/DeviceToken.java`, `repository/DeviceTokenRepository.java`,
  `service/DeviceTokenService.java`, `service/PushNotificationService.java` — push delivery
- `controller/NotificationController.java` — device-token register/unregister
- `service/AppEventsConsumer.java` — push on every notification
- `service/UserRegistryService.java`, `service/TelemetryConsumerService.java`,
  `service/MatchingService.java`, `service/PetQueryService.java` — durable metadata split from
  TTL'd presence; matching wired to presence freshness
- `db/migration/V1__baseline_schema.sql`, `db/migration/V2__add_device_tokens.sql`, `pom.xml`,
  `application.yml`, `src/test/resources/application.yml` — Flyway replaces `ddl-auto: update`
- `deploy/` — 2-node + witness topology, `.env.example`, deployment README

Verified: `mvnw test` green (13 tests); all three compose files pass `docker compose config`.

## 5. Next steps

1. **Frontend coordination (blocking).** Screens calling previously public endpoints — pet
   browsing, invitations, reviews, marketplace, location pings, match — now need the
   `Authorization: Bearer` header the messaging screens already send. Usually one change to a
   shared HTTP-client interceptor. Smoke-test the app against this build before merging.
2. **Re-run the load test** with the fixed generator pacing, and read `telemetry.kafka.batch.size`
   to settle the oscillation question.
3. **Benchmark Redis directly** for the GEOADD+HSET+EXPIRE+INCR pattern (4 ops/record → 200k
   ops/sec at a 50k records/sec target) before sizing partitions.
4. **Verify matching still returns results** against a live stack. The filter semantics are
   unchanged, but the candidate set is now the nearest 50–200 rather than everyone.
5. Then: Flyway, the metadata TTL split, rate limiting, and the Phase 1 topology.
