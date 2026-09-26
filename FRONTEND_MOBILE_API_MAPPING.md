# PawPal — `frontend/mobile` ↔ Backend API Mapping

> Maps every network call made by the **latest app** (`frontend/mobile/src`) against the
> current Spring Boot backend (`backend/src/main/java/org/example/pet_social`).
> `frontend1/src/services/*` is the older reference layer and matches the backend 1:1 today;
> `frontend/mobile` targets a **richer contract** and a **JWT-based identity model**.
>
> Legend: ✅ works as-is · ⚠️ exists but needs a change · ❌ missing (must be built)
>
> **STATUS UPDATE 2026-07-13 — everything below is now built.** Every ❌/⚠️ item in this
> document was implemented on `feature/sanjyot-db-schema`; the tables are kept as the contract
> reference. Implementation notes:
> - **Walk/date boards**: one engine (`PartnerBoardService`) + `partner_invitations` /
>   `partner_requests` tables (type = WALK|DATE). Feeds are cached in Redis
>   (`feed:board:{type}`, 30 s TTL, invalidated on every write) and personalized per caller.
> - **Feeds are distance-bounded (2026-08-11).** When `lat`/`lng` are supplied,
>   `/api/{walk,date}/invitations/feed` return only invitations within `radiusKm` (optional;
>   defaults to 25 km, clamped server-side to 100 km) and sort them nearest-first. Previously
>   distance was computed for the label only and every open invitation was returned. **If a feed
>   looks empty, check the caller's coordinates before suspecting the data** — that is now the
>   most common cause. Omitting `lat`/`lng` disables the bound, since there is nothing to
>   measure against.
> - **Notifications have one entry point (2026-08-11).** The bell on `HomeMapScreen` is the only
>   route to the list; the 💬/🔔 buttons on the Walk, Date and Me headers and the Walk tab's red
>   dot are gone, as is `WalkBadgeContext`. The unread count comes from
>   `GET /api/notifications/unread-count` on screen focus. `/api/messages/unread-counts` is no
>   longer polled by the Walk and Date screens.
> - **Messages**: `POST /api/messages` accepts `walkRequestId`/`dateRequestId`/`marketItemId`
>   aliases (context types `WALK_REQUEST`/`DATE_REQUEST`/`LISTING`); the per-thread getters
>   mark incoming messages read on fetch; `/api/messages/unread-counts` → `{WALK,DATE,MARKET}`
>   is Redis-cached (15 s TTL, invalidated on send/read).
> - **Market**: `/api/market/*` uses raw enum values; `DELETE` = soft-delete to `WITHDRAWN`
>   so existing chats survive; `GET /api/market/chats` aggregates LISTING threads.
> - **Identity**: `JwtAuthFilter` now also gates `/api/walk/*`, `/api/date/*`, `/api/market/*`,
>   `/api/users/me*`, `/api/pets/my`. `POST /api/pets` uses the token when present and falls
>   back to body `ownerId` only for legacy frontend1 calls.
> - **Kafka**: notification fan-out rides a new `app-events` topic (async, off the request
>   path); `user-telemetry` is now declared with 3 partitions and the consumer concurrency
>   matches (`app.kafka.telemetry-partitions`).
> - **Google Sign-In**: `POST /api/auth/google` verifies the ID token via Google tokeninfo;
>   set `GOOGLE_CLIENT_ID` in production for audience checking.

---

## 0. The two structural differences

1. **Identity model.**
   - `frontend1` sends `userId` / `ownerId` / `sellerId` as **query/body params**; the backend trusts them.
   - `frontend/mobile` sends a **JWT `Authorization: Bearer <token>`** header (`utils/api.ts`) and calls
     `/me` and `/my` endpoints — it never puts its own id in the body. **Every "whose data" endpoint must
     derive the user from the token**, not from a client param. (This also closes the IDOR findings — see
     `SECURITY_FIXES.md`.)

2. **Base URL.**
   - `frontend/mobile/src/utils/api.ts` → `https://pawpal-279020382757.us-central1.run.app` (Cloud Run).
   - `frontend1/src/services/api.ts` → `http://10.0.2.2:8080` (local emulator).
   - To test `frontend/mobile` against this local backend, point `BASE_URL` at `http://10.0.2.2:8080`.

---

## 1. Auth  (`/api/auth`)

