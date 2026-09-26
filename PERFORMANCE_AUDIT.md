# PawPal — Bloat & Performance Audit

**Date:** 2026-07-13 · **Branch:** `feature/sanjyot-db-schema` · Measured on the actual repo/working tree, not guessed.

---

## Update 2026-07-17 — fixes applied + one new finding

**New finding (worse than anything below): the telemetry "pipeline" never pipelined.**
`TelemetryConsumerService` called *template* operations (`geoOps.add`, `opsForHash().putAll`, `expire`, `increment`) **inside** `executePipelined()`. Spring Data Redis template ops check out their own pooled connections — nothing rode the pipelined connection, so a 1000-record Kafka batch issued ~3000 sequential round trips on nested connections while the "pipeline" connection sat idle. That nested checkout is exactly the pool contention the service's own `telemetry.redis.pipeline.inflight` gauge kept showing, and why `lettuce.pool.max-active` had to be raised to 16. **Fixed:** both paths now issue `geoAdd`/`hMSet`/`expire`/`incrBy` directly on the callback's `connection` — one real round trip per Kafka batch.

**Applied from the "do now / next sprint" lists (all verified live against the running stack):**
1. `show-sql`/`format_sql` off by default (`SHOW_SQL=true` to re-enable) · `spring.jpa.open-in-view: false` · `server.compression.enabled: true` (§3.1).
2. Kafka double JSON serialization removed — plain `StringSerializer`/`StringDeserializer` on both topics (producers/consumers already do their own Jackson); `spring.json.trusted.packages: "*"` gone; producer now batches (`linger.ms: 5`, `batch.size: 32768`, `compression.type: lz4`) (§3.3). End-to-end verified: POST /api/telemetry/location → Kafka → Redis `users:geo`.
3. Chat polling 1 s → 4 s in `WalkRequestDetailScreen` + `MarketplaceChatScreen` (§4.1) — a 75 % cut in chat request volume per open screen.
4. `markContextRead` UPDATE now only runs when the fetched thread actually contains unread incoming messages, instead of once per poll (§3.2).
5. `expo-dev-client` moved to devDependencies (§4.2).
6. The app now **feeds the telemetry pipeline for real**: a `useTelemetryPing` hook posts the signed-in user's position on login and every 3 min while the app is open — `users:geo` no longer depends on the demo generator.
7. First real unit tests: `AuthServiceTest` (case-insensitive email, BCrypt, legacy SHA-256 upgrade), `UserServiceTest`, `GlobalExceptionHandlerTest` — 13 tests, no Spring context for the new ones.

**Still open, with alternatives (unchanged recommendations):**
| Item | Cheapest | Better | Best |
|---|---|---|---|
| Chat delivery | 4 s poll (done) | poll with `?sinceId=` cursor | WebSocket/SSE push |
| Feed refetch on every tab focus | keep | stale-while-revalidate cache (React Query) | + ETag/`If-None-Match` |
| No pagination on lists | `?limit=` cap on feeds/notifications | `Pageable` everywhere | cursor pagination on messages |
| `PetQueryService` N+1s | ✅ done — one `GEOSEARCH` + one `IN` query | — | delete with frontend1 retirement |
| `firebase` full web SDK in bundle | keep | REST upload straight to Storage | `@react-native-firebase/storage` |
| `ddl-auto: update` | keep for dev | Flyway baseline | Flyway + CI migration check |
| 5 always-on containers | stop Grafana/Prometheus when unused | compose `--profile monitoring` | plain `redis:7-alpine` instead of redis-stack |
| Cold start always lands on Login | keep | auto-login when a stored JWT exists (new gap found 07-17) | + refresh token rotation |

---

TL;DR: the *app* is not intrinsically heavy — the repo carries ~2.2 GB of dead weight from a
legacy frontend, the backend ships debug-grade config (SQL console logging, no pagination,
N+1 queries in the legacy discovery endpoints), and the mobile app polls two chat endpoints
every second. Each section below lists the evidence and the fix, ordered by impact.

---

## 1. Disk / repo bloat (why the project *folder* feels huge)

| Path | Size | Verdict |
|---|---|---|
| `frontend1/node_modules` | **830 MB** | Dead weight. `frontend1` is kept only as an API-mapping reference — its TS sources are what matter; it never needs installed dependencies. |
| `frontend1/android` | **800 MB** | Mostly Gradle build output/caches (`app/build`, `.gradle`). Pure build artifacts of an app nobody builds anymore. This folder is also what broke IntelliJ (generated RN Java was registered as a backend source root — fixed in `backend/pet_social.iml` on 2026-07-13). |
| `frontend/mobile/node_modules` | 549 MB | Normal for a React Native/Expo app. Not a problem, just don't index it (now excluded in the IDE module). |
| `backend/target` | 22 MB | Normal Maven output. |
| `.git` | 18 MB | Healthy — the giant folders above are *not* in git history. |

