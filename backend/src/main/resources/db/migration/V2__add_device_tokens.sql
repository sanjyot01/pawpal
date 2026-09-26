-- Push-notification targets (Expo/FCM tokens), added 2026-08-09.
--
-- Separate from V1 on purpose: V1 is skipped on databases that predate Flyway, so
-- anything genuinely new has to live in its own version to reach them too.

create sequence device_tokens_seq start with 1 increment by 50;

create table device_tokens (
    active       boolean      not null,
    created_at   timestamp(6),
    id           bigint       not null,
    last_seen_at timestamp(6),
    user_id      bigint       not null,
    platform     varchar(16)  not null,
    token        varchar(512) not null,
    primary key (id),
    constraint uk_device_tokens_token unique (token)
);

-- Delivery looks up a user's live tokens; active is in the index so dead tokens
-- from uninstalls never reach the heap.
create index idx_device_tokens_user on device_tokens (user_id, active);

alter table if exists device_tokens
    add constraint fk_device_tokens_user foreign key (user_id) references users;
