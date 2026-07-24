# Races & Meets

**Status:** Shipped

A race is a mini-club nested inside a club - its own roster, its own chat, its own logistics - replacing the throwaway GroupMe group spun up per race.

## Purpose

Make a race's coordination durable and structured: who is going, where everyone is meeting, who is driving whom, where the results ended up - all in one space that survives the race instead of dying with a group chat.

## User stories

- As an admin, I want to create a race with just a name and a date so that setting one up takes seconds.
- As a member, I want to see every race the club has and ask to join the ones I am running so that I am not added to races I am not going to.
- As an admin, I want to approve requests or add people directly so that the roster reflects who is actually travelling.
- As a race member, I want a chat scoped to this race so that its logistics do not drown the main club chat.
- As a member deciding whether to go, I want to see the race's meeting point, hotel, and description before I have access so that I can make the call.
- As an admin, I want to post the meeting point, hotel link, photos link, and results link in one place so that they stop being five separate chat messages.
- As an admin, I want to organise everyone into car groups with someone in charge of each car so that nobody is left without a ride.
- As a member, I want to see which car I am in and who is in charge of it so that I know where to be.
- As a member, I want to pin the races I care about so that my club hub shows them first.
- As a race member, I want polls scoped to this race so that "what time do we leave" is decided here, not in the club chat.

## Scope

**In scope**

| Capability | Notes |
|---|---|
| Standalone race creation | Name and date only |
| Races list | Upcoming / Finished, with per-race access state |
| Race preview | Name, date, and Meet Information for club members without race access, plus the request action |
| Request-to-join roster | Approve, deny, add directly, remove, leave |
| Race chat | Full parity with club chat, including Highlights and gallery |
| Meet Information | Five fields, edited as one form |
| Car Assignments & Groups | Auto-numbered groups, one Incharge each |
| Race polls | Roster-scoped |
| Race identity | Avatar, name, date, editable by managers |
| Per-user race pins | Personal curation of the club hub's race preview |
| Delete race | Manager-only, cascades |

**Out of scope**

| Not in scope | Why |
|---|---|
| A separate "race admin" role | Club admins already have full management authority |
| An "open" join policy for races | Races are always request-based |
| Linking a race to a calendar event | Races are standalone; the calendar merges them in as a read |
| A race-specific workout plan | In the original vision, never built - see [Routines](05-routines.md) open questions |
| Structured results (times, placings) | Only a link to wherever results actually live |
| Structured start/end times, or a travel itinerary | Covered by the free-text Meet Information description |
| Car capacity limits or seat counts | Groups are open-ended lists |

## Behaviour rules

### Creation and access

1. **A race is created with a name and a date only**, by a club admin, from the club's own Races & Meets list.
2. **Every club member can see every race exists** - in the races list, on the calendar, and in the club hub preview.
3. **Access is always by request.** A club member requests; any club admin approves, denies, or adds them directly.
4. **A club admin is a "manager" of every race in their club** - full management authority - but **management authority is not access**. Chat, polls, and car-group assignment all require a real roster row, for admins too.
5. **A manager who is not on the roster** sees a request-to-join screen plus a way into the roster to manage others, not the race itself.
6. **A club member with no access who taps a race** gets a preview: name, date, Meet Information, and the request action. Nothing member-only is exposed.
7. **A race member is redirected straight into race chat** on entering the race - chat is the race's home screen, and everything else is reached from its header menu.
8. **Any race member can leave the race**, which also removes them from their car group.
9. **Leaving the parent club removes the user from every race in it.**

### Meet Information

10. **Five fields, edited together as one form**: description, race/event location link, hotel link, photos link, results link.
11. **Any manager can edit all five** - this is not restricted to whoever created the race.
12. **Empty-state behaviour differs per field, deliberately**: description, location, and hotel are hidden entirely when empty; photos and results always show a "stay tuned" placeholder.
13. **Meet Information is readable by any club member**, including those without race access - it is the information they need to decide whether to go.

### Car Assignments & Groups

14. **Groups are auto-numbered on creation** - "Group 1", "Group 2" - with no naming prompt.
15. **A person can be in at most one car group per race.**
16. **Only people with real race access can be added to a group** - the add-member search excludes anyone already in any group for that race.
17. **Each group can have one designated Incharge**, who must be a current member of that group.
18. **If the Incharge leaves or is removed, the group's Incharge is cleared automatically** and every club admin is notified that the group needs a new one. The rest of the group is untouched.
19. **A plain member leaving a group is a non-event** - no notification. Any member can leave their own car group without leaving the race.
20. **Every race member can view the groups, including the Incharge tag**, read-only. Only managers can create, delete, assign, or remove.

### Pins

21. **Pinning a race is personal.** Each member pins for themselves; it affects only their own club-hub preview, never anyone else's.
22. **Any member can pin any race they can see** - pinning is not admin-gated.

## Permissions

