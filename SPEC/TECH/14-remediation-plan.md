# Remediation Plan

Every known defect and gap, with the exact fix, the files it touches, how to verify it, and what "done" means. Ordered by phase from [Backend design](13-backend-design.md). Each item names the concepts it exercises, cross-referenced to [the learning path](../../docs/LEARNING-PATH.md).

**How to use this.** Work items top to bottom. Do not batch them: each one lands as its own commit with its own verification, because several change authorization or delivery behaviour and a batched failure is untraceable. Migration numbers start at `0080` and are assigned in the order the work actually lands, not the order listed here.

**Definition of done, for every item:** `npx tsc --noEmit` clean, `npm test` green with no flakes, the stated verification performed and its output recorded in the commit, and the relevant spec file updated in the same commit.

---

## Phase 0: correctness and launch blockers

### R1. Realtime silently loses messages on background and resume

**Severity: high. This is a correctness bug in a chat app.**

| | |
|---|---|
| Symptom | A phone that backgrounds and resumes can permanently miss messages sent during the gap. No error, no indication, and the gap only closes on a manual refresh or a later realtime event that triggers a refetch |
| Root cause | Supabase Realtime does not guarantee delivery (stated in its own README) and has no replay for `postgres_changes` after a disconnect. Separately, a reconnect can rejoin the channel while silently failing to re-subscribe to the change stream. `lib/supabase.ts` sets neither of the two documented mitigations |
| Concepts | Delivery guarantees, at-most-once vs at-least-once, reconciliation on reconnect |

**Fix, in three parts:**

1. In `lib/supabase.ts`, pass `realtime: { heartbeatCallback, worker: true }` to `createClient`. The heartbeat callback calls `supabase.realtime.connect()` when it observes a `disconnected` state. `worker: true` moves the heartbeat off the main JS thread so a busy render loop cannot starve it.
2. In every `.subscribe()` call site, use the status callback: `subscribe((status) => { if (status === "SUBSCRIBED") onChange(); })`. This makes every successful subscribe, including every *re*-subscribe after a reconnect, trigger a full refetch. Call sites: `lib/messages.ts` `subscribeToNewMessages`, `lib/notifications.ts` `subscribeToNotifications`.
3. In `components/ChatScreen.tsx`, refetch on app foreground via React Native's `AppState` listener (`active` transition), not only on mount.

**Verification.** Open a chat on a device. Background the app. Send a message from a second account. Wait 60 seconds. Foreground the app. The message must be present without any manual pull or navigation. Repeat with airplane mode toggled instead of backgrounding.

**Acceptance.** No message is ever absent after a resume. This must be tested on a real device, not the simulator, because background behaviour differs.

---

### R2. Every user subscribes to every message in the project

**Severity: high. Superlinear cost with no user-visible symptom until it collapses.**

| | |
|---|---|
| Symptom | None visible today. Under load: rising realtime latency, then dropped events, then a realtime bill far above expectation |
| Root cause | Three unfiltered `postgres_changes` subscriptions. `lib/notifications.ts:212` listens to **all** `messages` INSERTs with no filter and is mounted app-wide by `NotificationsProvider`, so every signed-in user receives every message row in the project. `lib/messages.ts:475-476` does the same for `message_reactions` and `message_mentions`. Both are documented in code comments as deliberate MVP tradeoffs |
| Cost model | Supabase authorizes each change against **each subscriber individually**, on a single-threaded processor, and bills one realtime message per listener. With 200 concurrent users, one message insert costs ~200 authorizations, ~200 billed messages, and ~200 full refetches |
| Concepts | Fan-out, read amplification, pub/sub filtering, denormalization |

**Fix A, reactions and mentions.** These cannot be filtered today because neither table has a `channel_id` column; both only reference `message_id`.

- Migration: add `channel_id uuid not null references channels(id) on delete cascade` to `message_reactions` and `message_mentions`. Backfill from the parent message. Maintain it with a `before insert` trigger that reads the parent message's `channel_id`, so the client never sets it and cannot set it wrongly. Index `(channel_id)` on both.
- Update the RLS policies on both tables to check `channel_id` directly rather than joining to `messages`. This also delivers part of R4 for free.
- Update `types/database.ts` by hand.
- Change both `.on(...)` calls in `lib/messages.ts` to include `filter: \`channel_id=eq.${channelId}\``.

