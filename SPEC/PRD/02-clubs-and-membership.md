# Clubs & Membership

**Status:** Shipped

A club is the persistent, top-level space a team lives in; everything else in ClubChat hangs off one.

## Purpose

Give a team one durable home with a known roster, a known set of admins, and a controlled way in - replacing an unmanaged group chat that anyone can add anyone to.

## User stories

- As a club founder, I want to create a club in one form so that I can get my team off GroupMe the same evening.
- As a club founder, I want to choose whether joining is instant or needs my approval so that I control who ends up in my team's chat.
- As an admin, I want to share one link so that new members can join without me typing a code out to each of them.
- As a prospective member, I want to find my club by name so that I can join without waiting for someone to send me anything.
- As an admin, I want to approve or deny pending requests from one place so that nobody sits waiting indefinitely.
- As an admin, I want to promote a captain to admin so that I am not the only person who can post the week's plan.
- As a member, I want to see who else is in the club and open their profile so that I know who I am running with.
- As a member, I want to leave a club I am no longer part of so that I stop getting its notifications.
- As an owner, I want to hand the club over when I graduate so that the club survives me.

## Scope

**In scope**

- Club creation (name, sport, description, join policy)
- Club identity: avatar, name, description, editable by any admin
- Two join policies: **open** and **request**
- Search a club by name, and join or request from the result
- A shareable join link (and a manual code entry fallback) that always joins instantly regardless of join policy
- Member roster with role badges, promote/demote, remove, add-by-search
- Pending join requests: approve/deny
- Leave club; delete club
- Ownership transfer
- A club gallery of every photo posted in the club's chat

**Out of scope**

- Club discovery beyond exact-ish name search (no categories, no browse, no recommendations)
- Multiple owners, or co-owner roles
- Sub-teams within a club other than [Races](06-races.md) and [Eboard](07-eboard.md)
- Paid membership, dues, or waivers
- Per-member custom fields set by the club

## Behaviour rules

1. **A club is created with a name, a sport, an optional description, and a join policy.** The creator becomes its Owner.
2. **A new club is provisioned with its main chat and its Eboard & Council space automatically** - no separate setup step, and the Owner is a member of both immediately.
3. **`open` policy:** finding the club by name and tapping Join adds the user immediately, no approval.
4. **`request` policy:** finding the club by name files a pending request; an admin must approve or deny it.
5. **The join link and manual invite code always join instantly**, regardless of join policy. It is a private side channel deliberately independent of the public search path.
6. **Switching a club from `request` to `open` auto-approves every request currently pending**, rather than leaving them stranded with no approval step left in the product.
7. **Join policy is editable after creation**, not fixed at creation time.
8. **Approving a request, adding a member directly, removing a member, and changing a role each post a system message into club chat** and notify the people affected.
9. **A member can leave any club they are not the Owner of.** Leaving removes them from every race roster, car group, and the Eboard space for that club in the same action.
10. **Deleting a club is permanent and Owner-only** - chat history, members, races, Eboard space, polls, and posts all go with it. The confirmation names the club and states this explicitly.
11. **The roster shows every member with their role badge**; tapping a member opens their read-only profile card.
12. **Adding a member directly is a search over users**, not an invitation the recipient must accept.
13. **The club name is tappable from any club screen's header**, leading to the club profile - the club's identity (avatar, name, description), its join-link actions, and links onward to Members and Gallery.
14. **Identity and the member roster are separate screens.** The club profile carries identity and settings; Members is its own screen holding the roster, pending requests, and the add-member search. [Races](06-races.md) and the [Eboard space](07-eboard.md) follow the same split - a profile screen plus a separate roster screen.

## Permissions

