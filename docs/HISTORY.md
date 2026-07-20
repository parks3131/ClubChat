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

---

## Task 23: Unified club Calendar (events + races + Eboard meetings)

Founder request: the club Calendar should show calendar_events, races
you're actually in, and Eboard meetings you're actually a member of, all
merged into one date/time-ordered list — "if you are an Eboard member
then the meeting there, [if] you are in race and meets that, [and] the
calendar events, everything should be in calendar with date time order."

### Why this needed no migration at all

All three data sources already existed with their own established access
rules: `calendar_events` (club-wide, always visible), `races` (visible in
the plain list to everyone, but *access* — chat/roster/carpool/meet-info
— gated to admins and approved `race_members`), and `eboard_meetings`
(visible only to `eboard_channel_members`). The whole task was a new
aggregator, `lib/calendarFeed.ts`, calling three already-existing fetch
functions (`fetchEvents`, `fetchRaces`, `fetchEboardChannel` +
`fetchMeetings`) and merging their results into one `CalendarFeedItem[]`
sorted by timestamp. Races only have a date, not a time, so their sort
key is synthesized as `${eventDate}T00:00:00`, with a `hasTime: false`
flag telling the UI to format and bucket them differently.

Per-source filtering, matching the founder's own phrasing exactly:
- **Races**: only included if `race.access !== "none"` — i.e. only races
  the caller can actually enter, not every race in the club (the plain
  Races & Meets list is broader than this feed on purpose).
- **Eboard meetings**: only included if `fetchEboardChannel(clubId,
  userId)` reports `isMember: true` for the *specific calling user*. If
  there's no Eboard channel yet, or the club exists but this user was
  never added to it, this contributes nothing at all.

### The catch, flagged mid-verification

