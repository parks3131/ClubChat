# ClubChat — Project Spec & Handoff

This file is the single source of truth for what ClubChat is, why it's
shaped the way it is, and what's next. Read this before making
architectural decisions or resuming work in a new session.

**This file is kept deliberately compact** because CLAUDE.md `@`-includes
it into every session's context. Full task-by-task build narrative (every
bug hit, every root cause, every fix, in full detail) lives in
`docs/HISTORY.md`, which is *not* auto-loaded — Read it directly when a
one-line status-table summary below isn't enough, e.g. resuming a task
that had a subtle bug already solved once. Add new detailed entries to
`docs/HISTORY.md` as work progresses; keep this file's summaries short.

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
- **Race / Meet** (a "Races & Meets" section in each club, effectively a
  **mini-club nested inside the parent club**) —
  **deviation from the original plan, built task #16**: rather than being
  spawned from a calendar event of type "race" as originally sketched
  here, races are created standalone (name + date only) from their own
  "Races & Meets" list, independent of the calendar. This matched an
  actual founder wireframe once the feature was scoped in detail; the
  calendar-linked version below was never built. See task #16 in
  section 5 —
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
 └─ Club  (top-level container, has an invite_code + join_policy)
     ├─ ClubMember (user_id, role: admin | member)
     ├─ ClubJoinRequest (user_id, status: pending | approved | denied —
     │                   only used when join_policy = 'request')
     ├─ Channel (club-scoped by default; a race-scoped Channel has a
     │           non-null race_id instead — see Race below)
     │   └─ Message (text | photo | announcement, pinned, reactions)
     ├─ CalendarEvent (type: race | practice | team_bonding | volunteer | other
     │                 — the "race" type here is unrelated to Race below;
     │                 it's just a calendar entry, no link between them)
     ├─ RoutineWorkout (dated weekly workout: activity_type run | swim |
     │                   ... [10 types total, see lib/routines.ts],
     │                   title, description — deliberately no structured
     │                   exercise sub-table, per an explicit "keep it very
     │                   simple" scoping call)
     └─ Race (mini-club nested under Club, task #16 — always request-based
              access, no "open" policy like Club's join_policy: a club
              member requests, any club admin can approve or add directly.
              No separate "race admin" role — club admins already have
              full access to every race under their club.)
         ├─ RaceMember (user_id — approved roster; admins aren't listed
         │              here, is_club_admin already covers them)
         ├─ RaceJoinRequest (user_id, status: pending | approved | denied)
         ├─ its own Channel/Messages (same generic Channel/Message tables
         │   as the club's main chat — full feature parity, incl. pins/
         │   reactions/announcements/system messages, comes for free)
         ├─ results link — placeholder screen only, not yet scoped
         ├─ location / accommodation info — placeholder screen only
         └─ Car assignments & groups — placeholder screen only
```

Key design decision: **a Race is not a separate concept from a Club, it's
the same shape (membership + chat) nested one level down**. This is why
`channels` is deliberately generic (club-scoped by default, race-scoped
via a nullable `race_id`) rather than being duplicated per feature — this
paid off exactly as hoped when task #16 built it: race chat reused the
entire messages/message_reactions RLS and UI with no duplication.

Another design decision: **`join_policy` replaces what would otherwise
have been an "invite-only" tier — there is no invite-only policy.** Every
club is `open` (search-by-name joins instantly) or `request`
(search-by-name files a request the admin must approve). The existing
`invite_code` / `join_club_by_code` RPC is untouched and orthogonal to
this — it's a private, always-instant-join side channel regardless of
`join_policy`, and is the intended base for a future shareable join-link
(deliberately deferred, not built yet).

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
  (auth)/sign-in.tsx          Supabase Auth sign-in form
  (auth)/sign-up.tsx          Supabase Auth sign-up form (handles
                               email-confirmation-required state)
  (tabs)/_layout.tsx           Bottom tabs: Clubs, Profile
  (tabs)/profile/_layout.tsx    Stack: profile view + edit modal.
                                 `‹` headerLeft, fallback -> /clubs
  (tabs)/profile/index.tsx      Profile view — avatar (tap pencil overlay
                                 to upload), name/email, bio, "Your clubs"
                                 (tap -> club hub), sign out
  (tabs)/profile/edit.tsx        Self-only edit form (name, bio, city,
                                 date of birth, school) — modal
  (tabs)/clubs/_layout.tsx      Stack: clubs list + club detail
  (tabs)/clubs/index.tsx        List of the user's clubs (role badge),
                                 tap -> club hub (`/clubs/${id}`)
  (tabs)/clubs/create.tsx       Club creation form (name/sport/description
                                 + join-policy picker: open vs request)
  (tabs)/clubs/join.tsx         Join form — invite code, or "Find a club"
                                 (debounced search-by-name + join/request)
  (tabs)/clubs/[clubId]/_layout.tsx
                                Fetches club + this user's role once,
                                exposes via `useClub()` context. Registers
                                index/chat/calendar/routines/races/highlights/
                                club-profile/member/event/race as Stack
                                screens, sharing one `clubScreenOptions`
                                object (tappable club-name headerTitle ->
                                club-profile, admin-only invite-code
                                headerRight) plus per-screen `headerLeft`
                                via `makeBackHeaderLeft` (see
                                components/BackHeaderButton.tsx) since
                                direct URL nav/refresh leaves no back
                                history for the native button to use.
  (tabs)/clubs/[clubId]/index.tsx
                                Hub screen — four rows (Chat / Calendar /
                                Routines / Races & Meets). Landing point
                                when entering a club. Handles `?from=profile`
                                cross-tab back-history special case (section 6).
  (tabs)/clubs/[clubId]/chat.tsx
                                Thin wrapper around the shared
                                components/ChatScreen.tsx (task #16 —
                                extracted so race chat could reuse it
                                without duplicating ~250 lines): messages
                                (sender avatar, tappable -> member/[userId]),
                                timestamps, multi-emoji reactions, admin
                                pin/announce, realtime, auto-scroll-to-
                                bottom, pinned-message sticky strip
                                (-> highlights) + persistent "Highlights"
                                header button. Passes the admin invite code
                                as `extraHeaderRight` (club-only, race chat
                                has no equivalent).
  (tabs)/clubs/[clubId]/calendar.tsx
                                Calendar list, grouped Upcoming/Past.
  (tabs)/clubs/[clubId]/highlights.tsx
                                Thin wrapper around the shared
                                components/HighlightsScreen.tsx (same
                                task #16 extraction as chat.tsx) — Pinned /
                                Announcements tabs over the same message
                                data chat already fetches.
  (tabs)/clubs/[clubId]/routines/
                                Weekly routines — own nested Stack.
                                `index.tsx`: Mon-Sun view for a real
                                calendar week (not a repeating template),
                                `‹`/`›` week paging, only today+future days
                                shown (`‹` disabled at the current week),
                                per-day workout cards or "Rest day",
                                admin-only "+ Add workout".
                                `activity-type.tsx`: admin-only picker, 10
                                types (list lives in lib/routines.ts's
                                `ACTIVITY_TYPES`).
                                `workout/create.tsx`: admin-only
                                create/edit — just title + description
                                (deliberately no exercise builder).
                                `workout/[workoutId].tsx`: detail view,
                                read-only for members, Edit/Delete for
                                admins. No completion tracking.
  (tabs)/clubs/[clubId]/club-profile/
                                Club identity (avatar, name, description,
                                admin-only edit) + full member roster
                                below it (promote/remove, add-member
                                search, pending-requests approve/deny).
                                Reached by tapping the club name anywhere.
  (tabs)/clubs/[clubId]/member/[userId].tsx
                                Read-only profile card for another member.
  (tabs)/clubs/[clubId]/event/
    [eventId].tsx                Event detail (admin: Edit/Delete)
    create.tsx                   Admin-only create/edit, `?eventId=` = edit
  (tabs)/clubs/[clubId]/races/
                                Task #16 — "Races & Meets" list, its own
                                nested Stack (same shape as routines/).
                                `index.tsx`: Upcoming/Finished grouped list
                                (mirrors calendar.tsx); each row shows a
                                chevron (enter) for admins/approved members,
                                "Requested" for a pending request, or a
                                "Request to join" button otherwise — always
                                request-based, no "open" policy.
                                `create.tsx`: admin-only, name + event_date
                                only (`YYYY-MM-DD`, same convention as
                                calendar/DOB fields) — standalone, not tied
                                to a calendar event (see section 1's
                                deviation note).
  (tabs)/clubs/[clubId]/race/[raceId]/
                                Task #16 — a race's own space, own nested
                                Stack (was a `Tabs` layout with only
                                placeholder screens before this task).
                                `_layout.tsx`: fetches the race + this
                                user's access once (`useRace()` context) —
                                club admins always have access; a regular
                                member needs an approved `race_members` row,
                                checked *before* fetching the race's channel
                                (fetching first would throw via RLS for a
                                non-member and never reach the redirect —
                                a real bug caught live during this task's
                                own verification pass, fixed by reordering).
                                Anyone without access is redirected to the
                                races list rather than shown a locked hub.
                                `index.tsx`: hub — 5 rows (Chat, Location &
                                Accommodation, Car Assignments & Groups,
                                Photos, Result Link); the last 4 are
                                placeholder screens, content to be scoped
                                later per an explicit founder note.
                                `chat.tsx`/`highlights.tsx`: thin wrappers
                                around the same shared components club
                                chat uses — full feature parity for free.
                                `roster.tsx`: reached by tapping the race
                                name in the header (same "tap the name for
                                membership" pattern as club-profile) —
                                pending-requests approve/deny, add-member
                                (search scoped to this club's own roster,
                                not every profile), and the member list.
                                No separate "race admin" role; a club
                                admin already has full access to every
                                race under their club.

components/BackHeaderButton.tsx  makeBackHeaderLeft(router, fallback) —
                                 shared `‹` headerLeft factory
                                 (canGoBack() ? back() : replace(fallback))
                                 used by every club-scoped Stack layout.
components/ChatScreen.tsx       Task #16 — chat UI/logic (messages,
                                 reactions, pin/announce, pinned strip,
                                 Highlights button, auto-scroll) extracted
                                 out of the club chat screen so race chat
                                 could reuse it verbatim instead of forking
                                 a second ~250-line copy. Parametrized by
                                 `channelId`/`isAdmin`/`memberPath`/
                                 `highlightsPath`, plus an optional
                                 `extraHeaderRight` (club chat's admin
                                 invite code — race chat has none).
components/HighlightsScreen.tsx  Task #16 — same extraction, for the
                                 Pinned/Announcements screen.
contexts/AuthProvider.tsx      Wraps supabase.auth session state
lib/supabase.ts                Supabase client (reads EXPO_PUBLIC_* env vars)
lib/clubs.ts                   fetchMyClubs / createClub / joinClubByCode /
                                 searchClubs / joinOrRequestClub /
                                 fetchClubProfile / updateClubProfile /
                                 uploadClubAvatar
lib/messages.ts                 fetchMessages / sendMessage / reactions /
                                 realtime subscription — chat backend,
                                 channel-agnostic (works for a club's main
                                 channel or a race's channel unchanged)
lib/calendar.ts                 fetchEvents / fetchEvent / createEvent /
                                 updateEvent / deleteEvent
lib/members.ts                   fetchClubMembers / promoteToAdmin /
                                 fetchPendingRequests / decideJoinRequest
lib/profile.ts                   fetchProfile / updateProfile /
                                 uploadAvatar / formatDateOfBirth
lib/routines.ts                  fetchWeekWorkouts / fetchWorkout /
                                 createWorkout / updateWorkout /
                                 deleteWorkout, + ACTIVITY_TYPES/
                                 ACTIVITY_LABELS/ACTIVITY_ICONS
lib/races.ts                     Task #16 — fetchRaces (per-race access +
                                 request status for the current user) /
                                 createRace / requestJoinRace / fetchRace /
                                 fetchRaceMembers / fetchPendingRaceRequests /
                                 decideRaceJoinRequest / addRaceMember /
                                 searchClubMembersToAdd
types/database.ts               Hand-written Supabase Database type (see
                                 section 6 gotcha about required shape)

supabase/migrations/
  0001_init.sql                 profiles, clubs, club_members,
                                 calendar_events, channels, messages,
                                 message_reactions
  0002_functions_triggers.sql   handle_new_user, handle_new_club,
                                 join_club_by_code RPC
  0003_rls.sql                  RLS policies + is_club_member/is_club_admin
  0004_grants.sql               Explicit GRANTs (see section 6)
  0005_realtime.sql              messages + message_reactions added to the
                                 supabase_realtime publication
  0006_join_requests.sql          clubs.join_policy, club_join_requests,
                                 search_clubs/join_or_request_club/
                                 decide_join_request RPCs
  0007_system_message_type.sql    Adds 'system' to message_type enum
  0008_membership_chat_events.sql Triggers posting join/leave/add/remove
                                 system chat messages
  0009_profile_bio.sql             profiles.bio
  0010_avatar_storage.sql          public 'avatars' Storage bucket + RLS
  0011_profile_details.sql         profiles.city, date_of_birth, school
  0012_role_change_chat_events.sql Trigger posting promote/demote messages
  0013_club_avatar.sql             clubs.avatar_url
  0014_club_avatar_storage.sql     public 'club-avatars' Storage bucket
  0015_routines.sql                routine_workouts (club_id, workout_date,
                                 activity_type [10 values], title,
                                 description, created_by) + RLS
  0016_races.sql                   races, race_members, race_join_requests
                                 + RLS; generalizes is_channel_member/
                                 is_channel_admin to branch on channels'
                                 new nullable race_id (so messages/
                                 message_reactions RLS didn't need to
                                 change at all); adds is_race_admin/
                                 is_race_member/is_race_club_member
                                 helpers; fixes three existing trigger
                                 functions (0008/0012) whose channel
                                 lookup assumed one channel per club —
                                 no longer true once race channels exist,
                                 re-`create or replace`d in place rather
                                 than reversing 0008/0012 themselves;
                                 request_join_race / decide_race_join_request
                                 RPCs (mirrors 0006's club join-request
                                 shape, but always request-based — no
                                 "open" branch)
```

## 5. Current status

| # | Task | Status |
|---|------|--------|
| 1 | Expo scaffold + Expo Router navigation shell | ✅ Done |
| 2 | Supabase schema + RLS (migrations 0001-0005) | ✅ Done |
| 3 | Auth flow (sign up/in/out, session persistence, route guard) | ✅ Done |
| 4 | Club creation, invite-code join, admin/member roles | ✅ Done, verified live end-to-end |
| 5 | Club group chat | ✅ Done — messages, reactions, pin/announce, realtime. Photo/video attachments **not** built yet. |
| 6 | Club calendar | ✅ Done — CRUD, Upcoming/Past list, detail + admin create/edit. No realtime (refetch-on-focus instead — events change rarely). Plain text date/time fields, no date-picker lib. |
| 7 | Members list + promote/remove/add | ✅ Done — lives in `club-profile/index.tsx`, no standalone Members screen. |
| 8 | Search-by-name club join + join policy | ✅ Done — `open`/`request` policies, autosuggest search, admin approve/deny. Verified live with 3 test users. |
| 9 | Chat system messages for membership changes | ✅ Done — DB triggers post join/leave/add/remove messages, rendered as centered italic lines. |
| — | Polls, video messages | ⬜ Not started |
| 10 | Profile page — avatar upload, bio, "your clubs" | ✅ Done — see task #10 in `docs/HISTORY.md`'s status table for the web image-picker user-activation gotcha. |
| 11 | Promotion chat events, avatars in roster, tap-to-view member profile, city/DOB/school | ✅ Done — see task #11 in `docs/HISTORY.md`'s status table for the UTC date-off-by-one bug + fix (`formatDateOfBirth`). |
| 12 | Club profile screen, chat sender avatars, Members tab removed | ✅ Done — see task #12 in `docs/HISTORY.md`'s status table for two follow-up back-button fixes (cross-tab history). |
| — | Shareable join link (wraps `invite_code` in a URL) | ⬜ Deliberately deferred |
| 13 | Club navigation restructure (hub screen replaces bottom Tabs) + chat avatar → profile link | ✅ Done — see task #13 in `docs/HISTORY.md`'s status table (and its own "Task #13 detail" section further down) for the full plan and the `headerLeft`-everywhere gotcha it surfaced. |
| 14 | Chat: pinned-messages sticky strip, Highlights screen, per-message timestamps, auto-scroll-to-bottom | ✅ Done — see task #14 in `docs/HISTORY.md`'s status table for two post-ship fixes (no-pinned-messages dead-end, strip sizing). |
| 15 | Weekly routines | ✅ Done, through several founder-driven scope changes (dated weeks not templates; exercise builder added then fully removed for simplicity; Run/Swim-only expanded to all 10 activity types; past days filtered out). Full narrative incl. an `Intl.toLocaleDateString` formatting bug: see task #15 in `docs/HISTORY.md`'s status table. |
| 16 | Race sub-flow: "Races & Meets" section, request/approve membership, race chat | ✅ Done, from a hand-drawn founder wireframe (`Races & Meets` hub row → Upcoming/Finished list with an admin-only "Create Race Channel" → a race's own space with Chat/Location & Accommodation/Car Assignments & Groups/Photos/Result Link). **Deviation from the original plan** (see section 1): races are created standalone (name + date), not spawned from a calendar event. Access is always request-based, no "open" policy — a club member requests, any club admin approves/denies or adds directly; there's no separate "race admin" role, club admins already have full access to every race under their club. Migration `0016_races.sql` adds `races`/`race_members`/`race_join_requests` and, per an explicit founder ask ("mimic the same features of chat above"), generalizes the existing `is_channel_member`/`is_channel_admin` helpers to branch on a new nullable `channels.race_id` — this means race chat got pins/reactions/announcements/realtime/system-messages for free with **zero changes** to the messages/message_reactions RLS policies, exactly what task the original domain model note ("channels is deliberately generic... will grow a nullable race_id later") was written for. On the UI side, `chat.tsx`/`highlights.tsx` were extracted into shared `components/ChatScreen.tsx`/`components/HighlightsScreen.tsx` so race chat didn't fork a second ~250-line copy of the reaction/pin/highlights logic — club chat's screens are now thin wrappers passing `channelId`/`isAdmin`/etc. Location & Accommodation/Car Assignments & Groups/Photos/Result Link are placeholder screens for now, content to be scoped later per an explicit founder note. `race/[raceId]` was also converted from a `Tabs` layout (with only placeholder screens) to a `Stack` (matching every other club-scoped area since task #13). **Bug caught during this task's own Playwright verification pass**: the race layout's access guard called `fetchRace` (which reads the race's channel) in parallel with the membership check, but a non-member's `fetchRace` call gets blocked by RLS and throws — since that throw happened before the guard's "not authorized, redirect" branch ever ran, an unauthorized visitor hitting a race URL directly saw a permanent spinner instead of being bounced to the races list. Fixed by checking membership first and only calling `fetchRace` after confirming access. Verified live end-to-end with two accounts (admin + a second member joined by invite code): created a race, confirmed the admin was auto-added to its roster and a dedicated channel was auto-created; as the second member, saw "Request to join" on the race row, requested, and confirmed direct URL access to the race was correctly blocked (post-fix) while the request was still pending; approved the request as admin from the race's roster screen (reached by tapping the race name, same pattern as club-profile); confirmed the member then had full access — chat parity (message send, reactions, pin, admin-only announce toggle, Highlights screen, the "X was added by Y" system message) and a chevron instead of "Requested" on the races list. Separately verified the other half of the access-control mechanism — the admin-direct-add path, which the founder's own request explicitly called out ("or admin can directly add them") — with a third account: joined the club via invite code, then, without ever filing a request, was added straight into the race from the roster's "Add a member" search box (scoped to this club's own roster, not every profile in the system); confirmed immediate chat access with the correct "was added by Admin Ann" system message and no request/approval step in the path at all. Regression-checked club chat after the `ChatScreen`/`HighlightsScreen` extraction: sent a message, pinned it, confirmed the pinned strip + badge + Highlights screen + admin invite-code header all rendered identically to before, from both the admin's and a plain member's perspective. `npx tsc --noEmit` clean throughout. |

**Immediate next step**: flesh out the 4 placeholder race sections
(Location & Accommodation, Car Assignments & Groups, Photos, Result Link)
once the founder scopes what belongs in each — the founder explicitly
deferred these when task #16 shipped ("I'll let you know what comes
under each feature"). After that, the last major MVP phase is
polls/video messages.

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
  `/` route.** The original (broken) condition was only two branches:
  ```ts
  const inAuthGroup = segments[0] === "(auth)";
  if (!session && !inAuthGroup) router.replace("/(auth)/sign-in");
  else if (session && inAuthGroup) router.replace("/(tabs)/clubs");
  ```
  no session → sign-in, or a session while stuck on an `(auth)` screen →
  clubs. Landing on plain `/` while already logged in fell into neither
  branch, so nothing ever redirected and the spinner never cleared.
  **Fix**: also track `inTabsGroup` and redirect whenever a session
  exists and the user *isn't* already in the tabs group:
  ```ts
  const inTabsGroup = segments[0] === "(tabs)";
  if (!session && !inAuthGroup) router.replace("/(auth)/sign-in");
  else if (session && !inTabsGroup) router.replace("/(tabs)/clubs");
  ```
  Lesson: when a "hang" has zero console errors and zero relevant network
  requests, suspect the **navigation/state-machine logic** before
  suspecting the network client — this looked identical to a stuck
  Supabase `getSession()` call and was misdiagnosed as that, twice,
  before adding temporary logging proved `getSession()` was resolving
  fine in ~2ms. Full debugging narrative: `docs/HISTORY.md`. **Two
  defense-in-depth measures from this bug are still live in the code,
  even though neither turned out to be the actual cause**: (1)
  `contexts/AuthProvider.tsx`'s `getSession()` call has a 5-second
  timeout that falls back to "no session" instead of letting a truly
  stuck call (e.g. a cross-tab lock deadlock in `@supabase/supabase-js`)
  hang `initializing` forever; (2) `app/(auth)/sign-up.tsx` still does an
  explicit `router.replace("/(tabs)/clubs")` right after a successful
  signup rather than depending purely on the passive auth-state-change
  listener.
- **`router.push`ing across sibling tabs doesn't leave real back-history
  to the tab you came from.** Confirmed with Playwright's `page.goBack()`
  (not just the in-app button) — both landed on the wrong tab's root.
  **Fix**: don't rely on generic back-navigation for cross-tab entry
  points — pass the origin explicitly (a `?from=profile` query param) and
  have the destination screen check for it and `router.replace()` to the
  known origin, falling back to normal `canGoBack()`/tab-root logic
  otherwise. Any future screen reachable from more than one tab should
  use the same pattern rather than assuming `router.back()` "just works."
- **A native `headerLeft` back button only renders when `canGoBack()` is
  true** — direct URL navigation or a page refresh on *any* screen leaves
  no history at all, even a plain `Stack.Screen` that isn't the stack
  root. Every club-scoped screen now gets an explicit `headerLeft` via
  `components/BackHeaderButton.tsx`'s `makeBackHeaderLeft(router,
  fallback)` rather than relying on the native button, with a
  per-screen fallback route. Caught by testing direct URL navigation via
  Playwright, not just clicking through — click-through alone won't
  surface this.
- **`router.replace()`ing to a different tab doesn't reset the origin
  tab's own internal Stack — a follow-on bug from the `?from=profile`
  fix above, found live months later (not during task #13 itself, since
  nothing back then exercised "leave via this back button, then tap back
  to the Clubs tab").** The hub screen's `?from=profile` override calls
  `router.replace("/profile")` to jump to the Profile tab. That changes
  which tab is active, but the Clubs tab's own Stack still had the hub
  screen (still tagged `?from=profile` in its route params) sitting on
  top — a tab switch doesn't pop or reset the *other* tab's history.
  Concretely: Profile → "Your clubs" → hub → back (correctly lands on
  Profile) → tap the Clubs tab → instead of the Main list, this returned
  to the exact same stale hub screen, whose back button — still reading
  `from=profile` from its own persisted route params — fired the same
  override again and sent you straight back to Profile. Tap Clubs again
  and you're back on the same stale hub. An infinite loop between
  Profile and a hub screen that was never actually supposed to be
  reachable via the tab bar again, with no way to reach the real Main
  list except noticing you could press back a second time. Caught live
  by a user manually clicking through the app, not by any Playwright
  pass — every prior verification pass clicked "hub → back" and stopped
  there without ever tapping back over to the Clubs tab afterward.
  **Fix**: before switching tabs, first `router.replace("/clubs")` to
  reset the Clubs tab's own Stack back to its root, *then*
  `router.replace("/profile")` to switch tabs — both calls execute
  synchronously in the same handler, so there's no visible flash of the
  Main list before the screen lands on Profile. Verified all three
  paths afterward: Main list → hub → back (still lands on Main list,
  unaffected by the fix); Main list → hub → switch to Profile tab →
  switch back to Clubs tab (still correctly resumes the hub, un-tagged,
  with a working non-looping back button — the fix only touches the
  `from === "profile"` branch); and the originally-broken Profile → hub
  → back → Clubs tab path (now correctly shows the Main list). Any
  future screen that does a cross-tab `router.replace()` from deeper
  than one level into a tab's Stack needs this same "reset the origin
  Stack first" step, not just the destination-side `?from=` pattern.

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
to it is just: create the project, run the migration files in the SQL
Editor in order (`0001` → ... → latest), and swap the two
`EXPO_PUBLIC_SUPABASE_*` values in `.env`.

## 8. How to keep working from here

1. Read this file. For full detail on any "Done" task above, read
   `docs/HISTORY.md` (not auto-loaded into context — Read it directly).
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
   Playwright MCP tools before declaring a feature done — this caught
   several real navigation bugs already (see section 6).
6. When a task in section 5 accumulates a long, detailed follow-up story
   (bugs found in live testing, scope changes, etc.), keep section 5's
   entry to 1-3 sentences and move the full narrative to
   `docs/HISTORY.md`, appended under that task's own heading (e.g.
   `## Task 16`) so it stays available on demand without bloating what
   loads into context every session.