**Fix (quick, zero risk):**
- Delete `frontend1/node_modules` and `frontend1/android/app/build` + `frontend1/android/.gradle` → frees ~1.5 GB and cuts IDE indexing dramatically. The reference value of `frontend1` is entirely in `frontend1/src`.
- If the team agrees `frontend1` is reference-only, consider trimming it to just `src/` + `package.json`.

## 2. Junk tracked in git

Confirmed with `git ls-files`:

| Tracked | Problem |
|---|---|
| `backend/logs/app.log`, `app.err`, `metrics_10record_poc.json` | Runtime logs/metrics dumps committed; `metrics_10record_poc.json` keeps showing up as modified (`MM`) and pollutes every diff. Should be gitignored; keep the PoC metrics file only if it's report evidence — then move it to `docs/`. |
| `frontend/.expo/**` (27 files, PNG icon caches) | Expo's local cache directory — never belongs in git. (Deletions are already staged in the working tree; committing them resolves this.) |
| `frontend/android/**` (53 files), `frontend/src/**` (34 files) | The abandoned pre-`mobile` frontend and its android project — already deleted in the working tree but the deletions are uncommitted, so every `git status` scrolls for pages. **Commit the pending deletions.** |

## 3. Backend runtime inefficiencies

### 3.1 Debug config running in every environment (cheapest wins in the file)
- **`show-sql: true` + `format_sql: true`** (`application.yml`) — every query is pretty-printed to the console. Console I/O is synchronous; under the telemetry load test this alone measurably caps throughput. Fix: off by default, enable via env var in dev.
- **Open Session in View** (Spring default, never disabled) — every HTTP request holds a DB connection for the whole request lifecycle, including Redis calls and JSON serialization. With Hikari `maximum-pool-size: 20`, 20 slow requests exhaust the pool. Fix: `spring.jpa.open-in-view: false` (the new services already fetch-join what they need; legacy DTO mappers would need a quick lazy-load check).
- **`ddl-auto: update`** — Hibernate diffs the whole schema on every boot (slow startup, and the known silent-failure mode documented in `THROUGHPUT_OPTIMIZATION_2026-06-16.md` §1). Fix: Flyway, already on the roadmap.
- **No HTTP compression** — feed responses are verbose denormalized JSON over mobile networks. Fix: `server.compression.enabled: true` (one line).

### 3.2 Query-pattern problems (legacy discovery endpoints — used by frontend1 only)
- ~~**`PetQueryService.findNearbyPets`: N+1 against Postgres**~~ — **fixed 2026-08-11.** Positions are collected from the geo result first, then every owner's pets are read in one `findWithOwnerByOwnerIdIn(...)`.
- ~~**`findWalkingPartners` / `findBlindDatePets`: 2 Redis round-trips per candidate pet**~~ — **fixed 2026-08-11.** One `GEOSEARCH` now answers both "who is inside the radius" and "how far", and only those owners are read from Postgres. The direction of the join inverted: it used to load every playdate-available pet and ask Redis about each owner; it now asks Redis first and reads only the matching rows, so the row count scales with the neighbourhood instead of the user table. That bound also fixed a correctness bug — see `SECURITY_FIXES.md` §9.
- **No pagination anywhere** — every list endpoint (`/api/pets/partners`, `/api/notifications`, feeds, marketplace, conversations) returns the full table slice. Fine at demo scale, collapses at load-test scale. Fix: `Pageable` + `?limit/offset` on the hot lists first (feeds, notifications, marketplace).
- **`MessageRepository.findRecentConversations`** — native `DISTINCT ON` over a user's *entire* message history on every inbox open. OK with an index, but it scans linearly with message volume; needs a `LIMIT` and eventually a conversations table.
- **`MarketService.chats` / notifications enrichment** load all of a user's LISTING messages / all requests into memory and group in Java — acceptable at demo scale (documented), but they're the first things to paginate after the load test.
- **`WalkRequestDetail` polling writes**: the thread getters run `markContextRead` (an `UPDATE ... WHERE is_read=false`) on **every fetch**, and the app polls every second — a mostly-no-op write per client per second. Fix: only issue the UPDATE when the fetched page actually contains unread incoming messages.

### 3.3 Kafka pipeline
- **Double JSON serialization** — producers serialize objects to a JSON `String` manually, then the globally-configured `JsonSerializer` serializes that string *again* (quoting + escaping every byte). Consumers pay the mirror cost. Fix: switch producer/consumer value serializers to plain `StringSerializer`/`StringDeserializer` (the code already does its own Jackson work); removes ~30–50 % of per-message serialization overhead and the `spring.json.trusted.packages: "*"` security smell.
- **Producer untuned** — no `linger.ms`, `batch.size`, or compression; the 50k/sec plan (`THROUGHPUT_OPTIMIZATION` §4.4) already flags this. One yml block.
- Mitigated 2026-07-13: `user-telemetry` now has 3 declared partitions with matching consumer concurrency; notification writes moved off the request path onto `app-events`.

