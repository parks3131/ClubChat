# Realtime & notifications

How live updates reach the client, and how every notification in the app is produced - trigger catalogue, per-type audience rules, the discrete-vs-live-unread split, and the app's only scheduled job.

## Overview

Two independent mechanisms, often confused:

| | Realtime | Notifications |
| --- | --- | --- |
| Transport | Postgres logical replication → Supabase Realtime → websocket | Ordinary rows in `public.notifications`, read over HTTP |
| Purpose | "something changed, refetch" | a durable, user-facing inbox |
| Payload use | **Ignored** - every subscriber just calls `onChange()` and refetches | The `body` and `target_path` are the product |
| Lifetime | ephemeral | persists as history, including after resolution |

The client never diffs realtime payloads into local state. `subscribeToNewMessages` and `subscribeToNotifications` both take a bare `onChange: () => void` and the caller refetches. That is deliberate - merge-by-id refetch is far less error-prone than reconciling INSERT/UPDATE/DELETE events against a paginated list.

Every notification row is written **server-side only**: 15 trigger functions plus two RPCs (`mark_channel_read_and_log`, `notify_polls_closing_soon`). There is no INSERT policy on `notifications`.

Related: [Security & RLS](02-security-rls.md) · [Data model](01-data-model.md) · [Data access layer](05-data-access-layer.md) · PRD [Notifications](../PRD/10-notifications.md)

## The `supabase_realtime` publication

| Table | Added | Why |
| --- | --- | --- |
| `messages` | 0005 | New chat messages |
| `message_reactions` | 0005 | Reaction add/remove |
| `notifications` | 0031 | Badge count + feed |
| `message_mentions` | 0060 | Mentions are a **second insert** right after the message, so a receiver's `messages` event can fire before the mention row exists - without this the highlight wouldn't render until some later unrelated refresh |

Nothing else is published. `channel_reads`, `polls`, `poll_votes`, `races`, `club_posts` etc. are all fetched on focus/pull, not pushed. **Gallery** (`fetchChannelPhotos` → `components/GalleryScreen.tsx`) is likewise fetch-on-focus over `messages`; it is not subscribed, so a photo sent while the Gallery is open won't appear until the screen is revisited.

The `message_mentions` entry is the newest and the least obvious. Mentions are written as a **second insert** immediately after the message, so a receiving client's `messages` event can fire and `reload()` before the mention row exists - the message would render without its highlight until some later unrelated refresh. `subscribeToNewMessages` therefore listens on `message_mentions` too, and 0060 exists solely to make that possible.

## Subscriptions and the channel-topic collision bug

**Symptom.** `cannot add postgres_changes callbacks ... after subscribe()`, thrown when a chat screen unmounts and remounts quickly for the same channel, or when two independent subscribers exist for the same user.

**Root cause.** `supabase.channel(topic)` returns the *existing* channel object for an identical topic string. `removeChannel()`'s cleanup is asynchronous (it awaits a server round-trip before tearing down), and React's effect cleanup does not await it. So the second `.channel()` call gets back a channel that is still `joined`, and `.on()` on an already-subscribed channel throws.

**Fix - a monotonic per-call counter appended to the topic**, in both modules:

```ts
let subscriptionCounter = 0;   // module-level, in lib/messages.ts and lib/notifications.ts
supabase.channel(`messages:${channelId}:${++subscriptionCounter}`)
supabase.channel(`notifications:${userId}:${tag}:${++subscriptionCounter}`)
```

`lib/notifications.ts` also takes a `tag` parameter, because it has two *known* concurrent callers for the same `userId` (`NotificationsProvider`'s badge count and the Notifications screen's feed). The `tag` distinguishes those; the counter handles the harder case - one caller remounting itself.

**Rule:** any new realtime subscription must include a fresh per-call component in its topic string. A stable topic derived only from ids will eventually collide.

Two subscriptions listen **project-wide** because the table has no column to filter on: `message_reactions` / `message_mentions` (no `channel_id`) and `messages` inside `subscribeToNotifications` (no recipient). Both just trigger a refetch; acceptable at MVP scale, and the first thing to revisit if chat volume grows.

## Trigger catalogue

All trigger functions are `security definer set search_path = public`. `auth.uid()` inside one still resolves to the real authenticated caller - definer elevates privileges, it does not change the session - which is how "did this to themselves" vs "an admin did this" is distinguished throughout.

