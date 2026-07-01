# ClubChat — Project Spec & Handoff

This file is the single source of truth for what ClubChat is, why it's shaped
the way it is, what's been built, what broke along the way, and what's next.
Read this before making architectural decisions or resuming work in a new
session.

## 1. Product vision (in the founder's own words)

The user runs/participates in a running club that currently coordinates
entirely through GroupMe plus ad-hoc tools: workout plans get written in an
Excel sheet, screenshotted, pasted into the group chat, and manually pinned
as an "announcement." Race logistics (carpools, meeting times, results) get
handled by spinning up a brand new, separate GroupMe group per race. None of
this is structured — it works only because people manually replicate
structure GroupMe doesn't provide.

ClubChat is meant to be a purpose-built replacement, structured as a
**template every club can use**:

- **General club** (the persistent, top-level space for a club):
  - **Chat**: text, photos, videos, reactions, announcements, polls,
    pinning.
  - **Calendar**: races, practices/meets, team bonding events, volunteer
    work, etc. Tapping an entry shows a detail view (think: a cleaner
    Strava/Corros-style event view).
  - **Weekly routines**: admin/captain-authored recurring workout plans,
    sport-specific (e.g. swim sets for a swim club, mileage/workout plans
    for a running club). Reference point: Strava/Corros-style structured
    training plans.
- **Race / Meet** (a special, temporary sub-space spawned by a calendar
  event of type "race"): effectively a **mini-club nested inside the
  parent club** —
  - Its own scoped chat and membership (members must already belong to the
    parent club to be added to a race).
  - Its own workout plan, specific to that race.
  - Photos.
  - A results link (e.g. a Google Photos album / results URL).
  - Start/end time and location ("race room" / meeting point).
  - Car assignments — sub-groups of members who are commuting together.

MVP prioritization the user and I agreed on: **club chat → club
create/join + roles → calendar** first (these alone already beat
GroupMe+Excel-screenshots), then **weekly routines**, then the full
**Race sub-flow** (sub-chat, workout, carpool, results), then polls/video
as a final layer.

## 2. Domain model

```
User (auth.users + profiles)
 └─ Club  (top-level container, has an invite_code)
     ├─ ClubMember (user_id, role: admin | member)
     ├─ Channel (1:1 with Club today; will gain a nullable race_id later
     │           so race sub-chats reuse the same messages table)
     │   └─ Message (text | photo | announcement, pinned, reactions)
     ├─ CalendarEvent (type: race | practice | team_bonding | volunteer | other)
     │   └─ (a "race"-typed event will spawn a Race — not yet built)
     ├─ Routine (weekly workout plan — not yet built)
     └─ Race (mini-club nested under Club — not yet built)
         ├─ its own membership (subset of Club membership)
         ├─ its own Channel/Messages
         ├─ workout plan
         ├─ results link
         ├─ location / start-end time
         └─ Carpool groups
```

Key design decision: **a Race is not a separate concept from a Club, it's
the same shape (membership + chat + workout plan) nested one level down**.
This is why `channels` is deliberately generic (club-scoped now, will grow
a nullable `race_id` later) rather than being duplicated per feature.

## 3. Tech stack

- **Mobile app**: React Native + Expo (Expo Router for file-based
  navigation), TypeScript.
- **Backend**: Supabase (Postgres + Auth + Realtime + Storage), accessed
  via `@supabase/supabase-js`.
  - Chosen because the domain model is fundamentally relational
    (Club → Member → Race → Carpool), Postgres + Row-Level Security maps
    onto that naturally, and Supabase bundles auth/realtime/storage so we
    don't have to stand up separate services.
- Why not Firebase/Firestore: same reasoning in reverse — the relational
  shape of this data (roles, nested race membership, carpool groups) is
  awkward in a NoSQL document model.

## 4. Repo layout

