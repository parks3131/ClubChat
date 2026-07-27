# Security & RLS

The complete authorization model: helper functions, per-table policy matrix, every RPC, and the Owner/Admin/Member permission rules - all enforced in Postgres, never in the client.

## Overview

There is no application server. The Expo client authenticates as the `authenticated` Postgres role and issues queries directly, so **row-level security is the only access control that exists**. Client-side gates (`isAdmin` props, hidden buttons) are UX, not security; every one of them has a policy behind it.

Three conventions hold throughout:

- **Membership checks are `security definer` functions, never inline subqueries.** A policy on `club_members` that queried `club_members` would recurse into its own policy. Every `is_*` helper is `language sql`, `security definer`, `set search_path = public`, `stable`.
- **Anything RLS can't express is an RPC.** Multi-step flows (approve a request *and* insert the membership row), writes to tables the client can't reach (`auth.users`), and validations that need a lookup before the write all live in `security definer` plpgsql functions that re-check authorization themselves.
- **`notifications` has no INSERT policy at all.** Every row comes from a trigger or an RPC.

Grants (0004) are deliberately explicit - `grant select, insert, update, delete on all tables ... to authenticated` plus `alter default privileges` - because "auto-expose new tables" defaults differ between local and hosted Supabase. Grants let the role reach the table; policies decide what it sees.

Related: [Data model](01-data-model.md) · [Realtime & notifications](06-realtime-and-notifications.md) · [Engineering pitfalls](12-engineering-pitfalls.md) · PRD [Personas & roles](../PRD/01-personas-and-roles.md)

## Helper function catalogue

All are `security definer`, `set search_path = public`, `stable`, `language sql`, returning `boolean` unless noted. "Reads `auth.uid()`" means the check is about the *caller*; the two-argument helpers check an *arbitrary* user instead.

| Function | Semantics | Introduced / last changed |
| --- | --- | --- |
| `is_club_member(p_club_id)` | Caller has any `club_members` row for the club | 0003 |
| `is_club_admin(p_club_id)` | Caller's role is `admin` **or `owner`** | 0003; widened in 0043 |
| `is_club_owner(p_club_id)` | Caller's role is exactly `owner` | 0043 |
| `is_user_club_admin(p_club_id, p_user_id)` | **Arbitrary** user's role is `admin` **or `owner`** | 0017; widened in 0080 |
| `is_channel_member(p_channel_id)` | 3-way branch on the channel's scope: race → `is_race_member`; Eboard → `is_eboard_member`; else `is_club_member` | 0003; generalized 0016, 0017; race branch narrowed 0044 |
| `is_channel_admin(p_channel_id)` | race → `is_race_member AND is_race_admin`; Eboard → `is_eboard_member`; else `is_club_admin` | 0003; 0016, 0017; 0044 |
| `is_race_member(p_race_id)` | Caller has a real `race_members` row | 0016 |
| `is_race_admin(p_race_id)` | `is_club_admin(race.club_id)` - **management authority, not access** | 0016 |
| `is_race_club_member(p_race_id)` | `is_club_member(race.club_id)` - gates filing a race join request | 0016 |
| `is_user_race_participant(p_race_id, p_user_id)` | Arbitrary user has a real `race_members` row. Gates car-group assignment | 0021; club-admin fallback **removed** in 0044 |
| `is_eboard_member(p_eboard_channel_id)` | Caller has an `eboard_channel_members` row | 0017 |
| `is_eboard_club_admin(p_eboard_channel_id)` | `is_club_admin(eboard.club_id)` - grants *visibility* and request eligibility only | 0017 |
| `is_eboard_club_owner(p_eboard_channel_id)` | `is_club_owner(eboard.club_id)` | 0043 |
| `can_access_poll(p_poll_id)` | 3-way branch: race → `is_race_member`; Eboard → `is_eboard_member`; else `is_club_member`. Backs `poll_options` and `poll_votes` RLS | 0025; scoped 0038; race branch narrowed 0049 |
| `is_poll_creator(p_poll_id)` | `polls.created_by = auth.uid()` | 0025 |
| `is_poll_private(p_poll_id)` | `polls.is_private` | 0025 |
| `is_poll_closed(p_poll_id)` | `is_closed or (closes_at is not null and closes_at < now())` - deadline evaluated live, no cron | 0025; deadline added 0038 |

