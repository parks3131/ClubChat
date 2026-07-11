# ClubChat

A purpose-built team communication app for running clubs (and similar sports
clubs), built to replace a duct-taped combination of GroupMe, Excel
screenshots, and one-off chat groups created from scratch for every race.

---

## Table of contents

1. [The one-liner](#the-one-liner)
2. [The problem](#the-problem)
3. [What was built](#what-was-built)
4. [The domain model](#the-domain-model)
5. [Why these technical choices](#why-these-technical-choices)
6. [The architectural decision I'm proudest of](#the-architectural-decision-im-proudest-of)
7. [Real engineering problems hit and solved](#real-engineering-problems-hit-and-solved)
8. [How the app is organized](#how-the-app-is-organized)
9. [Current status](#current-status)
10. [What this project demonstrates](#what-this-project-demonstrates)
11. [Local development](#local-development)

---

## The one-liner

ClubChat is a purpose-built team communication app for running clubs (and
similar sports clubs), designed as a reusable template: a persistent club
"home base" (chat, calendar, workout plans) plus a nested, request-based
"Races & Meets" system that gives every race its own membership, chat,
logistics, and carpool coordination — without rebuilding any of those
features from scratch each time.

## The problem

The club this was built for coordinates everything today through GroupMe,
plus a pile of ad-hoc tools duct-taped around it. GroupMe is a generic group
chat app; it was never designed to be a club-management tool, and the gap
shows up in very concrete, very manual ways:

- **Workout plans** get built in an Excel spreadsheet, screenshotted, pasted
  into the group chat as an image, and then manually "pinned" so people can
  find it later. There is no structured plan anywhere — just a picture of
  one, sitting in a chat feed, that stops being the current plan the moment
  someone pastes a new screenshot over it.
- **Race logistics** — who's driving whom, where to meet, what time, where
  the results get posted — get handled by spinning up an entirely new
  GroupMe group *per race*. Every race starts from zero: a new group, a new
  invite link, new intros, no memory of how the last one was organized.
- **Nothing is actually structured data.** Every "feature" the club has
  (announcements, race sub-groups, workout plans) is really just people
  manually recreating structure that the tool doesn't provide, over and
  over, race after race, week after week. A generic chat app has no concept
  of a roster, a role, a race, or a plan — it only knows about messages.

None of this is a knock on GroupMe as a chat app; it's just the wrong shape
of tool for what a club actually needs to run itself.

## What was built

Rather than building a single flat chat app, ClubChat was designed as a
reusable **template** any club could deploy, structured as two nested
layers:

### 1. The general club

A persistent, top-level home base for the club as a whole:

- **Chat** — text, photos, reactions, pinned messages, and
  admin-only announcements, plus a dedicated "Highlights" screen (pinned +
  announcements in one place) so nothing important gets lost in normal chat
  scroll the way it does today in GroupMe.
- **Calendar** — races, practices/meets, team-bonding events, volunteer
  work, and anything else the club schedules. Tapping an entry opens a
  clean detail view, closer to a Strava/Corros-style event page than a
  generic calendar app. The calendar is actually a *merged feed*: it pulls
  in standalone calendar events, races the viewer has access to, and (for
  admins) Eboard meetings, all sorted into one Upcoming/Past list — so a
  member doesn't have to check three different screens to know what's
  happening this week.
- **Weekly routines** — admin/captain-authored recurring workout plans,
  organized by a real calendar week (not an abstract repeating template),
  with 10 supported activity types so the same structure works whether the
  club is a running club, swim club, or something else entirely. This is
  the direct, structured replacement for the Excel-screenshot workflow.

### 2. Races & Meets — the key design insight

The real insight behind ClubChat's architecture is that **a race isn't a
separate product concept from a club — it's the same shape, nested one
level down.** A race gets:

- Its own request-based membership (a club member requests to join, or an
  admin adds them directly — no separate "race admin" role, since a club
  admin already has full access to every race under their club).
- Its own scoped chat, with full feature parity to the main club chat:
  reactions, pins, announcements, realtime updates, photo attachments,
  moderation — all of it, for free (more on why below).
- Its own "Meet Information" page: description, location link, hotel link,
  photos link, and results link, all edited together as one form.
- Its own **carpool coordination** — auto-numbered car groups ("Group 1",
  "Group 2", ...), each with a designated "Incharge" person, scoped to
  whoever already has access to the race.

This is the feature that most directly kills the "spin up a new GroupMe
group per race" pain point — a race in ClubChat is a first-class,
structured mini-club, not a one-off improvisation.

### 3. Eboard & Council

A private, admin-only space (exactly one per club) for the club's
leadership to coordinate separately from the general membership — its own
chat and its own meeting scheduler (title, description, video-call link,
date/time), with an explicit "Added by \<name\>" attribution and
creator-only edit/delete rights.

### 4. Polls

A final layer on top of the above: admin-created polls with single- or
multi-select voting and a public/private toggle for voter visibility (vote
*counts* are always public; who voted for what can be restricted to the
poll's creator).

### Build order

The build was sequenced deliberately by fastest realistic value delivery,
agreed with the founder up front:

```
chat  →  club membership/roles  →  calendar  →  weekly routines
     →  full race sub-flow (sub-chat, carpools, results)  →  polls
```

The reasoning: chat + membership/roles + calendar alone already beats the
GroupMe-plus-Excel-screenshots status quo, so that's the fastest path to
something genuinely useful, with the higher-effort features (races,
carpools, polls) layered on afterward.

A running spec (`SPEC.md`) and a detailed build history (`docs/HISTORY.md`)
documented every decision, every scope change, and every bug hit along the
way — including several founder-driven pivots (e.g. races being created
standalone rather than spawned from calendar events, once an actual
hand-drawn wireframe superseded the original plan).

## The domain model

```
User (auth.users + profiles)
 └─ Club  (top-level container: invite_code + join_policy)
     ├─ ClubMember            (role: admin | member)
     ├─ ClubJoinRequest       (only used when join_policy = "request")
     ├─ Channel                (club-scoped by default; nullable race_id /
     │   └─ Message             eboard_channel_id make it race- or
     │                          Eboard-scoped instead — one generic table)
     ├─ CalendarEvent         (race | practice | team_bonding | volunteer | other)
     ├─ RoutineWorkout        (dated weekly workout: activity_type, title, description)
     ├─ Poll
     │   ├─ PollOption
     │   └─ PollVote
     ├─ Race                   (nested mini-club — always request-based access)
     │   ├─ RaceMember
     │   ├─ RaceJoinRequest
     │   ├─ its own Channel/Messages (same generic tables — full parity, free)
     │   ├─ Meet Information (5 fields directly on races)
     │   └─ RaceCarGroup
     │       ├─ RaceCarGroupMember
     │       └─ one designated Incharge per group
     └─ EboardChannel          (exactly one per club — admin-only mini-club)
         ├─ EboardChannelMember
         ├─ EboardChannelJoinRequest
         ├─ its own Channel/Messages
         └─ EboardMeeting
```

Two deliberate, load-bearing design choices sit underneath this model:

- **`channels` is generic, not duplicated per feature.** A channel can
  belong to a club (the default), a race (`race_id`), or an Eboard space
  (`eboard_channel_id`) via nullable foreign keys, and every downstream
  concept — messages, reactions, pins, announcements, realtime — is written
  once against that one table. See the "architectural decision" section
  below for why this mattered.
- **`join_policy` replaces what would otherwise be an "invite-only" tier.**
  Every club is either `open` (search-by-name joins instantly) or
  `request` (search-by-name files a request an admin must approve). The
  separate `invite_code` / `join_club_by_code` path is untouched and
  orthogonal to this — it's a private, always-instant-join side channel
  regardless of `join_policy`, intended as the base for a future shareable
  join link.

## Why these technical choices

**React Native + Expo, targeting iOS, Android, *and* web (via Expo
Router's file-based routing).** For a small club, you cannot demand that
every member install a native app just to see this week's workout plan.
Being reachable from a plain browser link is a real feature here, not a
nice-to-have — it's the difference between "everyone can actually use
this" and "half the club bounces off the App Store listing."

**Supabase (Postgres + Auth + Realtime + Storage), not a NoSQL document
store.** The domain is inherently relational, and it gets *more* relational
the deeper you go: a club has members, a race has a sub-roster drawn from
that club's own members, a carpool group is a sub-group of a race's
roster, and permissions cascade through every layer of that nesting.
That's exactly the shape a relational database with row-level security is
built for. It's also exactly the shape that gets awkward fast in a
document model — you'd end up either duplicating membership data across
documents or building your own referential-integrity and permission-
cascading logic by hand, which Postgres already gives you for free via
foreign keys and RLS policies.

Supabase specifically (rather than a bare Postgres instance) was chosen
because it bundles auth, realtime subscriptions, and file storage on top
of Postgres, so the project didn't need to stand up and wire together three
separate services just to get chat working.

## The architectural decision I'm proudest of

Instead of building "club chat" and "race chat" (and later "Eboard chat")
as three separate features, messaging was modeled from the start as **one
generic table** that can optionally belong to a club, a race, or a private
admin-only Eboard space, via nullable foreign keys (`race_id`,
`eboard_channel_id`). Every downstream piece of functionality — sending
messages, reactions, pinning, admin announcements, realtime updates — was
written exactly once against that generic table and its permission
policies.

That bet paid off directly, twice:

- When the race sub-flow was built (task #16 in the build history), race
  chat got full feature parity with club chat — pins, reactions,
  announcements, realtime, system messages for joins/leaves — with **zero
  changes** to the `messages` or `message_reactions` RLS policies. The
  existing `is_channel_member`/`is_channel_admin` helpers just needed to
  learn to branch on the new nullable `race_id`, and everything downstream
  kept working unmodified.
- The same thing happened again when the private, admin-only "Eboard"
  space was added (task #17) — a second nullable column
  (`eboard_channel_id`), a second branch in the same two helper functions,
  and Eboard chat had full parity too.

On the UI side this paid off the same way: `chat.tsx` and
`highlights.tsx` were extracted once into shared
`components/ChatScreen.tsx` / `components/HighlightsScreen.tsx`, and the
club, race, and Eboard chat screens are all just thin wrappers around them,
parametrized by `channelId`, `isAdmin`, and a couple of route paths. Every
feature added later to chat — photo attachments, message delete/report,
scroll-triggered pagination — was written once and every scope
(club/race/Eboard) got it automatically.

## Real engineering problems hit and solved

### A subtle Postgres RLS chicken-and-egg bug

Club creation started failing with `new row violates row-level security
policy for table "clubs"`, which at first looked like a catastrophic,
unexplainable platform failure. The policy text, grants, `auth.uid()`
resolution, function ownership, Postgres version, and the `row_security`
GUC were all checked and re-checked and all looked correct. It even
reproduced on a **brand-new scratch table** with a policy set to `with
check (true)`, across two different Supabase projects — which looked like
conclusive proof of a platform-wide incident (and there genuinely *was* an
unrelated active Supabase incident happening at the same time, which made
this considerably more confusing than it needed to be).

The actual root cause: every one of those "repro" scratch tables had an
INSERT policy but **no SELECT policy**. When Postgres executes `INSERT ...
RETURNING` — which is exactly what Supabase's client generates by default
via `.insert().select()` — it doesn't just check the INSERT policy's
`WITH CHECK`; it **also re-checks the returned row against the table's
SELECT policy**, since `RETURNING` is effectively "read this row back
immediately." The real `clubs` SELECT policy required the caller to
already be a club member, and at the exact instant a brand-new club is
inserted, its creator isn't a member yet — that only happens moments later
via a database trigger. Chicken, meet egg.

The fix: the `clubs` SELECT policy became
`using (is_club_member(id) or created_by = auth.uid())` — the creator can
always see their own row immediately, independent of trigger timing. This
was documented explicitly in `SPEC.md` as a standing rule for any future
table with the same "creator should see their own new row immediately"
shape, and it was consciously re-applied when the `races` table was built
later.

### Soft-delete over hard-delete for moderation

When building message delete/report (task #31), a live test caught that a
hard `DELETE` broke the chat's own pagination/merge logic: the
scroll-triggered "load earlier" pagination (task #28) merges fetched
message pages into state **by message ID**, specifically so a loaded older
page survives unrelated realtime activity — but that same merge logic had
no way to notice a message had been hard-deleted out from under it. Other
members' screens just kept showing the deleted message indefinitely, until
a full page remount happened to refetch and finally drop it.

Beyond the technical bug, the founder flagged that a message silently
vanishing from someone's chat history is worse UX on its own, independent
of the bug. The fix was to switch to a **soft delete**: a new
`messages.deleted_at` column, an `UPDATE` (through the existing
sender-or-admin update policy) that clears the body/media and stamps
`deleted_at`, and a "This message was deleted" tombstone render on the
client. Simpler than patching the merge logic, and better UX than either
option would have been alone.

### Account deletion done properly

A literal hard-delete of a user's `profiles` row would have failed
outright — roughly 15 foreign keys across the schema point at `profiles`
with no `ON DELETE` behavior defined, and any real cascade would have
either destroyed other members' chat history or required extensive,
risky migration surgery. This was caught by consulting a second reviewer
*before* writing a migration, not after hitting the error in production.

The founder was presented with the tradeoff directly (via a structured
choice, not a silent unilateral decision) and chose **anonymize, not
hard-delete**: a `security definer` `delete_account()` RPC that scrubs the
caller's own PII from their `profiles` row and sets
`auth.users.banned_until` roughly 100 years out, permanently blocking
future sign-in without touching any other table. Verified live: the
deleted account was correctly blocked with "User is banned" on re-sign-in
attempt, and a second member's view of the deleter's old messages
correctly re-attributed them to "Deleted user" instead of breaking.

### Chat pagination and indexing at scale

Early on, every chat screen fetched a channel's **entire** message
history on every load and on every realtime event (a new message, a
reaction, a pin) — fine at low message counts, clearly not fine as a
channel's history grows. This was fixed in two stages:

1. **Cap and index** (task #27): the initial load and every
   realtime-triggered reload were capped to the latest 50 messages, and
   six missing foreign-key indexes were added across the schema (found by
   systematically cross-referencing every `.eq(...)` filter in the data
   layer against existing index coverage). The indexes weren't just added
   on faith — `EXPLAIN` was run against each query afterward to confirm
   Postgres was actually choosing to use the new index, not just that the
   DDL had run without error.
2. **Scroll-triggered "load earlier"** (task #28), a direct founder
   follow-up once the cap shipped and older messages became unreachable:
   `fetchMessages` gained a cursor-based `before` parameter, and the chat
   screen merges fetched pages into state **by message ID** rather than
   replacing state outright — specifically so a page of older messages a
   user has scrolled up into survives an unrelated realtime event (someone
   else reacting to a different, still-visible message) firing in the
   background. Pagination is triggered by `FlatList`'s `onStartReached` as
   the user scrolls, with no "Load more" button, per an explicit
   mid-build founder correction ("as I scroll up the old messages load").

## How the app is organized

The full, current file-by-file layout — every route, every `lib/*.ts`
module, every migration, and what each one is responsible for — is kept up
to date in [`SPEC.md`](./SPEC.md) (section 4, "Repo layout"), since that
file is auto-loaded into every AI-assisted development session on this
project and has to stay accurate. A few of the load-bearing pieces:

- **`app/`** — Expo Router file-based routes. Club-scoped screens all live
  under `app/(tabs)/clubs/[clubId]/`, with race- and Eboard-scoped screens
  nested further under `race/[raceId]/` and `eboard/`. Each nested area
  (`routines/`, `polls/`, `races/`, `eboard/`) is its own small `Stack`,
  following the same shape.
- **`components/ChatScreen.tsx` / `components/HighlightsScreen.tsx`** —
  the shared chat UI described above, reused across club, race, and
  Eboard chat.
- **`lib/*.ts`** — one plain-async-function module per feature area
  (`clubs.ts`, `messages.ts`, `races.ts`, `eboard.ts`, `carGroups.ts`,
  `polls.ts`, `routines.ts`, `calendarFeed.ts`, ...), each typed against
  the hand-written `types/database.ts` and called directly from screens.
  No ORM layer beyond `@supabase/supabase-js` itself.
- **`supabase/migrations/`** — 30 sequential SQL migrations, from the
  initial schema through account deletion and chat moderation. Nothing is
  edited in place after the fact; every schema change, including
  founder-driven follow-ups (e.g. restricting Eboard meeting edit/delete
  to the creator, added as its own migration right after the original
  feature shipped) is its own numbered file.
- **`docs/HISTORY.md`** — the full, task-by-task build narrative: every
  bug hit, its root cause, and its fix, in full detail. Deliberately kept
  *out* of the auto-loaded context (`SPEC.md` is auto-loaded;
  `docs/HISTORY.md` is not) so that resuming work in a new session doesn't
  have to pay the token cost of the entire build history up front, while
  still being one file read away when a past task needs to be revisited in
  depth.

## Current status

The core product — chat, club membership/roles, calendar, weekly
routines, the full race sub-flow with carpools, and polls — is fully
shipped and covered by an automated test suite (`jest-expo`) running in CI
on every push/PR (`tsc --noEmit` + `npm test`).

A self-directed "ready this for app/store review" audit then drove a
second wave of work: photo attachments in chat, self-service account
deletion, chat moderation (delete + report, with an admin-only "Reports"
queue), and in-app Privacy Policy/Terms screens (reachable both
signed-out, from sign-up, and signed-in, from Profile). Bundle
identifiers and an `eas.json` build config are in place; the remaining
step there (`eas login` / `eas init`) requires the founder's own
interactive Expo account and hasn't been attempted autonomously. A
platform-required App Store privacy label / Google Play Data Safety form
is intentionally left until submission time, since its answers depend on
the shipped build's final behavior.

Known open gaps, tracked deliberately rather than silently deferred: no
accessibility labels yet, a hand-written (not generated) database type
file pending a real hosted Supabase project to regenerate against, no
error monitoring (e.g. Sentry), and no push notifications or OTA update
wiring (`expo-updates`) — the last of which matters more for real
day-to-day retention on a chat app than it does for store approval itself.

## What this project demonstrates

- **Translating a messy, real-world manual workflow into a clean
  relational domain model** — turning "screenshot an Excel sheet into
  chat" and "make a new GroupMe per race" into `RoutineWorkout` and a
  nested `Race` that reuses the parent club's own membership and chat
  primitives.
- **Making and defending non-obvious architecture decisions that paid off
  later** — the generic `channels` table, Postgres/RLS over a document
  store — decisions that were justified *before* they paid off, and did in
  fact pay off exactly as predicted when the race and Eboard features were
  built on top of them.
- **Real production concerns beyond "the feature works"** — row-level
  security correctness, pagination and indexing at scale, moderation,
  privacy/compliance (account deletion, Privacy Policy/Terms), and
  continuous integration.
- **Debugging discipline.** The RLS incident is the clearest example: a
  problem that looked catastrophic and platform-wide, reproduced across
  multiple projects, coinciding with an actual unrelated outage — and
  which turned out to be a single missing SELECT policy, found by
  systematically ruling out everything else first rather than guessing.

## Local development

Supabase currently runs **locally via Docker**, not on Supabase's hosted
cloud — a deliberate pivot made after the RLS debugging incident above
coincided with an unrelated active Supabase cloud outage. Nothing about
the schema or application code depends on this; it's purely where `.env`
currently points, and moving back to a hosted project is a matter of
replaying the migrations and swapping two environment variables.

```bash
# One-time setup
brew install supabase/tap/supabase
supabase init

# Start the local stack (Postgres + Auth + Storage + Realtime, via Docker)
supabase start
# → prints ANON_KEY/PUBLISHABLE_KEY and API_URL; mirror these into .env

# Re-apply all migrations from scratch against local Postgres
supabase db reset

# Run the app
npx expo start        # press w for web, or scan the QR code for native
```

`.env` (local):

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

Local Supabase auto-confirms email signups (no email-confirmation gate),
which makes local testing considerably faster than against a hosted
project.

For the full engineering handoff — domain model detail, per-task build
history, every RLS/navigation gotcha hit and how it was fixed, and exactly
what's left to do — see [`SPEC.md`](./SPEC.md) and
[`docs/HISTORY.md`](./docs/HISTORY.md).