```
app/                          Expo Router file-based routes
  _layout.tsx                 Root layout: auth-guard redirect logic
  (auth)/sign-in.tsx          Real Supabase Auth sign-in form
  (auth)/sign-up.tsx          Real Supabase Auth sign-up form (handles
                               email-confirmation-required state)
  (tabs)/_layout.tsx           Bottom tabs: Clubs, Profile
  (tabs)/profile.tsx           Shows profile row + sign out
  (tabs)/clubs/_layout.tsx      Stack wrapping the clubs list + club detail
  (tabs)/clubs/index.tsx        Real list of the user's clubs (role badge)
  (tabs)/clubs/create.tsx       Real club creation form
  (tabs)/clubs/join.tsx         Real invite-code join form
  (tabs)/clubs/[clubId]/_layout.tsx
                                Fetches club + this user's role once,
                                exposes via `useClub()` context to all
                                nested screens (see gotcha in section 6)
  (tabs)/clubs/[clubId]/(club-tabs)/
    chat.tsx                   Real chat UI — messages, reactions, admin
                                 pin/announce, realtime (task #5, done)
    calendar.tsx                Real calendar list, grouped Upcoming/Past
                                 (task #6, done)
    routines.tsx                 Placeholder only (future phase)
  (tabs)/clubs/[clubId]/event/
    [eventId].tsx                Event detail view (admin sees Edit/Delete)
    create.tsx                   Admin-only create/edit form — edit mode
                                 via `?eventId=` query param
  (tabs)/clubs/[clubId]/race/[raceId]/
                                Placeholder screens only (chat, workout,
                                 carpool, info) — future phase, no backend
                                 tables exist for races yet

contexts/AuthProvider.tsx      Wraps supabase.auth session state
lib/supabase.ts                Supabase client (reads EXPO_PUBLIC_* env vars)
lib/clubs.ts                   fetchMyClubs / createClub / joinClubByCode —
                                 reference pattern to follow for new features
lib/messages.ts                 fetchMessages / sendMessage / reactions /
                                 realtime subscription — chat backend
lib/calendar.ts                 fetchEvents / fetchEvent / createEvent /
                                 updateEvent / deleteEvent — calendar backend
types/database.ts               Hand-written Supabase Database type (see
                                 section 6 gotcha about required shape)

supabase/migrations/
  0001_init.sql                 Tables: profiles, clubs, club_members,
                                 calendar_events, channels, messages,
                                 message_reactions
  0002_functions_triggers.sql   handle_new_user (auto-profile on signup),
                                 handle_new_club (auto-admin + auto-channel
                                 on club creation), join_club_by_code RPC
  0003_rls.sql                  RLS policies + is_club_member/is_club_admin
                                 helper functions
  0004_grants.sql               Explicit GRANTs — see section 6, this
                                 exists specifically so the schema doesn't
                                 depend on any platform's "auto-expose new
                                 tables" default
  0005_realtime.sql              Adds messages + message_reactions to the
                                 supabase_realtime publication — required
                                 for postgres_changes to fire at all
```

## 5. Current status (what's actually done vs. not)

