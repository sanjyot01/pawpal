# ERD — Live Database State (2026-06-16)

This reflects the actual current `pet_social_db` schema, introspected directly from Postgres
today — not the intended design in `DATABASE_SCHEMA.md`. Use this to spot drift between what's
documented, what's live, and what the PawPal prototype (`reff/pawpal.pdf`, see
[[pawpal-design-ia]] in memory) actually needs.

## Current live schema

```mermaid
erDiagram
    USERS {
        bigint id PK
        varchar email UK
        varchar name
        varchar role
        boolean is_active
        bigint match_preferences_mask
        timestamp created_at
        boolean is_on_walk "ORPHANED - no entity field maps to this"
        timestamp last_seen "ORPHANED"
        double latitude "ORPHANED - live location now lives in Redis GEO, not Postgres"
        double longitude "ORPHANED"
        varchar password "ORPHANED - no auth system reads/writes this"
        varchar pet_name "ORPHANED - pets have their own table"
        varchar pet_type "ORPHANED"
        uuid user_uuid "ORPHANED"
        bigint capability_mask "ORPHANED - superseded by match_preferences_mask"
    }

    DEVICE_TOKENS {
        bigint id PK
        bigint user_id FK
        varchar token UK "Expo/FCM token - the identity, so re-registering reassigns the owner"
        varchar platform "ANDROID | IOS"
        boolean active "false once the push service reports it dead"
        timestamp created_at
        timestamp last_seen_at
    }

    PETS {
        bigint id PK
        bigint owner_id FK
        varchar name
        varchar species
        varchar breed
        varchar gender
        varchar size
        varchar temperament
        double weight
        date date_of_birth
        boolean is_vaccinated
        boolean is_neutered
        boolean is_available_for_playdate
        varchar bio
        varchar profile_photo_url
        timestamp created_at
        timestamp updated_at
    }

    POSTS {
        bigint id PK
        bigint user_id FK
        bigint pet_id FK "nullable"
        varchar content
        varchar media_url
        varchar media_type
        varchar visibility
        integer like_count
        integer comment_count
        integer share_count
        timestamp created_at
        timestamp updated_at
    }

    COMMENTS {
        bigint id PK
        bigint post_id FK
        bigint user_id FK
        varchar content
        integer like_count
        timestamp created_at
        timestamp updated_at
    }

    EVENTS {
        bigint id PK
        bigint organizer_id FK
        varchar title
        varchar description
        timestamp event_date_time
        varchar event_type
        varchar location_name
        double latitude
        double longitude
        varchar pet_species
        integer max_attendees
        integer current_attendees
        varchar status
        varchar cover_photo_url
        timestamp created_at
        timestamp updated_at
    }

    EVENT_ATTENDEES {
        bigint id PK
        bigint event_id FK
        bigint user_id FK
        bigint pet_id FK "nullable"
        varchar rsvp_status
        timestamp created_at
        timestamp updated_at
    }

    FRIENDSHIPS {
        bigint id PK
        bigint user_id FK
        bigint friend_id FK
        varchar status
        timestamp created_at
        timestamp updated_at
    }

    MESSAGES {
        bigint id PK
        bigint sender_id FK
        bigint receiver_id FK
        varchar content
        varchar media_url
        varchar message_type
        boolean is_read
        timestamp read_at
        timestamp created_at
    }

    PET_MATCHES {
        bigint id PK
        bigint pet_id_1 FK
        bigint pet_id_2 FK
        bigint initiated_by_user_id FK "nullable"
        varchar match_type
        varchar match_status
        double compatibility_score
        timestamp meeting_date
        varchar notes
        timestamp created_at
        timestamp updated_at
    }

    DRIVERS {
        bigint id PK
        varchar name
        varchar vehicle_type "dispatch-era residue"
        bigint capability_mask "dispatch-era residue"
        boolean is_available
        timestamp created_at
    }

    USERS ||--o{ PETS : owns
    USERS ||--o{ DEVICE_TOKENS : "registers (push targets)"
    USERS ||--o{ POSTS : writes
    PETS  |o--o{ POSTS : "featured in"
    POSTS ||--o{ COMMENTS : has
    USERS ||--o{ COMMENTS : writes
    USERS ||--o{ EVENTS : organizes
    EVENTS ||--o{ EVENT_ATTENDEES : has
    USERS ||--o{ EVENT_ATTENDEES : attends
    PETS  |o--o{ EVENT_ATTENDEES : brings
    USERS ||--o{ FRIENDSHIPS : "initiates (user_id)"
    USERS ||--o{ FRIENDSHIPS : "receives (friend_id)"
    USERS ||--o{ MESSAGES : "sends (sender_id)"
    USERS ||--o{ MESSAGES : "receives (receiver_id)"
    PETS  ||--o{ PET_MATCHES : "matched as pet_id_1"
    PETS  ||--o{ PET_MATCHES : "matched as pet_id_2"
    USERS |o--o{ PET_MATCHES : initiates
```

`DRIVERS` has **no foreign keys in or out** — it's fully disconnected from the rest of the graph,
confirming it's pure leftover. No Java entity maps to it anymore.

## Proposed additions (not implemented — from the PawPal prototype review)

```mermaid
erDiagram
    USERS {
        bigint id PK
    }
    MARKETPLACE_LISTING {
        bigint id PK
        bigint seller_id FK
        varchar title
        varchar category "FOOD, TOYS, BEDS, HEALTH"
        varchar condition "NEW, LIKE_NEW, GOOD"
        numeric price
        varchar status "AVAILABLE, SOLD"
        varchar photo_url
        timestamp created_at
    }
    NOTIFICATION {
        bigint id PK
        bigint recipient_id FK
        bigint actor_id FK "nullable"
        varchar type "WALK_REQUEST, MATCH_ACCEPTED, LIKE, MESSAGE, REVIEW, ..."
        varchar related_entity_type "PET_MATCH, MESSAGE, MARKETPLACE_LISTING"
        bigint related_entity_id
        boolean is_read
        timestamp created_at
    }
    USERS ||--o{ MARKETPLACE_LISTING : sells
    USERS ||--o{ NOTIFICATION : receives
    USERS ||--o{ NOTIFICATION : triggers
```

`PET_MATCHES` is strictly pairwise (`pet_id_1`/`pet_id_2`) — it can't represent the prototype's
"2 spots left" group-walk invitations. If that's needed, it'd follow the same pattern already
used for `EVENTS`/`EVENT_ATTENDEES`: a `WALK_INVITATION` host entity plus a `WALK_PARTICIPANT`
join table, rather than forcing it into `PET_MATCHES`. Not drawn here pending the open question
in memory ([[pawpal-design-ia]]) about whether Walk and Blind Date should stay unified under
`PET_MATCHES` or split apart.

## Summary of drift to resolve

| Item | State |
|---|---|
| `drivers` table | Orphaned, safe to drop (no FKs, no entity) |
| 9 `users` columns | Orphaned, safe to drop (confirmed unused in code) |
| Marketplace | No entity exists — needs `MARKETPLACE_LISTING` (+ buyer/seller messaging) |
| Notifications | No entity exists — needs `NOTIFICATION` |
| Group walk invitations | `PET_MATCHES` can't model "N spots" — needs design decision |
| `MESSAGES` context | No FK to the `PET_MATCH`/listing a thread belongs to — open question |