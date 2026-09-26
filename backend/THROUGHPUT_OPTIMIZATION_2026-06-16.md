# Telemetry Throughput Optimization — 2026-06-16

Reference notes on what was diagnosed and changed in one session, working toward the Sprint 4
load-test target: simulating 50k+ users in Toronto going for a dog walk after 5pm, on a
2-node + 1-witness AWS topology. Objective for this session was narrower: **maximize throughput
on the existing single-Kafka-partition setup before scaling out** (more partitions/brokers).

## 1. Unrelated fix: failed Hibernate schema migration

`User` entity gained `role`/`is_active` (NOT NULL) fields, but the live `users` table already had
100 rows — Hibernate's `ddl-auto: update` can't add a NOT NULL column to a non-empty table, so the
migration silently failed on every boot (`column "is_active" of relation "users" contains null
values`), leaving the columns missing entirely while the app kept running against the stale schema.

**Fix applied directly to the dev DB** (via `docker exec -i pet-social-postgres psql ...`):
backfilled `is_active = true`, `role = 'PET_OWNER'` for all 100 existing rows, then applied the
NOT NULL constraints and created `idx_users_role`. This was a one-time manual DB fix, not a code
change — a fresh database (no pre-existing rows) will create these columns cleanly via
`ddl-auto: update` with no intervention needed. Worth knowing if anyone hits the same error on a
different environment with pre-existing data.

## 2. Telemetry pipeline throughput investigation

Starting point: streaming 10,000 records over 10s only achieved ~380-420 records/sec on the
dashboard's "Telemetry" counter. Root-caused step by step using real metrics rather than guessing:

### What was wrong, in order discovered
1. **Duplicate Redis write.** `TelemetryConsumerService.consumeTelemetry` called `geoOps.add(...)`,
   then called `processTelemetry(loc)` which called `processTelemetryInternal`, which called
   `geoOps.add(...)` *again* — every Kafka-sourced message wrote its geo position twice.
2. **5 sequential blocking Redis round-trips per message**, unpipelined: GEOADD ×2 (the duplicate
   above), HSET (metadata), EXPIRE (TTL), INCR (dashboard counter).
3. **Kafka listener concurrency was only 3** (`@KafkaListener(concurrency = "3")`).

### Fixes applied (first pass)
- Removed the duplicate `geoOps.add`.
- Batched GEOADD + HSET + EXPIRE + INCR into one `redisTemplate.executePipelined(...)` call per
  message instead of 4-5 separate round-trips.
- Bumped listener `concurrency` 3 → 8.
- Added Micrometer instrumentation to make the next bottleneck measurable instead of guessable:
  - `telemetry.deserialize.duration` — Kafka JSON parse time
  - `telemetry.redis.pipeline.duration` — time inside `executePipelined()`
  - `telemetry.redis.pipeline.inflight` — gauge of threads currently inside the pipeline call
  - `telemetry.kafka.consumer.distinct.threads` — gauge of distinct thread names that have ever
    processed a message (proves *achieved* parallelism vs the requested `concurrency` value)

**Result: throughput got *worse*** (~230-270/sec). `inflight` stayed pegged at exactly `1.0` no
matter what. Initial hypothesis was Redis connection contention (Spring Boot defaults to one
shared, multiplexed Lettuce connection with no pooling — `executePipelined()` needs exclusive use
of a connection, so concurrent threads could in theory serialize on it).

Added `commons-pool2` + explicit Lettuce pool config (`max-active: 16`, `min-idle: 4`) to rule
this in or out. **It did not move the needle.** `inflight` was still exactly `1.0` after pooling
was added — proving the connection-pool theory was wrong.

### Actual root cause, confirmed three independent ways
- `docker exec pet-social-kafka kafka-topics --describe --topic user-telemetry` → `PartitionCount: 1`
- `docker exec pet-social-kafka kafka-consumer-groups --describe --group user-group` → only ever
  one `CONSUMER-ID` row, regardless of configured `concurrency`
- `telemetry.kafka.consumer.distinct.threads` metric → reads `1.0`

**A Kafka partition can only ever have one active consumer per consumer group.** The topic was
auto-created by the broker with the default of 1 partition (no `NewTopic` bean in code). Setting
`concurrency = "8"` requested 8 threads, but 7 of them sat permanently idle — there was never more
than one thread doing any work, no matter what we changed downstream (pipelining, pooling).

### Fix: maximize the single partition instead of adding more (scope of this session)
Since one partition is a hard ceiling on consumer thread count, the only way to increase
throughput without changing partition count is to make that one thread do more work per
round-trip:
- Switched the listener to **Kafka batch mode**: `spring.kafka.listener.type: batch`,
  `spring.kafka.consumer.max-poll-records: 1000`. Kafka already fetches up to 500 records per
  poll internally — this just lets Spring hand them to the listener as a `List` instead of one
  at a time.
- New `consumeTelemetryBatch(List<String>)` replaces the per-record listener. **One**
  `executePipelined` call now covers the entire batch (loop of GEOADD+HSET+EXPIRE per record,
  single `INCR` by batch size) instead of one pipeline per record.
- Set `concurrency = "1"` honestly, matching the real partition limit (was `8`, which was never
  achievable).
- The old single-record path (`processTelemetry` / `processTelemetryInternal`) was left intact —
  `TestDataGeneratorService`'s direct bypass-Kafka call (`generateTestTelemetry`) still uses it
  and was not touched.

