# Component Inventory

Every file in `components/` - what it does, its real props, which screens mount it, and where its variation points are.

## Overview

`components/` holds **shared screen bodies**, not a widget library. Nine of the fourteen files are entire screens that three different scopes (club / race / eboard) mount as thin wrappers; the rest are small primitives. There is no design-system component layer between these and React Native - every file styles itself with `StyleSheet.create` over `constants/theme.ts` tokens.

The contexts in `contexts/` are documented in [Architecture](00-architecture.md), not here.

## Key files

| Path | Responsibility | Lines |
| --- | --- | --- |
| `components/ChatScreen.tsx` | The entire chat experience for all three scopes | 1949 |
| `components/MembersScreen.tsx` | Roster + requests + add-member for all three scopes | 516 |
| `components/HighlightsScreen.tsx` | Pinned / Announcements / Reports over one channel | 404 |
| `components/CalendarScreen.tsx` | Month grid, club or global mode | 349 |
| `components/PollCreateScreen.tsx` | Poll create form, any scope | 337 |
| `components/PollCard.tsx` | The poll UI itself - used inline in chat *and* on the detail screen | 306 |
| `components/PollsListScreen.tsx` | Polls list, any scope | 295 |
| `components/EventsListScreen.tsx` | Upcoming/Past feed list, club or global mode | 261 |
| `components/PollDetailScreen.tsx` | Load/reload plumbing around `PollCard` | 116 |
| `components/GalleryScreen.tsx` | Photo grid over one channel | 90 |
| `components/LegalDocument.tsx` | Renders a `{heading, body}[]` document | 26 |
| `components/BackHeaderButton.tsx` | `makeBackHeaderLeft(router, fallback)` | 24 |
| `components/ThemedSwitch.tsx` | `Switch` with forced theme colors | 23 |
| `components/LoadError.tsx` | Standard "couldn't load" + retry | 20 |

---

## `ChatScreen.tsx`

The largest and most-reused component in the codebase, and the implementation of everything in [Chat](../PRD/03-chat.md). Mounted by `clubs/[clubId]/chat.tsx`, `race/[raceId]/chat.tsx`, and `eboard/chat.tsx` - all three pass a `channelId` and nothing else changes.

### Props

| Prop | Type | Purpose |
| --- | --- | --- |
| `channelId` | `string` | The only required data input |
| `isAdmin` | `boolean` | Gates pin/announce and the admin create-actions in the "+" menu. Eboard passes a literal `isAdmin` (always true - every Eboard member is a club admin) |
| `placeholderName` | `string` | Header title text |
| `avatarUrl` | `string \| null` (optional) | Header round avatar; falls back to a letter badge |
| `memberPath` | `(userId: string) => string` | Where a sender-avatar tap navigates |
| `highlightsPath` | `string` | The "Highlights" pill destination |
| `backFallback` | `string` | Custom header's back target when `canGoBack()` is false |
| `titlePath` | `string` | Where tapping the header title navigates (club-profile / race profile / eboard profile) |
| `fetchMentionCandidates` | `() => Promise<MentionCandidate[]>` | Mention autocomplete pool; fetched once per channel mount |
| `attachMenu` | `{createPollPath?, createEventPath?, createMeetingPath?}` (optional) | Presence switches the "+" from a single photo icon to the expandable grid |
| `headerMenu` | `{label, path, icon: MaterialIconName}[]` (optional) | Presence adds the grid icon + quick-nav dropdown |
| `resolveEventPath` | `(eventId) => string` (optional) | "View Event" target - club chat only |
| `resolveMeetingPath` | `(meetingId) => string` (optional) | "View Meeting" target - Eboard chat only |

### Message type rendering

`renderItem` branches on `DisplayMessage.messageType`:

| Type | Render |
| --- | --- |
| `system` | Centered grey pill (joins, leaves, promotions, incharge-left) |
| `announcement` | Distinct full-width announcement treatment |
| `text` | Bubble; body run through `highlightMentions()` so `@Name` spans get their own style |
| `photo` | Image in the bubble, tap → fullscreen `Modal` viewer |
| `document` | Filename + formatted size, tap → `Linking.openURL(signedUrl)` |
| `poll` | `PollMessageCard` → **the full `PollCard`**, votable inline (`castVote`/`fetchPoll` directly), plus a "View Poll" link for the voter list and creator controls |
| `event` | `EventMessageCard` - title/date/location + "View Event" (`resolveEventPath`) |
| `meeting` | `MeetingMessageCard` - title/date + "View Meeting" (`resolveMeetingPath`) |
| any, `deletedAt` set | "This message was deleted" tombstone |

