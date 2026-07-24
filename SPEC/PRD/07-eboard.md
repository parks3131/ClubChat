# Eboard & Council

**Status:** Shipped

One private space per club for its admins — the board/captains' side group, made official.

## Purpose

Replace the second GroupMe group the leadership keeps for themselves with a space whose membership stays in sync with who is actually an admin, and that carries the leadership's own meetings and decisions.

## User stories

- As an admin, I want a private space only admins can see so that leadership discussion is not in the club chat.
- As a newly promoted captain, I want to be in that space immediately so that nobody has to remember to add me.
- As a club owner, I want a demoted admin out of that space automatically so that the private space does not leak.
- As an Eboard member, I want to schedule a meeting with a date, time, and a video link so that it is not another chat message.
- As an Eboard member, I want to see who added a meeting so that I know who to ask about it.
- As an Eboard member, I want to run polls inside the Eboard so that leadership decisions do not become a club-wide vote.
- As an admin who does not want to be involved, I want to leave the space so that I stop getting its notifications.

## Scope

**In scope**

- Exactly one Eboard & Council space per club, created automatically with the club
- Membership that tracks admin-tier role changes automatically
- A request-to-join / add-member path for admins who are not currently members
- Its own chat, with full parity to club chat (Highlights, gallery, attachments, mentions, pins, announcements)
- Meetings: title, description, date and time, optional link; Upcoming / Past list and detail view
- Eboard-scoped polls
- Space identity: name, description, avatar
- Leave the space; delete the space

**Out of scope**

| Not in scope | Why |
|---|---|
| More than one Eboard space per club | It is *the* leadership space, not a general sub-group mechanism |
| A separate "Eboard admin" role | Every member is already a club admin |
| Meeting attendance or RSVP | No attendance concept anywhere in the product |
| Meeting minutes or agendas as structured documents | The description field plus chat covers it |
| Recurring meetings | Not requested |
| Non-admin members (a "council" of ordinary members) | Membership is always a subset of club admins |

## How this deliberately differs from a Race

Both are mini-clubs nested under a club, but their membership models are opposites:

| | Race | Eboard & Council |
|---|---|---|
| Who may be a member | Any club member | Club admins only |
| How a member gets in | Requests, or is added by any club admin | **Automatically, on becoming admin-tier** |
| Does admin status grant membership? | **No** — an admin must still join like anyone else | **Yes** — promotion auto-joins, demotion auto-removes |
| Who approves requests / adds members | Any club admin, from outside | **Existing members only** — not "any club admin" |
| Who can remove a member | Any club manager | **The club Owner only** |
| How many per club | Many | Exactly one |
| Who can create one | Any club admin | Nobody — it is created with the club |
| Who can create content inside | Admins only (polls) | **Any member** (meetings and polls both) |

The consequence worth stating plainly: **the request-to-join path exists, but in normal operation nobody uses it.** It only matters for an admin who deliberately left the space and wants back in, or an admin-tier row that predates automatic syncing. An admin who is not a member can see the space exists and can request or be added; they cannot read anything inside it.

> Implementation: see [TECH/02-security-rls.md](../TECH/02-security-rls.md).

## Behaviour rules

1. **Every club has exactly one Eboard & Council space, created automatically at club creation**, with the Owner as its first member.
2. **Promotion to Admin or Owner auto-joins that person to the Eboard space; demotion to Member auto-removes them.**
3. **An ownership transfer changes nothing** about Eboard membership — both parties stay admin-tier.
4. **Only club admins can see the space exists.** Ordinary members have no visibility of it, its chat, its meetings, or its polls.
5. **Only current members can read or post in Eboard chat**, approve requests, or add other admins.
6. **Any Eboard member can create a meeting or a poll** — there is no further role distinction inside.
7. **Only the meeting's creator can edit or delete it.** Everyone else is view-only, and the detail view shows "Added by <name>".
8. **Creating a meeting notifies the other Eboard members and posts a card into Eboard chat**, with a link to the meeting.
9. **A meeting carries a title, a description, a date and time, and an optional link** (video call, agenda doc, anything).
10. **Meetings are listed as Upcoming and Past**, and appear on the calendar of Eboard members only.
11. **Any member can leave the Eboard space.** Removing someone else is Owner-only.
12. **Deleting the space is restricted to existing members** and takes its chat history, meetings, and polls with it.
13. **A member entering the space is taken straight to Eboard chat** — chat is its home screen, with Meetings and Polls reached from the chat header menu.

