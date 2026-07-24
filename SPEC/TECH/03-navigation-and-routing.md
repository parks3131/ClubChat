# Navigation and Routing

The complete Expo Router tree, the nested-Stack/layout-context pattern that gates every club-scoped screen, and the header/back-navigation conventions every new screen must follow.

## Overview

Routing is **file-based** (`expo-router` ~57). Two top-level groups, `(auth)` and `(tabs)`, are switched between by the auth guard in `app/_layout.tsx` (see [Architecture](00-architecture.md)). Inside `(tabs)` there are four tabs; the Clubs tab holds a deeply nested Stack tree where each level's `_layout.tsx` does three jobs at once:

1. **Fetch** the scope object (club / race / eboard channel) once.
2. **Gate** access, redirecting anyone who shouldn't be here.
3. **Expose** the result via a React context hook (`useClub()` / `useRace()` / `useEboard()`) so every screen below it is a thin, data-free wrapper.

Deep links use the `clubchat://` scheme (`app.json`), consumed by `/clubs/join?code=…`.

## Key files

| Path | Responsibility |
| --- | --- |
| `app/_layout.tsx` | Root `Stack`, auth guard, provider nesting |
| `app/(tabs)/_layout.tsx` | Bottom `Tabs` (Clubs / Calendar / Notifications / Profile), badge, Clubs-tab `tabPress` shortcut |
| `app/(tabs)/clubs/_layout.tsx` | Clubs `Stack`; the app's only "ClubChat" masthead header |
| `app/(tabs)/clubs/[clubId]/_layout.tsx` | `useClub()` context + `clubScreenOptions` (tappable club-name title) |
| `app/(tabs)/clubs/[clubId]/race/[raceId]/_layout.tsx` | `useRace()` context, `isManager`/`isMember` split, deny-redirect |
| `app/(tabs)/clubs/[clubId]/eboard/_layout.tsx` | `useEboard()` context, club-admin gate |
| `components/BackHeaderButton.tsx` | `makeBackHeaderLeft(router, fallback)` - the universal `‹` |

## Route tree