| Action | Club Owner/Admin (manager) | Race member | Club member, no race access | Non-member of the club |
|---|---|---|---|---|
| Create a race | ✅ | ❌ | ❌ | ❌ |
| See the race exists; see name, date, Meet Information | ✅ | ✅ | ✅ | ❌ |
| Request to join | ✅ | - | ✅ | ❌ |
| Approve / deny requests; add or remove roster members | ✅ | ❌ | ❌ | ❌ |
| Read / post in race chat | roster row required | ✅ | ❌ | ❌ |
| Pin / announce in race chat | roster row required | ❌ | ❌ | ❌ |
| Edit Meet Information | ✅ | ❌ | ❌ | ❌ |
| Edit race name / date / avatar | ✅ | ❌ | ❌ | ❌ |
| View car groups | ✅ | ✅ | ❌ | ❌ |
| Create/delete groups, assign members, set Incharge | ✅ | ❌ | ❌ | ❌ |
| Be assigned to a car group | roster row required | ✅ | ❌ | ❌ |
| See / vote in race polls | roster row required | ✅ | ❌ | ❌ |
| Create a race poll | roster row required | ❌ | ❌ | ❌ |
| Pin the race to their own hub | ✅ | ✅ | ✅ | ❌ |
| Leave their own car group | ✅ | ✅ | - | - |
| Leave the race | ✅ (own row) | ✅ | - | - |
| Delete the race | ✅ | ❌ | ❌ | ❌ |

## States & edge cases

| State | Behaviour |
|---|---|
| Club with no races | The hub shows "No upcoming races yet"; the races list is empty |
| Race with an empty roster | The roster screen shows the empty state and the add-member action |
| Pending request | The row and the preview both show "Requested - waiting on an admin to approve" |
| Request denied | The user can request again |
| Manager, not on the roster, opens the race | Request-to-join screen plus a "Manage roster" entry point |
| Non-member opens a race chat/polls/carpool URL directly | Redirected out |
| No race access at all, taps a race from the hub or calendar | Race preview screen |
| Meet Information entirely empty | Description/location/hotel hidden; photos and results show "stay tuned" |
| Group whose Incharge just left | Group persists with no Incharge; club admins are notified |
| Adding a member who is already in another group | They do not appear in the add search |
| Loading / load failure | Spinner, then a standard inline load-error with retry |
| Race deleted | Its chat history, roster, car groups, Meet Information, and polls all go with it; the confirmation says so |
| No back history (deep link, refresh) | Back from race chat lands on the races list, never on a screen that bounces back into chat |

## Acceptance criteria

- [ ] An admin can create a race with a name and a date, and it appears in Upcoming for every club member.
- [ ] A club member with no access sees the race and can request to join; the request appears in the admin's inbox.
- [ ] Approving the request grants chat access and notifies the requester; denying it notifies them too.
- [ ] An admin who is not on the roster cannot open race chat, race polls, or be assigned to a car group, but can manage the roster and edit Meet Information.
- [ ] A race member entering the race lands directly in race chat.
- [ ] Race chat supports everything club chat does: photos, documents, reactions, mentions, pins, announcements, Highlights, gallery.
- [ ] Meet Information's five fields save together; empty description/location/hotel are hidden and empty photos/results show the placeholder.
- [ ] Meet Information is visible on the preview screen to a club member with no race access.
- [ ] Creating a car group produces "Group 1", then "Group 2", with no naming prompt.
- [ ] A person can only be added to one group per race, and only if they are on the roster.
- [ ] Setting an Incharge only offers current members of that group.
- [ ] Removing the Incharge from the group clears the Incharge and notifies club admins; removing a plain member does not notify.
- [ ] A race member sees the groups and Incharge tags read-only, with no management controls.
- [ ] Pinning a race changes only the pinner's own hub preview.
- [ ] A member can leave their car group without leaving the race, and can leave the race entirely.
- [ ] Leaving a race removes the user from its chat and from their car group.
- [ ] Deleting a race removes it everywhere, including from the calendar.

## Product decisions & rejected alternatives

| Decision | Rejected alternative | Why |
|---|---|---|
| Races are created standalone, name and date only | Spawned from a "race" type calendar event, as originally sketched | Matched an actual founder wireframe once the feature was scoped in detail; the calendar-linked version was never built |
| A race is the same shape as a club, one level down | A bespoke "event with attendees" screen | Reusing membership + chat gave race chat full feature parity for free |
| Always request-based | Offer an open policy like clubs have | Race rosters are travel logistics; an instant-join race is not a real use case |
| No race admin role | Add one | Club admins already have full authority over every race |
| Club admins get authority but not access | Auto-join every admin to every race (built, then reversed) | Explicit founder reversal - an admin auto-added to every race drowns in chat for races they are not running |
| Meet Information is one merged form | Two separate sections (Photos/Results, and Location/Accommodation), as originally shipped | Founder follow-up immediately after both shipped separately |
| Per-field empty-state behaviour differs | Uniform placeholders everywhere | Explicit founder choice - photos and results are expected later, a missing hotel link usually means there is no hotel |
| Any manager edits Meet Information | Creator-only, like Eboard meetings | Matches the club's calendar/routines model; the race creator is often not the person with the hotel booking |
| Car groups are auto-numbered | Prompt for a name | From a founder wireframe; naming eight cars is friction with no payoff |
| One group per person per race | Allow multiple | A person can only be in one car |
| Race pins are per-user | An admin-set, club-wide pinned flag (built first, then corrected) | Founder correction: "anyone can pin for themselves, not admin pins for all" |
| Race polls require a roster row even for admins | Let managers create polls without joining | Matches Eboard's model; a poll for people travelling should be authored by someone travelling |
| Results is a link, not structured data | Model finishing times and placings | Results already live in a timing provider's site or a shared album |

## Open questions

- Should a race carry a start/end time, or is the free-text description enough?
- Should car groups have capacity, so an admin can see when a car is full?
- Should a finished race be archivable, so the races list does not grow forever?
- Should the "race-specific workout plan" from the original vision be built, or is it dead?
- Should a manager be able to hand a specific race to a non-admin race captain without making them a club admin?