## Permissions

| Action | Eboard member | Club admin, not a member | Club member | Non-member of the club |
|---|---|---|---|---|
| Know the space exists | ✅ | ✅ | ❌ | ❌ |
| Request to join | — | ✅ | ❌ | ❌ |
| Read / post in Eboard chat | ✅ | ❌ | ❌ | ❌ |
| Pin / announce in Eboard chat | ✅ | ❌ | ❌ | ❌ |
| Approve requests / add another admin | ✅ | ❌ | ❌ | ❌ |
| Remove another member | Club Owner only | ❌ | ❌ | ❌ |
| Create a meeting | ✅ | ❌ | ❌ | ❌ |
| Edit / delete a meeting | creator only | ❌ | ❌ | ❌ |
| View meetings | ✅ | ❌ | ❌ | ❌ |
| Create / view / vote in an Eboard poll | ✅ | ❌ | ❌ | ❌ |
| Edit the space's name / description / avatar | ✅ | ❌ | ❌ | ❌ |
| Leave the space | ✅ | — | — | — |
| Delete the space | ✅ | ❌ | ❌ | ❌ |

## States & edge cases

| State | Behaviour |
|---|---|
| Admin who is a member opens the space | Redirected straight into Eboard chat |
| Admin who left the space opens it | Sees name and description plus "Request to join" / "Requested" |
| Ordinary member hits any Eboard URL directly | Redirected away |
| No meetings yet | Empty state; any member can create one |
| A meeting's link is missing | The link row is simply absent |
| Non-creator opens a meeting's edit URL directly | Redirected away |
| Meeting deleted while open elsewhere | Its chat card disappears; the viewer is returned to the list |
| Member demoted while inside the space | They lose membership and access |
| Loading / load failure | Spinner, then a standard inline load-error with retry |
| No back history (deep link, refresh) | Back from Eboard chat lands on the club hub, never on a screen that bounces back into chat |

## Acceptance criteria

- [ ] A newly created club already has an Eboard & Council space with the Owner as a member.
- [ ] Promoting a member to admin puts them in the Eboard space without any further action.
- [ ] Demoting an admin removes them from the Eboard space.
- [ ] Transferring ownership leaves both parties' Eboard membership unchanged.
- [ ] An ordinary member has no visibility of the space and is redirected off its URLs.
- [ ] A club admin who left the space can see it exists, can request to join, and can read nothing inside until admitted.
- [ ] Only existing members can approve that request or add another admin.
- [ ] Only the club Owner can remove another Eboard member.
- [ ] Any member can create a meeting; only its creator sees Edit and Delete.
- [ ] A meeting's detail view names who added it.
- [ ] Creating a meeting notifies other members and posts a card into Eboard chat with a working link.
- [ ] An Eboard meeting appears on the calendar of members only.
- [ ] Any member can create an Eboard poll, and it is invisible to the rest of the club.
- [ ] A member can leave the space and afterwards has no access.

## Product decisions & rejected alternatives

| Decision | Rejected alternative | Why |
|---|---|---|
| Exactly one per club, auto-created | An admin creates it manually the first time | The manual "+ Create" step was pure friction; every club wants one |
| Membership tracks admin-tier automatically | Keep the original request-only model | Leadership churn meant the space drifted out of sync with who was actually an admin |
| Not shaped like a Race | Reuse Race's model wholesale | Race deliberately separates authority from access; for Eboard the two are the same thing |
| Approve/add rights belong to existing members, not "any club admin" | Mirror Race's "any club admin decides" | Otherwise an admin outside the space could add themselves in, defeating the privacy boundary |
| Removing a member is Owner-only | Any member can remove any other | Highest-trust space in the product; mutual ejection is not acceptable |
| Any member can create meetings and polls | Restrict to a chair or the creator | Every member is already a club admin; a further tier would be constant |
| Meetings are creator-only to edit and delete | Any member can edit, like Race Meet Info and Routines | Two explicit founder follow-ups after meetings first shipped |
| Meetings carry a link, not a video integration | Embed a calling provider | The club already uses Zoom/Meet; a link is enough |
| Chat is the home screen | Keep a hub grid of the space's features | Matches the club and race chat-first restructure |

## Open questions

- Should demotion warn the demoting admin that it will eject the person from the Eboard space?
- Should an admin who left be reminded that the space exists, or is silence correct?
- Should meetings support an agenda or minutes field distinct from the description?
- Is "Eboard & Council" the right default name for every club, or should it be club-configurable at creation?