| Action | Owner | Admin | Member | Non-member |
|---|---|---|---|---|
| Create a club | ✅ (anyone signed in) | ✅ | ✅ | ✅ |
| Search clubs by name | ✅ | ✅ | ✅ | ✅ |
| Join an open club / request to join | - | - | - | ✅ |
| Join via link or code | ✅ | ✅ | ✅ | ✅ |
| View roster and member profiles | ✅ | ✅ | ✅ | ❌ |
| View club gallery | ✅ | ✅ | ✅ | ❌ |
| Edit name / description / avatar / join policy | ✅ | ✅ | ❌ | ❌ |
| Share or copy the join link | ✅ | ✅ | ❌ | ❌ |
| Approve / deny join requests | ✅ | ✅ | ❌ | ❌ |
| Add a member directly | ✅ | ✅ | ❌ | ❌ |
| Promote / demote between Member and Admin | ✅ | ✅ | ❌ | ❌ |
| Remove a Member | ✅ | ✅ | ❌ | ❌ |
| Remove an Admin | ✅ | ❌ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ | ❌ |
| Leave the club | ❌ | ✅ | ✅ | - |
| Delete the club | ✅ | ❌ | ❌ | ❌ |

## States & edge cases

| State | Behaviour |
|---|---|
| No clubs yet | The clubs list shows an empty state with Create and Join actions |
| Search returns nothing | "No clubs found" - no suggestion to create one with that name |
| Already a member of a searched club | The result shows membership rather than a Join button |
| Request already pending | The result shows "Requested" and the action is disabled |
| Invite code typed with the wrong case | Accepted - codes are matched case-insensitively even though the UI styles them uppercase |
| Invalid or expired code | Inline "Invalid invite code" error, form stays filled |
| Join link opened while signed out | The user is routed to sign-in first, then the join completes |
| Join link opened twice | The second attempt is a no-op, not an error |
| Load failure (roster, profile, list) | A standard inline load-error state with a retry, never a blank screen |
| Owner tries to leave | The Leave action is not shown at all - transfer is the only path |
| Last admin removed | Not possible: the Owner is always admin-tier and cannot be removed |
| Deleted club still open on another device | Reads fail and the user is returned to the clubs list |

## Acceptance criteria

- [ ] Creating a club lands the creator on the club hub as Owner, with a working main chat.
- [ ] A newly created club already has an Eboard & Council space with the Owner as a member.
- [ ] An open club can be found by name and joined in one tap, with no admin action.
- [ ] A request club can be found by name, files a pending request, and shows "Requested" until decided.
- [ ] An admin can approve and deny pending requests, and the requester is notified of the outcome.
- [ ] Switching a request club to open immediately admits everyone who was pending.
- [ ] Sharing the join link and opening it on a second account joins that account instantly, even on a request club.
- [ ] Copying the invite code works on iOS, Android, and web.
- [ ] An admin can promote a member to admin and demote them back, with both changes announced in chat.
- [ ] An Owner can remove an Admin; a non-Owner Admin cannot.
- [ ] Transferring ownership makes the recipient Owner and the previous Owner an Admin, with exactly one Owner remaining.
- [ ] A non-Owner can leave, and afterwards appears in no race roster, car group, or Eboard roster for that club.
- [ ] Deleting a club removes it from every member's clubs list.
- [ ] Every club photo posted in chat appears in the club gallery.

## Product decisions & rejected alternatives

| Decision | Rejected alternative | Why |
|---|---|---|
| Two join policies: open and request | A third "invite-only" tier | The invite link already provides private, instant joining regardless of policy - a third tier would only duplicate it |
| The invite code became a shareable deep link | A new, separate link mechanism | The code already existed, was already access-safe, and was always intended to grow into this |
| Switching to open auto-approves pending requests | Leave them pending, or deny them | An open club has no approval step going forward, so a pending request would never be decidable |
| Eboard space auto-created with the club | An admin taps "+ Create" the first time | The manual step was pure friction; every club wants one and the space is private regardless |
| Adding a member is immediate, not an invitation | Send an invite the user accepts | Admins are adding people who are already on the team; an acceptance step adds a stall for no safety gain |
| Removing a member cascades to races/car groups/Eboard | Leave orphaned rows | Otherwise a removed member keeps appearing on race rosters and in car groups |
| Club deletion is Owner-only and unconditional | Admin-deletable, or soft-delete/archive | Highest blast radius action in the product; concentrated on the single accountable role |

## Open questions

- Should a club be archivable (read-only history preserved) as an alternative to deletion?
- Should the join link be revocable or rotatable if it leaks?
- Should search be scoped (by sport, by city) once there are many clubs?
- Is there a need to re-open a denied join request, or must the user request again?
