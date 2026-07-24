# Migrations

The complete `0001`–`0079` changelog, plus the rules for adding the 80th.

## Overview

79 SQL files in `supabase/migrations/`, numbered sequentially, applied in filename order. They are the **only** definition of the schema — there is no ORM, no schema dump, and `types/database.ts` is hand-maintained to match.

Four rules govern the directory:

1. **Sequential numbering, `00NN_description.sql`.** Never a gap, never a duplicate number.
2. **Never edit an applied migration.** A correction is always a new file — see `0078` → `0079` below for the canonical example.
3. **`alter type ... add value` gets its own file, alone.** Nothing else in that file may reference the new value.
4. **Every function correction is a full `create or replace function`,** pulled from the live definition (`select prosrc from pg_proc where proname = ...`) rather than hand-reconstructed. 0050's comment records why: a hand-reconstruction once differed from the real function in five ways.

Related: [Data model](01-data-model.md) · [Security & RLS](02-security-rls.md) · [Environments & release](10-environments-and-release.md) · [Engineering pitfalls](12-engineering-pitfalls.md)

## Changelog

### Era 1 — MVP foundation (0001–0015)

| # | File | What | Why |
| --- | --- | --- | --- |
| 0001 | `init` | `profiles`, `clubs`, `club_role`, `club_members`, `calendar_event_type`, `calendar_events`, `channels`, `message_type`, `messages`, `message_reactions`; 3 indexes | The MVP schema |
| 0002 | `functions_triggers` | `handle_new_user`, `handle_new_club`, `join_club_by_code` RPC | Profile on signup, admin+channel on club creation, code join without exposing `clubs` |
| 0003 | `rls` | RLS on 7 tables; `is_club_member`, `is_club_admin`, `is_channel_member`, `is_channel_admin`; all base policies | Membership checks as definer functions to avoid self-recursion |
| 0004 | `grants` | Explicit `grant`s + `alter default privileges` | "Auto-expose new tables" defaults differ between local and hosted |
| 0005 | `realtime` | `messages`, `message_reactions` → `supabase_realtime` | Without it, inserts work but nobody is notified |
| 0006 | `join_requests` | `club_join_policy` enum, `clubs.join_policy`, `club_join_requests`; `search_clubs`, `join_or_request_club`, `decide_join_request` | Search-by-name join, gated per club. Replaces what would have been an "invite only" tier |
| 0007 | `system_message_type` | `message_type += 'system'` | **Alone in its own file** — first instance of the enum rule |
| 0008 | `membership_chat_events` | `log_member_added`, `log_member_removed` + triggers | Hook the table, not each call site, so every join path posts the same message |
| 0009 | `profile_bio` | `profiles.bio` | |
| 0010 | `avatar_storage` | Public `avatars` bucket + 4 policies | Public so `<Image>` works without signing |
| 0011 | `profile_details` | `profiles.city`, `date_of_birth`, `school` | |
| 0012 | `role_change_chat_events` | `log_member_role_changed` + trigger | Handles both directions even though only promote was reachable |
| 0013 | `club_avatar` | `clubs.avatar_url` | No RLS change — existing UPDATE policy covers any column |
| 0014 | `club_avatar_storage` | Public `club-avatars` bucket | Separate from `avatars` because ownership is "club admin", not "the uploader" |
| 0015 | `routines` | `routine_activity_type` (10 values), `routine_workouts` + RLS | Dated per real week, not a repeating template. No structured exercise table, by explicit scoping call |

### Era 2 — Races & Eboard (0016–0024)