### Bootstrap & membership sync

| Trigger | Table / timing | Function | Effect |
| --- | --- | --- | --- |
| `on_auth_user_created` | `auth.users` after insert | `handle_new_user` | Creates the `profiles` row from `raw_user_meta_data.full_name` |
| `on_club_created` | `clubs` after insert | `handle_new_club` | Inserts the creator as **`owner`** (0043), the main `channels` row, and an `eboard_channels` row (0072) - in that order, because the Eboard's own trigger reads `club_members` |
| `on_race_created` | `races` after insert | `handle_new_race` | Creates the race's channel **first**, then adds the creator to `race_members` (0041 fixed the reverse order, which silently swallowed the first system message) |
| `on_eboard_channel_created` | `eboard_channels` after insert | `handle_new_eboard_channel` | Creates the Eboard channel row, then **bulk-adds every club member with `role in ('admin','owner')`**. The `role = 'admin'` filter it originally used silently excluded the Owner until 0043 |
| `on_club_member_role_changed_membership_sync` | `club_members` after update of role | `handle_admin_role_membership_sync` | Compares **admin-tier** membership (`role in ('admin','owner')`) before/after: entering the tier **auto-joins the Eboard channel**, leaving it **auto-removes** them. An admin↔owner transition (any ownership transfer) is a no-op, since both sides stay in the tier. Race auto-join, added in 0041, was removed in 0043/0044 |
| `on_club_member_removed_membership_sync` | `club_members` after delete | `handle_club_member_removed_membership_sync` | Removing someone from the club deletes their `race_car_group_members`, `race_members` and `eboard_channel_members` rows for that club - **all** races, not just upcoming ones |
| `on_club_join_policy_opened` | `clubs` after update of `join_policy`, when new = `'open'` | `handle_club_join_policy_opened` | Auto-approves every pending join request when a club flips request → open. Mirrors `decide_join_request`'s approval branch exactly, in a loop |
| `on_car_group_member_removed` | `race_car_group_members` after delete | `clear_incharge_on_member_removed` | Nulls `race_car_groups.incharge_user_id` if the leaver was Incharge, and (0074) notifies the club's Admins/Owner |
| `on_poll_vote_added` / `on_poll_vote_removed` | `poll_votes` after insert / delete | `update_poll_option_vote_count` | Maintains the denormalized `poll_options.vote_count` |

### System chat messages (+ notification, same function)

| Trigger | Table | Function | Posts into |
| --- | --- | --- | --- |
| `on_club_member_added` | `club_members` after insert | `log_member_added` | Club main channel: "X joined the club" / "X was added by Y" |
| `on_club_member_removed` | `club_members` after delete | `log_member_removed` | "X left the club" / "X was removed by Y" |
| `on_club_member_role_changed` | `club_members` after update of role | `log_member_role_changed` | Promote / demote / **ownership transfer** (the outgoing owner→admin half is suppressed so a transfer posts one message, not two) |
| `on_race_member_added` | `race_members` after insert | `log_race_member_added` | That race's own channel |
| `on_eboard_member_added` | `eboard_channel_members` after insert | `log_eboard_member_added` | That Eboard's own channel |

All five look up the club's **main** channel with `where club_id = ... and race_id is null and eboard_channel_id is null`. That predicate has been patched twice (0016 when race channels appeared, 0017 when Eboard channels did) - omitting either clause raises "more than one row returned by a subquery."

`log_member_added` / `log_race_member_added` / `log_eboard_member_added` also insert a `member_added` notification, **unless** `current_setting('clubchat.skip_add_notify', true) = 'true'`. That setting is a transaction-local flag (`set_config(..., is_local => true)`, so it can never leak across a pooled connection) set by the `decide_*_join_request` RPCs and by `handle_club_join_policy_opened` right before their membership insert - otherwise an approval would produce both "your request was approved" and "you were added."

### Chat cards for created objects

| Trigger | Table | Function | Posts |
| --- | --- | --- | --- |
| `on_poll_created_post_chat` | `polls` after insert | `post_poll_chat_message` | A `poll` message into the poll's own scope channel - race → that race's channel, Eboard → that Eboard's, else the club main channel (0077 generalized this; 0071 was club-only) |
| `on_calendar_event_created_post_chat` | `calendar_events` after insert | `post_event_chat_message` | An `event` message into the club main channel |
| `on_eboard_meeting_created_post_chat` | `eboard_meetings` after insert | `post_meeting_chat_message` | A `meeting` message into that Eboard's channel |

