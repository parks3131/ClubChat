# Chat

**Status:** Shipped

The club's primary surface — one chat experience reused identically by club, race, and Eboard spaces.

## Purpose

Replace GroupMe with a chat that carries the structure a club actually needs: real announcements, real pins, attachments that do not expire, and a way to reach the rest of the app without leaving the conversation.

## User stories

- As a member, I want to send text, photos, and files so that I never have to leave the app to share something.
- As a member, I want to react to a message with an emoji so that I can acknowledge without adding noise.
- As a member, I want to @mention someone so that they see it even if they are behind on the chat.
- As an admin, I want to post an announcement that visibly outranks normal chatter so that the week's key information is not scrolled past.
- As an admin, I want to pin a message so that it stays reachable at the top of the conversation.
- As a member, I want to open Highlights and jump straight to the pinned message in its original context so that I can read the replies around it.
- As a member, I want chat to open where I left off rather than at the bottom so that I do not have to hunt for the first thing I missed.
- As a member, I want to create a poll or an event without leaving chat so that it takes one action, not four screens.
- As a member, I want to report a message so that admins can deal with it.
- As an admin, I want to delete a message so that abuse or a mistake does not stay up.

## Scope

**In scope**

| Capability | Notes |
|---|---|
| Text messages | With @mention tagging and autocomplete |
| Photo attachments | Library or camera |
| Document attachments | Any file type, shown with filename and size |
| Emoji reactions | Fixed set: 👍 ❤️ 😂 🔥 🎉 😮 |
| Announcements | Admin-only, visually distinct from normal messages |
| Pinning | Admin-only, with a floating dismissible pinned strip |
| Highlights | Pinned / Announcements / Reports tabs over the same conversation |
| Jump-to-message | Tapping a Highlights row lands on that exact message, highlighted |
| Unread-aware entry | Chat opens on the first unread message |
| Jump-to-latest | A floating control appears once scrolled away from the live tail |
| System messages | Joins, leaves, adds, removes, promotions, demotions |
| Auto-posted cards | A created poll, event, or meeting posts itself into the relevant chat |
| Inline poll voting | A poll card in chat is fully votable without opening the poll screen |
| Moderation | Soft delete with a tombstone; report a message |
| Gallery | Every photo ever posted in that chat, as a grid |
| Quick-nav | A header menu into that space's other features |

**Out of scope**

- Threaded replies or quote-replies
- Editing a sent message
- Typing indicators, read receipts, presence
- Voice notes and video calls
- Direct messages between two members
- Message search
- Loading *newer* messages beyond a jump window (chat only pages upward from the live tail)

## Behaviour rules

1. **One chat implementation serves all three scopes** — club, race, Eboard. Feature parity is total; only the menus differ.
2. **Chat loads the most recent 40 messages** and pages further backward as the user scrolls up.
3. **Chat opens positioned on the first unread message**, with no visible scroll motion. If fully caught up, it opens at the bottom.
4. **Opening a chat marks it read**, which clears its unread count everywhere. Nothing else clears it — see [Notifications](10-notifications.md).
5. **Only an admin of that space can post an announcement or pin a message.** In race chat that means a club admin who is also on the roster; in Eboard chat every member qualifies.
6. **A pin is separate from an announcement.** Pinning an ordinary message does not notify anyone; posting an announcement notifies everyone in that space.
7. **The pinned strip floats over the conversation and can be dismissed locally** — dismissing it does not unpin the message for anyone.
8. **@mentioning a member notifies them individually**, and the mention is highlighted in the rendered message. A mention only notifies someone who can actually access that chat.
9. **A message can be deleted by its sender or by an admin of that space.** Deletion leaves a "This message was deleted" tombstone rather than removing it from history.
10. **Anyone can report a message they did not send.** Reporting twice is a no-op. Reports surface only to admins, in a Reports tab in Highlights, where they can delete the message or dismiss the report.
11. **The composer's "+" opens an attach menu** with Photos, Camera, and Document always available, plus admin-gated create actions for whatever that scope supports (club: Poll, Event; race: Poll; Eboard: Poll, Meeting).
12. **Creating a poll, event, or meeting posts a card into the corresponding chat**, regardless of whether it was created from chat or from its own screen.
13. **Deleting the underlying poll, event, or meeting removes its chat card**, rather than leaving a dead link.
14. **Chat is full-screen** — the bottom tab bar is hidden while in a conversation.
15. **The chat header carries the space's name and avatar, tappable to that space's profile**, plus Highlights and a quick-nav menu.
16. **Every chat has a Gallery** — every photo ever posted in that conversation, as a grid, with tap-to-view full screen. Club, race, and Eboard chats each have their own, reached from that space's profile screen. The gallery is read-only; photos enter it only by being posted in chat.
17. **@mention autocomplete offers only people who can access that chat** — club members in club chat, roster members in race chat, Eboard members in Eboard chat.

## Permissions

