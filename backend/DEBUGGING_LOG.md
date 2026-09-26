# Debugging log — bugs found, root causes, and fixes

A record of real defects found in PawPal, written up for interview use. Each entry is
structured the way an interviewer wants to hear it: the **symptom** the user reported, the
**root cause**, how it was **diagnosed**, the **fix**, and the **transferable lesson**.

The through-line: almost every bug here was invisible to unit tests and only appeared when
the whole system ran against real infrastructure on a real device.

---

## 1. Same-day bookings vanished, and everything showed as "Completed"

**Symptom.** A walk posted for later today never appeared in anyone else's feed, and turned
up under "Completed" immediately. A booking for *tomorrow* worked fine.

**Root cause.** Two independent things combined:

1. `date` and `time` are stored as **display strings the phone formatted in its own
   timezone** (`"Mon, Jul 5, 2026"`, `"9:00 AM"`). The backend parses them into a naive
   `LocalDateTime` with no offset attached.
2. There is **no upcoming/completed status column.** "Completed" is *derived* from
   `scheduledAt.isBefore(LocalDateTime.now())`.

`LocalDateTime.now()` reads the **server** clock. The container runs UTC. So a 9 PM booking
in Toronto was compared against a UTC clock already past midnight, read as finished the
instant it was posted, dropped out of the active feed, and surfaced under Completed. A
booking a day out cleared the 4-hour offset, which is exactly why only same-day ones broke.

**Diagnosis.** Read the feed filter, saw `isBefore(LocalDateTime.now())`, then checked for a
`TZ` setting anywhere in `Dockerfile`, compose files, and `application.yml` — nothing. JVM
defaults to UTC in the container. The date arithmetic then explains the "one day later works"
detail exactly, which is what confirmed it rather than merely fitting it.

**Fix.** `app.timezone` (`APP_TIMEZONE`, default `America/Toronto`), injected as a `ZoneId`
and used for the comparison: `scheduledAt.isBefore(LocalDateTime.now(zone))`.

**Verified end to end**, not just compiled: posted a booking an hour out, fetched the feed as
a *second account*, confirmed it appeared, and confirmed `/completed` stayed empty.

**Lesson.** A naive `LocalDateTime` is not a point in time — it is a wall-clock reading whose
meaning depends on a zone you did not store. The moment a value crosses a process boundary,
either attach the offset or record which zone it meant. The honest limitation of this fix is
that it is correct for single-timezone users and wrong for users spread across zones; the
real answer is an ISO-8601 timestamp with offset and a true instant column, which is a
migration rather than a config flag. **Saying that out loud is the point** — knowing the
limits of your own fix is what separates a patch from engineering.

---

## 2. Raw JSON shown to users on every error

**Symptom.** Wrong password produced `{"message":"Invalid email or password"}` on screen —
braces, quotes and all. A validation failure showed the whole envelope including
`correlationId`.

**Root cause.** One line:

```ts
if (!res.ok) throw new Error(text || 'Request failed');   // text = raw response body
```

`Error.message` *was* the JSON body, and every screen rendered `e.message` directly.

**Diagnosis.** Replayed the exact client code against the bodies the backend actually returns,
rather than reasoning about it. That also surfaced the useful structural fact: the backend has
**three different error shapes** (`ErrorResponse` envelope, controller `Map.of("message", …)`,
and raw JSON written by servlet filters) — but *every one carries a `message` field*, so a
single parser handles all three.

**Fix.** An `ApiError` class carrying `status` / `message` / `correlationId`, one `request()`
for all four verbs, status-based fallbacks, and 5xx internals replaced with generic copy.
Fixed ~60 call sites by changing one file.

**Lesson.** Error handling belongs at the boundary, once. Four near-identical copies of a
`fetch` wrapper is four chances to drift. And a 5xx message is an internal detail — showing
`"JSON parse error: Unexpected character..."` to a user is a leak, not a message.

---

## 3. `fetch` has no timeout — the frozen-app bug

**Symptom.** With the backend down, the login spinner ran for **75+ seconds** and never
stopped. Indistinguishable from a crashed app.

**Root cause.** `fetch` has no built-in timeout. When a host accepts the connection and then
goes away — or an emulator holds a half-open socket after a server restart — the promise stays
pending until the OS gives up.

**Diagnosis.** Only found by killing the backend *with the app running* and watching. A unit
test with a mocked `fetch` would never expose it.

**Fix.** `AbortController` with a 15 s cap, covering the body read as well (which can hang for
the same reasons). Distinguishes "no response" from "timed out" in the message.

**Lesson.** Every network call needs a deadline. "It works when the server is up" is not a
tested state — the interesting states are *slow* and *half-dead*, and they are the ones users
actually hit.

---

## 4. Failed loads rendered as empty states

**Symptom.** A backend outage looked exactly like "no walks near you" — nothing to read,
nothing to retry.

**Root cause.** `catch (_) {}` in the load path, falling through to the empty-state copy.

