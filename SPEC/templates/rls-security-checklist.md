# RLS Security Guide

How to write, review, and prove an RLS policy so this app never ships a bad one.

This is the **attacker's-eye companion** to two other docs - read them together:

- [`SPEC/TECH/02-security-rls.md`](../TECH/02-security-rls.md) - the reference: every helper, policy, RPC, and the 9 invariants. *What the rules are.*
- [`SPEC/templates/migration-checklist.md`](migration-checklist.md) - the pre-flight for a new migration. *Mechanical checks before applying.*
- **This file** - *how to think like someone trying to break in, and how to prove they can't.*

Adapted from the [vibe-security](https://github.com/raroque/vibe-security-skill) audit method (Chris Raroque / Aloa) and this repo's own five-times-repeated bug history.

---

## 0. Why this matters more here than almost anywhere

**There is no application server.** The Expo client authenticates as the `authenticated` Postgres role and talks to the database directly. Row-level security is not *a* layer of defense - **it is the only one**. Every hidden button, every `isAdmin` prop, every disabled input is UX. An attacker does not use your UI; they open the network tab, copy the `sb_publishable_…` key (it is in the client bundle, it is *meant* to be), and issue raw PostgREST calls with whatever body they like.

So the only question that ever matters is:

> **If I strip away the app entirely and let an authenticated user send any query they want, what can they read, write, or destroy?**

The whole rest of this file is ways to answer that question honestly.

---

## 1. The one principle

**Never trust the client. Enforce everything on the row.**

Any value that decides *what a user is allowed to do* - their role, their membership, ownership of a row, whether a poll is closed - must be checked against the database at query time, bound to columns the user cannot forge. If the check lives in TypeScript, in a request body, or in a prop, it does not exist.

Corollary for this repo: **a `security definer` function bypasses RLS, so it must re-check authorization in its own body.** The `if not is_*(…) then raise exception 'Not authorized'` line *is* the policy. A definer function without that guard is an open door.

---

## 2. Red-flag catalogue

Every pattern below has either shipped as a real bug in this repo or is the exact thing the skill exists to catch. Grep for them before shipping (copy-paste sweep in §5).

### 2.1 The escalation trap - sensitive field on a user-writable row

The single most common vibe-coded breach: a column that grants power sits on a row the user is allowed to `UPDATE`. The video's example was `subscription_status` / `rate_limit` on the user table; the same shape here would be a **role or entitlement column on `profiles`**, which every user can update via `auth.uid() = id`.

- ❌ `profiles.is_admin`, `profiles.role`, `profiles.credits`, `profiles.is_premium` - a user would just set it to whatever they want.
- ✅ **Current state (verified):** `profiles` carries only `full_name`, `avatar_url`, `created_at`, `bio`, and detail fields. **No privilege lives on it.** Keep it that way.
- ✅ Privilege lives on `club_members.role`, and its UPDATE policy's `with check (role in ('member','admin'))` plus the owner guards make it un-escalatable to `owner`. Only `transfer_ownership()` (definer, owner-only) can mint an owner.

**Rule: authorization state never goes on a table whose write policy is "the user owns this row."** If you must add such a field, put it on a table the user cannot write, or gate the write through a definer RPC that validates it.

### 2.2 `USING (true)` and `auth.uid() IS NOT NULL`

"Any logged-in user can see/do this." Almost always a leak.

- The **only** legitimate `USING (true)` in this repo is `profiles` SELECT - names and avatars must be readable across rosters and chat, and profiles holds nothing sensitive (see 2.1). That exception is *only* safe because of 2.1.
- Any *new* `USING (true)` is a defect until proven otherwise. Scope to `is_club_member(...)`, `user_id = auth.uid()`, or the relevant `is_*` helper.

### 2.3 Missing `WITH CHECK` on INSERT/UPDATE

`USING` controls which rows you can *see/target*; `WITH CHECK` controls what the row is allowed to *become*. Omit it and a user can reassign a row to someone else, or flip a field the `USING` clause never examined.

- Every INSERT/UPDATE policy needs a `with check` that (a) pins ownership (`sender_id = auth.uid()`, `user_id = auth.uid()`, `created_by = auth.uid()`) and (b) constrains any privileged column.
- Real precedent: the `messages` UPDATE policy legitimately allows a sender's body edits, but had **no column scope** - so a member could `update messages set pinned = true` or retro-flip `message_type` to `'announcement'`. A plain policy can't express "you may edit the body but not the pin flag," so **0081 added a `before update` trigger** (`enforce_message_admin_fields`) that raises if a non-admin touches `pinned` or `message_type`. When a policy can't express a column restriction, a trigger is the tool.

### 2.4 The `role = 'admin'` audience bug (shipped 5×)

After the Owner tier landed (0043), any check written `role = 'admin'` silently excludes a club whose only privileged member is the Owner. This exact omission shipped **five times**: `notify_club_join_request`, `notify_race_join_request` (fixed 0046), `notify_announcement`, `notify_poll_created` (fixed 0048/0049/0050), and `is_user_club_admin` (fixed 0080).

- **Rule: every admin-tier check uses `role in ('admin','owner')`** - in helpers, policies, *and* notification-audience queries. Never a bare `role = 'admin'`.
- Legitimate exceptions: `new.role = 'admin'` / `old.role = 'admin'` (a role-*transition* check) and `set role = 'admin'` (a deliberate write, e.g. `transfer_ownership`). The sweep in §5 excludes those.

### 2.5 INSERT that doesn't imply SELECT (the `RETURNING` trap)

supabase-js `.insert().select()` compiles to `INSERT … RETURNING`, and Postgres **re-checks the returned row against the SELECT policy.** If the INSERT `with check` can be satisfied by a row the SELECT `using` would reject, the write succeeds and then throws a misleading `new row violates row-level security policy`.

- The INSERT `with check` must logically **imply** the SELECT `using`.
- The SELECT policy must cover *"I just created this"* - membership added by an `AFTER INSERT` trigger does **not** exist yet at RETURNING time. Precedent: `clubs` SELECT is `is_club_member(id) or created_by = auth.uid()`; drop the second clause and club creation breaks entirely.

### 2.6 A SELECT policy that re-queries its own table

A `SECURITY DEFINER` helper that looks the row up *by id in the same table being inserted into* fails under RETURNING even with no trigger involved. Write the branch **inline on the row's own columns**. Precedent: `polls` SELECT is an inline `case when race_id is not null then is_race_member(race_id) …`, deliberately **not** `can_access_poll(id)`.

### 2.7 `is_club_admin` used where a roster row is required

Management authority (`is_club_admin`) is **not** access. Race chat, race polls, and Eboard membership require a real `race_members` / `eboard_channel_members` row. Substituting `is_club_admin` has been wrong in five separate places (0044 ×3, 0049, 0050). When gating *access to scoped content*, check the roster table, never the club-admin helper.

### 2.8 Missing DELETE (and other verb) policies

Default-deny means a forgotten verb silently blocks a feature - or a forgotten *restriction* silently allows one. Three tables shipped with no DELETE policy (`race_members` 0037, `eboard_channel_members` 0039, `race_car_groups` 0022). Check all four verbs (SELECT/INSERT/UPDATE/DELETE) individually for every table.

### 2.9 `SECURITY DEFINER` without a pinned `search_path`

A definer function with a mutable `search_path` can be hijacked via a shadowing object in another schema. **Every definer function must be `security definer set search_path = public`** (or `= ''`). Verified: all definer functions in this repo pin it. Keep new ones consistent.

### 2.10 Storage buckets

Buckets have their own RLS on `storage.objects`, separate from table policies. A bucket read/write policy must scope to the same membership rule as the parent row (e.g. `message-photos` is gated by `is_channel_member`). Adding an upload path? Add the matching bucket policy in the same migration, scoped - never `bucket_id = 'x'` alone (that's `USING (true)` in disguise).

---

## 3. Adversarial scenarios - ask these of every new table

Generic "audit my RLS" prompts miss the interesting bugs. Ask *specific*, *creative* questions - this is the part of the method the video stresses. For each new or changed table, write the answer down:

**Cross-user read**
- Can user A read user B's row by guessing/enumerating an id? (Try it in psql as A - §4.)
- Does any SELECT policy leak rows through a `join` the user shouldn't traverse?
- Do private poll votes stay private? (Identity is gated on `poll_votes` SELECT; counts live on `poll_options.vote_count`.)

**Privilege escalation**
- Can a Member make themselves Admin/Owner by writing `club_members.role` directly?
- Can a Member pin or announce by `UPDATE`-ing a message column the INSERT policy guarded but the UPDATE policy didn't? (This was 2.3.)
- Can a club Admin *without a roster row* read race/Eboard chat by calling the endpoint directly?
- Can a non-creator close/delete someone else's poll or Eboard meeting?

**Write forgery / ownership**
- Can a user insert a row with `sender_id` / `user_id` / `created_by` set to *someone else*? (WITH CHECK must pin it to `auth.uid()`.)
- Can a user insert into a table on behalf of a club/channel they don't belong to?
- Can a user file a request, then also *approve* it? (Approval must require the admin/member tier, not the requester.) Is the decide RPC idempotent so a double-tap can't double-process? (0082.)

**Definer RPC abuse**
- Every `security definer` RPC: strip the caller's context - does the `if not is_*(…) then raise` guard actually block an unauthorized caller? Call it in psql as a nobody and confirm it raises.
- Does the RPC validate its *arguments* (e.g. target is really a member of *that* group) or just the caller?

**Deletion / cascade**
- Can a user delete a row they should only be able to leave? Can they delete the Owner's membership? (Blocked - only `transfer_ownership` or club deletion changes the owner.)
- Does an `on delete cascade` remove something a DELETE policy is supposed to protect? (Cascades ignore child-table RLS - by design, but know where it happens.)

If any answer is "yes" or "I'm not sure," it's a finding. Prove it in §4.

---

## 4. Prove it in psql - impersonate the attacker

Reading policy text is not verification. Become the user and run the query. This is how 0038, 0043, and 0075 were confirmed.

```sql
-- Act as a specific authenticated user (use a real profiles.id / auth.users.id)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<ATTACKER-UUID>"}', true);

-- Now run the exact thing an attacker would send. Examples:

-- (a) Can I read a club I'm not in?
select * from clubs where id = '<SOME-CLUB-I-AM-NOT-IN>';        -- expect 0 rows

-- (b) Can I promote myself?
update club_members set role = 'owner'
  where user_id = '<ATTACKER-UUID>' and club_id = '<MY-CLUB>';    -- expect 0 rows / error

-- (c) Can I pin my own message as a plain member?
update messages set pinned = true where id = '<MY-MESSAGE>';      -- expect: trigger raises

-- (d) Can I forge a message from someone else?
insert into messages (channel_id, sender_id, body, message_type)
  values ('<CHANNEL>', '<VICTIM-UUID>', 'x', 'text');            -- expect: policy violation

-- (e) Does a definer RPC block me?
select decide_join_request('<REQUEST-I-DONT-OWN>', true);        -- expect: 'Not authorized'

reset role;
```

Run each attack **twice**: once as a user who *should* be allowed (expect success) and once as one who *should not* (expect 0 rows or an error). A policy that only ever returns "success for the good case" is untested.

> `Alert.alert` is a no-op on web, and a PostgREST call can report success while RLS silently filtered the rows to zero. Confirm the row **actually changed in Postgres** for anything destructive - don't trust the client's "done."

---

## 5. Automated sweep - run before every RLS change

Copy-paste. Zero findings expected; investigate anything that prints.

```bash
cd "$(git rev-parse --show-toplevel)"

echo "== bare role = 'admin' (should be role in ('admin','owner'); transitions are fine) =="
grep -rniP "role\s*=\s*'admin'" supabase/migrations/ \
  | grep -viP "new\.role|old\.role|set role" \
  | grep -viP "^\S+:\d+:\s*--"   # drop comment lines

echo "== USING (true) outside the profiles SELECT exception =="
grep -rniP "using\s*\(\s*true\s*\)" supabase/migrations/

echo "== 'any logged-in user' anti-pattern =="
grep -rniP "auth\.uid\(\)\s+is\s+not\s+null" supabase/migrations/

echo "== security definer functions missing a pinned search_path =="
grep -rniP "language (sql|plpgsql)\s+security definer" supabase/migrations/ \
  | grep -viP "search_path"
```

**Authoritative version - run against the live DB, not the files** (superseded definitions still sit in old migration files and will false-positive):

```sql
-- Any function whose CURRENT body has a bare audience/authorization role = 'admin'.
-- Expect zero rows. (new.role / old.role transitions and `set role` writes excluded.)
select p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and pg_get_functiondef(p.oid) ~ 'role = ''admin'''
  and pg_get_functiondef(p.oid) !~ 'new\.role|old\.role|set role';

-- Every table in public with RLS enabled but ZERO policies = fully locked or,
-- if a grant exists, a silent trap. Expect: no surprises.
select c.relname, c.relrowsecurity,
       (select count(*) from pg_policy pol where pol.polrelid = c.oid) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by policies, c.relname;

-- Tables the authenticated role can reach but RLS is OFF = wide open.
-- (The authenticated grant is table-wide, so RLS-enable is the ONLY thing
--  standing between a new table and the public.) Expect zero rows.
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;
```

That last query encodes invariant #10 from the reference: because `grant … on all tables … to authenticated` is blanket, **a new table with RLS left off is exposed to every user the moment it exists.** Enabling RLS is not optional cleanup - it is the wall.

---

## 6. Running the vibe-security skill against this repo

The [vibe-security](https://github.com/raroque/vibe-security-skill) skill is an agent audit pass. Two ways to use it here:

1. **On the codebase** - point Claude Code at the skill and let it read `supabase/migrations/`, `lib/`, and the client. It catches secrets, over-permissive policies, and missing-check patterns across the whole 9-domain checklist (secrets, DB access, auth, rate-limiting, payments, mobile, AI, deployment, data access).
2. **Against the live schema via MCP** - far better than pasting SQL dumps. Connect the **Supabase MCP** so the agent inspects real policies, grants, and function bodies directly. The `pg_proc` / `pg_policy` sweeps in §5 are exactly what it should confirm.

When you run it, drive it with the *specific* §3 scenarios, not a generic "check my RLS" - that generality is precisely what let the video author's own audit miss his subscription/rate-limit bug.

**Known gaps the skill will (correctly) flag - already tracked, not regressions:**

- **No rate limiting anywhere.** A member can spam messages, reports, reactions, or join requests as fast as the network allows. There is no AI/paid endpoint to bankrupt, so the *financial* blast radius is low, but it's still a DoS/abuse vector. See [remediation plan](../TECH/14-remediation-plan.md).
- **`notifications.resolved_outcome`** is writable via the recipient's own UPDATE policy (only ever set by `decide_*` RPCs in practice).
- **Storage objects have no cleanup path** - deleting a parent row orphans the file.
- **`message_reports` has no UPDATE policy** - a report is open or deleted, never "reviewed."

Flag anything *new* the skill finds; don't re-litigate these.

---

## 7. The short version - pin this above your desk

1. RLS is the only access control. The client is the attacker's tool, not your enforcement layer.
2. Authorization state never lives on a row its subject can `UPDATE`.
3. `role in ('admin','owner')` - never bare `role = 'admin'` (except `new/old.role` transitions).
4. INSERT `with check` must imply the SELECT `using`, and SELECT must cover "I just made this."
5. SELECT policies branch **inline on the row's columns**, never re-query their own table by id.
6. Every `security definer` function re-checks auth in its body and pins `search_path`.
7. Access to scoped content = the **roster row**, never `is_club_admin`.
8. Prove it as the attacker in psql - both the allowed and the forbidden case - before you call it done.
