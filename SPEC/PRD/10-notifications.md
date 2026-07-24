# Notifications

**Status:** Shipped (in-app only — no push notifications)

One cross-club inbox that tells a member what happened while they were away, and what is waiting on them.

## Purpose

Give a member who belongs to several clubs, races, and an Eboard space one place that answers "what did I miss and what needs me", instead of opening seven chats to find out.

## User stories

- As a member of several clubs, I want one inbox across all of them so that I do not have to check each club separately.
- As an admin, I want join requests to sit in my inbox until I actually deal with them so that nobody is left waiting because I glanced at the tab.
- As a member, I want unread chat counts in the same list as everything else so that I have one place to look.
- As a member, I want a notification to take me straight to the thing it is about so that I am not hunting for it.
- As an admin, I want a decided request to stay visible with its outcome so that I have a record of what I approved.
- As a member, I want the badge to clear when I have actually looked so that it means something.

## Scope

**In scope**

- A single reverse-chronological feed merging discrete notifications with live per-chat unread counts
- A tab-bar badge
- Pagination
- Deep-linking from every row to its target
- Resolved-outcome tags on decided join requests
- Realtime arrival without a refresh

**Out of scope**

| Not in scope | Why |
|---|---|
| **Push notifications** (device notifications when the app is closed) | Not built — see [Roadmap](13-roadmap-and-open-questions.md) |
| Email or SMS notifications | Not built |
| Per-type or per-club notification preferences | Not built; everything fans out |
| Muting a chat, a club, or a race | Not built |
| Grouping/collapsing similar notifications | Not built |
| A notification when a routine workout is posted | Deliberate — routines are reference material |
| A notification when a message is pinned | Deliberate — pins do not interrupt |

## Two kinds of row

| | Discrete notification | Chat unread |
|---|---|---|
| What it is | A recorded event ("X created a poll") | A live count of unread messages in one chat |
| Where it comes from | Written when the event happens | Computed on read, never stored as rows |
| Can it be wrong? | No — it is a record | No — it is derived from the messages themselves |
| How it clears | Opening the Notifications tab (most types) | **Only by opening that chat** |
| After clearing | Stays in the feed as history | Replaced by a "caught up on N messages" history row |

## Notification catalogue

| Type | Trigger | Audience | Links to | Clears when |
|---|---|---|---|---|
| **Club join request** | Someone requests to join a request-policy club | Every club Owner and Admin | The club's member roster | The roster is opened |
| **Race join request** | A club member requests to join a race | Every club Owner and Admin | That race's roster | The roster is opened |
| **Eboard join request** | An admin requests to join the Eboard space | Current Eboard members only | The Eboard roster | The roster is opened |
| **Request approved** | An admin approves any of the above (or a club switches to open) | The requester | The club, race, or Eboard space | Notifications tab is opened |
| **Request denied** | An admin denies any of the above | The requester | The club | Notifications tab is opened |
| **Member added** | An admin adds someone to a club, race, or Eboard space directly | The person added | That space | Notifications tab is opened |
| **Member removed** | An admin removes someone | The person removed | The club | Notifications tab is opened |
| **Role changed** | A member is promoted or demoted | The person whose role changed | The club | Notifications tab is opened |
| **Poll created** | A poll is created in any scope | Everyone who can access that poll, except the creator | The poll | Notifications tab is opened |
| **Poll closing soon** | A poll is 10 minutes from its deadline | Everyone who can access it, **including the creator** | The poll | Notifications tab is opened |
| **Event created** | An admin creates a calendar event | Every other club member | The event | Notifications tab is opened |
| **Race created** | An admin creates a race | Every other club member | The race | Notifications tab is opened |
| **Meeting created** | An Eboard member creates a meeting | Other Eboard members | The meeting | Notifications tab is opened |
| **News post created** | An admin publishes a News & Highlights post | Every other club member | The feed | Notifications tab is opened |
| **Announcement** | An admin posts an announcement in any chat | Everyone with access to that chat | That chat | Notifications tab is opened |
| **Mentioned** | Someone @mentions a member in any chat | The mentioned member, only if they can access that chat | That chat | Notifications tab is opened |
| **Car-group Incharge left** | A car group's designated Incharge leaves or is removed | Every club Owner and Admin | That race's car groups | Notifications tab is opened |
| **Chat caught up** | A member opens a chat that had unread messages | That member only, already read | That chat | Recorded already-read, as history |
| *(live)* **Chat unread** | Unread messages exist in a chat the member can access | That member | That chat | **Only by opening that chat** |

## Behaviour rules