**Result:** throughput roughly doubled to tripled — averaging ~720/sec, peaking near 1000/sec,
up from the ~230-400/sec baseline. Now oscillates between ~500-1000/sec on a 2-second sampling
window — **flagged but explicitly deferred**, likely caused by the load generator's own bursty
send pattern (`startContinuousTelemetryStream` blasts N records then sleeps exactly 1000ms with
no compensation for how long the blast took) and/or uneven batch sizes per poll. Not yet
root-caused; no metric exists yet for per-batch size — would need a `telemetry.kafka.batch.size`
distribution summary to diagnose properly.

## 3. Load test geography

`TestDataGeneratorService` generated coordinates in a hardcoded NYC bounding box
(`40.5-40.9` lat, `-74.3--73.7` lon) — didn't match the actual target scenario. Renamed to a
Toronto bounding box (`43.58-43.86` lat, `-79.64--79.12` lon).

## Files changed
- `src/main/java/org/example/pet_social/service/TelemetryConsumerService.java` — dedup, pipelining,
  batch consumption, new metrics
- `src/main/java/org/example/pet_social/service/DashboardService.java` — exposed
  `TELEMETRY_COUNT_KEY` (package-private), added `recordTelemetryProcessed()`
- `src/main/java/org/example/pet_social/service/TestDataGeneratorService.java` — Toronto bounding
  box replacing NYC
- `pom.xml` — added `commons-pool2`
- `src/main/resources/application.yml` — Lettuce pool config, Kafka batch listener config
- Dev DB only (not in git): manual backfill of `is_active`/`role` on 100 existing `users` rows

## 4. Path to 50k+ records/sec on the 2-node + 1-witness AWS topology

Not yet implemented — a plan for the next session, based on what this session proved.

**Key constraint specific to this topology:** the witness node (t3.nano) carries no workload —
it exists purely for quorum/split-brain protection. All real throughput capacity comes from the
2 real nodes (Primary + Replica). In a Primary/Replica setup, **writes only ever go to one Redis
primary** — the replica is for failover, not write-scaling. So no matter how many Kafka
partitions or consumer threads are added, every one of them funnels into the same Redis
instance. That instance's real ceiling — not Kafka — is what ultimately caps total throughput,
and it has not been measured yet.

**Levers, in validation order (measure before redesigning):**
1. **Maximize per-thread batch throughput first.** A 1000-record pipelined batch needs only one
   network round-trip; Redis executes simple commands in low single-digit microseconds. If a
   1000-record pipeline genuinely costs ~10-15ms total, that implies ~70-100k records/sec on
   *one thread alone* — already past target. Today's numbers oscillate (~500-1000/sec), which
   suggests batch sizes aren't consistently maxed out, not that the approach has a low ceiling.
   This is the deferred oscillation issue — fixing it first might mean far fewer partitions are
   needed than expected. Needs the `telemetry.kafka.batch.size` metric (not yet added) to confirm.
2. **Benchmark Redis directly, independent of Kafka**, for the exact write pattern in use
   (GEOADD+HSET+EXPIRE+INCR = 4 ops/record → 200k ops/sec at a 50k records/sec target). Use
   `redis-benchmark` or a small pipelined micro-benchmark rather than assuming Redis can keep up.
3. **Increase Kafka partitions + run consumer instances on both real nodes**, sized to whatever
   gap remains after steps 1-2 close it. Target partition count ≈ 50k ÷ (validated per-thread
   throughput), distributed across both nodes.
4. **Tune the Kafka producer side**, which currently has no `batch.size`/`linger.ms`/compression
   configured. Production has to sustain 50k+/sec before consumption capacity even matters — only
   the consumer side has been optimized so far.
5. **Separate Kafka and Redis workloads across the 2 nodes** (don't co-locate broker + Redis
   primary on the same box) so they aren't competing for the same CPU/network — the same logic
   the proposal already applies to Postgres (its own decoupled RDS endpoint, isolated from
   Kafka's disk I/O).

Steps 1-2 are measurement, not redesign, and should determine how much of steps 3-5 are actually
needed rather than guessing a partition count upfront.

## Before pushing — what to verify
- [ ] Clean restart from a stopped state (no stale `java` process still holding port 8080 — this
      came up earlier this session and had to be killed manually)
- [ ] App boots with no Hibernate DDL errors in the log
- [ ] `mvn compile` clean (confirmed already, but re-verify after any further edits)
- [ ] Re-run the stream test end-to-end and confirm the dashboard's Telemetry counter still
      increments correctly (not double-counting, not stalling)
- [ ] Confirm `MatchingService`'s GEOSEARCH still returns results now that test data is generated
      in the Toronto bounding box — check for any hardcoded NYC-centered default search
      coordinates elsewhere in the matching/dashboard code that would now return empty results
- [ ] Confirm the frontend map UI (Jing Huang's component) isn't hardcoded to center/zoom on NYC
- [ ] Smoke-test `TestDataGeneratorService.generateTestTelemetry` (the direct bypass-Kafka path) —
      untouched by the batch-mode change, but verify it still works since it shares
      `processTelemetry`/`processTelemetryInternal` with nothing else now
- [ ] Confirm Lettuce pool settings don't cause connection exhaustion under concurrent
      `DashboardService`/`MatchingService` Redis usage during a load test
- [ ] Document/accept as known limitation: still 1 Kafka partition → 1 consumer thread max. Real
      horizontal scaling (matching the 2-node+1-witness AWS target) requires increasing partition
      count later — intentionally out of scope for this session
- [ ] Known issue, deferred: throughput oscillation (~500-1000/sec swings) — not yet root-caused
- [ ] This repo is not yet a git repository (`git status` returns "not a git repository") — will
      need `git init` (or confirm the intended remote/parent repo) before any push