**Fix B, the app-wide messages listener.** Its only job is "does my chat-unread count need refreshing." Do not filter it, remove it.

Replace with two cheaper signals: refresh unread summaries when the app returns to foreground (`AppState`), and refresh when the Notifications screen gains focus. Both already exist as refresh paths. The unread count becoming a few seconds stale is exactly the tradeoff Slack makes deliberately, which is documented as strong ordering within a conversation and eventual consistency for cross-channel badge metadata.

When push notifications land (R9), the same trigger that dispatches a push can also broadcast to a per-user topic, restoring instant badge updates at a fraction of the cost.

**Verification.** In the Supabase dashboard, watch realtime message counts while two accounts chat. Before the fix, a single message should produce one billed message per connected client. After, it should produce one per *channel member actually viewing that channel*, and zero for unrelated users.

**Acceptance.** No `postgres_changes` subscription anywhere in the codebase lacks a `filter`. Add this as a review check.

---

### R3. A member can pin their own message and fake an announcement

**Severity: high. A member-visible authorization defect.**

**Status: Done - migration `0081_enforce_message_admin_fields`.** Six-case `psql` matrix (rolled back) passes: member pin rejected, member announce-flip rejected, member soft-delete allowed, member body-edit allowed, admin pin allowed, owner pin allowed. Exploit reproduced first (member set `pinned=t` and `message_type=announcement` on their own message), then confirmed closed by the trigger.

| | |
|---|---|
| Symptom | Any member can `update messages set pinned = true` on their own message and it appears in the channel's Pinned strip and Highlights tab. They can also flip `message_type` to `'announcement'` after the fact and it renders as one |
| Root cause | The `messages` UPDATE policy is `sender_id = auth.uid() or is_channel_admin(channel_id)` with no column restriction. The admin check on announcements exists only in the INSERT policy and is never re-applied on UPDATE |
| Concepts | Column-level authorization, the difference between row filtering and field validation |

**Fix.** A policy split is not sufficient, because the same policy legitimately carries soft-delete and body edits by the sender. Use a `before update` trigger:

```sql
create or replace function public.enforce_message_admin_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.pinned is distinct from old.pinned
      or new.message_type is distinct from old.message_type)
     and not public.is_channel_admin(new.channel_id) then
    raise exception 'Only a channel admin can pin or announce';
  end if;
  return new;
end $$;
```

**Verification.** In `psql`, impersonate a plain member (`set local role authenticated` plus `set_config('request.jwt.claims', ...)`) and attempt both updates on a message they authored. Both must raise. Repeat as a channel admin: both must succeed. Then confirm in the app that a member can still delete and edit their own message.

**Acceptance.** Four cases pass: member pin rejected, member announce-flip rejected, member soft-delete allowed, admin pin allowed.

---

### R4. `is_user_club_admin` excludes the Owner

**Status: Done - migration `0080_fix_is_user_club_admin_owner`.** Verified in `psql` via rolled-back RLS impersonation: with the old definition the Eboard member's add of the Owner raised `new row violates row-level security policy`; with `0080` the same insert succeeds. Live-catalog sweep confirms no remaining function uses `role = 'admin'` as an authz/audience filter (only `transfer_ownership`'s legitimate demote-write remains).

| | |
|---|---|
| Symptom | An existing Eboard member cannot add the club Owner through the client. Masked in practice because definer triggers insert the row anyway |
| Root cause | The helper still filters `role = 'admin'` and was never widened when the Owner tier was added. Fifth instance of this exact bug |
| Fix | New migration: recreate the function with `role in ('admin','owner')` |
| Verification | `psql`: as an Eboard member, insert an `eboard_channel_members` row for the club Owner. It must succeed |
| Concepts | Enum widening, invariants that must hold across every call site |

Then grep the whole `supabase/migrations/` tree for `role = 'admin'` and confirm zero remaining occurrences. Add the grep to the migration checklist.

---

### R5. Auth email is capped at 2 per hour

