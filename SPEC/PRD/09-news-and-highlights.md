# News & Highlights

**Status:** Shipped

An admin-authored feed of club updates and photos, deliberately separate from chat.

## Purpose

Give a club a durable, scrollable record of its own news — results, recaps, photo drops, announcements worth keeping — that is not competing with the chat's message flow and does not get scrolled past.

## User stories

- As an admin, I want to post a club update with a photo so that the team has a proper recap, not a message that scrolls away.
- As an admin, I want to edit a post after publishing so that a typo or a wrong result can be fixed.
- As a member, I want a reverse-chronological feed of club news so that I can catch up on what I missed without reading every chat message.
- As a member, I want to react to a post so that I can respond without adding a chat message.
- As a member, I want to see who posted it and when so that I know how current it is.

## Scope

**In scope**

- A reverse-chronological feed of club posts
- A post carries body text and/or a photo — at least one is required
- Creator's name, avatar, and timestamp on every post
- Emoji reactions, using the same set chat uses
- Admin create, edit, delete — any admin, any post
- Notification to every other club member on a new post

**Out of scope**

| Not in scope | Why |
|---|---|
| Comments on a post | Discussion belongs in chat |
| Member-authored posts | It is a club news feed, not a social feed |
| Multiple photos per post | Not requested |
| Document or video attachments | Chat covers file sharing |
| Scheduling a post for later | Not requested |
| Cross-club or public feeds | Everything in ClubChat is club-scoped |

## Highlights, and how the two differ

"Highlights" is a separate, older surface reached from chat: **Pinned** and **Announcements** tabs over the chat's own messages, plus an admin-only **Reports** tab. It is a view of chat, not a feed of its own.

| | News & Highlights feed | Chat Highlights |
|---|---|---|
| Content | Standalone posts authored for the feed | Messages already sent in chat |
| Author | Any club admin | Whoever sent the message |
| Reached from | The club hub | The chat header |
| Tapping a row | Opens the post | Jumps to that message in the conversation |
| Scope | Club only | Club, race, and Eboard chats each have their own |
| Reactions | Yes | Chat's own reactions, on the underlying message |

They coexist deliberately: a pinned chat message is a reference, a news post is a publication. See [Chat](03-chat.md) for Highlights' behaviour.

## Behaviour rules

1. **A post must have body text, a photo, or both** — an entirely empty post cannot be created.
2. **The feed is reverse-chronological**, newest first, with no pinning or ordering controls.
3. **Any club admin can create, edit, or delete any post**, not only the one who wrote it.
4. **Every club member can read the feed and react to posts.** Reactions use the same emoji set as chat.
5. **A member can add and remove their own reaction**, one of each emoji per post.
6. **Creating a post notifies every other club member.** Editing or deleting does not notify.
7. **Editing a post reuses the create form**, pre-filled; leaving the photo untouched keeps it, choosing a new one replaces it, and clearing it removes it.
8. **Deleting a post is permanent** — there is no tombstone, unlike a deleted chat message, because there is no surrounding conversation to keep readable.
9. **Every post shows its creator's name and avatar and its post time.**
10. **News & Highlights is the first row on the club hub** — the club's front page.

## Permissions

| Action | Owner | Admin | Member | Non-member |
|---|---|---|---|---|
| Read the feed | ✅ | ✅ | ✅ | ❌ |
| React to a post | ✅ | ✅ | ✅ | ❌ |
| Create a post | ✅ | ✅ | ❌ | ❌ |
| Edit any post | ✅ | ✅ | ❌ | ❌ |
| Delete any post | ✅ | ✅ | ❌ | ❌ |

## States & edge cases

| State | Behaviour |
|---|---|
| No posts yet | Empty state; admins also see the create action |
| Post with a photo and no text | Renders as a photo card |
| Post with text and no photo | Renders as a text card |
| Neither provided | Creation is blocked with an inline message |
| Photo upload fails | The post is not created and the failure is surfaced |
| Loading | Spinner |
| Load failure | Standard inline load-error with retry |
| Member hits the create/edit URL directly | Redirected away |
| Post deleted while another member is viewing the feed | It disappears on the next load |
| Delete confirmation | Explicit confirmation on every platform, including web |

## Acceptance criteria

- [ ] An admin can create a post with text only, with a photo only, and with both.
- [ ] A post with neither is rejected.
- [ ] The feed lists posts newest-first with the author's name, avatar, and time.
- [ ] A member can add and remove a reaction, and other members see it.
- [ ] An admin who did not author a post can still edit and delete it.
- [ ] Editing without touching the photo keeps the existing photo; replacing it swaps it; clearing it removes it.
- [ ] Creating a post notifies every other club member and links to the feed.
- [ ] Editing or deleting produces no notification.
- [ ] A member sees no create, edit, or delete controls and is redirected off those URLs.
- [ ] Deleting a post removes it entirely, with no tombstone.
- [ ] Deleting asks for confirmation on web as well as native.

## Product decisions & rejected alternatives

| Decision | Rejected alternative | Why |
|---|---|---|
| A standalone feed | Reuse chat's pinned messages and announcements as "news" | The club was already faking a news feed with pins; a real feed is the point of the product |
| Any admin can edit and delete any post | Creator-only, like Eboard meetings | Explicitly confirmed with the founder rather than inferred — matches the Race Meet Info / Routines / Events model |
| Admin-authored only | Let members post | It is the club's voice, not a social feed |
| Hard delete, no tombstone | Soft-delete like chat messages | A post has no surrounding conversation that a gap would make unreadable |
| Reactions but no comments | Add comments | Discussion belongs in chat; a second comment surface would split it |
| Body and/or photo, one photo max | A rich post composer | Deliberately minimal; the founder's use case is a recap plus a picture |
| Creation notifies the whole club | Silent posting | It is the one surface where "you missed this" matters most |
| It replaced Highlights as the club hub's top row | Keep both on the hub | Chat Highlights is a view of chat and is reachable from chat, where it belongs |

## Open questions

- Should posts support more than one photo, given photo drops after a race are a stated use case?
- Should the feed paginate, or is a club's post volume low enough that it never needs to?
- Should a post be linkable/shareable outside the app?
- Should the two surfaces be renamed, given "News & Highlights" and chat's "Highlights" are easy to confuse?
