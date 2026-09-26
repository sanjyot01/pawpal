# Deploying the backend to a single EC2 instance

The simplest deployment that actually works: one instance running the app, Postgres,
Redis, Kafka, and a Prometheus/Grafana pair, all via `../docker-compose.aws.yml`. This is
the showcase path.

For the 2-node + witness topology (ALB, RDS, Sentinel failover) see
[`README.md`](README.md) — that's the design target, but it takes hours to stand up and
needs a failover drill before you'd trust it live.

**Only the backend goes on AWS.** The mobile app is installed on your phone or emulator
and talks to this instance over the internet; nothing about the app is hosted here.

---

## Sizing: what the instance actually needs

### Disk — 20 GB

The mobile app has no bearing on this. The disk is consumed by container images and the
build. The first three rows are measured; the monitoring images are published sizes and
the rest are estimates:

| Item | Size |
|---|---|
| `confluentinc/cp-kafka:7.5.0` | 1.33 GB |
| `redis:7-alpine` | 61 MB |
| `postgres:16-alpine` | 395 MB |
| `prom/prometheus:v3.1.0` | ~280 MB |
| `grafana/grafana:11.4.0` | ~450 MB |
| `maven:...-temurin-21` (build stage) + downloaded dependencies | ~1.5 GB |
| `eclipse-temurin:21-jre` (runtime stage) + the 93 MB fat jar | ~0.4 GB |
| Amazon Linux 2023 itself | ~2.5 GB |
| Postgres data + Kafka logs + Prometheus TSDB | grows with use |

That's roughly **7–8 GB before storing a single row**, which is why the default 8 GB
root volume fails partway through the build — and it fails with a confusing error
(`ExtractAarTransform` / `no space left on device` style messages from whichever tool
happens to be running), not a clear "disk full". 20 GB still leaves headroom.

> The compose file uses `redis:7-alpine`, not `redis/redis-stack`. The app only uses
> core Redis (GEO, HASH, STRING, ZSET, SCAN) and never the Stack modules, and this
> deployment doesn't publish the GUI port. That swap alone saves 1.36 GB. Local dev
> keeps `redis-stack` in `../docker-compose.yml` because RedisInsight is useful there.

### Memory — t3.large (8 GB)

The Dockerfile pins the app to `-Xmx2g`, and it shares the box with a Kafka JVM,
Postgres, Redis, and now Prometheus and Grafana (together another ~500 MB resident, more
as the Prometheus TSDB grows). On a 4 GB `t3.medium` this OOMs under any real load. If
cost matters more than headroom, `t3.medium` works **only** if you both lower the app heap
and drop the two monitoring services:

```yaml
# docker-compose.aws.yml, app service
environment:
  JAVA_OPTS: "-XX:+UseZGC -Xms512m -Xmx1g -XX:+HeapDumpOnOutOfMemoryError"
```

---

## 1. Launch the instance

```bash
SG=$(aws ec2 create-security-group --group-name pawpal-demo \
  --description "PawPal backend" --vpc-id vpc-0de0a557a3217366d --query GroupId --output text)

# SSH from your machine only
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 22 \
  --cidr $(curl -s https://checkip.amazonaws.com)/32
# API open, so your phone can reach it from any network
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 8080 --cidr 0.0.0.0/0
# Grafana from your machine only — it is a login page, not an API, and there is no
# reason for it to be reachable from anywhere else
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 3000 \
  --cidr $(curl -s https://checkip.amazonaws.com)/32

aws ec2 run-instances --image-id $(aws ssm get-parameter \
    --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
    --query Parameter.Value --output text) \
  --instance-type t3.large --key-name pawpal --security-group-ids $SG \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":20,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=pawpal-demo}]' \
  --query 'Instances[0].InstanceId' --output text
```

Get the public IP (your phone will need it):

```bash
aws ec2 describe-instances --filters "Name=tag:Name,Values=pawpal-demo" \
  "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text
```

Port 8080 is open to the internet here because a phone on mobile data has no fixed IP to
allowlist. That is acceptable for a demo *because* the API is deny-by-default
authenticated and the load-generation endpoints are switched off — it would not have
been before those changes.

## 2. Install Docker

```bash
ssh -i ~/.ssh/pawpal.pem ec2-user@<PUBLIC_IP>

sudo dnf update -y && sudo dnf install -y docker git
sudo systemctl enable --now docker && sudo usermod -aG docker ec2-user
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
exit    # re-ssh so the docker group membership applies
```

## 3. Clone