| | |
|---|---|
| Symptom | Onboarding the second beta club, signups stop arriving. No error in the app |
| Root cause | Supabase's built-in email provider is capped at 2 emails per hour, project-wide, and is documented as being for testing only |
| Fix | Configure custom SMTP (Resend, Postmark or SES) in the hosted project's auth settings. Then raise the new-user rate limit from its 30/hour default to something appropriate for a club onboarding in one evening |
| Verification | Create three accounts in five minutes on the hosted project. All three confirmation emails arrive |
| Concepts | Rate limiting, transactional email, deliverability |

Also note: `/token` refresh is limited to 1,800/hour **per IP** and is not configurable. A whole club on one gym's WiFi shares one IP. Unlikely to bite at beta size, worth remembering as a symptom shape.

---

### R6. The free tier has no backups

| | |
|---|---|
| Symptom | Data loss is unrecoverable |
| Root cause | Free tier: no automatic backups, 1 day of log retention, 200 concurrent realtime connections, no Smart CDN, and the project pauses after 7 idle days |
| Fix | Move the hosted project to Pro. Decide the spend-cap posture explicitly: cap on means a predictable bill but a hard service stop when hit; cap off means no outage and an open-ended bill |
| Verification | Confirm a daily backup exists in the dashboard, and that log retention reads 7 days |
| Concepts | RPO and RTO, backup vs point-in-time recovery |

Storage objects are **not** included in database backups on any plan. Photos and documents are unprotected by this. Note it as an accepted risk or plan a separate object backup.

---

### R7. Local and hosted Postgres versions must match

| | |
|---|---|
| Symptom | `supabase db diff` produces garbage, or `db reset` fails with an extension error |
| Root cause | The CLI pulls a local Postgres image that can differ in major version from the hosted project. Confirmed open CLI issues |
| Fix | Pin the local image to the hosted major version in `supabase/config.toml`. Before the first `db push`, verify `pg_cron` and `pg_net` are enabled on the hosted project, otherwise migration `0048` fails on replay |
| Verification | `supabase db reset` locally replays all migrations cleanly, then `supabase db push` reports no drift |
| Concepts | Migration replay, environment parity, schema drift |

Rule, from Supabase's own docs and worth internalizing: **never change the remote database directly.** A Dashboard SQL editor write bypasses migration history and makes every later `db push` fail.

---

### R8. Highlights silently loses pins past 1,000 messages

| | |
|---|---|
| Symptom | Nothing today. In a busy channel, older pinned messages simply stop appearing. No error |
| Root cause | The no-argument `fetchMessages(channelId)` path fetches full channel history with no limit. PostgREST caps responses at `db-max-rows`, default 1,000, by silently truncating |
| Fix | `HighlightsScreen` needs pins and announcements, not history. Give it dedicated queries: `.eq("pinned", true)` and `.eq("message_type", "announcement")`, both with explicit limits and ordering. Delete the unbounded path so it cannot be reused |
| Verification | Seed a channel with 1,200 messages and a pin at position 1. It must appear in Highlights |
| Concepts | Implicit limits, silent truncation, why unbounded queries are a latent bug |

---

## Phase 1: the chat backbone

### R9. Message sequence numbers

| | |
|---|---|
| Goal | Stable pagination, reconnect catch-up, gap detection, cheap unread markers |
| Concepts | Monotonic sequences, cursor vs offset pagination, idempotency |

**Migration.** Add `seq bigint generated always as identity` to `messages`, plus `create index on messages (channel_id, seq desc)`. Backfill is automatic for existing rows in physical order; if strict chronological order matters for old rows, backfill explicitly ordered by `created_at` before making the column an identity.

**Then migrate the read API** in `lib/messages.ts` to an anchor shape, modelled on Zulip's published API: an anchor (a `seq`, or `newest` / `oldest` / `first_unread`), `num_before`, `num_after`, and a response carrying `found_oldest` / `found_newest`. Replace the `created_at` cursors, which can tie.

This retires most of the FlatList pagination edge cases in [Engineering pitfalls](12-engineering-pitfalls.md), because "where am I in this list" becomes an integer rather than an inferred scroll position.

**Verification.** Two messages inserted in the same millisecond must paginate deterministically. Load a channel, scroll up through three pages, and confirm no duplicate and no skipped message.

---

### R10. Client-generated idempotency key