### 3.4 Observability overhead shipped by default
- Six Micrometer timers publish **p50/p95/p99 percentile histograms** (client-side percentiles are memory-heavy per timer). Fine, but they run even when Prometheus is disabled (`MGMT_PROMETHEUS_ENABLED:false` — collected, never scraped). Consider plain timers by default.
- The Thymeleaf **dashboard polls itself every 2 s** and exists only for the PoC demo; `spring-boot-starter-thymeleaf` is on the classpath solely for it. Move `DashboardController` behind a profile and the dependency becomes dev-only.
- Prometheus container scrapes every 5 s around the clock while running.

### 3.5 Misc
- `@SpringBootTest contextLoads` boots the entire app (~46 s) for one assertion — as the only test, every CI run pays it. Slice tests (`@DataJpaTest`, `@WebMvcTest`) would cover more for less.
- Duplicate API surfaces kept deliberately for frontend1 (`/api/marketplace` vs `/api/market`, `/api/users/register|login` vs `/api/auth`, discovery endpoints) — not a runtime cost, but each is code to maintain; retire with frontend1.

## 4. Mobile app (`frontend/`) inefficiencies

### 4.1 Polling (the biggest self-inflicted server load)
| Screen | What | Interval |
|---|---|---|
| `WalkRequestDetailScreen` | full chat thread | **1 s** |
| `MarketplaceChatScreen` | full chat thread | **1 s** |
| `FindPartnersScreen` | `my-sent-unread` + `unread-counts` | 5 s |
| `MarketplaceScreen`, `PetBlindDateScreen` | `unread-counts` | 5 s |

Two open chat screens = 2 requests/sec/user, each returning the **entire thread** (no `?since=` cursor) and triggering a read-marking UPDATE. The 15 s Redis cache added on 2026-07-13 absorbs the unread-count pollers, but chat polling goes straight to Postgres. Fixes, in order of effort: 3–5 s chat interval + fetch-since-last-id → long-polling → WebSocket/SSE (already roadmap item).

### 4.2 Bundle weight
- **`firebase` (the full web SDK, ^12)** is imported for one thing: Storage uploads. It's one of the heaviest JS deps you can put in an RN bundle (slower app start, bigger OTA updates). Fix: `putFile` via a lightweight REST upload to the Storage endpoint, or `@react-native-firebase/storage` (native, tree-shaken).
- **`expo-dev-client` sits in `dependencies`** — it's a development tool; move to `devDependencies` so it never ships in a production build profile.
- Everything else (maps, navigation, gesture-handler) is standard and justified.

### 4.3 Behavior
- Every screen refetches all its data on every focus (`useFocusEffect`) with no client-side cache or `If-None-Match` — combined with no server pagination, tab-switching replays full feed queries. A tiny stale-while-revalidate cache (or React Query) would cut request volume roughly in half.

## 5. Infra footprint (docker-compose)

Five always-on containers for local dev: Postgres, **Redis Stack** (includes the RedisInsight web UI — plain `redis:7-alpine` is much lighter and all the code uses standard commands), Kafka, Prometheus, Grafana (pinned to old 9.0.0, starts empty — no provisioned dashboards). README demands 8 GB RAM.
**Fix:** compose profiles — `docker compose up postgres redis kafka` as the default dev set; `--profile monitoring` adds Prometheus/Grafana only when you're actually looking at metrics. JVM flags (`-Xms1g -Xmx2g` + ZGC) also force a 1 GB heap floor on any machine that runs the jar — reasonable for load tests, oversized for a laptop demo.

## 6. Prioritized fix list

**Do now (minutes, big wins):**
1. Delete `frontend1/node_modules` + `frontend1/android/{app/build,.gradle}` (~1.5 GB, faster IDE).
2. Commit the staged deletions of `frontend/android`, `frontend/src`, `frontend/.expo`; gitignore `backend/logs/`.
3. `show-sql: false`, `server.compression.enabled: true`, `spring.jpa.open-in-view: false`.
4. Chat poll interval 1 s → 3–5 s; move `expo-dev-client` to devDependencies.

**Next sprint:**
5. Kafka: plain String serializers (kill double serialization), producer `linger.ms`/`lz4`.
6. ~~Fix `PetQueryService` N+1s~~ — done 2026-08-11 (one `GEOSEARCH` + one `IN` query).
7. Pagination on feeds/notifications/marketplace/conversations.
8. `markContextRead` only when unread messages exist in the fetched thread.
9. Replace the full `firebase` SDK with a lightweight upload path.

**Roadmap (already known):**
10. WebSocket/SSE chat (removes polling class entirely) · Flyway · compose profiles for monitoring · retire frontend1 + its duplicate API namespaces.

---
*Sources: `git ls-files`/`du` measurements above; `application.yml`, `PetQueryService.java`, `MessageRepository.java`, `MarketService.java`, `TelemetryProducerService.java`, `docker-compose.yml`; `frontend/mobile/src/screens/*` poll intervals; `THROUGHPUT_OPTIMIZATION_2026-06-16.md` for the measured Kafka/Redis history.*