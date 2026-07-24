# Polls

**Status:** Shipped

Structured voting, scoped to a club, a race, or the Eboard - replacing "react with 👍 if you're coming".

## Purpose

Let a club settle a question with a real count instead of a thread of replies, with enough control over anonymity and deadlines that it works for both "what colour singlet" and "should we remove someone from the team".

## User stories

- As an admin, I want to ask the club a question with fixed options so that I get a count instead of forty replies.
- As an admin, I want to allow multiple selections when the question needs it so that "which of these can you make" works.
- As an admin, I want a private poll where only I can see who voted for what so that sensitive votes are honest.
- As an admin, I want to set a deadline so that voting closes itself.
- As a member, I want to see the running counts so that I know whether my vote still matters.
- As a member, I want to change or withdraw my vote so that a mistap is not permanent.
- As a member, I want to vote directly from the chat card so that voting is one tap.
- As a member, I want to be reminded before a poll closes so that I do not miss it.
- As a race member, I want polls scoped to my race so that "what time do we leave" is not a club-wide question.

## Scope

**In scope**

- Question plus 2–10 free-text options
- Per-poll toggles: allow multiple selections, private voting
- Optional deadline (1 day / 3 days / 1 week / custom minutes-hours-days / no deadline)
- Always-visible per-option vote counts
- A voter list per option, gated by the poll's privacy setting
- Voting, re-voting, and un-voting
- Close, reopen, delete - creator-only
- Three scopes: club, race, Eboard
- A votable poll card auto-posted into the corresponding chat
- A "closing soon" reminder
- ALL POLLS / MY VOTES tabs on the list

**Out of scope**

| Not in scope | Why |
|---|---|
| Ranked or weighted voting | Not requested |
| Editing a poll's question or options after creation | Would invalidate votes already cast |
| Adding an option after creation, or write-in options | Same reason |
| Fully anonymous polls (hidden even from the creator) | The creator always sees voters on a private poll |
| Quorum, thresholds, or automatic outcomes | The club interprets the result itself |
| Poll results export | Not requested |

## Behaviour rules

