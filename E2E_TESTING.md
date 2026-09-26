# End-to-end test plan (multi-device, against a deployed backend)

A manual test script for validating the whole product — app on real phones, backend on
AWS. Written to be run by two people on two devices, because most of what's interesting
(matching, messaging, notifications) needs a second party.

- Backend deployment: [`backend/deploy/SINGLE_INSTANCE.md`](backend/deploy/SINGLE_INSTANCE.md)
- API contract: [`API_REFERENCE.md`](API_REFERENCE.md)

Throughout: **Device A** and **Device B** are two phones with two different accounts.
`<API>` is your backend base URL, e.g. `http://3.15.x.x:8080`.

---

## Part 1 — Building an APK

### ⚠️ Read this first: plain HTTP is blocked in release builds

> **Update 2026-08-11 — already handled for the current deployment.** The main manifest now
> carries `android:networkSecurityConfig="@xml/network_security_config"`, and that file permits
> cleartext **for one hard-coded host only** (the EC2 IP), leaving every other destination
> HTTPS-only. If the backend moves to a different address, edit
> `android/app/src/main/res/xml/network_security_config.xml` and rebuild, or the APK will fail
> exactly as described below. Note `android/` is gitignored, so this file does not survive a
> fresh `expo prebuild` — reapply it, or move the setting into `app.json`.

`android/app/src/debug/AndroidManifest.xml` sets `usesCleartextTraffic="true"`, but the
**main manifest did not**. Debug builds can therefore reach `http://<EC2_IP>:8080` and
**release APKs could not** — Android has blocked cleartext HTTP by default since API 28.

The failure mode is nasty: no crash, no permission prompt, just every request failing
with a generic network error. If your APK "can't log in" but the same code works in the
emulator, this is why.

Pick one before building:

**Option A — allow cleartext (fastest, demo-grade).**

```bash
cd frontend/mobile
npx expo install expo-build-properties
```

Then in `app.json`, add to the `plugins` array:

```json
[
  "expo-build-properties",
  { "android": { "usesCleartextTraffic": true } }
]
```

**Option B — put the backend behind HTTPS** (a domain + certificate, or an ALB with an
ACM cert). Correct, and required for anything beyond a demo, since tokens otherwise
cross the network in the clear.

### Point the app at your backend

`frontend/mobile/src/utils/api.ts`:

```ts
const BASE_URL = 'http://<EC2_PUBLIC_IP>:8080';
```