**Dropped:** `is_club_creator`, `is_eboard_club_creator` (0043), `is_race_club_creator` (0044) - all superseded by the owner-role helpers.

> **Fixed in 0080 (R4).** `is_user_club_admin` filtered `role = 'admin'` and was never widened by 0043 - the fifth instance of that omission. Its only caller is `eboard_channel_members`' INSERT policy, so an existing Eboard member could not directly add the club's **Owner** through the client (the WITH CHECK failed). It was masked in practice because the Owner always got in through `handle_new_eboard_channel` / `handle_admin_role_membership_sync`, which are security definer and bypass the policy. 0080 recreates the helper with `role in ('admin','owner')`. Same class of bug as the `role = 'admin'` audience filters fixed in 0046 and 0048.

**`can_access_poll` is deliberately NOT used in `polls`' own SELECT policy** - that policy is written as an inline `CASE` on the row's own columns. See [Engineering pitfalls](12-engineering-pitfalls.md) for why this distinction is load-bearing.

## Policy matrix

Final state after 0079. " - " means no policy exists (default deny). Multiple entries in one cell are separate **permissive** policies, which Postgres OR's together.

### Identity & clubs

| Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `profiles` | `true` (any authenticated) | - (trigger only) | `auth.uid() = id` | - |
| `clubs` | `is_club_member(id) or created_by = auth.uid()` | `auth.uid() = created_by` | `is_club_admin(id)` | `is_club_owner(id)` |
| `club_members` | `is_club_member(club_id)` | `is_club_admin(club_id)` | using `is_club_admin(club_id) and role <> 'owner'`, check `role in ('member','admin')` | `user_id = auth.uid() and role <> 'owner'` · `is_club_admin(club_id) and role = 'member'` · `is_club_owner(club_id) and role = 'admin'` |
| `club_join_requests` | `user_id = auth.uid() or is_club_admin(club_id)` | `user_id = auth.uid()` | `is_club_admin(club_id)` | - |

The `clubs` SELECT policy's `or created_by = auth.uid()` clause is not redundant - it exists solely so `INSERT ... RETURNING` can read back a brand-new club before the `on_club_created` trigger has created the creator's membership row. Removing it re-breaks club creation entirely.

`club_members` UPDATE can neither read nor write `role = 'owner'`: `using` excludes the owner's pre-update row, `with check` restricts the post-update value. `transfer_ownership()` is the only path that creates an owner row.

### Chat

| Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `channels` | `is_channel_member(id)` | - (trigger only) | - | - |
| `messages` | `is_channel_member(channel_id)` | `sender_id = auth.uid() and is_channel_member(channel_id) and (message_type <> 'announcement' or is_channel_admin(channel_id))` | `sender_id = auth.uid() or is_channel_admin(channel_id)` | same as UPDATE (**exists but unused** - deletion is a soft UPDATE) |
| `message_reactions` | message is in an accessible channel | `user_id = auth.uid()` + same | `user_id = auth.uid()` |
| `message_mentions` | message is in an accessible channel | message's `sender_id = auth.uid()` | - | - |
| `message_reports` | `is_channel_admin(channel_id)` | `reporter_id = auth.uid() and is_channel_member(channel_id)` and the message really belongs to that channel | - | `is_channel_admin(channel_id)` (dismiss) |
| `channel_reads` | `for all`: `user_id = auth.uid()` (using and with check) | | | |

**Announce rights ride on `is_channel_admin` - but only at INSERT time**, which is why the race branch's 0044 change (`is_race_member AND is_race_admin`) removed announce rights from an unjoined manager without touching a single policy.

