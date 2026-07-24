# ClubChat — Product Overview

**Status:** Shipped (MVP feature-complete; not yet publicly released)

ClubChat replaces the GroupMe-plus-spreadsheets stack a sports club uses to coordinate itself with one structured app every club can adopt as a template.

## The problem

A running club coordinates entirely through GroupMe plus ad-hoc tools:

| What they need | What they do today | Why it breaks |
|---|---|---|
| A weekly workout plan | Written in Excel, screenshotted, pasted into chat, manually "pinned" | Not searchable, not dated, buried by chat volume, one screenshot per week |
| Race logistics (carpools, meeting times, results) | A brand new GroupMe group spun up per race | Group sprawl, no roster continuity, dies after the race |
| Announcements | A normal message someone remembers to pin | Indistinguishable from chatter |
| A private admin/captain space | A second GroupMe group | Manually maintained, drifts out of sync with who is actually an admin |
| Club calendar | Messages | Nothing is a date |

None of this is structured. It works only because members manually replicate structure GroupMe does not provide.

## The product bet

**Give clubs the structure they are already faking by hand.** Every artifact they improvise — the pinned workout screenshot, the per-race GroupMe, the admin side-group, the "who's driving" message thread — becomes a first-class object with its own membership, permissions, and history.

## Product principles

1. **A Race is a Club nested one level down.** Same shape — membership, roster, chat, its own sub-features. Not a special-purpose "event" screen. Same for the admin-only Eboard & Council space.
2. **Structure, not features.** Every addition must replace something members currently do by hand, not add a new thing to maintain.
3. **Deliberately simple where the founder said simple.** Routines carry a title and a description, not a structured exercise builder. Races carry a name and a date, not a full event schema.
4. **Chat is the centre of gravity.** Chat is where a club actually lives; every other feature is reachable from chat, and things created elsewhere post themselves back into chat.
5. **Access is earned per space, not inherited.** Being a club admin grants authority over a race, but not automatic membership of its chat — see [Personas & roles](01-personas-and-roles.md).

## Goals

- Replace GroupMe as the club's primary coordination surface.
- Make a race's logistics survive as durable, revisitable structure instead of a disposable group chat.
- Make weekly training plans first-class, dated, and per-sport rather than a screenshot.
- Work as a **template** — a swim club, a running club, and a climbing club should all fit without customisation work.

## Non-goals

| Not building | Why |
|---|---|
| A training-data / activity-tracking platform | Strava exists; ClubChat plans workouts, it does not record them |
| Workout completion tracking | Explicit founder scoping call — routines are a plan, not a checklist |
| Structured exercise builders (sets/reps/splits) | Explicit "keep it very simple" scoping call |
| RSVP on events or meetings | No attendance concept anywhere in the product |
| Cross-club discovery / social graph | Clubs are found by name or by an invite link, nothing more |
| Direct messages between members | Every conversation is scoped to a club, race, or Eboard space |
| An "invite-only" club tier | Covered by `request` join policy plus a private share link — see [Clubs & membership](02-clubs-and-membership.md) |

## MVP prioritisation (as agreed with the founder)

1. Club chat
2. Club create/join plus roles
3. Calendar
4. Weekly routines
5. The full Race sub-flow (sub-chat, meet info, carpool, results)
6. Polls

All six shipped, in that order.

## Feature status

| Area | Status | PRD |
|---|---|---|
| Personas, roles, permission matrix | Shipped | [01-personas-and-roles.md](01-personas-and-roles.md) |
| Clubs, joining, membership, roster | Shipped | [02-clubs-and-membership.md](02-clubs-and-membership.md) |
| Chat (text, photos, documents, reactions, pins, announcements, mentions, moderation) | Shipped | [03-chat.md](03-chat.md) |
| Calendar and events | Shipped | [04-calendar-and-events.md](04-calendar-and-events.md) |
| Weekly routines | Shipped | [05-routines.md](05-routines.md) |
| Races & Meets (roster, chat, meet info, car groups, polls, pins) | Shipped | [06-races.md](06-races.md) |
| Eboard & Council (private admin space, meetings) | Shipped | [07-eboard.md](07-eboard.md) |
| Polls (club, race, Eboard scoped) | Shipped | [08-polls.md](08-polls.md) |
| News & Highlights | Shipped | [09-news-and-highlights.md](09-news-and-highlights.md) |
| Notifications | Shipped | [10-notifications.md](10-notifications.md) |
| Profile and account | Shipped | [11-profile-and-account.md](11-profile-and-account.md) |
| Non-functional requirements | Partial | [12-nonfunctional-requirements.md](12-nonfunctional-requirements.md) |
| Roadmap and open questions | — | [13-roadmap-and-open-questions.md](13-roadmap-and-open-questions.md) |

## Platforms

iOS, Android, and web from one codebase. Web is primarily a development and testing surface; the product is designed phone-first.

> Implementation: see [TECH/00-architecture.md](../TECH/00-architecture.md).