| # | File | What | Why |
| --- | --- | --- | --- |
| 0016 | `races` | `races`, `race_members`, `race_join_requests`; `is_race_admin`/`is_race_member`/`is_race_club_member`; `channels.race_id` + 2 partial unique indexes; generalizes `is_channel_member`/`is_channel_admin`; re-patches 0008/0012's channel lookup; `handle_new_race`, `log_race_member_added`; `request_join_race`, `decide_race_join_request` | Races as mini-clubs reusing `channels`/`messages` wholesale. The channel-lookup re-patch was mandatory: a club could now have >1 channel |
| 0017 | `eboard` | `eboard_channels` (unique per club), members, join requests; `is_eboard_club_admin`/`is_eboard_member`/`is_user_club_admin`; `channels.eboard_channel_id`, re-scopes `channels_one_per_club`, adds `channels_one_per_eboard`; third branch in both channel helpers; re-patches the 3 log functions **again**; `handle_new_eboard_channel`, `log_eboard_member_added`; `request_join_eboard_channel`, `decide_eboard_join_request` | Private admin-only mini-club. Deliberately asymmetric to races: admin status grants visibility only, and approval rights belong to existing members |
| 0018 | `eboard_meetings` | `eboard_meetings` + RLS (any member CRUD) | |
| 0019 | `eboard_meetings_creator_edit` | UPDATE → creator-only | Founder follow-up |
| 0020 | `eboard_meetings_creator_delete` | DELETE → creator-only | Second follow-up |
| 0021 | `race_car_groups` | `race_car_groups`, `race_car_group_members` (`unique(race_id, user_id)`); `is_user_race_participant`; `clear_incharge_on_member_removed`; `set_car_group_incharge` RPC | `race_id` denormalized onto members purely to enforce one-group-per-person-per-race |
| 0022 | `race_car_groups_delete` | Missing DELETE policy | Add shipped, delete didn't |
| 0023 | `race_links` | `races.photos_link`, `results_link` | Two nullable columns, no new table, no new RLS |
| 0024 | `race_location_info` | `races.info_description`, `location_link`, `hotel_link` | Same shape |

### Era 3 — Polls, moderation, hardening (0025–0030)

| # | File | What | Why |
| --- | --- | --- | --- |
| 0025 | `polls` | `polls`, `poll_options` (denormalized `vote_count`), `poll_votes`; `can_access_poll`/`is_poll_creator`/`is_poll_private`/`is_poll_closed`; `update_poll_option_vote_count` triggers; `cast_vote` RPC (**invoker**, never `INSERT...RETURNING`) | `vote_count` is denormalized because RLS is row-level — no way to show a count while hiding voters from the same row |
| 0026 | `indexes` | 6 FK indexes filtered directly with no PK/unique coverage | |
| 0027 | `message_photos_storage` | **Private** `message-photos` bucket, gated by `is_channel_member` on the path's first segment | Chat content must not be readable from a guessable URL |
| 0028 | `account_deletion` | `delete_account()` — anonymize `profiles` + `auth.users.banned_until` | ~15 FKs reference `profiles.id` with no cascade; a hard delete would need a product call per FK |
| 0029 | `message_reports` | `message_reports` + RLS, `channel_id` denormalized | Apple Guideline 1.2. Report + delete only, no user blocking |
| 0030 | `message_soft_delete` | `messages.deleted_at` | Tombstone instead of vanishing mid-conversation. Goes through the existing UPDATE policy; the DELETE policy is left in place, unused |

### Era 4 — Notifications (0031–0037)

