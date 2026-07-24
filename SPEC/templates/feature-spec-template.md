# Feature Spec: `<Feature Name>`

Fill-in template pairing one PRD entry (what and why) with one TECH entry (how) for a single new feature; copy it, fill it in, then fold the finished halves into `SPEC/PRD/` and `SPEC/TECH/`.

<!-- Delete every instruction comment before committing. Keep the filled file short - tables over prose. -->

| | |
|---|---|
| Status | `<draft / approved / in progress / done>` |
| Owner | `<name>` |
| Date | `<YYYY-MM-DD>` |
| Related ADR(s) | `<SPEC/decisions/000N-… or none>` |

## Summary

<!-- 2-3 sentences. What the user gets, and why now. If this came from a founder wireframe or a live founder request, say so and link/describe it - that provenance has mattered repeatedly. -->

`<summary>`

## User stories

<!-- One row per story. Keep them behavioral, not implementation. -->

| As a… | I want to… | So that… |
|---|---|---|
| `<Owner / Admin / Member / Non-member>` | `<action>` | `<outcome>` |

## Scope

**In scope**

- `<item>`

**Out of scope**

<!-- Be explicit. "Deliberately not X" is worth writing down - several past features were mis-scoped by assuming an adjacent feature's rules applied. -->

- `<item - and why it's deliberately excluded>`

## Permissions matrix

<!-- Fill every cell with yes / no / conditional-and-the-condition. Do not leave blanks.
     Reference points already in the codebase, pick one deliberately rather than by analogy:
       - "any club admin" (Races' Meet Info, Routines, Events, Club Posts)
       - "creator only" (Eboard Meetings, Polls close/reopen/delete)
       - "real membership row required" (Race chat/polls, Eboard everything)
     Confirm the choice with the founder rather than inferring it. -->

| Capability | Owner | Admin | Member | Non-member |
|---|---|---|---|---|
| View | | | | |
| Create | | | | |
| Edit (own) | | | | |
| Edit (others') | | | | |
| Delete | | | | |

## Data model changes

| Table | New / changed | Columns | Notes |
|---|---|---|---|
| `<table>` | `<new / altered>` | `<col type constraints>` | `<cascade behavior, uniqueness, defaults>` |

- Enum values added: `<enum: value(s), or none>` <!-- Each `alter type … add value` goes in its OWN migration file - see migration-checklist.md. -->
- Foreign keys and their `on delete` behavior: `<…>`
- Indexes needed: `<any FK column this feature filters directly with .eq(), or none>`
- Storage bucket needed: `<name, public/private, path shape, or none>`

## RLS policy plan

| Table | Operation | Policy expression | Rationale |
|---|---|---|---|
| `<table>` | select | `<…>` | |
| `<table>` | insert | `<…>` | |
| `<table>` | update | `<…>` | |
| `<table>` | delete | `<…>` | |

**Does any client code do `.insert().select()` (i.e. `INSERT … RETURNING`) on a table in this feature?** `<yes / no>`

<!-- If yes, both of these must hold, or the insert fails with "new row violates row-level security policy":
     1. The SELECT policy must also cover "I am the one who just created this row" - not only "I am now a member/participant of it",
        because a trigger that grants membership runs AFTER the RETURNING check.
     2. The SELECT policy must be written inline against the row's OWN columns, NOT routed through a security-definer
        function that re-queries the same table by id. Both variants have burned this repo; see the TECH RLS notes. -->

- SELECT policy covers the just-created row: `<how>`
- SELECT policy binds to the row's own columns (no self-referential lookup): `<yes / n-a>`
- Explicit `grant` statements needed: `<…>`

## Realtime and notification impact

| Question | Answer |
|---|---|
| New table subscribed via realtime? | `<yes → add to supabase_realtime publication / no>` |
| New `notification_type` enum value? | `<value, in its own migration / none>` |
| Notification trigger or RPC? | `<trigger on <table> / RPC / none>` |
| Audience (exactly who receives it) | `<…>` |
| Creator excluded from their own notification? | `<yes / no - creation notifications exclude, closing-soon does not>` |
| `target_path` the row will carry | `<literal route string>` |
| Admin-role filter used | Must be `role in ('admin','owner')`, never `role = 'admin'` |
| Auto-posts a chat card? | `<yes → which channel, which message_type / no>` |

## Navigation and routes

| Route | Screen file | Entry points | Guard |
|---|---|---|---|
| `<path>` | `<app/…>` | `<where the user gets here from>` | `<redirect if not permitted>` |

- Reachable by direct URL / deep link? `<yes → needs an explicit headerLeft via makeBackHeaderLeft, since canGoBack() is false>`
- Reachable from more than one tab? `<yes → use the ?from= origin param pattern, not router.back()>`

## Components touched or created

| File | New / modified | Change |
|---|---|---|
| `components/<X>.tsx` | | |
| `lib/<y>.ts` | | |
| `types/database.ts` | modified | Add `Row`/`Insert`/`Update`/`Relationships` for each new table |

<!-- Prefer parametrizing an existing shared component (ChatScreen, PollsListScreen, CalendarScreen…) over forking a copy per scope. -->

## Test plan

| Level | What |
|---|---|
| Unit (`npm test`) | `<pure logic extracted into lib/ and tested>` |
| Type (`npx tsc --noEmit`) | Clean, strict mode |
| RLS | `<direct psql check impersonating each role: set local role authenticated + set_config('request.jwt.claims', …)>` |
| Live smoke | `<the exact click-through path, per role>` |
| Direct-URL | `<hit each new route by URL/refresh - catches missing back buttons and missing guards>` |
| Native | `<anything touching files, uploads, or crypto must be exercised on a real device, not just web>` |

## Rollout and verification

1. Write and apply the migration(s) - see `SPEC/templates/migration-checklist.md`.
2. Confirm `supabase db reset` replays cleanly from scratch.
3. `npx tsc --noEmit`
4. `npm test`
5. Restart the dev server (CI mode disables Fast Refresh; route/layout edits need a restart):

```bash
CI=1 npx expo start --web
```

6. Smoke-test each role's path live.
7. `<any founder confirmation needed before calling it done>`

## Definition of done

- [ ] `npx tsc --noEmit` passes
- [ ] `npm test` passes
- [ ] Live smoke test completed for every role in the permissions matrix
- [ ] Direct-URL navigation to each new route behaves (back button present, guard fires)
- [ ] `supabase db reset` replays every migration cleanly
- [ ] `types/database.ts` updated by hand
- [ ] RLS verified against the actual policy, not just the client-side gate
- [ ] Notification audience verified (right people, creator handled correctly)
- [ ] PRD entry and TECH entry written into `SPEC/`
- [ ] ADR filed if this decision is architecturally load-bearing