| # | Task | Status |
|---|------|--------|
| 1 | Expo scaffold + Expo Router navigation shell | ✅ Done |
| 2 | Supabase schema + RLS (see migrations 0001-0005) | ✅ Done |
| 3 | Auth flow (sign up/in/out, session persistence, route guard) | ✅ Done |
| 4 | Club creation, invite-code join, admin/member roles | ✅ Done, verified live end-to-end |
| 5 | Club group chat | ✅ Done — real messages, reactions, admin pin/announce, realtime confirmed live (verified by inserting a row directly via SQL and watching it appear in the browser with zero refresh). Photo/video attachments (Storage) deliberately **not** built yet. |
| 6 | Club calendar | ✅ Done — real `calendar_events` CRUD (`lib/calendar.ts`), list view grouped into Upcoming/Past (`(club-tabs)/calendar.tsx`), a detail screen (`event/[eventId].tsx`), and an admin-only create/edit form (`event/create.tsx`, edit mode via `?eventId=`). Verified live end-to-end via `CI=1 npx expo start --web` + Playwright: create, edit, delete, admin-vs-member visibility (no "+ New Event" FAB for members, direct navigation to `event/create` redirects members away), and realtime was **not** added (events change rarely; screen refetches on focus via `useFocusEffect` instead — see section 6 for why chat needed realtime but this doesn't). No new migration was needed — `calendar_events` schema + RLS already existed from 0001/0003. Date/time entry is plain `YYYY-MM-DD` / `HH:MM` text fields (no date-picker library is installed); good enough for MVP but a known UX rough edge if this needs to feel more polished later. |
| — | Weekly routines | ⬜ Not started (no schema yet) |
| — | Race sub-flow (sub-chat, workout, carpool, results) | ⬜ Not started (no schema yet, placeholder nav screens only) |
| — | Polls, video messages | ⬜ Not started |

**Immediate next step**: weekly routines (no schema yet) — will need a new
migration (e.g. `routines` table, admin-authored, club-scoped) plus a real
`routines.tsx` UI, following the same `lib/*.ts` + screen pattern used for
calendar and chat.

## 6. Errors hit and lessons learned (read this before touching RLS)

### The big one: `INSERT ... RETURNING` also enforces the SELECT policy

We spent a very long debugging session chasing what looked like a
catastrophic, unexplainable RLS failure: club creation would fail with
`new row violates row-level security policy for table "clubs"` even after
verifying — repeatedly, exhaustively — that the policy text, grants,
`auth.uid()` resolution, function ownership/bypassrls, Postgres version,
and `row_security` GUC were all completely correct. It even reproduced on
a **brand new scratch table** with a policy set to `with check (true)`,
across two different Supabase cloud projects and two different orgs,
which looked like conclusive proof of a platform-wide incident (there
genuinely was an unrelated active Supabase incident at the time, which
was a red herring that made this more confusing, not the actual cause).

**Actual root cause**: every one of those "repro" scratch tables had an
INSERT policy but **no SELECT policy**. When Postgres executes
`INSERT ... RETURNING` (which is exactly what `supabase-js`'s
`.insert().select()` and PostgREST's `Prefer: return=representation`
generate) on an RLS-enabled table, it doesn't just check the INSERT
policy's `WITH CHECK` — it *also* re-checks the returned row against the
table's **SELECT** policy, since RETURNING is effectively "read this row
back." Our real `clubs` SELECT policy required `is_club_member(id)`, and
at the exact instant a brand-new club is inserted, the creator isn't a
club member yet — that only happens moments later via the
`on_club_created` trigger. Chicken-and-egg. Every scratch table failed
identically because it had *no* SELECT policy at all (default-deny), not
because RLS itself was broken.

**The fix** (already applied in `0003_rls.sql`): the `clubs` SELECT
policy is `using (is_club_member(id) or created_by = auth.uid())` — the
creator can always see their own row immediately, independent of the
trigger's timing.

**Takeaway for any future work that inserts-and-returns a row where
"can I see this row" depends on something a trigger creates afterward**:
make sure the SELECT policy also covers "I am the one who just created
this," not just "I am now a member/participant of it." This will matter
again for `race` creation once that table exists (creator should see
their own race row immediately, same pattern).

### Minor gotchas encountered along the way

- **Supabase's new API key format**: newer projects use
  `sb_publishable_...` / `sb_secret_...` keys instead of the old JWT-based
  `anon`/`service_role` keys. The **secret** key is the dangerous one
  (bypasses RLS, equivalent to the old `service_role` key) — never put it
  in client code. Only the **publishable** key goes in `.env`
  (`EXPO_PUBLIC_SUPABASE_ANON_KEY`).
- **`types/database.ts` is hand-written**, not generated. supabase-js's
  `Database` generic requires each table to have `Row`, `Insert`,
  `Update`, **and `Relationships: []`**, and the schema object needs
  `Tables`, **`Views: {}`**, and **`Functions: {}`** all present —
  omitting any of these silently resolves query types to `never` instead
  of erroring loudly. If a live project ever exists again, regenerate
  properly with `npx supabase gen types typescript`.
- **Expo Router needs an explicit `app/index.tsx`** even though all it
  does is show a spinner while the real auth-guard redirect (in
  `app/_layout.tsx`, via `useSegments()`) sends the user to `(auth)` or
  `(tabs)`. Without it, Expo Router shows its own "Unmatched Route" page
  at `/` before the redirect effect gets a chance to run.
- **`(tabs)/clubs/` needed its own `_layout.tsx`** (a `Stack` wrapping
  `index` + `[clubId]`) — without it, Expo Router hoisted
  `clubs/[clubId]` as a *third, stray tab* in the bottom tab bar instead
  of nesting it under the "Clubs" tab.
- **`CI=1 npx expo start --web`** is how this project gets smoke-tested
  headlessly (via Playwright MCP tools) during development — CI mode
  disables Fast Refresh, so after any route/layout change the dev server
  needs a restart (`pkill -f "expo start"`, then relaunch) rather than
  relying on hot reload to pick it up.
- **`react-native-web`'s `Alert.alert` is a total no-op on web** (see
  `node_modules/react-native-web/src/exports/Alert/index.js` —
  `static alert() {}`). Any confirm-before-destructive-action flow (e.g.
  delete event) needs a `Platform.OS === "web"` branch that uses
  `window.confirm` instead, or the button silently does nothing on web
  while still working fine on iOS/Android. Caught this only by actually
  clicking Delete in the Playwright smoke test and checking the DB row
  was still there — the click reported success with zero console errors.
- **`router.back()` throws "action 'GO_BACK' was not handled"** if the
  screen was reached via direct URL navigation (deep link / page refresh
  on web) rather than by pushing from within the app, because there's no
  history entry to pop. Any programmatic back-navigation triggered from a
  guard or an action (e.g. redirecting a non-admin off an admin-only
  screen, or leaving a detail screen after a delete) should check
  `router.canGoBack()` first and fall back to `router.replace(...)` to a
  known-good route. Caught by navigating directly to
  `event/create`/`event/[eventId]` in the smoke test instead of always
  clicking through from the list.
