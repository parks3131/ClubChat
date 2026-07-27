# Migration Checklist

Pre-flight checklist for authoring a new `supabase/migrations/00NN_*.sql` - work top to bottom before applying it anywhere.

## 1. File and naming

- [ ] Numbered sequentially, one past the current highest file: `00NN_short_description.sql`.
- [ ] **Never edit a migration that has already been applied.** A correction is always a *new* file, never an in-place edit - otherwise `supabase db reset` and any already-migrated database diverge permanently. (Precedent: `0078` modeled race pinning wrong and was superseded by `0079`, not edited.)
- [ ] Superseding an earlier migration? Say so in the new file's header comment and name the file it replaces.

## 2. Enums

- [ ] Any `alter type <enum> add value '<x>'` sits **alone in its own migration file**, with nothing else in it.

Postgres cannot use a newly added enum value later in the *same* transaction when the type already existed before that transaction started - this caused a real `supabase db reset` failure (`0042`). Every enum addition since (`0047`, `0051`, `0064`, `0066`, `0076`) is its own file.

- [ ] Exception, used deliberately: two values added in one file *only* when neither is referenced within that same migration (`0069` added `poll` and `event` together).

## 3. RLS - the two failure modes that have actually bitten

- [ ] Every RLS-enabled table has a **SELECT policy**. A table with an INSERT policy and no SELECT policy is default-deny on read, and every `.insert().select()` against it fails with the misleading `new row violates row-level security policy`.

- [ ] **Does any client code call `.insert().select()` on this table?** (supabase-js `.insert().select()` = `INSERT … RETURNING`, which re-checks the returned row against the **SELECT** policy.) If yes:
  - [ ] The SELECT policy covers *"I am the one who just created this row"* - not only *"I am now a member/participant of it"*. Membership granted by an `AFTER INSERT` trigger does not exist yet when RETURNING is evaluated. Precedent: `clubs`' SELECT policy is `is_club_member(id) or created_by = auth.uid()`.
  - [ ] The SELECT policy is written **inline, bound to the row's own columns** - not routed through a security-definer function that re-queries the same table by id. A self-referential lookup back into the table currently being inserted into fails under RETURNING even with no trigger involved (found live on `polls`; the fix was an inline `case … when race_id is not null then … end` over the row's own columns).

- [ ] Every operation the app performs has a matching policy - check `select` / `insert` / `update` / `delete` individually. Missing DELETE policies were a real recurring gap (`race_members` had none from `0016` until `0037`; `eboard_channel_members` none from `0017` until `0039`).
- [ ] Policies are scoped `to authenticated` (or deliberately otherwise).
- [ ] New helper functions (`is_*`) are `security definer` and owned appropriately.
- [ ] Any admin-tier check - in a **helper function**, policy, or audience query - uses `role in ('admin','owner')`, **never `role = 'admin'`**. This omission has now shipped five times since the Owner tier landed in 0043 (`0046`, `0048`, then `is_user_club_admin` in `0080`). Authoritative sweep against the live DB, not just the files (superseded definitions still appear in old migrations):

```sql
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and pg_get_functiondef(p.oid) ~ 'role = ''admin'''
  and pg_get_functiondef(p.oid) !~ 'new\.role|old\.role';  -- expect zero rows (a `set role='admin'` write, e.g. transfer_ownership, is legitimate)
```

## 4. Grants

- [ ] Explicit `grant` statements added for every new table, sequence, and function to `authenticated` (and `anon` where genuinely needed). RLS is not a substitute for a grant - this repo keeps them explicit (`0004_grants.sql` set the pattern).

## 5. Indexes

- [ ] Any foreign-key column this feature filters directly (a client-side `.eq(...)`) has an index, unless an existing PK or unique constraint already covers it.
- [ ] Composite index where the query filters on two columns together (precedent: `(poll_id, user_id)` on `poll_votes`).

## 6. Realtime

- [ ] A new table is added to the `supabase_realtime` publication **only if something actually subscribes to it**. Do not add tables speculatively - currently only `messages`, `message_reactions`, and `notifications` are published.

## 7. Notification triggers

- [ ] New `notification_type` enum value added in its own file (see §2).
- [ ] Audience query uses `role in ('admin','owner')` - **never `role = 'admin'`**.

This exact bug recurred **four separate times** after the Owner role landed in `0043`: `notify_club_join_request` and `notify_race_join_request` (fixed in `0046`), then `notify_announcement` and `notify_poll_created` (fixed in `0048`). A club whose only privileged member is the Owner silently receives nothing. Grep for `role = 'admin'` across `supabase/migrations/` before shipping.

- [ ] Enum literals inserted via `INSERT … SELECT` carry an explicit `::notification_type` cast - a `select distinct … from (… union …)` resolves the literal as `text` first and defeats Postgres's implicit unknown-literal-to-enum cast (real 400-error bug, fixed in `0036`).
- [ ] Scope-aware audience: club / race / eboard branches computed separately, matching that scope's *actual* access rule. A race audience is `race_members` only - club admins without a real roster row cannot open race chat and must not be notified about it.
- [ ] Creator excluded from their own creation notification; not excluded from closing-soon-style notifications.
- [ ] `target_path` points at a route that still exists (a stale one shipped once - `0046`).

## 8. Types

- [ ] `types/database.ts` updated **by hand** for every new/changed table.
- [ ] Each table entry has all four of `Row`, `Insert`, `Update`, **and `Relationships: []`**.
- [ ] The schema object has `Tables`, **`Views: {}`**, and **`Functions: {}`** all present.

Omitting any of these silently resolves query types to `never` instead of erroring loudly - the type check passes and the runtime breaks.

## 9. Verify

Apply to a live local DB without a reset (then register it by hand in `supabase_migrations.schema_migrations` - `version`, `name`):

```bash
docker exec supabase_db_Club_Chat psql -U postgres -d postgres -f supabase/migrations/00NN_description.sql
```

Confirm the whole chain still replays cleanly from scratch - this is the check that catches enum-transaction errors and ordering bugs:

```bash
supabase db reset
```

> `supabase db reset` wipes the local database, which accumulates real usage data between sessions. Only run it against a DB you have confirmed is disposable.

- [ ] RLS verified by impersonating a real caller in `psql` (`set local role authenticated` + `select set_config('request.jwt.claims', …)`), not just by reading the policy text.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm test` passes.
- [ ] Live smoke test of the feature path, including the `.insert().select()` path specifically.

## 10. Document

- [ ] Add the migration to the migration list in `SPEC/TECH/`, one entry, describing what it does and why - including any earlier migration it supersedes.