| | |
|---|---|
| Goal | A retried send can never produce a duplicate |
| Fix | `messages.client_id uuid` with `unique(channel_id, client_id)`. The client generates it, inserts `on conflict (channel_id, client_id) do nothing ... returning`, and reconciles. Render the bubble optimistically in a sending state |
| Verification | Send with the network cut mid-request, then restore. Exactly one message appears |
| Concepts | Idempotency keys, exactly-once as a client-side illusion, optimistic UI |

This is GroupMe's `source_guid` and Telegram's `random_id`. It is also the prerequisite for the outbox in R14.

---

### R11. Rewrite the hot RLS policies

**This is the highest-risk item in the plan. Treat it accordingly.**

| | |
|---|---|
| Symptom | Chat page loads are slower than they should be, and get worse with history size |
| Root cause | Two compounding issues. First, 124 bare `auth.uid()` call sites and none wrapped in `(select auth.uid())`, so the function is evaluated per row instead of once per statement. Second, the hottest policy passes a **row column** into a helper (`is_channel_member(channel_id)`), which Supabase's docs state explicitly cannot be optimized by wrapping. A 50-row page evaluates it 50 times with the same argument; `stable` permits index use but does not memoize |
| Concepts | Query planning, initPlan, function volatility, selectivity, index-only scans |

**Two separate passes, in this order.**

*Pass 1, mechanical and safe.* Wrap `auth.uid()` as `(select auth.uid())` inside the 35 security-definer helper function bodies. Behaviour is identical; only evaluation frequency changes.

*Pass 2, careful.* Rewrite the hot policies from `helper(row_col)` into set form:

```sql
using (
  channel_id in (select c.id from channels c where public.is_channel_member(c.id))
)
```

The subquery becomes an initPlan evaluated once, producing a set the planner can hash and index-probe. Supabase benchmarks this shape at 9,000ms to 20ms. Apply to `messages`, `message_reactions`, `message_mentions`, `polls`, `club_posts`, `notifications`.

**Verification, mandatory for each policy.** Before and after, in `psql`, impersonating at least three personas (a plain member, a club admin without a race roster row, a non-member):

1. `explain analyze` the representative query and record both timings.
2. Run the **same** authorization assertions from [Security and RLS](02-security-rls.md)'s permission matrix and confirm identical row counts before and after.

**Acceptance.** Measurably faster **and** provably identical visibility. A rewrite that is faster and subtly wider is worse than no rewrite at all. If the two cannot both be demonstrated, revert.

---

### R12. Stop signing media URLs per fetch

| | |
|---|---|
| Symptom | Photos re-download on every chat open. Media egress billed entirely at the uncached rate |
| Root cause | `lib/messages.ts` and `lib/clubPosts.ts` generate a fresh signed URL on every fetch. The signature lives in the query string, which is part of the CDN cache key, so no two requests ever share a cache entry. Supabase's docs state this verbatim: the cache never warms and every request hits the origin |
| Concepts | Cache keys, TTL, CDN semantics, cache invalidation |

**Fix.** Sign once per storage object with a long expiry and memoize by storage path, in a module-level map keyed by path with the expiry recorded, so all users and all renders share one URL for its lifetime. Separately, confirm `expo-image` disk caching is enabled, or every scroll re-downloads regardless.

Also add `width` and `height` plus a small client-generated thumbnail to the message row, so the list reserves correct space before the image loads. This is what WhatsApp does and it removes layout shift.

**The tradeoff, stated plainly.** Access degrades from per-user authorization at fetch time to unguessable-until-expiry. Every major messenger accepts this; Signal's blobs are opaque and content-addressed at one stable URL shared by all recipients. Club photos are semi-private, not secret.

**Verification.** Load a chat with photos twice. The second load must produce zero storage origin requests. Check the dashboard's cached versus uncached egress split.

---

### R13. Denormalize and cap unread; collapse the calendar feed

**Unread.** Add trigger-maintained `channels.last_message_seq`. "Does this channel have unread" becomes a comparison against one small row that never touches `messages`. Cap the displayed count at 99+ so the underlying COUNT always carries a `LIMIT`. Keep the read-cursor model, which is what Slack and Discord both use and which cannot drift.

**Calendar.** `fetchGlobalCalendarFeed` runs the whole per-club chain once per club, including one `fetchPolls` per race. A member of three clubs with four races each is roughly 30 sequential round trips against an 8 second statement timeout for the `authenticated` role. Move it into one Postgres function returning composite JSON.