Worst instance: `PostDateInvitationScreen` treated a failed `GET /api/pets/my` as *zero pets*,
which triggered the **"Add a pet first"** screen and pushed people who already own a pet toward
creating a duplicate.

`NotificationsScreen` was subtler: both halves had `.catch(() => [])`, so the outer catch could
never fire and a total outage rendered as "no notifications yet."

**Fix.** A shared `ErrorNotice` with a retry, and a `loadError` state on 13 screens. Silent
catches that remain are deliberate and each carries a comment saying why — optional location
lookups, a geocoder fallback chain, unread-count polls, and sign-out cleanup.

**Lesson.** An empty state is a *claim*: "we looked, there's nothing." If you didn't
successfully look, you must not make that claim. `catch {}` is where that lie gets told.

---

## 5. Chat messages arriving as a single letter

**Symptom.** A typed word reached the other person as `"d"`.

**Root cause.** The chat composer was a **controlled** `TextInput` (`value={text}`), and both
chat screens poll their thread every 4 s, calling `setMessages` with a fresh array — which
re-renders the composer. On Android, re-rendering a controlled `TextInput` while the soft
keyboard holds a **composing region** (any predictive-text keyboard, mid-word) discards that
composition. What sends is a fragment of what was typed.

**Diagnosis.** Ruled the backend out *first*: sent `'d'`, multi-word strings, double spaces and
non-ASCII through `POST /api/messages` and confirmed byte-identical round-trips (em-dash
included). That narrowed it to client-side-before-send, at which point the 4-second poll and
the un-memoised composer were the obvious suspects.

**Fix.** The composer keeps its draft in a **ref** with `defaultValue` (uncontrolled) and is
`memo`-wrapped, so no parent re-render can touch what is being typed. The polls also stop
handing back a new array when nothing changed.

**Honest caveat.** The mechanism is reasoned from the code, not reproduced — `adb shell input
text` bypasses the composing region, which is the exact thing at fault. Needs manual
confirmation with a real keyboard.

**Lesson.** "Controlled" inputs fight the IME on Android. Anything that re-renders on a timer
will eventually re-render mid-keystroke. Also: prove which side of the wire the corruption is
on before theorising about either.

---

## 6. Push notifications had never worked — two independent faults

**Symptom.** No notification had ever been delivered.

**Root cause A — nothing ever called the registration function.** `registerForPush()` existed,
was well written, and was **referenced nowhere**. Only `unregisterPush()` (on sign-out) was
wired. So no device ever registered a token and the backend had nobody to send to.

**Root cause B — FCM was never configured.** No `android/app/google-services.json`, and the
`com.google.gms.google-services` Gradle plugin was not applied:

```
W FirebaseApp: Default FirebaseApp failed to initialize because no default options were found.
```

**Diagnosis.** `grep` for the call site found root cause A in seconds. B came from `logcat`
during app start — the failure was there all along, just never read.

**Fix.** Called `registerForPush()` after login, after sign-up, and on start when a session
exists (unawaited — push is optional and must never delay sign-in). Added `googleServicesFile`
to `app.json` and re-ran `expo prebuild`, which places the JSON and applies the plugin.

**Verified:** `FirebaseApp initialization successful`, then
`[push] registered token with backend` with a real `ExponentPushToken[...]`.

**Lesson.** "The code exists" and "the code runs" are different claims. A function nobody calls
is dead weight that reads as a finished feature. Grep for call sites before believing a feature
is wired.

---

## 7. Device-token registration: a check-then-act race

**Symptom.** Push registration returned **HTTP 500**. Found only because the fix for #6 finally
made registration run.

```
duplicate key value violates unique constraint "uk_device_tokens_token"
Key (token)=(ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]) already exists
```

**Root cause.** `DeviceTokenService.register()` does `findByToken(...)` and inserts if absent.
That is a **time-of-check-to-time-of-use race**. The client registers on launch *and* after
login; when those overlap, both lookups miss, both insert, one hits the unique constraint and
the entire request 500s. The method's own doc comment claimed it "has to be idempotent" — it
intended to be, and wasn't under concurrency.

**Diagnosis.** Read the stack trace, then reproduced deliberately: deleted nothing, fired **six
concurrent** registrations of a brand-new token, and watched the constraint violations appear.

**Fix.** Catch `DataIntegrityViolationException` in the controller and retry once. The retry
runs **outside** the rolled-back transaction, so the winner's row is now visible and
`register()` takes its update path.

**Verified:** six concurrent registrations, all **200**, with the violations visible in the log
being recovered from.

**Lesson.** `if (!exists) insert` is not idempotent — it is a race with a comment claiming
otherwise. Under concurrency you either let the database arbitrate (unique constraint +
handle the violation, or `ON CONFLICT DO UPDATE`) or you lock. Also note *why* the retry has to
be outside the original transaction: once a constraint fires, that transaction is poisoned and
nothing further will commit in it.

---

## 8. Caller mistakes reported as server errors