- **The real bug behind several "infinite spinner at `/`" reports: the
  auth-guard redirect in `app/_layout.tsx` had a logic gap for the bare
  `/` route.** The original condition was:
  ```ts
  const inAuthGroup = segments[0] === "(auth)";
  if (!session && !inAuthGroup) router.replace("/(auth)/sign-in");
  else if (session && inAuthGroup) router.replace("/(tabs)/clubs");
  ```
  This only redirects in two cases: no session (→ sign-in), or a session
  while stuck on an `(auth)` screen (→ clubs). But landing on plain `/`
  (e.g. pasting `http://localhost:8081/` directly, which is exactly what
  `app/index.tsx` renders — a permanent spinner waiting to be redirected
  away) is in *neither* group, so **if a valid session already exists**,
  neither branch fires and nothing ever redirects — the spinner never
  clears. This is deterministic and 100% reproducible: any time you're
  already logged in (valid `sb-...-auth-token` in `localStorage`, e.g.
  from a previous test session) and navigate straight to `/`, it hangs.
  It's easy to misdiagnose as a Supabase/session problem (that's what we
  initially suspected, twice) because the symptom — spinner, zero errors,
  zero relevant network activity — looks identical to a genuinely stuck
  `getSession()` call. **How it was actually confirmed**: added temporary
  `console.log`s inside `AuthProvider`'s effect; they showed
  `getSession()` resolving in ~2ms with a valid session every time — so
  the auth layer was never the problem, only the redirect condition
  consuming that state. **Fix**: track `inTabsGroup` too and redirect
  whenever a session exists and the user *isn't* already in the tabs
  group, not just when they're stuck in the auth group:
  ```ts
  const inTabsGroup = segments[0] === "(tabs)";
  if (!session && !inAuthGroup) router.replace("/(auth)/sign-in");
  else if (session && !inTabsGroup) router.replace("/(tabs)/clubs");
  ```
  As defense-in-depth (kept, though it turned out not to be the cause
  here), `contexts/AuthProvider.tsx`'s `getSession()` call also now has a
  5-second timeout that falls back to "no session" rather than letting a
  truly stuck call (e.g. a real cross-tab lock deadlock in
  `@supabase/supabase-js`) hang `initializing` forever. And
  `app/(auth)/sign-up.tsx` still does an explicit
  `router.replace("/(tabs)/clubs")` right after a successful signup
  rather than depending purely on the passive listener chain. Lesson:
  when a "hang" has zero console errors and zero relevant network
  requests, suspect the **navigation/state-machine logic** before
  suspecting the network client — add logging to confirm which layer is
  actually stuck before patching the one that seems most likely.

## 7. Local development setup (current state)

Supabase is currently running **locally via Docker** (`supabase start`),
not on Supabase's hosted cloud. This was a deliberate pivot after the RLS
debugging saga above coincided with an active Supabase cloud incident,
and the user (understandably) deleted the cloud org created during that
investigation. Nothing about the schema/code requires this — it's just
where `.env` currently points.

```bash
# One-time setup (already done in this environment):
brew install supabase/tap/supabase
supabase init

# Start the local stack (Postgres + Auth + Storage + Realtime, via Docker):
supabase start
# → prints ANON_KEY / PUBLISHABLE_KEY and API_URL, currently mirrored into .env

# Re-apply all migrations from scratch against local Postgres:
supabase db reset

# Run the app against it:
npx expo start        # then press w for web, or scan the QR code
```

`.env` currently has:
```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
```

Local Supabase auto-confirms email signups (no email-confirmation-required
gate like hosted projects have by default), which makes local testing much
faster.

**Whenever a real hosted Supabase project is (re-)created**, moving back
to it is just: create the project, run the four migration files in the
SQL Editor in order (`0001` → `0002` → `0003` → `0004`), and swap the two
`EXPO_PUBLIC_SUPABASE_*` values in `.env`.

## 8. How to keep working from here

1. Read this file.
2. Check the task list (`TaskList`) for current in-progress/pending items
   — it should mirror section 5 above, but the task list is the live
   source of truth for status, this file is the source of truth for
   context/history.
3. Follow the `lib/clubs.ts` pattern (plain async functions, typed against
   `types/database.ts`, called from screens) for any new Supabase-backed
   feature.
4. Before shipping any new RLS policy on a table that gets inserted-and-
   returned, re-read section 6's chicken-and-egg gotcha and check whether
   the SELECT policy covers "I just created this."
5. Smoke-test UI changes live via `CI=1 npx expo start --web` + the
   Playwright MCP tools before declaring a feature done — this caught two
   real navigation bugs already (see section 6).