| Action | Owner | Admin | Member | Non-member |
|---|---|---|---|---|
| Read the conversation | ✅ | ✅ | ✅ | ❌ |
| Send text / photo / document | ✅ | ✅ | ✅ | ❌ |
| React | ✅ | ✅ | ✅ | ❌ |
| @mention | ✅ | ✅ | ✅ | ❌ |
| Post an announcement | ✅ | ✅ | ❌ | ❌ |
| Pin / unpin | ✅ | ✅ | ❌ | ❌ |
| Delete a message | any | any | own only | ❌ |
| Report a message | ✅ | ✅ | ✅ | ❌ |
| View the Reports tab | ✅ | ✅ | ❌ | ❌ |
| Dismiss a report | ✅ | ✅ | ❌ | ❌ |
| Create a poll / event / meeting from "+" | ✅ | ✅ | ❌ (Eboard: ✅) | ❌ |
| View the gallery | ✅ | ✅ | ✅ | ❌ |

"Member" in race chat means an approved roster member; a club admin who is not on the roster has no access at all.

## States & edge cases

| State | Behaviour |
|---|---|
| Empty conversation | An empty state, with the composer available |
| Loading | A spinner; the composer is not shown until the channel resolves |
| Load failure | Standard inline load-error with retry |
| Offline / send failure | The send fails visibly rather than silently dropping the message |
| Photo or document upload fails | The message is not posted and the failure is surfaced |
| Deleted message | Renders as a tombstone; reactions and pin state are cleared with it |
| Deleted poll/event/meeting | Its chat card disappears |
| Message referenced by a Highlights jump is far back in history | A window of history around that message is loaded; scroll-up paging continues from there |
| Realtime message arrives while reading old history | The new message merges in but the view is not yanked to the bottom |
| No back history (deep link, refresh) | The back control falls back to that space's parent, never to a screen that would bounce back into chat |
| Non-member opens a race/Eboard chat URL directly | Redirected out |

## Acceptance criteria

- [ ] A message sent on one device appears on another in realtime without a refresh.
- [ ] Photos and documents round-trip: upload, appear in the conversation, and open when tapped.
- [ ] A document bubble shows its filename and size.
- [ ] Reactions toggle on and off and are visible to everyone.
- [ ] An @mention notifies the mentioned member and renders highlighted.
- [ ] The mention autocomplete lists only people who can access that chat.
- [ ] Every photo posted in a chat appears in that chat's Gallery, and opens full screen from it.
- [ ] A member cannot post an announcement or pin; an admin can do both.
- [ ] The pinned strip appears when a message is pinned and can be dismissed without unpinning.
- [ ] Highlights lists pinned and announcement messages, and tapping one lands on that message in the conversation, highlighted.
- [ ] Reopening a chat with unread messages lands on the first unread one with no visible scrolling.
- [ ] The jump-to-latest control appears after scrolling up and disappears at the bottom.
- [ ] Scrolling to the top loads older messages without losing scroll position, and does not fire spuriously on open.
- [ ] Deleting a message leaves a tombstone for every other member.
- [ ] Reporting a message surfaces it in the admin Reports tab; a second report by the same person changes nothing.
- [ ] Creating a poll from "+" posts a votable card into chat and voting on the card matches the full poll screen's behaviour.
- [ ] Deleting that poll removes its chat card.
- [ ] Race and Eboard chat behave identically to club chat for everything above.

## Product decisions & rejected alternatives

| Decision | Rejected alternative | Why |
|---|---|---|
| Announcements are their own message type | Reuse pinning to mean "important" | The club already faked announcements by pinning; making them distinct is the whole point |
| Pinning does not notify | Notify on every pin | Pins are used for reference material, not for interruption |
| Soft delete with a tombstone | Hard delete | A message vanishing from the middle of a conversation makes the surrounding replies unreadable |
| Reports go to admins, not to a global queue | Auto-hide reported messages | Small trusted groups; auto-hiding would be abusable by a single reporter |
| Chat opens on the first unread message | Always open at the bottom | Explicit founder request — landing at the bottom means hunting upward for what you missed |
| A fixed 6-emoji reaction set | A full emoji picker | Fast tap targets; matches how the club actually reacts |
| Poll cards are fully votable inline | A link-only card | Voting is one tap from where the conversation already is |
| Attach menu and quick-nav rolled out to club chat first, then race and Eboard | Ship all three at once | Explicit founder scoping — prove it on the main chat, then extend |
| No message editing | Allow edits | Not requested; edit history adds moderation ambiguity |
| No "load newer" paging past a jump window | Build bidirectional paging | Out of scope; the app only ever pages upward from the live tail |

## Open questions

- Should there be a "load newer" path for the rare case of 50+ messages after a jump target?
- Is message search needed, and at what scope (one chat, or all of a club's chats)?
- Should announcements have an expiry, so a stale one stops dominating Highlights?
- Should reactions be extended beyond the fixed six?