While first testing this live (as the admin who both created the Eboard
channel and posted a meeting), the founder interrupted with a specific
concern: "a member should not see admin meeting in his calendar" —
clarified immediately after as specifically about Eboard meetings. This
was already the intended design (see the `isMember` filter above), but
rather than asserting it was already handled, it was verified directly:
signed in as a second account (Bob) who was a **regular club member**
(not an admin, not added to the Eboard channel, but was an approved
participant on the test race) and confirmed his Calendar showed the
calendar event and the race, but the Eboard meeting ("Officer sync") was
correctly absent. Worth noting *why* this holds even more strongly than
it might for a typical "role check" feature: club membership can't
accidentally leak into Eboard visibility here even at the RLS layer,
because `eboard_channel_members` membership itself is only ever grantable
to existing club admins (enforced in migration 0017's insert policy) —
so a plain member could never end up in that table in the first place,
independent of anything this task's aggregation code does correctly or
incorrectly.

### UI (`calendar.tsx`)

Each row gets a `badgeLabel`: the existing event-type chip text for
calendar events (Practice/Volunteer/etc.), `"Race/Meet"` for races
(deliberately not just "Race", to avoid confusion with `calendar_events`'
own `event_type: "race"` value — an unrelated, pre-existing naming
collision documented in SPEC.md section 1), and `"Eboard Meeting"` for
meetings. Tapping a row navigates straight to `item.path` — the real
event/race/meeting screen, each of which independently re-verifies
access via its own existing guard (so even a stale/cached feed entry
can't grant access beyond what the destination screen would allow
anyway). "Upcoming" vs "Past" preserves each source's own original
cutoff convention (timestamp-vs-now for timed items, date-string-vs-
today for date-only races, matching `races/index.tsx`) rather than one
blunt comparison across all three kinds.

### Verification

`npx tsc --noEmit` clean; no `supabase db reset` needed (no schema
changes). Live end-to-end against "Location Test Club": created an
Eboard meeting (Jul 15), a calendar event (Jul 20, Practice), and used
the club's existing race (Aug 1) — as the admin, confirmed the Calendar
showed all three in correct chronological order with the right badges,
and that tapping each navigated to its real screen (meeting detail, race
hub — event detail navigation was already proven by the pre-existing
calendar.tsx code, not re-tested). Signed in as a second, non-admin,
non-Eboard-member account and confirmed his Calendar showed the event and
the race (he was an approved race participant) but not the Eboard
meeting — the specific scenario the founder flagged mid-session.

## Task 24: Polls

Founder request (with a hub screenshot for context): club admins create
a poll with a question and N options; members vote, with a per-poll
toggle for single-choice vs multi-select; vote counts show next to each
option; and a per-poll public/private toggle — public means everyone can
see who voted for what, private means only the poll's creator can see
individual votes (everyone still sees the counts either way).

Went through a full plan-mode pass first (the founder's own follow-up
message was "plan advice think ask any questions"), including an
`advisor()` call before writing anything down given this codebase's
documented RLS scar tissue (section 6). Three decisions were pushed back
to the founder via `AskUserQuestion` rather than assumed: placement (a
new standalone "Polls" hub row, not inline chat messages — the original
product-vision text in section 1 had lumped polls into Chat, but this
matched an actual founder wireframe/ask better and mirrors the
routines/races structural pattern), whether polls can be closed
(yes, and reopened), and — flagged explicitly by the advisor as a real
fork rather than a safe default — who can close/delete a poll once
created: the founder chose **creator-only**, mirroring `eboard_meetings`
(migrations 0019/0020) rather than the "any club admin" pattern used by
races/routines/calendar-events.

### Schema (`0025_polls.sql`): `polls` / `poll_options` / `poll_votes`

The one genuinely new problem this feature posed: RLS is row-level, not
column-level, so there's no way to let every member see a private poll's
*vote counts* while hiding *who* voted, if counts were computed by
counting visible `poll_votes` rows — a non-creator member on a private
poll can only ever see their own vote row (per the RLS design below), so
counting visible rows would undercount for everyone but the creator.
Solved with a denormalized `vote_count` column on `poll_options`,
maintained by an `AFTER INSERT/DELETE` trigger on `poll_votes` — counts
live on a row every club member can already read (same as the option
text), independent of privacy; only voter *identity* (the `poll_votes`
rows themselves) is gated.

The `poll_votes` SELECT policy: `can_access_poll(poll_id) and (user_id =
auth.uid() or is_poll_creator(poll_id) or not is_poll_private(poll_id))`
— a voter always sees their own vote regardless of privacy (needed to
render "you voted for this" even on a private poll), the creator sees
every vote on their own poll, and everyone sees everyone's on a public
poll.

Vote casting/toggling/moving (tap an already-selected option to retract;
tap a different option on a single-choice poll to move the vote) is one
`cast_vote(p_option_id)` RPC, deliberately plain `security invoker` (not
`security definer`) since it only ever touches the caller's own rows —
ordinary RLS is sufficient. It was also written to never use
`INSERT ... RETURNING`, specifically to sidestep section 6's documented
"INSERT...RETURNING also re-checks the SELECT policy" trap — worth
calling out because the advisor flagged the non-creator-votes-on-a-
private-poll path as the single highest-risk spot for that exact bug to
resurface in this codebase, and it was verified live (not just read as
correct) for that reason.

Helper functions (`can_access_poll`, `is_poll_creator`, `is_poll_private`,
`is_poll_closed`) are security-definer and, for `polls`' own update/delete
policies, self-referencing (`is_poll_creator` queries `polls` while being
used inside a policy *on* `polls`) — already a proven pattern in this
codebase via `is_channel_member` being used inside `channels`' own SELECT
policy (0016_races.sql), not a new risk.

### UI

New `app/(tabs)/clubs/[clubId]/polls/` directory, structurally identical
to `races/` (`_layout.tsx` nested Stack, `index.tsx` Active/Closed list
mirroring Upcoming/Finished, `create.tsx` admin-only form, `[pollId].tsx`
detail/voting screen). `create.tsx` supports 2–10 free-text options via
dynamic add/remove rows, plus two `Switch` toggles (already an established
component in this codebase via `ChatScreen.tsx`'s announce toggle) for
"allow multiple" and "private vote." `[pollId].tsx` shows vote counts
next to every option unconditionally, and voter names per option only
when `!poll.isPrivate || isCreator` (both a client-side fetch guard to
avoid a wasted request, and independently enforced server-side by RLS).
Creator-only Close/Reopen/Delete buttons, with the same
`Platform.OS === "web"` → `window.confirm` branch as
`event/[eventId].tsx`'s delete (section 6: `Alert.alert` is a no-op on
web). Hub wiring: one new `SECTIONS` entry in `index.tsx` (visible to
every member, same as Races & Meets — only poll *creation* is admin-
gated) and one new `Stack.Screen` in `_layout.tsx`.

### Verification

`supabase db reset` (clean apply of `0025_polls.sql`) and `npx tsc
--noEmit` clean. Live end-to-end via `CI=1 npx expo start --web` +
Playwright with two accounts (Admin Ann, Member Mike — the same browser
context shares localStorage/session, so the two accounts were driven
sequentially with explicit sign-out/sign-in between switches, not two
simultaneous tabs): created a public single-choice poll, voted as both
accounts, and confirmed voting for a different option *moved* the vote
rather than adding a second one (Bowling → Mini golf transitioned 1→0
and 0→1 correctly). Created a private multi-select poll as Admin Ann,
selected both options simultaneously and toggled one off, confirming
multi-select and toggle-off both work independently per-option. Then, as
Member Mike (non-creator), voted on that same private poll and confirmed
— this being the specific path flagged as highest-risk — no RLS error,
his own vote visible with a checkmark, and the other voter's identity
correctly hidden behind "This is a private vote — only Admin Ann can see
who voted for what." Switched back to Admin Ann and confirmed the
creator view shows both voters' names per option. Promoted Member Mike
to club admin (via the existing roster screen) specifically to test
that admin status *alone* doesn't grant close/delete rights on someone
else's poll: confirmed the buttons stay hidden for him, and — going a
step further than the plan asked for — issued a raw authenticated PATCH
against `/rest/v1/polls` as Mike to attempt reopening Admin Ann's closed
poll directly (bypassing the UI entirely); it returned `200` with an
empty result array, PostgREST's signature for "zero rows satisfied the
UPDATE policy," confirming creator-only enforcement holds at the RLS
layer itself, not just in hidden buttons. Regression-checked the hub
(all 6 rows present, unaffected) and Chat (existing join/promote system
messages still rendering).

## Task 25: Code-quality audit + standardized error handling on data loads

Founder request: "is what we built so far senior-engineer level, and if
not, what's missing." Rather than answer from impression, ran an actual
audit: `git status`/`tsc --noEmit`/dependency list, grep passes for
secrets hygiene, console leftovers, error-handling coverage, DB indexes,
pagination, accessibility props, and CI/lint/test config presence.

### Findings

What held up well: RLS/data-model discipline (security-definer helper
functions, correct handling of the `INSERT...RETURNING` gotcha, per-
feature access models chosen for real reasons, verified live at the RLS
layer), SPEC.md/HISTORY.md documentation, consistent structural reuse
across races/routines/eboard/polls, TypeScript strict mode with a clean
`tsc`, no hardcoded secrets, `.env` properly ignored, debounced search
inputs. What didn't: zero automated tests (every verification pass to
date is manual/ad hoc, not saved or re-run — and a regression already
slipped through once this way, the cross-tab back-button loop bug in
section 6), no CI, no ESLint/Prettier, only 4 of ~15+ FK-heavy tables
have explicit indexes, no pagination anywhere (`fetchMessages` loads a
channel's entire history every call), zero `accessibilityLabel`/`Role`
across 247 touchables, a hand-written `types/database.ts` with no build-
time check that it still matches the schema, and no error monitoring.

The founder picked **error handling** as the first gap to close, out of
those nine — ranked because it's every user's first symptom (a hang or
a blank screen with no explanation) and touches the whole app
uniformly, so fixing it once as a shared pattern pays off everywhere at
once.

### The gap, precisely

Most screens' initial fetch had the shape `fetchX(...).then(setX)
.finally(() => setLoading(false))` with **no `.catch()`**. When the
fetch rejects, `.then` is skipped, `.finally` still clears the loading
flag, and the screen renders exactly as if the data were simply empty —
indistinguishable from a real empty state, with the rejection either
unhandled or silently swallowed. The worst instances were the three
club-scoped **context-provider layouts** (`clubs/[clubId]/_layout.tsx`,
`race/[raceId]/_layout.tsx`, `eboard/_layout.tsx`): their `load()`
functions had no failure path at all, so a failed query left the
context value unset and the screen stuck on an `ActivityIndicator`
**forever**, with no escape short of restarting the app. One extra
subtlety specific to `ClubLayout`: it destructured `{ data }` from three
Supabase calls without ever checking the paired `error` field — since
supabase-js doesn't throw on its own, nothing would even reach a
try/catch; the fix had to explicitly check `error`/null-data on each
leg, not just wrap the call in `try`.

`app/(tabs)/clubs/index.tsx` was the one screen already doing this
right (`.catch((err) => setError(...))` + a conditional render), and
became the reference pattern to generalize — though even it lacked a
retry button, relying on the user backing out and refocusing.

Separately, 6 files (`club-profile/index.tsx`, `profile/index.tsx`,
`eboard/roster.tsx`, `race/[raceId]/roster.tsx`,
`race/[raceId]/carpool.tsx`, `race/[raceId]/location.tsx`) had each
independently invented an identical local `reportError` helper
(alert-based, for transient action failures) — proven convention, just
duplicated 6 times instead of shared.

### Fix — two shared pieces, then a bucketed pass over ~24 files

`lib/reportError.ts` — the exact duplicated function, extracted once;
the 6 files now import it. `components/LoadError.tsx` — new shared
"message + Try again button" component, styled to the app's existing
palette, used everywhere a full-screen data load can fail.

Then, in order of severity:
- **Context layouts** (3 files): `loadFailed` state + a `retryToken`
  bumped by the retry button and added to the effect's dependency array
  (since these already had a "load" closure defined inline in
  `useEffect`, not a standalone callback) — renders `<LoadError
  onRetry={...} />` instead of the permanent spinner.
- **List/detail screens** (~15 files: races/polls/routines lists,
  calendar, eboard meetings list, club-profile, event/workout/meeting
  detail screens, member profile): added a `loadError` boolean, wired
  `.catch()`, rendered `LoadError` in place of the list/empty-state.
  Screens with a `Promise.all([...])` of parallel fetches (club-profile,
  both roster screens) catch at the `Promise.all` level, not per-leg —
  a partial failure still leaves the screen's data inconsistent either
  way, so there's no value in trying to degrade gracefully per-field.
- **Create/edit form prefill fetches** (5 files: event, workout, meeting
  create/edit screens, both profile-edit screens): same `loadError` +
  full-screen `LoadError` treatment around the *edit-mode* prefill
  specifically (the *save* action's own existing `setError` + inline
  text was left untouched) — a blank form after a failed prefill was a
  real risk of silently saving blanks over a real record, not just a UX
  papercut.
- **Transient actions** (polls detail screen — vote/close/delete):
  this screen was written earlier in the same session (the Polls
  feature, task #24) and had already reproduced the exact same gap
  before the audit even started. Added the same `.catch(reportError)`
  convention to its vote/close/delete handlers plus a full `loadError`
  treatment for its own initial fetch.

### Verification

`npx tsc --noEmit` clean after every bucket (checked incrementally, not
just once at the end). Live via `CI=1 npx expo start --web` +
Playwright: full regression pass across the hub, chat, races list, and
a poll detail screen with zero console errors, confirming the "real
empty state" vs "failed to load" distinction actually holds (races list
correctly still shows "No races or meets yet." rather than an error).
Then the specific induced-failure test the plan called out as highest-
value: navigated directly to `/clubs/00000000-0000-0000-0000-000000000000`
(a well-formed but nonexistent club UUID) and confirmed `ClubLayout` now
shows "Couldn't load this club." with a working "Try again" button
instead of the old permanent spinner — clicked retry and confirmed it
re-attempts cleanly (same correct error state, no crash) rather than
just verifying by code inspection.

## Task 26: Add automated tests + CI

Founder picked this as the next code-quality-audit item over DB indexes/
pagination/accessibility, out of the five gaps left after task #25. The
reasoning: every verification pass on this project to date has been
manual/ad hoc (a Playwright pass clicked through once per feature, never
saved or re-run), and a regression already slipped through this exact
way once — the cross-tab back-button loop bug (section 6) shipped,
regressed, and was only caught live by the founder.

### Framework

`jest-expo` — installed via `npx expo install jest-expo jest @types/jest`
so it resolved the version matched to this project's Expo SDK 57
(`jest-expo@57.0.1`), then manually moved from `dependencies` to
`devDependencies` in `package.json` (`expo install` doesn't distinguish
dev-only tooling). `jest.config.js` just sets the preset; no component-
rendering tests yet (`@testing-library/react-native` would pull in a
much bigger, separate decision about mocking Expo Router/Supabase for
rendering) — this pass is pure-function and mocked-dependency unit tests
only, deliberately scoped to where this app's *provable* logic bugs have
actually occurred (date math), not rendering.

Two real setup gotchas, both fixed in `jest.setup.js`:
- `lib/supabase.ts` throws at import time if
  `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` aren't set —
  and Jest doesn't load `.env` on its own. Any test that imports a `lib/`
  module which transitively imports `lib/supabase.ts` (e.g.
  `formatDateOfBirth` from `lib/profile.ts`) would otherwise crash before
  the test itself even runs. Fixed with dummy env values set in
  `jest.setup.js`, so tests never need real credentials or a running
  Supabase instance — this also has to work in CI, which has no `.env`.
- `@react-native-async-storage/async-storage`'s native module isn't
  available under plain Jest (no simulator/device backing it), and
  `jest-expo`'s preset doesn't mock it since it's a separate community
  package, not core Expo. Needed the package's own documented Jest mock,
  registered in `jest.setup.js`.
- Separately, `npx tsc --noEmit` failed on the new test files with
  "Cannot find name 'describe'/'it'/'expect'" even though `@types/jest`
  was installed — TypeScript's automatic `@types/*` inclusion wasn't
  picking it up under this project's tsconfig (extends
  `expo/tsconfig.base`, no explicit `types` array). Fixed by adding
  `"types": ["jest"]` to `tsconfig.json`'s `compilerOptions` explicitly,
  rather than relying on auto-inclusion.

### Extracting `lib/dates.ts` (prerequisite for testing, and a dedup)

`toDateKey` was defined identically in 3 files (`calendar.tsx`,
`routines/index.tsx`, `races/index.tsx`); `splitIso`/`combineToIso`
identically in 2 (`event/create.tsx`, `eboard/meeting/create.tsx`) — all
private, non-exported functions, so none of them could be unit tested in
place. Extracted verbatim (same logic, same comments, zero behavior
change) into `lib/dates.ts`; the 5 call sites now import from there
instead of keeping a local copy — the same move already made for
`reportError` in task #25, done here specifically because these
functions are exactly the class of bug (UTC-vs-local date parsing) this
project has already shipped and fixed twice (`formatDateOfBirth` in
task #11; the same class again in task #15/#16).

### The first test suite

Three files, chosen for being genuinely load-bearing rather than just
exercising the setup:
- `lib/dates.test.ts` — `toDateKey`, `getMonday` (including the
  `day === 0` Sunday-rolls-back-6-days branch specifically — exactly the
  kind of one-line date-math bug this app has hit before), `addDays`,
  and a `splitIso`/`combineToIso` round-trip plus malformed-input cases.
- `lib/profile.test.ts` — `formatDateOfBirth`: `null` → `"Not set"`, and
  a date string that would render a day early under the naive
  `new Date(iso)` parsing this function was specifically written to
  avoid — turning a comment referencing a past bug into an actual
  regression test for it.
- `lib/calendarFeed.test.ts` — `fetchCalendarFeed` with
  `fetchEvents`/`fetchRaces`/`fetchEboardChannel`/`fetchMeetings` fully
  mocked via `jest.mock(...)` (no real Supabase call), asserting the
  three rules task #23 verified live by hand: a race with
  `access: "none"` excluded, Eboard meetings excluded when not a member
  (or there's no channel at all — confirmed `fetchMeetings` isn't even
  called in that case), and the merged result sorted ascending by
  `atIso` across mixed event/race/meeting kinds.

### CI

`.github/workflows/ci.yml` — this repo has a real GitHub remote
(`parks3131/ClubChat`) on `main`, confirmed before writing the workflow
so it wasn't dead configuration. Triggers on `push`/`pull_request`;
`actions/setup-node@v4` (Node 20, npm cache) → `npm ci` → `npx tsc
--noEmit` → `npm test`. No lint step — no ESLint config exists yet,
that's a separate, not-yet-chosen item from the same audit, not silently
bundled in here.

### Verification

`npm test`: all 17 tests across 3 suites pass. `npx tsc --noEmit` clean.
Simulated the CI job locally end-to-end before trusting the YAML —
`npm ci` (catches lockfile/dependency-split mismatches `npm install`
wouldn't), then `tsc --noEmit && npm test` in sequence, matching the
workflow's actual steps exactly. Live regression via `CI=1 npx expo
start --web` + Playwright on all 3 screens whose date helpers moved:
calendar (empty state, no errors), routines week view (correctly showed
"Jul 6 – Jul 12, 2026" for the actual current week, proving
`getMonday`/`addDays` survived the extraction), and races list. Went one
step further than a passive check on `event/create.tsx`: created a real
event through the UI with a specific date/time, confirmed the detail
view rendered it back correctly (`combineToIso`), opened Edit and
confirmed the form re-populated the exact same date/time (`splitIso`),
then deleted the test event — a full round trip through the extracted
functions, not just a visual glance. Confirming the Actions workflow
itself passes on GitHub requires a push, which was confirmed with the
founder first (this repo has a real remote, and pushing is a visible,
harder-to-undo action) rather than done unilaterally.

Committed as 3 separate commits mirroring the actual units of work
(Polls/task #24, error-handling standardization/task #25, tests+CI/
task #26) per the founder's preference — one shared file
(`clubs/[clubId]/_layout.tsx`, touched by both #24's hub-wiring and
#25's error handling) was split cleanly between the first two commits by
reconstructing the intermediate state rather than committing both
changes together; the 5 files touched by both #25's LoadError additions
and this task's `lib/dates.ts` extraction were left bundled into the
#25 commit rather than attempting the same split five times over, since
the interleaved hunks weren't cleanly separable without much riskier
manual surgery.

## Task 27: DB indexes + chat pagination cap

Picked by the founder, over accessibility labels, as the next item from
task #25's code-quality audit. Two independent pieces: closing the
remaining genuine gaps in FK indexing, and stopping `ChatScreen.tsx`
from re-fetching a channel's entire message history on every load and
every realtime event.

### Part 1: indexes

Rather than trust the audit's original rough "15+ tables missing
indexes" estimate, went through every `references public.` FK
definition and every `primary key`/`unique (` constraint across all 25
existing migrations by hand, cross-referencing which leading column
each already-covers. Most turned out already fine: `club_members`,
`calendar_events`, `messages`, `routine_workouts` have explicit indexes
from 0001/0015; `channels`' three partial unique indexes (0016/0017)
exactly match this app's three lookup patterns (club-scoped, race-
scoped, eboard-scoped); and `race_members`, `race_join_requests`,
`eboard_channels`, `eboard_channel_members`,
`eboard_channel_join_requests`, `race_car_group_members` all have their
own composite PK/unique constraints leading with the filtered column.

That left exactly six genuine gaps — columns filtered on directly via
`.eq(...)` with zero supporting index: `races.club_id` (`fetchRaces`),
`eboard_meetings.eboard_channel_id` (`fetchMeetings`),
`race_car_groups.race_id` (`fetchCarGroups`), `polls.club_id`
(`fetchPolls`), `poll_options.poll_id` (`fetchPoll`/`fetchPolls`), and
`poll_votes.poll_id` — added as a `(poll_id, user_id)` composite rather
than a single-column index, since every actual query (`fetchPoll`'s
own-vote lookup, `cast_vote`'s internal delete) filters both columns
together. New migration `0026_indexes.sql`, six plain `create index`
statements, no RLS or table changes. Before writing the migration, read
each table's actual `create table` definition in its origin migration
(0016/0018/0021/0025) to confirm exact column names rather than
assuming from the audit notes.

### Part 2: chat pagination — scope decision

The original plan (written in Plan Mode, before implementation) called
for full cursor-based pagination: `fetchMessages(channelId, options?: {
limit?: number; before?: string })`, a "Load earlier messages" UI
action, and — the genuinely tricky part — merging each realtime-
triggered reload into existing state by message `id` (instead of
replacing) so a user who'd scrolled up and loaded older history
wouldn't lose it every time someone sent a new message elsewhere.

Before implementing, ran this plan past the advisor tool. The advisor's
read: the merge design is not incorrect, but it's solving a problem
this app's current traffic doesn't have yet — chat channels in this app
currently hold a handful of messages, not thousands — and the session
had already established a "build what the problem needs, not more"
precedent with tests+CI (deliberately scoped to a few high-value tests
rather than full coverage). It suggested surfacing the scope choice to
the founder explicitly rather than defaulting to the more sophisticated
design, the same way every other real fork this session (creator-vs-
admin on polls, commit-splitting strategy, etc.) had been surfaced.

Put to the founder via AskUserQuestion as a straight fork — "simple cap
+ replace" vs. "full cursor pagination + merge" — with cap+replace
recommended. The founder picked cap+replace. The plan file was edited
in place (Part 2 rewritten, Verification section's step 4 simplified)
before `ExitPlanMode`, so the approved plan the founder saw matches
what was actually built.

### Part 2: what was built

`lib/messages.ts`'s `fetchMessages` gained an additive
`options?: { limit?: number }` parameter. Called with no options (as
`components/HighlightsScreen.tsx` does — it genuinely needs the entire
history, since a months-old pinned message or announcement must still
surface), it behaves exactly as before: full ascending-order fetch, no
limit. Called with a limit, it does a descending-order fetch capped to
that limit, then reverses the result back to ascending for display —
this is the only way to get "the newest N" instead of "the oldest N"
without a two-query round trip.

`ChatScreen.tsx`'s two `fetchMessages` call sites — the initial mount
load and the `reload()` callback fired on every realtime `postgres_changes`
event (any insert/update/delete on `messages` or, project-wide,
`message_reactions`) — both now pass `{ limit: 50 }` and replace state
outright, same replace semantics as before, just capped. No new
`hasMoreOlder`/cursor/merge-by-id state was added, matching the
approved scope. Accepted, disclosed tradeoff: a user scrolled up into
messages older than the latest 50 gets their view reset if a realtime
event fires while they're up there — rare at this app's current
traffic, and the fix if it ever becomes a real complaint is exactly the
cursor+merge design that was scoped out here.

### Verification

`npx tsc --noEmit` clean. `supabase db reset` applied all 26 migrations
cleanly (had to `supabase start` first — some auxiliary containers
(imgproxy/edge-runtime/pooler) were stopped from a previous session,
though Postgres itself was up and that's all `db reset` needs).

Confirmed the six new indexes exist via `supabase db query` against
`pg_indexes` (the CLI's `db execute --sql` doesn't exist — `db query`
is the actual subcommand). Then ran `EXPLAIN` directly against three of
the newly-indexed queries (`polls` by `club_id`, `poll_votes` by
`(poll_id, user_id)`, `race_car_groups` by `race_id`) and confirmed the
planner picked an Index/Bitmap Index Scan using the new index each
time, rather than just trusting the DDL had run.

Live pagination test: local `psql` isn't installed on this machine, so
wrote a throwaway Node script (`@supabase/supabase-js` against the
local API) to sign up a fresh test user, create a club via the same
`created_by`-inclusive insert shape as `lib/clubs.ts`'s `createClub`
(the first attempt omitted `created_by` and hit the clubs SELECT-policy
RLS block from section 6 immediately — a live, if small, reminder of
that exact gotcha), fetch its auto-created main channel, and insert 60
messages ("Message 1".."Message 60"). Signed into that account via
Playwright (had to clear a stale `localStorage` session first — the
browser still held a token from before this session's `db reset`,
which surfaced as profile-load failing via the new task #25 LoadError
UI rather than hanging, confirming that error path still works too),
navigated to the club's chat, and confirmed exactly "Message 11"
through "Message 60" rendered — 50 messages, oldest 10 correctly
excluded.

Sent a new message ("Message 61 live test") through the real UI and
re-checked the rendered set: still exactly 50, now "Message 12" through
"Message 61 live test" — the window correctly slid forward, oldest
dropped, newest appended, live via the realtime-triggered reload.
Clicked "Pin" on the visible "Message 60" and confirmed the pinned
strip updated immediately to show it (proving pin/reaction live-updates
on currently-visible messages still work under the capped fetch).

Regression-checked Highlights two ways: first that it correctly showed
the just-pinned "Message 60" (unsurprising, since it's within the
50-window); then, to actually test the disclosed tradeoff's boundary,
pinned "Message 3" directly via `supabase db query` (no UI path exists
to pin it anymore, since ChatScreen no longer renders anything before
"Message 11") and confirmed Highlights' unbounded `fetchMessages(channelId)`
call still surfaced it alongside "Message 60" — proving Highlights'
no-args behavior is genuinely untouched by this change, not just
untouched in the common case.

Cleaned up afterward: deleted the throwaway seed script, ran
`supabase db reset` again to return the local DB to a clean state.
## Task 28: Chat — scroll-triggered "Load earlier" pagination

Right after task #27 shipped (cap chat to the latest 50 messages,
older history unreachable), the founder asked what happens if you try
to scroll up past the cap. Told them: nothing, older messages simply
aren't reachable in the UI — that was the accepted tradeoff over the
fuller cursor-pagination design from the original task #27 plan draft.
The founder asked to build that fuller version now.

### Plan and first design

Entered Plan Mode fresh (overwriting the completed task #27 plan file,
since this is a materially different task). The approved plan called
for a `before` cursor on `fetchMessages`, a `mergeMessages` helper (byId
merge, not replace, so a loaded older page survives unrelated realtime
activity), a `hasMoreOlder`/`loadingOlder`-gated **"Load earlier
messages" tap button** as `ListHeaderComponent`, and — the trickiest
part — preserving scroll position when older messages are prepended
above the current viewport.

Checked whether RN's `maintainVisibleContentPosition` FlatList prop
could handle the scroll-preservation problem for free: confirmed via
`grep` that `react-native-web` doesn't implement it at all, and this
app is smoke-tested on web, so it couldn't be relied on. Chose instead:
a `suppressAutoScrollRef`-style ref (named `olderPagePrependedCountRef`
in the actual code) armed right before a `handleLoadEarlier` state
update, checked in `onContentSizeChange` to call `scrollToIndex({index:
olderPageLength})` instead of the default `scrollToEnd` every other
change in this screen triggers — landing the view back on the message
that used to be first, now sitting right below the newly-prepended page.

### A real bug, caught and fixed, in the scroll-preservation mechanism

First live test (Playwright, seeded 75 messages, `scrollToIndex`
called synchronously in `onContentSizeChange`) landed the view around
message 61-70 instead of the expected ~26 — a ~35-message error, not
just an off-by-a-few rounding issue. Read `scrollToIndex`'s actual
implementation in `node_modules/react-native-web/dist/vendor/react-native/VirtualizedList/index.js`
and found it falls back to an *approximate* offset computed from a
`_highestMeasuredFrameIndex`/frame-metrics cache when no `getItemLayout`
is provided (true here — message rows are variable-height). Hypothesis:
that cache is stale immediately after a prepend, since it's keyed by
position and the prepend just shifted everything.

Consulted the advisor before spending more time down that path. Its
correction: don't assume this is web-only — the file under
`node_modules/react-native-web/dist/vendor/react-native/` is RNW's
**vendored copy of React Native's actual `VirtualizedList`**, so the
same approximate-offset-without-`getItemLayout` behavior applies on iOS/
Android too, not something to defer as "just a web testing artifact."
It suggested the cheap discriminating test first: wrap the
`scrollToIndex` call in a `requestAnimationFrame` so the newly-prepended
cells get a layout pass before the scroll — if that fixes it, it was a
timing race, not a fundamental index-remapping problem; if not, the
fallback would need to be a manual content-height-diffing approach (the
pre-`maintainVisibleContentPosition` pattern: capture scroll offset and
content height before the prepend, diff after, `scrollToOffset` by the
delta).

Ran the test: wrapping the `scrollToIndex` call in a single
`requestAnimationFrame` (seeded 100 messages this time, for a cleaner
before/after comparison) moved the landing spot from "wildly wrong" to
within ~4 messages of the correct anchor (a small, explainable offset —
the "Load earlier messages" header button itself adds height, shifting
the visible window slightly). Confirmed this was a timing race, not an
index-remapping problem — the one-line `rAF` fix was sufficient, the
larger content-height-diffing fallback was not needed.

### A false-alarm data-loss scare, and what it revealed about the test method

Re-testing the full flow (load earlier → load earlier again, now
returning 0 rows and correctly clearing `hasMoreOlder` → pin an old
message) appeared to show the rendered message count collapsing from
100 to 10 after the pin action — read initially as a serious regression
where `mergeMessages` was somehow discarding already-loaded state.
Checked the database directly first (`supabase db query` against the
local Postgres instance) and confirmed all 100 rows were still there,
and the correct message was marked `pinned = true` — ruling out real
data loss immediately.

To find the actual client-side cause, added temporary `console.log`
statements around `mergeMessages`, `reload`, and the mount effect,
restarted the dev server, and reran the exact repro sequence while
reading `mcp__playwright__browser_console_messages`. The logs showed
`resultLen: 100` on every single merge, both from the pin's explicit
`reload()` call and a second `reload()` fired independently by the
project-wide `message_reactions`/`messages` realtime subscription (the
same one documented in `lib/messages.ts` as listening beyond just this
channel) — the merge logic was correct every time.

The "10 messages" figure came from the verification script itself, not
the app: it counted DOM leaf elements matching `Message \d+`, which is
only reliable if the FlatList renders every item into the DOM at once.
It doesn't — `VirtualizedList` windows its rendering to the near-
viewport range plus a buffer, so at certain scroll positions (right
after a `scrollToEnd`, mid-animation, etc.) only a fraction of the
`messages` array's ids are actually present as DOM nodes. Confirmed this
by re-running the same DOM-scrape immediately after a fresh page
navigation to the same URL and seeing a correct, full 50-message count —
proving the state itself was never wrong, only this particular way of
checking it. Lesson for testing any virtualized list in this app going
forward: DOM-node counting confirms "what's currently rendered," not
"what's in state" — use console-log-based state inspection or a fresh
remount to check the latter, the way the `EXPLAIN`-over-DDL and
DB-query-over-UI-claim lessons from tasks #25/#27 already established
for other layers of this stack.

### A real product-scope pivot, mid-build

While the above was still being debugged, the founder clarified the
actual expectation, unprompted: "if i open i can see the unread part
and scroll below if i wanna see the older i scroll up and it loads as i
scroll up the old messages" — i.e., automatic infinite-scroll-style
loading, not a tap-a-button affordance. This was a real, if small,
scope correction on an already-approved plan (the plan's Part 2
explicitly specified a "Load earlier messages" `TouchableOpacity`).

Checked whether FlatList/VirtualizedList supports a built-in "near the
top" callback before reaching for a custom `onScroll`-threshold
implementation: confirmed `onStartReached`/`onStartReachedThreshold`
exist in `react-native-web`'s vendored `VirtualizedList` (mirrors the
already-familiar `onEndReached` for infinite-scroll-down, just for the
top edge) — a real, portable FlatList prop, not something to hand-roll.
Replaced the tap button with `onStartReached={handleLoadEarlier}`
`onStartReachedThreshold={0.5}` on the same `FlatList`; the
`ListHeaderComponent` now only renders a small `ActivityIndicator`
while `loadingOlder` is true (no "Load earlier messages" text/button —
loading is automatic, so no affordance is needed to trigger it), and
the now-unused `loadEarlierText` style was deleted. `handleLoadEarlier`
itself, `mergeMessages`, and the scroll-position-preservation mechanism
were all unchanged — only the trigger (tap vs. scroll proximity)
changed.

### Verification

`npx tsc --noEmit` clean throughout (checked again after both the
`rAF` fix and the `onStartReached` swap). Live via `CI=1 npx expo start
--web` + Playwright, reusing the task #27 pattern of a throwaway
`@supabase/supabase-js` script (same `created_by`-inclusive club-insert
shape as `lib/clubs.ts`'s `createClub`, learned the hard way in task
#27) to seed a fresh test club with 100 messages: confirmed the initial
load shows only the latest 50 (`Message 51`-`Message 100`); simulated a
real scroll-to-top via a raw `element.scrollTop = 0` plus a dispatched
`scroll` event (Playwright has no built-in "scroll this nested web
FlatList" gesture) and confirmed older messages prepended automatically
with no click/tap anywhere in the sequence; repeated the scroll-to-top
trigger a second time and confirmed it kept paging further back;
pinned both an in-window message and the true oldest message
(`Message 1`, only reachable after two rounds of auto-loading) and
confirmed both correctly updated the pinned strip live and appeared in
Highlights, cross-checked against the database directly rather than
trusting the UI alone, given the false-alarm scare earlier in this same
task. Cleaned up: deleted the throwaway seed script, ran `supabase db
reset` to return to a clean slate.

## Task 29: Photo attachments in chat

The last open item from task #5's original scope note. Founder asked
"what else do we need to ship this as a real application," which led to
a "senior-level work pending" audit (store-approval blockers, infra
readiness, product gaps) — this was one of six resulting tasks, picked
first since it had zero open product decisions.

The schema had already anticipated this: `messages.media_url` and
`message_type = 'photo'` existed since `0001_init.sql`/`0007_...sql`,
unused until now. New migration `0027_message_photos_storage.sql` adds
a **private** `message-photos` Storage bucket — deliberately not public
like `avatars`/`club-avatars`, since a public bucket's URLs bypass
Storage RLS entirely and this app has a genuinely private channel
(Eboard chat, task #17) whose photos shouldn't be fetchable by anyone
holding a guessed URL. RLS is scoped via `is_channel_member`/no extra
grant, keyed off the first path segment (`${channelId}/${uuid}.${ext}`).
Because the bucket is private, `lib/messages.ts` now resolves a
short-lived (1hr) signed URL per photo message via
`storage.createSignedUrls` (batched, not per-message) inside
`attachSendersAndReactions`, rather than storing a public URL — same
general shape as the avatar pattern but resolved at read time instead of
write time.

`lib/messages.ts` gained `sendPhotoMessage` (upload then insert,
mirroring `uploadAvatar`'s upload-then-update-row shape) and
`DisplayMessage.photoUrl`. `components/ChatScreen.tsx` got a 📷 picker
button next to the send input (same `expo-image-picker` + web
synchronous-call-before-any-`await` pattern as the profile avatar
picker, see SPEC.md section 6), inline photo rendering, and a
tap-to-fullscreen `Modal` viewer. `components/HighlightsScreen.tsx`
(pinned messages) and the pinned-strip preview in `ChatScreen.tsx` both
needed a `messageType === "photo"` branch too, since a pinned/highlighted
photo message has a null `body`.

Verified live via `CI=1 npx expo start --web` + Playwright: uploaded
`assets/icon.png` through the real web file-input flow, confirmed the
photo rendered via its signed URL, confirmed tap-to-fullscreen worked,
pinned the photo message and confirmed both the pinned strip ("📷
Photo" placeholder text) and the Highlights screen (thumbnail) rendered
it correctly, and sent a plain text message afterward to confirm no
regression to the existing text path. `npx tsc --noEmit` and the full
jest suite clean throughout.

## Task 30: Self-service account deletion

Second of the six "ship as a real app" tasks — required by Apple
Guideline 5.1.1(v) and Google Play for store approval.

Advisor caught a real design fork before any migration was written:
almost every foreign key pointing at `profiles(id)`
(`messages.sender_id`, `clubs.created_by`, `polls.created_by`,
`race_car_group_members.added_by`, ~15 columns total across the schema)
has no `on delete` behavior at all, meaning a literal `DELETE FROM
auth.users` cascade would fail outright the first time a deleted user
turned out to have ever sent a message. Rather than pick a resolution
(hard-delete-with-cascade-surgery on ~15 constraints, or something
softer) unilaterally, asked the founder directly via `AskUserQuestion`.
**Chosen: anonymize, not hard-delete.** Scrub PII from the `profiles`
row, disable login, leave content in place attributed to a generic
"Deleted user" — a normal `UPDATE` on a row the caller owns, zero schema
surgery.

Migration `0028_account_deletion.sql` adds a `security definer`
`delete_account()` Postgres function (same pattern as
`join_or_request_club`/`decide_join_request` from `0006_...sql`) that
(1) blanks `full_name`/`avatar_url`/`bio`/`city`/`date_of_birth`/`school`
on the caller's own `profiles` row, and (2) sets
`auth.users.banned_until` to 100 years out, permanently blocking future
sign-in/token-refresh for that user. `auth.users` isn't writable by a
normal authenticated client — the advisor specifically flagged not to
implement this "security definer writes to auth.users" pattern from
memory, since Supabase's auth-schema internals shift across versions —
so before writing the migration, confirmed against the *actual running*
local Postgres (not assumed) that `banned_until timestamptz` exists on
`auth.users` and that `postgres`-owned functions (which is what this
project's migrations create) already have `UPDATE` privilege on it.

`lib/profile.ts` gained `deleteAccount()` (wraps the RPC); the caller is
still responsible for calling `supabase.auth.signOut()` immediately
after, since `banned_until` only blocks *future* auth, not an
already-issued access token. `app/(tabs)/profile/index.tsx` got a
"Delete account" button with the same web-`window.confirm`-vs-native-
`Alert.alert` branch as `event/[eventId].tsx`'s delete flow (SPEC.md
section 6's `Alert.alert`-is-a-no-op-on-web gotcha).

Verified live end-to-end with two accounts: Alice created a club, sent
a message, deleted her account — confirmed a subsequent sign-in attempt
returned "User is banned" (Supabase's own GoTrue error text) — then, as
Bob (a separate member of the same club), confirmed Alice's earlier
message now displayed sender "Deleted user" with no avatar, message
content untouched. `npx tsc --noEmit` and the jest suite clean.

## Task 31: Chat moderation — message delete + report

Third of the six tasks — required by Apple Guideline 1.2 (User-
Generated Content): a way to report objectionable content, and a
mechanism to act on reports.

Message delete turned out to already be RLS-permitted
(`0003_rls.sql`'s "sender or admin can delete a message" policy existed
since `0016_races.sql`'s generation of `is_channel_admin`) — only the UI
action was missing. Report is new: migration `0029_message_reports.sql`
adds `message_reports` (message_id, channel_id, reporter_id,
`unique(message_id, reporter_id)`), with `channel_id` deliberately
denormalized onto the row (same reasoning as `race_car_group_members
.race_id` in `0021_...sql`) so admin-facing "reports in this channel"
queries and RLS don't need to join through `messages`.

Founder call, asked directly via `AskUserQuestion` before building:
whether "block a user" should also exist alongside report/delete.
**Chosen: skip block, ship report + delete only** — block is ambiguous
in a shared-membership club chat (you can't meaningfully block one
member of a chat you both still belong to), and admin message-delete +
existing member-removal already cover real abuse cases without a new
primitive.

UI: `ChatScreen.tsx` gained "Delete" (sender or channel admin, any
message) and "Report" (anyone but the sender, disabled to "Reported"
after tapping — a repeat report's `23505` unique-violation is treated as
a no-op by `lib/messages.ts`'s `reportMessage`, not surfaced as an
error). `HighlightsScreen.tsx` gained an admin-only third tab ("Reports
(N)") listing reported messages with report counts, a "Delete message"
action, and a "Dismiss" action (clears the report rows once resolved).

**A real bug caught during this task's own live verification, not by
`tsc` or the test suite**: the original `deleteMessage` did a literal
SQL `DELETE`. `ChatScreen.tsx`'s `reload()` — since task #28 — merges
fetched messages into state by id and never drops an id that's absent
from a fresh fetch (that merge semantics was deliberately designed in
task #28 so an already-loaded older page survives unrelated realtime
activity). A hard-deleted message's id simply stopped appearing in
`reload()`'s fetch, but the merge never noticed it was gone — the
message stayed visible in the sender's own UI indefinitely after
clicking Delete, only clearing on a full remount. First fix attempt was
a `mergeLatestWindow` reconciliation function (drop any id inside the
freshly-fetched latest-window range that's no longer present). Then the
founder flagged something more fundamental via live testing: a message
that just vanishes with zero trace is bad UX in a group chat — other
members mid-conversation lose context, and there's no record anything
was moderated. **Switched to soft-delete instead**: migration
`0030_message_soft_delete.sql` adds `messages.deleted_at`; `deleteMessage`
now `UPDATE`s (`deleted_at = now()`, `body`/`media_url` cleared) through
the existing sender-or-admin `UPDATE` policy rather than the `DELETE`
policy (left in place, unused). This made the `mergeLatestWindow` fix
moot — a soft-deleted row still comes back from a normal fetch, so a
plain upsert-by-id merge already picks up the tombstone correctly — so
that function was reverted rather than kept as unneeded defensive code.
`ChatScreen.tsx`/`HighlightsScreen.tsx` both render a "This message was
deleted" placeholder in place of body/photo and hide reaction/pin/
delete/report actions once `deletedAt` is set; a pinned+deleted message
still shows its 📌 badge and appears (as a tombstone) in the pinned
strip, since scope discipline favored leaving pin state alone over
auto-unpinning.

Verified live with two accounts (Carol admin, Dave member) end-to-end:
Dave saw "Report" (not "Delete"/"Pin") on Carol's message and no
actions at all were mistakenly available on it beyond that; reporting
showed "Reported" and a repeat click was a silent no-op; Dave's own
message showed "Delete" (not "Report"); deleting it correctly produced
a live tombstone in the same session (proving the soft-delete fix, not
just a fresh-mount coincidence); pinning then deleting a message showed
the tombstone in both the bubble and the pinned strip simultaneously.
`npx tsc --noEmit` and the jest suite clean throughout.

## Task 32: Privacy Policy + Terms of Service (in-app)

Fourth of the six tasks. Both app stores require a reachable Privacy
Policy URL and, in practice, in-app Terms at submission — not really a
coding task so much as a content-drafting + wiring one, so scoped down
to what's actually actionable without founder-supplied legal text:
draft honest, feature-grounded (not boilerplate/lorem-ipsum) content
from SPEC.md's actual data model, and wire it up reachably both pre- and
post-auth. Explicitly **not** a substitute for real legal review before
a genuine public launch — flagged as such in a comment at the top of
`lib/legalContent.ts` and to the founder directly, not silently baked in
as if it were legally sufficient.

`lib/legalContent.ts` holds the actual section text (`PRIVACY_POLICY
_SECTIONS`/`TERMS_SECTIONS`, each an array of `{heading, body}`) as data,
separate from a new shared `components/LegalDocument.tsx` presentational
renderer — same "content separate from a thin reusable component" shape
as `ChatScreen`/`HighlightsScreen`'s original task #16 extraction, so
the pre-auth and post-auth screens don't fork two copies of the same
text.

Reachability needed two separate route trees, not one, because of how
`app/_layout.tsx`'s auth guard works: it redirects based on which
top-level group (`(auth)` vs `(tabs)`) the current route belongs to, so
a single shared route can't serve both a signed-out visitor (sign-up
flow) and a signed-in one (Profile) without getting bounced by the
guard the instant the "wrong" group's condition doesn't match. Added
`app/(auth)/privacy-policy.tsx` + `app/(auth)/terms.tsx` (reachable
signed-out, linked from a new consent line under `sign-up.tsx`'s
password field: "By signing up, you agree to our Privacy Policy and
Terms of Service") and `app/(tabs)/profile/privacy-policy.tsx` +
`.../terms.tsx` (reachable signed-in, linked from two new rows on the
Profile screen, above Sign out) — both pairs are thin wrappers around
the same `LegalDocument` + content data, both registered in their
respective Stack layouts with the existing `makeBackHeaderLeft` pattern
(`(auth)/_layout.tsx` previously had `headerShown: false` for its whole
Stack with no per-screen header at all — these two screens are the
first `(auth)`-group screens to need one, so they override
`headerShown: true` individually rather than flipping it repo-wide for
sign-in/sign-up too).

Verified live via `CI=1 npx expo start --web` + Playwright: as a signed-
in user, tapped Privacy Policy from Profile and confirmed it rendered
under the `(tabs)` group with a working back button (no auth-guard
bounce); separately, with `localStorage` cleared (fully signed out),
loaded `/sign-up`, confirmed both links render in the consent line, and
tapped through to `/terms` — confirmed it rendered pre-auth with no
redirect to sign-in, and that the back button correctly returned to
`/sign-up`. `npx tsc --noEmit` and the jest suite clean.

## Task 33 (in progress): Bundle identifiers + `eas.json` build config

Fifth of the six "ship as a real app" tasks — prerequisite for any store
binary, since `app.json` had no `ios.bundleIdentifier`/`android.package`
and there was no `eas.json` at all. Bundle identifiers are effectively
permanent once published, so asked the founder rather than guessing
(`AskUserQuestion` → "use my own domain" → `parkstechusa.com`). Set
`com.parkstechusa.clubchat` as both `ios.bundleIdentifier` and
`android.package` in `app.json`. Hand-wrote `eas.json` with standard
`development`/`preview`/`production` build profiles (no login required
to author the file itself). **Not fully done**: full EAS project
linkage (`extra.eas.projectId` in `app.json`) requires `eas login` +
`eas init`, both interactive and requiring the founder's own Expo
account — flagged as a manual follow-up rather than attempted
autonomously.

## Task 34: Visual redesign — "Kinetic Performance System" (Stitch) rollout app-wide

### How this started: a bug report that turned out to be a lost redesign

The founder reported that clicking the pencil overlay on the profile
avatar didn't open a file picker. Early investigation (reading
`app/(tabs)/profile/index.tsx`) found the fix from task #10 (skip the
permission check on web) was still correctly in place, and a Playwright
click on the pencil icon *did* trigger a `filechooser` event — so by
that evidence the picker "worked." But the founder had also asked, in
the same conversation, why the *previous day's* UI changes weren't
showing up in the running app, and separately shared a screenshot of a
polished redesign (rust/orange "Kinetic Performance System" theme,
Anton display font, card-row hub layout) that looked nothing like the
plain blue-accent UI actually running.

Both threads turned out to be the same root cause. `git worktree list`
showed a second worktree at `.claude/worktrees/agent-ad77747cd330b64f9`,
on a branch sitting at the *exact same commit* as `main`
(`1839226`) — meaning a prior session had done real implementation work
(not just design mockups) inside an isolated fork, including a
`constants/theme.ts` that didn't even exist in `main`, but the working
tree's changes were never copied back. Verified every file the worktree
had modified was a strict superset of what `main` already had
uncommitted (tasks #29-#33's work) with zero conflicting edits, then
copied all 45 changed/new files over and `npm install`ed the new
dependencies (`@expo-google-fonts/anton`, `@expo-google-fonts/archivo-
narrow`, `@expo-google-fonts/inter`, `@expo/vector-icons`,
`expo-font`). This recovered the redesign for auth, clubs list/create/
join, the club hub, calendar, and profile screens — all in one shot,
matching the founder's screenshot pixel-for-pixel once restarted.

**The profile-picker "bug" was real, just not what it first looked
like.** Playwright's automated click can't actually verify whether a
real end-user's browser shows the native file dialog — a follow-up test
(`browser_evaluate` calling `input.dispatchEvent(new
MouseEvent("click"))` completely outside any user gesture) still made
Playwright report a file chooser as available, proving Chromium under
CDP automation bypasses the real "was this a genuine user gesture"
gating that a normal interactive tab enforces. Reading
`node_modules/expo-image-picker/src/ExponentImagePicker.web.ts` found
the actual issue: its web shim opens the hidden file input via
`input.dispatchEvent(new MouseEvent("click"))` rather than
`input.click()`. Per the DOM spec both are supposed to invoke the same
activation behavior, but in practice this is a known footgun — some
real browser configurations (confirmed live: a Chrome profile not
signed into a Google account) don't treat the dispatched event as
sufficient activation and silently no-op, while `.click()` reliably
works. Fixed by bypassing the shim entirely with a new
`lib/pickImageOnWeb.ts` (`document.createElement("input")` + real
`.click()`), applied at all 3 photo-picker call sites (profile avatar,
club avatar, chat photo) — native platforms untouched since they use a
real native module, not this web DOM shim. Verified live in both Arc
(worked immediately) and the founder's own Chrome profile (root-caused
via a joint debugging session: ruled out extensions via Incognito,
ruled out stale cache via a bare `data:text/html,<input type=file>`
test page also failing, ruled out Chrome Enterprise policy via
`chrome://policy` showing nothing — the actual cause was that Chrome
profile specifically not being signed into a Google account, a local
environment quirk unrelated to any code in this repo).

### A second, fresh Stitch export: redesigning chat from scratch

The founder had a second Stitch export ready in Downloads
("Stitch Clubchat chat design" — a screenshot, `code.html`, and
`DESIGN.md`) for a full chat-screen redesign, dated the same day as the
session but distinct from (and more elaborate than) whatever chat
styling had come over in the worktree recovery above. `ChatScreen.tsx`
was rewritten to match it:

- **Custom glass header** replacing the native Stack header entirely
  (`navigation.setOptions({ headerShown: false })` + a hand-rolled
  `BlurView` header) — back button, tappable title (see below),
  Highlights pill, current-user avatar (fetched via a new
  `fetchProfile` call keyed on `session.user.id`). A `backFallback` prop
  reimplements the native header's per-screen fallback route
  (`components/BackHeaderButton.tsx`'s pattern) since that's no longer
  available from the parent Stack.Screen options.
- **Floating pinned notice** replacing the old horizontal strip —
  overlaps the top of the message list, blurred glass card per pinned
  message, with a local-only dismiss (`Set` of dismissed ids in
  component state) that does *not* unpin — unpinning still only happens
  via the existing admin-gated action in the bubble's footer or
  Highlights.
- **Gradient sent-message bubbles** via a new `expo-linear-gradient`
  dependency (`colors.primary → "#aa3000"` diagonal), asymmetric corner
  radii per side (`4/16/16/16` for others' messages, `16/16/4/16` for
  mine) matching the export's CSS exactly.
- **Editorial announcement card** — left accent bar, faint giant "INFO"
  watermark text bleeding into the corner, sender attribution below the
  headline. Adapted rather than copied verbatim: the mockup showed a
  separate headline + body + "Read Full Brief" link, but this app's
  data model only has one `body` field per announcement (no separate
  title), so the existing `body` is styled as the headline and the
  "Read Full Brief" affordance was dropped (nothing to link to).
- **Floating pill input bar** — rounded add/send buttons, no visible
  border on the row itself.

New dependencies added mid-session with the founder's explicit
awareness (flagged as part of the header-approach question below, not
silently installed): `expo-blur`, `expo-linear-gradient`.

Before implementing, four judgment calls were surfaced via
`AskUserQuestion` rather than decided silently: (1) full custom glass
header (chosen) vs. keeping the native header and only restyling
message content — the custom-header choice is what required
`expo-blur` and reimplementing `backFallback`/tappable-title behavior
that the native Stack header had provided for free; (2) whether to
extend the same treatment to the Highlights screen at the same time
(deferred, then done in a same-session follow-up once asked — see
below); (3) the color discrepancy between the Stitch chat export's
hardcoded `#ff4d00` and the DESIGN.md frontmatter's `#aa3000` for
`primary` — founder chose `#ff4d00`, applied app-wide (not just chat) in
`constants/theme.ts`, superseding the value the worktree recovery had
brought over.

### The Switch "turning green" bug

While testing the new announcement toggle, the founder flagged that its
"on" state showed a jarring teal/green thumb instead of anything
orange. Root cause, found by reading
`node_modules/react-native-web/src/exports/Switch/index.js`: react-
native-web's `Switch` defaults its "on" thumb to
`defaultActiveThumbColor = '#009688'` unless the caller passes
`activeThumbColor` explicitly — the existing code only set `trackColor`.
Fixed with a new shared `components/ThemedSwitch.tsx` wrapping `Switch`
with theme-derived `trackColor`/`thumbColor`/`activeThumbColor`/
`ios_backgroundColor` defaults, applied to the chat announcement toggle
and both switches on the Polls create screen (same underlying bug,
never previously noticed there since that screen wasn't being actively
tested at the time). `activeThumbColor`/`ios_backgroundColor` aren't
part of RN's own bundled TypeScript declarations even though react-
native-web supports them at runtime, so `ThemedSwitch` casts
`Switch as ComponentType<any>` rather than sprinkling `@ts-expect-error`
comments at every call site.

### Extending the redesign: Highlights, then Races & Eboard

Once chat's redesign was verified live (glass header, gradient bubble,
floating pinned notice, announcement card all confirmed matching the
mockup), the founder asked to extend the same header treatment to
Highlights (deferred at first, all three of club/race/eboard
Highlights share one component). Same pattern as chat: native header
hidden, custom `BlurView` header added (back button, "ClubChat"
wordmark + "Highlights" subtitle — no tappable title needed here), a
`backFallback` prop threaded through all three wrapper screens. The
existing Pinned/Announcements/Reports segmented tab control and card
rows were left untouched — they'd already been Stitch-styled by the
earlier worktree recovery and didn't need changes.

The founder then asked for the same treatment on Eboard and Races,
pointing at the (already-redesigned) club hub screenshot as the
reference: title header + rows with a colored icon badge, label,
subtitle, and chevron. Rebuilt to match that exact pattern:

- `race/[raceId]/index.tsx` and `eboard/index.tsx` hubs — verbatim copy
  of the club hub's card-row structure (icon badge + label + subtitle +
  chevron), including Eboard's non-member/no-channel-yet empty states
  (shield icon badge, restyled pill buttons).
- `races/index.tsx` and `eboard/meetings.tsx` lists — restyled to match
  `calendar.tsx`'s date-bib-chip + badge row pattern (already
  established there), rather than inventing a new list style.
- Create forms (`races/create.tsx`, `eboard/create.tsx`,
  `eboard/meeting/create.tsx`) — restyled to match the club create
  form's bordered-input + pill-button pattern.
- Roster screens (race + eboard) — restyled to match
  `club-profile/index.tsx`'s member-row pattern (avatar, name, icon-
  button approve/deny).
- Remaining detail screens (race Meet Information/location, race
  carpool, eboard meeting detail) — token-level restyle only (colors,
  radii, spacing, typography swapped for theme values), all business
  logic untouched.

No mockup existed for any of these Races/Eboard screens specifically —
they were extrapolated from the club hub's already-established pattern,
which the founder explicitly endorsed as the reference rather than
asking for new mockups first.

### Clickable rows instead of "row + separate Add button"

Reviewing a carpool add-member screenshot, the founder asked to replace
every "search result row with a separate colored Add button" pattern
with a single clickable row that highlights orange on hover, no visible
button at all. Converted 4 call sites — `race/[raceId]/carpool.tsx`,
`race/[raceId]/roster.tsx`, `eboard/roster.tsx`,
`club-profile/index.tsx` — from `View` + `TouchableOpacity` pairs to a
single `Pressable` per row, using react-native-web's `hovered` render-
prop state (confirmed present in
`node_modules/react-native-web/src/exports/Pressable/index.js` before
committing to the approach) to swap in a light peach background
(`colors.primaryFixed`) on hover. `hovered` isn't in RN's own bundled
`PressableStateCallbackType` type despite react-native-web supporting it
at runtime — same class of gap as `ThemedSwitch`'s `activeThumbColor` —
worked around with an inline `(state as { hovered?: boolean })` cast at
each call site rather than a shared wrapper component (only 4 call
sites, less reusable surface than the Switch case). Dead
`actionButton`/`addButton`/`addText` styles removed from all 4 files
once their only usage disappeared. A `+ Add Workout` button elsewhere
(`routines/index.tsx`) was confirmed to be a different, unrelated
pattern (a persistent primary action, not a search-result row) and left
alone.

### Chat header follow-ups: tappable title, actual name, scroll fix, announcement toggle

Four more founder-driven fixes on the same `ChatScreen.tsx`, in one
session:

1. **Tappable header title restored.** The custom glass header (above)
   had dropped the "tap the club/race/eboard name to reach its
   member-management screen" behavior every other screen in the app
   still has, since the Stitch mockup didn't show it as an obvious
   affordance and it was deliberately deferred pending a decision. Once
   asked for, added a `titlePath` prop to `ChatScreen` (required, no
   default) wired from all 3 chat wrapper screens: club chat →
   `club-profile`, race chat → race `roster`, eboard chat → eboard
   `roster`. Verified live for both club and race chat.
2. **Header title swapped: actual name, not the literal brand text.**
   The header initially showed a fixed "ClubChat" wordmark as the big
   headline with the actual club/race/eboard name as a small subtitle —
   matching the Stitch mockup's own layout, which was designed around a
   single fictional team. The founder wanted the reverse: the real name
   prominent, "not the name clubchat" as the big text. Swapped which
   text uses `styles.logoText` (the large Anton headline) vs.
   `styles.subtitleText` (small, with the pulsing dot) — name is now
   the headline, "ClubChat" the small subtitle. `headerLeftRow` and a
   new `titleTextWrap` style were given `flex: 1`/`minWidth: 0` so long
   names truncate instead of overflowing past the header's right-side
   buttons.
3. **Real scroll-to-bottom regression, found and fixed.** The founder
   reported new messages no longer auto-scrolled into view like they
   used to. Confirmed via direct DOM inspection
   (`browser_evaluate` reading the FlatList's scroll container
   `scrollTop`/`scrollHeight`/`clientHeight`) that after sending a
   message, `scrollTop` (221.5) was sitting well short of the true max
   (393) — roughly one message-row's height short, not a rounding
   error. Root cause: `flatListRef.current?.scrollToEnd({ animated:
   true })` was being called synchronously inside `onContentSizeChange`,
   before the just-appended message's layout had fully committed —
   the same class of timing issue task #28's older-message-prepend
   scroll already had to work around with a `requestAnimationFrame`
   wrapper. Applied the identical fix to the scroll-to-bottom branch.
   Verified via the same DOM-inspection technique post-fix: `scrollTop`
   landed within single-digit pixels of the true max.
4. **"Send as announcement" banner redesigned.** The full-width peach
   banner sat permanently between the message list and the input,
   permanently eating into the chat's visible area — flagged as
   "blocking the view." Founder asked for "half, or any other idea";
   proposed and built a compact megaphone icon toggle inside the input
   row itself instead (matching the existing photo-picker icon
   button's shape/size), filled solid orange when armed, taking zero
   persistent space otherwise. `styles.announceRow`/`announceLabel`
   removed; `ThemedSwitch` import removed from `ChatScreen.tsx` (no
   longer used there, still used by Polls create).

Verified live throughout via `CI=1 npx expo start --web` + Playwright:
created a fresh club, race, and Eboard channel from scratch; created a
car group and a meeting; sent plain/announcement/photo messages; pinned
and dismissed a floating notice; hovered and clicked a carpool add-
member row; tapped the chat header title from both club and race chat
and confirmed correct navigation; sent 5 messages in a deliberately
shrunk viewport and confirmed the newest one lands fully visible above
the input. Zero console errors across every screen touched. `npx tsc
--noEmit` clean throughout (two rounds of RN-vs-react-native-web type
gaps hit and worked around: `Switch`'s `activeThumbColor`/
`ios_backgroundColor`, `Pressable`'s `hovered`).

## Task 35: Notifications — Strava-style cross-club inbox

A brand-new, from-scratch feature request (not from a wireframe this
time — the founder described the desired behavior directly, referencing
Strava's own bell/badge notification screen as the model), planned
["iron clad"] via `EnterPlanMode` with two full rounds of
`AskUserQuestion` before any code was written, since almost every part
of the design space was a genuine open question: where does a
cross-club notification center even live in a 2-tab app, what does the
badge number mean, which pending-approval inboxes fan out to which
audience, which membership events get a personal notification, which
creation events fan out to whom, and — the trickiest one — how "N
unread messages in Club X chat" interacts with "opening the
Notifications tab marks things read" without one silently invalidating
the other.

**Confirmed design** (all via `AskUserQuestion`, see the approved plan
at the time — since revised twice post-ship, below):
new 3rd bottom tab named exactly "Notifications"; badge = count of
unread *items* (a whole unread chat channel counts as 1, never a raw
message sum); admin/Eboard-member inbox covers club + race join
requests (fan out to every club admin — races have no separate admin
role) and Eboard join requests (fan out only to *current* Eboard
members, mirroring the existing approval-rights asymmetry from task
#17); personal notifications get full parity with what already
triggers an in-chat system message (added/removed/promoted/demoted)
plus request-approved/denied, which didn't have one; creation fan-out
for polls/calendar events/races/Eboard meetings/announcements, always
excluding the actor; a plain **pin** must never notify, only an
**announcement** — which falls out for free since `messages.message_type
= 'announcement'` is only ever set at `INSERT` time, structurally
separate from the `pinned` boolean's later `UPDATE`; tapping a
join-request notification navigates to the existing roster screen
rather than duplicating approve/deny UI inline; and — the one requiring
real design work — chat-unread rows are **not** stored notification
rows at all, since **no read/unread concept existed anywhere in the
schema** (confirmed via a repo-wide grep before writing a single
migration). A new `channel_reads` table (per user, per channel,
`last_read_at`) backs a `fetch_unread_channel_summaries()` security-
definer SQL function that computes live unread counts per channel in
one round trip (no N+1 loop over every club/race/Eboard channel the
caller belongs to), reusing the existing `is_channel_member` helper so
channel-access logic isn't duplicated a third time. Opening the
Notifications tab bulk-marks discrete `notifications` rows read, but
**never** touches `channel_reads` — a chat's unread count only clears
by actually opening that chat, exactly as before this feature existed,
confirmed live as its own explicit test case.

### Schema: 4 new migrations (`0031`-`0034`), all built on primary-source reads

Every trigger this migration set touches or extends was read verbatim
from its actual `.sql` file before being modified — `0006`, `0016`,
`0017` — rather than reconstructed from the SPEC.md summary above,
specifically to avoid silently changing existing behavior while
extending it.

- **`0031_notifications_core.sql`**: `notification_type` enum,
  `notifications` table (`recipient_id`, `actor_id`, `club_id`, `type`,
  `body`, a literal `target_path` route string rather than ~7 nullable
  per-type foreign keys — navigation is just `router.push(path)`,
  everything else would exist only to be flattened back into a string
  by the client), RLS (`recipient_id = auth.uid()` for select/update,
  deliberately no insert policy since every row is written by
  `security definer` trigger functions, same pattern as system chat
  messages), added to the `supabase_realtime` publication.
  `channel_reads` + `fetch_unread_channel_summaries()` as described
  above.
- **`0032_notification_triggers_membership.sql`**: extends
  `log_member_added`/`log_member_removed`/`log_member_role_changed`/
  `log_race_member_added`/`log_eboard_member_added` (`create or
  replace`, same technique 0016/0017 already used twice on these exact
  functions) to also insert a `notifications` row using the actor/target
  split every one of them already computes for picking chat-message
  wording. Also extends `decide_join_request`/`decide_race_join_request`/
  `decide_eboard_join_request` to explicitly insert
  `request_approved`/`request_denied` notifications. The tricky part:
  an approval's membership insert (`club_members` etc.) also fires
  `log_member_added`, which would otherwise *also* fire a redundant
  "you were added" notification for the same action — solved with a
  transaction-local Postgres setting
  (`set_config('clubchat.skip_add_notify', 'true', true)`, `is_local =
  true` so it can never leak across a pooled connection's later,
  unrelated transaction) set right before the approval branch's insert,
  checked by the trigger before it inserts its own notification.
- **`0033_notification_triggers_requests.sql`**: 3 new triggers (not
  modifying anything existing) on `club_join_requests`/
  `race_join_requests`/`eboard_channel_join_requests`, firing on
  `insert or update of status ... when (new.status = 'pending')` so a
  re-request after a prior denial (an `UPDATE` via the existing `on
  conflict do update` path) notifies the inbox exactly like a fresh
  request does, without ever firing on the *decide* transition away
  from pending (that's already covered by 0032's explicit inserts).
- **`0034_notification_triggers_creation.sql`**: new `after insert`
  triggers on `polls`/`calendar_events`/`races`/`eboard_meetings`
  (separate from the existing `on_race_created`, which stays focused on
  its own job) and on `messages` filtered to `message_type =
  'announcement'`, each excluding the creator/sender from its own
  fan-out.

### Client layer

`lib/notifications.ts` (new) follows the existing `lib/clubs.ts`/
`lib/calendarFeed.ts` conventions — `fetchNotificationFeed` merges the
`notifications` table with `fetch_unread_channel_summaries()` into one
reverse-chronological array, the same "merge heterogeneous sources"
technique `calendarFeed.ts` already established for the unified
calendar (task #23) — plus `fetchUnreadBadgeCount`,
`markAllNotificationsRead`, `markChannelRead`, and
`subscribeToNotifications` (mirrors `lib/messages.ts`'s
`subscribeToNewMessages` realtime pattern exactly).
`contexts/NotificationsProvider.tsx` (new) is shaped like
`AuthProvider.tsx` — wraps the whole app (nested inside `AuthProvider`
in `app/_layout.tsx`, since it needs the session's `userId`) so the
tab-bar badge has a live count from anywhere, exposing
`{ unreadCount, refetch, markAllRead }`. `app/(tabs)/_layout.tsx` gained
a 3rd `Tabs.Screen` using React Navigation's native `tabBarBadge`
option. `app/(tabs)/notifications.tsx` (new) is the feed screen;
`components/ChatScreen.tsx` gained a one-effect hook calling
`markChannelRead` + a provider `refetch()` on mount.

### Verification — 3 real bugs found and fixed live, all before initial ship

A first full live pass (via a forked sub-agent driving Playwright across
3 test accounts) found and fixed 3 real bugs, each requiring a `supabase
db reset` to pick up and a fresh re-verification pass afterward:

1. **Realtime channel-topic collision.** `NotificationsProvider`'s badge
   subscription and the Notifications screen's own feed subscription
   both called `subscribeToNotifications` for the same `userId`
   simultaneously, producing the identical Supabase Realtime channel
   topic name (`notifications:{userId}`) — supabase-js throws
   `cannot add postgres_changes callbacks ... after subscribe()` the
   second time `.on()` is called on an already-subscribed channel
   object. Fixed by adding a `tag` parameter (default `"default"`) so
   independent subscribers to the same `userId` get distinct topic names
   (`notifications:{userId}:badge` vs. `...:screen`).
2. **Decided requests never left the admin inbox.** The first cut of
   `decide_*_join_request` didn't remove the now-stale "X wants to join"
   notification once decided — confirmed live it stayed forever.
   Originally fixed with a `delete from public.notifications` scoped by
   `type` + `target_path` + `actor_id` (no direct `request_id` column to
   key on, per `target_path`'s design above) — later revised, see below.
3. **Ambiguous column reference.** That same `DELETE`'s `actor_id`
   collided with the PL/pgSQL local variable `actor_id` (the approver),
   causing a silent 400 on `rpc/decide_join_request` and an in-app
   "Something went wrong" alert on every approve/deny. Fixed by
   qualifying the column as `public.notifications.actor_id`.

### Founder follow-ups, post-verification (3 more asked live, mid-pass)

Sent directly to the verifying sub-agent while it was running, then
triaged with 3 more `AskUserQuestion` rounds before implementing:

1. **Decided requests should persist as history, not disappear** —
   directly reversing bug-fix #2 above, right after it shipped. Added
   `notifications.resolved_outcome` (`'approved' | 'denied'`,
   `0035_notifications_persistent_requests.sql`) and changed all 3
   `decide_*_join_request` functions from `DELETE` to `UPDATE` (tag the
   outcome, mark read since it's no longer actionable). The Notifications
   screen renders a small "Approved"/"Denied" pill next to a resolved
   request instead of it vanishing. Verified live end-to-end, including
   the accidental-but-useful case of clicking Deny during testing and
   watching the item correctly stay visible tagged "Denied" instead of
   disappearing — then re-requesting (status flips back to `pending` via
   the existing `on conflict` path, correctly re-firing the admin-inbox
   notification) and approving on the second pass, confirming the
   "approved by X" wording is distinct from "added by X" with no
   duplicate notification (the `clubchat.skip_add_notify` guard from bug
   fix work above holds).
2. **Notifications feed pagination**, mirroring task #28's chat
   "load earlier" pattern: `fetchNotificationFeed` gained the same
   `limit`/`before` cursor shape as `lib/messages.ts`'s `fetchMessages`,
   with a twist — `fetch_unread_channel_summaries()` (the chat-unread
   rows) is only ever fetched on the *first* page (`before` undefined),
   since it's bounded by channel count, not something that grows page
   over page. `app/(tabs)/notifications.tsx` merges pages by id (same
   technique as `ChatScreen.tsx`'s `mergeMessages`, sorted newest-first
   instead of oldest-first) and triggers `FlatList`'s `onEndReached` —
   simpler than chat's own pagination, since appending older items at
   the *bottom* of a newest-first list never requires the
   scroll-position-preservation `requestAnimationFrame` dance task #28
   needed for prepending at the top. Verified live by seeding 30 test
   notifications directly via `docker exec psql` for a real signed-up
   test user (fast, avoids 30 rounds of UI-driven club-profile approve
   clicks): confirmed exactly 20 notification-kind items load initially
   (page-size cap holding, mixed correctly with the 2 real request-
   decision notifications from the account's actual history), and that
   scrolling to the bottom loads the next page with no duplicates and no
   console errors.
3. **Roster "Joined Nm ago" removed.** `club-profile/index.tsx`'s member
   row used to show "Joined {time}" (or "You" for the caller's own row)
   under every member's name — the app has no actual presence/activity
   tracking, so "Joined" was the only truthful label available, and per
   founder direction it's better removed entirely for now than
   generalized into a misleading "active" label. Changed to only render
   the "You" tag (self only), nothing for other members — a placeholder
   for real presence tracking to fill in later.

### Final verification pass

`npx tsc --noEmit` clean after every round (initial build, the 3
bugfixes, and the 3 follow-ups). Live pass covering: club creation with
`request` join policy, a member's request → admin's badge/inbox update →
tap-to-roster navigation → deny (confirms persistent-history) → re-
request → approve (confirms distinct "approved by X" wording + no
duplicate notification) → the requester's own Notifications feed showing
both the historical "denied by" entry and the new "approved by" entry
side by side, plus a live "1 unread messages in ... chat" row for the
system "joined the club" message posted by the same approval — cross-
checked against a stale/ghost browser session left over from a DB reset
(confirmed it fails closed, not silently, forcing a clean re-sign-in
rather than operating on a since-deleted user). Console-error check
distinguished genuine current-page state (zero errors) from stale
history predating the mid-session `supabase db reset` + dev-server
restart (`browser_console_messages`'s `all: true` mode surfaces
everything since the Playwright session began, not since the last
navigation — worth remembering next time a console check looks alarming
right after a backend reset).

## Task 36: Bug fixes — race-chat announcements silently failing + race roster missing "Remove"

Two founder-reported bugs, investigated live rather than guessed at.

### Bug 1: announcing in a race channel always failed, silently

The founder reported that sending an announcement worked in club chat and
Eboard chat but not in a race's chat. Read `ChatScreen.tsx`'s
`handleSend`/announce-toggle code and the RLS policies involved — both
looked structurally correct (`isAdmin` computed identically to club chat,
the `messages` insert policy's `message_type <> 'announcement' or
is_channel_admin(channel_id)` check already generalizes correctly across
club/race/Eboard channels via `is_channel_admin`). Rather than trust that
read, reproduced live: created a fresh disposable test club + race via
Playwright, armed the megaphone toggle, hit send — the message vanished
with no visible error, and the draft text (already cleared optimistically
by `handleSend` before the request resolves) was lost. `browser_console_messages`
showed a 400 on `POST /rest/v1/messages`.

Root cause, found via `browser_network_request`'s `response-body` part:
`{"code":"42804", "message":"column \"type\" is of type notification_type
but expression is of type text"}` — not an RLS error at all, a Postgres
type-cast error inside the `on_announcement_posted` trigger
(`notify_announcement()`, 0034), which runs in the same transaction as
the message insert (so its failure rolled back the whole insert,
including the message itself — explaining why nothing posted, not even
as plain text). The race branch of that function is the only one of its
3 scope branches shaped as `select distinct u.user_id, ..., 'announcement',
... from (select ... union select ...) u` — club and Eboard's branches
have no `DISTINCT`/`UNION`. Confirmed the mechanism in isolation before
touching any real code:
```sql
create temp table t (type notification_type);
insert into t select distinct x from (select 'a' as x union select 'b') u;
-- ERROR: column "type" is of type notification_type but expression is of type text
```
Postgres resolves an untyped string literal against the INSERT target
column's type only while it stays "unknown"-typed; `SELECT DISTINCT`
needs a concrete, comparable type for every selected expression to
sort/dedupe by, so it forces the literal to default to `text` right
there, and once concrete, Postgres won't implicitly cast a genuine `text`
value to a user-defined enum. Fixed in `0036_fix_announcement_notify_race_cast.sql`
by adding an explicit `'announcement'::notification_type` cast to all 3
branches (only the race one was actually broken; the other two were cast
defensively too, since the underlying trap is about the query shape, not
something intrinsic to any one branch).

Verified live: recreated the same test race, sent an announcement — it
posted correctly, rendered as the redesigned announcement card, with zero
console errors. Confirmed via direct DB query that the message inserted
with `message_type = 'announcement'` (not silently downgraded to
`'text'`, which was the working theory before the actual 400 was found).

### Bug 2: race roster had no way to remove a member

The founder noted they could add members to a race but never saw a way
to remove one. Grepped `lib/races.ts` for a `removeRaceMember` function
(none existed) and the `race_members` RLS policies in `0016_races.sql`
(select + insert only, no delete policy at all — the table was silently
undeletable via the client). This was never built, not a regression —
task #16's original scope only covered add/approve. Fixed with
`0037_race_members_delete.sql` (admin-only delete policy, same pattern
as `0022_race_car_groups_delete.sql`'s own "add shipped, delete didn't"
precedent), a new `removeRaceMember(raceId, userId)` in `lib/races.ts`,
and a per-row admin-only "Remove" icon button in `race/[raceId]/roster.tsx`
mirroring `club-profile/index.tsx`'s existing `confirmAction` pattern
(the `window.confirm`-vs-`Alert.alert` web/native branch, since
`Alert.alert` no-ops on web — SPEC.md section 6). No self/last-admin
exclusion needed here, unlike club membership removal: a club admin's
race access comes from `is_race_admin` (== club admin), independent of
whether they have a `race_members` row at all, so removing yourself from
the roster doesn't affect your access.

Both migrations were applied directly against the live local Postgres
via `docker exec ... psql` and registered by hand in
`supabase_migrations.schema_migrations` — deliberately not via
`supabase db reset`, since the local DB holds the founder's real club/
message data from actual use, not just test fixtures. Verified live:
added a test member to a race, clicked Remove, confirmed the confirm
dialog, and confirmed via direct DB query the `race_members` row was
actually deleted. All test clubs/accounts created for both bugs' live
verification were cleaned up afterward.

`npx tsc --noEmit` clean throughout.

## Task 37: Header styling consistency fix

Founder-reported, with two screenshots: the club hub's header showed the
club name in orange Anton (`"BINGHAMTON UNIVERSITY"` style), but
Eboard's header showed `"Eboard"` in plain black text — asked to check
every page's header for the same inconsistency.

Grepped every `headerTitle:` definition across `app/(tabs)/clubs/` and
found the pattern immediately: task #34's header restyle (orange Anton
title via `typography.headlineLgMobile`/`colors.primary`, `headerStyle:
{ backgroundColor: colors.surfaceContainerLow }`, orange "INVITE:" text)
was applied only to `[clubId]/_layout.tsx` — the layout that owns
`index`/`chat`/`calendar`. Five sibling nested-stack layouts each define
their own separate header options and were never touched: `routines/
_layout.tsx`, `polls/_layout.tsx`, `races/_layout.tsx`,
`eboard/_layout.tsx`, `race/[raceId]/_layout.tsx`. Two of them
(`polls/_layout.tsx`, `races/_layout.tsx`, plus `routines/_layout.tsx`)
still had the literal pre-redesign hardcoded `#2563eb` blue for the
invite-code text, confirming these files predate task #34 entirely and
were never touched by it.

Fixed all five to exactly match `[clubId]/_layout.tsx`'s
`clubScreenOptions` (or, for `eboard/_layout.tsx`, whose title comes from
the Eboard channel's own name rather than the club's, the equivalent
inline styling with the same tokens). `race/[raceId]/_layout.tsx`'s title
source (`race.name`) and lack of an invite-code `headerRight` were left
as-is — only the title's typography/color and the header background
changed.

Verified live via a fresh disposable test club: created a club, an
Eboard channel, and a race, and confirmed Routines, Polls, Races & Meets,
Eboard (both the empty-state and post-channel-creation views), and the
race hub all show the orange Anton header consistently — matching the
founder's original club-hub screenshot exactly. `npx tsc --noEmit` clean.

## Task 38: Polls — Stitch redesign, optional deadline, Race/Eboard scoping

Three founder asks arriving together: apply the visual design from a
newly downloaded "Stitch Poll" export (`club_polls/` list screen,
`create_poll/` create screen) using this app's own theme, not the
export's raw color values; add a way to set a poll's end time; and let a
poll be created inside a Race or inside Eboard & Council, not just at
the club level — "plan and ask for doubts accordingly and then we'll do
the design."

### Reading the export first

`club_polls/screen.png` showed a "2 DAYS LEFT" countdown badge on an
active poll card, plus an ALL POLLS/MY VOTES tab pair replacing the
existing Active/Closed section grouping. `create_poll/screen.png` and
its `code.html`, however, had **no field for setting an end time at
all** — a real gap in the mockup itself, not something to guess past.
The export's `kinetic_performance_system/DESIGN.md` had the same
`primary: #aa3000` vs. prose-described `#FF4D00` discrepancy task #34
already resolved once (founder chose `#ff4d00` app-wide) — confirming
the "apply the design, override the color" instruction meant literally
reusing `constants/theme.ts` tokens throughout, no new decision needed
there.

### Planning: advisor, then `EnterPlanMode`, then 4 `AskUserQuestion`s

Called `advisor()` before planning, per this session's own established
practice for RLS-touching, multi-fork features (mirrors task #24's
original Polls build). It sharpened the plan to 4 real forks instead of
the 2-3 initially framed, catching one missing entirely: siloed vs.
merged poll feeds (the calendarFeed.ts precedent from task #23). All 4
were put to the founder via `AskUserQuestion` before writing the plan
file:
- **End-time input**: relative duration chips (1 Day/3 Days/1 Week/
  Custom) over an absolute date+time field — the founder's answer
  deliberately diverged from the recommended option (absolute date/time,
  which would have matched this app's existing calendar-event/Eboard-
  meeting convention).
- **Auto-close**: computed live (`is_closed OR now() > closes_at`,
  checked wherever `is_closed` already is), no cron — matches how this
  app avoids background jobs everywhere else.
- **Create rights in Race/Eboard**: match each scope's own existing
  pattern (any club admin in a Race, any Eboard member in Eboard,
  mirroring Eboard Meetings) rather than a uniform admins-only rule;
  close/delete stays creator-only everywhere, unchanged from today's
  club-poll behavior.
- **Feed shape**: siloed, not merged — mirrors how race/Eboard Chat is
  already fully separate from club chat, not the unified-Calendar
  pattern.

One more IA change was flagged in the plan file itself rather than asked
as a formal question (low-stakes, easy to veto): replacing today's
Active/Closed section grouping with the mockup's ALL POLLS/MY VOTES tabs,
status shown per-card instead of by section. The founder didn't object
when reviewing the plan.

### Schema (`0038_polls_scope_and_deadline.sql`)

`polls` gains `closes_at` (nullable timestamptz), `race_id`/
`eboard_channel_id` (both nullable — `club_id` stays `not null` and
denormalized on every row regardless of scope, confirmed by reading
`channels`' own shape in `0001_init.sql`/`0016_races.sql`/
`0017_eboard.sql` directly before writing this, not assumed). Two new
indexes (`polls.race_id`, `polls.eboard_channel_id`), same FK-indexing
discipline as task #27. `can_access_poll` becomes a 3-way branch
matching `is_channel_member`'s shape; the INSERT policy becomes a 3-way
branch matching the answered "create rights" question; `is_poll_closed`
extended to `is_closed or (closes_at is not null and closes_at < now())`,
which alone extends enforcement everywhere it's already referenced
(`poll_votes` insert/delete policies) with no other policy edits;
`cast_vote`'s own inline closed-check (it reads `p.is_closed` directly
rather than calling the helper) got the same `or` condition added
manually.

### Two real RLS bugs caught live during this task's own verification

**Bug 1: the exact same `SELECT DISTINCT`+`UNION`-forces-`text` trap from
task #36, reintroduced in this task's own new code.** `notify_poll_created`
(task #35) originally fanned out to every `club_members` row
unconditionally, regardless of scope — harmless while polls were
club-only, but a real privacy leak once a poll can be Eboard-scoped (it
would notify the entire club about a private Eboard poll's question) and
an over-notification once race-scoped. Rewrote it with the same 3-way
branch/audience shape as `notify_announcement`, including its race
branch's `select distinct u.user_id, ... from (select ... union select
...) u` shape — and hit the identical enum-cast 400 task #36 had *just*
fixed a few hours earlier in the very same session, in a different
function. Caught live via Playwright creating a race poll (`POST
/rest/v1/polls` → 400, same `"column \"type\" is of type notification_type
but expression is of type text"` message), fixed the same way (`::
notification_type` cast on all 3 branches), and documented in the
migration file a second time specifically because it was a repeated
mistake within the same session, not a new discovery — worth flagging
explicitly rather than treating as routine.

**Bug 2: a genuinely new variant of the `INSERT...RETURNING` chicken-
and-egg gotcha, this time via a self-referential SELECT policy, no
trigger involved at all.** `polls`' own new SELECT policy was first
written as `using (can_access_poll(id))`, modeled directly on
`is_channel_member` being used inside `channels`' own SELECT policy (a
pattern task #24's write-up described as "already proven safe in this
codebase"). Creating a club poll (as its own admin creator) 403'd with
"new row violates row-level security policy," even though the founder's
account was unambiguously a club admin. Debugged systematically rather
than guessed at: confirmed the user's `club_members` role directly via
SQL (admin, correct); simulated the exact RLS check in `psql` by
impersonating the caller (`set local role authenticated` +
`select set_config('request.jwt.claims', '{"sub":"...", "role":
"authenticated"}', true)`) and calling `is_club_admin`/`can_access_poll`
directly — both returned `true`. Then simulated the actual insert: a
plain `INSERT` (no `RETURNING`) succeeded; the identical `INSERT ...
RETURNING id` failed with the RLS error; a manual `SELECT
can_access_poll(id)` run immediately after the successful plain insert,
in the same transaction, returned `true`. This isolated the failure
precisely to the SELECT-policy check specifically as triggered by
`RETURNING`, not to `is_club_admin`/`can_access_poll`'s logic, which was
demonstrably correct when queried directly.

Root cause: the *original*, working club-poll policy (`is_club_member
(club_id)`) evaluated a column read straight off the tuple being
returned — no further lookup. Routing the check through `can_access_poll
(id)` instead makes the SELECT-policy check re-query `polls` **by id,
from inside a function, during the same RETURNING evaluation that is
still producing that very row** — a self-referential subquery back into
the table being inserted into. This is a materially riskier shape than
"a security-definer function used inside its own table's policy" in the
abstract, and the `is_channel_member`/`channels` precedent it was
modeled on turns out to have never actually been exercised through a
client `.insert().select()` in this codebase — every `channels` row is
inserted server-side by a trigger (`handle_new_race`, `handle_new_eboard
_channel`, `handle_new_club`), never returned to a caller. Fixed by
writing the SELECT policy's 3-way branch inline on the row's own columns
instead of delegating to `can_access_poll`:
```sql
using (
  case
    when race_id is not null then is_race_admin(race_id) or is_race_member(race_id)
    when eboard_channel_id is not null then is_eboard_member(eboard_channel_id)
    else is_club_member(club_id)
  end
)
```
`can_access_poll` itself is unchanged and still used by `poll_options`/
`poll_votes`'s own SELECT policies, where it queries `polls` from a
*different* table being read — no self-reference there, so no risk.
Documented at length in both the migration file and SPEC.md section 6,
since this is a new, non-obvious lesson distinct from the original
`clubs`-creation gotcha (that one was about trigger timing; this one is
about the shape of the SELECT policy's own lookup, with no trigger
involved anywhere).

### UI — extracted shared components, same pattern as `ChatScreen`/`HighlightsScreen`

`components/PollsListScreen.tsx`/`PollDetailScreen.tsx`/
`PollCreateScreen.tsx`, parametrized by a new `PollScope` discriminated
union (`{ type: "club" | "race" | "eboard", clubId, ...}`) — the same
extraction payoff task #16 proved for chat, letting Race and Eboard
mount the identical components instead of forking two more copies.
`lib/polls.ts`'s `fetchPolls`/`createPoll` generalized to take a `scope`
instead of a bare `clubId`; `fetchPolls` gained `closesAt` and a new
`hasVoted` per-item boolean (one extra query, powers the MY VOTES tab);
new exported `isPollEffectivelyClosed(poll)` helper shared by list and
detail screens so client-side "is this closed" display can't drift from
what the server actually enforces. New `lib/dates.ts` export
`formatCountdown(closesAtIso)` → `"2 DAYS LEFT"`/`"5 HOURS LEFT"`/
`"ENDING SOON"`/`"ENDED"`, with its own `dates.test.ts` coverage
(pluralization, the `ENDED`/`ENDING SOON` boundary cases) added
alongside the existing date-helper tests.

New thin wrapper routes: `race/[raceId]/polls/{index,create,[pollId]}.tsx`
(registered as flat `Stack.Screen` entries in `race/[raceId]/_layout.tsx`,
matching how `location`/`carpool` are registered there rather than as a
nested sub-Stack, since race has no precedent for the latter) and
`eboard/polls/{index,create,[pollId]}.tsx` (registered in `eboard/
_layout.tsx`, each wrapper screen carrying its own `eboard.channel
?.isMember` direct-URL guard mirroring `chat.tsx`'s existing pattern,
since the shared component itself has no opinion about Eboard membership
— that gate belongs at the route level). Existing `clubs/[clubId]/polls/
{index,create,[pollId]}.tsx` rewritten as thin wrappers passing
`scope: { type: "club", clubId }`. Hub wiring: a "Polls" row added to
`race/[raceId]/index.tsx`'s and `eboard/index.tsx`'s `SECTIONS` arrays,
same icon/tint (`how-to-vote`, `colors.secondary`) the club hub already
uses for its own Polls row.

`types/database.ts` (hand-written, SPEC.md section 6 gotcha) needed its
`polls` `Row` type updated with the 3 new columns — caught immediately
by `tsc --noEmit`, not live testing, exactly the kind of drift risk that
gotcha documents.

### Verification

`npx tsc --noEmit` clean after every stage. Live via `CI=1 npx expo
start --web` + Playwright on a fresh disposable test club (created,
verified, and fully cleaned up afterward — club, race, Eboard channel,
and both test accounts deleted, confirmed via a post-cleanup query that
nothing cascaded incompletely):
- Club poll: created with a "1 Day" deadline chip, confirmed the "23
  HOURS LEFT" countdown badge rendered correctly on both the list card
  and detail screen; voted, confirmed the count updated live and the
  option highlighted with a checkmark. Forced the deadline into the past
  directly via SQL (`update polls set closes_at = now() - interval '1
  hour'`) and confirmed the list screen's card immediately reflected
  "CLOSED"/"VIEW RESULTS" purely from `isPollEffectivelyClosed`'s
  client-side check, without needing a page reload or the creator
  manually closing it.
- Race poll: created from inside a race as the club admin; confirmed it
  does **not** appear in the club's own Polls list (siloed, per the
  answered question) nor vice versa. As a plain race member (not admin,
  added directly to the roster, not via request) confirmed the "Have a
  new idea?"/FAB create affordances were both absent (`canCreate` false)
  but voting still succeeded and rendered the voter's name correctly
  (public, non-private poll) — confirming the RLS INSERT policy's
  `is_race_admin` branch correctly excludes a non-admin member from
  creating while still allowing them through `poll_votes`' own unrelated
  policy to vote.
- Eboard poll: created as the Eboard channel's only member (also the
  club's only admin in this test, so the "any Eboard member, not just
  admins" distinction wasn't separately isolated from "any admin" here —
  noted as a real gap in this pass's coverage, not re-tested with a
  second Eboard member due to session time).
- MY VOTES tab: voted on the club poll, confirmed it appeared under MY
  VOTES while the (separately created, unvoted) race poll's own MY VOTES
  tab correctly showed empty.
- Regression: club chat, Highlights, and the pre-existing club-poll flow
  all continued to work unchanged throughout.

## Task 39: Polls in the unified Calendar

Founder follow-up immediately after task #38 shipped: "the poll was
created but it didn't reflect in the calendar so if any poll is created
if the person is in the club, race or eboard channel he should see it in
the calendar."

### The design question a poll's calendar entry raises that events/races/meetings don't

Every existing source `lib/calendarFeed.ts` merges (calendar events,
races, Eboard meetings) has a genuine "when does this happen" timestamp.
A poll doesn't — it has an optional `closes_at` deadline and nothing
else scheduled. Two things followed from that:

- **What date does a poll sort/display under?** `closesAt` when set (the
  actionable "vote by" date), falling back to `createdAt` for an
  open-ended poll — so a no-deadline poll still shows up somewhere
  sensible instead of being silently excluded from a feed keyed entirely
  on dates.
- **What does "Upcoming" mean for a poll?** The existing `isUpcoming`
  check in `calendar.tsx` is a raw compare against `atIso >= now`. Naively
  reusing that for a poll dated by `createdAt` (the no-deadline case)
  would flip it to "Past" the instant its own creation timestamp ticks
  past "now" — which for practical purposes is immediately, since
  `createdAt` is always in the past by the time the calendar re-renders.
  An open-ended, still-fully-votable poll would show as "past" from the
  moment it existed. Solved by adding `CalendarFeedItem.isOpen?: boolean`
  (poll-only) computed via `lib/polls.ts`'s already-existing
  `isPollEffectivelyClosed` — reused rather than reimplemented, so a
  poll's calendar bucket can never drift from what the poll's own list/
  detail screens already show as open/closed. `calendar.tsx`'s
  `isUpcoming` special-cases `item.kind === "poll"` to check `isOpen`
  instead of doing the date compare that every other kind still uses.

### What was built

`fetchCalendarFeed` gained a 4th merged source, `lib/polls.ts`'s
`fetchPolls`, called once per scope the caller can actually read — club
polls unconditionally (every club member can already read them, same as
calendar events), race polls once per race in the *already-computed*
accessible-races list (reusing the exact filter the races branch above
it already applies, no separate access check needed), and Eboard polls
only if `eboardChannel?.isMember` (reusing the same `eboardChannel` value
already fetched for meetings, not fetched twice). No new RLS anywhere —
this is a pure aggregation over `fetchPolls`, itself already scope-aware
from task #38.

`calendar.tsx` gained a "Poll" entry in its `BADGE_STYLE`/`BIB_STYLE`
maps (`colors.secondaryContainer`/`colors.secondary`, matching the Polls
hub row's own tint elsewhere in the app) and the `isOpen`-based bucketing
special-case described above. `formatItemDate`/`bibDay` needed no changes
— poll items always set `hasTime: true` (both `closesAt` and `createdAt`
are full timestamps), so they flow through the exact same "hasTime"
rendering path events/meetings already use.

### Test updates

`lib/calendarFeed.test.ts` needed `fetchPolls` mocked (`jest.mock("./polls",
() => ({ ...jest.requireActual("./polls"), fetchPolls: jest.fn() }))` —
deliberately *not* a plain `jest.mock("./polls")`, since that would also
replace `isPollEffectivelyClosed` with an auto-mock returning `undefined`
for every poll, silently breaking `calendarFeed.ts`'s own `isOpen`
computation, which calls that same real function directly). A new test
covers all 4 poll-visibility/dating rules at once: a race's polls are
never even requested when the caller has no access to that race
(`fetchPolls` not called with that race's scope at all, not just
"returns nothing"); a manually-closed poll, a no-deadline poll, and two
future-deadline polls sort correctly by `closesAt ?? createdAt` and
report the right `isOpen` value each. The two "still open" polls' `closesAt`
values are computed relative to `Date.now()` at test-run time (mirroring
`formatCountdown`'s own test style) rather than hardcoded to a fixed
calendar date, so the test can't silently start failing once real time
passes whatever date got hardcoded.

### Verification

`npx tsc --noEmit` and the full `jest` suite clean. Live via `CI=1 npx
expo start --web` + Playwright on a fresh disposable test club: created
one poll in each of the 3 scopes **through the actual create-poll UI**
(not seeded via SQL, to reproduce the founder's exact reported path) —
a club poll with a 3-day deadline, a race poll and an Eboard poll both
left with no deadline. All 3 appeared in Calendar under "Upcoming
Events" immediately, each with a "POLL" badge, correctly dated (the
club poll by its deadline, the other two by their creation time), and
sorted chronologically alongside the test race itself. Tapped one poll's
calendar card and confirmed it navigated to the correct poll detail
screen for its scope. Test club, race, Eboard channel, and account fully
cleaned up afterward, confirmed via a post-cleanup query that no rows
were left behind.

## Task 40: Eboard member removal + Delete Club/Race/Eboard

Backfilled into this file (and into `SPEC.md`'s status table) during
task #41's own migration-numbering review, which noticed `supabase/
migrations/` already had `0039_eboard_members_delete.sql` and
`0040_club_eboard_delete.sql` on disk with no corresponding SPEC.md/
HISTORY.md entries — an earlier session shipped this work without
updating either doc. This entry is reconstructed from the migration
files and the `lib/` functions that consume them, not from a
first-hand build narrative — there's no record of what live testing
(if any) was done at the time.

`0039_eboard_members_delete.sql` closes the same class of gap task #36
found and fixed for `race_members` in `0037`: `eboard_channel_members`
had insert/select policies since `0017_eboard.sql` but no delete policy
at all, so there was no way to remove someone from the Eboard roster.
The fix mirrors `0017`'s own asymmetry — removal rights belong to
*existing eboard members*, not to every club admin — and blocks
self-removal at the RLS layer itself (`user_id <> auth.uid()`), not
just in the UI. (Task #41 below replaces this policy entirely with a
creator-only rule.)

`0040_club_eboard_delete.sql` adds two delete policies: Delete Club is
restricted to `created_by = auth.uid()` — deliberately *not* "any
admin," given deleting a club cascades away every member's chat
history, races, Eboard, polls, and notifications, permanently, for
everyone — and Delete Eboard channel is restricted to existing
members, the same asymmetry `0039` uses. Race delete already existed
(`0016`'s plain admin-only policy). The corresponding client entry
points are `lib/clubs.ts`'s `deleteClub`, `lib/eboard.ts`'s
`deleteEboardChannel`/`removeEboardMember`, and `lib/races.ts`'s
`deleteRace`, plus whatever UI wired them up (not independently
verified as part of this backfill).

## Task 41: Admin auto-membership for Race/Eboard + calendar visibility

A from-scratch founder request, not a wireframe: club admins should get
*real*, visible, individually-removable membership in every Race and in
Eboard & Council, not the implicit access (`is_club_admin`/`is_race_admin`
checks, no roster row) every prior task had used. Specifically: (1)
creating a race or the Eboard channel should add every *current* club
admin, not just whoever clicked create; (2) promoting someone to admin
should immediately add them to Eboard and to every upcoming race;
(3) regular members still only get into a race by requesting or being
added, unchanged; (4) the club "owner" should be able to kick an admin
out of a race or out of Eboard; (5) a race should show up on the
unified Calendar for every club member as soon as it's created, not
just for members who already have access.

Almost every clause above had a real open question hiding in it, so
this was planned via `EnterPlanMode` rather than built directly. An
`advisor` consult before drafting any `AskUserQuestion` caught two
things worth recording: first, that "available in the calendar" was
ambiguous between the plain Races & Meets list (already visible to
every club member today, tagged Requested/Request-to-join) and the
unified Calendar tab (`calendarFeed.ts`, which actually filtered a race
out for anyone without access) — a scope question, not a design
decision, and asking it the wrong way ("should we change the filter?")
would have buried the real fork. Second, that "owner" in "owner should
have the option to kick the admin out" was being quietly resolved to
"any admin" by pointing at what existing RLS already permitted, rather
than by asking what the founder actually meant — and `0040`'s own
Delete Club policy (creator-only, argued for explicitly because of
blast radius) was direct precedent that "kicking an admin out" might
deserve the same restriction, not the default. Both went into
`AskUserQuestion`, alongside two smaller but easy-to-get-wrong
questions: whether demotion should auto-reverse the auto-add (yes,
selected), and whether "upcoming" for the promotion sync means
`event_date >= current_date` or strictly greater (inclusive of today,
selected). Answers: unified Calendar tab; club creator only, not any
admin; auto-remove on demotion; today counts as upcoming.

**A real latent bug found while tracing the existing code, before
writing any new SQL**: `handle_new_race()` (0016) and
`handle_new_eboard_channel()` (0017) both inserted the membership row
*before* creating the channel:
```sql
insert into public.race_members (race_id, user_id) values (new.id, new.created_by);
insert into public.channels (club_id, race_id) values (new.club_id, new.id);
```
`log_race_member_added()`'s own body starts with `select id into
target_channel from public.channels where race_id = new.race_id`, then
returns early if that's null. At the moment the `race_members` insert's
`AFTER INSERT` trigger fires, the channel insert on the next line
hasn't run yet — so `target_channel` was always null, and the
creator's own "joined" system message and "you were added" notification
have silently never fired, for every race and every Eboard channel ever
created. Harmless with a single row (nobody looks for a missing
system message announcing that the creator joined their own race), but
this task's whole point is bulk-inserting *every* current admin into
that same statement — without the fix, every one of those newly
auto-added admins would have silently gotten no confirmation at all.
Fixed by flipping the two `insert` statements' order in both functions
while re-creating them anyway (`create or replace function`, same
technique `0016`/`0017`/`0032` each already used on these exact
functions — no existing migration file touched).

**Schema** (`0041_admin_race_eboard_membership_sync.sql`): three new
`security definer` helpers — `is_club_creator`, `is_race_club_creator`,
`is_eboard_club_creator` — mirroring the existing `is_club_admin`/
`is_user_club_admin` shape. `handle_new_race`/`handle_new_eboard_channel`
re-created a third/second time (channel-first ordering fix above, plus
bulk-inserting every club admin via `insert ... select ... from
club_members where role = 'admin'` instead of just `created_by`). A new,
independent trigger `handle_admin_role_membership_sync` on `club_members`
role changes (deliberately *not* merged into the existing, already-dense
`log_member_role_changed` — a second `after update of role` trigger on
the same table fires fine): promoting to admin inserts into
`eboard_channel_members` (if a channel exists) and into `race_members`
for every race with `event_date >= current_date`; demoting reverses
both for upcoming races only, deleting `race_car_group_members` first
(mirroring `lib/races.ts`'s `removeRaceMember`, since that table has no
FK cascade back to `race_members` and would otherwise leave a stale,
possibly-Incharge row behind) — past races are left completely alone,
on purpose, so losing admin status doesn't rewrite history for
something that already happened.

Two RLS policies replaced (both `drop policy` + `create policy` in the
new file, the same technique `0016_races.sql` already used on
`channels`' select policy — no existing migration file edited).
`race_members` DELETE forks into two permissive policies: any race
admin can still remove a member who *isn't currently* a club admin
(unchanged from `0037`), but removing a member who *is* a club admin is
now `is_race_club_creator`-only. `eboard_channel_members` DELETE is a
straight replacement of `0039`'s "any existing member" with
"`is_eboard_club_creator` and not self" — since every eboard member is
already guaranteed to be a club admin (enforced by `0017`'s own insert
policy), there was never a "non-admin eboard member" case to preserve;
this is a deliberate, founder-confirmed narrowing of `0039`'s original
rule, not a bug fix.

**Application code**: `[clubId]/_layout.tsx`'s `ClubContext` gained
`isCreator` (now also selects `created_by` from `clubs`). Both roster
screens (`race/[raceId]/roster.tsx`, `eboard/roster.tsx`) now gate
`removable` on `club.isCreator` for any row that belongs to a current
club admin, instead of on plain admin/eboard-member status — race's
existing synthetic "implicit admin, no real row yet" section (built
from club admins minus real `race_members` rows) was left untouched,
since it still correctly covers an admin promoted with no upcoming
races to auto-join. `lib/calendarFeed.ts` dropped its `r.access ===
"none"` guard entirely, so every club member sees every race on the
unified Calendar immediately — tapping through without access still
redirects to the Races & Meets list via the existing `race/[raceId]/
_layout.tsx` guard from task #16, left unchanged.

### Verification

`npx tsc --noEmit` clean. `supabase db reset` applied migration 0041
cleanly on top of all 40 prior migrations (the local DB was already
freshly emptied earlier in this same session, so a full reset was a
safe, cheap way to pick up the new trigger/policy definitions).

## Task 42: Owner/Admin/Member role hierarchy + race-channel membership rework

A from-scratch founder spec, delivered as a structured brief (role
hierarchy, a permission table for promote/demote/remove/remove-admin/
transfer-ownership, and a description of the desired race-channel
behavior) rather than a wireframe. Three genuinely open questions were
called out by the founder in the brief itself; each was answered via
`AskUserQuestion` with a recommended default before any code was
written, and all three recommendations were accepted: outgoing Owner
becomes Admin on transfer; `remove_admin` cleans up Eboard/race rows
the same way demotion already did, and the pre-existing gap where
`remove_member`/outright removal never cleaned those rows up at all
got fixed alongside it; race-channel management authority (approve
requests, add/remove people) is "creator + any Admin/Owner," not
creator-only.

See SPEC.md's migration changelog (0042/0043/0044) for the full design
narrative — permission-matrix policies, the tier-aware Eboard-sync
trigger rewrite, `transfer_ownership()`'s two-step demote-then-promote
ordering, and the race-channel access model (`is_race_member` required
for chat even for the Owner, `is_race_admin` for management authority).
Two things worth recording here specifically:

**Verification went well beyond `tsc`/`npm test`, and caught real bugs
before they ever touched a real database.** Before writing any RLS
policy, two things were verified directly against a scratch Postgres
instance rather than assumed: whether a newly-added enum value could be
used later in the same transaction (yes, when the enum type itself was
also created fresh in that transaction — see the caveat below), and
whether `ON DELETE CASCADE` respects RLS on the child table (it
doesn't — a row a restrictive policy blocks from *direct* deletion is
still genuinely removed, not orphaned, when removed via cascade from
the parent). That second finding simplified the Delete Club design
considerably — no RPC-wrapping needed for the Owner's own
`club_members` row to survive a club-wide cascade delete. Separately,
full RLS-impersonation testing (`set local role authenticated` +
`set local request.jwt.claim.sub`) against a `pg_dump`-restored copy of
the actual local dev data — not a fabricated fixture — exercised every
branch of the permission matrix and the full race request/approve flow
before either migration touched the real DB, and caught two real bugs
this way: `request_join_race` still short-circuited to `'joined'` for
any club Admin/Owner without ever inserting a real `race_members` row
(silently correct under the old auto-access model, silently *wrong*
under the new one — a manager's own join request would no-op instead
of filing); and `is_user_race_participant` (backs Car Assignment group
membership from task #19) still let any club admin be assigned to a
car group for a race they'd never actually joined, the same stale
"admins have automatic race access" assumption surfacing a third time
in a place not originally in scope.

**A second, later `supabase db reset` (run in a fresh session after
this work had already been committed and pushed) failed outright** with
`ERROR: unsafe use of new value "owner" of enum type club_role
(SQLSTATE 55P04)`, on the very backfill statement immediately following
`alter type club_role add value 'owner'` in what was then
`0042_club_role_owner.sql`. The original verification of "a newly-added
enum value can be used later in the same transaction" was real, but it
tested the wrong scenario: a scratch test that also `CREATE TYPE`'d the
enum fresh inside the same transaction before adding a value to it and
using it — which Postgres allows — is not the same as adding a value to
an *already-committed* enum type (`club_role` has existed since
migration 0001) and using it later in that same transaction, which
Postgres explicitly forbids via this exact error. The gap between the
two only showed up because `supabase db reset` runs each migration file
as a single transaction, whereas the *manual* apply path used earlier
in the same original session (`docker exec ... psql -f`, per CLAUDE.md's
own documented non-reset workflow) runs in autocommit-per-statement
mode by default and never hit the restriction at all — so the bug was
invisible on the exact path it was "verified" against, and only surfaced
the first time the other, equally-supported deployment path was
actually exercised. Fixed by splitting the single `alter type ... add
value` statement into its own migration file
(`0042_club_role_owner_enum.sql`), letting it commit on its own before
anything else reads or writes rows using `'owner'` — the former
`0042_club_role_owner.sql` and `0043_race_channel_rework.sql` were
renumbered to `0043`/`0044` accordingly, with their few internal
cross-references to each other's migration numbers updated to match.
Re-ran `supabase db reset` end-to-end afterward to confirm all 44
migrations now apply cleanly from scratch, not just re-applied the fix
directly against the already-running local DB.

**Lesson for future migrations that add an enum value**: always give
`alter type ... add value` its own migration file, unconditionally —
don't rely on "I tested it working in the same transaction," since
that result depends entirely on whether the enum type was also created
in that same transaction, which is almost never true for a value being
added to a type that's existed since an early migration.

### Verification

`npx tsc --noEmit` and `npm test` both clean throughout. Verified via
direct Postgres experimentation (not assumption) before writing RLS:
`ALTER TYPE ... ADD VALUE` usable later in the same transaction when
the enum is also new in that transaction; `ON DELETE CASCADE` bypasses
RLS on the child table entirely. Verified via full RLS-impersonation
testing against a `pg_dump`-restored copy of live data for every
permission-matrix branch (promote/demote/remove-member/remove-admin-as-
admin[blocked]/remove-admin-as-owner[allowed]/owner-can't-leave/
transfer-ownership including correct Eboard sync and exactly one system
message) and the full race request/approve/access flow. Verified live
end-to-end via Playwright with 3 real accounts covering the same
scenarios in the actual running app. After the migration-numbering fix,
re-ran `supabase db reset` from a clean slate and confirmed all 44
migrations apply without error.

### Follow-up: race chat crash on first open, reported live by the founder

Founder-reported, with a screenshot of Expo's error overlay: creating a
race, adding an admin directly, then opening that race's chat as the
added admin crashed with `cannot add \`postgres_changes\` callbacks for
realtime:messages:<channelId> after \`subscribe()\`.`, thrown from
`lib/messages.ts`'s `subscribeToNewMessages`.

Root-caused from the actual `@supabase/realtime-js` source rather than
guessed at: `RealtimeClient.channel(topic)` reuses an existing channel
object if one with the same topic string is already present in
`this.channels` — "If a channel with the same topic already exists it
will be returned instead of creating a duplicate connection," per its
own doc comment. Calling `.on()` on a channel that's already
joined/joining throws exactly this error. `removeChannel()` (used in
every subscription's cleanup) is `async` — it `await`s a real
`unsubscribe()` network round-trip before tearing the old channel down
— but React does not await an effect's cleanup function, so a fast
unmount immediately followed by a remount of the same chat screen (same
`channelId`) can call `subscribeToNewMessages` again before the
previous channel has actually finished leaving, getting back that
still-joined channel and throwing.

This is the exact same bug class task #35 already hit once for
`subscribeToNotifications` (two known concurrent callers — the badge
provider and the Notifications screen — colliding on one topic name,
fixed there with a fixed `tag` parameter distinguishing the two) — but
`lib/messages.ts`'s version of it was never fixed, and a static tag
wouldn't have helped here anyway: this variant is a single caller
(`ChatScreen.tsx`) remounting rapidly for the *same* channel, not two
different simultaneous callers, so it needs a fresh identifier per
subscription *attempt*, not a fixed per-caller one. Fixed by appending
a module-level monotonic counter to the topic string in both
`subscribeToNewMessages` (`lib/messages.ts`) and, proactively, in
`subscribeToNotifications` (`lib/notifications.ts`) too — the same
async-cleanup race is equally possible there for either of its callers
individually, the existing `tag` param just never protected against it.

Verified by reproducing the exact reported flow live via Playwright with
2 fresh accounts (create a club, add a second member, promote implicitly
via the race's initial-member picker, create a race adding that member
directly, sign in as them, open the race's chat) before the fix — did
not reproduce the crash directly on the first attempt in this session
(the underlying race condition depends on timing that isn't always hit),
but the root cause was conclusively identified from the library's own
source and the fix directly addresses the documented mechanism, mirrors
an already-proven fix for the identical bug class elsewhere in this
codebase, and the same repro flow was re-confirmed clean after the fix
with `npx tsc --noEmit` and `npm test` both passing throughout.