> ### ⚠️ Pinning is not enforced at the data layer
>
> Pinning is admin-only in the UI, but **nothing in the schema enforces it**. The `messages` INSERT policy special-cases announcements; the UPDATE policy has no column restriction at all:
>
> ```sql
> -- 0003_rls.sql - the only gate on pin/unpin
> create policy "sender or admin can edit a message"
>   on public.messages for update
>   to authenticated
>   using      (sender_id = auth.uid() or public.is_channel_admin(channel_id))
>   with check (sender_id = auth.uid() or public.is_channel_admin(channel_id));
> ```
>
> A plain member can therefore `update messages set pinned = true where id = <their own message>` and it will appear in the channel's Pinned strip and Highlights tab. The same policy also lets a sender flip their own message's `message_type` to `'announcement'` after the fact - the admin check in the INSERT policy is never re-applied on UPDATE. (The `on_announcement_posted` trigger fires only on INSERT, so a retro-flipped announcement notifies nobody, but it still renders as one.)
>
> Closing this needs a column-scoped UPDATE policy or a `before update` trigger that rejects `pinned`/`message_type` changes from a non-`is_channel_admin` caller; a plain policy split isn't enough, because the same policy legitimately carries soft-delete and body edits.

### Notifications

| Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `notifications` | `recipient_id = auth.uid()` | - (trigger/RPC only) | `recipient_id = auth.uid()` | - |

Clients can only ever mark their own rows read. `resolved_outcome` is technically writable through the same UPDATE policy but is only ever set by the `decide_*_join_request` functions.

### Calendar, routines, news

| Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `calendar_events` | `is_club_member(club_id)` | `is_club_admin(club_id)` | `is_club_admin(club_id)` | `is_club_admin(club_id)` |
| `routine_workouts` | `is_club_member(club_id)` | `is_club_admin(club_id) and created_by = auth.uid()` | `is_club_admin(club_id)` | `is_club_admin(club_id)` |
| `club_posts` | `is_club_member(club_id)` | `created_by = auth.uid() and is_club_admin(club_id)` | `is_club_admin(club_id)` | `is_club_admin(club_id)` |
| `club_post_reactions` | post is in a club the caller belongs to | `user_id = auth.uid()` + same | - | `user_id = auth.uid()` |

Note the pattern split: these three are **any-admin** editable (like race Meet Info), while `eboard_meetings` and `polls` are **creator-only**. That difference is a product decision, not an inconsistency.

### Races

| Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `races` | `is_club_member(club_id)` - every club member sees every race | `is_club_admin(club_id)` | `is_club_admin(club_id)` (covers all Meet Info + avatar columns) | `is_club_admin(club_id)` |
| `race_members` | `is_race_admin(race_id) or is_race_member(race_id)` | `is_race_admin(race_id)` | - | `is_race_admin(race_id)` · `user_id = auth.uid()` (self-leave, 0074) |
| `race_join_requests` | `user_id = auth.uid() or is_race_admin(race_id)` | `user_id = auth.uid() and is_race_club_member(race_id)` | `is_race_admin(race_id)` | - |
| `race_pins` | `for all`: `user_id = auth.uid()` | | | |
| `race_car_groups` | `is_race_admin(race_id) or is_race_member(race_id)` | `is_race_admin(race_id) and created_by = auth.uid()` | `is_race_admin(race_id)` | `is_race_admin(race_id)` |
| `race_car_group_members` | `is_race_admin(race_id) or is_race_member(race_id)` | `is_race_admin(race_id) and is_user_race_participant(race_id, user_id) and added_by = auth.uid()` | - | `is_race_admin(race_id)` · `user_id = auth.uid()` (self-leave, 0075) |

`races` is readable by every club member on purpose - the Races & Meets list and the unified Calendar both show races the caller has no access to; tapping through redirects.

### Eboard & Council

| Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `eboard_channels` | `is_club_admin(club_id)` - regular members never learn it exists | `is_club_admin(club_id) and created_by = auth.uid()` | `is_eboard_member(id)` | `is_eboard_member(id)` |
| `eboard_channel_members` | `is_eboard_club_admin(eboard_channel_id)` (any club admin can read the roster) | `is_eboard_member(...) and is_user_club_admin(club_id, user_id)` | - | `is_eboard_club_owner(...) and user_id <> auth.uid()` · `user_id = auth.uid()` (self-leave, 0074) |
| `eboard_channel_join_requests` | `user_id = auth.uid() or is_eboard_member(...)` | `user_id = auth.uid() and is_eboard_club_admin(...)` | `is_eboard_member(...)` | - |
| `eboard_meetings` | `is_eboard_member(eboard_channel_id)` | `is_eboard_member(...) and created_by = auth.uid()` | `is_eboard_member(...) and created_by = auth.uid()` | `is_eboard_member(...) and created_by = auth.uid()` |

Reading the roster is club-admin-wide, but **being** in it is not - which is why `lib/eboard.ts` checks membership with an explicit `.eq("user_id", userId)` rather than treating "I can see roster rows" as proof of membership.

> **Eboard membership is auto-synced with the admin tier - the request flow is now the exception, not the rule.** 0017's original model (an admin must request or be added) is still what the *policies* say, but three definer triggers, which bypass those policies, have since made membership automatic in the normal case:
>
> | Trigger | Behavior |
> | --- | --- |
> | `handle_new_club` (0072) | Every new club gets an `eboard_channels` row at creation - the "+ Create" prompt is now a dead path. 0072 also backfilled one for every pre-existing club |
> | `handle_new_eboard_channel` (0041, fixed 0043) | Bulk-adds every club member with `role in ('admin','owner')` as a member |
> | `handle_admin_role_membership_sync` (0041, rewritten 0043) | Promotion into the admin tier auto-inserts the Eboard membership row; demotion out of it auto-deletes it. An admin↔owner transition (any ownership transfer) is a no-op, since both sides stay in the tier |
>
> So in practice a club Admin/Owner is *already* an Eboard member, and `request_join_eboard_channel` only matters for someone who left voluntarily (0074) or was manually removed. The **policies still grant nothing automatically** - visibility only - which is why the asymmetry with races is preserved in the matrix below even though the lived behavior differs.

**Self-service leave** (0074/0075) added `user_id = auth.uid()` DELETE policies to `race_members`, `eboard_channel_members` and `race_car_group_members`. All three are *extra permissive* policies alongside the existing admin ones, so admin-removal behavior is untouched. Note that `eboard_channel_members`' admin policy explicitly blocks self-removal (`user_id <> auth.uid()`) - self-leave was deliberately forbidden there before 0074, not merely missing. Leaving the club entirely already cascaded correctly via `handle_club_member_removed_membership_sync` (0043).

### Polls

| Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `polls` | inline `CASE` (below) | `created_by = auth.uid()` + inline `CASE` (below) | `is_poll_creator(id)` | `is_poll_creator(id)` |
| `poll_options` | `can_access_poll(poll_id)` | `is_poll_creator(poll_id)` | - | - |
| `poll_votes` | `can_access_poll(poll_id) and (user_id = auth.uid() or is_poll_creator(poll_id) or not is_poll_private(poll_id))` | `user_id = auth.uid() and can_access_poll(poll_id) and not is_poll_closed(poll_id)` | - | `user_id = auth.uid() and not is_poll_closed(poll_id)` |

```sql
-- polls SELECT (0049) - inline on the row's own columns, never can_access_poll(id)
using (
  case
    when race_id is not null            then is_race_member(race_id)
    when eboard_channel_id is not null  then is_eboard_member(eboard_channel_id)
    else                                     is_club_member(club_id)
  end
)

-- polls INSERT (0049) - must imply the SELECT policy above, or RETURNING fails
with check (
  created_by = auth.uid()
  and case
    when race_id is not null            then is_race_member(race_id) and is_race_admin(race_id)
    when eboard_channel_id is not null  then is_eboard_member(eboard_channel_id)
    else                                     is_club_admin(club_id)
  end
)
```