| App call | Body | Expects | Backend | Status |
|---|---|---|---|---|
| `POST /api/auth/login` | `{email,password}` | `{token,userId,name,email}` | `AuthController.login` | ✅ |
| `POST /api/auth/register` | `{name,email,password}` | `{token,userId,name,email}` | `AuthController.register` | ✅ |
| `POST /api/auth/google` | `{idToken}` (Google Sign-In) | `{token,userId,name,email}` | — | ❌ **build**: verify Google ID token, find-or-create user, issue app JWT |

**Screens:** `LoginScreen.tsx`, `SignUpScreen.tsx`.

---

## 2. Users / profile  (`/api/users`)

| App call | Body | Expects | Backend | Status |
|---|---|---|---|---|
| `GET /api/users/me` | — | `{id,name,email,bio?,location?,avatarUrl?}` | only `GET /api/users/{id}` (and it leaks a token) | ❌ **build** `/me` from token |
| `PUT /api/users/me` | `{name,bio,location,avatarUrl?}` | updated profile | — | ❌ **build** |
| `GET /api/users/me/stats` | — | `{posts:number,pets:number,friends:number}` | — | ❌ **build** (counts from Post/Pet/Friendship repos) |

**Schema gap:** `User` entity has **no** `bio`, `location`, or `avatarUrl` columns — add them.
**Screens:** `MeProfileScreen.tsx`, `EditProfileScreen.tsx`.

---

## 3. Pets  (`/api/pets`)

| App call | Body | Expects | Backend | Status |
|---|---|---|---|---|
| `GET /api/pets/my` | — | `Pet[]` (token-owned) | only `GET /api/pets/owner/{ownerId}` | ❌ **build** `/my` from token |
| `POST /api/pets` | `{name,species,breed?,gender,dateOfBirth?,bio?,isVaccinated,isNeutered,profilePhotoUrl?}` | created `Pet` | `PetController.create` **requires `ownerId` in body** | ⚠️ derive `ownerId` from token; app sends none |
| `PUT /api/pets/{id}` | same shape as POST | updated `Pet` | — | ❌ **build** (+ ownership check) |
| `DELETE /api/pets/{id}` | — | 204 | — | ❌ **build** (+ ownership check) |

**App `Pet` shape:** `{id,name,species,breed?,gender?,bio?,profilePhotoUrl?,isVaccinated?,isNeutered?,dateOfBirth?}`.
`Pet` entity already has `profilePhotoUrl` ✅ (no emoji needed). `PetResponse` must expose these exact fields.
**Discovery endpoints** `GET /api/pets/nearby|partners|blind-dates` exist ✅ but are used by **`frontend1` only** — `frontend/mobile` does not call them.
**Screens:** `AddPetScreen.tsx`, `EditPetScreen.tsx`, `MeProfileScreen.tsx`.

---

## 4. Walk invitations & requests  (`/api/walk/*`) — **entire namespace missing**

Closest existing backend is `/api/invitations` (WALK-type rows in `events`), but paths, shapes and the
request→accept flow all differ. Treat as a new module.

| App call | Body | Expects | Status |
|---|---|---|---|
| `GET /api/walk/invitations/feed?lat&lng` | — | `WalkFeedItem[]` (see below) | ❌ **build** |
| `GET /api/walk/invitations/my` | — | `WalkInvitation[]` | ❌ **build** |
| `POST /api/walk/invitations` | `{route,date,time,message?,durationMinutes,maxSpots,hostPetIds?[],latitude?,longitude?}` | created | ❌ **build** |
| `PUT /api/walk/invitations/{id}` | `{route,date,time,message?,durationMinutes,maxSpots,latitude?,longitude?}` | updated | ❌ **build** |
| `DELETE /api/walk/invitations/{id}` | — | 204 | ❌ **build** |
| `POST /api/walk/requests` | `{invitationId}` | created request (requester = token) | ❌ **build** |
| `GET /api/walk/requests/my-sent` | — | `[{invitationId,status}]` | ❌ **build** |
| `GET /api/walk/requests/my-sent-unread` | — | `[{invitationId,unreadCount}]` | ❌ **build** |
| `PUT /api/walk/requests/{id}` | `{status:'ACCEPTED'\|'REJECTED'\|'BLOCKED'}` | updated (host only) | ❌ **build** |
| `GET /api/walk/notifications` | — | `WalkNotification[]` | ❌ **build** |

