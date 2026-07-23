# ClubChat — Project Spec & Handoff

This file is the single source of truth for what ClubChat is, why it's
shaped the way it is, and what's next. Read this before making
architectural decisions or resuming work in a new session.

**This file is kept deliberately compact** because CLAUDE.md `@`-includes
it into every session's context. Full task-by-task build narrative (every
bug hit, every root cause, every fix, in full detail) lives in
`docs/HISTORY.md`, which is *not* auto-loaded — Read it directly when a
one-line status-table summary below isn't enough detail. Section 4 below
follows the same rule: it documents current architecture only, not how
each file got there — for the build story behind any file, check
`docs/HISTORY.md`'s entry for the task named in section 5's status table.
Add new detailed entries to `docs/HISTORY.md` as work progresses; keep
this file's summaries short.

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
  - **Chat**: text, photos, reactions, announcements, polls, pinning.
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
**Race sub-flow** (sub-chat, workout, carpool, results), then polls
as a final layer.

## 2. Domain model

```
User (auth.users + profiles)
 └─ Club  (top-level container, has an invite_code + join_policy)
     ├─ ClubMember (user_id, role: owner | admin | member — task #42;
     │              exactly one owner per club at all times, enforced by
     │              a DB-level unique index, transferable via a
     │              transfer_ownership RPC)
     ├─ ClubJoinRequest (user_id, status: pending | approved | denied —
     │                   only used when join_policy = 'request')
     ├─ Channel (club-scoped by default; a race-scoped Channel has a
     │           non-null race_id, an eboard-scoped one a non-null
     │           eboard_channel_id, instead — see Race/EboardChannel below)
     │   └─ Message (text | photo | announcement | system | document,
     │       pinned, reactions — `document` added task after #47's
     │       WhatsApp-style "+" attach menu: any file type, media_url
     │       reused for the storage path same as `photo`, plus
     │       document_name/document_size_bytes for display. Club chat
     │       only for now — race/Eboard chat keep the old single-icon
     │       photo-only composer unchanged until extended there too.)
     ├─ CalendarEvent (type: race | practice | team_bonding | volunteer | other
     │                 — the "race" type here is unrelated to Race below;
     │                 it's just a calendar entry, no link between them)
     ├─ RoutineWorkout (dated weekly workout: activity_type run | swim |
     │                   ... [10 types total, see lib/routines.ts],
     │                   title, description — deliberately no structured
     │                   exercise sub-table, per an explicit "keep it very
     │                   simple" scoping call)
     ├─ ClubPost (News & Highlights, task after #47's club-hub restructure
     │            — a standalone admin-post feed, deliberately separate
     │            from chat's pinned/announcements: body text and/or a
     │            photo, reverse-chronological. Any club admin can
     │            create/edit/delete any post — mirrors Race Meet Info/
     │            Routines/Events' "any admin" model, not Eboard
     │            Meetings' creator-only one, confirmed explicitly via
     │            AskUserQuestion rather than assumed by analogy.
     │            ClubPostReaction mirrors MessageReaction's shape
     │            exactly, scoped to the post's club. Creating a post
     │            notifies every other club member, same fan-out pattern
     │            as poll/event/race/meeting creation.)
     │   └─ ClubPostReaction (post_id, user_id, emoji — unique per emoji
     │       per user per post)
     ├─ Poll (task #24 — question + N options, admin-created; per-poll
     │        toggles for allow_multiple and is_private. Vote counts are
     │        always public (denormalized on PollOption, trigger-
     │        maintained); voter *identity* is RLS-gated to the creator
     │        on a private poll, everyone on a public one — a voter
     │        always sees their own vote either way. Close/reopen/delete
     │        are creator-only, mirroring EboardMeeting rather than
     │        Race/RoutineWorkout's "any club admin" pattern. task #45 —
     │        a `closing_soon_notified_at` dedup timestamp backs a
     │        `poll_closing_soon` notification, fanned out to everyone
     │        who can access the poll [creator included, unlike
     │        creation notifications] once it's within 10 minutes of its
     │        own `closes_at` — the app's first scheduled job, via
     │        pg_cron, since nothing else in the schema changes at that
     │        moment for a trigger to react to.)
     │   ├─ PollOption (text, position, vote_count)
     │   └─ PollVote (poll_id, option_id, user_id — unique per option per
     │       user; cast/toggled/moved via the cast_vote RPC)
     ├─ Race (mini-club nested under Club, task #16 — always request-based
     │        access, no "open" policy like Club's join_policy: a club
     │        member requests, any club admin can approve or add directly.
     │        No separate "race admin" role — club admins already have
     │        full access to every race under their club.)
     │   ├─ RaceMember (user_id — approved roster; admins aren't listed
     │   │              here, is_club_admin already covers them)
     │   ├─ RaceJoinRequest (user_id, status: pending | approved | denied)
     │   ├─ its own Channel/Messages (same generic Channel/Message tables
     │   │   as the club's main chat — full feature parity, incl. pins/
     │   │   reactions/announcements/system messages, comes for free)
     │   ├─ "Meet Information" (tasks #20/#21, merged into one section by
     │   │   a task #22 founder follow-up right after both shipped
     │   │   separately) — 5 nullable text columns directly on races, no
     │   │   new table: info_description, location_link, hotel_link,
     │   │   photos_link, results_link. All 5 edited together as one
     │   │   combined form, any club admin can edit [not creator-
     │   │   restricted, unlike Eboard meetings]. View-mode empty-state
     │   │   deliberately differs per field: description/location/hotel
     │   │   are hidden entirely with no placeholder when empty, while
     │   │   photos/results keep a "stay tuned" placeholder — an explicit
     │   │   founder choice, not an inconsistency.
     │   └─ RaceCarGroup (task #19, from a founder wireframe — auto-
     │       numbered groups, "Group 1"/"Group 2"/..., no naming prompt.
     │       Membership scoped to who already has race access (roster +
     │       club admins), one group per person per race, admin-only to
     │       manage; everyone with race access can view read-only,
     │       including the Incharge tag.)
     │       ├─ RaceCarGroupMember (user_id — unique per race, not just
     │       │   per group, so a person can't be in two groups at once)
     │       └─ one designated Incharge per group (must be a current
     │           member of that group; cleared automatically if that
     │           member is removed)
     └─ EboardChannel (exactly one per club, task #17, from a founder
                 wireframe — a private mini-club for club admins only.
                 Deliberately NOT shaped like Race: being a club admin
                 only grants *visibility* of this row and eligibility to
                 request/be added, not automatic membership — an admin
                 still has to request or be added by an existing member.
                 Approve/direct-add rights belong to existing members,
                 not to "any club admin" the way Race's do. Every member
                 is guaranteed to already be a club admin, so no separate
                 "eboard admin" role is needed once inside.)
         ├─ EboardChannelMember (user_id — approved roster, always a
         │                       subset of club admins)
         ├─ EboardChannelJoinRequest (user_id, status: pending | approved
         │                            | denied)
         ├─ its own Channel/Messages (same generic tables, full parity)
         └─ EboardMeeting (task #18 — title, description, meeting_link,
                           meeting_at; any eboard member can create, but
                           only the creator can edit or delete — two
                           founder follow-ups after task #18 shipped —
                           everyone else is view-only, and the detail
                           view shows "Added by <name>")
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
`join_policy`. Task #55 built the shareable join link this was always
meant to become: `lib/clubs.ts`'s `buildClubJoinLink` wraps the same
code in a `clubchat://` deep link that `/clubs/join` auto-consumes.

**Notification** (task #35 — a `User`-scoped row, not nested under
`Club` in the tree above since one user's notifications span every club
they belong to) — `recipient_id`, `actor_id`, `club_id`, `type` (13
values: the 3 admin/Eboard-member join-request-pending types, request
approved/denied, member added/removed/role-changed, poll/event/race/
meeting created, announcement), `body`, a literal `target_path` route
string (not a pile of nullable per-type foreign keys — every consumer
just does `router.push(target_path)`), `resolved_outcome` (nullable,
`approved | denied` — only ever set on the 3 admin-inbox request types,
once decided; the notification stays visible as history, tagged with
the outcome, rather than being deleted), `read_at`. Written exclusively
by `security definer` trigger functions extending the same triggers
that already post in-chat system messages for these exact events (join/
leave/add/remove/promote/demote), plus new triggers on the 3
`*_join_requests` tables and on `polls`/`calendar_events`/`races`/
`eboard_meetings`/`messages` (the last filtered to
`message_type = 'announcement'` — a plain pin, a later `UPDATE` of the
separate `pinned` boolean, never touches this trigger at all). A
sibling **ChannelRead** table (`channel_id`, `user_id`, `last_read_at`)
is deliberately *not* part of `notifications` — a channel's "N unread
messages" is computed live via `fetch_unread_channel_summaries()`
rather than stored as discrete rows, so it can never drift out of sync
with `messages`, and it only ever advances when the user actually opens
that channel (opening the Notifications tab itself never touches it).

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

Current-state architecture reference only. For how any of this came to
be — bugs found, scope changes, verification narrative — see the
matching task number in section 5's status table and its writeup in
`docs/HISTORY.md`.