| # | File | What | Why |
| --- | --- | --- | --- |
| 0031 | `notifications_core` | `notification_type` (13 values), `notifications` + RLS (no INSERT policy) + realtime; `channel_reads`; `fetch_unread_channel_summaries()` | `target_path` as a literal route string, not per-type FKs. Chat unread computed live, never stored |
| 0032 | `notification_triggers_membership` | Re-creates the 5 `log_*` functions to also insert notifications; extends the 3 `decide_*_join_request` RPCs; adds the transaction-local `clubchat.skip_add_notify` guard | Without the guard, an approval fires both "approved" and "added by" |
| 0033 | `notification_triggers_requests` | 3 new `notify_*_join_request` triggers, `insert or update of status when pending` | Catches fresh requests and re-requests, never the decision transition |
| 0034 | `notification_triggers_creation` | `notify_poll_created`, `notify_event_created`, `notify_race_created`, `notify_meeting_created`, `notify_announcement` | Every one of these is a plain client insert, so a trigger is the only hook point |
| 0035 | `notifications_persistent_requests` | `notifications.resolved_outcome`; `decide_*` now UPDATE rather than DELETE the inbox notification | Decided requests stay as history, tagged Approved/Denied |
| 0036 | `fix_announcement_notify_race_cast` | Explicit `::notification_type` casts in `notify_announcement` | **Real bug:** race-channel announcements always 400'd. `SELECT DISTINCT` forces the literal to `text`, defeating the implicit unknown→enum cast |
| 0037 | `race_members_delete` | Missing DELETE policy on `race_members` | Same gap class as 0022 |

### Era 5 — Poll scoping & the role hierarchy (0038–0052)

| # | File | What | Why |
| --- | --- | --- | --- |
| 0038 | `polls_scope_and_deadline` | `polls.closes_at`/`race_id`/`eboard_channel_id` + 2 indexes; 3-way `can_access_poll`; `is_poll_closed` gains the deadline; **inline `CASE`** SELECT policy; 3-way INSERT policy; `cast_vote` deadline check; scope-aware `notify_poll_created` | Discovered the second `INSERT...RETURNING` gotcha — see [Engineering pitfalls](12-engineering-pitfalls.md) |
| 0039 | `eboard_members_delete` | Missing DELETE policy on `eboard_channel_members` | Same gap class as 0022/0037 |
| 0040 | `club_eboard_delete` | Delete Club (creator-only), Delete Eboard channel (members-only) | |
| 0041 | `admin_race_eboard_membership_sync` | `is_club_creator`/`is_race_club_creator`/`is_eboard_club_creator`; `handle_new_race`/`handle_new_eboard_channel` bulk-add every admin (and fix a channel-before-members ordering bug); `handle_admin_role_membership_sync`; creator-only removal policies | Race half reversed by 0044; Eboard half survives |
| 0042 | `club_role_owner_enum` | `alter type club_role add value 'owner'` | **Alone in its own file** after a real `supabase db reset` failure |
| 0043 | `club_role_owner` | Backfill creators → owner; `one_owner_per_club` partial unique index; `is_club_admin` widened to `('admin','owner')`; `is_club_owner`/`is_eboard_club_owner`; full `club_members` UPDATE/DELETE permission matrix; `transfer_ownership()`; owner-based Delete Club; tier-aware `handle_admin_role_membership_sync`; `handle_club_member_removed_membership_sync`; Eboard membership backfill; drops the creator helpers | Real 3-tier hierarchy replacing the implicit, non-transferable `created_by` concept |
| 0044 | `race_channel_rework` | `handle_new_race` drops the bulk-add; `is_channel_member` race branch → `is_race_member` only; `is_channel_admin` race branch → member AND admin; `race_members` DELETE simplified; `is_user_race_participant` drops its club-admin fallback; `request_join_race` stops short-circuiting for managers | Reverses 0041's race auto-membership. Admin = management authority, not access |
| 0045 | `race_eboard_avatars` | `races.avatar_url`, `eboard_channels.avatar_url`; `race-avatars` + `eboard-avatars` buckets; the `eboard_channels` UPDATE policy that never existed | |
| 0046 | `fix_club_join_request_target_path` | `club_join_request` path → `/club-profile/members`; `notify_club_join_request`/`notify_race_join_request` → `role in ('admin','owner')` | **Two real bugs.** Since 0043, a lone-Owner club got zero join-request notifications |
| 0047 | `poll_closing_soon_enum` | `notification_type += 'poll_closing_soon'` | Alone in its own file |
| 0048 | `poll_closing_soon_notify` | `create extension pg_cron`; `polls.closing_soon_notified_at`; `notify_polls_closing_soon()`; named 1-minute cron job. Also fixes the 3rd/4th instance of 0046's role-filter bug | The app's only scheduled job — a deadline has no row event to trigger on |
| 0049 | `race_polls_member_only` | `can_access_poll` and both `polls` policies: race branch → `is_race_member` (SELECT) / member AND admin (INSERT); race audiences narrowed in `notify_poll_created` and `notify_polls_closing_soon` | Race polls now match Eboard's model. Fixing `can_access_poll` alone also fixes `poll_options`/`poll_votes` RLS — the payoff of one shared function |
| 0050 | `race_announcement_member_only` | `notify_announcement` race audience → `race_members` only | Last remaining "race_members ∪ club admins" audience, confirmed via a `pg_proc` grep |
| 0051 | `chat_caught_up_enum` | `notification_type += 'chat_caught_up'` | Alone in its own file |
| 0052 | `chat_caught_up_notify` | `mark_channel_read_and_log(p_channel_id)` — computes unread **before** advancing `channel_reads`, inserts an already-read notification | The app's first RPC-driven (not trigger-driven) `notifications` insert |