**`WalkFeedItem`** (denormalized): `id, route, date, time, durationMinutes, maxSpots, spotsLeft, message?,
ownerId, ownerName, ownerAvatarUrl?, petId?, petName?, petSpecies?, petBreed?, petGender?, petAge?,
petProfilePhotoUrl?, petIsVaccinated?, petIsNeutered?, distanceKm?, distanceLabel?, myRequestId?,
myRequestStatus?, unreadMessageCount?, pets?[{petId,petName,petSpecies,petBreed,petGender,petAge,
petProfilePhotoUrl,petIsVaccinated,petIsNeutered}]`.

**`WalkInvitation`**: `id, route, date, time, durationMinutes, maxSpots, spotsLeft?, message?, status,
hostPetIds?[], pendingRequestCount?`.

**Model work:** a **walk request** entity (host, requester, invitation, per-requester status
`PENDING/ACCEPTED/REJECTED/BLOCKED`, unread counter) — `EventAttendee` is an RSVP list, not this. `PetMatch`
is the closest analog. Date fields are formatted **strings** (`"Mon, Jul 5, 2026"`, `"9:00 AM"`), not ISO.
**Screens:** `FindPartnersScreen.tsx`, `HomeMapScreen.tsx`, `PostInvitationScreen.tsx`, `EditInvitationScreen.tsx`, `ConnectPetProfileScreen.tsx`, `WalkRequestDetailScreen.tsx`.

---

## 5. Blind-date invitations & requests  (`/api/date/*`) — **entire namespace missing**

Same pattern as walk, single host pet, `location` instead of `route`.

| App call | Body | Expects | Status |
|---|---|---|---|
| `GET /api/date/invitations/feed?lat&lng` | — | `DateFeedItem[]` | ❌ **build** |
| `GET /api/date/invitations/my` | — | `DateInvitation[]` | ❌ **build** |
| `POST /api/date/invitations` | `{hostPetId,location,date,time,message?,latitude?,longitude?}` | created | ❌ **build** |
| `PUT /api/date/invitations/{id}` | `{hostPetId,location,date,time,message?,latitude?,longitude?}` | updated | ❌ **build** |
| `DELETE /api/date/invitations/{id}` | — | 204 | ❌ **build** |
| `POST /api/date/requests` | `{invitationId}` | created | ❌ **build** |
| `GET /api/date/requests/my-sent` | — | `[{invitationId,status}]` | ❌ **build** |
| `PUT /api/date/requests/{id}` | `{status}` | updated | ❌ **build** |
| `GET /api/date/notifications` | — | `WalkNotification[]` (shared shape) | ❌ **build** |

**`DateFeedItem`**: `id, hostUserId, location?, date?, time?, message?, ownerName?, ownerAvatarUrl?, petId?,
petName?, petSpecies?, petBreed?, petGender?, petAge?, petProfilePhotoUrl?, petIsVaccinated?, petIsNeutered?,
distanceKm?, distanceLabel?, myRequestId?, myRequestStatus?, unreadMessageCount?`.
**`DateInvitation`**: `id, hostUserId, hostPetId?, location?, date?, time?, message?, status,
pendingRequestCount?, petName?, petSpecies?, petBreed?, petProfilePhotoUrl?, petAge?`.
**Screens:** `PetBlindDateScreen.tsx`, `PostDateInvitationScreen.tsx`, `EditDateInvitationScreen.tsx`, `DatePetProfileScreen.tsx`.

---

## 6. Marketplace  (`/api/market/*`) — path & shape mismatch

Backend uses `/api/marketplace/items`; the app uses `/api/market/*` with richer fields.

| App call | Body | Expects | Backend | Status |
|---|---|---|---|---|
| `GET /api/market/items?category=TOY` | — | `MarketItem[]` | `GET /api/marketplace/items` | ❌ path + shape differ |
| `GET /api/market/items/my` | — | `MarketItem[]` (token seller) | — | ❌ **build** |
| `POST /api/market/items` | `{name,category,condition,price,originalPrice?,description?,location?,latitude?,longitude?,photoUrl?}` | created | `POST /api/marketplace/items` needs `sellerId` in body | ⚠️ path + derive seller from token |
| `PUT /api/market/items/{id}` | POST body + `{status:'ACTIVE'\|'SOLD'}` | updated | only `.../{id}/sold` | ❌ **build** general update |
| `DELETE /api/market/items/{id}` | — | 204 | — | ❌ **build** |
| `GET /api/market/chats` | — | `MarketChat[]` | — | ❌ **build** (aggregate messages by item+partner) |

