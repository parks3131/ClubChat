# Calendar & Events

**Status:** Shipped

Two views over one merged feed: a month grid for "what is happening when", and a list for "what is coming up".

## Purpose

Turn dates that currently live in chat messages into a real calendar, and merge everything a club schedules — events, races, Eboard meetings, poll deadlines — into one place instead of four.

## User stories

- As a member, I want to see this month at a glance so that I know which days have something on them.
- As a member, I want to tap a day and see what is happening on it so that I do not have to scroll a list.
- As a member, I want one upcoming list across everything the club schedules so that I do not have to check races, meetings, and events separately.
- As a member of several clubs, I want a merged calendar across all of them so that I can spot conflicts.
- As an admin, I want to create an event with a type, a date and time, and a location so that practices and team dinners stop being chat messages.
- As an admin, I want to edit or delete an event when plans change so that the calendar stays trustworthy.
- As a member, I want past events to remain visible so that I can check what we did.

## Scope

**In scope**

- A month-grid calendar with per-day markers, previous/next month paging, and a tap-a-day popup
- A separate Upcoming / Past events list
- Event types: race, practice, team bonding, volunteer, other
- Event detail view; admin create, edit, delete
- Merged feed: calendar events + races + Eboard meetings (+ polls in the list view only)
- Two calendar modes: **club** (one club's feed, with an admin create action) and **global** (every club the user belongs to, read-only, each row tagged with its club name)
- Events reachable from club chat's quick-nav menu

**Out of scope**

| Not in scope | Why |
|---|---|
| RSVP / attendance | No attendance concept anywhere in the product |
| Recurring events | Weekly training is handled by [Routines](05-routines.md) instead |
| External calendar sync (iCal, Google) | Not requested |
| Reminders ahead of an event | Only poll deadlines have a timed reminder today |
| Creating an event from the global calendar | An event is inherently club-scoped; there is no club to attach it to |
| Linking a calendar event to a [Race](06-races.md) | Races are standalone by design — the "race" event type is only a label |

## Behaviour rules

1. **The month grid shows a marker on any day carrying a calendar event, a race, or an Eboard meeting.** Tapping a marked day opens a popup listing that day's items; tapping an item opens it.
2. **Polls are excluded from the month grid** but included in the Upcoming/Past list — a poll has a closing deadline, not a day it happens on.
3. **Days shown from adjacent months as grid filler are never marked or tappable**, so a marker always belongs to the month on screen.
4. **The Upcoming/Past list is one merged, sorted feed** across events, races, meetings, and polls; past items are shown faded, most-recent-first.
5. **A poll is "upcoming" while it is still open**, not by comparing its date — an open-ended poll must never fall into Past.
6. **The Calendar tab shows the active club's feed if the user is inside a club, and a merged cross-club feed otherwise.** In merged mode every row is tagged with the club it belongs to and no create action is offered.
7. **Every read respects the viewer's own access.** An Eboard meeting only appears for Eboard members; a race poll only for race members.
8. **Every race is visible on the calendar to every club member**, whether or not they have race access — tapping through without access leads to the race preview, not the race itself.
9. **Only an admin can create, edit, or delete a calendar event.** Creating one notifies every other club member.
10. **A created event posts a card into club chat** with its title, date, and location, and a link to the full event.
11. **An event carries a type, a title, a date and time, an optional location, and an optional description.**
12. **Creating an event from chat's "+" returns to chat afterwards**, not to the new event's detail screen — the chat card already confirms it.

## Permissions

| Action | Owner | Admin | Member | Non-member |
|---|---|---|---|---|
| View the month grid and the events list | ✅ | ✅ | ✅ | ❌ |
| View an event's detail | ✅ | ✅ | ✅ | ❌ |
| Create an event | ✅ | ✅ | ❌ | ❌ |
| Edit an event (any event, not only their own) | ✅ | ✅ | ❌ | ❌ |
| Delete an event | ✅ | ✅ | ❌ | ❌ |
| View the merged cross-club calendar | ✅ | ✅ | ✅ | — |

## States & edge cases

| State | Behaviour |
|---|---|
| Month with nothing on it | The grid renders with no markers; no error |
| Club with nothing scheduled | "No events yet" |
| Global mode with no clubs, or nothing scheduled anywhere | "No events across your clubs yet." |
| Loading | Spinner; the grid keeps a fixed height so paging months does not jump |
| Load failure | Standard inline load-error with retry |
| Event deleted while its detail screen is open | The user is returned to the list rather than left on a dead screen |
| Direct URL to create/edit as a non-admin | Redirected away |
| Destructive confirm (delete) | Explicit confirmation on every platform, including web |
| Race row tapped without race access | Opens the race preview (name, date, meet information, request-to-join) |

## Acceptance criteria

- [ ] The month grid marks exactly the days carrying an event, race, or Eboard meeting, and marks no filler days.
- [ ] Tapping a marked day lists that day's items and opens each one.
- [ ] Paging to the previous/next month does not change the grid's height.
- [ ] The events list merges events, races, Eboard meetings, and polls into one sorted feed split into Upcoming and Past.
- [ ] An open poll with no deadline stays in Upcoming indefinitely and moves to Past when closed.
- [ ] An Eboard meeting is absent from a non-Eboard-member's calendar.
- [ ] A race appears on every club member's calendar regardless of race access.
- [ ] The Calendar tab shows the active club's feed inside a club and a merged, club-tagged feed outside one.
- [ ] The merged calendar offers no create action.
- [ ] An admin can create, edit, and delete an event; a member sees none of those actions and is redirected off the URLs.
- [ ] Creating an event notifies other club members and posts a card into club chat.
- [ ] Deleting the event removes its chat card.
- [ ] Deleting an event asks for confirmation on web as well as native.

## Product decisions & rejected alternatives

| Decision | Rejected alternative | Why |
|---|---|---|
| Month grid and events list are separate screens | One screen with the grid above the list | Explicit founder request — the calendar should be just the grid |
| Polls appear in the list but not the grid | Put polls on their closing date in the grid | A poll's deadline is not "a day something happens"; it cluttered the grid |
| Poll upcoming/past is decided by open/closed | Compare its date like everything else | An open-ended poll would flip to Past the instant it was created |
| One merged feed built from each feature's own data | A separate calendar table everything writes into | A second copy would drift; the merged read cannot go stale |
| Races are standalone, not spawned from a "race" calendar event | Create a race by adding a race-type event | Matched an actual founder wireframe; the calendar link was designed and never built |
| Every race is visible to every club member on the calendar | Hide races the viewer cannot access | Members need to know a race exists in order to ask to join it |
| Global calendar is read-only | Let the user pick a club and create | Creation is club-scoped; a picker adds a step for a rare case |
| No RSVP | Add attendance | Never requested; the club settles attendance in chat |

## Open questions

- Should the month grid distinguish item types by marker colour rather than a single marker?
- Do members want event reminders (e.g. the morning of), given poll deadlines already have one?
- Should past events be prunable or archivable once a season ends?
- Should the "race" event type be removed, given it has no relationship to a real [Race](06-races.md) and reads as if it does?