The repo is private, so use a personal access token
(GitHub → Settings → Developer settings → Personal access tokens, `repo` scope):

```bash
git clone https://<YOUR_TOKEN>@github.com/huangjIT/capstone.git
cd capstone/backend
```

## 4. Create `.env`

`.env` is gitignored, so it does **not** arrive with the clone — that is the point.
Generate fresh values on the server; don't reuse the ones from your laptop.

```bash
cp .env.example .env
nano .env
```

```ini
APP_JWT_SECRET=<openssl rand -base64 48>
DB_USERNAME=pawpal
DB_PASSWORD=<openssl rand -base64 24 | tr -d '/+='>
APP_CORS_ALLOWED_ORIGINS=*

# Grafana sign-in. No default on purpose — see the note below.
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=<openssl rand -base64 24>

# Turn on only for the seeding step in §7, then turn it back off.
APP_DEMO_SEED_ENABLED=true
APP_DEMO_SEED_PASSWORD=<pick something you can type on stage>
```

Compose uses `${VAR:?message}` for `APP_JWT_SECRET`, `DB_USERNAME`, `DB_PASSWORD` and
`GRAFANA_ADMIN_PASSWORD`, so it refuses to start and names the missing variable rather
than falling back to a default that every deployment would share. Grafana is in that list
because the port is open and `admin`/`admin` is the first thing anyone tries.

## 5. Start

```bash
docker compose --env-file .env -f docker-compose.aws.yml up -d --build
docker compose --env-file .env -f docker-compose.aws.yml logs -f app
```

First build is 5–10 minutes (Maven downloads inside the container). Wait for
`Started PetSocialApplication`.

## 6. Verify

```bash
curl http://<PUBLIC_IP>:8080/api/system/health

# schema: both migrations should be success = t
docker exec pet-social-postgres psql -U pawpal -d pet_social_db \
  -c 'select version, description, success from flyway_schema_history order by installed_rank'

# auth is deny-by-default: this must be 401
curl -o /dev/null -w '%{http_code}\n' http://<PUBLIC_IP>:8080/api/notifications

# login is throttled. Repeating one email trips the per-account budget first —
# 10 failures, so you get 11 x 401 and then 429 with Retry-After: ~899.
for i in $(seq 1 12); do
  curl -o /dev/null -s -w '%{http_code} ' -X POST http://<PUBLIC_IP>:8080/api/auth/login \
    -H 'Content-Type: application/json' -d '{"email":"nobody@example.com","password":"x"}'
done; echo
```

The two limits are independent and answer different attacks. Spreading attempts across
*different* emails skips the per-account budget and runs into the per-address one instead
(20 per minute, `Retry-After: ~55`). Seeing both is the point: one caps the BCrypt CPU
burn from a single source, the other stops a spray aimed at one account from many sources.

On a fresh database Flyway runs V1 then V2 from scratch. The baseline-skip behaviour
only applies to databases that already had tables before Flyway existed.

That loop leaves your own address rate-limited for the rest of the minute — wait it out
before the next step, or run it from a machine you are not about to demo from.

## 7. Seed the demo world

The app boots with an empty database: no pets on the map, no partner cards, no feed. The
seeder fills it with twenty owners across real Toronto neighbourhoods, their pets, posts,
comments, events, marketplace listings, conversations and reviews — and, importantly,
pushes each seeded user through the telemetry pipeline so they land in `users:geo` with a
live presence key. Rows alone leave the map empty.

It needs a token, so register yourself first:

```bash
# 1. your own account
TOKEN=$(curl -s -X POST http://<PUBLIC_IP>:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"You","email":"you@example.com","password":"your-password"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')

# 2. seed, centred on where you will be standing
curl -X POST "http://<PUBLIC_IP>:8080/api/demo/seed?lat=43.6532&lon=-79.3832" \
  -H "Authorization: Bearer $TOKEN"
```

**Pass your own `lat`/`lon`.** The partner and blind-date feeds are bounded to
`app.discovery.max-radius-km` (100 km), so a demo given from anywhere other than Toronto
shows an empty screen unless the seeded city is moved to you. The whole catalogue is
translated by the same offset, so the neighbourhoods keep their relative spread.

Seeding is one-shot — running it again reports the existing counts and changes nothing.
There is no delete path; to start over, destroy the Postgres volume.

Every seeded account signs in with `APP_DEMO_SEED_PASSWORD`; `GET /api/demo/seed/status`
lists the addresses. Set `APP_DEMO_SEED_ENABLED=false` and restart the app once you are
done — the endpoint writes user accounts.

