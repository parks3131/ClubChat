# Personas & Roles

**Status:** Shipped

Who uses ClubChat, what authority each role carries, and - critically - where authority stops propagating.

## Personas

| Persona | Who they are | What they need |
|---|---|---|
| **Club Owner / founder** | The person who created the club, or whoever ownership was handed to | Full control: club identity, join policy, who is an admin, and the ability to delete the club or hand it over |
| **Captain / Admin** | Team captains, board members, coaches | Author the week's workouts, run the calendar, create races, approve joiners, post announcements and news |
| **Ordinary member** | A runner/swimmer/climber in the club | Read everything the club shares, chat, react, vote, join races they are running, see who is driving |
| **Prospective member** | Someone who has the link or found the club by name | Get in - instantly if the club is open, by request otherwise |

## Role hierarchy

**Owner > Admin > Member.** Owner is a strict superset of Admin: every admin-gated capability in the product is automatically available to the Owner.

1. **Every club has exactly one Owner at all times** - enforced at the data layer, not just in the UI.
2. **Ownership is transferable.** The Owner hands it to any other current member; the outgoing Owner becomes an Admin.
3. **The Owner cannot leave their own club** and cannot be removed. Transfer first.
4. **Roles are per club.** A user is an Owner of one club and a plain Member of another with no interaction between the two.

## Where roles do NOT propagate

This is the most-misunderstood part of the model, and it is deliberate.

| Boundary | Rule |
|---|---|
| **Club admin → race chat** | Being a club admin grants **management authority** over every race in the club (approve/add/remove members, edit meet information, manage car groups, delete the race) but **not** access to the race's chat, polls, or car-group membership. Those require a real roster row - the admin must request to join or be added like anyone else. |
| **Club admin → race car group** | An admin who is not on the race roster cannot be assigned to a car group, even though they can manage the groups. |
| **Club admin → race polls** | Creating or even seeing a race poll requires being on the race roster *and* being an admin. |
| **Club admin → Eboard membership** | Admin-tier membership does grant Eboard membership - automatically, and it is revoked automatically on demotion. But an admin who chooses to leave the Eboard space must request or be re-added; admin status alone does not re-admit them. |
| **Race roster → parent club** | Race membership is always a subset of club membership. Leaving the club removes every race and Eboard row for that club. |

> Implementation: see [TECH/02-security-rls.md](../TECH/02-security-rls.md).

## Consolidated permission matrix

"Admin" below means Admin **or** Owner unless a row calls out Owner specifically.

### Club

| Action | Owner | Admin | Member | Non-member |
|---|---|---|---|---|
| Read club chat / calendar / routines / news / races list | ✅ | ✅ | ✅ | ❌ |
| Send messages, react, report a message | ✅ | ✅ | ✅ | ❌ |
| Pin / unpin, post an announcement | ✅ | ✅ | ❌ | ❌ |
| Delete any message | ✅ | ✅ | own only | ❌ |
| Edit club name / description / avatar / join policy | ✅ | ✅ | ❌ | ❌ |
| Share or copy the join link | ✅ | ✅ | ❌ | ❌ |
| Add a member directly; approve/deny join requests | ✅ | ✅ | ❌ | ❌ |
| Promote Member → Admin, demote Admin → Member | ✅ | ✅ | ❌ | ❌ |
| Remove a Member | ✅ | ✅ | ❌ | ❌ |
| **Remove an Admin** | ✅ | ❌ | ❌ | ❌ |
| **Transfer ownership** | ✅ | ❌ | ❌ | ❌ |
| Leave the club | ❌ | ✅ | ✅ | - |
| **Delete the club** | ✅ | ❌ | ❌ | ❌ |

### Club content