Hooking the table rather than the call site means the card appears regardless of entry point (dedicated create screen or the chat "+" shortcut) - verified with a direct SQL insert during 0071's verification.

### Notification fan-out

| Trigger | Table / condition | Function |
| --- | --- | --- |
| `on_club_join_request_pending` | `club_join_requests`, `insert or update of status`, `when (new.status = 'pending')` | `notify_club_join_request` |
| `on_race_join_request_pending` | `race_join_requests`, same shape | `notify_race_join_request` |
| `on_eboard_join_request_pending` | `eboard_channel_join_requests`, same shape | `notify_eboard_join_request` |
| `on_poll_created` | `polls` after insert | `notify_poll_created` |
| `on_calendar_event_created` | `calendar_events` after insert | `notify_event_created` |
| `on_race_created_notify` | `races` after insert | `notify_race_created` |
| `on_eboard_meeting_created` | `eboard_meetings` after insert | `notify_meeting_created` |
| `on_announcement_posted` | `messages` after insert, `when (new.message_type = 'announcement')` | `notify_announcement` |
| `on_message_mention_added` | `message_mentions` after insert | `notify_message_mention_row` |
| `on_club_post_created` | `club_posts` after insert | `notify_news_post_created` |

The `insert or update of status ... when pending` shape catches both a fresh request and a re-request after denial (which flips status back via `on conflict do update`), while never firing on the pending → approved/denied transition, which the `decide_*` RPCs notify about themselves.

"Announcements notify, pins don't" falls straight out of the schema: announcing is an INSERT with `message_type = 'announcement'`; pinning is a later UPDATE of a separate boolean, which this trigger never sees.

## Notification type catalogue

| Type | Written by | Audience | `target_path` | How it clears |
| --- | --- | --- | --- | --- |
| `club_join_request` | `notify_club_join_request` | `club_members` where `role in ('admin','owner')` | `/clubs/{club}/club-profile/members` | **Not** cleared by the feed. Only by `markNotificationsReadForPath` when the roster screen is actually visited, or resolved by `decide_join_request` |
| `race_join_request` | `notify_race_join_request` | same (club-level admins/owner) | `/clubs/{club}/race/{race}/roster` | same |
| `eboard_join_request` | `notify_eboard_join_request` | current `eboard_channel_members` only | `/clubs/{club}/eboard/roster` | same |
| `request_approved` | `decide_*_join_request`, `handle_club_join_policy_opened` | the requester | the club / race / Eboard landing route | normal feed read |
| `request_denied` | `decide_*_join_request` | the requester | `/clubs`, `/clubs/{club}/races`, or `/clubs/{club}/eboard` | normal feed read |
| `member_added` | `log_member_added` / `log_race_member_added` / `log_eboard_member_added` | the added user | that club / race / Eboard | normal feed read |
| `member_removed` | `log_member_removed` | the removed user | `/clubs` | normal feed read |
| `role_changed` | `log_member_role_changed` | the affected user (skipped if self-inflicted) | `/clubs/{club}` | normal feed read |
| `poll_created` | `notify_poll_created` | race → `race_members` only; Eboard → `eboard_channel_members`; club → all members. Creator excluded | scope-specific poll route | normal feed read |
| `event_created` | `notify_event_created` | all club members except creator | `/clubs/{club}/event/{id}` | normal feed read |
| `race_created` | `notify_race_created` | all club members except creator | `/clubs/{club}/race/{id}` | normal feed read |
| `meeting_created` | `notify_meeting_created` | `eboard_channel_members` except creator | `/clubs/{club}/eboard/meeting/{id}` | normal feed read |
| `announcement` | `notify_announcement` | race → `race_members`; Eboard → members; club → all members. Sender excluded | that scope's `/chat` | normal feed read |
| `poll_closing_soon` | `notify_polls_closing_soon` (pg_cron) | same as `poll_created` **including the creator** | scope-specific poll route | normal feed read |
| `chat_caught_up` | `mark_channel_read_and_log` (RPC) | the caller only, `actor_id` null | that channel's `/chat` | inserted **already read** - never affects the badge |
| `mentioned` | `notify_message_mention_row` | the mentioned user, **only if they can access that channel** | that scope's `/chat` | normal feed read |
| `news_post_created` | `notify_news_post_created` | all club members except creator | `/clubs/{club}/news` | normal feed read |
| `car_group_incharge_left` | `clear_incharge_on_member_removed` | club `role in ('admin','owner')`, excluding the leaver | `/clubs/{club}/race/{race}/carpool` | normal feed read |