Guard column: what the screen (or its layout) enforces. Back-fallback: the route `makeBackHeaderLeft` (or the screen's own handler) uses when `canGoBack()` is false.

### Root and auth

| Route | File | Guard | Back-fallback |
| --- | --- | --- | --- |
| `/` | `app/index.tsx` | - (spinner; guard redirects) | - |
| `/(auth)/sign-in` | `app/(auth)/sign-in.tsx` | no session | - |
| `/(auth)/sign-up` | `app/(auth)/sign-up.tsx` | no session | - |
| `/(auth)/privacy-policy` | `app/(auth)/privacy-policy.tsx` | no session | `/(auth)/sign-up` |
| `/(auth)/terms` | `app/(auth)/terms.tsx` | no session | `/(auth)/sign-up` |

`(auth)/privacy-policy` and `(auth)/terms` duplicate `(tabs)/profile/`'s versions because the auth guard redirects by **top-level route group** - one route cannot serve both a signed-out and a signed-in visitor. Both pairs render the same `components/LegalDocument.tsx` over the same `lib/legalContent.ts` data.

### Tabs

| Route | File | Guard | Back-fallback |
| --- | --- | --- | --- |
| `/calendar` | `app/(tabs)/calendar.tsx` | session | - (tab root) |
| `/notifications` | `app/(tabs)/notifications.tsx` | session | - (tab root) |
| `/profile` | `app/(tabs)/profile/index.tsx` | session | - (tab root) |
| `/profile/edit` | `app/(tabs)/profile/edit.tsx` | self-only | modal |
| `/profile/privacy-policy` | `app/(tabs)/profile/privacy-policy.tsx` | session | `/profile` |
| `/profile/terms` | `app/(tabs)/profile/terms.tsx` | session | `/profile` |
| `/clubs` | `app/(tabs)/clubs/index.tsx` | session | - (tab root) |
| `/clubs/create` | `app/(tabs)/clubs/create.tsx` | session | modal |
| `/clubs/join` | `app/(tabs)/clubs/join.tsx` | session; consumes `?code=` | modal |

### Club scope - `useClub()`

Everything below is gated by `clubs/[clubId]/_layout.tsx`: it requires a `club_members` row for the caller (a missing row surfaces `LoadError`, not a redirect) and publishes `{clubId, channelId, name, avatarUrl, inviteCode, role, isCreator, isAdmin, isOwner}`.

| Route | File | Guard | Back-fallback |
| --- | --- | --- | --- |
| `/clubs/:clubId` | `[clubId]/index.tsx` | member | `/clubs` (`dismissTo`) |
| `/clubs/:clubId/chat` | `[clubId]/chat.tsx` | member | `/clubs/:clubId` |
| `/clubs/:clubId/calendar` | `[clubId]/calendar.tsx` | member | `/clubs/:clubId` |
| `/clubs/:clubId/events` | `[clubId]/events.tsx` | member | `/clubs/:clubId` |
| `/clubs/:clubId/highlights` | `[clubId]/highlights.tsx` | member | `/clubs/:clubId/chat` |
| `/clubs/:clubId/club-profile` | `club-profile/index.tsx` | member | `/clubs/:clubId` |
| `/clubs/:clubId/club-profile/edit` | `club-profile/edit.tsx` | `isAdmin` (redirects) | modal |
| `/clubs/:clubId/club-profile/members` | `club-profile/members.tsx` | member; manage actions `isAdmin` | `/clubs/:clubId/club-profile` |
| `/clubs/:clubId/club-profile/gallery` | `club-profile/gallery.tsx` | member | `/clubs/:clubId/club-profile` |
| `/clubs/:clubId/member/:userId` | `member/[userId].tsx` | member | `/clubs/:clubId/club-profile` |
| `/clubs/:clubId/news` | `news/index.tsx` | member; FAB/edit `isAdmin` | `/clubs/:clubId` |
| `/clubs/:clubId/news/create` | `news/create.tsx` | `isAdmin` (redirects); `?postId=` = edit | `/clubs/:clubId/news` |
| `/clubs/:clubId/event/:eventId` | `event/[eventId].tsx` | member | `/clubs/:clubId/calendar` |
| `/clubs/:clubId/event/create` | `event/create.tsx` | `isAdmin` (redirects); `?eventId=` = edit, `?from=chat` | `/clubs/:clubId/calendar` |
| `/clubs/:clubId/routines` | `routines/index.tsx` | member | `/clubs/:clubId` |
| `/clubs/:clubId/routines/activity-type` | `routines/activity-type.tsx` | `isAdmin` (redirects) | `/clubs/:clubId/routines` |
| `/clubs/:clubId/routines/workout/create` | `routines/workout/create.tsx` | `isAdmin` (redirects) | `/clubs/:clubId/routines` |
| `/clubs/:clubId/routines/workout/:workoutId` | `routines/workout/[workoutId].tsx` | member; edit/delete `isAdmin` | `/clubs/:clubId/routines` |
| `/clubs/:clubId/polls` | `polls/index.tsx` | member; `canCreate = isAdmin` | `/clubs/:clubId` |
| `/clubs/:clubId/polls/create` | `polls/create.tsx` | `canCreate` (component redirects) | `/clubs/:clubId/polls` |
| `/clubs/:clubId/polls/:pollId` | `polls/[pollId].tsx` | member | `/clubs/:clubId/polls` |
| `/clubs/:clubId/races` | `races/index.tsx` | member | `/clubs/:clubId` |
| `/clubs/:clubId/races/create` | `races/create.tsx` | `isAdmin` (redirects) | `/clubs/:clubId/races` |
| `/clubs/:clubId/races/:raceId` | `races/[raceId].tsx` | member **without** race access - an admin or real member is redirected to the real hub | `/clubs/:clubId/races` |

`races/[raceId].tsx` is a deliberate second route for the same id as `race/[raceId]/`: a read-only preview (name, date, Meet Information, "Request to join") for a club member who is not yet on the roster, rather than widening `race/[raceId]/_layout.tsx`'s gate.

### Race scope - `useRace()`

`race/[raceId]/_layout.tsx` fetches the race plus the caller's real `race_members` row and publishes `{raceId, clubId, name, eventDate, channelId, isManager, isMember, avatarUrl}`. **`isManager` (club Admin/Owner) grants management authority only - not chat access.** Anyone who is neither manager nor member is redirected to `/clubs/:clubId/races`.

| Route | File | Guard | Back-fallback |
| --- | --- | --- | --- |
| `/clubs/:clubId/race/:raceId` | `race/[raceId]/index.tsx` | manager or member; a **member is redirected to `/chat`** | `/clubs/:clubId/races` |
| `…/race/:raceId/chat` | `chat.tsx` | `isMember` (redirects to hub) | `/clubs/:clubId/races` |
| `…/race/:raceId/highlights` | `highlights.tsx` | `isMember` | `…/race/:raceId/chat` |
| `…/race/:raceId/gallery` | `gallery.tsx` | `isMember` | `…/race/:raceId/profile` |
| `…/race/:raceId/profile` | `profile.tsx` | manager or member | `/clubs/:clubId/race/:raceId` |
| `…/race/:raceId/edit` | `edit.tsx` | `isManager` (redirects) | `…/race/:raceId/profile` |
| `…/race/:raceId/roster` | `roster.tsx` | manager or member; manage actions `isManager` | `…/race/:raceId/profile` |
| `…/race/:raceId/location` | `location.tsx` | manager or member; edit `isManager` | `…/race/:raceId/chat` |
| `…/race/:raceId/carpool` | `carpool.tsx` | manager or member; write `isManager` | `…/race/:raceId/chat` |
| `…/race/:raceId/polls` | `polls/index.tsx` | `canCreate = isManager && isMember` | `…/race/:raceId/chat` |
| `…/race/:raceId/polls/create` | `polls/create.tsx` | `canCreate` | `…/race/:raceId/polls` |
| `…/race/:raceId/polls/:pollId` | `polls/[pollId].tsx` | member | `…/race/:raceId/polls` |

### Eboard scope - `useEboard()`

`eboard/_layout.tsx` gates on `club.isAdmin` (a non-admin hitting the URL is redirected to the club hub) and publishes `{clubId, userId, channel, reload}`. **Being a club admin grants visibility, not membership** - `channel.isMember` is a separate `eboard_channel_members` row.

| Route | File | Guard | Back-fallback |
| --- | --- | --- | --- |
| `/clubs/:clubId/eboard` | `eboard/index.tsx` | `club.isAdmin`; a **member is redirected to `/chat`** | `/clubs/:clubId` |
| `…/eboard/create` | `create.tsx` | `club.isAdmin` | `/clubs/:clubId/eboard` |
| `…/eboard/chat` | `chat.tsx` | `channel.isMember` (redirects) | `/clubs/:clubId` |
| `…/eboard/highlights` | `highlights.tsx` | `channel.isMember` | `…/eboard/chat` |
| `…/eboard/gallery` | `gallery.tsx` | `channel.isMember` | `…/eboard/profile` |
| `…/eboard/profile` | `profile.tsx` | `channel.isMember` | `/clubs/:clubId/eboard` |
| `…/eboard/edit` | `edit.tsx` | `channel.isMember` | `…/eboard/profile` |
| `…/eboard/roster` | `roster.tsx` | `canManage = channel.isMember` (not club-admin) | `…/eboard/profile` |
| `…/eboard/meetings` | `meetings.tsx` | `channel.isMember` (redirects) | `…/eboard/chat` |
| `…/eboard/meeting/create` | `meeting/create.tsx` | `channel.isMember`; `?meetingId=` = edit (creator-only), `?from=chat` | `…/eboard/meetings` |
| `…/eboard/meeting/:meetingId` | `meeting/[meetingId].tsx` | `channel.isMember`; edit/delete creator-only | `…/eboard/meetings` |
| `…/eboard/polls` | `polls/index.tsx` | `channel.isMember`; `canCreate` unconditionally true | `…/eboard/chat` |
| `…/eboard/polls/create` | `polls/create.tsx` | `channel.isMember` | `…/eboard/polls` |
| `…/eboard/polls/:pollId` | `polls/[pollId].tsx` | `channel.isMember` | `…/eboard/polls` |

## Nested Stacks

Every subtree with more than one screen gets its own `_layout.tsx` `Stack` and is registered in its parent as `headerShown: false`:

```
(tabs)/_layout            Tabs
└─ clubs/_layout          Stack   index (masthead) · create · join · [clubId]
   └─ [clubId]/_layout    Stack   index · chat · calendar · events · highlights
      │                           · event/* · member/*   + 6 nested groups
      ├─ club-profile/_layout   Stack  index · edit · members · gallery
      ├─ news/_layout           Stack  index · create
      ├─ routines/_layout       Stack  index · activity-type · workout/*
      ├─ polls/_layout          Stack  index · create · [pollId]
      ├─ races/_layout          Stack  index · create · [raceId]
      ├─ race/[raceId]/_layout  Stack  13 screens
      └─ eboard/_layout         Stack  15 screens
```

`(tabs)/clubs/` needing its own `_layout.tsx` is not optional: without it Expo Router hoists `clubs/[clubId]` as a stray third tab in the bottom bar.

## Layout-context pattern

```ts
// clubs/[clubId]/_layout.tsx
export function useClub() {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error("useClub must be used within a club route");
  return ctx;
}
```

All three follow the same shape: fetch-once in a `useEffect`, `LoadError` + retry token on failure, `ActivityIndicator` while loading, provider wrapping the `Stack`. Consequences worth knowing:

- **The scope object is fetched once per layout mount**, not per screen. A screen that mutates the club/race/eboard identity (e.g. `club-profile/edit`) does not automatically refresh the context - `useEboard()` exposes an explicit `reload()` for this; club and race do not.
- **Screens below are data-free wrappers.** `clubs/[clubId]/chat.tsx` is 37 lines and contains zero queries.
- **A guard that redirects must also render a placeholder**, because the redirect happens in an effect (one frame later). Every guarded screen returns an `ActivityIndicator` in the denied branch.

## Header conventions

| Convention | Implementation |
| --- | --- |
| Back button | `headerLeft: makeBackHeaderLeft(router, fallback)` on **every** club-scoped `Stack.Screen` |
| Tappable title | `headerTitle: () => <TouchableOpacity onPress={…}>` - avatar + name, jumps to that scope's profile screen |
| Header background | `headerStyle: { backgroundColor: colors.surfaceContainerLow }` |
| Title type | `{...typography.headlineLgMobile, fontSize: 17, color: colors.primary}` |
| Modals | `presentation: "modal"` on every create/edit form |
| Masthead | Only `clubs/index` (and the `brandedHeaderOptions` applied to Calendar/Notifications/Profile roots) shows the "ClubChat" wordmark |

`makeBackHeaderLeft` exists because **a native `headerLeft` only renders when `canGoBack()` is true** - direct URL navigation or a web page refresh leaves no history on *any* screen, not just a stack root. Every nested Stack re-declares `clubScreenOptions` locally rather than inheriting, because each is registered `headerShown: false` in its parent.

`components/ChatScreen.tsx` and `components/HighlightsScreen.tsx` opt out of the native header entirely (`navigation.setOptions({ headerShown: false })`) and render their own `expo-blur` glass header - hence their `backFallback` prop, which reimplements `makeBackHeaderLeft`'s logic inline. See [Design system](08-design-system.md).

## Chat-first redirect

Chat is the landing surface for a scope - see [Chat](../PRD/03-chat.md). Race and Eboard hubs no longer show a feature grid. `race/[raceId]/index.tsx` and `eboard/index.tsx` each redirect a real member straight to `/chat` on mount; the hub only renders for the not-yet-a-member states (request-to-join, "Manage roster", "create the channel"). The features that used to be grid rows are now reached from chat's own header dropdown (`headerMenu` prop):

| Scope | `headerMenu` rows |
| --- | --- |
| Club | Members · Poll · Routines · Events |
| Race | Members · Meet Information · Polls · Car Assignments & Groups |
| Eboard | Members · Meetings · Polls |

Consequence: **race/eboard chat's `backFallback` must not point at its own hub** (`/clubs/:clubId/races` and `/clubs/:clubId` respectively), or a no-history entry would bounce hub → chat → hub forever.

## Cross-tab origin: `?from=`

`router.push`ing across sibling tabs leaves no real back-history to the origin tab. The fix is to pass the origin explicitly and have the destination override its own back button:

| Param | Set by | Handled by | Behavior |
| --- | --- | --- | --- |
| `?from=profile` | `(tabs)/profile/index.tsx` → `/clubs/:id?from=profile` | `clubs/[clubId]/index.tsx` `useLayoutEffect` | `router.dismissTo("/clubs")` **then** `router.replace("/profile")` |
| `?from=clubsTab` | `(tabs)/_layout.tsx` `tabPress` | same | Unconditionally overrides back → `router.dismissTo("/clubs")` |
| `?from=chat` | `ChatScreen`'s "+" attach menu | `event/create.tsx`, `eboard/meeting/create.tsx`, `PollCreateScreen` | After save, return to chat instead of the new item's detail screen |

The two-call `dismissTo` **then** `replace` sequence in the `from=profile` branch is required: switching tabs does not reset the origin tab's own Stack, so leaving the hub in place produced an infinite Profile ↔ hub loop via the tab bar. Both calls run synchronously in the same handler, so no intermediate screen flashes.

Other params in use: `?messageId=` (Highlights row → jump to that message in chat), `?tab=pinned|announcements` (chat's pinned strip → Highlights), `?eventId=` / `?postId=` / `?workoutId=` / `?meetingId=` (create screen doubling as edit), `?code=` (join deep link), `?date=` + `?activityType=` (routines workout create).

## `replace` vs `dismissTo` vs `navigate`

| Call | Use when | Why not the others |
| --- | --- | --- |
| `router.push` | Normal forward navigation | - |
| `router.replace(path)` | Redirecting a guard, or jumping **across tabs** | `dismissTo`'s `POP_TO` action only bubbles through Stacks that are ancestors of the *current* screen - across sibling tabs it silently no-ops |
| `router.dismissTo(path)` | Popping back to a route you are already nested under (hub → Clubs list) | `replace` swaps only the top-of-stack entry, so `[index, hub]` becomes `[index, index]` - still depth 2, leaving a spurious back button on what looks like the root |
| `router.back()` | Only behind a `canGoBack()` check | Throws `GO_BACK was not handled` when the screen was reached by direct URL |

## Invariants

1. **Every club-scoped `Stack.Screen` declares `headerLeft: makeBackHeaderLeft(router, fallback)`.** Never rely on the native back button.
2. **Never call `router.back()` unguarded.** Always `canGoBack() ? back() : replace(fallback)`.
3. **`dismissTo` only within the current Stack's ancestry**; `replace` for anything cross-tab.
4. **A guarded screen renders a placeholder in its denied branch** - the redirect is one frame late.
5. **Chat `backFallback` never points at that scope's own hub** when the hub redirects members into chat.
6. **A new nested Stack must be registered `headerShown: false` in its parent** and re-declare its own header options.
7. **Cross-tab entry passes `?from=<origin>`**; the destination overrides its back button rather than trusting `canGoBack()`.
8. **Scope access is decided in `_layout.tsx`, not per screen.** Per-screen guards only narrow further (`isMember` on top of `isManager`).

## Extension points

- **New screen inside an existing scope**: add the file, register a `Stack.Screen` in that scope's `_layout.tsx` with a title and `makeBackHeaderLeft` fallback, read `useClub()`/`useRace()`/`useEboard()` for data.
- **New scope-level feature reachable from chat**: add a row to that chat wrapper's `headerMenu` array (`{label, path, icon}`) - no `ChatScreen` change needed.
- **New create-from-chat action**: add a `create*Path` to the wrapper's `attachMenu` and handle `?from=chat` in the create screen's post-save navigation.
- **New tab**: add to `app/(tabs)/_layout.tsx`; if it needs more than one screen, give it a nested Stack like `profile/` and `clubs/`.

## Known gaps

- **No route-level typed params.** Every screen re-declares its own `useLocalSearchParams<{…}>()` shape by hand.
- **No 404/unmatched-route screen** beyond Expo Router's default.
- **`clubs/[clubId]/routines` and `/polls` are not linked from the club hub** - the routes and RLS are intact, but they are reachable only via chat's header menu (Routines, Poll) after a deliberate decision not to add a stopgap "More" menu.
- **`useClub()`/`useRace()` have no `reload()`**, unlike `useEboard()`, so an in-place identity edit needs a remount to be reflected in the header.
- Full write-ups of the navigation bugs summarized above (the Profile↔hub loop, the spurious back button, `GO_BACK not handled`, the `/` spinner) live in [Engineering pitfalls](12-engineering-pitfalls.md).