**Demo from a seeded account, not the one you registered above.** The account that runs
the seed gets three notifications so its bell isn't empty, but it has no pets, no
invitations and no friends. `maya.arjun@pawpal.demo` is the fullest one: a pet (Miso), a
posted walk with two pending requests, three friends and two unread notifications.

## 8. Point the phone at it

In `frontend/mobile/src/utils/api.ts`:

```ts
const BASE_URL = 'http://<PUBLIC_IP>:8080';
```

(`10.0.2.2:8080` is the Android emulator's alias for your host machine, which is what
that line is set to for local work — it will not resolve from a real phone.)

This is a JS-only change, so Metro serves it without a native rebuild. For a standalone
APK on your phone you do need a build — note that Android blocks cleartext HTTP by
default on API 28+, so either add a network-security-config exception for this host or
put the API behind HTTPS.

## 9. Grafana

`http://<PUBLIC_IP>:3000`, signing in with the credentials from `.env`. The **PawPal →
PawPal Backend** dashboard is provisioned at startup along with its Prometheus datasource,
so there is nothing to click through: request rate and latency, match outcomes and
resolution time, the telemetry pipeline (batch sizes, Redis pipeline duration, achieved
consumer parallelism), rate-limited auth attempts, and JVM/Hikari/Tomcat saturation.

Prometheus itself publishes no host port. It scrapes `app:8080` over the compose network,
which is also why `MGMT_ENDPOINTS` can safely include `prometheus` — the metrics endpoint
is never served through the published 8080.

Dashboards are files under `monitoring/grafana/dashboards/`. Edits made in the Grafana UI
are discarded on restart by design, so what you see is what is committed; change the JSON
and restart the container.

If a panel is empty, check the target first:
`docker exec pet-social-prometheus wget -qO- localhost:9090/api/v1/targets | head`.

## Before demoing

**Seed first, and seed at your own coordinates** — §7. Presence expires 6h after the last
ping, so re-run the app or let a phone ping if the box has been idle overnight. If you are
demoing a long time after seeding and would rather not think about it, set
`APP_MATCHING_REQUIRE_FRESH_PRESENCE=false` for the day.

**One account is now enough.** Matching excludes the caller from their own results, and
the partner and blind-date feeds exclude the signed-in user too — a single account no
longer matches itself. Two accounts still make for a better story on the request/accept
flow.

**Distances are real distances.** The walk and date invitation feeds — the rows behind the
Home map, Find Partners and Blind Date — only return invitations inside the radius (25 km
by default, capped at 100 km) and sort them nearest-first. If a screen is empty the honest
reason is that nobody is nearby: widen it with `&radiusKm=` or re-seed centred on you.
Verified from Toronto (8 cards, 1.8–7.8 km, nearest first) and from Sydney (0 cards, and
still 0 when asking for `radiusKm=20000`).

## Teardown

```bash
aws ec2 terminate-instances --instance-ids <INSTANCE_ID>
aws ec2 delete-security-group --group-id $SG    # after the instance is gone
```

A forgotten `t3.large` is roughly $60/month.

## Known limitations of this deployment

- **Plain HTTP.** No TLS; tokens cross the network in the clear. Fine for a demo, not
  for anything real.
- **One box, one blast radius.** Any container dying takes the system down, and Kafka
  runs at replication factor 1. That is the finding this deployment knowingly accepts —
  `README.md` is the answer to it.
- **Rate limiting is per address, and addresses are cheap.** Login is throttled by IP and
  by account (see `LoginRateLimiter`), which stops the single-source BCrypt CPU attack and
  password spraying. It does not stop a botnet spread thinly across thousands of addresses;
  that needs something in front of the instance.
- **Grafana is on plain HTTP too.** The admin password crosses the network in the clear,
  same as the API tokens. It is bound to your IP in the security group, which is the only
  thing protecting it.
- **Android push does not work yet.** The backend side is complete (per-category channels,
  priority, TTL, dead-token pruning), but the app has no `google-services.json` and no
  `android.googleServicesFile` in `app.json`, so Firebase Messaging never initialises and
  `getExpoPushTokenAsync` fails with `E_REGISTRATION_FAILED`. The app degrades to "no push"
  instead of crashing, and everything else — including the in-app notification list — works.
  Fixing it needs an FCM V1 service account uploaded to Expo plus that file in the build;
  see https://docs.expo.dev/push-notifications/fcm-credentials/.
