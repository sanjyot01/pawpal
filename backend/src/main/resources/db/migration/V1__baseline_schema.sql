-- Baseline: the schema as ddl-auto had been generating it up to 2026-08-09.
--
-- Databases that predate Flyway are baselined at this version (see
-- spring.flyway.baseline-on-migrate), so this script does NOT run against them --
-- it exists so a fresh database arrives at exactly the same shape. Anything new
-- goes in V2 onward, which is what makes it apply to both.
--
-- Generated from the JPA metadata with Hibernate's schema exporter, so it matches
-- the entities rather than someone's recollection of them.

create sequence comments_seq start with 1 increment by 50;
create sequence event_attendees_seq start with 1 increment by 50;
create sequence events_seq start with 1 increment by 50;
create sequence friendships_seq start with 1 increment by 50;
create sequence marketplace_items_seq start with 1 increment by 50;
create sequence messages_seq start with 1 increment by 50;
create sequence notifications_seq start with 1 increment by 50;
create sequence partner_invitations_seq start with 1 increment by 50;
create sequence partner_requests_seq start with 1 increment by 50;
create sequence pet_matches_seq start with 1 increment by 50;
create sequence pets_seq start with 1 increment by 50;
create sequence posts_seq start with 1 increment by 50;
create sequence reviews_seq start with 1 increment by 50;
create sequence users_seq start with 1 increment by 50;

create table users (is_active boolean not null, created_at timestamp(6), id bigint not null, match_preferences_mask bigint, bio varchar(1000), avatar_url varchar(255), email varchar(255) not null unique, location varchar(255), name varchar(255) not null, password_hash varchar(255), role varchar(255) not null, primary key (id));
create table pets (date_of_birth date, is_available_for_playdate boolean, is_neutered boolean, is_vaccinated boolean, rating float(53), weight float(53), avatar_emoji varchar(8), created_at timestamp(6), id bigint not null, owner_id bigint not null, updated_at timestamp(6), bio varchar(1000), breed varchar(255), gender varchar(255), name varchar(255) not null, personality_tags varchar(255), preferred_walk_time varchar(255), profile_photo_url varchar(255), size varchar(255), species varchar(255) not null, temperament varchar(255), primary key (id));
create table posts (comment_count integer, like_count integer, share_count integer, created_at timestamp(6), id bigint not null, pet_id bigint, updated_at timestamp(6), user_id bigint not null, content varchar(5000) not null, media_type varchar(255), media_url varchar(255), visibility varchar(255), primary key (id));
create table comments (like_count integer, created_at timestamp(6), id bigint not null, post_id bigint not null, updated_at timestamp(6), user_id bigint not null, content varchar(2000) not null, primary key (id));
create table events (current_attendees integer, latitude float(53), longitude float(53), max_attendees integer, created_at timestamp(6), emoji varchar(8), event_date_time timestamp(6) not null, id bigint not null, organizer_id bigint not null, updated_at timestamp(6), description varchar(3000), cover_photo_url varchar(255), event_type varchar(255), location_name varchar(255), pet_species varchar(255), status varchar(255), title varchar(255) not null, primary key (id));
create table event_attendees (created_at timestamp(6), event_id bigint not null, id bigint not null, pet_id bigint, updated_at timestamp(6), user_id bigint not null, rsvp_status varchar(255) not null, primary key (id), unique (event_id, user_id));
create table friendships (created_at timestamp(6), friend_id bigint not null, id bigint not null, updated_at timestamp(6), user_id bigint not null, status varchar(255) not null, primary key (id), unique (user_id, friend_id));
create table marketplace_items (latitude float(53), longitude float(53), original_price float(53), price float(53) not null, created_at timestamp(6), emoji varchar(8), id bigint not null, seller_id bigint not null, updated_at timestamp(6), description varchar(2000), image_urls varchar(2500), category varchar(255) not null, condition varchar(255), location varchar(255), name varchar(255) not null, photo_url varchar(255), status varchar(255) not null, primary key (id));
create table messages (is_read boolean not null, context_id bigint, created_at timestamp(6), id bigint not null, read_at timestamp(6), receiver_id bigint not null, sender_id bigint not null, content varchar(2000) not null, context_type varchar(255), media_url varchar(255), message_type varchar(255), primary key (id));
create table notifications (is_read boolean not null, created_at timestamp(6), id bigint not null, pet_emoji varchar(8), recipient_id bigint not null, related_id bigint, sender_id bigint, preview varchar(500) not null, category varchar(255) not null, pet_name varchar(255), related_type varchar(255), sender_name varchar(255), primary key (id));
create table partner_invitations (duration_minutes integer, end_latitude float(53), end_longitude float(53), latitude float(53), longitude float(53), max_spots integer, created_at timestamp(6), host_id bigint not null, id bigint not null, invitation_type varchar(8) not null, scheduled_at timestamp(6), updated_at timestamp(6), message varchar(1000), image_urls varchar(2500), host_pet_ids varchar(255), invite_date varchar(255) not null, invite_time varchar(255) not null, place varchar(255) not null, status varchar(255) not null, primary key (id));
create table partner_requests (created_at timestamp(6), id bigint not null, invitation_id bigint not null, request_type varchar(8) not null, requester_id bigint not null, updated_at timestamp(6), status varchar(255) not null, primary key (id), constraint uq_partner_req_inv_requester unique (invitation_id, requester_id));
create table pet_matches (compatibility_score float(53), created_at timestamp(6), id bigint not null, initiated_by_user_id bigint, meeting_date timestamp(6), pet_id_1 bigint not null, pet_id_2 bigint not null, updated_at timestamp(6), notes varchar(1000), match_status varchar(255) not null, match_type varchar(255), primary key (id), unique (pet_id_1, pet_id_2));
create table reviews (rating integer not null, created_at timestamp(6), id bigint not null, pet_id bigint not null, reviewer_id bigint not null, updated_at timestamp(6), comment varchar(1000), primary key (id), unique (reviewer_id, pet_id));