```
app/                          Expo Router file-based routes
  _layout.tsx                 Root layout: auth-guard redirect logic
  (auth)/sign-in.tsx          Supabase Auth sign-in form
  (auth)/sign-up.tsx          Supabase Auth sign-up form (handles
                               email-confirmation-required state); a
                               consent line below the password field
                               links to privacy-policy/terms.
  (auth)/privacy-policy.tsx    Signed-out-reachable Privacy Policy/Terms,
  (auth)/terms.tsx              thin wrappers around
                               components/LegalDocument.tsx. Exist as
                               their own pair (not shared with
                               (tabs)/profile/'s versions) because
                               app/_layout.tsx's auth guard redirects by
                               top-level route group — one route can't
                               serve both a signed-out and signed-in
                               visitor without getting bounced.
  (tabs)/_layout.tsx           Bottom tabs: Clubs, Calendar, Notifications,
                               Profile (task after #47's club-hub
                               restructure added Calendar as a real tab)
                               — bell icon + a native `tabBarBadge`
                               sourced from `useNotifications()`. The
                               Clubs tab's `tabPress` listener reads
                               `useCurrentClub()` (contexts/
                               CurrentClubProvider.tsx): no active club ->
                               resets to the Main list as before; an
                               active club whose hub isn't already the
                               current screen -> jumps straight to that
                               club's hub (`?from=clubsTab`); already on
                               that hub -> Main list. Mirrors the same
                               `?from=profile` "no real back history"
                               pattern (section 6) rather than trusting
                               `canGoBack()`.
  (tabs)/calendar.tsx           The Calendar tab. Reads `useCurrentClub()`
                                 and mounts shared components/
                                 CalendarScreen.tsx in `mode: "club"` (that
                                 club's own feed, admin create FAB) when a
                                 club is active, or `mode: "global"`
                                 (every club the caller belongs to,
                                 merged via lib/calendarFeed.ts's
                                 `fetchGlobalCalendarFeed`, each row
                                 tagged with its club name, read-only — no
                                 FAB, since creating an event is
                                 inherently club-scoped) otherwise.
  (tabs)/notifications.tsx      The Notifications feed, a single
                                 top-level screen (no nested stack — every
                                 row just `router.push`es elsewhere).
                                 Merges `notifications` rows with live
                                 per-channel unread-chat summaries into
                                 one reverse-chronological list
                                 (`lib/notifications.ts`'s
                                 `fetchNotificationFeed`), paginated
                                 20-at-a-time via `FlatList`'s
                                 `onEndReached`. On focus, marks every
                                 visible discrete notification read
                                 (badge clears) but never touches
                                 chat-unread rows — those only clear by
                                 actually opening that chat. A resolved
                                 join-request shows an "Approved"/
                                 "Denied" pill instead of disappearing.
  (tabs)/profile/_layout.tsx    Stack: profile view + edit modal +
                                 privacy-policy/terms. `‹` headerLeft,
                                 fallback -> /clubs
  (tabs)/profile/index.tsx      Profile view — avatar (tap pencil overlay
                                 to upload), name/email, bio, "Your clubs"
                                 (tap -> club hub), Privacy Policy/Terms
                                 links, sign out, delete account
  (tabs)/profile/edit.tsx        Self-only edit form (name, bio, city,
                                 date of birth, school) — modal
  (tabs)/profile/privacy-policy.tsx  Signed-in-reachable counterparts to
  (tabs)/profile/terms.tsx            the (auth)/ pair above, same shared
                                 LegalDocument content.
  (tabs)/clubs/_layout.tsx      Stack: clubs list + club detail
  (tabs)/clubs/index.tsx        List of the user's clubs (role badge),
                                 tap -> club hub (`/clubs/${id}`)
  (tabs)/clubs/create.tsx       Club creation form (name/sport/description
                                 + join-policy picker: open vs request)
  (tabs)/clubs/join.tsx         Join form — invite code, or "Find a club"
                                 (debounced search-by-name + join/request)
  (tabs)/clubs/[clubId]/_layout.tsx
                                Fetches club + this user's role once,
                                exposes via `useClub()` context
                                (`isAdmin`/`isOwner` derived booleans).
                                Registers index/chat/calendar/routines/
                                polls/races/highlights/club-profile/
                                member/event/race as Stack screens,
                                sharing one `clubScreenOptions` object
                                (tappable club-name headerTitle ->
                                club-profile, admin-only invite-code
                                headerRight) plus per-screen `headerLeft`
                                via `makeBackHeaderLeft` (see
                                components/BackHeaderButton.tsx) since
                                direct URL nav/refresh leaves no back
                                history for the native button to use.
  (tabs)/clubs/[clubId]/index.tsx
                                Hub screen — restructured (task after #47,
                                founder wireframe) from the original flat
                                row-per-feature list down to one
                                continuous panel (circular icon avatars,
                                thin dividers instead of per-row bordered
                                cards — a later founder-referenced restyle
                                against a Telegram-style group list):
                                News & Highlights, Club Main Chat, and a
                                Races & Meets section showing up to 5
                                upcoming races, each with its own round
                                avatar/letter-fallback (no date shown —
                                sort order stays chronological
                                regardless), a per-user pin (⋮ menu, open
                                to every member — see lib/races.ts's
                                `race_pins`) with the pin icon at the
                                row's right end, and a "See all" that
                                opens a small search-over-every-race popup
                                instead of navigating to a new screen.
                                Wrapped in a `ScrollView` — a real bug a
                                founder screenshot caught live, the bigger
                                5-row preview could push the "Add Group"
                                button below the fold with nothing to
                                scroll it into view. Routines/Polls/Eboard
                                & Council are deliberately unlinked from
                                here (routes/RLS untouched, just pending a
                                decision on where they land next — an
                                explicit founder call against a stopgap
                                "More" menu). Landing point when entering a
                                club. Handles `?from=profile` (Profile tab
                                cross-tab entry) and `?from=clubsTab` (the
                                Clubs tab's own shortcut, below) — both
                                override the header back button to skip
                                `canGoBack()` entirely, same class of "no
                                real back history for this navigation"
                                gotcha (section 6).
  (tabs)/clubs/[clubId]/chat.tsx
                                Thin wrapper around shared
                                components/ChatScreen.tsx, passing
                                `attachMenu` (Poll/Event create paths) and
                                `headerMenu` (Members/Poll/Routines/
                                Events quick-nav) — race/Eboard chat get
                                their own equivalents now too (task after
                                #47's chat-first nav rework, see section
                                5), scoped to what each concept actually
                                has (race: Poll only; Eboard: Poll +
                                Meeting).
  (tabs)/clubs/[clubId]/calendar.tsx
                                Thin wrapper around shared
                                components/CalendarScreen.tsx (`mode:
                                "club"`) — same merged Upcoming/Past feed
                                as always (lib/calendarFeed.ts), just
                                extracted so `(tabs)/calendar.tsx` below
                                can mount the identical UI in its own
                                "no club active" global mode.
  (tabs)/clubs/[clubId]/highlights.tsx
                                Thin wrapper around shared
                                components/HighlightsScreen.tsx — Pinned/
                                Announcements tabs over the same message
                                data chat already fetches. No longer
                                linked from the hub (News & Highlights
                                took that slot, see news/ below) — still
                                reachable via ChatScreen's "Highlights"
                                pill.
  (tabs)/clubs/[clubId]/news/
                                News & Highlights — own nested Stack
                                (same shape as routines/). A standalone
                                admin-post feed (lib/clubPosts.ts),
                                deliberately separate from chat's pinned/
                                announcements. `index.tsx`: reverse-
                                chronological feed cards (optional photo,
                                body, creator name/avatar/time, emoji
                                reactions mirroring ChatScreen's compact
                                picker), admin-only Edit/Delete per post,
                                admin-only FAB. `create.tsx`: create/edit
                                form (photo picker reuses ChatScreen's
                                pickImageOnWeb/expo-image-picker pattern
                                + a caption textarea; requires at least
                                one of the two) — `?postId=` query param
                                reuses this same screen for editing,
                                mirroring event/create.tsx's convention.
  (tabs)/clubs/[clubId]/routines/
                                Weekly routines — own nested Stack.
                                `index.tsx`: Mon-Sun view for a real
                                calendar week (not a repeating template),
                                `‹`/`›` week paging, only today+future days
                                shown, per-day workout cards or "Rest
                                day", admin-only "+ Add workout".
                                `activity-type.tsx`: admin-only picker, 10
                                types (`lib/routines.ts`'s
                                `ACTIVITY_TYPES`). `workout/create.tsx`:
                                admin-only create/edit — title +
                                description only, deliberately no
                                exercise builder. `workout/[workoutId]
                                .tsx`: detail view, read-only for members,
                                Edit/Delete for admins. No completion
                                tracking.
  (tabs)/clubs/[clubId]/polls/
                                Own nested Stack (same shape as races/).
                                All 3 screens are thin wrappers around
                                shared components/PollsListScreen.tsx /
                                PollDetailScreen.tsx / PollCreateScreen.tsx,
                                passing `scope: { type: "club", clubId }`
                                — race/ and eboard/ (below) mount the same
                                components with their own scope instead of
                                forking two more copies. `index.tsx`:
                                ALL POLLS/MY VOTES segmented tabs, hero
                                card for an open poll (countdown badge
                                when `closesAt` is set) vs. a muted
                                "CLOSED" card, "Have a new idea?" prompt +
                                FAB (`canCreate`-gated). `create.tsx`:
                                question + 2-10 free-text options + two
                                Switch toggles (allow-multiple, private
                                vote) + an "Ends" row (duration chips: 1
                                Day/3 Days/1 Week/Custom/No deadline,
                                Custom taking an amount + Min/Hrs/Days
                                unit chip — computed into `closesAt`
                                client-side at submit time).
                                `[pollId].tsx`: vote by tapping an option
                                (toggles off if already selected, moves
                                the vote on a single-choice poll), counts
                                always shown, per-option eye icon (once
                                that option has ≥1 vote and the caller
                                can see voters) opens a popup with a
                                switchable per-option voter list
                                (avatar + name); creator-only Close/
                                Reopen/Delete; voting disabled once
                                `isPollEffectivelyClosed`.
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
                                "Races & Meets" list, own nested Stack
                                (same shape as routines/). `index.tsx`:
                                Upcoming/Finished grouped list (mirrors
                                calendar.tsx); each row shows a chevron
                                (enter) for members/managers, "Requested"
                                for a pending request, or a "Request to
                                join" button otherwise — always
                                request-based, no "open" policy.
                                `create.tsx`: admin-only, name +
                                event_date only (`YYYY-MM-DD`) —
                                standalone, not tied to a calendar event.
  (tabs)/clubs/[clubId]/race/[raceId]/
                                A race's own space, own nested Stack.
                                `_layout.tsx` fetches the race + this
                                user's access once (`useRace()` context),
                                exposing `isManager` (club Admin/Owner —
                                management authority: approve requests,
                                add/remove roster, edit Meet Information)
                                separately from `isMember` (a real
                                `race_members` row, required for chat/hub
                                access — as of task #42/#44, even the
                                Owner needs to request or be added, no
                                more automatic chat access). A manager
                                who isn't a member sees "Request to join"
                                + a "Manage roster" entry point, not the
                                full hub; anyone with neither is
                                redirected to the races list. `index.tsx`:
                                no more member-only grid (task after #47's
                                chat-first nav rework, same session as
                                Eboard's below) — a member is redirected
                                straight to `/chat` on mount; this screen's
                                only remaining job is the not-yet-a-member
                                states above. `chat.tsx`/`highlights.tsx`:
                                thin wrappers around the same shared
                                components club chat uses — full feature
                                parity for free, gated on `isMember` with
                                a direct-URL guard. `chat.tsx` passes
                                `attachMenu={{ createPollPath }}` (no
                                Event/Meeting — race has no such concept)
                                and `headerMenu` pointing at Meet
                                Information/Polls/Car Assignments & Groups
                                — the same 3 rows `index.tsx`'s grid used
                                to hold, now reached from chat instead;
                                `backFallback` points at the races list,
                                not `index.tsx` (which would just bounce
                                a member straight back here).
                                `location.tsx` ("Meet Information", route
                                name unchanged though the label isn't
                                "location" anymore): 5 fields — description,
                                race/event location link, hotel link,
                                photos link, result link — all on
                                `races`, no new table, edited together as
                                one combined form. Empty-state deliberately
                                differs per field: description/location/
                                hotel are hidden entirely (no placeholder)
                                when empty, photos/results keep a "stay
                                tuned" placeholder. Any manager can edit
                                all 5 fields. `carpool.tsx`: Car
                                Assignments & Groups — admin-only
                                "+ Add Group" creates an auto-numbered
                                group immediately (no naming prompt); each
                                group card lists members with an inline
                                admin-only "+ Add member" search (scoped
                                to who already has real race access —
                                roster + managers who are actual members —
                                excluding anyone already in any group for
                                this race, one-group-per-person); per-
                                member "Make/Remove Incharge" and
                                "Remove" buttons, admin-only; a per-group
                                admin-only "Delete" button (confirm-
                                gated). Regular race members see the same
                                cards read-only, Incharge tag included.
                                `polls/{index,create,[pollId]}.tsx`: thin
                                wrappers around the same shared
                                components/PollsListScreen.tsx/etc. club
                                polls uses, `scope: { type: "race",
                                clubId, raceId }`. `canCreate =
                                race.isManager && race.isMember` (task
                                #46 — race polls now require a real
                                roster row to see or create at all,
                                matching Eboard's model; a manager who
                                hasn't joined the race can't reach this
                                even via direct URL, since the RLS layer
                                itself blocks it, not just the client
                                gate). Reached via a "Polls" row on the
                                race hub (already only shown once
                                `race.isMember`, so this brought Polls in
                                line with every other hub row instead of
                                being the one exception). `roster.tsx`: reached by
                                tapping the race name in the header —
                                pending-requests approve/deny, add-member
                                (search scoped to this club's own roster),
                                member list with admin-only "Remove"
                                (removing a member who is also a club
                                admin/owner is Owner-only, see task #41/
                                #42's permission matrix). No separate
                                "race admin" role — club Admin/Owner
                                already has management authority over
                                every race under their club, but must
                                still join to chat.
  (tabs)/clubs/[clubId]/eboard/
                                "Eboard & Council", a private mini-club
                                for club admins only, exactly one per
                                club (no list, unlike races/). Own nested
                                Stack: `_layout.tsx` gates on club.isAdmin
                                (redirects a non-admin hitting the URL
                                directly) and fetches the club's eboard
                                channel (if any) + this user's membership/
                                request status, exposed via `useEboard()`.
                                `index.tsx` branches on that: no channel
                                yet -> admin sees a "+ Create" prompt;
                                channel exists but not a member -> name/
                                description + Request-to-join/Requested;
                                a member -> redirected straight to `/chat`
                                on mount (task after #47's chat-first nav
                                rework — no more member-only hub grid;
                                Meetings/Polls are reached from chat's own
                                header quick-nav grid instead, Chat being
                                the screen itself). `create.tsx`: name +
                                description (no date field). `chat.tsx`:
                                passes `attachMenu={{ createPollPath,
                                createMeetingPath }}` (any Eboard member
                                can create either — `isAdmin` is
                                unconditionally true here, see below) and
                                `headerMenu` pointing at Meetings/Polls —
                                the same 2 rows `index.tsx`'s old hub grid
                                used to hold; `backFallback` points at the
                                club hub, not `index.tsx` (which would
                                just bounce a member straight back here).
                                `highlights.tsx`: thin wrapper around the
                                same shared components club/race chat use.
                                `meetings.tsx`: Upcoming/Past list (same
                                shape as calendar.tsx), any member can
                                create. `meeting/create.tsx`: title,
                                description, date+time (plain YYYY-MM-DD +
                                HH:MM fields), link (Zoom/Meet/etc,
                                optional); redirects away if a non-creator
                                hits an edit URL directly; `?from=chat`
                                (appended when reached from chat's "+")
                                lands back on `/eboard/chat` after saving
                                instead of the new meeting's own detail
                                screen, mirroring event/create.tsx's same
                                convention — redundant with the chat card
                                the creation already auto-posts (0077).
                                `meeting/[meetingId].tsx`: detail view;
                                Edit/Delete only render for the creator,
                                "Added by <name>", tappable link opens via
                                `Linking.openURL`.
                                `polls/{index,create,[pollId]}.tsx`: thin
                                wrappers around the same shared
                                components/PollsListScreen.tsx/etc. club/
                                race polls use, `scope: { type: "eboard",
                                clubId, eboardChannelId }`. `canCreate` is
                                unconditionally true (any Eboard member,
                                mirroring Eboard Meetings' own rule).
                                `roster.tsx`: pending requests + add-
                                member (search scoped to this club's own
                                admins), gated on the *caller* already
                                being a member — not on club-admin status
                                the way races/roster.tsx gates on it.
                                Removing a member who is also a club
                                admin/owner is Owner-only (task #41/#42).

components/BackHeaderButton.tsx  makeBackHeaderLeft(router, fallback) —
                                 shared `‹` headerLeft factory
                                 (canGoBack() ? back() : replace(fallback))
                                 used by every club-scoped Stack layout.
components/ChatScreen.tsx       Chat UI/logic (messages, reactions, pin/
                                 announce, pinned strip, Highlights
                                 button, auto-scroll, bottom-tab hiding —
                                 see task after #47) shared by club/race/
                                 Eboard chat. Parametrized by
                                 `channelId`/`isAdmin`/`memberPath`/
                                 `highlightsPath`/`titlePath`/
                                 `backFallback`/`fetchMentionCandidates`,
                                 plus optional props: `attachMenu`
                                 ({createPollPath?, createEventPath?,
                                 createMeetingPath?} — club passes Poll+
                                 Event, race passes Poll only, Eboard
                                 passes Poll+Meeting; task after #47's
                                 chat-first Eboard/Race nav rework
                                 extended this beyond its original
                                 club-chat-only scoping, see section 5's
                                 narrative) and `headerMenu`
                                 ({label,path,icon}[] — club points at
                                 Poll/Routines/Events, race at Meet
                                 Information/Polls/Car Assignments &
                                 Groups, Eboard at Meetings/Polls; each is
                                 the same set of rows that scope's own hub
                                 grid used to hold before members started
                                 being redirected straight into chat).
                                 Custom glass-blur header (`expo-blur`)
                                 with a tappable title (jumps to
                                 club-profile/race roster/eboard roster),
                                 Highlights pill, current-user avatar, and
                                 — only when `headerMenu` is passed — a
                                 grid icon opening a small dropdown of
                                 quick-nav links. Composer's "+" branches
                                 on `attachMenu`: undefined keeps the
                                 original single photo-picker icon; when
                                 present it's a WhatsApp-style expandable
                                 grid (Photos/Camera/Document always, each
                                 create-action admin-gated via `isAdmin`
                                 and only rendered when its path prop is
                                 set) — tapping the icon again (now
                                 showing a keyboard glyph) or focusing the
                                 text input collapses it back. Document
                                 attachments render as a tap-to-open
                                 bubble (filename + size, opens the
                                 signed URL via `Linking.openURL`); photo
                                 rendering + tap-to-fullscreen Modal
                                 viewer unchanged. `poll`/`event`/
                                 `meeting` messages
                                 (0071_poll_event_chat_messages.sql,
                                 0077_race_eboard_poll_meeting_chat_
                                 messages.sql) render as PollMessageCard/
                                 EventMessageCard/MeetingMessageCard — a
                                 poll bubble is fully votable inline
                                 (reuses lib/polls.ts's castVote/
                                 fetchPoll directly, so allow_multiple/
                                 is_private/closed/deadline behavior is
                                 identical to the full PollDetailScreen,
                                 not a parallel simplified copy) with a
                                 "View Poll" link for what doesn't fit
                                 inline (voter list, creator close/
                                 reopen/delete); an event/meeting bubble
                                 is a plain title/date(/location) card
                                 with a "View Event"/"View Meeting"
                                 button (no RSVP concept in this app).
                                 Poll/event/meeting data for these cards
                                 is hydrated by a `useEffect` keyed on the
                                 message list (`resolveEventPath`/
                                 `resolveMeetingPath` props resolve where
                                 those two links navigate — polls need no
                                 equivalent, the inline card is the full
                                 UI already; only club chat passes
                                 `resolveEventPath`, only Eboard chat
                                 passes `resolveMeetingPath`, matching
                                 each concept's own scoping). Per-message
                                 Delete
                                 (sender or channel admin) and Report
                                 (anyone else), with a "This message was
                                 deleted" tombstone render when
                                 `deletedAt` is set. Sent-message bubbles
                                 use an `expo-linear-gradient` fill; the
                                 pinned strip is a floating, locally-
                                 dismissible overlay (doesn't unpin);
                                 announcement toggle is a compact
                                 megaphone icon in the input row (not a
                                 full-width banner). Reads its own
                                 `?messageId=` search param (appended by
                                 HighlightsScreen's now-tappable rows) to
                                 jump to and briefly highlight a specific
                                 message — loads a `fetchMessagesAround`
                                 window instead of the plain newest-page
                                 when set, and suppresses the normal
                                 scroll-to-bottom default entirely while
                                 it's set, so viewing old history isn't
                                 yanked back to the tail by a realtime
                                 reload merging in new messages. See
                                 section 6 for two real FlatList bugs
                                 (`scrollToIndex`/`onContentSizeChange`)
                                 hit and fixed building this.
components/HighlightsScreen.tsx  Same extraction, for the Pinned/
                                 Announcements screen — Pinned/
                                 Announcements/admin-only "Reports (N)"
                                 (`isAdmin` prop) tabs, photo-message
                                 rendering, same custom glass header as
                                 ChatScreen (`backFallback` prop). Every
                                 row (Pinned/Announcements/Reports) is
                                 tappable, jumping to that exact message
                                 in chat via `${backFallback}?messageId=
                                 ${item.id}` — `backFallback` already
                                 equals that scope's own chat route in
                                 all 3 call sites, so no new prop was
                                 needed. The avatar tap (member profile)
                                 and Reports' Delete/Dismiss buttons stay
                                 independent via `stopPropagation` on the
                                 now-outer-Touchable row.
components/CalendarScreen.tsx    Extracted from the old per-club-only
                                 calendar.tsx (task after #47's Calendar
                                 tab) — `mode: "club"` (clubId + isAdmin,
                                 admin create FAB) or `mode: "global"`
                                 (every club merged, read-only, each row's
                                 badge row also shows `item.clubName`).
                                 Mounted by both `clubs/[clubId]/
                                 calendar.tsx` and `(tabs)/calendar.tsx`.
components/PollsListScreen.tsx   Shared Polls list ("Stitch Poll"
                                 design, theme.ts tokens). ALL POLLS/MY
                                 VOTES segmented tabs, hero card for an
                                 open poll (countdown badge via
                                 lib/dates.ts's formatCountdown) vs. a
                                 muted "CLOSED" card, "Have a new idea?"
                                 prompt + FAB (both `canCreate`-gated).
                                 Props: `scope: PollScope`, `canCreate`,
                                 `createPath`, `pollPath(id)` — club/
                                 race/Eboard polls all mount this one
                                 component instead of forking three
                                 copies.
components/PollDetailScreen.tsx  Shared vote/detail screen. Voting
                                 disabled once `isPollEffectivelyClosed`
                                 (lib/polls.ts), mirroring the same check
                                 enforced server-side. Per-option eye
                                 icon (visible once that option has ≥1
                                 vote and `canSeeVoters`) opens a `Modal`
                                 voter-list popup, switchable by option;
                                 nested-`TouchableOpacity` tap calls
                                 `e.stopPropagation?.()` so opening the
                                 popup doesn't also toggle the vote.
components/PollCreateScreen.tsx  Shared create form. "Ends" section:
                                 duration chips (1 Day/3 Days/1 Week/
                                 Custom/No deadline); Custom takes an
                                 amount plus a Min/Hrs/Days unit-chip row
                                 (defaults to Hrs). `closesAt` computed
                                 client-side at submit time.
components/LegalDocument.tsx     Shared renderer for a title +
                                 `{heading, body}[]` sections array (see
                                 lib/legalContent.ts), used by both the
                                 (auth)/ and (tabs)/profile/
                                 privacy-policy.tsx/terms.tsx pairs.
components/ThemedSwitch.tsx      Wraps RN's `Switch` with explicit
                                 `trackColor`/`thumbColor`/
                                 `activeThumbColor`/`ios_backgroundColor`
                                 defaults from the theme — react-native-
                                 web's `Switch` otherwise defaults its
                                 "on" thumb to teal regardless of the
                                 app's own primary color. `Switch as
                                 ComponentType<any>` cast since those
                                 props aren't in RN's bundled types even
                                 though react-native-web supports them.
contexts/AuthProvider.tsx      Wraps supabase.auth session state
contexts/NotificationsProvider.tsx  Same shape as AuthProvider, nested
                                 inside it in app/_layout.tsx since it
                                 needs the session's userId. Holds a live
                                 `unreadCount`, subscribed via realtime,
                                 exposed app-wide via `useNotifications()`
                                 so the tab-bar badge and ChatScreen's
                                 post-markChannelRead refetch both work
                                 from outside the Notifications screen
                                 itself.
contexts/CurrentClubProvider.tsx  Nested alongside NotificationsProvider
                                 in app/_layout.tsx (task after #47's
                                 Calendar tab / Clubs-tab shortcut). Holds
                                 `{ clubId, name, isAdmin } | null`,
                                 written solely by clubs/[clubId]/
                                 _layout.tsx (set once the club loads,
                                 cleared on unmount — i.e. leaving that
                                 club's stack from anywhere nested under
                                 it, not just the hub screen). Read by
                                 `(tabs)/calendar.tsx` and the Clubs tab's
                                 own `tabPress` listener, both of which
                                 sit outside the club's own Stack and have
                                 no other way to know "which club is
                                 currently active."
lib/supabase.ts                Supabase client (reads EXPO_PUBLIC_* env vars)
lib/clubs.ts                   fetchMyClubs / createClub / joinClubByCode /
                                 searchClubs / joinOrRequestClub /
                                 fetchClubProfile / updateClubProfile /
                                 uploadClubAvatar / deleteClub
lib/messages.ts                 fetchMessages(channelId, options?: {limit?:
                                 number; before?: string}) — no-args call
                                 (used by HighlightsScreen) fetches full
                                 history; a limit fetches only the newest
                                 N (ChatScreen's initial load/realtime
                                 reload, merged not replaced into state);
                                 limit+before fetches the next older page
                                 before that cursor, powering ChatScreen's
                                 scroll-up-to-load-more via FlatList's
                                 onStartReached / sendMessage / reactions
                                 / realtime subscription — chat backend,
                                 channel-agnostic. fetchMessagesAround
                                 (channelId, targetMessageId) — powers
                                 Highlights' "jump to this message,"
                                 fetching a window centered on it (≤50
                                 at-or-before + ≤50 strictly after)
                                 instead of the plain newest-N page, since
                                 the target is often well outside that;
                                 returns `hasMoreOlder` too, so the
                                 existing scroll-up-to-load-more keeps
                                 working unchanged from this window's own
                                 oldest message. No "load newer" beyond
                                 its own after-window — out of scope, this
                                 app has no such mechanism at all yet
                                 (see section 6 for two real FlatList bugs
                                 hit wiring the scroll/highlight side of
                                 this up in ChatScreen). sendPhotoMessage
                                 (upload to the private message-photos
                                 bucket, then insert) + DisplayMessage
                                 .photoUrl, resolved as a batched
                                 short-lived signed URL per fetch.
                                 sendDocumentMessage (task after #47's "+"
                                 attach menu — any file type, uploads to
                                 the private message-documents bucket,
                                 filename's own extension used for the
                                 storage path rather than deriving one
                                 from contentType) + DisplayMessage
                                 .documentUrl/.documentName/
                                 .documentSizeBytes, same signed-URL-per-
                                 fetch pattern as photos. deleteMessage
                                 (soft — sets deleted_at + clears body/
                                 media_url/document_name/
                                 document_size_bytes via the existing
                                 UPDATE RLS policy, not a real DELETE) /
                                 reportMessage (no-ops on a repeat
                                 report) / fetchReportedMessages /
                                 dismissReports / DisplayMessage.deletedAt.
                                 subscribeToNewMessages appends a
                                 module-level monotonic counter to its
                                 realtime topic string, so a fast
                                 unmount+remount of the same chat screen
                                 can't collide with a not-yet-torn-down
                                 previous subscription (same bug class
                                 fixed once already in notifications.ts).
lib/calendar.ts                 fetchEvents / fetchEvent / createEvent /
                                 updateEvent / deleteEvent
lib/calendarFeed.ts              fetchCalendarFeed(clubId, userId,
                                 isClubAdmin) merges calendar.ts's
                                 fetchEvents (always), races.ts's
                                 fetchRaces (every race is now shown to
                                 every club member, not just those with
                                 access — tapping through without access
                                 still redirects), eboard.ts's
                                 fetchEboardChannel+fetchMeetings (only
                                 if isMember), and polls.ts's fetchPolls
                                 (club polls always, race polls per
                                 race, Eboard polls only if isMember)
                                 into one sorted CalendarFeedItem[] — no
                                 new tables/RLS, every read already goes
                                 through each feature's own existing
                                 policies. CalendarFeedItem carries
                                 `isOpen?: boolean` (poll-only, via
                                 isPollEffectivelyClosed) since a poll
                                 has no fixed date the way an event/race/
                                 meeting does — Upcoming/Past bucketing
                                 for a poll item uses isOpen, not a raw
                                 date compare against atIso (closesAt ??
                                 createdAt). `fetchGlobalCalendarFeed(userId)`
                                 (task after #47's Calendar tab) —
                                 `(tabs)/calendar.tsx`'s "no club active"
                                 mode: every club from fetchMyClubs, one
                                 fetchCalendarFeed call each, merged and
                                 re-sorted, each item tagged with
                                 `clubName`. No new tables/RLS — same
                                 "every read already goes through each
                                 feature's own policies" reasoning as the
                                 per-club version.
lib/clubPosts.ts                 News & Highlights (task after #47's
                                 club-hub restructure) — fetchClubPosts /
                                 fetchClubPost / createClubPost /
                                 updateClubPost (an omitted `mediaUrl`
                                 leaves the existing photo untouched, a
                                 real path replaces it, `null` removes
                                 it) / deleteClubPost (hard delete,
                                 matching polls/races/events — a post has
                                 no "conversation continuity" reason to
                                 soft-delete/tombstone the way chat
                                 messages do) / uploadClubPostPhoto /
                                 toggleClubPostReaction. Signed URLs per
                                 fetch from the private club-post-photos
                                 bucket, same pattern as lib/messages.ts.
lib/members.ts                   fetchClubMembers / promoteToAdmin /
                                 fetchPendingRequests / decideJoinRequest
lib/profile.ts                   fetchProfile / updateProfile /
                                 uploadAvatar / formatDateOfBirth /
                                 deleteAccount (wraps the delete_account()
                                 RPC; caller must still call
                                 supabase.auth.signOut() right after,
                                 since the RPC only blocks *future* auth)
lib/legalContent.ts              PRIVACY_POLICY_SECTIONS / TERMS_SECTIONS
                                 content data (see
                                 components/LegalDocument.tsx). Flagged
                                 in-file as a first draft, not legal
                                 advice — needs real review before a
                                 genuine public launch.
lib/pickImageOnWeb.ts             `pickImageOnWeb()`, a raw
                                 `<input type=file>` + real `.click()`
                                 helper that bypasses expo-image-picker's
                                 web shim for the 3 in-app picker call
                                 sites (profile avatar, club avatar, chat
                                 photo) — that shim dispatches a
                                 synthetic click event, which some real
                                 browser configurations don't treat as
                                 sufficient user activation to open the
                                 native file dialog. Native platforms are
                                 unaffected and still go through
                                 expo-image-picker directly. Takes an
                                 optional `{captureCamera: boolean}` (task
                                 after #47) setting the file input's
                                 `capture="environment"` attribute — hints
                                 mobile browsers to open the camera
                                 directly, harmlessly ignored on desktop.
lib/pickDocumentOnWeb.ts          `pickDocumentOnWeb()` — same real-
                                 `.click()` fix as pickImageOnWeb.ts,
                                 applied proactively to expo-document-
                                 picker's web shim (found to have the
                                 identical `dispatchEvent(new
                                 MouseEvent("click"))` pattern while
                                 building the document-attachment "+"
                                 menu, before it had a chance to bite).
lib/routines.ts                  fetchWeekWorkouts / fetchWorkout /
                                 createWorkout / updateWorkout /
                                 deleteWorkout, + ACTIVITY_TYPES/
                                 ACTIVITY_LABELS/ACTIVITY_ICONS
lib/polls.ts                     fetchPolls / createPoll / fetchPoll /
                                 fetchPollVoters (only called when
                                 eligible to see voters; also selects
                                 profiles.avatar_url) / castVote (wraps
                                 the cast_vote RPC) / setPollClosed /
                                 deletePoll. `PollScope` discriminated
                                 union (club / race / eboard, each
                                 carrying its own id + clubId) threaded
                                 through fetchPolls/createPoll instead of
                                 a bare clubId. fetchPolls returns
                                 `closesAt`/`hasVoted` per item (powers
                                 the list's MY VOTES tab); createPoll
                                 takes `closesAt`. Exported
                                 `isPollEffectivelyClosed(poll)`
                                 (`isClosed || closesAt has passed`) so
                                 client screens can't drift from the
                                 server-side `is_poll_closed` check.
                                 `PollVoter` interface (`userId`/
                                 `fullName`/`avatarUrl`).
lib/races.ts                     fetchRaces(clubId, userId, isClubAdmin)
                                 (per-race access + request status for
                                 the current user, plus `pinned` — looked
                                 up per-caller from `race_pins`, never
                                 shared/admin-set) / setRacePinned(raceId,
                                 userId, pinned) — upserts/deletes the
                                 caller's own race_pins row, no admin
                                 check (RLS already scopes it to
                                 `user_id = auth.uid()` regardless) /
                                 createRace / requestJoinRace / fetchRace
                                 (`channelId: string | null`, since a
                                 manager who isn't a member can't read
                                 the race's channel row) /
                                 fetchRaceMembers / removeRaceMember /
                                 fetchPendingRaceRequests /
                                 decideRaceJoinRequest / addRaceMember /
                                 searchClubMembersToAdd /
                                 fetchRaceLocationInfo /
                                 updateRaceLocationInfo ("Meet
                                 Information" — one combined fetch/update
                                 covering all 5 fields: description,
                                 location, hotel, photos, results) /
                                 deleteRace
lib/eboard.ts                     fetchEboardChannel (null if none
                                 created yet; membership/request status
                                 checked with an explicit eq("user_id",
                                 userId), since presence of a roster row
                                 isn't a valid "am I a member" proxy here
                                 — any club admin can read the full
                                 roster) / createEboardChannel /
                                 requestJoinEboardChannel /
                                 fetchEboardMembers / removeEboardMember /
                                 fetchPendingEboardRequests /
                                 decideEboardJoinRequest / addEboardMember
                                 / searchClubAdminsToAdd / fetchMeetings /
                                 fetchMeeting / createMeeting /
                                 updateMeeting / deleteMeeting /
                                 deleteEboardChannel
lib/carGroups.ts                 fetchCarGroups (groups with members +
                                 incharge name attached) / createCarGroup
                                 (name computed by the caller as `Group
                                 ${groups.length + 1}`, no server-side
                                 naming) / deleteCarGroup /
                                 addCarGroupMember / removeCarGroupMember
                                 / setCarGroupIncharge /
                                 searchRaceParticipantsToAdd (real race
                                 roster only as of task #44 — a manager
                                 without an actual race_members row no
                                 longer qualifies, excludes anyone
                                 already in any group for the race)
lib/notifications.ts             fetchNotificationFeed (merges
                                 `notifications` rows with
                                 `fetch_unread_channel_summaries()` RPC
                                 results, paginated via `limit`/`before`
                                 mirroring fetchMessages) /
                                 fetchUnreadBadgeCount /
                                 markAllNotificationsRead (bulk-marks
                                 discrete notifications read, never
                                 touches channel_reads) / markChannelRead
                                 (routes through the
                                 mark_channel_read_and_log RPC — task
                                 #47, this app's first RPC-driven rather
                                 than trigger-driven notifications insert
                                 — so a resolved chat-unread row logs an
                                 already-read chat_caught_up notification
                                 before channel_reads advances, and
                                 persists in the feed as history instead
                                 of vanishing; called from ChatScreen on
                                 mount, same exported signature as
                                 before) /
                                 markNotificationsReadForPath (mirrors
                                 markChannelRead's shape — exact-match
                                 UPDATE by target_path, called from
                                 club-profile/members.tsx, race roster,
                                 and eboard roster on focus; the 3
                                 pending-join-request-inbox types are
                                 excluded from markAllNotificationsRead's
                                 bulk UPDATE and only ever clear via this
                                 function, same "only clears once you
                                 look" guarantee as chat-unread rows) /
                                 subscribeToNotifications (mirrors
                                 subscribeToNewMessages; takes a `tag`
                                 param plus a monotonic per-attempt
                                 counter so independent subscribers, and
                                 a rapid remount of the same subscriber,
                                 don't collide on the same realtime
                                 channel topic).
types/database.ts               Hand-written Supabase Database type (see
                                 section 6 gotcha about required shape)
constants/theme.ts               "Kinetic Performance System" design
                                 tokens (colors/radii/spacing/typography).
                                 `primary`/`surfaceTint` = `#ff4d00`
                                 ("Energetic Orange") per explicit
                                 founder preference, applied app-wide.
                                 Fonts (Anton, Archivo Narrow, Inter)
                                 loaded via `@expo-google-fonts/*` +
                                 `expo-font` in `app/_layout.tsx`.

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
                                 new nullable race_id (messages/
                                 message_reactions RLS unchanged); adds
                                 is_race_admin/is_race_member/
                                 is_race_club_member helpers; re-patches
                                 the 0008/0012 membership-message trigger
                                 functions (channel lookup previously
                                 assumed one channel per club);
                                 request_join_race / decide_race_join_request
                                 RPCs (mirrors 0006's shape, always
                                 request-based, no "open" branch)
  0017_eboard.sql                  eboard_channels (unique per club) /
                                 eboard_channel_members /
                                 eboard_channel_join_requests + RLS;
                                 channels.eboard_channel_id (nullable) —
                                 required re-scoping the "one main
                                 channel per club" partial unique index
                                 and re-patching the membership-message
                                 trigger functions a second time;
                                 is_channel_member/is_channel_admin gain
                                 a third branch; request_join_eboard_channel
                                 / decide_eboard_join_request RPCs,
                                 decided by an existing eboard member
                                 rather than "any club admin"
  0018_eboard_meetings.sql         eboard_meetings (title, description,
                                 meeting_link, meeting_at) + RLS: any
                                 existing eboard_channel_member can
                                 select/insert/update/delete
  0019_eboard_meetings_creator_edit.sql
                                 Founder follow-up: only the meeting's
                                 creator can edit it
  0020_eboard_meetings_creator_delete.sql
                                 Second follow-up: delete also
                                 creator-only
  0021_race_car_groups.sql         race_car_groups / race_car_group_members
                                 (unique(race_id, user_id) enforces one
                                 group per person per race) + RLS: view
                                 for anyone with race access, write
                                 admin-only. New is_user_race_participant
                                 helper scopes the add-member pool to the
                                 race's own roster + club admins. Trigger
                                 clears incharge_user_id if that member
                                 is removed; set_car_group_incharge RPC
                                 validates current membership first.
  0022_race_car_groups_delete.sql  Founder follow-up: admin-only delete
                                 policy on race_car_groups (0021 didn't
                                 include one) — members cascade-delete.
  0023_race_links.sql              races.photos_link, results_link
                                 (nullable text) — no new RLS, existing
                                 admin update policy already covers them.
  0024_race_location_info.sql      races.info_description, location_link,
                                 hotel_link (nullable text) — same
                                 no-new-RLS reasoning as 0023.
  0025_polls.sql                   polls / poll_options / poll_votes +
                                 RLS; poll_options.vote_count is
                                 denormalized/trigger-maintained so
                                 counts stay public even on a private
                                 poll whose poll_votes rows are RLS-
                                 gated to the creator; cast_vote RPC
                                 casts/toggles/moves a vote, plain
                                 security-invoker (not security-definer),
                                 never uses INSERT...RETURNING (see
                                 section 6). Close/reopen/delete
                                 creator-only.
  0026_indexes.sql                 6 indexes for FK columns filtered
                                 directly (`.eq(...)`) with no existing
                                 PK/unique coverage: races.club_id,
                                 eboard_meetings.eboard_channel_id,
                                 race_car_groups.race_id, polls.club_id,
                                 poll_options.poll_id, and a (poll_id,
                                 user_id) composite on poll_votes.
  0027_message_photos_storage.sql  Private (not public) 'message-photos'
                                 Storage bucket + RLS scoped via
                                 is_channel_member on the object path's
                                 first segment (${channelId}/${uuid}.ext).
  0028_account_deletion.sql        security definer delete_account()
                                 RPC: anonymizes the caller's own
                                 profiles row and sets
                                 auth.users.banned_until (+100 years) to
                                 permanently block future sign-in. No
                                 hard delete, no cascade surgery.
  0029_message_reports.sql         message_reports (message_id,
                                 channel_id, reporter_id, unique(message_id,
                                 reporter_id)) + RLS: any channel member
                                 can insert a report, only a channel
                                 admin can read/delete (dismiss) them.
  0030_message_soft_delete.sql     messages.deleted_at. deleteMessage now
                                 UPDATEs (clears body/media_url, stamps
                                 deleted_at) through the existing
                                 sender-or-admin UPDATE policy instead of
                                 hard-DELETEing, so a deleted message
                                 tombstones instead of vanishing from
                                 other members' history.
  0031_notifications_core.sql      notification_type enum, notifications
                                 table + RLS (recipient-only select/
                                 update, no insert policy — every row
                                 comes from a security-definer trigger)
                                 + added to supabase_realtime;
                                 channel_reads table + RLS; the
                                 fetch_unread_channel_summaries() RPC.
  0032_notification_triggers_membership.sql
                                 Re-creates log_member_added/
                                 log_member_removed/
                                 log_member_role_changed/
                                 log_race_member_added/
                                 log_eboard_member_added to also insert a
                                 notifications row; extends
                                 decide_join_request/
                                 decide_race_join_request/
                                 decide_eboard_join_request to insert
                                 request_approved/request_denied
                                 notifications, guarded by a
                                 transaction-local
                                 clubchat.skip_add_notify setting so an
                                 approval doesn't also fire a redundant
                                 "added by" notification.
  0033_notification_triggers_requests.sql
                                 3 new triggers (club/race/
                                 eboard_channel join_requests, on insert
                                 or update of status ... when pending)
                                 fanning out admin/eboard-member-inbox
                                 notifications; eboard requests go only
                                 to current eboard members.
  0034_notification_triggers_creation.sql
                                 New after-insert triggers on polls/
                                 calendar_events/races/eboard_meetings
                                 (creator excluded) and on messages
                                 filtered to message_type = 'announcement'.
  0035_notifications_persistent_requests.sql
                                 Adds notifications.resolved_outcome
                                 ('approved' | 'denied') and changes the
                                 3 decide_*_join_request functions from
                                 DELETEing a decided admin-inbox
                                 notification to UPDATEing it in place —
                                 decided requests stay visible as
                                 history, tagged with the outcome.
  0036_fix_announcement_notify_race_cast.sql
                                 Fixes a real bug: announcing in a race
                                 channel always 400'd.
                                 notify_announcement()'s race branch was
                                 the only one of its 3 scope branches
                                 using `select distinct ... from (...
                                 union ...)`, which forces the
                                 'announcement' literal to resolve as
                                 `text` before it reaches the
                                 notification_type column, defeating
                                 Postgres's implicit unknown-literal-to-
                                 enum cast on INSERT...SELECT. Fixed with
                                 an explicit `::notification_type` cast
                                 on all 3 branches.
  0037_race_members_delete.sql     race_members had insert/select
                                 policies since 0016 but no delete policy
                                 at all — a genuine gap, not a
                                 regression. Adds the missing admin-only
                                 delete policy.
  0038_polls_scope_and_deadline.sql
                                 polls gains closes_at (nullable
                                 timestamptz), race_id, eboard_channel_id
                                 (club_id stays not null always, mirrors
                                 channels.club_id). can_access_poll and
                                 the polls INSERT policy become 3-way
                                 branches (race/eboard/club);
                                 is_poll_closed and cast_vote's inline
                                 check both extended to `is_closed or
                                 closes_at < now()` — no cron, computed
                                 live. polls' own SELECT policy is an
                                 inline 3-way CASE on the row's own
                                 columns, deliberately *not* routed
                                 through can_access_poll(id) — see
                                 section 6's second RLS gotcha.
                                 notify_poll_created re-created with the
                                 same 3-way scope-aware audience as
                                 notify_announcement (previously fanned
                                 out every poll, including private
                                 Eboard ones, to the entire club),
                                 including the same `::notification_type`
                                 cast fix from 0036.
  0039_eboard_members_delete.sql   Same class of gap as 0037:
                                 eboard_channel_members had insert/select
                                 policies since 0017 but no delete
                                 policy. Adds one scoped to existing
                                 eboard members (self-removal blocked at
                                 the RLS layer — superseded by 0041/0043
                                 below).
  0040_club_eboard_delete.sql      Delete Club, creator-only (cascades
                                 wipe chat/members/races/Eboard/polls/
                                 notifications for every member,
                                 permanently) + Delete Eboard channel,
                                 existing-members-only (mirrors 0017's
                                 asymmetry).
  0041_admin_race_eboard_membership_sync.sql
                                 handle_new_race/handle_new_eboard_channel
                                 re-created to bulk-add every current
                                 club admin (not just created_by), also
                                 fixing a latent ordering bug where the
                                 channel was created *after* the members
                                 insert, silently swallowing the
                                 "joined" system message/notification
                                 for those rows. New trigger
                                 handle_admin_role_membership_sync on
                                 club_members role changes: promoting to
                                 admin auto-joins Eboard (if it exists)
                                 and every *upcoming* race (event_date >=
                                 current_date); demoting reverses both
                                 for upcoming races only. New
                                 is_club_creator/is_race_club_creator/
                                 is_eboard_club_creator helpers back two
                                 replaced DELETE policies: removing an
                                 *admin* from a race, or removing anyone
                                 from Eboard, is now creator-only.
                                 lib/calendarFeed.ts's race branch lost
                                 its access-filter, so every club member
                                 sees every race on Calendar immediately.
                                 (Superseded for races by 0044 below —
                                 admin auto-membership in races was
                                 reversed one task later; the Eboard half
                                 and the calendar-visibility change
                                 stayed.)
  0042_club_role_owner_enum.sql    Split into its own migration after a
                                 real `supabase db reset` failure:
                                 `alter type ... add value` can't be
                                 used later in the *same* transaction
                                 when the enum type already existed
                                 before that transaction started. Just
                                 one statement: `alter type public.
                                 club_role add value 'owner'`.
  0043_club_role_owner.sql        Real three-tier role hierarchy, Owner >
                                 Admin > Member, replacing the implicit,
                                 non-transferable `clubs.created_by`
                                 "creator" concept 0040/0041 leaned on.
                                 Every club's creator backfilled to
                                 Owner, enforced going forward by a
                                 partial unique index (`one_owner_per_club`).
                                 `is_club_admin()` redefined to `role in
                                 ('admin','owner')`. New
                                 `transfer_ownership()` RPC (security
                                 definer): demotes the caller to Admin
                                 *before* promoting the target to Owner
                                 (the unique index is checked
                                 per-statement). `club_members` UPDATE/
                                 DELETE policies rewritten into the full
                                 permission matrix (promote/demote
                                 symmetric for Owner+Admin; remove_member
                                 Owner+Admin; remove_admin Owner-only;
                                 self-leave blocked for the Owner).
                                 `handle_admin_role_membership_sync`
                                 rewritten to compare admin-*tier*
                                 membership before/after (not a binary
                                 role=admin check), and drops its
                                 race-sync half entirely (moved to 0044).
                                 New `club_members` AFTER DELETE trigger
                                 closes a gap: removing someone outright
                                 never cleaned up their race/Eboard rows
                                 (only demotion was handled).
                                 `is_club_creator`/`is_eboard_club_creator`
                                 dropped in favor of `is_club_owner`/
                                 `is_eboard_club_owner`.
  0044_race_channel_rework.sql    Reverses 0041's race auto-membership
                                 (explicit founder request to replace,
                                 not extend, that behavior):
                                 handle_new_race drops its bulk-add-
                                 every-admin block (creator auto-add
                                 kept). is_channel_member's race branch
                                 becomes is_race_member(race_id) only — a
                                 club Admin/Owner no longer gets
                                 automatic chat access without a real
                                 race_members row. is_channel_admin's
                                 race branch becomes is_race_member AND
                                 is_race_admin. race_members DELETE
                                 simplifies back to one policy (any
                                 manager removes anyone) — 0041's
                                 owner-only carve-out only ever applied
                                 to the club-wide remove_admin action.
                                 Two related latent bugs fixed in the
                                 same file: request_join_race still
                                 short-circuited to 'joined' for any
                                 club admin without inserting a real
                                 race_members row; is_user_race_participant
                                 still let any club admin be assigned to
                                 a car group without real race access.
                                 race/[raceId]/_layout.tsx's RaceContext
                                 splits isAdmin into isManager (club
                                 Admin/Owner) and isMember (real roster
                                 row, required for chat/hub access).
  0045_race_eboard_avatars.sql     races.avatar_url, eboard_channels
                                 .avatar_url + a dedicated public Storage
                                 bucket; adds the eboard_channels UPDATE
                                 policy that never existed.
  0046_fix_club_join_request_target_path.sql
                                 club_join_request's target_path fixed
                                 to club-profile/members (was pointing
                                 at the now-identity-only club-profile
                                 route); notify_club_join_request/
                                 notify_race_join_request fixed from
                                 `role = 'admin'` to `role in
                                 ('admin','owner')` — silently dropped
                                 every join-request notification for a
                                 club with a lone Owner ever since 0043.
  0047_poll_closing_soon_enum.sql  Adds 'poll_closing_soon' to
                                 notification_type, alone in its own
                                 file per section 6's enum-transaction
                                 lesson.
  0048_poll_closing_soon_notify.sql
                                 Task #45 — polls.closing_soon_notified_at
                                 (dedup guard); create extension pg_cron
                                 (confirmed already preloaded on this
                                 Postgres image); notify_polls_closing_soon(),
                                 a non-trigger function looping over every
                                 poll within 10 minutes of closes_at,
                                 audience computed with the same 3-way
                                 branch shape notify_poll_created (0038)
                                 already established; scheduled via a
                                 named cron.schedule job, every 1 minute
                                 (upserts by name — safe across `supabase
                                 db reset`). Also re-creates
                                 notify_announcement and
                                 notify_poll_created — both still had
                                 `role = 'admin'` on their race branch, a
                                 3rd/4th instance of 0046's exact bug,
                                 found while writing this migration's own
                                 audience query.
  0049_race_polls_member_only.sql
                                 Task #46 — race-scoped polls now require
                                 a real race_members row to see or
                                 create, matching Eboard's model exactly:
                                 can_access_poll()/the polls SELECT
                                 policy's race branch drops the
                                 is_race_admin fallback down to
                                 is_race_member only (this alone also
                                 fixes poll_options/poll_votes RLS, both
                                 already routed through can_access_poll);
                                 the INSERT policy's race branch becomes
                                 is_race_member AND is_race_admin
                                 (mirrors is_channel_admin's pin/announce
                                 rule — creation deliberately stays
                                 admin-gated, not opened to every race
                                 participant, unlike Eboard's "any
                                 member" which only works there because
                                 Eboard membership already implies club-
                                 admin status). notify_poll_created/
                                 notify_polls_closing_soon's race
                                 branches narrow from "race_members ∪
                                 club admins" to race_members only.
  0050_race_announcement_member_only.sql
                                 Same-session founder follow-up to #46:
                                 notify_announcement's race branch had
                                 the identical "race_members ∪ club
                                 admins" audience pattern (confirmed via
                                 a repo-wide grep that it was the last
                                 remaining instance) — a non-member
                                 manager still got notified about a race
                                 chat announcement they couldn't actually
                                 open, since chat access itself has been
                                 race_members-only since task #44. No RLS
                                 change (chat access was already
                                 correct) — audience only, narrowed to
                                 race_members.
  0051_chat_caught_up_enum.sql     Adds 'chat_caught_up' to
                                 notification_type, alone in its own
                                 file per section 6's enum-transaction
                                 lesson.
  0052_chat_caught_up_notify.sql   Task #47 — mark_channel_read_and_log(
                                 p_channel_id), a security-definer RPC
                                 (this app's first RPC-driven, not
                                 trigger-driven, notifications insert):
                                 computes the caller's unread count for
                                 that channel using the same filter shape
                                 fetch_unread_channel_summaries() (0031)
                                 uses, and — only if > 0 — inserts an
                                 already-read chat_caught_up notification
                                 ("Caught up on N messages in X chat")
                                 before upserting channel_reads. The live
                                 unread computation itself is completely
                                 unchanged; this only adds a persisted,
                                 already-read historical trace of when it
                                 got resolved.

  -- Note: migrations 0053-0060 (join-policy auto-approve, @mention
  -- tagging) exist on disk but were never back-filled into this list —
  -- read them directly if needed. Resuming here at 0061.

  0061_club_posts.sql              News & Highlights (task after #47).
                                 club_posts (club_id, created_by, body,
                                 media_url, created_at) — select:
                                 is_club_member(club_id); insert/update/
                                 delete: is_club_admin(club_id) (any
                                 admin, not creator-only — confirmed via
                                 AskUserQuestion, matches Race Meet Info/
                                 Routines/Events over Eboard Meetings).
                                 Bound directly to the row's own club_id
                                 column, not a self-referential lookup —
                                 safe under INSERT...RETURNING per
                                 section 6's second RLS gotcha.
  0062_club_post_photos_storage.sql  Private 'club-post-photos' bucket,
                                 same shape as message-photos (0027):
                                 objects keyed `${clubId}/${uuid}.ext`,
                                 select gated on is_club_member, insert on
                                 is_club_admin.
  0063_club_post_reactions.sql     club_post_reactions — mirrors
                                 message_reactions' shape exactly (same
                                 pattern message_mentions/0058 already
                                 reused for a different feature).
  0064_news_post_notification_type.sql
                                 Adds 'news_post_created' to
                                 notification_type, alone in its own file
                                 per section 6's enum-transaction lesson.
  0065_club_post_notify.sql        notify_news_post_created(), same
                                 shape as notify_race_created/
                                 notify_poll_created (0034) — fans out to
                                 every club member except the creator.
  0066_message_type_document.sql   Adds 'document' to message_type, alone
                                 in its own file per section 6's
                                 enum-transaction lesson.
  0067_message_documents_columns.sql
                                 messages.document_name, .document_size_bytes
                                 — media_url itself is reused as-is for the
                                 storage path, same column a photo message
                                 already uses.
  0068_message_documents_storage.sql
                                 Private 'message-documents' bucket,
                                 identical shape to message-photos (0027):
                                 `${channelId}/${uuid}.ext`, gated by
                                 is_channel_member for both read and write
                                 — any channel member (not just admins)
                                 can attach a document, same as a photo.
  0069_chat_poll_event_message_type.sql
                                 Adds 'poll' and 'event' to message_type
                                 (both in one file — neither is used
                                 within this same migration, so section
                                 6's enum-transaction restriction doesn't
                                 apply).
  0070_messages_poll_event_refs.sql
                                 messages.poll_id/event_id (both `on
                                 delete cascade` — deleting the poll/
                                 event removes its chat card instead of
                                 leaving a dead link).
  0071_poll_event_chat_messages.sql
                                 post_poll_chat_message()/
                                 post_event_chat_message(): security-
                                 definer triggers, same shape as
                                 log_member_added (0008), auto-posting a
                                 poll/event chat message the instant one
                                 is created — regardless of entry point
                                 (dedicated Polls/Calendar screen, or the
                                 chat "+" shortcut), confirmed via a
                                 direct-SQL-insert test during
                                 verification. Separate concern from
                                 notify_poll_created/notify_event_created
                                 (0034), which still handle the
                                 Notifications-tab bell entry unchanged.
                                 Club-scoped only for now (race_id is not
                                 null or eboard_channel_id is not null ->
                                 skipped) — calendar_events has no race/
                                 Eboard scope to begin with.

  -- Note: migrations 0072-0075 (Eboard auto-create on club creation,
  -- car-group-incharge-left system message, Leave Race/Eboard/car-group
  -- self-service) exist on disk but were never back-filled into this
  -- list either — read them directly if needed. Resuming here at 0076.

  0076_meeting_message_type_enum.sql
                                 Adds 'meeting' to message_type, alone in
                                 its own file per this section's own
                                 enum-transaction lesson.
  0077_race_eboard_poll_meeting_chat_messages.sql
                                 Task after #47's chat-first Eboard/Race
                                 nav rework (see section 5's narrative) —
                                 messages.meeting_id (`on delete cascade`,
                                 same shape as poll_id/event_id);
                                 post_meeting_chat_message(), a new
                                 trigger on eboard_meetings insert, same
                                 shape as 0071's poll/event triggers, but
                                 posting into the Eboard's own channel
                                 (looked up by eboard_channel_id) rather
                                 than a club's main one. Also re-creates
                                 post_poll_chat_message() (0071): its
                                 race/Eboard branches were previously
                                 skipped entirely ("club-scoped only for
                                 now") — closed now that race/Eboard chat
                                 get their own "+" poll-creation shortcut,
                                 by routing to that race's/Eboard's own
                                 channel instead of skipping.
  0078_race_pinned.sql            Founder wireframe follow-up (club hub
                                 restyle, see section 5) — added
                                 races.pinned, a shared column, admin-only
                                 via the existing races UPDATE policy.
                                 Modeled the feature wrong: pinning turned
                                 out to be personal per-member curation,
                                 not an admin-wide setting. Superseded one
                                 migration later by 0079 rather than
                                 edited in place, per this file's own
                                 migration convention.
  0079_race_pins_per_user.sql     Corrects 0078: drops races.pinned,
                                 replaces it with race_pins (race_id,
                                 user_id, created_at — presence of the row
                                 *is* the pin), same shape as
                                 channel_reads (0031) — a single "for all"
                                 policy scoped to `user_id = auth.uid()`,
                                 no membership check needed on insert
                                 (mirrors channel_reads' own policy
                                 exactly). Every club member can pin any
                                 race they can see; it only affects their
                                 own hub preview.
```

## 5. Current status

All 55 numbered tasks below are done. Full build narrative for any task
— bugs found, scope changes, verification steps — lives in
`docs/HISTORY.md` under that task's own heading; this table intentionally
only summarizes.

| # | Task | Status |
|---|------|--------|
| 1 | Expo scaffold + Expo Router navigation shell | ✅ Done |
| 2 | Supabase schema + RLS (migrations 0001-0005) | ✅ Done |
| 3 | Auth flow (sign up/in/out, session persistence, route guard) | ✅ Done |
| 4 | Club creation, invite-code join, admin/member roles | ✅ Done |
| 5 | Club group chat — messages, reactions, pin/announce, realtime | ✅ Done |
| 6 | Club calendar — CRUD, Upcoming/Past list, detail + admin create/edit | ✅ Done |
| 7 | Members list + promote/remove/add (lives in `club-profile/index.tsx`) | ✅ Done |
| 8 | Search-by-name club join + join policy (`open`/`request`) | ✅ Done |
| 9 | Chat system messages for membership changes | ✅ Done |
| 10 | Profile page — avatar upload, bio, "your clubs" | ✅ Done |
| 11 | Promotion chat events, avatars in roster, tap-to-view member profile, city/DOB/school | ✅ Done |
| 12 | Club profile screen, chat sender avatars | ✅ Done |
| 13 | Club navigation restructure (hub screen replaces bottom Tabs) | ✅ Done |
| 14 | Chat: pinned-messages sticky strip, Highlights screen, timestamps, auto-scroll | ✅ Done |
| 15 | Weekly routines | ✅ Done |
| 16 | Race sub-flow: "Races & Meets" section, request/approve membership, race chat | ✅ Done — see `docs/HISTORY.md` task #16 (founder-wireframe deviation from the original calendar-linked plan, see also section 1). |
| 17 | Eboard & Council: private admin-only mini-club, one per club | ✅ Done |
| 18 | Eboard & Council: Meetings (date+time, title, description, link) | ✅ Done — any eboard member can create, only the creator can edit/delete. |
| 19 | Race: Car Assignments & Groups | ✅ Done — admin-only auto-numbered groups, one designated Incharge per group, caught a real infinite-render bug during its own Playwright pass. |
| 20 | Race: Photos + Result Link | ✅ Done, then merged into task #22. |
| 21 | Race: Location & Accommodation | ✅ Done, then merged into task #22. |
| 22 | Race: consolidate Photos/Result Link + Location & Accommodation → "Meet Information" | ✅ Done — founder follow-up right after #20/#21 shipped; last of Race's 4 originally-placeholder sections. |
| 23 | Unified club Calendar (events + races + Eboard meetings) | ✅ Done — pure aggregation over existing per-feature reads, no new tables/RLS. |
| 24 | Polls: admin-created, single/multi-select voting, public/private voter visibility | ✅ Done — close/reopen/delete creator-only, mirrors `eboard_meetings` not races/routines. |
| 25 | Code-quality audit + standardized error handling on data loads | ✅ Done — shared `lib/reportError.ts` + `components/LoadError.tsx` applied across ~24 files. |
| 26 | Add automated tests + CI | ✅ Done — `jest-expo`, `lib/dates.ts` extracted and tested, `.github/workflows/ci.yml`. |
| 27 | DB indexes + chat pagination cap | ✅ Done — 6 new indexes, ChatScreen caps to latest 50 messages. |
| 28 | Chat: scroll-triggered "Load earlier" pagination | ✅ Done — merge-by-id state updates, `onStartReached`, scroll position preserved via `rAF`-wrapped `scrollToIndex`. |
| 29 | Photo attachments in chat | ✅ Done — private `message-photos` bucket, signed URLs per fetch. |
| 30 | Self-service account deletion | ✅ Done — anonymize + `auth.users.banned_until`, not hard-delete. |
| 31 | Chat moderation — message delete + report | ✅ Done — soft-delete tombstone, admin-only Reports tab in Highlights. |
| 32 | Privacy Policy + Terms of Service (in-app) | ✅ Done — not a substitute for real legal review before public launch. |
| 33 | Bundle identifiers + `eas.json` build config | 🟡 Partial — bundle IDs + build profiles set; still needs the founder's own interactive `eas login`/`eas init`. |
| 34 | Visual redesign — "Kinetic Performance System" (Stitch) rollout app-wide | ✅ Done — see `docs/HISTORY.md` task #34. |
| 35 | Notifications — Strava-style cross-club inbox | ✅ Done — see `docs/HISTORY.md` task #35. |
| 36 | Bug fixes: race-chat announcements silently failing + race roster missing "Remove" | ✅ Done — see `docs/HISTORY.md` task #36. |
| 37 | Header styling consistency fix (Routines/Polls/Races/Eboard/Race never got the redesign treatment) | ✅ Done |
| 38 | Polls: Stitch redesign, optional deadline, Race/Eboard scoping | ✅ Done — see `docs/HISTORY.md` task #38 (a second `INSERT...RETURNING` RLS gotcha, see section 6). |
| 39 | Polls in the unified Calendar | ✅ Done — see `docs/HISTORY.md` task #39. |
| 40 | Eboard member removal + Delete Club/Race/Eboard | ✅ Done |
| 41 | Admin auto-membership for Race/Eboard + calendar visibility | ✅ Done — see `docs/HISTORY.md` task #41. Later reversed for races by #42/#44. |
| 42 | Owner/Admin/Member role hierarchy + race-channel membership rework | ✅ Done — see `docs/HISTORY.md` task #42. |
| 43 | Polls: voter-view popup (avatar + name per option) + minute/hour/day custom deadlines | ✅ Done — see `docs/HISTORY.md` task #43. No migration, UI/lib-only. |
| 44 | Notifications: real unread color shading + join-requests behave like chat-unread | ✅ Done — see `docs/HISTORY.md` task #44 (2 live bugs: stale `target_path`, a post-#42 `role = 'admin'` filter regression). |
| 45 | Poll-closing-soon notification (10 minutes before `closes_at`) | ✅ Done — see `docs/HISTORY.md` task #45. First scheduled job (pg_cron); fixed 2 more instances of #44's role-filter bug. |
| 46 | Race polls + race announcements: member-only access/audience, matching Eboard's model exactly | ✅ Done — see `docs/HISTORY.md` task #46. Closed the one race feature that didn't already require real `race_members` access. |
| 47 | Notifications: mark-read-on-blur timing + persisted "caught up" record for chat | ✅ Done — see `docs/HISTORY.md` task #47. First RPC-driven (not trigger-driven) `notifications` insert. |
| 48 | Club-navigation restructure (hub redesign) + News & Highlights | ✅ Done — see `docs/HISTORY.md` task #48. Full-screen chat, redesigned hub, `club_posts` feed. |
| 49 | WhatsApp-style chat attach menu + document attachments | ✅ Done — see `docs/HISTORY.md` task #49. Any-file-type documents are a new capability (migrations 0066-0068), not just UI. |
| 50 | Poll/event auto-post to chat + Profile tab back-arrow fix | ✅ Done — see `docs/HISTORY.md` task #50. |
| 51 | Chat-first nav rework for Race and Eboard | ✅ Done — see `docs/HISTORY.md` task #51. Extends #48/#49's pattern down a level; Eboard meetings gain auto-post cards too. |
| 52 | Club hub restyle (Telegram-style list) + per-user race pins | ✅ Done — see `docs/HISTORY.md` task #52. New `race_pins` table, corrected from an initial wrong admin-wide-column attempt. |
| 53 | Highlights rows jump to their message in chat | ✅ Done — see `docs/HISTORY.md` task #53. Surfaced (deferred to #54) a pre-existing scroll-to-bottom bug. |
| 54 | Chat scroll-to-bottom fix, jump-to-latest button, unread-aware entry | ✅ Done — see `docs/HISTORY.md` task #54. Chat now opens on the first unread message with zero visible scroll motion. |
| 55 | Shareable join link, replacing the raw invite-code header/pill | ✅ Done — see `docs/HISTORY.md` task #55. Wraps `invite_code` in a `clubchat://` deep link; founder-confirmed working live (Share/Copy + deep-link auto-join). |

**Immediate next step**: of the six "ship as a real application" tasks
from an earlier audit, 4 are done (#29-32) and 1 is partial (bundle ID +
`eas.json` #33, blocked on the founder's own `eas login`/`eas init`). The
6th — App Store privacy label / Google Play Data Safety form — isn't a
coding task; fill it out at actual submission time.

Beyond those six: task #25's still-open gaps (no accessibility labels,
hand-written `types/database.ts` — regenerate once a real hosted
Supabase project exists, no error monitoring), and push notifications /
OTA updates (`expo-updates`) aren't wired up — task #35's Notifications
already compute the `body`/`target_path` an `expo-notifications` payload
would need. Task #34 also leaves the Highlights/Races/Eboard visual
rollout unverified against a source mockup (extrapolated from the hub's
pattern) — worth a founder look.

Most recently (tasks #48-55, rough arc): a founder wireframe-driven
navigation restructure — full-screen chat-first nav, a redesigned hub,
News & Highlights as a new feed — carried down into Race/Eboard chat and
through two more hub restyles, followed by real chat scroll-bug fixes,
and task #55 (this session) replacing the raw invite-code header/pill
with a shareable `clubchat://` join link. See each row's `docs/
HISTORY.md` pointer above for specifics.

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

### A second, subtler variant: a self-referential SELECT policy function breaks INSERT...RETURNING even with no trigger involved

Found live during task #38 (Polls' Race/Eboard scoping). `polls`' new
SELECT policy was written as `using (can_access_poll(id))`, where
`can_access_poll(p_poll_id)` is a security-definer function that does
`select ... from public.polls p where p.id = p_poll_id` — modeled
directly on `is_channel_member`, which is used the same way inside
`channels`' own SELECT policy and was believed proven safe by that
precedent (see task #24's original write-up).

It isn't safe in this shape. A plain `INSERT` into `polls` (no
`RETURNING`) succeeded every time. The identical insert through
supabase-js's `.insert().select()` — i.e. `INSERT...RETURNING` — failed
with "new row violates row-level security policy," even though a manual
`SELECT can_access_poll(id)` run immediately afterward, in the same
transaction, returned `true`. Confirmed by reproducing both the failure
and the fix directly in `psql`, impersonating the caller via
`set local role authenticated` + `select set_config('request.jwt.claims',
...)`.

**Root cause**: the *original*, working policy for this exact case
(`is_club_member(club_id)`) evaluated a column read straight off the row
being returned — no further lookup. Routing the check through
`can_access_poll(id)` instead makes the SELECT-policy check re-query
`polls` **by id, from inside a function, during the same RETURNING
evaluation that is still producing that very row** — a self-referential
subquery back into the table being inserted into. That is a materially
riskier shape than "a security-definer function used inside its own
table's policy" in the abstract, and the `is_channel_member`/`channels`
precedent this was modeled on turns out to have never actually been
exercised through a client `.insert().select()` — every `channels` row
in this codebase is inserted server-side by a trigger (`handle_new_race`,
`handle_new_eboard_channel`, `handle_new_club`), never returned to a
caller.

**The fix**: write the check inline, bound directly to the row's own
columns, instead of delegating to a function that re-queries the table:

```sql
create policy "eligible members can read polls"
  on public.polls for select
  to authenticated
  using (
    case
      when race_id is not null then is_race_admin(race_id) or is_race_member(race_id)
      when eboard_channel_id is not null then is_eboard_member(eboard_channel_id)
      else is_club_member(club_id)
    end
  );
```

**Takeaway**: a security-definer function reading its own table from
inside that table's SELECT policy is fine when nothing calling it ever
does `INSERT...RETURNING` on a brand-new row of that same table. The
moment a client `.insert().select()` needs to pass that policy for the
row it just created, prefer a check written directly against the row's
own columns (bound from the tuple, no subquery) over one routed through
a "look this row up again by id" function — even with no trigger
anywhere in the picture. This is the same family of bug as the `clubs`
gotcha above (RETURNING re-checks SELECT), but triggered by the shape of
the SELECT policy itself, not by a trigger's timing.

### FlatList `scrollToIndex`/`onContentSizeChange`/`onStartReached`: four gotchas hit building "jump to this message" and the unread-aware entry that followed

Building Highlights' "tap a pinned/announcement to jump to it in chat"
(a `FlatList.scrollToIndex` to an arbitrary, often-unmeasured message far
outside the normal newest-50 page) hit two distinct bugs, both only
caught by watching it fail live in Playwright, not by reading the code.

**Bug 1 — a `useRef(initialValue)` capturing a route param goes stale
when the screen instance is reused.** The pending-scroll target was
first stored as `useRef<string | null>(targetMessageId ?? null)`
(`targetMessageId` read via `useLocalSearchParams`). This works on a
literal first mount, but React Navigation can reuse an already-mounted
screen instance for the same route path when navigating to it again with
different search params (chat → Highlights → chat again with a new
`?messageId=` is a stack *pop* back to the existing chat screen, not a
fresh push) — `useRef`'s initializer only ever runs once, at that
original mount, so it never picks up the new param. The jump silently
never fired; chat just fell through to whatever the "no target" default
behavior was. **Fix**: don't seed the ref from a hook value at
declaration time — set it inside the same effect that already reacts to
that value changing (here, the message-loading effect, keyed on
`[channelId, reload, targetMessageId]`), so it can never drift out of
sync with the param that's supposed to drive it.

**Bug 2 — retrying a failed `scrollToIndex` at the identical index fails
identically forever, and a "default: scroll to bottom" branch will
silently undo a successful jump.** Two compounding issues, both found by
adding temporary `console.log`s to the `onContentSizeChange`/
`onScrollToIndexFailed` handlers and reading the actual sequence rather
than guessing from the (plausible-looking) code:
1. `onScrollToIndexFailed` fires when the target index is beyond what
   FlatList has measured so far (`highestMeasuredFrameIndex` in the
   callback's `info`). The obvious "just retry after a short delay" (this
   codebase's existing pattern for the *adjacent* "restore scroll
   position after prepending an older page" feature) retries the exact
   same call, which forces nothing new to render or get measured, so it
   fails identically on every retry. **Fix**: first `scrollToOffset` to
   an *estimated* position (`info.averageItemLength * info.index` — both
   given for exactly this purpose), which forces FlatList to render/
   measure further out, and only then retry `scrollToIndex` for the
   precise position.
2. `onContentSizeChange` on this platform fires repeatedly even when
   content hasn't actually grown (not just once per real size change,
   which the existing prepend-scroll-restore logic implicitly assumed
   from day one — a latent assumption never violated until this feature
   exercised the callback via a different, non-growing path). Its
   original code had exactly two cases — "just prepended an older page"
   and "everything else: scroll to bottom" — so once the jump branch
   consumed its one-shot flag, every subsequent spurious re-fire fell
   into "everything else" and called `scrollToEnd()`, yanking the view
   straight back down to the tail immediately after the jump had
   correctly landed. **Fix**: while a jump target is active
   (`targetMessageId` still set — i.e. still viewing history the user
   explicitly navigated to, not the live tail), skip the default
   scroll-to-bottom branch entirely, including for realtime reloads that
   merge in new messages while reading old history.

**Takeaway (bugs 1-2)**: for any `scrollToIndex`-to-an-arbitrary-position
feature on FlatList, (a) never seed one-shot "pending action" state from
a hook value at a `useRef` declaration — set it inside the effect that
reacts to that value, and (b) audit every existing branch of a shared
`onContentSizeChange`/`onScrollToIndexFailed` handler for "runs on every
fire, not just the one you're adding a case for" — a working two-case
handler can have a hidden assumption ("this only fires once per real
resize") that a third case quietly violates.

**Bug 3 — a single `scrollToEnd()` (or `scrollToIndex`) from far up a
long, mostly-unrendered list falls well short of the true end, and
retrying it doesn't help.** Flagged as a known-but-deferred issue two
sessions earlier (a fresh 50-message load not reliably reaching the true
bottom, confirmed via `git stash` to be pre-existing) — it came back to
actually bite once a "jump to latest" button needed that same call to
work reliably from any scroll position, not just from one row up. Same
root cause as bugs 1-2's `scrollToIndex` failures: FlatList's default
`initialNumToRender` (10) means most of a 40-50 row page is genuinely
unrendered/unmeasured at mount, and `scrollToEnd`'s notion of "the end"
is only as good as what's been measured so far — retrying the same call
after a short delay helps only a little per attempt, requiring several
retries to fully converge. **Fix**: set `initialNumToRender={PAGE_SIZE}`
so the whole page renders immediately at mount — chat bubbles are cheap
enough (mostly text) that this isn't a real performance cost — which
fixes the root cause directly rather than papering over its symptom with
more retries.

**Bug 4 — `onStartReached` fires on the very first mount, before any
real scroll has happened, because scroll position 0 trivially satisfies
"near the start."** A direct consequence of fixing bug 3: once the whole
page renders immediately, the list is — for one instant — genuinely
sitting at scrollTop 0 (the top) before the initial positioning
(scroll-to-bottom, or later, scroll-to-first-unread) has run at all. That
trivially satisfies `onStartReachedThreshold`, so `onStartReached` fires
immediately, and if the initial page happened to come back full
(`hasMoreOlder` true), `handleLoadEarlier` genuinely executes — fetching and
merging in a whole *extra*, unwanted older page right as the real
positioning is still settling. This only reproduces once the initial
fetch returns a full page (so smaller test datasets never triggered it,
which is exactly how it slipped through bug 3's own verification pass
before being caught here). **Fix**: a short grace-period ref
(`readyForLoadEarlierRef`, false until ~600ms after the initial load
resolves — longer than the scroll-settle retries) that `handleLoadEarlier`
checks first, so this specific spurious first fire is ignored while a
real scroll-up later still works normally.

**Takeaway (bugs 3-4)**: fixing a virtualization symptom (bug 3's
retries) can be worse than fixing its cause (`initialNumToRender`) — and
fixing the cause can itself surface a *new*, previously-impossible-to-hit
bug (bug 4) at the boundary where "content exists" and "real user
scrolling" are no longer the same signal FlatList assumes they are. Any
`onStartReached`/`onEndReached` handler should be treated as suspect
during the first render after a (re)mount, not just assumed to only ever
fire from genuine scroll input.

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
- **`router.replace()` back to a Stack's root leaves a spurious back
  button, because `replace` only swaps the current top-of-stack entry
  in place rather than truly popping back to the existing root —
  `router.dismissTo()` fixes that, but only within the same Stack; it
  silently no-ops across sibling tabs.** Founder-reported: click into a
  club (stack becomes `[index, hub]`), tap the Clubs tab again — the
  resulting "My Clubs" list showed an unwanted back button, even though
  it's visually the tab's root screen. Root cause: `router.replace("/clubs")`
  doesn't pop the stack back down to the existing `index` entry, it
  replaces the *top* entry (`hub`) with a brand-new `index` entry,
  so the stack becomes `[index, index]` — still depth 2, so
  `canGoBack()` is still `true`. **First fix**: switch every "return to
  the Clubs root" call site to `router.dismissTo("/clubs")`, which
  actually dispatches a `POP_TO` action that pops back down to an
  *existing* matching route instead of adding a new one. This is
  correct wherever the call happens from a screen already nested inside
  the Clubs tab's own Stack (the hub's back button, the tabPress
  listener's "already on the hub" branch, and post-delete/leave-club
  navigation from `club-profile/index.tsx`, which sits several levels
  deep inside that same Stack). **Regression this introduced**: the
  tabPress listener has a second branch, for when there's no active
  club at all (`!currentClub`) — this one fires from *any* tab
  (Notifications/Calendar/Profile), not just from inside the Clubs
  Stack. `dismissTo`'s `POP_TO` action only bubbles up through nested
  Stacks that are ancestors of the *current* screen; a sibling tab's
  Stack isn't reachable that way, so tapping Clubs from Notifications
  with no active club silently did nothing at all — confirmed by
  reading `StackRouter`'s `POP_TO` handler (`expo-router/build/
  react-navigation/routers/StackRouter.js`): it returns `null` when
  `state.routeNames` (the *current* stack's own routes) doesn't include
  the target, with no cross-tab fallback. **Final fix**: keep
  `dismissTo` only for the within-Clubs-Stack cases above; the
  `!currentClub` branch stays a plain `router.replace("/clubs")`, since
  that one genuinely needs to jump across tabs, not pop within one.
  **Takeaway**: `dismissTo` is for "pop back to a route I'm already
  nested under," not a general-purpose "navigate here from anywhere" —
  reach for `replace`/`navigate` instead whenever the call site can fire
  from a sibling tab or anywhere outside the target's own Stack.

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

### Running natively via Xcode / iOS Simulator

Builds and runs the actual compiled native app, not a browser JS bundle.
No `ios/`/`android/` folder is committed (gitignored, generated on
demand — Expo's "Continuous Native Generation"): never hand-edit `ios/`,
re-run `prebuild` instead whenever `app.json` changes.

```bash
# One-time: install Xcode from the App Store (~15GB), then:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept

npx expo prebuild -p ios   # generates ios/, also installs CocoaPods + runs pod install
npx expo run:ios            # build + launch in the Simulator
```

Three real gotchas hit getting this working:
- **Fresh Xcode ships with zero Simulator runtimes** — `run:ios` fails
  with `No iOS devices available in Simulator.app` until one's
  downloaded: `xcodebuild -downloadPlatform iOS` (~8.5GB, several
  minutes, plus an unpack step not reflected in the progress %).
- **A two-finger trackpad scroll does not scroll a list in the
  Simulator** — only a real click-and-drag (mouse down, move, up)
  translates to a touch event. Looks identical to a broken
  `FlatList`/`ScrollView`; check this before assuming an app bug.
- **Local Supabase must be started separately** — `run:ios` doesn't do
  it. The Simulator shares the Mac's network namespace, so
  `127.0.0.1:54321` works unchanged once both Docker Desktop and
  `supabase start` are actually up (`open -a Docker` first if needed). A
  "fetch failed" sign-in error with no other symptom usually just means
  one of those two isn't running — check `docker ps` before suspecting
  the app.

**Real physical device**: `npx expo run:ios --device`, enable Developer
Mode (Settings → Privacy & Security, reboots the phone), sign with an
Apple ID under Xcode's Signing & Capabilities (free account fine for
local testing, expires after 7 days), then trust the dev cert under
Settings → General → VPN & Device Management on first launch. Critically,
`127.0.0.1` there means the phone itself, not the Mac — swap
`EXPO_PUBLIC_SUPABASE_URL` in `.env` to the Mac's LAN IP
(`ipconfig getifaddr en0`), same WiFi required.

For a shareable build with no cabling (TestFlight-style), see `eas.json`
(task #33) — `eas build --platform ios --profile preview` is a separate,
cloud-based path from everything above.

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
   loads into context every session. The same rule applies to section 4
   — describe current architecture only, not how it got there.
7. **Live browser testing via the Claude-in-Chrome extension** (alternative
   to the headless Playwright MCP flow above — lets you watch it happen
   in a real browser instead of guessing from code):
   - **Machine mismatch gotcha**: `tabs_context_mcp`/`list_connected_browsers`
     can show browsers on *other* physical machines (e.g. a paired Windows
     PC) — `localhost:8081` there resolves to that machine's own loopback,
     not this one, and silently fails to load. Only a browser whose
     `list_connected_browsers` entry has `"isLocal": true` (matching this
     Mac's OS) can reach the dev server here. Always check `isLocal`
     before navigating, not just whichever browser is already selected.
   - **Pairing a Mac-local browser if none shows `isLocal: true`**: call
     `switch_browser` (broadcasts a connect prompt to every Chrome with
     the extension installed), then in the target Chrome window click the
     Claude extension icon and hit **Connect**, naming it something
     identifiable (e.g. "Mac - ClubChat Dev"). Then `select_browser` with
     its returned `deviceId`.
   - **No known passwords for seeded test personas**: this repo's local
     DB already carries a few purpose-built test accounts (e.g. "Requester
     Bob", "Voter Alice", "Header Tester", "Preview Tester" — see the
     `profiles` table), but none of their passwords are recorded anywhere.
     Don't try to guess them. Instead, sign up a brand-new account through
     the app's own `/sign-up` UI (auto-confirmed locally, so no email step),
     then grant it whatever club/race/Eboard membership the test needs
     directly via SQL (`docker exec supabase_db_Club_Chat psql ...` —
     see the "Local Supabase" command block in `CLAUDE.md` for the exact
     invocation). This is how the race-preview screen (task after #47,
     see `docs/HISTORY.md`) was verified live as a plain non-admin member.