**Symptom.** A malformed JSON body returned **500** with a stack trace in the log.

**Root cause.** `HttpMessageNotReadableException` had no handler, so it fell to the
`Exception.class` catch-all.

**Why it matters beyond tidiness.** It logged a stack trace and incremented the 5xx metric for
something that was entirely the client's fault — which means the Grafana error rate no longer
tells you whether *your server* is unhealthy.

**Fix.** Map it to 400 `"Malformed request body"`. The parser's own message quotes the
offending input back, so it is replaced rather than echoed.

**Lesson.** Status codes are an interface, not decoration. 4xx means "you asked wrong", 5xx
means "I broke" — conflating them makes your monitoring lie to you.

---

## Environment failures (worth knowing, less interesting to interviewers)

These cost hours and are worth recognising fast, but they are tooling problems, not design ones.

| Symptom | Cause | Fix |
|---|---|---|
| `ninja: Filename longer than 260 characters` | Windows MAX_PATH during CMake. Building via Git Bash `cd /c/pp` resolved the junction back to the long real path | Run Gradle from PowerShell with `C:\pp` as the literal working directory, and delete `.cxx` (it caches absolute paths) |
| APK ballooned 33 MB → 194 MB | `expo prebuild` regenerates `android/` and reset `reactNativeArchitectures` to all four ABIs. 168 MB of the APK was native libs for architectures nothing runs | Pin `reactNativeArchitectures=arm64-v8a,x86_64`. Rebuild: 41 s, 72 MB |
| `CLEARTEXT communication not permitted` | `network_security_config.xml` whitelisted only the old EC2 IP. A `networkSecurityConfig` **overrides** `usesCleartextTraffic`, so the debug manifest's permission is ignored | Add `10.0.2.2` (emulator→host) and `127.0.0.1` (Metro) to the config |
| App stuck on a white screen | A Metro server left running from the **previous day** was serving a stale bundle | Kill whatever holds port 8081 before starting Metro |
| `adb: device unauthorized` | Moving `~/.android/adbkey` aside invalidated a trust the emulator had already accepted | Restore the keys, or `emulator -wipe-data` (auto-authorises on a clean boot) |

**Lesson.** `prebuild` regenerates `android/` wholesale. Anything hand-edited in there — ABI
lists, network security config — is lost silently. Either express it as a config plugin, or
write down that it must be re-applied.

---

## What to say if asked "how do you know it works?"

Every fix above was verified against **running infrastructure**, not just compiled:

- Timezone fix — posted a booking, fetched the feed **as a second account**, checked both the
  feed and the completed list
- Error mapping / validation / empty states — driven on a Pixel 3 emulator with the backend
  stopped and restarted mid-test
- Race condition — reproduced deliberately with six concurrent requests before and after
- Push — read `logcat` for `FirebaseApp initialization successful` and
  `[push] registered token with backend`, then triggered a real message and read the delivery
  rejection from Expo

Twice, unit tests passed while the app was broken. The habit that caught these was booting the
whole stack and driving the real UI.

## 9. Push tokens from two different Expo projects in one request

**Symptom.** With FCM credentials finally uploaded, delivery still failed:

```
PUSH_TOO_MANY_EXPERIENCE_IDS
All push notification messages in the same request must be for the same project
details: {
  "@jim-huang/mobile":       ["ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"],
  "@sanjyot01s-team/pawpal": ["ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"]
}
```

**Root cause.** An Expo push token is scoped to the **Expo project that minted it**. The
account had registered a token under the original project and, after moving to its own EAS
project, a second one — both still active for the same user. `PushNotificationService` batches
all of a user's active tokens into one Expo request, and Expo rejects a batch spanning
projects.

**Fix (operational).** Retire the stale token via `DELETE /api/notifications/device-token`.

**Worth fixing properly.** The backend should either group tokens per project before sending,
or treat a `PUSH_TOO_MANY_EXPERIENCE_IDS` response as a signal to deactivate tokens that no
longer belong to the current project. Right now one stale token silently blocks *every*
notification to that user — a single bad row is a per-user outage.

**Lesson.** Opaque third-party identifiers usually carry hidden scope. A push token is not
just "a device" — it is a device *for a specific project*, and mixing scopes in one batch is
a category error the API is right to reject. When you migrate projects, the old credentials
do not become invalid, they become *wrong*, which is harder to notice.

---

## Outcome

Push notifications were verified end to end on a Pixel 3: message sent from a second account,
app backgrounded, notification delivered to the tray with correct sender and body. The full
chain — backend → Kafka → Expo → FCM → device — is working.

Getting there required, in order: wiring a function nobody called (#6), configuring FCM
natively so Firebase could initialise (#6), fixing a concurrency bug that only became
reachable once registration ran (#7), uploading the service account key so Expo could forward
to FCM, and clearing a stale token from a previous Expo project (#9).

Each fault was individually invisible. Every one of them had to be fixed before a single
notification could arrive — which is the honest reason "is push done?" was hard to answer
until it was actually tested.