Commit this, or the cloud build will bake in `10.0.2.2` (the emulator's host loopback)
and fail on every real device.

### Build with EAS (recommended)

Cloud builds avoid the local Android toolchain entirely — which matters here, because
local native builds on this project currently fail on Windows with
`Filename longer than 260 characters` (see Troubleshooting).

First, make the `preview` profile emit an APK rather than an AAB. In `eas.json`:

```json
"preview": {
  "distribution": "internal",
  "android": { "buildType": "apk" }
}
```

Then:

```bash
cd frontend/mobile
npx eas login
npx eas build --platform android --profile preview
```

EAS prints a download URL when it finishes (~10–20 min). Open that link on each phone to
install, or download the `.apk` and share it. Android will warn about installing from an
unknown source — that is expected for internal distribution.

The project already has an EAS `projectId` in `app.json`, so no `eas init` is needed.

### Build locally instead

Only works if the long-path problem is resolved (Troubleshooting below):

```bash
cd frontend/mobile/android
./gradlew assembleRelease
# output: android/app/build/outputs/apk/release/app-release.apk
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

A release build needs a signing key; `expo run:android --variant release` will generate a
debug-signed one, which is fine for internal testing but cannot be published.

### Push notifications need this build, not a JS reload

`expo-notifications` is a native module. It was added after the last native build, so
push only works in an APK built **after** that change. Devices running an older build
log `[push] expo-notifications not in this native build — push disabled` and continue
working with everything except push — deliberate, so a stale native build degrades
instead of crashing.

---

## Part 2 — Test flows

Tick these off per device. "Backend check" lines are optional server-side confirmations —
run them over SSH on the EC2 instance.

### Flow 0 — Smoke test before touching a phone

```bash
curl <API>/api/system/health                      # expect 200
curl -o /dev/null -w '%{http_code}\n' <API>/api/notifications   # expect 401, not 200
```

The 401 matters: it proves auth is enforced. A 200 here means the deployment is serving
private data to anonymous callers — stop and investigate.

### Flow 1 — Signup and permissions (both devices)

| # | Step | Expected |
|---|---|---|
| 1.1 | Install the APK, open it | Login screen, no crash |
| 1.2 | Tap **Sign Up**, register a new account | Lands on the map screen |
| 1.3 | Grant the location permission when prompted | Map centres near you |
| 1.4 | Grant the notification permission (Android 13+) | Prompt appears once |
| 1.5 | Force-close and reopen | Still signed in (token persisted) |

Use **different** email addresses on A and B.

**Backend check:** `select id, name, email from users order by id desc limit 5;`

### Flow 2 — Location telemetry

| # | Step | Expected |
|---|---|---|
| 2.1 | Leave the app open ~30s on both devices | — |
| 2.2 | Pull to refresh the map | Each device may see the other under "Nearby Walking Partners" |

The ping fires on launch and every 3 minutes. Distances are real, so if A and B are far
apart neither will appear in the other's list — that is correct behaviour, not a bug.

**Backend check:**
```bash
docker exec pet-social-redis redis-cli ZCARD users:geo
docker exec pet-social-redis redis-cli --scan --pattern 'users:presence:*' | wc -l
```

> **If nobody ever appears:** matching requires a live `users:presence:*` key, which only
> exists after a device has sent telemetry. A freshly seeded account that never opened the
> app will never match. Set `APP_MATCHING_REQUIRE_FRESH_PRESENCE=false` to relax this.

### Flow 3 — Walk invitation and request (A hosts, B joins)

| # | Device | Step | Expected |
|---|---|---|---|
| 3.1 | A | Walk tab → post an invitation (route, date, time, spots) | Appears under "My Invitations" |
| 3.2 | B | Walk tab → feed | A's invitation is listed |
| 3.3 | B | Open it → request to join | Status shows pending |
| 3.4 | A | Walk tab | Sees B's request, with a badge |
| 3.5 | A | Accept | Status flips to accepted on **both** devices |
| 3.6 | B | — | Notification about the status change |

### Flow 4 — Messaging

| # | Device | Step | Expected |
|---|---|---|---|
| 4.1 | B | Open the accepted request → send "See you at 5" | Message appears immediately |
| 4.2 | A | Open the same thread | Message visible; unread badge clears |
| 4.3 | A | Reply | B sees it (chat polls; allow a few seconds) |

**Backend check:** `select id, sender_id, receiver_id, content from messages order by id desc limit 5;`

### Flow 5 — Notifications (the part most likely to fail)

| # | Device | Step | Expected |
|---|---|---|---|
| 5.1 | Both | Confirm the APK was built after `expo-notifications` was added | — |
| 5.2 | A | Send B a message | — |
| 5.3 | B | App in foreground | Banner appears |
| 5.4 | B | **Background the app**, have A send another | Notification in the Android tray |
| 5.5 | B | Tap it | Opens the relevant screen, not the home tab |
| 5.6 | B | Pull down the tray, long-press the notification | Channel shown is *Messages* |

**Backend check — did the device actually register?**
```bash
docker exec pet-social-postgres psql -U pawpal -d pet_social_db \
  -c 'select id, user_id, platform, active, left(token,25) from device_tokens'
```
No rows means registration never happened — check `.env`'s CORS setting and that the app
logged in before backgrounding.

If a row exists but `active = f`, the push service reported the token dead and the backend
pruned it. That is the pruning logic working; it means the token was stale (app reinstalled,
or built with a different project id).

### Flow 6 — Marketplace

| # | Device | Step | Expected |
|---|---|---|---|
| 6.1 | A | Post an item with a photo and price | Appears in the list |
| 6.2 | B | Marketplace tab | A's item visible |
| 6.3 | B | Message the seller about it | Thread opens, scoped to the listing |
| 6.4 | A | Market chats | B's message present |

### Flow 7 — Auth behaviour

| # | Step | Expected |
|---|---|---|
| 7.1 | Log out on B | Returns to login |
| 7.2 | Log back in | Data still there |
| 7.3 | Log in as B's account on device A | A now shows B's data (shared-device case) |
| 7.4 | From A, send a message; check B's tray | B should **not** get a push for the account that is no longer signed in on that device |

7.4 is worth doing deliberately: device tokens are keyed on the token, not the user, so
re-registering reassigns ownership. If B's phone still gets notifications for an account
that logged out there, that reassignment is broken.

### Flow 8 — Multi-device sanity

Run with three or more devices if you have them:

- Two accounts posting invitations simultaneously → both appear in every feed
- All devices open at once → no 500s in `docker compose logs app`
- Kill the app on one device mid-flow → others unaffected

---

## Part 3 — Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Every request fails on a release APK, works in the emulator | Cleartext HTTP blocked | Part 1, Option A or B |
| `401` on every screen | Missing/expired token | Log out and back in; token lives 7 days |
| Login works, all other screens fail | App not sending the Bearer header | Ensure calls go through `src/utils/api.ts` |
| Map shows nobody | No live presence, or genuinely far apart | See Flow 2 note |
| Match returns yourself | Matching has no self-exclusion (known) | Use two accounts |
| No push, no error | APK predates `expo-notifications`, or channel id mismatch | Rebuild; channel ids must be `messages`, `requests`, `social` |
| Grafana empty | Prometheus endpoint disabled by default | `MGMT_ENDPOINTS=health,info,prometheus`, `MGMT_PROMETHEUS_ENABLED=true` |
| `Filename longer than 260 characters` during a local Android build | Windows MAX_PATH | Enable long paths (admin: set `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled=1`, reboot), or move the repo to a short path like `C:\pp`, or build with EAS |
| Emulator refuses to launch, exits instantly | Low disk | The AVD needs several GB free; a Gradle build needs several more |
| App boots to a blank/dev-launcher screen | Dev-client build with no Metro | Start `npx expo start --dev-client`, or install a release APK |

### Reading the backend during a test

```bash
docker compose --env-file .env -f docker-compose.aws.yml logs -f app | grep http.access
```

Every request logs method, path, status and a correlation id. If a screen misbehaves,
find its request here first — that separates "the app never called" from "the call failed".