Two audience rules have each been fixed multiple times and are worth restating as invariants:

- **Club-role audience filters must be `role in ('admin','owner')`.** A bare `role = 'admin'` means a club whose only admin-tier member is the Owner gets nothing at all. Shipped broken in `notify_club_join_request`, `notify_race_join_request` (fixed 0046), and the race branches of `notify_announcement`, `notify_poll_created` (fixed 0048).
- **Race audiences are `race_members` only, never `race_members ∪ club admins`.** Since 0044, chat access itself requires a real roster row, so unioning in admins notified people about a channel they cannot open. Narrowed in 0049 (`notify_poll_created`, `notify_polls_closing_soon`) and 0050 (`notify_announcement`).

### The enum-literal cast trap

Every race branch that builds its audience with `select distinct ... from (... union ...)` must cast the type literal explicitly:

```sql
select distinct u.user_id, ..., 'announcement'::notification_type, ...
```

Postgres normally resolves an untyped string literal against the INSERT target column's type - but `SELECT DISTINCT` needs a concrete comparable type for every selected expression, so it forces the literal to `text` first, and Postgres will not implicitly cast a genuine `text` to a user-defined enum. The failure is `column "type" is of type notification_type but expression is of type text`, it aborts the whole statement (triggers run in the caller's transaction), and it only ever affected the race branches - the club and Eboard branches have no DISTINCT/UNION. Found live in 0036 (race announcements always 400'd), repeated immediately in 0038.

## Discrete notifications vs. live chat-unread

The Notifications feed merges **two sources with different persistence models**:

| | Discrete notifications | Chat unread |
| --- | --- | --- |
| Source | `notifications` table rows | `fetch_unread_channel_summaries()` RPC, computed live |
| Storage | one row per event | none - derived from `messages` + `channel_reads` |
| Granularity | one per event | one per **channel**, with a count |
| Pagination | 20 at a time via `limit` / `before` | first page only; bounded by channel count |
| Cleared by | opening the feed (`markAllNotificationsRead`) | **only** by actually opening that chat (`markChannelRead`) |

`fetch_unread_channel_summaries()` counts messages where `created_at > coalesce(last_read_at, 'epoch')`, `sender_id <> auth.uid()`, and `deleted_at is null`, grouped per channel, `having count > 0`. It reuses `is_channel_member`, so scope logic is never duplicated. Because it is computed rather than stored, it can never drift out of sync with `messages`.

`channel_reads.last_read_at` only ever advances when the user opens that chat. Opening the Notifications tab does not touch it.

`markAllNotificationsRead` deliberately **excludes** the three `*_join_request` types (`.not("type", "in", ...)`). Those get the same "only clears once you actually go look" guarantee as chat-unread, via `markNotificationsReadForPath(userId, targetPath)`, called on focus from the club members screen, the race roster, and the Eboard roster. Because those triggers insert a fixed, predictable `target_path` per scope, an exact-match UPDATE is safe - a non-admin visiting the same path simply matches zero rows.

The badge count (`fetchUnreadBadgeCount`) is `count(unread notifications) + count(channels with unread)` - each channel counts as **1**, never as a per-message sum.

### `resolved_outcome` - history instead of deletion

0032 originally **deleted** every admin's copy of a pending join-request notification once decided. 0035 reversed that: the row now stays and is stamped `resolved_outcome = 'approved' | 'denied'` with `read_at = coalesce(read_at, now())`, so the feed renders it as an "Approved"/"Denied" pill instead of it silently disappearing.

Resolution matches on **`type` + `target_path` + `actor_id`** (the requester), because `notifications` has no `request_id` column - a direct consequence of the `target_path`-as-string design. That coupling broke once: 0046 changed the path `notify_club_join_request` inserts, but `decide_join_request` kept matching the old one, so from 0046 until 0054 approving a club request left the admin's notification permanently unresolved and permanently unread. **Changing any `target_path` literal requires grepping every function that matches on it.**

`chat_caught_up` (0051/0052) applies the same "persist as history" idea to chat: `mark_channel_read_and_log` computes the unread count using the same filter shape as `fetch_unread_channel_summaries` - **before** advancing `channel_reads` - and, only if it was > 0, inserts an already-read notification worded to match the live row it replaces. The live unread computation itself is unchanged; this only adds a retrospective trace.

## The scheduled job

`poll_closing_soon` is the only notification with no row-level event to hang a trigger on - nothing in the schema changes when a deadline gets within 10 minutes. It is therefore the app's **only** scheduled job.

| | |
| --- | --- |
| Extension | `pg_cron` (already in `shared_preload_libraries` on the Supabase image; 0048 only needed `create extension`) |
| Job name | `poll-closing-soon-check` - `cron.schedule(name, ...)` upserts by name, so `supabase db reset` never accumulates duplicates |
| Schedule | `* * * * *` (every minute) |
| Body | `select public.notify_polls_closing_soon();` |
| Selection | `closes_at is not null and not is_closed and closing_soon_notified_at is null and closes_at > now() and closes_at <= now() + interval '10 minutes'` |
| Dedup | stamps `polls.closing_soon_notified_at = now()` after processing, **regardless of whether the audience was empty** - a poll is considered for this exactly once |
| Audience | the same 3-way scope branch as `notify_poll_created`, but **including** the creator (unlike every creation notification) |

Everything else about poll deadlines is computed live: `is_poll_closed()` and `cast_vote()` both evaluate `is_closed or closes_at < now()` at query time. There is no job that closes polls.

## Invariants

1. **Realtime payloads are never used.** Every subscription callback is `() => void` and the caller refetches. Do not start diffing payloads into state.
2. **Every realtime topic string carries a fresh per-call counter.** A topic derived only from stable ids will collide on remount and throw.
3. **Every `notifications` row is written server-side.** No INSERT policy exists; keep it that way.
4. **Club-role audience filters use `role in ('admin','owner')`.**
5. **Race audiences are `race_members` only.**
6. **Enum literals in a `SELECT DISTINCT` / `UNION` audience query are explicitly cast** (`'x'::notification_type`).
7. **`target_path` literals are matched on elsewhere.** Changing one requires updating every `decide_*` function that resolves against it.
8. **The `clubchat.skip_add_notify` flag is always set transaction-locally** (`is_local => true`) immediately before the membership insert it guards.
9. **`channel_reads` only advances from an actual chat open.** Reading the Notifications feed must never touch it.
10. **The three `*_join_request` types are excluded from bulk mark-read.**
11. **Chat-card triggers hook the table, not the call site**, so a card appears regardless of which screen created the object.

## Extension points

- **Push notifications (`expo-notifications`) are not wired up.** The groundwork exists: every notification already carries a rendered `body` and a `target_path` - exactly the payload an Expo push message needs. What's missing is a device-token table, a token-registration call, and something (an Edge Function on an `after insert` trigger, or a second pg_cron sweep) to deliver them.
- **A new notification type** = one enum value in its own migration file, then one function + trigger. Copy `notify_news_post_created` (simplest) or `notify_announcement` (if it needs scope branching).
- **A new scheduled job** follows `poll-closing-soon-check`: a non-trigger `security definer` function that loops eligible rows, a dedup timestamp column, and a named `cron.schedule` call.
- **Digest/batching** would go in `fetchNotificationFeed`'s merge step, which already combines heterogeneous sources into one sorted array.

## Known gaps

- No push notifications - awareness only exists while the app is open.
- Two subscriptions listen project-wide (`message_reactions`/`message_mentions`, and `messages` for badge purposes), so every user refetches on every insert anywhere. Fine at MVP scale, first thing to fix under load.
- `notifications` grows without bound; no retention, archival, or bulk-delete path exists.
- Notification `body` strings are built in SQL and are English-only, unlocalizable, and untestable from the client.
- A poll's `closing_soon` fires at most once ever; a reopened or extended poll will not re-notify.
- If `pg_cron` is unavailable on a target host, `poll_closing_soon` silently never fires - nothing surfaces the failure.