**App `MarketItem`**: `id, sellerUserId, name, description?, category(TOY/CARRIER/FOOD/ACCESSORY/OTHER),
price?, originalPrice?, condition(NEW/LIKE_NEW/GOOD/FAIR), photoUrl?, location?, status(ACTIVE/SOLD/WITHDRAWN),
sellerName?, sellerAvatarUrl?, unreadMessageCount?`.
**App `MarketChat`**: `itemId, otherUserId, otherUserName?, otherUserAvatarUrl?, itemName?, itemPhotoUrl?,
itemPrice?, itemStatus?, isSeller?, lastMessage?, lastMessageAt?, lastMessageIsOwn?, unreadCount?`.
**Schema gaps on `MarketplaceItem`:** add `photoUrl`, `location`, `WITHDRAWN` status; responses must send raw
enum values (`TOY`, `LIKE_NEW`) — current `MarketplaceItemResponse` capitalizes/relabels them.
**Screens:** `MarketplaceScreen.tsx`, `PostMarketItemScreen.tsx`, `MarketChatsScreen.tsx`, `MarketplaceChatScreen.tsx`.

---

## 7. Messages  (`/api/messages`) — partially compatible

| App call | Body | Expects | Backend | Status |
|---|---|---|---|---|
| `POST /api/messages` | `{receiverId,content, walkRequestId? \| dateRequestId? \| marketItemId?}` | `ChatMessage` | `send` wants `{receiverId,content,contextType,contextId}` | ⚠️ accept the 3 context aliases → map to `(contextType,contextId)` |
| `GET /api/messages/walk-request/{id}` | — | `ChatMessage[]` | `GET /thread?otherUserId&contextType&contextId` | ❌ **build** alias |
| `GET /api/messages/date-request/{id}` | — | `ChatMessage[]` | as above | ❌ **build** alias |
| `GET /api/messages/market-item/{itemId}/{otherUserId}` | — | `ChatMessage[]` | as above | ❌ **build** alias |
| `GET /api/messages/unread-counts` | — | `{WALK,DATE,MARKET: number}` **map** | only `/unread-count` → `{count}` | ❌ **build** grouped counts |

**App `ChatMessage`**: `{id, senderId, receiverId, content, createdAt, isOwn, senderName?, senderAvatarUrl?}` —
`MessageResponse` must include `senderId`/`receiverId`/`createdAt`/`isOwn`. Auth already token-based ✅.
**Screens:** `WalkRequestDetailScreen.tsx`, `MarketplaceChatScreen.tsx`, `FindPartnersScreen.tsx`, `PetBlindDateScreen.tsx`, `MarketplaceScreen.tsx`.

---

## 8. Backend endpoints NOT used by `frontend/mobile`

Used by `frontend1` / ops only — safe to leave, but they are **not** part of the latest app:
`/api/users/{id}`, `/api/users/register|login`, `/api/pets/nearby|partners|blind-dates|owner/{id}`,
`/api/invitations/*`, `/api/marketplace/items/*`, `/api/notifications/*`, `/api/matches/*`, `/api/match`,
`/api/reviews/*`, `/api/telemetry/*`, `/api/test-data/*`, `/api/inspector/*`, `/dashboard/*`, `/api/system/health`.

---

## 9. Image uploads (not backend)

`frontend/mobile` uploads images to **Firebase Storage** (`utils/uploadImage.ts` + `utils/firebase.ts`) and
sends the resulting **URL string** (`profilePhotoUrl`, `avatarUrl`, `photoUrl`) in the JSON body. The backend
only ever stores/returns these URL strings — no multipart upload endpoint is required. Confirm Firebase Storage
security rules are locked down (uploads happen client-side).

---

## 10. Suggested build order

1. **Auth/identity spine** — add `bio/location/avatarUrl` to `User`; build `GET/PUT /api/users/me`,
   `/api/users/me/stats`, `GET /api/pets/my`, token-derived `POST /api/pets`, `PUT/DELETE /api/pets/{id}`,
   `POST /api/auth/google`. Unlocks profile + pet management (5 screens).