### Era 6 — Join policy & mentions (0053–0060) *— never back-filled into the old SPEC.md changelog*

| # | File | What | Why |
| --- | --- | --- | --- |
| 0053 | `club_join_policy_auto_approve` | `handle_club_join_policy_opened` + trigger on `clubs after update of join_policy when (new = 'open')` | Flipping request → open auto-approves every pending request, instead of leaving them stuck with no approval step to reach. Implemented as a trigger so it holds for any future call site |
| 0054 | `fix_decide_join_request_target_path` | `decide_join_request` re-created with the `/club-profile/members` path | **Real bug:** 0046 changed what `notify_club_join_request` inserts but not what `decide_join_request` matches. From 0046 to 0054, approving a club request left the admin's notification permanently unresolved and unread. Race/Eboard checked and unaffected |
| 0055 | `mention_notification_type` | `notification_type += 'mentioned'` | Alone in its own file |
| 0056 | `message_mentions_notify` | `notify_message_mentions` — parses `@[Name](uuid)` tokens out of `messages.body` on insert; 3-way scope branch; skips users who can't access the channel | First mention design |
| 0057 | `message_mentions_notify_clean_snippet` | Strips mention markup to plain `@Name` before truncating the snippet | **Real bug:** raw tokens leaked verbatim into notification text |
| 0058 | `message_mentions_table` | `message_mentions` table + RLS (mirrors `message_reactions`) | **Redesign replacing 0055–0057's embedding approach.** The markup was visible in the composer while typing, and a plain RN `TextInput` can't style part of its own value. Body now holds plain `@Full Name`; who was mentioned is a side table |
| 0059 | `message_mention_notify` | Drops 0056/0057's trigger+function; adds `notify_message_mention_row` on `message_mentions after insert` | Fires per mention row instead of per message |
| 0060 | `message_mentions_realtime` | `message_mentions` → `supabase_realtime` | Mentions are a second insert after the message, so a receiver's `messages` event can arrive before the mention row exists |

### Era 7 — News, attachments, chat cards (0061–0071)

