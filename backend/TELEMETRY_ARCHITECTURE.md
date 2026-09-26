# Telemetry Ingestion & Processing Architecture — PawPal Companion App

**Audience:** capstone team + report. **Scope:** the real-time ingestion/processing pipeline behind walk tracking (GPS), NFC pet-identity scans, community events (alerts/sightings), and the trigger path into AI pet insights.

**Relationship to existing code:** the Kafka→Redis pipeline described here already exists as a proof-of-concept in `TelemetryProducerService.java`, `TelemetryConsumerService.java`, `MatchingService.java`, and `MatchingController.java` — built for the proposal's Sprint 3 goal ("Kafka/Redis geospatial dispatch logic for walking partner matching"). This document generalizes that PoC into the full target design and calls out exactly what changes are needed to get from "PoC" to "production-shaped for the demo load test." It does not propose a rewrite — it proposes an evolution.

---

## 1. System Architecture (textual diagram)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CLIENTS (React web app; phone GPS via browser geolocation; NFC reader)   │
│  - GPS ping every 1-5s during an active walk (batched client-side)       │
│  - NFC tag scan (pet ID lookup / lost-pet safety check)                  │
│  - Community event report (sighting / alert)                             │
└───────────────────────────────┬─────────────────────────────────────────┘
                                 │ HTTPS (batched JSON, up to 1000 events)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ EDGE: Load Balancer (AWS ALB / NGINX)                                    │