| Action | Owner | Admin | Member | Non-member |
|---|---|---|---|---|
| Create/edit/delete a calendar event | ✅ | ✅ | ❌ | ❌ |
| Create/edit/delete a routine workout | ✅ | ✅ | ❌ | ❌ |
| Create/edit/delete a News & Highlights post (any admin, any post) | ✅ | ✅ | ❌ | ❌ |
| React to a News post | ✅ | ✅ | ✅ | ❌ |
| Create a club poll | ✅ | ✅ | ❌ | ❌ |
| Vote in a club poll | ✅ | ✅ | ✅ | ❌ |
| Close / reopen / delete a poll | creator only | creator only | creator only | ❌ |

### Race (see [Races](06-races.md))

| Action | Club Owner/Admin (manager) | Race member | Club member, not on roster |
|---|---|---|---|
| Create a race | ✅ | ❌ | ❌ |
| See the race in lists / preview name, date, meet info | ✅ | ✅ | ✅ |
| Request to join | ✅ | - | ✅ |
| Approve/deny requests, add or remove roster members | ✅ | ❌ | ❌ |
| Read/post in race chat | only if also on the roster | ✅ | ❌ |
| Edit Meet Information | ✅ | ❌ | ❌ |
| Create/delete car groups, assign members, set Incharge | ✅ | ❌ (view only) | ❌ |
| Be assigned to a car group | only if also on the roster | ✅ | ❌ |
| Create a race poll | only if also on the roster | ❌ | ❌ |
| See/vote in a race poll | only if also on the roster | ✅ | ❌ |
| Leave the race | ✅ (own row) | ✅ | - |
| Edit race identity / delete the race | ✅ | ❌ | ❌ |

### Eboard & Council (see [Eboard](07-eboard.md))

| Action | Eboard member | Club admin, not an Eboard member | Club member |
|---|---|---|---|
| See that the space exists | ✅ | ✅ | ❌ |
| Read/post in Eboard chat | ✅ | ❌ | ❌ |
| Request to join / be added | - | ✅ | ❌ |
| Approve requests, add members | ✅ | ❌ | ❌ |
| Create a meeting or a poll | ✅ | ❌ | ❌ |
| Edit/delete a meeting | creator only | ❌ | ❌ |
| Remove another Eboard member | Club Owner only | ❌ | ❌ |
| Leave the Eboard space | ✅ | - | - |

## Behaviour rules

1. **Promotion to admin-tier auto-joins the Eboard space; demotion auto-removes.** An ownership transfer is a no-op for Eboard membership, since both sides stay admin-tier.
2. **Removing someone from a club cascades** - their race rosters, car-group assignments, and Eboard membership for that club are cleaned up in the same action.
3. **A role change is announced in club chat** as a system message and as a notification to the affected member.
4. **Role badges are visible** on the club list and the member roster, so authority is never guessed.

## Product decisions & rejected alternatives

| Decision | Rejected alternative | Why |
|---|---|---|
| Three tiers (Owner/Admin/Member) | Two tiers with an implicit, non-transferable "creator" | The creator concept could not be handed over; a founder leaving the club left it undeletable and its Eboard unmanageable |
| Owner cannot self-remove | Allow it and pick a successor automatically | Safety default inferred from "exactly one Owner at all times" - an ownerless club has no recovery path |
| Remove-an-Admin is Owner-only, but demote-an-Admin is any-admin | Symmetric permissions | Admins policing each other's role is normal; admins ejecting each other outright is not |
| No separate "race admin" role | A per-race admin role | Club admins already have full management authority over every race; a second role would need its own assignment UI for no new capability |
| No separate "Eboard admin" role | Mirror the club's own role tiers inside Eboard | Every Eboard member is guaranteed to already be a club admin, so the role would be constant |
| Club admin gets authority over a race but not its chat | Auto-join every admin to every race (this was built, then reversed) | An admin auto-added to 30 races is drowning in chat for races they are not running; explicit founder reversal |

## Open questions

- Should an Admin be able to see (not act on) an Eboard space they are not a member of, beyond knowing it exists?
- Is there a need for a read-only "alumni" or "coach" tier that sees the calendar but not chat?
- Should ownership transfer require the recipient to accept, rather than taking effect immediately?