Poll/event/meeting cards are **hydrated separately**: a `useEffect` keyed on the message list filters for those three types and fetches their referenced rows into three `Map<messageId, data>` states. Sent bubbles use an `expo-linear-gradient` fill (`BubbleContainer` exists solely to avoid a runtime `View`/`LinearGradient` element-type branch).

### Composer and attach menu

Without `attachMenu`: a single photo-picker icon (the original behavior race/eboard chat had before task #51). With `attachMenu`: a WhatsApp-style expandable grid.

| Action | Availability | Path |
| --- | --- | --- |
| Photos | always | `pickImageOnWeb()` on web, `ImagePicker.launchImageLibraryAsync` on native |
| Camera | always | `pickImageOnWeb({captureCamera:true})` on web, `ImagePicker.launchCameraAsync` + permission request on native |
| Document | always | `pickDocumentOnWeb()` on web, `DocumentPicker.getDocumentAsync` on native |
| Poll / Event / Meeting | `isAdmin` **and** the matching path prop is set | `router.push(\`${path}?from=chat\`)` |

Tapping the icon again (it becomes a keyboard glyph) or focusing the text input collapses the grid. A picked photo stages into a caption sheet before sending; a picked document stages into a confirm bubble. The announcement toggle is a compact megaphone icon in the input row.

### Header, pinned strip, actions

- Custom `expo-blur` `BlurView` header (`intensity={80} tint="light"`), height `92 + insets.top`. The native Stack header is disabled via `navigation.setOptions({headerShown: false})`.
- The bottom tab bar is hidden while chat is open, by walking `getParent()` up until a navigator of type `"tab"` is found (race chat sits one Stack deeper than club/eboard chat, so a fixed hop count would break).
- Pinned messages render as a floating, locally-dismissible `BlurView` overlay (`intensity={60}`) - dismissing does **not** unpin. Tapping opens `${highlightsPath}?tab=pinned`.
- Per-message `⋮` opens a popup with the six-emoji reaction row plus Pin (admin), Delete (sender or channel admin), Report (anyone else). Long-press is native-only, so `⋮` is the trigger that also works on web.

### Pagination, jump-to-message, scroll

`PAGE_SIZE = 40`. Initial load and every realtime reload fetch only the newest page and **merge by id** into state (`mergeMessages`) rather than replacing - replacing would discard older pages the user scrolled up to load, and would also miss soft-delete tombstones.

Two entry modes, both routed through one `pendingScrollToMessageIdRef`:

| Mode | Trigger | Fetch | Landing |
| --- | --- | --- | --- |
| Jump | `?messageId=` from Highlights | `fetchMessagesAround(channelId, id)` | Animated scroll + highlight flash; `followTail = false` |
| Plain | no param | `fetchMessages(channelId, {limit: PAGE_SIZE})` | First **unread** message (per `fetchChannelLastReadAt`, read *before* `markChannelRead` advances it), no visible motion; falls back to the last message |

Supporting machinery, each of which fixes a real bug:

| Mechanism | Reason |
| --- | --- |
| `initialNumToRender={PAGE_SIZE}` | FlatList's default 10 leaves most of a page unmeasured, so `scrollToEnd`/`scrollToIndex` fall short |
| `readyForLoadEarlierRef` (false for 600ms after load) | A fresh mount sits at offset 0, which trivially satisfies `onStartReachedThreshold` and fires a spurious extra page fetch |
| `pendingScrollToMessageIdRef` set **inside** the loading effect, never seeded at `useRef` declaration | React Navigation reuses the screen instance, so a `useRef` initializer captures a stale route param |
| `onContentSizeChange` skips its scroll-to-bottom branch while a jump target is active | That callback re-fires spuriously and would yank a jump back to the tail |
| `onScrollToIndexFailed` → `scrollToOffset(averageItemLength * index)` then retry | Retrying the same `scrollToIndex` renders nothing new and fails identically forever |
| `followTail` state + triple `scrollToEnd` at 0/150/400ms | Auto-scroll only when the user is at the bottom; also drives the "jump to latest" button's visibility |

Realtime: `subscribeToNewMessages(channelId, reload)` on mount, unsubscribed on unmount. `markChannelRead` runs once per mount, then `refetchNotifications()` from `useNotifications()`.

### Variation points

Add a feature to one scope by passing a prop, not by branching on scope inside the component. `attachMenu` and `headerMenu` are both "absent means the older, simpler UI" - that is the pattern to follow for the next one.

---

## `HighlightsScreen.tsx`

Pinned / Announcements / admin-only "Reports (N)" tabs over the same channel data chat already fetches (`fetchMessages(channelId)` with no limit → full history). Same glass header treatment as `ChatScreen` (height 76).

| Prop | Type | Purpose |
| --- | --- | --- |
| `channelId` | `string` | - |
| `memberPath` | `(userId) => string` | Avatar tap |
| `isAdmin` | `boolean` (default `false`) | Shows the Reports tab |
| `backFallback` | `string` | Custom-header back target |

Mounted by `clubs/[clubId]/highlights.tsx`, `race/[raceId]/highlights.tsx`, `eboard/highlights.tsx`. Reads `?tab=` to open directly on Announcements. **Every row is tappable**, navigating to `${backFallback}?messageId=${item.id}` - which works because `backFallback` already equals that scope's chat route at all three call sites. The avatar tap and the Reports Delete/Dismiss buttons stay independent via `stopPropagation` on the outer touchable. Deleting a reported message also calls `dismissReports`, so it can't linger in the queue.

---

## `MembersScreen.tsx`

A `SectionList` roster with search, pending requests, per-row `⋮` actions, and an add-member search. Pure presentation: it takes rows and callbacks, never queries.

| Prop | Type | Purpose |
| --- | --- | --- |
| `ownerRows` | `MembersScreenRow[]` (optional) | Club only - splits Owner into its own section |
| `adminRows`, `memberRows` | `MembersScreenRow[]` | Required sections |
| `requests` | `MembersScreenRequest[]` (optional) | Pending join requests |
| `canManage` | `boolean` | Master gate for every write action |
| `busyUserId` | `string \| null` | Per-row spinner |
| `onDecideRequest` | `(requestId, approve) => void` (optional) | - |
| `onPromote` / `onDemote` / `onTransferOwnership` | `(userId) => void` (optional) | Club only |
| `onRemove` | `(userId) => void` | Required |
| `onSearch` | `(query) => Promise<{id, fullName}[]>` | Add-member search |
| `onAdd` | `(userId) => void` | Tap-to-add-immediately |
| `multiSelectAdd` | `boolean` (default `false`) | Race only - stage picks as chips, then batch-confirm |
| `onAddMultiple` | `(userIds[]) => void` (optional) | Paired with `multiSelectAdd` |
| `memberPath` | `(userId) => string` | Row tap |
| `addPlaceholder` | `string` | Search field copy |
| `footer` | `React.ReactNode` (optional) | Scope-specific extras (e.g. Leave) |

`MembersScreenRow` carries `{userId, fullName, avatarUrl, isSelf, removable, canPromote?, canDemote?, canTransferOwnership?, role?}` - the caller computes the permission matrix, the component only renders it. Mounted by `club-profile/members.tsx`, `race/[raceId]/roster.tsx`, `eboard/roster.tsx`.

---

## `CalendarScreen.tsx`

Month grid only - the Upcoming/Past list lives in `EventsListScreen`. See [Calendar & events](../PRD/04-calendar-and-events.md). Fixed 42-cell (6×7) grid so paging months never changes height. Days with items get a dark circular marker; tapping opens a popup listing that day's items, each navigable.

```ts
export type CalendarScreenProps =
  | { mode: "club"; clubId: string; isAdmin: boolean }
  | { mode: "global" };
```

`mode: "club"` calls `fetchCalendarFeed(clubId, userId, isAdmin)` and shows an admin create FAB; `mode: "global"` calls `fetchGlobalCalendarFeed(userId)`, tags each row with its club name, and has no FAB (creating an event is inherently club-scoped). **Polls are filtered out of the grid** - a poll has a deadline, not a "when it happens" - but stay in `EventsListScreen`. Mounted by `(tabs)/calendar.tsx` and `clubs/[clubId]/calendar.tsx`.

---

## `EventsListScreen.tsx`

Takes `CalendarScreenProps` verbatim (imported from `CalendarScreen.tsx`) and renders the flat Upcoming/Past `FlatList` over the same feed - **including polls**, which the grid drops. Each row shows a race-bib-style date block plus a colored type badge; the two `Record<string, {bg, fg}>` maps (`BADGE_STYLE`, `BIB_STYLE`) cover all 8 `CalendarFeedItem` kinds. Mounted by `clubs/[clubId]/events.tsx`, reached from chat's header menu.

Date formatting is deliberately component-local: date-only items (races) are built from split `y/m/d` components, because `new Date(iso)` parses `YYYY-MM-DD` as UTC midnight and renders a day early in timezones behind UTC.

---

## `GalleryScreen.tsx`

Every photo ever sent in a channel, 3-column grid with a 2px gutter, tap → fullscreen `Modal`. Props: `{ channelId: string }`. Uses the native Stack header (not the glass one) since it's a content grid, not a chat surface. Mounted by `club-profile/gallery.tsx`, `race/[raceId]/gallery.tsx`, `eboard/gallery.tsx`. Reloads on focus via `useFocusEffect` with a `cancelled` flag.

---

## Poll components

Four files, deliberately split so chat and the detail screen render **the same poll UI** - see [Polls](../PRD/08-polls.md).

### `PollCard.tsx`

The poll itself: ACTIVE/CLOSED/ENDED badge, countdown badge when `closesAt` is set, tappable options with counts, per-option eye icon (once ≥1 vote and `canSeeVoters`) opening a switchable voter-list `Modal`, and creator-only Close/Reopen/Delete.

| Prop | Type |
| --- | --- |
| `poll` | `PollDetail` |
| `currentUserId` | `string` |
| `votingOptionId` | `string \| null` |
| `onVote` | `(optionId) => void` |
| `onToggleClosed` | `() => void` |
| `onDelete` | `() => void` |

Derives `isCreator`, `canSeeVoters = !poll.isPrivate || isCreator`, and `closed = isPollEffectivelyClosed(poll)` itself. Mounted by `PollDetailScreen` and by `ChatScreen`'s `PollMessageCard`. Nested-touchable taps call `e.stopPropagation?.()` so opening the voter popup doesn't also cast a vote.

### `PollDetailScreen.tsx`

Props `{pollId, backPath}`. Load/reload plumbing (`useFocusEffect`), vote/close/delete handlers, and post-delete navigation - everything that is specific to being a full screen rather than a chat bubble. The visual is entirely `PollCard`.

### `PollsListScreen.tsx`

Props `{scope: PollScope, canCreate: boolean, createPath: string, pollPath: (id) => string}`. ALL POLLS / MY VOTES segmented tabs, a hero card per poll (open → countdown badge; closed → muted "CLOSED"), and a `canCreate`-gated FAB + "Have a new idea?" prompt.

A `scopeKey` primitive is derived from the scope union because the wrapper screens pass a fresh object literal every render - using `scope` itself as a `useCallback` dependency would re-fire `useFocusEffect` on every render.

### `PollCreateScreen.tsx`

Props `{scope, canCreate, listPath, pollPath, chatPath?}`. Question + 2–10 free-text options + two `ThemedSwitch` toggles (allow-multiple, private) + an "Ends" section: duration chips (1 Day / 3 Days / 1 Week / Custom / No deadline), where Custom takes an amount plus a Min/Hrs/Days unit chip. `closesAt` is computed client-side at submit time. Redirects out if `!canCreate`. `chatPath` + `?from=chat` sends the user back to the conversation after creating, instead of to the new poll's detail screen (redundant with the card the creation auto-posts).

All three poll screens are mounted nine times - club, race, and eboard `polls/{index,create,[pollId]}.tsx` - each passing only its own `scope` and paths.

---

## Primitives

### `BackHeaderButton.tsx`

```ts
export function makeBackHeaderLeft(router: Router, fallback: string)
```

Returns a `headerLeft` render function: `canGoBack() ? back() : replace(fallback)`, rendered as a `‹` `arrow-back` in `colors.primary`. Used by every club-scoped `Stack.Screen`. See [Navigation](03-navigation-and-routing.md).

### `LoadError.tsx`

Props `{message?: string, onRetry: () => void}`. Centered error text + a pill "Try again" button. The standard failure state for every data-loading screen; paired with a `retryToken` counter in the caller. See [Data access layer](05-data-access-layer.md).

### `ThemedSwitch.tsx`

Wraps RN's `Switch` with explicit `trackColor` / `thumbColor` / `activeThumbColor` / `ios_backgroundColor` from the theme. Exists because **react-native-web's "on" thumb silently defaults to teal (`#009688`)** regardless of `trackColor`. `activeThumbColor` and `ios_backgroundColor` aren't in RN's bundled types even though react-native-web supports them at runtime, hence the `Switch as ComponentType<any>` cast. Currently used only by `PollCreateScreen.tsx`.

### `LegalDocument.tsx`

Props `{title: string, sections: LegalSection[]}`. Renders a title, `LEGAL_LAST_UPDATED`, and heading/body pairs in a max-640px centered `ScrollView`. Mounted by all four privacy-policy/terms routes over `lib/legalContent.ts`. **The only component that hardcodes hex colors** rather than using `constants/theme.ts`.

## Invariants

1. **Shared screen components take a `channelId`/`scope`, never a club/race/eboard object.** That is what keeps all three scopes on one implementation.
2. **A scope-specific behavior is an optional prop, not a conditional on scope inside the component.** Absent prop = the older, simpler UI.
3. **`ChatScreen` and `HighlightsScreen` own their headers** (`headerShown: false` + `BlurView`) and therefore must receive `backFallback`.
4. **`PollCard` is the single poll UI.** Chat must never grow a parallel simplified poll renderer.
5. **`MembersScreen` computes nothing.** The caller derives every permission flag on each row.
6. **Message list state is merged by id, never replaced**, or older pages and tombstones are lost.
7. **Any destructive action needs a `Platform.OS === "web"` `window.confirm` branch** - `Alert.alert` is a no-op on web.
8. **Date-only strings are formatted from split `y/m/d` components**, never `new Date(iso)`.

## Extension points

| Goal | Do this |
| --- | --- |
| New message type | Add to `MessageType` in `types/database.ts` (+ its own enum migration), add a `renderItem` branch, add a `send*Message` in `lib/messages.ts`; add a hydration `useEffect` if it references another table |
| New chat quick-nav entry | Add a `headerMenu` row in the wrapper - no component change |
| New create-from-chat action | Add a `create*Path` key to `attachMenu`, render an admin-gated grid button, handle `?from=chat` in the create screen |
| New scope for an existing screen | Write a wrapper that reads its layout context and passes paths; the component should need no edits |
| New shared screen | Take primitive inputs (`channelId`, `scope`, paths, callbacks), keep queries in `lib/`, accept `backFallback` if you replace the header |

## Known gaps

- **`ChatScreen.tsx` is 1949 lines** and mixes header, composer, list, four card renderers, three modals, and all scroll machinery in one file. The card renderers (`PollMessageCard`, `EventMessageCard`, `MeetingMessageCard`, `BubbleContainer`) are already separate functions and are the obvious first extraction.
- **No accessibility labels anywhere.** No `accessibilityLabel`, `accessibilityRole`, or focus management in any component.
- **No component tests.** Everything under `components/` is verified only by manual smoke tests - see [Testing & CI](09-testing-and-ci.md).
- **`LegalDocument.tsx` hardcodes colors** instead of using theme tokens.
- **`ThemedSwitch` has one call site** despite `Switch` being used in the app; any new toggle should use it.
- **Reaction emoji are a hardcoded six-item array** (`REACTION_OPTIONS`) inside `ChatScreen.tsx`, duplicated conceptually by `club_post_reactions` in the News feed.
