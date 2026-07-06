# ClubChat — Full Build History (archive)

**This is the archived, full-detail version of SPEC.md's task-by-task build
log** — every task's complete narrative, including exact bugs hit, root
causes, and fixes, verbatim as originally written. It is deliberately **not**
`@`-included from CLAUDE.md (SPEC.md got too large — 208.7k chars — to load
into every session's context for free), so it won't appear automatically.

**Read this file directly (via the Read tool) when:**
- Resuming work on a task whose one-line summary in SPEC.md's status table
  isn't enough context (e.g. you need the exact fix for a bug that was
  already solved once).
- SPEC.md's section 6 (errors/lessons) references something and you want
  the full story behind it.
- You want the original detailed repo-layout comments explaining *why* a
  file is structured the way it is, not just what it does.

SPEC.md remains the single source of truth for current architecture/status
and is what's actually loaded every session — update *that* file for new
work; treat this one as append-only history (add new detailed entries here
when a task's SPEC.md summary gets compressed, but don't rewrite the past).

---

# ClubChat — Project Spec & Handoff (original, pre-compression snapshot)

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
 └─ Club  (top-level container, has an invite_code + join_policy)
     ├─ ClubMember (user_id, role: admin | member)
     ├─ ClubJoinRequest (user_id, status: pending | approved | denied —
     │                   only used when join_policy = 'request')
     ├─ Channel (1:1 with Club today; will gain a nullable race_id later
     │           so race sub-chats reuse the same messages table)
     │   └─ Message (text | photo | announcement, pinned, reactions)
     ├─ CalendarEvent (type: race | practice | team_bonding | volunteer | other)
     │   └─ (a "race"-typed event will spawn a Race — not yet built)
     ├─ RoutineWorkout (dated weekly workout: activity_type run | swim,
     │                   title, description — deliberately no structured
     │                   exercise sub-table, per an explicit "keep it very
     │                   simple" scoping call)
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

Another design decision (from a founder note on club discovery/roster
gaps): `**join_policy` replaces what would otherwise have been an
"invite-only" tier — there is no invite-only policy.** Every club is
`open` (search-by-name joins instantly) or `request` (search-by-name
files a request the admin must approve). The existing `invite_code` /
`join_club_by_code` RPC is untouched and orthogonal to this — it's a
private, always-instant-join side channel regardless of `join_policy`,
and is the intended base for a future shareable join-link (deliberately
deferred, not built yet).

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
  (tabs)/profile/_layout.tsx    Stack wrapping the profile view + edit modal.
                                 `index`'s `headerLeft` is a `‹` button —
                                 `router.canGoBack()` → `router.back()`,
                                 else `router.replace("/clubs")` — since
                                 Profile is a bottom-tab root with no
                                 back button otherwise (task #13 follow-up
                                 fix, per an explicit "back button
                                 everywhere" ask)
  (tabs)/profile/index.tsx      Real profile view — avatar (tap the pencil
                                 overlay to pick+upload a new photo),
                                 name/email, description/bio, the clubs
                                 this user is in (tap one to jump into its
                                 chat), sign out
  (tabs)/profile/edit.tsx        Self-only edit form (name, bio, city,
                                 date of birth, school), presented as a
                                 modal, `Save` writes via lib/profile.ts
                                 and pops back
  (tabs)/clubs/_layout.tsx      Stack wrapping the clubs list + club detail
  (tabs)/clubs/index.tsx        Real list of the user's clubs (role badge)
  (tabs)/clubs/create.tsx       Real club creation form — name/sport/
                                 description + join-policy picker (open vs
                                 request-to-join)
  (tabs)/clubs/join.tsx         Real join form — two modes: invite code
                                 (unchanged, always-instant-join) and
                                 "Find a club" (debounced search-by-name
                                 with autosuggest, join/request button)
  (tabs)/clubs/[clubId]/_layout.tsx
                                Fetches club + this user's role once,
                                exposes via `useClub()` context to all
                                nested screens (see gotcha in section 6)
  (tabs)/clubs/[clubId]/index.tsx
                                Hub screen — three tappable rows (Chat /
                                 Calendar / Routines), pushing to the
                                 sibling `chat` / `calendar` / `routines`
                                 screens. Landing point when you tap a club
                                 from the Main list or Profile's "Your
                                 clubs" list (task #13). Shares the same
                                 header as those three screens (see
                                 `[clubId]/_layout.tsx` below); also
                                 handles the one cross-tab back-button
                                 special case (`?from=profile`, see
                                 section 6) since it's the only screen in
                                 this group reachable from a different
                                 top-level tab.
  (tabs)/clubs/[clubId]/{chat,calendar}.tsx
                                Plain Stack screens (no longer wrapped in
                                 a Tabs navigator — see task #13).
                                 `chat.tsx`: real chat UI — messages (each
                                 showing the sender's avatar, tappable
                                 through to their `member/[userId]` profile,
                                 or an initial-letter placeholder), a
                                 bottom-right timestamp on every message,
                                 multi-emoji reaction picker, admin
                                 pin/announce, realtime (task #5, done),
                                 auto-scroll to the newest message on
                                 load/send/realtime update (via a
                                 `FlatList` ref + `onContentSizeChange`),
                                 and — when at least one message is pinned
                                 — a horizontally-scrollable sticky strip
                                 (fixed `height`, not `maxHeight` — see
                                 task #14's note on why that matters on
                                 web) above the message list showing pinned
                                 messages newest-first; tapping any card in
                                 it pushes to `highlights?tab=pinned`. A
                                 persistent "📌 Highlights" header button
                                 (overrides the shared `headerRight` via
                                 `useLayoutEffect`) reaches the same screen
                                 regardless of pin state, since the strip
                                 alone can't be the only path to the
                                 Announcements tab (task #14).
                                 `calendar.tsx`: real calendar list, grouped
                                 Upcoming/Past (task #6, done).
                                 The shared `headerTitle`
                                 (`TouchableOpacity` wrapping the club name,
                                 pushing to `club-profile` — that's what
                                 makes it tappable), `headerRight`
                                 (admin-only invite code), and `headerLeft`
                                 (a `‹` back button — see next paragraph)
                                 are set once in `[clubId]/_layout.tsx`'s
                                 `Stack.Screen` options for
                                 `index`/`chat`/`calendar`,
                                 rather than per-screen. `routines` repeats
                                 this same header setup itself (see below)
                                 rather than being registered here, since it
                                 needs its own nested Stack.
  (tabs)/clubs/[clubId]/routines/
                                Weekly routines (task #15) — its own nested
                                 Stack (`routines/_layout.tsx`, same shape as
                                 `club-profile/_layout.tsx`) rather than a
                                 flat `Stack.Screen` like `event/`, since it
                                 needs several sub-screens each with their
                                 own back-fallback; only its `index` needs
                                 the tappable-club-name/invite-code header
                                 `index`/`chat`/`calendar` share, so
                                 `routines/_layout.tsx` reconstructs that
                                 header itself rather than importing it from
                                 the parent layout.
                                 `index.tsx`: the weekly view — Monday
                                 through Sunday for a selected real calendar
                                 week (not a repeating day-of-week template
                                 — training progresses week over week, per
                                 an explicit founder call between the two
                                 options), with `‹`/`›` buttons to page a
                                 week at a time. Only today and future days
                                 are ever shown — days before today (within
                                 the current week) are filtered out
                                 entirely rather than displayed as
                                 read-only history, and the `‹` button is
                                 disabled once `weekStart` reaches the
                                 current week's Monday, per an explicit
                                 founder call ("we should be able to see
                                 today and future days") — there is no way
                                 to view a past week or a past day. Each
                                 remaining day shows its workout(s), if any
                                 (tappable through to `workout/[workoutId]`),
                                 or, for members, "Rest day" when there's
                                 nothing that day; admins additionally get
                                 a "+ Add workout" row under every day
                                 regardless of whether one already exists,
                                 since a single day can hold more than one
                                 workout (e.g. an AM run plus a PM swim).
                                 `activity-type.tsx`: admin-only picker —
                                 all 9 activity types from the reference
                                 app's own picker (Run, Trail Run, Bike,
                                 Swim, Strength, Hybrid Fitness, Indoor
                                 Climb, Bouldering, XC Ski) plus a 10th
                                 "Other" catch-all (same role as
                                 `calendar_event_type`'s `other`), per a
                                 follow-up founder ask to match the
                                 reference list in full rather than the
                                 originally-scoped Run/Swim-only — which
                                 was easy to do once the create form no
                                 longer has sport-specific fields (see
                                 `workout/create.tsx` below). The list
                                 (value/label/icon triples) lives once in
                                 `lib/routines.ts`'s exported
                                 `ACTIVITY_TYPES`, with `ACTIVITY_LABELS`/
                                 `ACTIVITY_ICONS` derived from it — this
                                 screen, `routines/index.tsx`,
                                 `workout/create.tsx`, and
                                 `workout/[workoutId].tsx` all import from
                                 there rather than each keeping their own
                                 copy, since duplicating a 10-entry list
                                 across four files was exactly the kind of
                                 drift risk not worth taking. Carries the
                                 tapped day's date via `?date=` and pushes
                                 to `workout/create`.
                                 `workout/create.tsx`: admin-only
                                 create/edit form (edit via `?workoutId=`,
                                 same convention as `event/create.tsx`) —
                                 deliberately just a title (defaults to the
                                 activity type's name) and a description,
                                 nothing else. An earlier version of this
                                 screen had a full exercise builder (name +
                                 Time-or-Distance target + notes per row)
                                 and a Swim-only pool-length picker; both
                                 were removed per an explicit follow-up
                                 founder ask to keep this "very simple" —
                                 see task #15's follow-up note.
                                 `workout/[workoutId].tsx`: detail view —
                                 activity badge, date, title, description —
                                 read-only for members; admins get
                                 Edit/Delete (same `window.confirm`/
                                 `Alert.alert` platform-branch delete-
                                 confirmation pattern as
                                 `event/[eventId].tsx`). No completion
                                 tracking — members can only view what an
                                 admin planned, per an explicit founder
                                 scoping call ("admin can add workouts and
                                 members can only see workouts").
  (tabs)/clubs/[clubId]/highlights.tsx
                                Reached by tapping the pinned strip atop
                                 chat. Two tabs, Pinned and Announcements
                                 (client-side filters over the same
                                 `fetchMessages` result chat already uses —
                                 no new query), each newest-first. Accepts
                                 `?tab=pinned|announcements` to land on a
                                 given tab; the pinned strip always passes
                                 `?tab=pinned`. Rows show sender
                                 avatar/name/timestamp + body; tapping the
                                 avatar goes to that sender's
                                 `member/[userId]` (same pattern as chat).
                                 Registered in `[clubId]/_layout.tsx` with
                                 a plain title and its own `headerLeft`
                                 fallback to `chat` (task #14).
  (tabs)/clubs/[clubId]/club-profile/_layout.tsx
                                Stack wrapping the club-profile view + edit
                                 modal, same shape as (tabs)/profile/.
                                 `index`'s `headerLeft` is a `‹` button:
                                 `router.canGoBack()` → `router.back()`
                                 (returns to whichever of hub/chat/
                                 calendar/routines it was actually opened
                                 from — this is real in-app history, not a
                                 fixed route), else `router.replace` to the
                                 hub (`/clubs/${clubId}`) as the fallback
                                 for the direct-URL/refresh case where no
                                 history exists (task #13 follow-up fix)
  (tabs)/clubs/[clubId]/club-profile/index.tsx
                                Reached by tapping the club name in the
                                 chat/calendar/routines header. Club
                                 identity (avatar with an admin-only pencil
                                 overlay to upload a new picture, name,
                                 description, admin-only "Edit" button) on
                                 top, then the full member roster below —
                                 this is where "Members" lives now, there
                                 is no separate bottom tab for it. Roster
                                 rows show avatar + name + role and are
                                 tappable through to `member/[userId]`;
                                 admins additionally get "Make
                                 admin"/"Remove" per row (not on their own
                                 row), an "Add a member" search box, and a
                                 "Pending requests" approve/deny section —
                                 this is the old (club-tabs)/members.tsx,
                                 moved and merged with the club-identity
                                 section rather than kept standalone
  (tabs)/clubs/[clubId]/club-profile/edit.tsx
                                Admin-only form (name + description) for
                                 the club identity; non-admins hitting this
                                 route directly get redirected back to
                                 club-profile (same `router.canGoBack()`
                                 guard pattern as event/create.tsx)
  (tabs)/clubs/[clubId]/member/[userId].tsx
                                Read-only profile card for any other club
                                 member (avatar, name, description, city,
                                 date of birth, school) — no edit/sign-out,
                                 reuses lib/profile.ts's fetchProfile since
                                 profiles are readable by any authenticated
                                 user
  (tabs)/clubs/[clubId]/event/
    [eventId].tsx                Event detail view (admin sees Edit/Delete)
    create.tsx                   Admin-only create/edit form — edit mode
                                 via `?eventId=` query param
  (tabs)/clubs/[clubId]/race/[raceId]/
                                Placeholder screens only (chat, workout,
                                 carpool, info) — future phase, no backend
                                 tables exist for races yet

components/BackHeaderButton.tsx  makeBackHeaderLeft(router, fallback) —
                                 shared `‹` headerLeft factory used by
                                 every club-scoped Stack layout (task #13).
                                 Extracted after the same ~10-line
                                 canGoBack()/replace() component was
                                 written inline three separate times.
contexts/AuthProvider.tsx      Wraps supabase.auth session state
lib/supabase.ts                Supabase client (reads EXPO_PUBLIC_* env vars)
lib/clubs.ts                   fetchMyClubs / createClub / joinClubByCode /
                                 searchClubs / joinOrRequestClub /
                                 fetchClubProfile / updateClubProfile /
                                 uploadClubAvatar — reference pattern to
                                 follow for new features
lib/messages.ts                 fetchMessages / sendMessage / reactions /
                                 realtime subscription — chat backend.
                                 DisplayMessage carries senderAvatarUrl now
lib/calendar.ts                 fetchEvents / fetchEvent / createEvent /
                                 updateEvent / deleteEvent — calendar backend
lib/members.ts                   fetchClubMembers / promoteToAdmin /
                                 fetchPendingRequests / decideJoinRequest —
                                 roster + join-request backend.
                                 ClubMemberRow carries avatarUrl now
lib/profile.ts                   fetchProfile / updateProfile /
                                 uploadAvatar / formatDateOfBirth — profile
                                 view/edit + Supabase Storage avatar upload
lib/routines.ts                  fetchWeekWorkouts / fetchWorkout /
                                 createWorkout / updateWorkout /
                                 deleteWorkout — routines backend, plain
                                 CRUD over `routine_workouts` (no exercise
                                 sub-resource — see task #15's follow-up)
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
  0006_join_requests.sql          Adds clubs.join_policy (open | request,
                                 default request), club_join_requests table
                                 + RLS, and three RPCs: search_clubs (finds
                                 open/request clubs by name, excludes
                                 already-joined, security definer since
                                 non-members can't SELECT clubs directly),
                                 join_or_request_club (instant-join if
                                 open, else files/refreshes a pending
                                 request), decide_join_request (admin
                                 approve/deny, inserts club_members on
                                 approval)
  0007_system_message_type.sql    Adds 'system' to the message_type enum
                                 (its own migration — a new enum value
                                 can't be referenced in the same
                                 transaction that added it)
  0008_membership_chat_events.sql Triggers on club_members insert/delete
                                 that post a 'system' chat message ("X
                                 joined/left" or "X was added/removed by
                                 Y") — hooks the table so every join/leave
                                 path stays consistent automatically
  0009_profile_bio.sql             Adds profiles.bio (free-text description)
  0010_avatar_storage.sql          Creates the public 'avatars' Storage
                                 bucket + RLS on storage.objects so each
                                 user can only write inside their own
                                 `{user_id}/` folder; reads are public
                                 (needed for plain <Image>/Image src URLs)
  0011_profile_details.sql         Adds profiles.city, date_of_birth,
                                 school
  0012_role_change_chat_events.sql Trigger on club_members `update of role`
                                 that posts "X was promoted/removed as
                                 admin by Y" — same pattern as 0008, just
                                 for role changes instead of join/leave;
                                 handles either direction even though only
                                 promote (not demote) has UI today
  0013_club_avatar.sql             Adds clubs.avatar_url (editing it is
                                 already covered by the existing "admins
                                 can update their club" UPDATE policy from
                                 0003_rls.sql — no RLS change needed)
  0014_club_avatar_storage.sql     Creates the public 'club-avatars'
                                 Storage bucket. RLS differs from
                                 0010_avatar_storage.sql (profile pics):
                                 ownership here is "club admin", not "the
                                 uploading user", so the write policies
                                 check `is_club_admin(folder_name::uuid)`
                                 instead of `folder_name = auth.uid()`
  0015_routines.sql                Adds `routine_workouts` (club_id,
                                 workout_date, activity_type [run|
                                 trail_run|bike|swim|strength|
                                 hybrid_fitness|indoor_climb|bouldering|
                                 xc_ski|other], title, description,
                                 created_by). RLS
                                 follows the usual is_club_member (read) /
                                 is_club_admin (write) split. No chicken-
                                 and-egg SELECT-policy carve-out needed here
                                 (unlike `clubs` in section 6) — the
                                 creator is already a club member (an
                                 admin) at INSERT time, so INSERT ...
                                 RETURNING's implicit SELECT re-check
                                 always passes. Originally also had a
                                 `routine_exercises` table + a
                                 `pool_length` column, both removed (this
                                 migration was edited in place rather than
                                 reversed in a new one, since it hadn't
                                 shipped beyond this session/local dev
                                 yet) once the founder asked to simplify
                                 workouts down to just title + description
                                 — see task #15's follow-up note.
```

## 5. Current status (what's actually done vs. not)


| #   | Task                                                                                                 | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Expo scaffold + Expo Router navigation shell                                                         | ✅ Done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2   | Supabase schema + RLS (see migrations 0001-0005)                                                     | ✅ Done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 3   | Auth flow (sign up/in/out, session persistence, route guard)                                         | ✅ Done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 4   | Club creation, invite-code join, admin/member roles                                                  | ✅ Done, verified live end-to-end                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 5   | Club group chat                                                                                      | ✅ Done — real messages, multi-emoji reaction picker (tap "+" to choose from a set, tap an existing reaction to toggle your own), admin pin/announce, realtime confirmed live (verified by inserting a row directly via SQL and watching it appear in the browser with zero refresh). Photo/video attachments (Storage) deliberately **not** built yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 6   | Club calendar                                                                                        | ✅ Done — real `calendar_events` CRUD (`lib/calendar.ts`), list view grouped into Upcoming/Past (`(club-tabs)/calendar.tsx`), a detail screen (`event/[eventId].tsx`), and an admin-only create/edit form (`event/create.tsx`, edit mode via `?eventId=`). Verified live end-to-end via `CI=1 npx expo start --web` + Playwright: create, edit, delete, admin-vs-member visibility (no "+ New Event" FAB for members, direct navigation to `event/create` redirects members away), and realtime was **not** added (events change rarely; screen refetches on focus via `useFocusEffect` instead — see section 6 for why chat needed realtime but this doesn't). No new migration was needed — `calendar_events` schema + RLS already existed from 0001/0003. Date/time entry is plain `YYYY-MM-DD` / `HH:MM` text fields (no date-picker library is installed); good enough for MVP but a known UX rough edge if this needs to feel more polished later.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 7   | Members list + promote/remove/add                                                                    | ✅ Done — moved into `club-profile/index.tsx` (task #12); no standalone Members screen/tab exists anymore. Admins get "Make admin" and "Remove" per member (not shown on their own row), plus an "Add a member" search-by-name box that adds someone directly, bypassing `join_policy`/requests entirely (admin-initiated adds are trusted). All destructive/role-changing actions are confirmed via `window.confirm` on web / `Alert.alert` on native (section-6 gotcha). No migration needed for the original version — `club_members` INSERT/UPDATE/DELETE RLS and the open `profiles` SELECT policy already covered all of this. The duplicate-display-name rough edge noted originally is now resolved by task #10/#11 (avatars + tap-to-view-profile).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 8   | Search-by-name club join + join policy                                                               | ✅ Done — migration `0006_join_requests.sql` adds `clubs.join_policy` (`open` | `request`, default `request`) and a `club_join_requests` table. Club creation has a policy picker; `join.tsx` has a "Find a club" mode (debounced autosuggest via `search_clubs` RPC) alongside the unchanged invite-code mode. Picking an `open` club joins instantly; picking a `request` club files a request. Pending requests surface to admins in `club-profile/index.tsx` with Approve/Deny (`decide_join_request` RPC). Verified live end-to-end with three test users covering both policies and the approve flow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 9   | Chat system messages for membership changes                                                          | ✅ Done — migrations `0007_system_message_type.sql` (adds `'system'` to the `message_type` enum, in its own migration since a new enum value can't be referenced until the transaction that added it commits) and `0008_membership_chat_events.sql` (two `AFTER INSERT`/`AFTER DELETE` triggers on `club_members`). The triggers hook the table itself rather than each call site, so every path that changes membership — search-join, invite code, admin add/remove, approved request — posts a consistent message without each `lib/*.ts` function having to remember to do it. Message body branches on `auth.uid()` vs. the affected `user_id`: self-join/leave reads "X joined/left the club", admin-initiated reads "X was added/removed by Y". Rendered in `chat.tsx` as a centered italic line with no bubble/sender/reactions — visually distinct from real messages, per an explicit ask that it not look like a regular chat message. Verified live: both "added by" and "removed by" messages appeared correctly and in realtime via the existing `messages` subscription (no extra plumbing needed since these are just normal rows in the same table).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| —   | Race sub-flow (sub-chat, workout, carpool, results)                                                  | ⬜ Not started (no schema yet, placeholder nav screens only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| —   | Polls, video messages                                                                                | ⬜ Not started                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 10  | Profile page — avatar upload, bio, "your clubs"                                                      | ✅ Done — `profile.tsx` split into a folder (`profile/_layout.tsx` Stack, `profile/index.tsx` view, `profile/edit.tsx` modal form), per a hand-drawn wireframe from the founder. View screen: avatar (or an initial-letter placeholder if none set) with a pencil overlay button that directly opens the native/web image picker and uploads — no separate "Edit Profile" step for the photo specifically; name/email; a "Description" section (blank-state text if empty); a "Your clubs" list (tap a club to jump straight into its chat) — this last part wasn't in the wireframe, added per an explicit "it should show what clubs he is in" ask. "Edit Profile" opens a modal form (see task #11 for its full field set), `Save` writes via `lib/profile.ts` and pops back (`router.canGoBack()` fallback per the section-6 gotcha). Backend: migration `0009_profile_bio.sql` adds `profiles.bio`; migration `0010_avatar_storage.sql` creates a public `avatars` Storage bucket with RLS restricting writes to each user's own `{user_id}/` folder (this is the project's first use of Supabase Storage — chat photo/video attachments still don't use it). Avatar upload always overwrites the same storage path (`{user_id}/avatar`, no extension) and appends a `?t=<timestamp>` cache-buster to the stored public URL so re-uploads show immediately instead of hitting a stale cached image at the same URL. Added the `expo-image-picker` dependency + its `app.json` plugin entry (iOS photo-library usage string) — first native-module dependency beyond the initial scaffold. Verified live end-to-end via `CI=1 npx expo start --web` + Playwright, including actually uploading a real image through the browser's file picker (`browser_file_upload`) and confirming it persisted across a reload, not just an optimistic local update. **Follow-up fix**: the picker initially failed silently on real browsers (button visibly reacted to clicks, but no file dialog appeared) — `await`ing `requestMediaLibraryPermissionsAsync()` before `launchImageLibraryAsync()` was consuming the browser's user-activation window from the click before the picker call ran (Playwright's automated click didn't reproduce this, which is why the first round of testing missed it — see the web platform note in the Expo docs about `launchImageLibraryAsync` needing to run synchronously off a user gesture). Fix: skip the permission check entirely on web (it's not a meaningful concept there — it's just an `<input type=file>`), only gate native platforms on it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 11  | Promotion chat events, avatars in roster, tap-to-view member profile, city/DOB/school                | ✅ Done, three related additions from the same founder note. **(a)** Migration `0012_role_change_chat_events.sql` adds an `AFTER UPDATE OF role` trigger on `club_members` (`log_member_role_changed`), same shape as task #9's join/leave triggers, posting "X was promoted to admin by Y" (and the reverse direction too, even though nothing demotes yet — costs nothing extra to handle both ways now). **(b)** `members.tsx` roster rows now show each member's avatar (or initial-letter placeholder) next to name/role, and tapping the avatar+name area navigates to a new read-only screen, `clubs/[clubId]/member/[userId].tsx` (registered in `[clubId]/_layout.tsx`'s Stack) — showing that member's avatar, name, description, city, date of birth, and school. It reuses `lib/profile.ts`'s `fetchProfile(userId)` unchanged, since `profiles` are readable by any authenticated user already. The tappable name/avatar area is a sibling to the admin action buttons (not a parent wrapping them) specifically to avoid press-event bubbling between nested `TouchableOpacity`s on `react-native-web`. **(c)** Migration `0011_profile_details.sql` adds `profiles.city` / `date_of_birth` / `school`; `profile/edit.tsx` gained matching inputs (date of birth as a plain `YYYY-MM-DD` text field, consistent with the calendar's existing date-entry convention — validated client-side against the same `DATE_RE` shape used in `event/create.tsx`) and `profile/index.tsx` displays all three. **Bug caught during testing**: displaying `date_of_birth` via `new Date(iso).toLocaleDateString()` showed a day earlier than what was saved (e.g. saved 1995-06-15, displayed "June 14") — `new Date("YYYY-MM-DD")` parses as UTC midnight, which rolls back a day once rendered in a timezone behind UTC. Fixed by adding `formatDateOfBirth` to `lib/profile.ts`, which builds the `Date` from local y/m/d components instead of parsing the ISO string, and using it from both the self profile view and the new member profile view instead of duplicating the (broken) logic. Verified live end-to-end: promoted a member and confirmed the chat message, added avatars and confirmed tap-through to a member's profile card, and re-checked the date display showed the correct day after the fix.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 12  | Club profile screen, chat sender avatars, Members tab removed                                        | ✅ Done, from a founder wireframe request. **(a)** Chat messages show the sender's avatar next to their name now (`lib/messages.ts`'s `DisplayMessage` gained `senderAvatarUrl`, joined from `profiles` the same way `senderName` already was — no new query). **(b)** The club name in the chat/calendar/routines header is now tappable — `(club-tabs)/_layout.tsx`'s `headerTitle` became a `TouchableOpacity` instead of a plain string, pushing to a new `club-profile` screen. Since it's a `Stack.Screen` push (not a tab), the default back arrow works for free and returns to chat, per an explicit "so we can return to the chat" ask. **(c)** New `club-profile/index.tsx` + `edit.tsx` (mirrors the `profile/` folder shape): shows the club's avatar (admin-only pencil overlay to upload, same pattern as task #10's profile picture but a separate `club-avatars` bucket since ownership is "club admin" not "the uploader" — see migration `0014_club_avatar_storage.sql`), name, description, and an admin-only "Edit" button opening a name/description form (`0013_club_avatar.sql` adds `clubs.avatar_url`; editing name/description needed no new RLS, the existing "admins can update their club" policy from 0003 already covered it). **(d)** The member roster (previously its own `members.tsx` + bottom tab) moved into this same screen, below the identity section, per an explicit "we dont want the members on the bottom" ask — `(club-tabs)/_layout.tsx` no longer registers a Members tab, and the old `members.tsx` file was deleted (its contents live in `club-profile/index.tsx` now, unchanged otherwise). Verified live end-to-end: tapped the club name from chat and landed on club-profile with a working back button, uploaded a club avatar, edited the description, confirmed a non-admin sees no Edit/pencil/Add-member controls, and confirmed a non-admin hitting `club-profile/edit` directly gets redirected back (same guard pattern as `event/create.tsx`). **Follow-up fix**: after this shipped, there was no way back to the clubs list from inside a club at all — Chat/Calendar/Routines are a Tabs navigator mounted under a Stack.Screen with `headerShown: false`, so unlike every other pushed screen in the app they don't inherit a Stack back button for free. Added a `‹` `headerLeft` button to `(club-tabs)/_layout.tsx` (`router.back()`, falling back to `router.replace("/clubs")`) so every screen has a way back except the clubs list itself (the landing screen right after sign-in, where a back button wouldn't go anywhere). **Second follow-up fix**: the back button worked when entering a club from the Clubs list, but not from Profile's "Your clubs" list — clicking it (or even the browser's own back button) landed on `/clubs` instead of `/profile`. Root cause: `router.push` across tabs (Profile's stack → a route living in the Clubs tab's stack) doesn't leave real back-history to the origin tab, confirmed by testing actual browser back-navigation (`page.goBack()`), not just the in-app button — it also went to `/clubs`, proving this is a nested-tab-navigator history quirk, not a bug in the button's own logic. Fixed by having `profile/index.tsx` pass `?from=profile` when pushing into a club, and `(club-tabs)/_layout.tsx` reading that via `useLocalSearchParams` to explicitly `router.replace("/profile")` when present, falling back to the existing `canGoBack()`/`/clubs` logic otherwise. Verified live both ways: entering from Clubs list → back lands on Clubs list; entering from Profile → back lands on Profile.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| —   | Shareable join link (wraps `invite_code` in a URL)                                                   | ⬜ Deliberately deferred — founder wants this eventually but explicitly asked to defer it; `invite_code`/`join_club_by_code` already do the hard part, this is just UI + a URL scheme when picked back up.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 13  | Club navigation restructure (hub screen replaces bottom Tabs) + chat avatar → profile link           | ✅ Done, per the plan below plus one deviation found during live verification. `(club-tabs)/_layout.tsx` and the `(club-tabs)` route group are gone; `chat.tsx`/`calendar.tsx`/`routines.tsx` moved up to be plain `Stack.Screen`s directly under `[clubId]/`, alongside a new hub screen at `[clubId]/index.tsx` (three tappable rows, Chat/Calendar/Routines). `[clubId]/_layout.tsx` now registers `index`/`chat`/`calendar`/`routines` individually, all sharing one `clubScreenOptions` object (tappable club-name `headerTitle` → `club-profile`, admin-only invite-code `headerRight`) instead of that logic living in the deleted Tabs layout. The two direct-entry call sites (`clubs/index.tsx`, `profile/index.tsx`'s "Your clubs" list) now push to `/clubs/${id}` (the hub) instead of straight to `/clubs/${id}/chat`; the `?from=profile` cross-tab-back-history param carries over unchanged, now read by the hub screen instead of the old Tabs layout. Chat avatars are now wrapped in a `TouchableOpacity` pushing to `member/[senderId]`. **Deviation from the original plan**: the plan's step 1 assumed chat/calendar/routines could get "zero custom back-button logic" and rely purely on native Stack back. That's true only when the screen was reached by clicking through the app — a direct URL load or page refresh on any of these screens (or the hub itself) has no navigation history for the native back button to pop, so it silently doesn't render at all (same root cause as the `router.canGoBack()` gotcha in section 6, just newly hit here because these screens are no longer nested under a Tabs navigator that had its own always-present custom back button). Caught live via Playwright by direct-navigating to each URL instead of only clicking through. **Fix**: `_layout.tsx` gives every one of `index`/`chat`/`calendar`/`routines` an explicit `headerLeft` (`canGoBack() ? back() : replace(fallback)`, fallback = the hub for chat/calendar/routines, `/clubs` for the hub) instead of relying on the native button. The same gap existed on two screens outside the original plan's scope — `club-profile/_layout.tsx` (reached from four different screens: hub, chat, calendar, routines — fixed with the same pattern, fallback = the hub, verified `canGoBack()` correctly returns to whichever of the four it was actually opened from, not just the fallback) and `(tabs)/profile/_layout.tsx` (a bottom-tab root with no back button at all previously — fixed the same way, fallback = `/clubs`). All five screens verified live end-to-end via Playwright, both by clicking through (real history) and by direct URL navigation (fallback path): Main → Hub → Chat/Calendar/Routines → back at each level, club name tap → club-profile → back returns to whichever screen it was opened from, Profile tab → back to Clubs. `npx tsc --noEmit` clean throughout. The three inline copies of the back-button component were later extracted into `components/BackHeaderButton.tsx`'s `makeBackHeaderLeft(router, fallback)` (caught by an advisor review after the fact, not part of the original verification pass — see that file's note).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 14  | Chat: pinned-messages sticky strip, Highlights screen, per-message timestamps, auto-scroll-to-bottom | ✅ Done, from a founder wireframe request (reference screenshots were from a different app — confirmed with the founder that only two tabs, Pinned + Announcements, were wanted, not the third "Popular"/"My likes" tabs shown in the reference). **(a)** `chat.tsx` now renders a horizontally-scrollable sticky strip above the message list whenever ≥1 message is pinned, ordered newest-first (`[...messages].filter(pinned).reverse()`), each card showing sender avatar + name + truncated body; tapping any card pushes to `highlights?tab=pinned`, confirmed by the founder to always land on the Pinned tab rather than scrolling to that specific message. **(b)** New `highlights.tsx` screen: two tabs (Pinned / Announcements), both client-side filters over the same `fetchMessages` result chat already fetches (no new backend query or migration — `pinned`, `messageType`, `createdAt` all already existed on `DisplayMessage`), both newest-first, each row's avatar tappable through to `member/[userId]` (same pattern as chat). Registered in `[clubId]/_layout.tsx` with a plain "Highlights" title and `headerLeft` falling back to `chat` (via the shared `makeBackHeaderLeft` from task #13's later refactor). **(c)** Every real message bubble in chat now shows a small gray `HH:mm` (24-hour, locale-independent — built manually with `padStart` rather than `toLocaleTimeString`, so it doesn't vary by browser locale) timestamp right-aligned below the body. **(d)** Chat auto-scrolls to the newest message via a `FlatList` ref + `onContentSizeChange` → `scrollToEnd({ animated: true })`, which covers initial load, realtime updates from other members, and the current user's own sends with one code path (no separate manual `scrollToEnd()` call needed after `sendMessage`). Verified live end-to-end against a real club with real messages (not a fresh test club): pinned-strip card tap → landed on Highlights/Pinned showing the correct message; Announcements tab showed the correct announcement with no pin icon; timestamps appeared on every message; the list was already scrolled to the newest message on load. **Two issues caught after the initial pass, both from an advisor review + the founder's own live testing, not the original Playwright pass** (the test club only had one pinned message and one un-pinned announcement, so neither gap was exercised): **(1)** the strip is conditionally rendered (`pinnedMessages.length > 0`), so a club with announcements but nothing currently pinned had *no* UI path to the Announcements tab at all — fixed by adding a persistent "📌 Highlights" button to chat's header (`useLayoutEffect` + `navigation.setOptions` overriding the shared `headerRight`, same dynamic-override pattern as `event/create.tsx`'s title and the hub's `?from=profile` case), shown to every member regardless of admin status or pin state, alongside the existing admin-only invite code. **(2)** the founder flagged the strip rendering "too small" — the pinned card was visually squished into a single cramped line overlapping the message list below it; root cause was using `maxHeight` on a horizontal `ScrollView`, which doesn't reliably size the container's actual height on web. Fixed by switching to a fixed `height: 96` (plus `flexGrow: 0` / `flexShrink: 0` so it can't be compressed by sibling layout) and enlarging the card (72px tall, 36px avatar, 13px text) to match. Re-verified live with two pinned messages simultaneously (not just one, closing the gap in the original single-message-only test): both cards render side-by-side at full size with no overlap, newest-first ordering confirmed ("race day" pinned after "hey all" showed first), and the header button independently reaches Highlights (confirmed by loading `/highlights` with no `?tab` param) even without going through the strip.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 15  | Weekly routines                                                                                      | ✅ Done, per a founder screenshot walkthrough of a reference training app plus four explicit scoping calls made up front: (1) workouts are **dated to a real calendar week**, not a repeating Monday-template, so training can progress week over week; (2) **Run and Swim only** for this first build (the reference app's picker also listed Bike/Strength/etc., deliberately not built yet); (3) exercises use a **simplified** name + optional Time-or-Distance target + notes, not the reference app's full zone/intensity-range builder; (4) this phase is **read-only for members** — no completion tracking/logging. Migration `0015_routines.sql` adds `routine_workouts` and `routine_exercises` (see section 4 for the full RLS shape). `lib/routines.ts` follows the established `lib/calendar.ts` pattern (`fetchWeekWorkouts`/`fetchWorkout`/`createWorkout`/`updateWorkout`/`deleteWorkout`), with exercises always replaced wholesale on save rather than diffed. UI: `routines/index.tsx` (weekly Mon–Sun view with `‹`/`›` week paging, per-day workout cards or "Rest day", admin-only "+ Add workout"), `routines/activity-type.tsx` (admin-only Run/Swim picker), `routines/workout/create.tsx` (admin-only create/edit form — title, description, Swim-only pool-length chips, an editable exercise list), `routines/workout/[workoutId].tsx` (detail view, Edit/Delete for admins only). `routines/` is its own nested Stack (`routines/_layout.tsx`, same shape as `club-profile/_layout.tsx`) rather than flat screens in the parent layout, since it needed several sub-screens each with their own back-fallback — the parent `[clubId]/_layout.tsx` now just has `<Stack.Screen name="routines" options={{ headerShown: false }} />`, identical to how `club-profile` and `race/[raceId]` are already registered. **Bug caught and fixed during live verification**: the week-range label (`formatWeekRange`) originally omitted the month from the end date when both dates fell in the same month (e.g. formatting just `{ day: "numeric", year: "numeric" }`) — in this environment's `Intl`, calling `toLocaleDateString` with `day`+`year` but no `month` doesn't produce a clean "12, 2026", it produces "2026 (day: 12)". Fixed by always including `month` on both the start and end date, dropping the same-month conditional entirely (a same-month range now just reads "Jul 6 – Jul 12, 2026", which is clearer anyway). Verified live end-to-end via `CI=1 npx expo start --web` + Playwright with two separate accounts (admin + a second member joined by invite code): created a Run workout with a Time-target exercise ("Warm Up", 10:00) and a Swim workout with a pool length (50m) and a Distance-target exercise ("Interval", 400m), confirmed both landed on the correct day of the correct week; edited the Swim workout (removed its exercise, saved) and confirmed the change persisted; deleted it via the confirm dialog and confirmed it disappeared from the weekly view; confirmed the member account sees no "+ Add workout"/Edit/Delete anywhere and sees "Rest day" on empty days; confirmed direct-URL navigation to `routines/activity-type` and `routines/workout/create` both redirect a member away (same guard pattern as `event/create.tsx`); confirmed week `‹`/`›` paging shows an empty next week correctly; confirmed the tappable club name still reaches `club-profile` from the routines screen, matching every other club-scoped screen. `npx tsc --noEmit` clean throughout. **Follow-up simplification + bug fix, from live founder testing right after this shipped**: (1) the founder didn't want any exercise-builder complexity at all — dropped the entire exercise list (name/target-type/target-value/notes, `+ Add Exercise`/`✕` rows) and the Swim-only pool-length picker from `workout/create.tsx` and `workout/[workoutId].tsx`, down to just a title + description, "very simple" per an explicit ask. `routine_exercises` and `routine_workouts.pool_length` were removed from `0015_routines.sql` directly (edited in place, not reversed via a new migration, since this table had never shipped beyond this session) and `lib/routines.ts`/`types/database.ts` simplified to match — `RoutineTargetType`/`RoutinePoolLength` and the whole `replaceExercises` delete-then-reinsert path are gone. Run/Swim as the two activity types is unchanged. (2) Separately, the founder found the back button on the `workout/create` modal screen and on `member/[userId]` was "clickable but not visible" — root cause: those two screens (plus, on inspection, `event/[eventId]` and `event/create`, which had the identical gap) were the only club-scoped screens left relying on React Navigation's *default* native back chevron instead of the app's own `makeBackHeaderLeft` (a plain Unicode "‹" `Text`, not an icon-font glyph) that every other screen already uses — the default chevron icon apparently fails to render visibly in this web setup while still being clickable. Fixed by giving all four screens an explicit `headerLeft: makeBackHeaderLeft(...)` in `[clubId]/_layout.tsx`/`routines/_layout.tsx`, matching the pattern everywhere else (fallback = `calendar` for the two event screens, `club-profile` for `member/[userId]`, `routines` for `workout/create`). Re-verified both fixes live: the simplified create form is just title+description for both Run and Swim, the "‹" is now visibly rendered (not just clickable) on `workout/create` and `member/[userId]`, and tapping it from `member/[userId]` correctly returns to `club-profile`. `npx tsc --noEmit` clean throughout. **Second follow-up, from a further founder ask right after that**: since the create form no longer has any sport-specific fields, there was no reason left to restrict the activity picker to Run/Swim only — expanded `activity-type.tsx` to all 9 types from the reference app's own picker (Run, Trail Run, Bike, Swim, Strength, Hybrid Fitness, Indoor Climb, Bouldering, XC Ski) plus a 10th "Other" catch-all the founder asked for immediately after seeing the 9, mirroring `calendar_event_type`'s own `other`. `routine_activity_type` (edited in place in `0015_routines.sql`, same as the earlier simplification, since it still hadn't shipped beyond this session) now has all 10 values. Pulled the value/label/icon list out of `activity-type.tsx` into a single exported `ACTIVITY_TYPES` (plus derived `ACTIVITY_LABELS`/`ACTIVITY_ICONS`) in `lib/routines.ts`, since duplicating a 10-entry list across `activity-type.tsx`, `routines/index.tsx`, `workout/create.tsx`, and `workout/[workoutId].tsx` (each previously kept its own 2-entry copy) would only get worse as more types are added. Verified live: all 10 rows render with distinct icons on `activity-type`, picking Bouldering pre-fills the title "Bouldering" and saves/loads correctly, and picking Other pre-fills "Other" (editable, same as every other type) and saves/loads correctly. `npx tsc --noEmit` clean throughout. **Third follow-up**: the weekly view originally showed all 7 days of the current week including ones already past (e.g. loading the view on a Thursday still showed Monday–Wednesday). Per an explicit founder confirmation ("we should be able to see today and future days"), `routines/index.tsx` now filters out any day before today (`dateKey < todayKey`) before rendering, and disables the `‹` prev-week button once `weekStart` reaches `getMonday(new Date())` (greyed out, `disabled` prop set) so there's no way to page to a fully-past week either. Future weeks are unaffected — all 7 days render normally since none of their dates are before today. Verified live on a Thursday: the current week showed only Thursday–Sunday, the `‹` button was inert (no `cursor: pointer`, click did nothing), and paging forward one week showed the full Monday–Sunday with `‹` re-enabled (since that week can page back to the current one). |


**Immediate next step**: The Race sub-flow (sub-chat, workout, carpool,
results) — no schema yet, only placeholder nav screens exist today under
`race/[raceId]/`. This is the last major MVP phase before polls/video.

### Task #13 detail: club navigation restructure + chat avatar → profile link

**Context.** The current per-club navigation uses a bottom Tabs bar
(Chat / Calendar / Routines) nested inside each club, with a custom
`headerLeft` back button hacked on top because Tabs navigators don't
inherit a Stack back button for free (see the two "Follow-up fix" notes on
task #12 above). The founder wants a stricter hierarchy instead, from a
hand-drawn wireframe: **Main (clubs list) → tap a club → a hub screen
listing Chat / Calendar / Routines as rows → tap one → that screen, with a
normal back button returning one level at a time** (hub→main,
screen→hub). This also makes back-navigation "just work" via the Stack's
native back button instead of custom logic, for the same-tab case.

Members/club identity stays exactly where it is today — reached by
tapping the club name in the header, same as now, confirmed by the
founder ("to see members they will go to chat and hit the club name same
logic"). So `club-profile/` (avatar, description, edit, roster) is
unchanged; only the *landing point* when you tap a club changes, from
Chat directly to a new hub screen.

Separately: chat message avatars aren't tappable yet, but should navigate
to the sender's profile card (same `member/[userId]` screen already used
from the roster).

**Key insight: route paths don't change.** `(club-tabs)` is an Expo
Router *route group* — the parentheses mean it never appeared in the URL.
`/clubs/[clubId]/chat` and `/clubs/[clubId]/calendar` are already the real
paths today. So removing the Tabs wrapper and turning chat/calendar/routines
into plain `Stack.Screen`s does **not** change any existing link to them —
only two call sites push directly into a club, and only those two need
updating (see below).

**Changes:**

1. **Remove the Tabs wrapper, promote chat/calendar/routines to plain
  Stack screens.** Delete `app/(tabs)/clubs/[clubId]/(club-tabs)/_layout.tsx`
   and the `(club-tabs)` folder. Move `chat.tsx`, `calendar.tsx`,
   `routines.tsx` up to `app/(tabs)/clubs/[clubId]/` directly, adjusting
   each file's relative imports (one fewer `../` since they're one level
   shallower now; e.g. the `useClub` import becomes `"./_layout"` instead
   of `"../_layout"`). In `app/(tabs)/clubs/[clubId]/_layout.tsx`, replace
   the single `<Stack.Screen name="(club-tabs)" .../>` entry with
   individual entries for `index`, `chat`, `calendar`, `routines`, each
   sharing the same `headerTitle` (tappable club name → `club-profile`,
   exact behavior copied from the current `(club-tabs)/_layout.tsx`) and
   `headerRight` (admin-only invite code, also copied as-is) — this
   preserves "tap the club name to see members/profile" identically on
   every one of these screens, per the founder's explicit confirmation.
   `useRouter` needs to be imported into this layout file (not currently
   used there). Chat/Calendar/Routines get zero custom back-button logic —
   native Stack back (automatic once they're not the stack root)
   correctly returns to the hub (`index`), since that's genuinely the
   previous screen in the same tab's stack now.
2. **New hub screen: `app/(tabs)/clubs/[clubId]/index.tsx`.** Three
  tappable rows — Chat / Calendar / Routines — styled like existing list
   rows elsewhere in the app (rounded rect, label + trailing `›`), pushing
   to `chat` / `calendar` / `routines` respectively. Same shared header as
   the other three screens (tappable name → `club-profile`, invite code).
   Back-button special case: this is the only screen reachable from a
   *different* top-level tab (Profile's "Your clubs" list), which — per
   the section-6 gotcha above about cross-tab `router.push` — doesn't
   leave real cross-tab back-history. Reuse the same `?from=profile`
   query-param pattern already proven for this in the current
   `(club-tabs)/_layout.tsx`: read `from` via `useLocalSearchParams`, and
   if `from === "profile"`, override `headerLeft` (via `useLayoutEffect` +
   `useNavigation().setOptions`, matching the dynamic-title pattern
   already used in `event/create.tsx`) to `router.replace("/profile")`.
   Otherwise, no override — native back to `/clubs` (the Main list) just
   works, since `clubs/index.tsx` is genuinely beneath this screen in the
   same stack.
3. **Update the two entry points that push directly into a club.**
  - `app/(tabs)/clubs/index.tsx` (Main list): change
   `router.push(`/clubs/${item.id}/chat`)` → `router.push(`/clubs/${item.id}`)`
   (lands on the new hub instead of skipping straight to Chat).
  - `app/(tabs)/profile/index.tsx` ("Your clubs" list): change
  `router.push(`/clubs/${club.id}/chat?from=profile`)` →
  `router.push(`/clubs/${club.id}?from=profile`)`.
4. **Chat avatar → sender's profile.** In
  `app/(tabs)/clubs/[clubId]/chat.tsx`, wrap the sender avatar
   (`Image`/initial-placeholder `View`, currently inside the `messageRow`)
   in a `TouchableOpacity` that navigates to
   `router.push(`/clubs/${club.clubId}/member/${item.senderId}`)`.
   Applies to every real message (not system messages, which don't render
   an avatar at all already). No special-casing your own messages —
   tapping your own avatar shows your own read-only member card, which is
   harmless and keeps the logic uniform.

**Files touched:**

- `app/(tabs)/clubs/[clubId]/(club-tabs)/_layout.tsx` — deleted
- `app/(tabs)/clubs/[clubId]/(club-tabs)/{chat,calendar,routines}.tsx` — moved up one level, imports adjusted
- `app/(tabs)/clubs/[clubId]/index.tsx` — new (hub screen)
- `app/(tabs)/clubs/[clubId]/_layout.tsx` — Stack.Screen registrations updated, shared header options added
- `app/(tabs)/clubs/[clubId]/chat.tsx` — avatar becomes tappable
- `app/(tabs)/clubs/index.tsx` — club row now pushes to the hub
- `app/(tabs)/profile/index.tsx` — club row now pushes to the hub (keeps `?from=profile`)
- This SPEC.md — update repo layout (section 4) + status table (section 5) to reflect the new hierarchy once built, and note in section 6 that the old Tabs-based back-button hack is gone (replaced by native Stack back everywhere except the one documented cross-tab case)

No migrations — this is entirely client-side routing/UI.

**Verification:**

- `npx tsc --noEmit` after the moves (relative-import path changes are the
main risk of breakage).
- `CI=1 npx expo start --web` + Playwright, covering:
  - Main list → tap a club → lands on hub with Chat/Calendar/Routines rows,
  no bottom tab bar.
  - Tap Chat → back button → returns to hub (not Main list).
  - Tap the club name from the hub, and separately from Chat → both go to
  `club-profile` (members/description/edit), confirming "same logic"
  still holds on every screen.
  - Profile tab → "Your clubs" → tap a club → lands on hub; back button →
  returns to `/profile` (not `/clubs`).
  - Main list → tap a club → hub → back button → returns to `/clubs`
  (regression check for the non-cross-tab case).
  - In Chat, tap a message's avatar → lands on that sender's `member/[userId]`
  profile card.

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
- `**types/database.ts` is hand-written**, not generated. supabase-js's
`Database` generic requires each table to have `Row`, `Insert`,
`Update`, **and `Relationships: []`**, and the schema object needs
`Tables`, `**Views: {}**`, and `**Functions: {}**` all present —
omitting any of these silently resolves query types to `never` instead
of erroring loudly. If a live project ever exists again, regenerate
properly with `npx supabase gen types typescript`.
- **Expo Router needs an explicit `app/index.tsx`** even though all it
does is show a spinner while the real auth-guard redirect (in
`app/_layout.tsx`, via `useSegments()`) sends the user to `(auth)` or
`(tabs)`. Without it, Expo Router shows its own "Unmatched Route" page
at `/` before the redirect effect gets a chance to run.
- `**(tabs)/clubs/` needed its own `_layout.tsx**` (a `Stack` wrapping
`index` + `[clubId]`) — without it, Expo Router hoisted
`clubs/[clubId]` as a *third, stray tab* in the bottom tab bar instead
of nesting it under the "Clubs" tab.
- `**CI=1 npx expo start --web*`* is how this project gets smoke-tested
headlessly (via Playwright MCP tools) during development — CI mode
disables Fast Refresh, so after any route/layout change the dev server
needs a restart (`pkill -f "expo start"`, then relaunch) rather than
relying on hot reload to pick it up.
- `**react-native-web`'s `Alert.alert` is a total no-op on web** (see
`node_modules/react-native-web/src/exports/Alert/index.js` —
`static alert() {}`). Any confirm-before-destructive-action flow (e.g.
delete event) needs a `Platform.OS === "web"` branch that uses
`window.confirm` instead, or the button silently does nothing on web
while still working fine on iOS/Android. Caught this only by actually
clicking Delete in the Playwright smoke test and checking the DB row
was still there — the click reported success with zero console errors.
- `**router.back()` throws "action 'GO_BACK' was not handled"** if the
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
- `**router.push`ing across sibling tabs doesn't leave real back-history
to the tab you came from.** `(tabs)/profile/index.tsx`'s "Your clubs"
list pushes into `/clubs/[clubId]/chat`, a route that lives under the
*Clubs* tab's own Stack, not the Profile tab's. After that push, both
the app's own back button (`router.back()`) **and the browser's native
back button** (confirmed with Playwright's `page.goBack()`, not just
the in-app control) landed on `/clubs` — the root of the Clubs tab's
stack — instead of `/profile`. This isn't a bug in whatever reads
`canGoBack()`; the previous tab's stack entry genuinely isn't part of
the new tab's back-history once focus switches this way, so there is no
"back" path to it via the local stack a screen belongs to. **Fix**:
don't rely on generic back-navigation for cross-tab entry points — pass
the origin explicitly (a `?from=profile` query param) and have the
destination screen check for it and `router.replace()` to the known
origin, falling back to normal `canGoBack()`/tab-root logic otherwise.
Any future screen reachable from more than one tab should use the same
pattern rather than assuming `router.back()` "just works."
- **Update (task #13): the Tabs-based back-button hack described above is
gone — but it turned out a custom `headerLeft` is still needed on every
one of these screens, not just the cross-tab one.** Chat/Calendar/
Routines are no longer a `Tabs` navigator nested under a
`headerShown: false` `Stack.Screen` — they're plain `Stack.Screen`s
directly under `[clubId]/`, with a new hub screen (`[clubId]/index.tsx`)
as the landing point instead of Chat. The original assumption was that
native Stack back would "just work for free" once these were plain
Stack screens, since a genuinely previous screen would exist in the
local stack. That's true when reached by clicking through the app, but
**a native back button only renders when `canGoBack()` is true, and
direct URL navigation or a page refresh on any of these screens leaves
no history at all** — this is the exact same `router.canGoBack()`
gotcha as the `event/[eventId]`/`event/create` entry above, just newly
surfaced here because these screens used to be nested under a Tabs
navigator with its own always-present custom back button, which masked
it. **Fix**: every one of `index`/`chat`/`calendar`/`routines` in
`[clubId]/_layout.tsx`, plus `club-profile/index` and `profile/index`,
now gets an explicit `headerLeft` — `canGoBack() ? back() : replace( fallback)` — instead of relying on the native button, with the fallback
route picked per screen (chat/calendar/routines → the hub; the hub →
`/clubs`; club-profile → the hub; profile → `/clubs`). The `?from= profile` cross-tab pattern above still layers on top of this the same
way it always did — it moved from the old Tabs layout's `headerLeft`
override to the hub screen's own `useLayoutEffect` +
`navigation.setOptions` override (same pattern `event/create.tsx` uses
for its dynamic title), which still takes precedence over the hub's own
base `headerLeft` when `from === "profile"` is present. Caught live by
testing direct URL navigation to each screen via Playwright, not just
clicking through — the click-through case looked completely correct
and would not have surfaced this on its own.

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
`EXPO_PUBLIC_SUPABASE_`* values in `.env`.

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

---

## Task 17: Eboard & Council

Built from a founder's hand-drawn wireframe (photographed, four sections:
a "for members" hub mockup without the row, a "for admins" hub mockup
with it, a note on the create flow, and a "Chat / Meetings" box for what's
inside). Before writing any code, three ambiguous points in the wireframe
were resolved via `AskUserQuestion` rather than guessed, since each one
materially changes the RLS design:

1. **Structure** — is "Eboard & Council" a *list* of admin-created
   sub-channels (like Races & Meets), or a single fixed chat per club?
   → **Single fixed chat.** Exactly one `eboard_channels` row per club
   (`unique` on `club_id`), no list/create-many flow.
2. **Admin access** — for races, every club admin automatically has full
   access to every race (`is_race_admin` == `is_club_admin`, no request
   needed). Should Eboard/Council work the same way?
   → **No.** Being a club admin only grants *visibility* (seeing the hub
   row exists, and being eligible to request/be added) — not automatic
   membership. An admin still has to request to join or be added by an
   existing member. This is the single biggest deviation from the Race
   pattern and drives most of the migration's shape.
3. **Who can ever join** — could a non-admin ever be added to a specific
   Eboard/Council channel?
   → **No, admin-only.** Keeps it consistent with the hub row being
   entirely invisible to regular members.
4. **Meetings** (the second item in the wireframe's "Chat / Meetings"
   box) — placeholder for now, scoped later, same as Race's four
   unscoped sections.

### Migration design (`0017_eboard.sql`)

Same overall shape as `races` (0016): `eboard_channels`,
`eboard_channel_members`, `eboard_channel_join_requests`, plus a nullable
`channels.eboard_channel_id` so eboard chat reuses messages/
message_reactions RLS with zero changes — exactly the same generic-
`channels` payoff task #16 already demonstrated for races.

The three deliberate deviations from races, encoded in RLS:
- `eboard_channels` SELECT policy is `is_club_admin(club_id)` — any club
  admin can see the row/name/description exists, whether or not they're a
  member. No chicken-and-egg SELECT-after-INSERT issue (see section 6's
  `clubs` gotcha) since `is_club_admin(club_id)` doesn't depend on
  anything this row's own trigger creates.
- A new generic helper, `is_user_club_admin(club_id, user_id)`, checks an
  *arbitrary target user* (not just the caller) — needed because the
  direct-add insert policy on `eboard_channel_members` must verify the
  person being added is a club admin, not just that the adder is already
  a member. Races never needed this since race membership has no such
  eligibility requirement.
- Approve/direct-add rights on `eboard_channel_members` and decide rights
  on `eboard_channel_join_requests` both check `is_eboard_member(...)`
  (existing membership), not `is_eboard_club_admin(...)` (any club
  admin) — the opposite of races' `decide_race_join_request`, which
  authorizes on `is_race_admin` (== `is_club_admin`) precisely because
  every admin already has automatic race access anyway. Here that would
  let any admin approve their own pending request instantly, defeating
  the whole point of gating.
- `is_channel_admin` for an eboard-scoped channel resolves to
  `is_eboard_member(...)`, not `is_club_admin(...)` — but since the
  insert policy above guarantees every member is already a club admin,
  this is equivalent in practice: no separate "eboard admin" role is
  needed, everyone inside has full pin/announce rights.

**A real index-collision bug caught mid-migration, before any app code
was touched**: the existing `channels_one_per_club` partial unique index
from 0016 was `unique (club_id) where race_id is null`. An eboard
channel's own `channels` row also has `race_id is null` (it's not a
race), so it collides with the club's actual main channel under that same
index — inserting the second row would fail. Re-scoped to
`where race_id is null and eboard_channel_id is null`. The same
`log_member_added`/`log_member_removed`/`log_member_role_changed`
trigger functions 0016 already had to patch once (when race channels
first broke the "one channel per club" assumption) needed a **second**
patch for the identical reason — their `where club_id = ... and race_id
is null` lookup now also matches an eboard channel's row, so `and
eboard_channel_id is null` was added to all three.

### Two more real bugs, caught live during the Playwright verification pass

These were **not** caught by the migration/type-check pass — both only
surfaced once actually clicking through the app as a non-admin/non-member
user, which is exactly why SPEC.md section 8 insists on a live smoke test
before declaring a feature done.

1. **`app/(tabs)/clubs/[clubId]/_layout.tsx`'s main-channel lookup broke
   the same way the trigger functions almost did, but in client code**:
   `supabase.from("channels").select("id").eq("club_id", clubId).is("race_id", null).single()`
   — once an eboard channel existed, this matched 2 rows (the real main
   channel and the eboard channel's row, both `race_id is null`) and
   `.single()` threw a 406. This broke `club-profile` (and would have
   broken club chat) for *any* club that had ever created an Eboard &
   Council channel, admin or not — a total regression of an unrelated,
   already-shipped screen. Caught by simply navigating to
   `club-profile` after creating the test club's eboard channel. Fixed by
   adding `.is("eboard_channel_id", null)` to the same query — this was
   the one place in the whole client codebase still doing this lookup
   (checked via `grep -rn 'is("race_id"'` across `app/` and `lib/` to
   confirm no other instances existed).
2. **`lib/eboard.ts`'s `fetchEboardChannel` unconditionally fetched the
   `channels` row** (`eq("eboard_channel_id", row.id).single()`) even for
   a club admin who wasn't yet an eboard member. But the `channels`
   SELECT policy routes through `is_channel_member`, which for an
   eboard-scoped channel is `is_eboard_member(...)` — deliberately *not*
   `is_club_admin`, per deviation #2 above. So a non-member admin's read
   was correctly blocked by RLS, returned 0 rows, and `.single()` threw a
   406 — which surfaced as a permanent spinner on the Eboard & Council
   hub screen the moment a promoted-but-not-yet-a-member admin opened it.
   Caught live testing exactly that path (promote a member to admin, sign
   in as them, open the row). Fixed by only querying the `channels` row
   *after* confirming membership — a non-member never needs `channelId`
   anyway, since `chat.tsx`/`roster.tsx`'s mutation actions are already
   gated on `isMember`.

### Verification

Both bugs above were fixed, the dev server restarted (`CI=1` disables
Fast Refresh, per section 6), and the full flow re-verified end-to-end
with three accounts against a fresh test club ("Eboard Test Club"):
- As the creating admin (Ann): created "Eboard" (name + description, no
  date field), confirmed she was auto-added to its roster and a dedicated
  channel was auto-created, hub showed Chat + Meetings.
- Sent a chat message, pinned it, confirmed the pinned strip + badge +
  Highlights screen all matched club/race chat exactly (full parity from
  the shared `ChatScreen`/`HighlightsScreen` components, zero eboard-
  specific chat code needed).
- As a second user (Bob) who joined the club as a **regular member**:
  confirmed the "Eboard & Council" row was entirely absent from the club
  hub, and that navigating to `/eboard` directly redirected away —
  regular members can't even discover the feature exists.
- Promoted Bob to club admin, signed in as him: the row now appeared, but
  clicking it showed "Request to join" (not automatic access, unlike
  races) — confirmed the deliberate deviation is actually wired up
  end-to-end, not just in the RLS policies. Requested, then confirmed a
  direct URL hit to `/eboard/chat` bounced back to the hub (still not a
  member while pending).
- As Ann: opened the roster (reached by tapping the channel name, same
  pattern as club-profile/race roster), saw Bob's pending request,
  approved it.
- Added a third account (Carol), promoted her to club admin, then — as
  Ann, an existing eboard member — used the roster's "Add a member"
  search (confirmed scoped to this club's own admins only, via
  `searchClubAdminsToAdd`) to add Carol directly, with no request step at
  all.
- Confirmed both paths produced the correct system messages in eboard
  chat ("Member Bob was added by Admin Ann", "Admin Carol was added by
  Admin Ann"), and separately confirmed the main club chat's own
  join/promotion system messages were unaffected (regression check on
  the trigger-function patch).
- **Deny path** (flagged as an untested gap by a self-review pass after
  the rest of this task looked done): added a fourth admin (Dana),
  requested, denied as Ann. Confirmed the request left the pending queue
  with no `eboard_channel_members` row created, and — the part that
  actually exercises `request_join_eboard_channel`'s
  `on conflict (...) do update ... where status <> 'pending'` upsert
  branch — that Dana's own hub view reset to "Request to join" rather
  than getting stuck showing "Requested" after the denial. This mattered
  more than a routine coverage gap: Deny is the other half of the one
  authorization rule this task deliberately reworked (decided by an
  existing member, not by any club admin), so it was worth confirming
  end-to-end rather than trusting the Approve path alone.
- `npx tsc --noEmit` clean throughout.

---

## Task 18: Eboard & Council — Meetings

Built from a second founder wireframe scoping the "Meetings" placeholder
task #17 left behind: fields for date+time, meeting title, description,
and a meeting link (examples given: "Zoom, brightspace"). The wireframe
sketched a calendar-grid date picker (year/month arrows, a day grid) and
an AM/PM time stepper widget, but explicitly annotated both as "If its UI
thing we can do later" — so this task used the plain `YYYY-MM-DD` +
`HH:MM` text-field convention already established for calendar events
(`event/create.tsx`), races, and DOB throughout the app, rather than
introducing a new date-picker library or building a custom calendar-grid
component. Deferring that widget was an explicit, in-wireframe founder
call, not a scope cut made unilaterally.

### Data model (`0018_eboard_meetings.sql`)

`eboard_meetings`: `eboard_channel_id`, `title`, `description`,
`meeting_link`, `meeting_at` (a single combined timestamp, not separate
start/end like `calendar_events` — the wireframe only asked for one
date+time), `created_by`. RLS follows the same reasoning as the rest of
Eboard & Council: since every `eboard_channel_member` is already
guaranteed to be a club admin (enforced in 0017's insert policy), any
member could originally select/insert/update/delete freely — no separate
"eboard admin" role, consistent with chat's pin/announce rights.

### UI

- `meetings.tsx` (replacing task #17's placeholder): Upcoming/Past list,
  same grouping shape as `calendar.tsx`, gated on `eboard.channel.isMember`
  the same way `chat.tsx` is (a direct URL hit from a non-member bounces
  back to the hub).
- `meeting/create.tsx`: title, description, the plain date/time fields
  described above, and an optional link field. Reuses `event/create.tsx`'s
  `splitIso`/`combineToIso` helpers verbatim (duplicated locally rather
  than extracted to a shared module, matching this codebase's existing
  style of small per-screen duplication over premature abstraction).
- `meeting/[meetingId].tsx`: detail view + Edit/Delete, modeled directly
  on `event/[eventId].tsx` including its `Platform.OS === "web"` delete-
  confirm branch (react-native-web's `Alert.alert` is a no-op — SPEC.md
  section 6's gotcha, already hit once before, applied here without
  re-discovering it).

### Follow-up 1, same session: creator-only edit

Right after this shipped, the founder asked for a scope tightening: only
the meeting's creator should be able to edit it, and the detail view
should show who created it.

`0019_eboard_meetings_creator_edit.sql` drops and recreates the update
policy as `using (is_eboard_member(...) and created_by = auth.uid())`
(delete policy untouched at this point). `lib/eboard.ts`'s
`fetchMeetings`/`fetchMeeting` gained an `attachCreatorNames` helper — the
exact same pattern `lib/calendar.ts` already uses for `createdByName` —
so the detail screen could show "Added by \<name\>" (matching
`event/[eventId].tsx`'s "Created by" line almost verbatim). The Edit
button is hidden client-side for non-creators
(`meeting.createdBy === session?.user.id`), and `meeting/create.tsx` also
redirects a non-creator away if they hit the edit URL directly instead of
letting them fill out a form that would fail on submit.

### Follow-up 2, same session: creator-only delete too

Immediately after verifying follow-up 1, the founder tightened it
further: delete should also be creator-only, not open to any eboard
member — every other member's role on someone else's meeting is now
purely to view it. `0020_eboard_meetings_creator_delete.sql` drops and
recreates the delete policy with the same
`created_by = auth.uid()` check. On the UI side, the Edit/Delete
`<View style={styles.actions}>` block in `meeting/[meetingId].tsx` was
wrapped in the same `meeting.createdBy === session?.user.id` condition
that already gated Edit alone — a non-creator now sees neither button,
just the read-only detail (title, when, link, description, "Added by").

### Verification

`supabase db reset` + `npx tsc --noEmit` clean after the initial build
and both follow-ups. Live end-to-end with two accounts against a fresh
test club each time a policy changed: as the creating admin (Ann),
created a meeting with all fields including a Zoom link, confirmed the
detail view formatted the date/time correctly and the link rendered as
tappable; edited the title and confirmed the change persisted; confirmed
the list screen correctly grouped it under "Upcoming"; deleted it and
confirmed the list returned to its empty state — all as the creator, with
both buttons visible. After follow-up 2, promoted a second member (Bob)
to club admin and added him directly to the eboard channel (not via
request, to isolate "not the creator" from any membership-path
variable), then — signed in as Bob, viewing a meeting Ann had created —
confirmed the detail screen showed "Added by Admin Ann" with no Edit or
Delete button rendered at all, just the read-only fields.

---

## Task 19: Race — Car Assignments & Groups

Scoped from a founder wireframe: a race admin creates auto-numbered
groups ("Group 1", "Group 2", ...) under a race — no naming prompt, the
wireframe showed "+ Add Group" with no name field drawn at all — adds
members to each, and designates one "Incharge" per group. Filled in the
last of Race's four originally-placeholder sections that had an actual
scope handed down (Location & Accommodation, Photos, and Result Link
remain placeholders).

Before writing any code, four ambiguous points were resolved via
`AskUserQuestion` rather than guessed, since each shapes the RLS design:

1. **Member pool** — should "Add member" search the race's own roster
   (approved `race_members` + club admins, who have automatic race
   access without a roster row), or the whole club regardless of race
   membership? → **Race roster only.** This is the opposite scoping from
   `race/roster.tsx`'s own "Add a member" (which deliberately searches
   the *whole club*, since that screen's job is adding people *to* the
   race in the first place) — car groups assume you're already in.
2. **One group per person?** → **Yes.** A person can't be in two car
   groups for the same race simultaneously.
3. **Who manages** (create groups, add/remove members, set Incharge)?
   → **Admins only**, consistent with every other management surface in
   this app (race roster, eboard roster, club-profile). Regular race
   members get the identical view, read-only.
4. **Group naming** — auto-numbered instantly, or prompt for a name like
   Eboard's create form? → **Auto-numbered, no prompt** — matches the
   wireframe exactly.

### Data model (`0021_race_car_groups.sql`)

`race_car_groups` (`race_id`, `name`, `incharge_user_id`) and
`race_car_group_members` (`car_group_id`, `race_id`, `user_id`,
`added_by`). `race_id` is deliberately denormalized onto the membership
table — the "one group per person per race" rule from decision #2 is
enforced with a single `unique(race_id, user_id)` constraint, which
wouldn't be expressible as a table constraint if `race_id` only lived on
the parent `race_car_groups` row.

A new helper, `is_user_race_participant(race_id, user_id)`, checks an
*arbitrary target user* (not just the caller) against
`race_members` OR club-admin status — needed because the add-member
insert policy must verify the person being added actually has race
access (decision #1), the same shape of problem `is_user_club_admin`
solved for Eboard's direct-add in task #17.

Two data-integrity pieces neither asked for explicitly but implied by
"Incharge" being a real relationship, not just a label:
- A trigger (`clear_incharge_on_member_removed`) nulls out a group's
  `incharge_user_id` if that specific member is later removed from the
  group — otherwise removing someone would leave the badge pointing at a
  no-longer-member.
- `set_car_group_incharge` is its own RPC rather than a plain client
  `update`, so it can validate the target is a *current member of that
  group* before setting them Incharge — "the admin can make anyone
  Incharge" in the wireframe means anyone in the group, not literally
  anyone in the race.

### UI (`race/[raceId]/carpool.tsx`)

Group cards, each listing members with an inline admin-only "+ Add
member" search (only one group's search box open at a time — opening
another's collapses the first) and per-member "Make/Remove Incharge" +
"Remove" buttons. An admin-only "+ Add Group" button creates the next
group with a client-computed name (`Group ${groups.length + 1}`) — no
RPC needed for creation, matching how `createRace` and other simple list
items in this app are just plain inserts. Regular race members see
identical cards with no buttons at all, including the Incharge tag,
per an explicit follow-up ask ("the incharge tag should be visible to
everyone who can see") confirming it was never meant to be admin-only
information — checked against the code and it already rendered
unconditionally, no change needed, just re-verified live to be sure.

### A real bug caught immediately by its own Playwright pass

The very first click on "+ Add member" produced 66 console errors:
`Maximum update depth exceeded`. Root cause: the pool of user IDs to
exclude from search (everyone already in *any* group, per decision #2)
was computed as a plain `groups.flatMap(...)` inline in the component
body — a brand-new array on every render. That array was a dependency of
the debounce `useEffect` driving the search box, and that same effect's
early-return branch called `setAddResults([])` unconditionally whenever
the query was under 2 characters. Since `[] !== []` by reference, that
`setState` always triggered a re-render; the re-render recomputed the
`flatMap` into a new array; the new array changed the effect's
dependency; the effect ran again — an infinite loop, entirely deterministic,
that fired the instant the add-member UI was opened (even before typing
anything). Fixed by wrapping the computation in `useMemo(() => ...,
[groups])`, so the array is stable across renders that don't actually
change group membership. Caught and fixed before any further manual
testing — exactly the kind of bug a plain `tsc --noEmit` pass can't see,
since the code was fully type-correct.

### Verification

`supabase db reset` + `npx tsc --noEmit` clean after the fix. Live
end-to-end with two accounts against a fresh race ("Nittany Lion
Invitational"): as the admin (Ann), created two empty groups, added
herself (a club admin with no `race_members` row) to Group 1 via search,
set her Incharge, then confirmed she was excluded from Group 2's search
results entirely (one-group-per-person, decision #2, working via the
exclude-list). Removed her from Group 1 — confirmed the group emptied,
the stale Incharge was cleared by the trigger, and she reappeared in
Group 2's search immediately afterward. Added her to Group 2 fresh
(confirmed as a new membership, not Incharge) and set Incharge there
too. Added a second account (Bob) to the race as a **regular member**
(not admin, via race roster's normal add-member flow) and confirmed his
view of the same screen showed both groups, all members, and the
Incharge badge, but zero action buttons anywhere — no Add member, no Add
Group, no Make/Remove Incharge, no Remove.

### Follow-up, same session: delete a group

Deliberately left out of the initial scope (the wireframe only sketched
"+ Add Group", nothing about removing one), but the founder hit this gap
immediately in practice — created a test group, then asked to delete it.
`0022_race_car_groups_delete.sql` adds the missing admin-only delete
policy on `race_car_groups` (0021 had insert/select/update but no delete
policy at all, so the table was silently undeletable via the client
until this). `race_car_group_members` already cascades on
`car_group_id`'s FK, so no separate cleanup of membership rows was
needed. `deleteCarGroup(groupId)` added to `lib/carGroups.ts`; the UI
gained a per-group, admin-only "Delete" text button in the group card's
header, using the same `Platform.OS === "web"` confirm branch (`Alert.alert`
is a no-op on web) already established in `event/[eventId].tsx`.
Verified live: created a group, deleted it, confirmed the list returned
to "No car groups yet." with no orphaned membership rows left behind.

---

## Task 20: Race — Photos + Result Link

The last two of Race's originally four placeholder sections (task #16)
to get scoped — only Location & Accommodation remains. Founder's spec
was explicit and simple: each is a single link (Photos → typically a
Google Photos album, Result Link → typically a results website), visible
to everyone with race access, any admin can add/edit/delete it, and an
empty state should read "no photos/result link added — stay tuned."

This is the simplest of the Race sub-features so far — deliberately so.
Rather than a new table (the pattern used for Eboard meetings and car
groups), `0023_race_links.sql` just adds two nullable text columns
(`photos_link`, `results_link`) directly to `races`. **No new RLS policy
was needed at all**: `races` already has an "admins can update races"
policy from `0016_races.sql` that covers the entire row, so it
automatically extends to whatever columns get added later. This is the
same reasoning `channels.race_id`/`eboard_channel_id` demonstrated for
generic reuse, just for RLS policies instead of shared UI components —
worth calling out because it's the first race-related change since 0016
that shipped with *zero* new database policies.

**Key contrast with Eboard meetings (task #18)**: meetings ended up
creator-only for both edit and delete, after two explicit founder
tightenings. Photos/Result Link went the other way from the start — "any
admin can edit or delete" was the spec from day one, no restriction to
whoever added the link. Both models coexist in the app now; the
difference is deliberate, not inconsistent — meetings are personal notes
one officer posts, while a race's photos/results links are shared
reference info any admin should be able to fix if it goes stale or wrong.

### UI (`photos.tsx` / `results.tsx`)

Nearly identical screens (mirroring each other, not sharing a component —
consistent with this codebase's light-duplication-over-abstraction style
for two-instance patterns). No separate create/edit route: tapping
"+ Add link" or "Edit" swaps the screen into an inline single-`TextInput`
form in place, with Cancel/Save — simpler than Eboard meeting's
`create.tsx` since there's only one field and no date/time to combine.
Delete uses the same `Platform.OS === "web"` confirm branch as
`event/[eventId].tsx` and race car groups' delete.

### Verification

`supabase db reset` + `npx tsc --noEmit` clean. Live end-to-end with two
different admin accounts (Ann created the race and the initial photos
link; Carol, promoted to admin afterward, had no special relationship to
either link) against a fresh test race: confirmed the "No photos link
added yet — stay tuned!" / "No result link added yet — stay tuned!" empty
states render correctly; added a photos link as Ann; **as Carol**, opened
the same screen, edited the link successfully, then deleted it — both
operations succeeding confirms edit/delete are genuinely open to any
admin, not silently scoped to the creator the way meetings are. Added a
result link and confirmed a regular race member (Bob, added directly to
the race roster, not an admin) saw the link rendered as tappable with
zero Edit/Delete controls anywhere on the screen.

---

## Task 21: Race — Location & Accommodation

The last of Race's four originally-placeholder sections (task #16) to
get scoped — with this shipped, all 5 rows on the race hub (Chat,
Location & Accommodation, Car Assignments & Groups, Photos, Result Link)
are fully built, none left as placeholders.

Founder's spec: a free-text info section (where to meet on campus, what
to bring, requirements — written by admins) plus two link fields, one
for the race/event location and one for the hotel. Before building,
four points were clarified via `AskUserQuestion` since the founder's
phrasing was ambiguous on each:

1. **Is the race/event location a link or free text?** The founder had
   explicitly called the hotel field "a link pasting place" but only said
   "a place to paste race or event location" for the other, without the
   word "link." → **Also a link**, same shape as hotel (e.g. Google Maps).
2. **Empty-state behavior** — task #20 (Photos/Result Link) shows a
   "stay tuned" placeholder to everyone when empty. The founder's wording
   here was different: "if its not filled it the link will not be visible
   for members." → **Hidden entirely, no placeholder text at all** — a
   deliberate contrast with task #20, not an oversight. Confirmed this
   applies to the description field too, not just the two links.
3. **Edit flow** — task #20's two links are independently editable inline
   boxes. The founder described "these two boxes will be available while
   editing" as a set. → **One combined edit form** for all three fields,
   a single Save commits all of them together — different from
   photos.tsx/results.tsx's per-field pattern.
4. **Who can edit** → **Any club admin**, consistent with Photos/Result
   Link, not creator-restricted like Eboard meetings.

### Data model (`0024_race_location_info.sql`)

Three more nullable columns directly on `races`
(`info_description`, `location_link`, `hotel_link`) — same
no-new-table, no-new-RLS shape as task #20's `photos_link`/`results_link`,
for the same reason: `0016_races.sql`'s "admins can update races" policy
already covers the whole row, so any column added later is automatically
writable by any admin with zero new policies. This is now the second
race feature in a row to ship without touching RLS at all.

### UI (`location.tsx`)

Unlike `photos.tsx`/`results.tsx` (parallel screens, each with its own
inline single-field edit), this one screen handles all three fields
together: view mode conditionally renders each of Info/Race-Event-
Location/Hotel only if non-empty (no fallback placeholder — a real,
literal difference from task #20, not styling reuse), plus an admin-only
"Edit Info" button that's always present regardless of whether anything's
been filled in yet. Edit mode swaps in one form — a multiline `TextInput`
for the description plus two link fields — with Cancel/Save, and Save
calls `updateRaceLocationInfo` once with all three values (each
individually trimmed to `null` if blank, same convention as every other
optional-field save in this app).

### Verification

`supabase db reset` + `npx tsc --noEmit` clean. Live end-to-end: as the
creating admin (Ann), confirmed the empty state showed nothing but the
"Edit Info" button (no placeholder text for any of the three fields, per
decision #2); opened Edit, filled in all three fields in the one combined
form, saved, and confirmed all three rendered correctly in view mode with
both links tappable. Added a second member (Bob) directly to the race
roster as a **regular member, not an admin**, and confirmed his view
showed all three fields read-only with the "Edit Info" button entirely
absent — matching every other admin-gated race screen in this app.

---

## Task 22: Race — consolidate Photos/Result Link into "Meet Information"

Right after tasks #20 (Photos + Result Link) and #21 (Location &
Accommodation) both shipped as separate screens, the founder asked to
merge them: instead of 5 rows on the race hub, fold Photos and Result
Link into the Location & Accommodation screen and give the whole thing a
better name. Two things were clarified via `AskUserQuestion` before
touching code:

1. **New name** — the founder's own suggestion was "Meet Information";
   offered as one of three options (the others were "Race Info" and
   "Details") and confirmed as-is.
2. **Empty-state consistency** — Location & Accommodation's fields were
   hidden entirely when empty (task #21); Photos/Result Link showed a
   "stay tuned" placeholder (task #20). Merging them raised the question
   of whether to unify to one rule. → **Keep the split**: description/
   location/hotel stay hidden entirely, photos/results keep their
   original "stay tuned" text. A deliberate, requested inconsistency
   within one screen, not a bug — worth calling out clearly in code
   comments so a future session doesn't "fix" it into uniformity.

### What made this a pure refactor, not a new feature

No new migration was needed at all. `photos_link`/`results_link`
(task #20) and `info_description`/`location_link`/`hotel_link`
(task #21) already existed as five nullable columns on `races`, all
already covered by the same "admins can update races" policy from
`0016_races.sql`. The entire task #22 was: extend `RaceLocationInfo` and
`fetchRaceLocationInfo`/`updateRaceLocationInfo` in `lib/races.ts` to
cover all 5 fields instead of 3, delete the now-redundant
`fetchRaceLinks`/`updateRacePhotosLink`/`updateRaceResultsLink` (grepped
first to confirm they had no other callers), delete `photos.tsx` and
`results.tsx` outright, remove their two `Stack.Screen` registrations
from `race/[raceId]/_layout.tsx`, and cut the race hub's `SECTIONS` array
from 5 entries down to 3 (Chat, Meet Information, Car Assignments &
Groups) with the "location" key's label changed to "Meet Information" —
the route/file name itself stayed `location.tsx`/`"location"` since
that's an internal detail nobody but future-Claude reads.

`location.tsx` itself grew from 3 view-mode sections to 5: the two new
ones (Photos, Result Link) render a "stay tuned" placeholder in the
`else` branch instead of nothing, matching the string task #20's
screens originally shipped with (`"No photos link added yet — stay
tuned!"` / `"No result link added yet — stay tuned!"`). Edit mode grew
from 3 `TextInput`s to 5, still one form, still one `Save` calling
`updateRaceLocationInfo` once with all five values.

### Verification

`npx tsc --noEmit` clean — no `supabase db reset` was even necessary
since no schema changed. Live check against the same "Test Race" used
for tasks #20/#21's own verification (data from both had survived
independently in their respective columns): confirmed the race hub now
shows exactly 3 rows with the row relabeled "Meet Information"; opened
it as a regular member (Bob) and confirmed the pre-existing description/
location/hotel values still rendered correctly, while Photos and Result
Link (never filled for this race) showed their "stay tuned" placeholders
rather than being silently hidden — confirming the deliberate per-field
split survived the merge correctly. Signed in as the admin (Ann), opened
Edit, saw all 5 fields pre-filled (the 3 pre-existing values plus the 2
empty link fields), filled in Photos and Result Link, and saved — a
single Save call updated all 5 columns together, and the view immediately
reflected both new links as tappable, replacing their placeholders.