create index idx_comments_post on comments (post_id);
create index idx_comments_user on comments (user_id);
create index idx_event_attendees_event on event_attendees (event_id);
create index idx_event_attendees_user on event_attendees (user_id);
create index idx_events_organizer on events (organizer_id);
create index idx_events_datetime on events (event_date_time);
create index idx_events_type on events (event_type);
create index idx_events_species on events (pet_species);
create index idx_friendships_user on friendships (user_id, status);
create index idx_friendships_friend on friendships (friend_id, status);
create index idx_marketplace_seller on marketplace_items (seller_id);
create index idx_marketplace_category on marketplace_items (category, status);
create index idx_marketplace_status on marketplace_items (status, created_at);
create index idx_sender_receiver on messages (sender_id, receiver_id);
create index idx_receiver_read on messages (receiver_id, is_read);
create index idx_messages_conversation on messages (sender_id, receiver_id, created_at);
create index idx_messages_context on messages (context_type, context_id);
create index idx_notifications_recipient on notifications (recipient_id, created_at);
create index idx_notifications_unread on notifications (recipient_id, is_read);
create index idx_partner_inv_type_status on partner_invitations (invitation_type, status, created_at);
create index idx_partner_inv_host on partner_invitations (host_id, invitation_type);
create index idx_partner_req_invitation on partner_requests (invitation_id, status);
create index idx_partner_req_requester on partner_requests (requester_id, request_type);
create index idx_matches_pet1 on pet_matches (pet_id_1, match_status);
create index idx_matches_pet2 on pet_matches (pet_id_2, match_status);
create index idx_matches_initiator on pet_matches (initiated_by_user_id);
create index idx_pets_owner on pets (owner_id);
create index idx_pets_species on pets (species);
create index idx_pets_playdate on pets (is_available_for_playdate);
create index idx_posts_user on posts (user_id);
create index idx_posts_pet on posts (pet_id);
create index idx_posts_visibility on posts (visibility, created_at);
create index idx_reviews_pet on reviews (pet_id);
create index idx_reviews_reviewer on reviews (reviewer_id);
create index idx_users_role on users (role);

alter table if exists comments add constraint fk_comments_post foreign key (post_id) references posts;
alter table if exists comments add constraint fk_comments_user foreign key (user_id) references users;
alter table if exists event_attendees add constraint fk_event_attendees_event foreign key (event_id) references events;
alter table if exists event_attendees add constraint fk_event_attendees_pet foreign key (pet_id) references pets;
alter table if exists event_attendees add constraint fk_event_attendees_user foreign key (user_id) references users;
alter table if exists events add constraint fk_events_organizer foreign key (organizer_id) references users;
alter table if exists friendships add constraint fk_friendships_friend foreign key (friend_id) references users;
alter table if exists friendships add constraint fk_friendships_user foreign key (user_id) references users;
alter table if exists marketplace_items add constraint fk_marketplace_seller foreign key (seller_id) references users;
alter table if exists messages add constraint fk_messages_receiver foreign key (receiver_id) references users;
alter table if exists messages add constraint fk_messages_sender foreign key (sender_id) references users;
alter table if exists notifications add constraint fk_notifications_recipient foreign key (recipient_id) references users;
alter table if exists notifications add constraint fk_notifications_sender foreign key (sender_id) references users;
alter table if exists partner_invitations add constraint fk_partner_inv_host foreign key (host_id) references users;
alter table if exists partner_requests add constraint fk_partner_req_invitation foreign key (invitation_id) references partner_invitations;
alter table if exists partner_requests add constraint fk_partner_req_requester foreign key (requester_id) references users;
alter table if exists pet_matches add constraint fk_pet_matches_initiator foreign key (initiated_by_user_id) references users;
alter table if exists pet_matches add constraint fk_pet_matches_pet1 foreign key (pet_id_1) references pets;
alter table if exists pet_matches add constraint fk_pet_matches_pet2 foreign key (pet_id_2) references pets;
alter table if exists pets add constraint fk_pets_owner foreign key (owner_id) references users;
alter table if exists posts add constraint fk_posts_pet foreign key (pet_id) references pets;
alter table if exists posts add constraint fk_posts_user foreign key (user_id) references users;
alter table if exists reviews add constraint fk_reviews_pet foreign key (pet_id) references pets;
alter table if exists reviews add constraint fk_reviews_reviewer foreign key (reviewer_id) references users;