| # | File | What | Why |
| --- | --- | --- | --- |
| 0061 | `club_posts` | `club_posts` + RLS (any admin CRUD, bound to the row's own `club_id`) | News & Highlights, deliberately separate from chat pins/announcements |
| 0062 | `club_post_photos_storage` | Private `club-post-photos` bucket | Same shape as 0027 |
| 0063 | `club_post_reactions` | Mirrors `message_reactions` exactly | |
| 0064 | `news_post_notification_type` | `notification_type += 'news_post_created'` | Alone in its own file |
| 0065 | `club_post_notify` | `notify_news_post_created` + trigger | |
| 0066 | `message_type_document` | `message_type += 'document'` | Alone in its own file |
| 0067 | `message_documents_columns` | `messages.document_name`, `document_size_bytes` | `media_url` is reused as-is for the path |
| 0068 | `message_documents_storage` | Private `message-documents` bucket | Identical shape to `message-photos` |
| 0069 | `chat_poll_event_message_type` | `message_type += 'poll'`, `+= 'event'` | **Both in one file** — neither is *used* within this migration, and the restriction only bites on use |
| 0070 | `messages_poll_event_refs` | `messages.poll_id`, `event_id`, both `on delete cascade` | Deleting the poll/event removes its card instead of leaving a dead link |
| 0071 | `poll_event_chat_messages` | `post_poll_chat_message`, `post_event_chat_message` + triggers | Card appears regardless of entry point. Club-scoped only "for now" |

### Era 8 — Auto-Eboard, self-leave, pins (0072–0079) *— 0072–0075 never back-filled either*

| # | File | What | Why |
| --- | --- | --- | --- |
| 0072 | `eboard_auto_create` | `handle_new_club` re-created (2nd time) to also insert an `eboard_channels` row; backfill for every existing club without one | Every club gets Eboard & Council automatically. **Order matters** — the owner's `club_members` row must exist first, or `handle_new_eboard_channel`'s bulk-add excludes them from their own club's Eboard |
| 0073 | `car_group_incharge_left_enum` | `notification_type += 'car_group_incharge_left'` | Alone in its own file |
| 0074 | `leave_race_and_eboard` | `race_members` and `eboard_channel_members` gain `user_id = auth.uid()` DELETE policies (permissive, alongside the admin ones); `clear_incharge_on_member_removed` extended to notify the club's Admins/Owner when the leaver was Incharge | Self-leave existed for clubs since 0043 but never for races/Eboard — and Eboard's only DELETE policy *explicitly excluded* self. Leaving the club entirely already cascaded correctly via 0043's trigger |
| 0075 | `leave_car_group_self` | `race_car_group_members` gains a self-delete policy | **Real bug found via RLS impersonation while verifying 0074:** `removeRaceMember` deletes the car-group row first, but that table's only DELETE policy was `is_race_admin` — a plain member leaving a race silently affected 0 rows (RLS mismatch, no error) and left a stale row behind |
| 0076 | `meeting_message_type_enum` | `message_type += 'meeting'` | Alone in its own file |
| 0077 | `race_eboard_poll_meeting_chat_messages` | `messages.meeting_id`; `post_meeting_chat_message` + trigger; `post_poll_chat_message` generalized to route into the race's/Eboard's own channel | Closes 0071's club-only carve-out now that race/Eboard chat have their own "+" poll shortcut |
| 0078 | `race_pinned` | `races.pinned boolean` | **Wrong model** — treated pinning as a shared admin-set flag |
| 0079 | `race_pins_per_user` | Drops `races.pinned`; creates `race_pins` (`race_id`, `user_id`, `created_at`) with a single `for all ... user_id = auth.uid()` policy | Pinning is personal curation. **The canonical never-edit-in-place example**: 0078 was superseded by a new migration one number later, not amended |

## Workflow

### Adding a migration

```bash
# 1. Next sequential number, descriptive snake_case name
supabase/migrations/0080_thing_you_are_adding.sql

# 2. Apply from scratch (DESTRUCTIVE — see warning below)
supabase db reset

# 3. Update types/database.ts by hand to match
npx tsc --noEmit
```

Write a header comment explaining **why**, not what — every file in this directory does, and that narrative is the reason 0038's and 0075's root causes are recoverable at all.

### The `alter type ... add value` rule

`alter type ... add value` **cannot be used later in the same transaction** when the enum type already existed before that transaction started. `supabase db reset` runs each migration file as one transaction (unlike a plain `psql -f`, which is autocommit-per-statement and masks this — the restriction was verified against the wrong scenario the first time).

Postgres raises `unsafe use of new value "owner" of enum type club_role (SQLSTATE 55P04)` the moment a later statement in the same transaction uses it. This produced a real `supabase db reset` failure and forced 0042 to be split out of 0043.

**Rule:** a new enum value goes in its own migration file with nothing else in it — unless the value is not *used* anywhere in that same file, which is why 0069 could add `'poll'` and `'event'` together.

Files following this rule: 0007, 0042, 0047, 0051, 0055, 0064, 0066, 0073, 0076. Exception: 0069.

### Correcting an applied migration

Never edit it. Write a new one:

- **Schema:** a fresh `alter table` (0079 drops what 0078 added).
- **Function:** a full `create or replace function` — same signature, same body, one line changed. This is the technique used by 0016, 0017, 0032, 0036, 0038, 0043, 0044, 0046, 0048, 0049, 0050, 0054, 0057, 0072, 0077.
- **Policy:** `drop policy "old name" on t;` then `create policy`. Postgres has no `alter policy ... using` that preserves the rest.

Pull the current function source from the database (`select prosrc from pg_proc where proname = 'notify_announcement'`) before rewriting it, rather than reconstructing from the last migration that touched it — a function may have been re-created several times since.

### Applying one migration to a live local DB without a reset

```bash
docker exec supabase_db_Club_Chat psql -U postgres -d postgres \
  -f supabase/migrations/0080_thing.sql

# then register it by hand so `supabase db reset` still replays cleanly later
docker exec supabase_db_Club_Chat psql -U postgres -d postgres -c \
  "insert into supabase_migrations.schema_migrations (version, name) values ('0080', 'thing');"
```

Note that `psql -f` is autocommit-per-statement, so an enum `add value` followed by a use of it will **succeed here and fail on the next `db reset`**. Always confirm a new migration survives a full reset.

### ⚠️ `supabase db reset` is destructive

It wipes local Postgres and rebuilds from migrations. The local DB is **not just fixtures** — it accumulates real usage data (real clubs, messages, accounts) between sessions. Don't run it against a database you haven't confirmed is disposable.

### Moving to a hosted project

Run the files in the SQL Editor in order (`0001` → latest), then swap the two `EXPO_PUBLIC_SUPABASE_*` values in `.env`. See [Environments & release](10-environments-and-release.md).

## Invariants

1. **Migrations are append-only.** Never edit an applied file; a correction is a new file.
2. **Numbering is sequential with no gaps or duplicates.**
3. **`alter type ... add value` is alone in its file** unless the value is unused within that file.
4. **A new table's migration includes all four policies** — SELECT, INSERT, UPDATE, DELETE — or an explicit comment saying why one is omitted. Four separate migrations (0022, 0037, 0039, 0075) exist solely to add a forgotten DELETE policy.
5. **`types/database.ts` is updated in the same change** as any migration touching a table shape or enum.
6. **Every new migration is verified with a full `supabase db reset`,** not just a direct `psql -f` apply.
7. **Function re-creations are pulled from the live definition,** not reconstructed from the last migration file.

## Known gaps

- **No down migrations.** Rolling back means writing a forward migration that undoes the change.
- **No migration tests.** Correctness is verified by `supabase db reset` succeeding plus manual/Playwright checks.
- **`types/database.ts` drift is undetectable** — nothing compares the hand-written type against the real schema, and an omitted `Relationships: []` or `Functions: {}` resolves query types to `never` silently rather than erroring.
- **Backfills are embedded in migrations** (0043's Eboard membership sweep, 0072's Eboard creation) and are not idempotent by design beyond their `on conflict do nothing` guards.
- **No hosted deployment has ever run these files end to end** against production data; the only full-sequence verification is `supabase db reset` locally.
- Migration numbers 0053–0060 and 0072–0075 were absent from the old `SPEC.md` changelog for months. That gap is closed here; keep this table updated as the single changelog.
