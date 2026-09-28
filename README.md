# PawPal

A mobile app for pet owners: find owners and pets nearby, set up walks together, chat, and use a small marketplace.

**1st place, Web Development, Conestoga ACSIT Capstone Showcase (Spring 2026).**

Team: Sanjyot Gargelwar (architecture and backend), Jing Huang, Sneh Shukla.

> This is a public copy of the team repository, published without its commit history. API keys have been replaced with placeholders; see [Running it](#running-it).

## What's here

| Path | Contents |
|---|---|
| `backend/` | Spring Boot API (Java 21), Kafka telemetry pipeline, Redis geo matching, PostgreSQL |
| `frontend/mobile/` | React Native app (Expo SDK 56, TypeScript) |
| `backend/deploy/` | Two-node + witness deployment compose files |

## Architecture

```
Mobile app ──REST + JWT──▶ Spring Boot API ──▶ PostgreSQL 16  (users, pets, walks, marketplace, messages)
                                │
                                ├──▶ Kafka  user-telemetry (3 partitions) ──▶ consumer ──▶ Redis geo index + presence
                                └──▶ Kafka  app-events ──▶ push notifications (Expo / FCM)
```

- **PostgreSQL**: schema owned by Flyway versioned migrations; the app starts with `ddl-auto: validate`, so it refuses to boot if entities and schema disagree.
- **Redis**: `users:geo` geo index for proximity search, durable per-user metadata, and presence keys that expire after 6 hours without a ping.
- **Kafka**: location telemetry is accepted with `202 Accepted` and processed asynchronously; notifications are delivered off a second topic so they stay off the request path.

### Telemetry and matching

1. While the app is open it posts the user's position to `POST /api/telemetry/location` (on login, then every 3 minutes). The user id comes from the verified token, never the request body.
2. The Kafka consumer (concurrency 3) writes each batch to Redis in one pipelined round trip: geo position, presence hash, TTL and counter.
3. Matching runs a nearest-first `GEOSEARCH` at 2, 5 and 10 km with growing candidate caps (50 / 100 / 200), fetches candidate metadata in one pipelined call, and only returns users with a live presence key.

### Performance work

Details in [PERFORMANCE_AUDIT.md](PERFORMANCE_AUDIT.md) and [backend/SCALABILITY_REVIEW_2026-08-09.md](backend/SCALABILITY_REVIEW_2026-08-09.md).

- The telemetry consumer wrapped its writes in `executePipelined()`, but called RedisTemplate helpers that check out their own connections, so nothing was actually pipelined: about 3,000 sequential round trips per 1,000-record batch. The writes now go on the callback's connection, one round trip per batch.
- Removed double JSON serialization on both Kafka topics and tuned producer batching (`linger.ms` 5, 32 KB batches, lz4).
- Replaced N+1 discovery queries with one `GEOSEARCH` plus one `IN` query.
- Last measured ingest rate: about 720 to 1,000 records/sec on a laptop. Higher targets have not been validated yet.

### Security

- Deny-by-default JWT filter on `/api/*` with a small public allowlist (register, login, Google sign-in, health).
- Login rate limiting per IP and per account.
- Write-ups in [SECURITY_FIXES.md](SECURITY_FIXES.md).

## Running it

**Backend** (needs Java 21 and Docker):

```bash
cd backend
docker-compose up -d        # PostgreSQL, Redis, Kafka, Prometheus, Grafana
./mvnw spring-boot:run
curl http://localhost:8080/api/system/health
```

More detail, including the Redis key layout and the matching algorithm, is in [backend/README.md](backend/README.md).

**Mobile app:**

```bash
cd frontend/mobile
npm install
npm start
```

Add your own keys where the placeholders are:

- Google Maps API key: `frontend/mobile/app.json`
- Firebase config: `frontend/mobile/src/utils/firebase.ts`
- OpenRouteService key: `frontend/mobile/src/utils/routing.ts` and `frontend/mobile/src/components/RouteMapPicker.tsx`

## Documentation

- [API_REFERENCE.md](API_REFERENCE.md): full endpoint list
- [backend/DEBUGGING_LOG.md](backend/DEBUGGING_LOG.md): bugs found, root causes and fixes
- [backend/TELEMETRY_ARCHITECTURE.md](backend/TELEMETRY_ARCHITECTURE.md): telemetry pipeline design
- [backend/DATABASE_SCHEMA.md](backend/DATABASE_SCHEMA.md) and [backend/ERD.md](backend/ERD.md): data model
- [E2E_TESTING.md](E2E_TESTING.md): end-to-end testing notes
- [PawPal.postman_collection.json](PawPal.postman_collection.json): Postman collection