The `poll_votes` SELECT policy is the row-level half of the privacy design: identity is gated here, while counts live on `poll_options.vote_count`, a column on a row everyone can already read.

## RPC catalogue

Every function below is `language plpgsql` unless noted. "Definer" functions bypass RLS and therefore **re-check authorization in their own body** - the `if not is_*(...) then raise exception 'Not authorized'` line in each is the actual gate.

| RPC | Params | Mode | Enforces / does what RLS alone can't |
| --- | --- | --- | --- |
| `join_club_by_code` | `code text` → `clubs` | definer | Looks up a club by `invite_code` that the caller cannot SELECT (non-members can't read `clubs`), then inserts the membership row |
| `search_clubs` | `query text` → table | definer, sql, stable | Same reason: returns a safe projection of clubs the caller can't otherwise see, excludes clubs already joined, attaches `member_count` and the caller's own `request_status`, limit 10 |
| `join_or_request_club` | `target_club_id uuid` → `'joined'`\|`'requested'` | definer | Branches on `join_policy` (which the caller can't read), then either inserts membership or upserts a `pending` request. Returns which happened |
| `decide_join_request` | `request_id uuid, approve boolean` | definer | Re-checks `is_club_admin`; updates status **and** inserts the membership row in one transaction; sets `clubchat.skip_add_notify` so the membership trigger doesn't fire a duplicate "added by" notification; resolves the admin-inbox notification by `target_path` + `actor_id` |
| `request_join_race` | `target_race_id uuid` → `'joined'`\|`'requested'` | definer | Requires `is_race_club_member`; short-circuits to `'joined'` only on a **real** `race_members` row (0044 - previously any club admin short-circuited without ever inserting one) |
| `decide_race_join_request` | `request_id uuid, approve boolean` | definer | As `decide_join_request`, scoped to `race_members` / `is_race_admin` |
| `request_join_eboard_channel` | `target_eboard_channel_id uuid` → text | definer | Requires `is_eboard_club_admin` (club admin floor); no "club member" tier exists here |
| `decide_eboard_join_request` | `request_id uuid, approve boolean` | definer | Authorized by `is_eboard_member`, **not** `is_club_admin` - Eboard approval rights belong to existing members |
| `transfer_ownership` | `target_club_id uuid, new_owner_user_id uuid` | definer | Owner-only; target must already be a club member; **demotes the caller to `admin` before promoting the target to `owner`**, because `one_owner_per_club` is checked per-statement and the other order would momentarily hold two owners |
| `cast_vote` | `p_option_id uuid` | **invoker** (plain plpgsql) | Deliberately *not* definer - it only touches the caller's own `poll_votes` rows, so ordinary RLS is sufficient and safer. Toggles off an existing vote, clears prior votes on a single-choice poll, then inserts. Re-checks the deadline inline (`is_closed or closes_at < now()`). Never uses `INSERT ... RETURNING` |
| `set_car_group_incharge` | `p_group_id uuid, p_user_id uuid` | definer | Re-checks `is_race_admin`; validates the target is a **current member of that specific group** before writing. `p_user_id = null` clears |
| `delete_account` | none | definer | Anonymizes the caller's `profiles` row and writes `auth.users.banned_until = now() + 100 years` - a table no `authenticated` grant reaches. Not a hard delete (see below) |
| `fetch_unread_channel_summaries` | none → table | definer, sql, stable | One round trip for every channel the caller has unread messages in, avoiding an N+1 loop. Reuses `is_channel_member` so scope logic isn't duplicated |
| `mark_channel_read_and_log` | `p_channel_id uuid` | definer | Re-checks `is_channel_member`; computes the unread count **before** advancing `channel_reads`, and inserts an already-read `chat_caught_up` notification if it was > 0. The app's first RPC-driven `notifications` insert |
| `notify_polls_closing_soon` | none | definer | Not client-callable in practice - invoked by pg_cron every minute. Loops polls within 10 minutes of `closes_at`, fans out per scope, stamps `closing_soon_notified_at` |

`delete_account` anonymizes rather than hard-deletes because ~15 FKs reference `profiles.id` with no `on delete` action, and each would need its own product decision ("does a deleted user's poll stay manageable?"). `banned_until` blocks future sign-in and token refresh but **not an already-issued access token** - the client must call `supabase.auth.signOut()` immediately after.

## Permission matrix - Owner / Admin / Member

Club-wide actions (0043's model):

| Action | Owner | Admin | Member |
| --- | --- | --- | --- |
| Read club, chat, calendar, routines, races list, news | ✅ | ✅ | ✅ |
| Send messages, react, report, mention | ✅ | ✅ | ✅ |
| Pin / announce in club chat | ✅ | ✅ | ❌ |
| Create/edit/delete events, routines, races, news posts | ✅ | ✅ | ❌ |
| Create club polls | ✅ | ✅ | ❌ |
| Edit club profile, avatar, `join_policy` | ✅ | ✅ | ❌ |
| Approve/deny club join requests, add members | ✅ | ✅ | ❌ |
| Promote Member → Admin, demote Admin → Member | ✅ | ✅ | ❌ |
| Remove a Member | ✅ | ✅ | ❌ |
| Remove an **Admin** | ✅ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ |
| Delete the club | ✅ | ❌ | ❌ |
| Leave the club | ❌ (blocked - would leave it ownerless) | ✅ | ✅ |

Race and Eboard scope - **the rule that trips people up**:

> Admin/Owner status grants **management authority** over every race and the Eboard channel. It does **not** grant chat access, poll visibility, or Eboard membership. Those require a real `race_members` / `eboard_channel_members` row.

| Action | Club Owner/Admin **without** a roster row | Club Owner/Admin **with** a roster row | Member with a roster row |
| --- | --- | --- | --- |
| See the race exists, its name and date | ✅ | ✅ | ✅ |
| Read/post in race chat | ❌ | ✅ | ✅ |
| Pin/announce in race chat | ❌ | ✅ | ❌ |
| See or create race polls | ❌ | ✅ / create: ✅ | see: ✅, create: ❌ |
| Approve race join requests, add/remove roster | ✅ | ✅ | ❌ |
| Edit Meet Information, manage car groups | ✅ | ✅ | ❌ (read-only) |
| Be assigned to a car group | ❌ | ✅ | ✅ |
| Know the Eboard channel exists | ✅ | ✅ | ❌ |
| Read/post in Eboard chat, see Eboard meetings/polls | ❌ | ✅ | n/a |
| Approve Eboard join requests, add Eboard members | ❌ | ✅ | n/a |
| Delete the Eboard channel | ❌ | ✅ | n/a |

The asymmetry is real and intentional: for races, *management* is club-admin-wide but *access* is roster-only; for Eboard, both management and access are members-only, and club-admin status only grants visibility plus eligibility to request. **In practice the Eboard column above is almost always ✅**, because the auto-sync triggers described earlier insert the membership row on promotion - the policies grant nothing automatically, the triggers do. Races have no such auto-sync (0041's version was reversed by 0044), so the race columns mean exactly what they say.

**Gallery** is a pure read path, not a feature with its own authorization: `fetchChannelPhotos(channelId)` selects `messages` where `message_type = 'photo' and deleted_at is null`, then batch-signs the paths. It is gated entirely by the existing `messages` SELECT policy plus the `message-photos` bucket's own `is_channel_member` read policy - no new table, no new policy, and it inherits every scope rule above for free. **Mentions** likewise ride on existing checks: `message_mentions` SELECT requires the parent message to be in an accessible channel, and INSERT requires being that message's own sender.

Poll authorship rights by scope:

| Scope | Who can create | Who can see | Who can close/reopen/delete |
| --- | --- | --- | --- |
| Club | Admin/Owner | every club member | creator only |
| Race | `is_race_member AND is_race_admin` | `is_race_member` only | creator only |
| Eboard | any Eboard member | Eboard members only | creator only |

## Invariants

1. **Every table has RLS enabled and at least a SELECT policy.** A table with an INSERT policy but no SELECT policy will fail every `.insert().select()` - the exact trap that produced this repo's longest debugging session.
2. **A SELECT policy must cover "I just created this row."** Either bind the check to the row's own columns, or add an explicit `created_by = auth.uid()` clause when membership only appears via a trigger afterward.
3. **An INSERT `with check` must imply that table's SELECT `using`.** Otherwise the write succeeds and the `RETURNING` re-check fails with a misleading "new row violates row-level security policy."
4. **A SELECT policy must never route through a function that re-queries its own table by id.** Write the branch inline on the row's columns.
5. **Every `security definer` function re-checks authorization in its own body.** Definer bypasses RLS entirely; the `raise exception 'Not authorized'` guard *is* the policy.
6. **`race_members` / `eboard_channel_members` are the sole sources of truth for access.** Never substitute `is_club_admin` for either - it has been wrong in five separate places (0044 × 3, 0046, 0048, 0049, 0050).
7. **Audience queries that filter club roles must use `role in ('admin','owner')`.** A bare `role = 'admin'` silently excludes lone-Owner clubs; this bug shipped four times.
8. **The Owner cannot leave or be removed.** Only `transfer_ownership()` or deleting the club changes who the owner is.
9. **FK `on delete cascade` is not subject to RLS on the child table.** Deleting a club really does remove the owner's `club_members` row even though every DELETE policy forbids removing it directly.

## Extension points

- **New table checklist:** enable RLS → write SELECT first → write INSERT so it implies SELECT → decide whether writes are any-admin (`club_posts`, `races`, `routine_workouts`) or creator-only (`eboard_meetings`, `polls`) → **write the DELETE policy in the same migration** (three tables shipped without one: `race_members` 0037, `eboard_channel_members` 0039, `race_car_groups` 0022).
- **New scope** = one branch in `is_channel_member`, `is_channel_admin`, `can_access_poll`, plus every notification audience function. Grep `eboard_channel_id is not null` for the full list.
- **Self-service actions** are added as an extra permissive policy (`user_id = auth.uid()`) alongside the admin one, never by widening the admin policy - see 0074/0075.
- **Verifying a policy** without the app: `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid>"}', true);` then run the query. This is how 0038, 0043 and 0075 were confirmed.

## Known gaps

- **Pinning is not enforced in the database** - a member can pin their own message, and can retro-flip it to `message_type = 'announcement'`, through the sender branch of the `messages` UPDATE policy. Full detail and the quoted policy are in the Chat section above. This is the highest-severity known authorization gap in the schema.
- **The Eboard request/approve flow is largely vestigial** now that admin-tier membership auto-syncs. The policies and the RPCs still exist and still work, but a normal club never exercises them.
- No rate limiting anywhere: a member can spam messages, reports, reactions, or join requests as fast as the network allows.
- `message_reports` has no UPDATE policy, so "reviewed but not dismissed" is not representable - a report is either open or deleted.
- Storage objects have no cleanup path; deleting the parent row leaves the file. See [Media & storage](07-media-and-storage.md).
- `poll_options` are immutable after creation (no UPDATE/DELETE policy) - editing a poll's options requires deleting and recreating the poll.
- `notifications.resolved_outcome` is writable via the recipient's own UPDATE policy; nothing prevents a client from setting it directly.
- The `authenticated` grant is table-wide (`grant ... on all tables`), so adding a table without enabling RLS exposes it completely. RLS-enable is the only thing standing between a new table and the public.