│  - TLS termination, sticky-session NOT required (stateless app tier)     │
│  - Routes /api/telemetry/**, /api/nfc/**, /api/events/** to app instances│
└───────────────────────────────┬─────────────────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ INGESTION LAYER (Spring Boot, Java 21 virtual threads, stateless, N pods)│
│  1. Bean-Validation + bounds check (lat/lng range, payload size, max     │
│     batch=1000) — reject garbage before it touches Kafka                │
│  2. Redis token-bucket rate limit per user/device (INCR + EXPIRE)        │
│  3. Hand batch to Kafka producer (acks tuned per topic, see §3)          │
│  4. Return 202 Accepted immediately — client is decoupled from           │
│     downstream processing latency                                        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ KAFKA (buffer-of-record, KRaft mode, 3+ partitions per topic)            │
│  Topics, each partitioned by petId (NOT geohash — avoids hot partitions):│
│   - pet-telemetry        (GPS pings, high volume, short retention)       │
│   - nfc-events           (scans, low volume, longer retention)           │
│   - community-events     (alerts/sightings, low volume, fan-out)         │
│   - ai-insight-triggers  (derived, written by consumers below)           │
└───────────────────────────────┬─────────────────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STREAM PROCESSING LAYER (Kafka consumer groups, one per topic purpose)   │
│  - Micro-batch poll (max.poll.records=1000, ~50-100ms linger)            │
│  - Dedupe via (petId, clientEventId) — idempotent upsert                 │
│  - Pipelined Redis writes: GEOADD (current position) + HSET (metadata)   │
│    in ONE round trip, not two (today's code does two separate calls)    │
│  - Batched JDBC insert into Postgres (hibernate.jdbc.batch_size or COPY) │
│  - Community-events consumer also publishes to Redis Pub/Sub /           │
│    WebSocket fan-out for live map updates to nearby subscribed clients   │
│  - On walk-completion event: publish to ai-insight-triggers topic        │
└───────┬─────────────────────────────────────────┬─────────────────────┘
        ▼                                           ▼
┌──────────────────────────┐          ┌──────────────────────────────────┐
│ REDIS (hot state)         │          │ POSTGRESQL (durable/ACID)         │
│ - GEO index: users:geo    │          │ - users, pets, friendships, posts,│
│   (GEOADD/GEOSEARCH)      │          │   events, messages, pet_matches   │
│ - users:meta:*  durable,  │          │ - schema owned by Flyway          │
│   no TTL (active/prefs)   │          │   (ddl-auto: validate)            │
│ - users:presence:* 6h TTL │          │ - telemetry_events: partitioned   │
│   (lastSeen/available)    │          │   by day, append-only history     │
└──────────────────────────┘          │ - FK constraints on all relations │
                                        └──────────────────────────────────┘
                                 ▲
                                 │ async, off the write path
┌─────────────────────────────────────────────────────────────────────────┐
│ AI INSIGHT WORKER (separate consumer group on ai-insight-triggers)       │
│  - Reads walk summaries from Postgres, produces insight records          │
│  - Decoupled so AI latency never affects ingestion SLA                   │
└─────────────────────────────────────────────────────────────────────────┘

OBSERVABILITY (cross-cutting): Micrometer → Prometheus → Grafana, already
wired in DashboardService.java; extend with Kafka consumer-lag exporter,
Redis command latency, JVM GC pause time, p50/p95/p99 ingestion latency.
```

---

## 2. Data Flow: Client → Ingestion → Processing → Storage

1. **Client batches events.** The React app/browser accumulates GPS pings locally (matches the proposal's "browser location permission integration," Sprint 2) and flushes a batch of up to 1000 records, or every N seconds — whichever comes first. NFC scans and community-event reports are sent as their own (typically single-record) requests since they're rare and latency-sensitive (safety use case).
2. **Ingestion API validates and rate-limits.** `POST /api/telemetry/batch` validates each record (lat/lng bounds, monotonic client timestamp, payload size) and checks a Redis-backed rate limit per `userId`/device before doing anything else — this protects Kafka and the rest of the pipeline from a single misbehaving client.
3. **Producer publishes to Kafka, keyed by `petId`.** Same pattern as today's `TelemetryProducerService.sendLocation()` (`TelemetryProducerService.java:30`), generalized to a typed event envelope (see §6) and to per-topic `acks` tuning (see §3). The API returns `202 Accepted` the instant the producer call returns — it does not wait for the consumer to process the record. This is what keeps ingestion latency under the 100ms budget regardless of downstream load.
4. **Kafka durably buffers and orders the stream.** Partitioning by `petId` (not by geohash/region) guarantees per-pet ordering without creating a hot partition out of a popular dog park. Partition count scales independently per topic based on its volume (telemetry needs many partitions; community-events needs few).
5. **Consumers process in micro-batches.** Each consumer group (`pet-telemetry-group`, `nfc-group`, `community-group`) polls up to 1000 records per call. For telemetry: dedupe by `(petId, clientEventId)`, pipeline a `GEOADD` + `HSET` per record into Redis in one round trip, then flush the whole batch to Postgres via a single batched JDBC insert (or `COPY`) into the partitioned `telemetry_events` table. This is the single biggest gap versus today's PoC: `TelemetryConsumerService.processTelemetry()` (`TelemetryConsumerService.java:58`) currently does two separate Redis calls per record and never writes to Postgres at all — it's GEO-index-only, which is fine for a PoC but won't survive the load test in Sprint 4 without batching.
6. **Hot state vs. durable history are deliberately separate stores.** Redis answers "where is this pet *right now*" (GEOSEARCH, ephemeral, TTL-bounded). Postgres answers "what happened historically" (walk paths, health correlations, AI-insight inputs) and is the source of truth for anything that must survive a Redis restart.

7. **Inside Redis, keys are separated by lifetime too.** `users:meta:*` holds durable profile facts
   (`active`, `preferences`) with **no TTL**; `users:presence:*` holds `lastSeen`/`available` and is
   refreshed by every ping under a 6h TTL. These were one hash until 2026-08-09, and the per-ping
   `EXPIRE` silently took the matching fields with it — any user idle for six hours became
   unmatchable. The split also gives expiry a meaning worth relying on: no ping means not out
   walking, which is now a filter condition in `MatchingService` rather than something matching
   ignored entirely.
7. **Side effects fan out asynchronously, off the critical path.** Community-event consumers publish to Redis Pub/Sub (or a lightweight WebSocket service subscribed to it) so nearby clients see a new sighting/alert on the live map within ~1s. Walk-completion events get published to a separate `ai-insight-triggers` topic so the (potentially slow) AI insight generation never blocks or competes with ingestion throughput.

---

## 3. Core Components & Key Design Decisions (with tradeoffs)

### 3.1 Ingestion Layer
- **Java 21 virtual threads, not WebFlux.** The proposal already commits to Java 21; virtual threads let blocking code (JDBC, Kafka producer `send().get()` if ever needed, simple servlet controllers) handle thousands of concurrent in-flight requests without a large platform-thread pool. *Tradeoff:* simpler code than a reactive stack, at a small cost in absolute max throughput versus a fully reactive pipeline — acceptable, since the bottleneck in this system is Kafka/Postgres I/O, not request-handling concurrency.
- **Validate and rate-limit before Kafka, not after.** Rejecting bad/abusive input at the edge (Bean Validation + Redis token bucket) keeps Kafka's topic clean and avoids wasting consumer cycles on garbage. *Tradeoff:* adds one Redis round trip per request — acceptable since it's sub-millisecond and prevents far more expensive downstream cleanup.

### 3.2 Stream Processing Layer
- **Kafka topic-per-event-type, not one topic with a type discriminator.** Telemetry (high volume, short retention, loss-tolerant) and NFC/community events (low volume, longer retention, loss-intolerant) have different retention and durability needs. Separate topics let each be tuned (and scaled) independently. *Tradeoff:* more topics to operate, acceptable at this scale (4 topics).
- **`acks=1` for telemetry, `acks=all` for NFC/community events.** A dropped GPS ping is invisible to the user; a dropped "lost pet" NFC safety event is not. Tuning durability per-topic instead of globally is the right granularity here.
- **Micro-batching (1000 records or ~50-100ms, whichever first).** Matches the proposal's explicit "Code-Level Micro-Batching" stretch goal. Batch size is a direct lever on the <100ms ingestion-to-visible-in-Redis latency budget — too large a batch under load risks blowing that budget, so it's capped by time as well as count.
- **Partition key = `petId`, not geohash.** A geohash-based key would concentrate all of one popular park's traffic onto a single partition (hot partition, no parallelism gain). Keying by `petId` spreads load evenly and preserves required per-pet event ordering.

### 3.3 Redis Buffering Strategy
- **One Redis, two clearly separated responsibilities — not two buffering systems.** (a) the geospatial index (`GEOADD`/`GEOSEARCH`) for "nearby" queries, ephemeral with a TTL (mirrors the existing `users:meta:{id}` 6h-TTL pattern), and (b) rate-limit counters. **Deliberately not** adding Redis Streams as a second buffer in front of Kafka — Kafka is already the durable buffer-of-record; running two buffering layers would duplicate complexity for no benefit at this scale. This is the explicit "avoid overengineering" call for an academic-scope system.
- **Pipeline writes.** `GEOADD` + `HSET` for the same event should be one Redis pipeline call, not two round trips — a concrete optimization the current PoC is missing.

### 3.4 Persistent Storage: SQL, not NoSQL
- **PostgreSQL only, no separate time-series/NoSQL store.** The proposal's data (users, pets, health records, events, telemetry history) is fundamentally relational with real referential-integrity needs (a finding already flagged in `PROGRESS.md` — the entities currently lack FK constraints, which should be fixed as part of this work, not deferred). Raw telemetry history goes into a **range-partitioned table** (`telemetry_events`, partitioned by day) rather than a dedicated time-series database — this keeps the stack to one database technology while still handling write volume via batched inserts and getting query-time benefits from partition pruning. *Tradeoff:* a dedicated time-series store (e.g., TimescaleDB) would compress/query history more efficiently at much larger scale, but that's not the bottleneck at capstone scale and adds an extra piece of infrastructure to operate, document, and demo.
- **PostGIS as the upgrade path for real geospatial queries.** `EventRepository.findNearbyEvents` today does a naive lat/lon `BETWEEN` range scan — that's fine for the events table's low write volume, but isn't the pattern for high-volume "nearby pets" queries, which should stay on Redis `GEOSEARCH` (already correct in `MatchingService.java`) rather than be pushed onto Postgres.

### 3.5 Telemetry Data Model
Event envelope (shared shape across topics, polymorphic payload):

```json
{
  "eventId": "uuid-client-generated",
  "petId": 123,
  "userId": 45,
  "eventType": "LOCATION_PING | NFC_SCAN | COMMUNITY_ALERT | WALK_STARTED | WALK_ENDED",
  "clientTimestamp": "epoch millis",
  "payload": { "...type-specific fields..." }
}
```
- `LOCATION_PING`: `latitude`, `longitude`, `accuracyMeters`, `speedMps`.
- `NFC_SCAN`: `tagId`, `scanLatitude`, `scanLongitude`, `scannerUserId`.
- `COMMUNITY_ALERT`: `alertType` (LOST_PET | SIGHTING | HAZARD), `radiusMeters`, `description`.
- `eventId` (client-generated) is the idempotency key used for consumer-side dedupe.

### 3.6 Rate Limiting & Backpressure
- **Edge rate limit** (Redis token bucket per user, e.g. cap ~20 pings/sec/user) — rejects abusive/misbehaving clients with `429` before they reach Kafka.
- **Kafka as the primary backpressure absorber.** If consumers fall behind, Kafka retains data (bounded by topic retention) rather than dropping it — the system degrades to "higher latency before data is visible," not "data loss," for telemetry. Consumer lag is the key signal to watch (see §7 monitoring) and the trigger for autoscaling consumer instances.
- **Producer-side backpressure:** if all brokers are unreachable, the ingestion API should fail fast with `503` rather than buffer unboundedly in process memory — pushing the retry responsibility to the client (reasonable, since client-side GPS batching already implies some local buffering).

### 3.7 Monitoring & Observability
Extends the Micrometer/Prometheus/Grafana stack already present (`DashboardService.java`, `monitoring/prometheus.yml`):
- Kafka consumer-lag-per-partition (via a Kafka exporter) — the single most important health signal for this architecture.
- Redis command latency and memory usage (GEO sets grow with active pet count).
- JVM GC pause time and virtual-thread pinning warnings (relevant specifically because the proposal commits to virtual threads — pinning on synchronized blocks or native calls would silently degrade the concurrency benefit).
- Ingestion endpoint p50/p95/p99 latency histograms, to verify the <100ms budget empirically — this is also the proposal's Goal 4 ("validate scalability using controlled load testing with measurable performance metrics"), and the existing `TestDataGeneratorService`'s continuous-stream mode (`TestDataGeneratorService.java:129`) is already a usable load-generation harness for that test.

---

## 4. Performance Optimization Strategies

| Lever | Current PoC state | Target |
|---|---|---|
| GC | ZGC already configured (`Dockerfile:40`) | Keep — sub-ms pauses matter under sustained write load |
| Kafka producer | **Done** — `linger.ms: 5`, `batch.size: 32768`, `compression.type: lz4` | Re-tune against a real load test |
| Redis writes | **Done** — one `executePipelined` call per Kafka *batch* (not per event), covering `GEOADD`+`HSET`+`EXPIRE` for every record plus a single `INCR` | Benchmark Redis directly for this write pattern (4 ops/record → 200k ops/sec at a 50k/sec target) before sizing partitions |
| Postgres writes | None on the telemetry path (Redis-only) | Batched JDBC insert (`hibernate.jdbc.batch_size`, configured, with `GenerationType.SEQUENCE` on every entity — IDENTITY ids silently disable Hibernate batching) or `COPY` per micro-batch |
| Connection pooling | HikariCP `maximum-pool-size: 20`, `minimum-idle: 5`; Tomcat request threads now capped at 50 to match | Re-tune both together against the load test, and check the total against Postgres `max_connections` before running a second app instance |
| Consumer concurrency | Driven by `app.kafka.telemetry-partitions` (default 3), shared with `KafkaTopicConfig` so partitions and concurrency can't drift apart | Scale partitions to `target ÷ measured per-thread throughput`; partitions only ever grow |
| Matching reads | **Done** — bounded nearest-first `GEOSEARCH` (caps 50/100/200 per radius) with one pipelined round-trip for candidate metadata | Push the filter into a Lua script if the round-trip still shows up |

---

## 5. Failure Scenarios & Handling

| Scenario | Handling |
|---|---|
| Kafka broker down | Idempotent producer with bounded retries (`delivery.timeout.ms`); if all brokers unreachable, ingestion API returns `503` rather than silently dropping events |
| Redis down | Geospatial "nearby" reads degrade or fail; **ingestion must not block on Redis** — Kafka writes still succeed, Redis state catches up once it's back. Mirror the existing defensive `try/catch` pattern already used around dashboard counters (`MatchingService.java:78-91`) |
| Postgres down/slow | Kafka retains data — consumer lag grows but nothing is lost; a circuit breaker should pause that consumer and alert rather than crash-loop |
| Duplicate/out-of-order events (client retries, flaky network) | Dedupe on consumer side via `(petId, eventId)` — Redis `SETNX` with short TTL, or a DB unique constraint as the backstop |
| Hot partition | Avoided by partitioning on `petId`, not geohash/region (see §3.2) |
| Poison message (malformed payload reaches Kafka) | Per-consumer dead-letter topic so one bad record doesn't block an entire partition |
| Single client flooding the system | Edge rate limiting (§3.6) rejects before Kafka is even touched |

---

## 6. Scaling Strategy: 1 → 3 → N Nodes

| Stage | Topology | Matches |
|---|---|---|
| **1 node** | Single EC2/Docker host: one Kafka broker (KRaft), one Redis instance, one Postgres instance, one app instance. Good for dev and Sprint 1-2 demos. | Today's `docker-compose.yml` |
| **3 nodes** | Kafka + Redis spread across a Primary/Replica/Witness EC2 trio for write quorum and split-brain protection; Postgres moved to a decoupled Amazon RDS endpoint so its CRUD I/O doesn't compete with Kafka's disk I/O; 2+ stateless app instances behind an ALB. | The proposal's "Optional Expansion: Enterprise HA Architecture Blueprint" |
| **N nodes** | Kafka scaled out across more brokers with partitions redistributed; Redis Cluster (sharded, not just replicated) once GEO-set size/throughput exceeds one node; app tier on an autoscaling group keyed on CPU and Kafka consumer-lag; Postgres read replicas absorb AI-insight/analytics queries, kept off the primary write path. | Beyond capstone scope, but the natural next step — included to show the design doesn't hit a wall at 3 nodes |

---

## 7. What's Deliberately *Not* Built (avoiding overengineering)

- No Kafka Connect/CDC pipelines — direct producer/consumer is sufficient at this volume.
- No dedicated time-series database — partitioned Postgres tables cover the capstone's data volume.
- No service mesh / full distributed tracing — Micrometer + structured logs with a shared `eventId` are enough to follow one event through the pipeline for a demo-scale system.
- No event sourcing / full CQRS — the Redis-hot/Postgres-durable split already gives the read/write separation that matters here without the operational overhead of a full event-sourced model.

---

## 8. Concrete Next Steps to Evolve the PoC into This Design

1. Add Postgres writes to the telemetry consumer (currently Redis-only) — batched inserts into a partitioned `telemetry_events` table.
2. Pipeline the `GEOADD`+`HSET` pair in `TelemetryConsumerService` instead of two round trips.
3. Split the single `user-telemetry` topic into `pet-telemetry` / `nfc-events` / `community-events` / `ai-insight-triggers`, each with independently tuned partitions/retention/`acks`.
4. Add the event envelope + per-type payloads (§3.5), replacing the bare `UserLocation` record. (`UserLocation`'s `driverId` alias has already been dropped, 2026-06-16 — this step is now just the envelope/payload work.)
5. Add Redis-backed rate limiting and Bean Validation at the ingestion controllers.
6. Add consumer-side idempotent dedupe keyed on a client-generated `eventId`.
7. Wire Kafka consumer-lag and Redis latency into the existing Prometheus/Grafana setup.
8. Run the load test (Sprint 4) using `TestDataGeneratorService`'s continuous-stream mode, scaled toward the 5,000-10,000 events/sec/node target, and capture p95/p99 ingestion latency as the proposal's Goal 4 evidence.