**Concepts.** Denormalization, N+1 queries, statement timeouts, composite result sets.

---

## Phase 2: push notifications

### R14. Push, done properly

**Path.** The `notifications` insert already written by triggers fires a Database Webhook, which calls an Edge Function, which calls Expo's push service. No schema change is needed to attach it: `body` and `target_path` already exist.

**Token storage.** The official Supabase guide stores one `profiles.expo_push_token` column. That is wrong here: it breaks on a phone plus tablet, and breaks entirely for the Swift client. Create `device_tokens (user_id, token unique, token_type, platform, device_id, last_seen_at, invalidated_at)`, upserted on every app launch. **Store raw APNs tokens alongside Expo tokens from day one** so the Swift client needs no migration later.

**Three rules that separate a good implementation from a bad one:**

1. **Gate on idleness server-side.** Compute the set of recipients who have not interacted with any client in the last few minutes and push only to those. This is Zulip's rule and it removes most volume and nearly all duplicate-notification complaints.
2. **Evaluate mute at fan-out time.** Client-side muting still consumes the badge and still wakes the device.
3. **The server owns the badge integer.** iOS does not compute badges; whatever number is in the payload wins. Ship the same unread aggregate the app displays, and push a decrease when the user reads elsewhere.

**Handle the lifecycle.** Drop tokens on `DeviceNotRegistered`, back off on `MessageRateExceeded`, and check receipts about 15 minutes after send. Expo's limits: 600 notifications/sec per project, 100 per request, 4,096 byte payload.

**Accept best-effort.** `pg_net` fires after commit, has no documented retry, and stores responses in unlogged tables. That is acceptable **because** the in-app Notifications tab is the durable record, so a lost push is cosmetic. No product behaviour may depend on a push arriving. If that changes, the upgrade is Supabase Queues, not a rewrite.

**Concepts.** APNs and FCM, device token lifecycle, webhooks, at-least-once delivery, badge synchronization.

---

## Phase 3: client durability

### R15. Local cache and outbox

Cache the newest page per channel plus the club and channel list. Render from cache instantly on cold start, then reconcile with `seq > cached_max` (which R9 makes trivial). Then an outbox for pending sends that retries with the same `client_id` from R10.

The goal is not full history mirroring. It is "chat opens instantly, and a send survives bad reception," which matters on a track with poor signal. This is the largest perceived-quality win available and it is identical work whether the client is Expo or Swift.

**Concepts.** Offline-first, optimistic UI, the outbox pattern, cache reconciliation.

---

## Cross-cutting gaps

| Gap | Fix | When |
|---|---|---|
| Rate limiting: messages done, rest pending | Message sends are now throttled by an in-DB token-bucket `before insert` trigger (0083, [ADR-0003](../decisions/0003-rate-limiting-edge-tier-and-in-db-triggers.md)). Extend the same `rate_limit_spend()` to `message_reports`, `message_reactions` and `club_join_requests`. Volumetric DDoS stays out of scope (CDN/WAF later, not an app tier) | Before public launch |
| No error monitoring | Sentry via the community supabase-js integration; works for the Swift client through Sentry's own SDK | Before public launch |
| Orphaned storage objects | Deleting a message leaves its file. Add a cleanup path or a scheduled sweep | Before public launch |
| No staging environment | Supabase Branching gives each PR its own instance, which suits a codebase whose logic is mostly RLS and triggers and only testable against real Postgres | When a second developer exists |
| Zero tests for RLS | `pgTAP` or plain SQL assertions run against `supabase db reset` in CI. This is the highest-value test coverage available, since RLS is the entire security boundary | Alongside R11 |

---

## Sequencing

| Order | Items | Why this order |
|---|---|---|
| 1 | R5, R6, R7 | Infrastructure gates. Nothing can be verified on the hosted project until these are done |
| 2 | R3, R4 | Authorization defects. Fix before any real club has members |
| 3 | R1, R2, R8 | Correctness and amplification. R2's schema change also simplifies R11 |
| 4 | R9, R10 | The schema foundation the rest builds on |
| 5 | R11 | After R2 and R9, because both change the policies and indexes involved |
| 6 | R12, R13 | Independent performance work, safe to parallelize |
| 7 | R14 | Needs R13's unread aggregate for correct badges |
| 8 | R15 | Needs R9 and R10 |
