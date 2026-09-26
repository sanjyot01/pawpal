# PawPal — Features Added This Development Session

This document covers the features and fixes built on top of the existing PawPal
codebase (reference: [`huangjIT/capstone` — `feature/sanjyot-db-schema`](https://github.com/huangjIT/capstone/tree/feature/sanjyot-db-schema))
during this session. It's organized by feature area, not by chronological commit,
so it can serve as a changelog for anyone picking the project back up.

Stack: Spring Boot backend (`backend/`), Expo/React Native mobile frontend (`frontend/mobile/`).

---

## Table of Contents

1. [Photo Uploads — Date Invitations](#1-photo-uploads--date-invitations)
2. [Photo Uploads — Marketplace Listings](#2-photo-uploads--marketplace-listings)
3. [Full-Screen Image Viewer](#3-full-screen-image-viewer)
4. [Pet Blind Date Filters (Bug Fix)](#4-pet-blind-date-filters-bug-fix)
5. [Required Pet Health Fields + "Other" Species](#5-required-pet-health-fields--other-species)
6. [Empty-State Guard on Post a Date](#6-empty-state-guard-on-post-a-date)
7. [Block / Unblock on Walk & Date Requests](#7-block--unblock-on-walk--date-requests)
8. [5-Message Cap While a Request Is Pending](#8-5-message-cap-while-a-request-is-pending)
9. [Walk & Date Expiry + "Completed" Views](#9-walk--date-expiry--completed-views)
10. [Direct "Connect" from the Map Screen](#10-direct-connect-from-the-map-screen)
11. [Marketplace: Required Fields (Location + Photo)](#11-marketplace-required-fields-location--photo)
12. [Marketplace: Own Listings Hidden from Browse Feed](#12-marketplace-own-listings-hidden-from-browse-feed)
13. [Marketplace: Pickup Location Now Visible to Buyers (Bug Fix)](#13-marketplace-pickup-location-now-visible-to-buyers-bug-fix)
14. [Marketplace: Sort & Filter (Price, Listed Date)](#14-marketplace-sort--filter-price-listed-date)
15. [Marketplace: $500 Price Cap](#15-marketplace-500-price-cap)
16. [Profile: "Listings" Stat (Replaces Unused "Posts")](#16-profile-listings-stat-replaces-unused-posts)
17. [Infrastructure-Level Fixes](#17-infrastructure-level-fixes)
18. [Push Notifications (Android)](#18-push-notifications-android)
19. [Known Follow-Ups](#19-known-follow-ups)

---

## 1. Photo Uploads — Date Invitations

Hosts can attach up to 5 photos to a blind-date invitation; anyone viewing it can
tap through a full-screen gallery.

**Backend**
- `PartnerInvitation` entity: new `image_urls` column (pipe-separated URL list, capped at 5).
- `PartnerBoardService.InvitationBody`: new `imageUrls` field, wired into `newInvitation()` / `applyCommon()`.
- `DateInvitationResponse`, `DateFeedItemResponse`, `FeedCard`: all carry `imageUrls` through the feed/cache pipeline.

**Frontend**
- `PostDateInvitationScreen.tsx`, `EditDateInvitationScreen.tsx`: photo picker UI (thumbnails, remove button, "Add Photo" tile), uploads via `uploadImage()` on submit.
- `DatePetProfileScreen.tsx`: photo gallery row for anyone browsing a date invitation.

---

## 2. Photo Uploads — Marketplace Listings

Same pattern as above, applied to marketplace items.

**Backend**
- `MarketplaceItem` entity: new `image_urls` column. `photo_url` is kept and always mirrors the first image (backward compatibility for older single-photo consumers like the chat list).
- `MarketService.ItemBody`: new `imageUrls` field.
- `MarketItemResponse`: exposes `imageUrls`.

**Frontend**
- `PostMarketItemScreen.tsx`: multi-photo picker (up to 5), same UX as the date screen.
- `ItemCard.tsx`, `MarketplaceChatScreen.tsx`: gallery display with tap-to-fullscreen.

---

## 3. Full-Screen Image Viewer

New shared component: `src/components/ImageViewerModal.tsx`.

- Horizontal swipeable gallery (`FlatList`, paging) over a dark modal backdrop.
- Page counter ("2 / 5") and close button — both rendered as solid dark pills so they stay legible regardless of the photo behind them (fixed after an initial low-contrast pass).
- Reused across Date invitations, Marketplace listings, and anywhere else photos are shown.

---

## 4. Pet Blind Date Filters (Bug Fix)

**Problem:** the Species / Age / Vaccine / Breed filter chips on the Pet Blind Date
screen sent the right query params, but the backend's `/api/date/invitations/feed`
endpoint only ever read `lat`/`lng` — every other filter was silently ignored.

**Fix**
- `DateController.feed()`: now accepts `species`, `age`, `vaccine`, `breed` query params.
- `PartnerBoardService`: new `matchesDateFilters()` (species/breed/vaccination match) and `ageBucket()` (buckets a pet's formatted age like `"2y"`/`"5mo"` into the UI's `0-1y` / `1-3y` / `3-7y` / `7y+` ranges) applied to `dateFeed()`.

---

## 5. Required Pet Health Fields + "Other" Species

**Add/Edit Pet screens** (`AddPetScreen.tsx`, `EditPetScreen.tsx`):

- **Species** now offers `Dog / Cat / Other`. For `Other`, the breed field switches from the curated `BreedPicker` to a free-text input (e.g. "Rabbit", "Parrot").
- **Vaccinated** and **Neutered/Spayed** are no longer booleans that silently default to "No" — they're `boolean | null`, rendered as explicit Yes/No toggles, and submission is blocked with an alert until both are answered. Existing pets with a real (non-null) value aren't forced to re-answer; only pets where the field was never set will show as unanswered.

---

## 6. Empty-State Guard on Post a Date

**Problem:** a user with zero pets could fill out the entire "Post a Date" form and
only discover at submit time that a pet selection was required.

**Fix** (`PostDateInvitationScreen.tsx`):
- If the signed-in user has no pets, the screen shows an "Add a pet first" state with a button straight to Add Pet, instead of the form.
- Pet list now refetches on every screen focus (`useFocusEffect` instead of a mount-only `useEffect`), so returning from Add Pet immediately shows the real form with the new pet pre-selected.

---

## 7. Block / Unblock on Walk & Date Requests

**Backend** (`PartnerBoardService.updateRequestStatus`):
- New allowed transition: `BLOCKED → PENDING` ("unblock"), but *only* as that specific transition — any other attempt to set a request back to `PENDING` is rejected. This keeps "unblock" from being usable as a general status reset.
- Also fixed a latent Hibernate lazy-loading crash: the host-side participant check (`request.getInvitation().getHostId()`) required an active transaction to safely traverse the lazy `PartnerRequest → PartnerInvitation → User` chain; the method is now `@Transactional`.

**Frontend** (`WalkRequestDetailScreen.tsx` — shared by both Walk and Date request detail views):
- When the host views a request they've blocked, an "Unblock User" button now appears alongside the "⊘ User Blocked" status. Confirms via alert, then reopens the request to `PENDING` (chat re-enables, Accept/Deny/Block reappears).

---

## 8. 5-Message Cap While a Request Is Pending

Requesters and hosts can exchange up to 5 messages in a walk/date request thread
while it's still `PENDING`; the cap lifts once the host accepts.

**Backend** (`MessageController.send()`):
- For `WALK_REQUEST` / `DATE_REQUEST` threads, if the underlying `PartnerRequest` is still `PENDING` and the thread already has ≥5 messages, the send is rejected (403) with a clear message.
- Same lazy-loading fix as above applied here (`@Transactional`), since the participant/status check needs to walk the same entity graph.

---

## 9. Walk & Date Expiry + "Completed" Views

Once an invitation's scheduled date/time has passed (compared against the real
server clock, not just a display string), it stops being joinable and moves into
a "Completed" view for the people it's actually relevant to.

**Backend**
- `PartnerInvitation`: new `scheduled_at` column (`LocalDateTime`), parsed from the existing `date`/`time` display strings (`EEE, MMM d, yyyy` + `h:mm a`) whenever an invitation is created or updated. Older rows created before this change simply have `scheduled_at = null` and are treated as "not expired" until next edited.
- `isExpiredInvitation()`: generalized expiry check (works for both Walk and Date; originally Walk-only, later extended to Date on request).
- Expired invitations are excluded from the browse feed (`buildBaseFeed`) and from the host's own active list (`myWalkInvitations` / `myDateInvitations`).
- `createRequest()` rejects new join/date requests against an already-expired invitation.
- New `completedWalks(userId)` / `completedDates(userId)` — returns every invitation the caller hosted (always, even with zero participants) plus every one they were accepted into, newest-first. New DTOs: `CompletedWalkResponse`, `CompletedDateResponse`.
- New endpoints: `GET /api/walk/invitations/completed`, `GET /api/date/invitations/completed`.

**Frontend**
- New screens: `CompletedWalksScreen.tsx`, `CompletedDatesScreen.tsx` — role badge ("You hosted" / "You joined"), who's going, empty state.
- `FindPartnersScreen.tsx` / `PetBlindDateScreen.tsx`: "✓ Completed" button added next to "Post New"/"Post Date".
- Registered in `TabNavigator.tsx` with the tab bar hidden on these screens, matching the app's existing detail-screen convention.

---

## 10. Direct "Connect" from the Map Screen

**Problem:** tapping a pet's pin on the Map screen only opened a native map callout, which then navigated into the Walk tab's own screen stack just to send a request — an extra hop, and it also left the Walk tab "stuck" on that profile screen afterward (a React Navigation nested-stack side effect).

**Fix** (`HomeMapScreen.tsx`):
- Tapping a marker (or a card in the "Nearby Walking Partners" strip) now opens a compact panel directly in the map's bottom sheet: pet/owner info, route, distance, and a **Connect →** button that sends the walk request immediately (switches to "✓ Requested" once sent).
- Deliberately does **not** navigate into the Walk tab — avoids leaving that tab's navigation stack in an unexpected state.

---

## 11. Marketplace: Required Fields (Location + Photo)

`PostMarketItemScreen.tsx` previously allowed submitting with no pickup location
and no photo. Both are now required:

- **Frontend**: validation collects *all* missing/invalid fields at once and shows them inline under each field (name, price, photos, location) — one submit attempt surfaces everything wrong, instead of a popup-per-error loop.
- **Backend** (`MarketService.validate()`): mirrors the same two checks server-side.

---

## 12. Marketplace: Own Listings Hidden from Browse Feed

**Problem:** the browse feed (`/api/market/items`) never excluded the caller's own
listings, so sellers could see (and attempt to message) themselves from the main
feed — confusing, and the app already has a separate "My Listings" section for
managing your own items.

**Fix** (`MarketService.listItems()`): filters out the caller's own items from the browse feed.

---

## 13. Marketplace: Pickup Location Now Visible to Buyers (Bug Fix)

Sellers have always been able to enter a pickup location, and the backend saved
it correctly — but no buyer-facing screen ever rendered it.

**Fix**: added a `📍 {location}` line to `ItemCard.tsx` (feed grid) and the item
details card in `MarketplaceChatScreen.tsx` (the chat/detail view).

---

## 14. Marketplace: Sort & Filter (Price, Listed Date)

New "⚙ Sort & Filter" button on `MarketplaceScreen.tsx`, opening a bottom sheet:

- **Sort by**: Newest (default) / Price: Low to High / Price: High to Low.
- **Price range**: min/max $.
- **Listed between**: from/to date range, filtering by when the item was posted.

Applied client-side over the already-fetched feed (consistent with the existing
condition filter). Backend addition: `MarketItemResponse` now exposes `createdAt`
(ISO string) so the listed-date filter has something to filter on.

---

## 15. Marketplace: $500 Price Cap

This is a casual pet-gear marketplace, not general classifieds — the **selling
price** is capped at $500. `originalPrice` (what the item cost new) is informational
only and is *not* capped.

- **Backend** (`MarketService.validate()`): rejects `price > 500`.
- **Frontend** (`PostMarketItemScreen.tsx`): same cap, surfaced inline; field label updated to "Price ($, max 500)".

---

## 16. Profile: "Listings" Stat (Replaces Unused "Posts")

**Problem:** the Me tab's activity stats showed a "Posts" count backed by an
unrelated `Post` entity that has no corresponding feature anywhere in the app.

**Fix**:
- **Backend** (`MeController.stats()`): now returns `listings` — a count of the
  user's marketplace items where `status != WITHDRAWN`. Active and sold listings
  both count; withdrawing (removing) a listing is the only thing that decrements it.
  New repository method: `MarketplaceItemRepository.countBySeller_IdAndStatusNot()`.
- **Frontend** (`MeProfileScreen.tsx`): tile relabeled "Listings". The unused
  "Friends" stat (no friend-request feature exists anywhere in the app to back it)
  was also removed from this screen.

---

## 17. Infrastructure-Level Fixes

A few smaller fixes that don't warrant their own section but are worth knowing about:

- **`api.ts` empty-body crash**: `apiPost`/`apiGet`/`apiPut`/`apiDelete` all called
  `JSON.parse(text)` unconditionally. Any endpoint returning `204 No Content` (e.g.
  every delete) crashed the app with a JSON parse error *after* the delete had
  already succeeded server-side. Fixed with a `parseBody()` helper that treats an
  empty response as success-with-no-payload.
- **Two Hibernate lazy-loading crashes** ("could not initialize proxy — no session"),
  both from the same root cause: the app deliberately runs with `open-in-view: false`,
  so any method that touches a lazy `@ManyToOne` association *after* its originating
  repository call has returned needs to be `@Transactional` itself. Fixed in
  `updateRequestStatus()` (surfaced via Accept/Deny/Block) and `MessageController.send()`
  (surfaced via messaging the host of a request).

---

## 18. Push Notifications (Android)

**What it does.** An OS-level notification arrives on the recipient's handset when someone
messages them or acts on a walk/date request — even with the app backgrounded or closed.

**Verified end to end**, not merely wired: message sent from a second account, app
backgrounded, notification delivered to the tray with the correct sender name and body.

### How it flows

```
event  ->  Kafka (app-events)  ->  PushNotificationService  ->  Expo push service  ->  FCM  ->  device
```

Notably the backend does **not** talk to Firebase directly. It posts to
`https://exp.host/--/api/v2/push/send` and Expo relays to FCM. That keeps one token format and
one payload shape across Android and iOS, and keeps FCM's OAuth2 token exchange out of the
backend. FCM is still the transport — Expo is a relay in front of it, not an alternative.

Sending happens on the Kafka consumer thread, never a request thread, so a slow push service
cannot occupy Tomcat workers.

### Client

| Piece | Where |
|---|---|
| Permission, Android channels, token retrieval | `src/utils/push.ts` |
| Registration on login / sign-up / warm start | `App.tsx`, `LoginScreen`, `SignUpScreen` |
| Token retirement on sign-out | `MeProfileScreen` → `unregisterPush()` |

`registerForPush()` is **not awaited** — push is optional and must never delay sign-in. It also
no-ops without an auth token, so a cold start on a fresh install neither 401s nor prompts for
notification permission before the user has signed in.

### Backend

- `POST /api/notifications/device-token` — claims a token for the caller. Idempotent: an
  existing token is reassigned and reactivated rather than duplicated, so a shared handset
  stops receiving the previous account's notifications.
- `DELETE /api/notifications/device-token` — deactivates on logout (kept, not deleted, so
  delivery history stays readable). Only the owning user may retire a token.
- `PushNotificationService` reads Expo's delivery receipts and deactivates tokens reported
  dead (app uninstalled, token rotated), and exports counters for delivery and pruning.

### Configuration required

Push needs credentials in **two** places, and missing either fails silently in a different way:

1. **`android/app/google-services.json`** — lets the device obtain a token at all. Wired via
   `"googleServicesFile"` in `app.json`; `expo prebuild` places the file and applies the
   `com.google.gms.google-services` Gradle plugin. Without it Firebase never initialises and
   the client logs `E_REGISTRATION_FAILED`.
2. **An FCM V1 service account key uploaded to the Expo project** (`eas credentials` →
   Android → Google Service Account). Without it the backend sends successfully, Expo accepts,
   and delivery dies at Expo with *"Unable to retrieve the FCM server key."*

Because (1) is compiled into the app, **adding it requires an APK rebuild** — Metro alone will
not pick it up.

### Two defects this feature surfaced

- **A concurrency bug in token registration.** `register()` looked a token up and inserted if
  absent — a check-then-act race. The client registers on launch *and* after login; when those
  overlap both miss and both insert, and the loser hit the unique constraint and 500'd. Now
  caught and retried outside the rolled-back transaction. See
  [`backend/DEBUGGING_LOG.md`](backend/DEBUGGING_LOG.md) §7.
- **Tokens are scoped to an Expo project.** An account holding tokens minted under two
  different Expo projects makes Expo reject the whole batch
  (`PUSH_TOO_MANY_EXPERIENCE_IDS`), so one stale row silently blocks *every* notification to
  that user. Worth hardening: group by project before sending, or retire mismatched tokens on
  that error.

---

## 19. Known Follow-Ups

- `PartnerInvitation.endLatitude` / `endLongitude` (a walk's route destination) are
  captured on the backend and sent from `PostInvitationScreen.tsx`, but there's no
  UI currently rendering them — a "show the actual route on a map" feature was
  scoped down to just the existing text-based location display per product decision.
  The data is there if that's revisited later.
- ~~Push notifications~~ — **shipped, see [§18](#18-push-notifications-android).** Delivered
  end to end on a physical-equivalent device (Pixel 3 emulator with Play Services).