2. **Messaging aliases** — `unread-counts`, `walk-request/date-request/market-item` thread getters,
   `ChatMessage` fields, context aliases on `POST`. Small, unlocks all chat UI.
3. **Walk module** — invitation + request entities, `feed/my`, requests, notifications.
4. **Date module** — mirror walk with single host pet + `location`.
5. **Market module** — `/api/market/*` paths, `photoUrl`/`location`/`WITHDRAWN`, `my`, general `PUT`,
   `DELETE`, `chats`.

Items in **§1 (auth)** already work; everything marked ❌ needs building; ⚠️ items need the token-identity
switch, which is also the security fix for impersonation/IDOR.

---

## 11. Client error handling

All four verbs go through one `request()` in `src/utils/api.ts`, which turns any failure into an
`ApiError` carrying `status`, a **human-readable** `message`, and the `correlationId` when the server
sent one. Screens read `message` (or call `errorMessage(e, fallback)`) and never touch the raw body.

Before this existed, `apiPost` threw `new Error(responseText)`, so `Error.message` *was* the JSON body
and every screen rendered it verbatim. A wrong password showed:

```
{"message":"Invalid email or password"}
```

and a validation failure showed the whole envelope, `correlationId` included. One parser now covers all
three backend error shapes (see [API_REFERENCE](API_REFERENCE.md#error-bodies-always-carry-message)),
because each of them carries `message`.

Rules the client applies:

| Situation | What the user sees |
|---|---|
| 4xx with a `message` | the server's message |
| Any 5xx | `Something went wrong on our end. Please try again.` — internals are never shown |
| No response (server down, no network) | `Can't reach the server. Check your connection and try again.` |
| No response within 15s | `The server took too long to respond. Please try again.` |
| Short machine codes (`walk-full`, `no-match`, …) | mapped to real sentences via `MESSAGE_OVERRIDES` |

**`fetch` has no timeout of its own.** Without the `AbortController` in `request()`, an unreachable
backend leaves the promise pending until the OS gives up, which on the login screen is a spinner that
never stops — indistinguishable from a frozen app. 15s is the cap; it covers reading the body too,
since that can hang for the same reasons.

### Validation: both sides, different jobs

The backend's `@NotBlank`/`@Email`/`@Size` on `AuthController` is the boundary that actually enforces
anything — anyone can post straight to the API, so it can never be removed. The client checks in
`src/utils/validation.ts` exist only to save a round trip and put the message next to the field.

Keep the client mirroring the server's **format and presence** rules and nothing more. Anything needing
server state — whether a password is right, whether an email is taken, whether a walk is full — is the
server's to answer, and duplicating it on the client just creates drift.

### Failed loads are not empty states

Screens that fetch a list keep a `loadError` and render `<ErrorNotice message onRetry />` instead of
their empty state. Previously these swallowed the error in `catch (_) {}` and fell through to copy like
"No walk partners nearby yet." — so a backend outage was indistinguishable from genuinely having no
results, with nothing to read and nothing to retry.

The worst case was `PostDateInvitationScreen`: a failed `GET /api/pets/my` left `pets` empty, which
triggered the "Add a pet first" screen and pushed people who already own a pet toward creating a
duplicate. `noPetsYet` now requires that the fetch actually succeeded.

Catches that stay silent are deliberate and carry a comment saying why — optional location lookups (the
feed still loads unlocated), the geocoder → ORS → raw-coordinates fallback chain in `RouteMapPicker`,
unread-count polls (stale beats interrupting; the next tick corrects it), and `GoogleSignin.signOut()`
during logout, where the local session is already cleared and a failure must not strand the user.

Chat screens poll every 4s, so they surface an error **only while the thread is empty** — a blip with
messages already on screen stays quiet.

---

## 12. Distance filter and the map sheet

### Distance filter (`DistanceSlider`)

Walk and Date both carry a distance control that sends `radiusKm` on the feed request. The backend
already accepted and clamped that parameter (see
[API_REFERENCE §2](API_REFERENCE.md#2-pets--discovery--apipets)); the client simply never offered a
way to set it.

Two things about it are deliberate:

- **It is written against `PanResponder`, not a slider package.** A slider library is a *native*
  module, so adding one means rebuilding and reinstalling the dev-client APK. `PanResponder` is core
  React Native, so this ships over Metro like any other JS change.
- **The value commits on release, not on every drag frame.** Each change refetches the feed; firing
  that per pixel would hammer the endpoint and make the thumb fight the re-render.

`radiusKm` is only sent when coordinates are available — without an origin the server has nothing to
measure from, so sending a radius would be misleading rather than merely useless.

Keep `DEFAULT_RADIUS_KM` / `MAX_RADIUS_KM` in step with `app.discovery.*` on the backend. They only
decide what the control offers (the server clamps regardless), but out of step the thumb will sit at
a distance the feed was never fetched for.

### Map bottom sheet

`HomeMapScreen`'s sheet drags between two snap points — a peek and ~62% of the screen — and swaps
the horizontal three-card strip for a **vertical scrollable list** when expanded. It previously was
a fixed-height `View` with a handle bar drawn on top: the handle looked draggable and never was, so
the partner list below the fold had no way to come up.

Worth knowing if you touch it: the handle must be a plain `View` with the pan handlers on it, **not
a `Touchable`**. A Touchable runs its own responder and wins the gesture, so the drag never reaches
`PanResponder` and only the tap fires. Tap-to-toggle is handled inside the responder instead, by
treating a release with `|dy| < 6` as a tap.

The sheet animates `height`, which is a layout property — so `useNativeDriver` must stay `false`
there.

---

## 13. Chat composer, push registration, and the market require cycle

### The composer must stay uncontrolled

`ChatInputBar`'s `TextInput` is driven by a **ref and `defaultValue`**, not by `value`, and the
component is wrapped in `React.memo`. Do not "tidy" it back into a controlled input.

Both chat screens poll their thread every 4s and call `setMessages` with a fresh array, which
re-renders everything below — including the composer. Re-rendering a *controlled* `TextInput` on
Android while the soft keyboard holds a composing region (any predictive-text keyboard, mid-word)
discards that composition, so the message that actually sent was a fragment of what was typed —
frequently a single letter, arriving at the other person as e.g. `"d"`.

The backend was never at fault: `'d'`, multi-word strings, double spaces and non-ASCII all
round-trip through `POST /api/messages` byte-identical (verified, em-dash included).

Two changes close it from both sides:

- the composer keeps its draft in a ref, so no parent re-render can touch what is being typed;
- the polls now compare the fetched thread against the current one and keep the previous array when
  nothing changed, so a quiet conversation stops re-rendering at all.

### Push registration

`registerForPush()` is called after login, after sign-up, and on app start **when a session already
exists**. Before this, nothing called it — only `unregisterPush()` on sign-out was wired — so no
handset ever registered a device token and the entire push pipeline had no entry point. It is
deliberately not awaited: push is optional and must never delay sign-in.

Registration is skipped without an auth token, so calling it at start-up on a fresh install is a
no-op rather than a 401, and nobody is asked for notification permission before they have signed in.

**Push still needs FCM credentials to work.** The native side has none — there is no
`android/app/google-services.json` and the `com.google.gms.google-services` plugin is not applied, so
Firebase never initializes and Expo cannot mint a token:

```
[push] registration failed: Unable to get Firebase Messaging instance.
Did you configure `googleServicesFile` path in app config?   code: E_REGISTRATION_FAILED
```

To finish it: download `google-services.json` for the Android app from the Firebase console (project
`mobile-9d6dd`, the one `src/utils/firebase.ts` already points at), put it at
`android/app/google-services.json`, add `"googleServicesFile": "./android/app/google-services.json"`
under `expo.android` in `app.json`, then **rebuild and reinstall the dev-client APK** — this is a
native change, so Metro alone will not pick it up. Note `firebase.ts` is the *Web* SDK used for
Storage image uploads; it does nothing for FCM.

### Market helpers live in `constants/market.ts`

`MarketItem`, `categoryEmoji` and `conditionLabel` were defined in `MarketplaceScreen`, which
`ItemCard` imported from — while `MarketplaceScreen` imported `ItemCard`. Metro permits require
cycles but warns, and in dev that warning opened a **full-screen console overlay on top of the
running app**, which repeatedly interrupted the Marketplace screen. They are shared vocabulary
rather than screen state, so they moved to `src/constants/market.ts`. `MarketplaceScreen` re-exports
them for compatibility; import from `constants/market` in new code.