1. **A poll has a question and between 2 and 10 options.**
2. **Vote counts are always public**, on every poll, including private ones.
3. **Voter identity is gated by the poll's privacy setting**: on a public poll everyone can see who voted for what; on a private poll only the creator can. **A voter always sees their own vote either way.**
4. **Tapping an option votes for it.** Tapping it again withdraws the vote. On a single-choice poll, tapping a different option moves the vote rather than adding a second.
5. **A per-option control reveals that option's voters**, shown once the option has at least one vote and the viewer is allowed to see voters.
6. **A poll closes when its creator closes it, or when its deadline passes** - whichever comes first. A closed poll cannot be voted in.
7. **Only the creator can close, reopen, or delete a poll**, in every scope, including club polls created by another admin.
8. **A deadline is optional.** It is chosen from preset durations or a custom amount in minutes, hours, or days, and is computed from the moment of creation.
9. **Ten minutes before a poll's deadline, everyone who can access it is reminded - including the creator.** This fires once per poll.
10. **Creating a poll notifies everyone who can access it except the creator**, and posts a votable card into the corresponding chat.
11. **A poll card in chat is fully votable inline**, behaving identically to the full poll screen for multi-select, privacy, deadlines, and closed state. Actions the card cannot hold (the voter list, and the creator's close/reopen/delete) are reached through a "View Poll" link.
12. **Scope determines both audience and creation rights**:
    - **Club poll** - any club member can vote; any club admin can create.
    - **Race poll** - only race roster members can see or vote; creating requires being both a club admin and on the roster.
    - **Eboard poll** - only Eboard members can see or vote; any Eboard member can create.
13. **The list has an ALL POLLS tab and a MY VOTES tab**, the latter filtered to polls the viewer has voted in.
14. **An open poll is presented as a live card with a countdown when it has a deadline**; a closed poll is visually muted and labelled CLOSED.
15. **Polls appear in the events list of the calendar**, bucketed by open/closed rather than by date.

## Permissions

| Action | Club poll | Race poll | Eboard poll |
|---|---|---|---|
| See the poll | Any club member | Race roster members only | Eboard members only |
| Vote | Any club member | Race roster members only | Eboard members only |
| See vote counts | Anyone who can see the poll | " | " |
| See who voted (public poll) | Anyone who can see the poll | " | " |
| See who voted (private poll) | Creator only | Creator only | Creator only |
| See their own vote | Always | Always | Always |
| Create | Club Owner/Admin | Club Owner/Admin **and** on the roster | Any Eboard member |
| Close / reopen | Creator only | Creator only | Creator only |
| Delete | Creator only | Creator only | Creator only |

## States & edge cases

| State | Behaviour |
|---|---|
| No polls yet | Empty state plus, for those who can create, a prompt and a create action |
| Poll with no votes | Counts show zero; no voter-list control is offered |
| Private poll, viewer is not the creator | Counts shown; voter list unavailable; their own selection still highlighted |
| Deadline passed but not manually closed | Treated as closed everywhere - voting disabled, shown as CLOSED |
| Creator reopens a closed poll | Voting resumes; existing votes are preserved |
| Poll deleted | It disappears from the list, the calendar, and its chat card |
| Fewer than 2 options entered | Creation is blocked |
| Tapping the voter-list control | Opens the voter popup without also casting a vote |
| Member loses access (leaves the race, is demoted out of Eboard) | The poll disappears from their view entirely |
| Loading / load failure | Spinner, then a standard inline load-error with retry |

## Acceptance criteria

- [ ] A poll can be created with 2 options and with 10; 1 option is rejected and an 11th cannot be added.
- [ ] Counts are visible to every eligible viewer on both public and private polls.
- [ ] On a public poll, any eligible viewer can open an option's voter list; on a private poll only the creator can.
- [ ] A voter always sees their own selection, including on a private poll.
- [ ] On a single-choice poll, voting for a second option moves the vote; on a multi-select poll it adds one.
- [ ] Tapping the currently-selected option withdraws the vote.
- [ ] Opening the voter list does not change the viewer's vote.
- [ ] A poll with a passed deadline cannot be voted in and is shown as CLOSED, without anyone having closed it.
- [ ] Close, reopen, and delete are offered only to the creator, including to a club admin who did not create it.
- [ ] Creating a poll notifies everyone who can access it except the creator.
- [ ] Ten minutes before the deadline, everyone who can access the poll - including the creator - is reminded exactly once.
- [ ] Creating a poll posts a votable card into the matching chat, and voting on the card matches the full screen.
- [ ] A race poll is invisible to a club admin who is not on that race's roster, including by direct URL.
- [ ] An Eboard poll is invisible to a club admin who is not an Eboard member.
- [ ] Any Eboard member, admin or not by Eboard's own standards, can create an Eboard poll.
- [ ] MY VOTES lists exactly the polls the viewer has voted in.
- [ ] An open poll with no deadline never appears under Past on the calendar.

## Product decisions & rejected alternatives

| Decision | Rejected alternative | Why |
|---|---|---|
| Counts always public, voter identity gated | Hide counts on private polls too | The club wants to know the result; anonymity is about who, not how many |
| The creator can always see voters, even on a private poll | Fully anonymous polls | Someone has to be accountable for interpreting a sensitive vote |
| Close/reopen/delete are creator-only | Any club admin, like calendar and routines | Deliberately mirrors Eboard meetings - whoever asked the question owns it |
| Race polls require a roster row even for admins | Let any club admin create and see race polls | Brought race polls in line with race chat, which has required a roster row since the race-access rework |
| Any Eboard member can create | Restrict to some Eboard sub-role | Every Eboard member is already a club admin |
| Deadline is optional | Always require one | Plenty of polls are open-ended |
| Deadline reminder fires 10 minutes out, to everyone including the creator | Notify only non-creators, as creation notifications do | The creator is the person who most needs to know it is about to close |
| Chat cards are fully votable | A link-only card | Voting from where the conversation already is was the point |
| No editing of question or options | Allow edits | Would silently invalidate votes already cast |
| Poll bucketing on the calendar uses open/closed | Compare dates like every other item | An open-ended poll would flip to Past the moment it was created |

## Open questions

- Should a poll's result be summarisable back into chat when it closes?
- Should an admin other than the creator be able to close a poll whose creator has left the club?
- Should there be an "anyone can create" club poll mode for member-driven questions?
- Should the closing-soon reminder's lead time be configurable per poll?