1. **The feed merges discrete notifications and live chat-unread rows into one reverse-chronological list**, paginated as the user scrolls.
2. **Opening the Notifications tab marks the visible discrete notifications read and clears the badge** — with two exceptions below.
3. **Chat-unread rows are never cleared by opening the Notifications tab.** They clear only by opening that chat.
4. **The three pending join-request types are never cleared by opening the Notifications tab either.** They clear only when the relevant roster screen is opened. This is the "only clears once you actually look" rule: a row that represents work waiting on you must not be dismissed by a glance.
5. **A decided join request stays in the feed, tagged "Approved" or "Denied", instead of disappearing** — the admin keeps a record of what they decided.
6. **Every row deep-links to its target.** Tapping is always safe: a row pointing at something the user has since lost access to fails gracefully rather than crashing.
7. **Opening a chat with unread messages records a "caught up on N messages" row**, so the history of having caught up survives even though the live count is gone.
8. **The badge reflects unread discrete notifications** and updates in realtime, without a refresh, from anywhere in the app.
9. **Notification audience always respects access.** A race poll notifies only race roster members; an Eboard meeting notifies only Eboard members; an announcement in a race chat notifies only that race's roster; a mention notifies only if the mentioned person can open that chat.
10. **Creation notifications exclude the actor.** You are never notified about something you just did — except the poll closing-soon reminder, which deliberately includes the creator.
11. **Pinning a message never notifies anyone**; posting an announcement always does.

## Permissions

| Action | Owner | Admin | Member | Non-member |
|---|---|---|---|---|
| See their own notifications | ✅ | ✅ | ✅ | — |
| See another user's notifications | ❌ | ❌ | ❌ | ❌ |
| Receive join-request notifications | ✅ | ✅ | ❌ | ❌ |
| Receive Eboard join-request notifications | Eboard members only | Eboard members only | ❌ | ❌ |
| Receive car-group Incharge-left notifications | ✅ | ✅ | ❌ | ❌ |
| Mark notifications read | own only | own only | own only | — |

## States & edge cases

| State | Behaviour |
|---|---|
| Nothing has happened yet | Empty state |
| Badge with only chat-unread rows | The badge counts discrete notifications; chat unreads appear as rows |
| A club, race, poll, or event is deleted | Its notifications go with it |
| The actor's account is deleted | The notification survives with the actor unattributed |
| The user loses access to the target | Tapping fails gracefully and does not crash |
| Notification arrives while the tab is open | It appears in realtime |
| Same chat has unread messages and a mention | Both appear — one live unread row, one discrete mention row |
| Loading / load failure | Spinner, then a standard inline load-error with retry |
| Offline | The feed shows the last loaded state; new notifications arrive on reconnect |

## Acceptance criteria

- [ ] A single feed shows notifications across every club the user belongs to.
- [ ] Chat-unread rows appear in the same list as discrete notifications, ordered by time.
- [ ] Opening the Notifications tab clears the badge.
- [ ] Opening the Notifications tab does **not** clear a chat-unread row or a pending join-request row.
- [ ] Opening the relevant roster clears its pending join-request rows.
- [ ] Opening a chat clears its unread row and leaves a "caught up on N messages" row in its place.
- [ ] A decided join request remains in the feed tagged Approved or Denied.
- [ ] Every row navigates to the thing it describes.
- [ ] A race poll or race announcement notifies only race roster members, not club admins without roster access.
- [ ] An Eboard meeting or Eboard poll notifies only Eboard members.
- [ ] A mention notifies only someone who can access that chat.
- [ ] The creator is not notified about their own poll, event, race, meeting, or post — but is reminded when their poll is closing.
- [ ] Pinning a message notifies nobody; announcing notifies everyone in that chat.
- [ ] The badge updates in realtime while the user is on another tab.
- [ ] The feed pages further back as the user scrolls.

## Product decisions & rejected alternatives

| Decision | Rejected alternative | Why |
|---|---|---|
| Chat unread is computed live, never stored | Store an unread row per message | Stored counts drift out of sync with the messages themselves; a computed count cannot |
| Join requests and chat unreads only clear once you look at them | Clear everything on opening the inbox | Glancing at a tab is not dealing with a request; the founder lost requests this way |
| Decided requests stay as tagged history | Delete them once decided | Admins wanted a record of what they approved and denied |
| A route string per notification | A field per notification type | Every consumer just navigates; per-type plumbing would grow with every feature |
| One inbox across all clubs | Per-club inboxes | A member of three clubs would have to check three places |
| Announcements notify, pins do not | Notify on both | The distinction between "reference" and "interruption" is the reason announcements exist |
| Creation notifications exclude the actor; closing-soon includes them | Uniform rule either way | The creator is exactly who needs the deadline reminder |
| No per-type preferences or muting | Build a preferences screen | Volume has not warranted it yet; would need to ship before wider release |
| No push notifications yet | Ship push with the inbox | Deliberately deferred — the inbox already computes everything a push payload would need |

## Open questions

- **Push notifications** are the single biggest gap — without them, a member must open the app to learn anything. When does this become blocking for real use?
- Should members be able to mute a specific chat, race, or club?
- Should high-volume types (announcements, mentions) be separable from low-volume ones (join requests)?
- Should the badge count chat unreads as well as discrete notifications?
- Should notifications expire or be prunable after a period?
