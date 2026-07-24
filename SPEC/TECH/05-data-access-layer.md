# Data Access Layer

Every Supabase read, write, RPC call, and Storage operation in the app, organized by the `lib/*.ts` module that owns it.

## Overview

`lib/` is the only place that talks to Supabase. Each module is a flat set of exported `async` functions plus the interfaces they return; there are no classes, no repositories, no query builders, and no caching. Screens import a function, call it in a `useEffect`/`useFocusEffect`, and render the result.

The shared conventions are:

| Convention | Rule |
| --- | --- |
| Shape | Plain exported `async function`, named `fetch*` / `create*` / `update*` / `delete*` / `toggle*` / `search*` |
| Types | Queries are typed against `types/database.ts` via `createClient<Database>` |
| Return | App-shaped **camelCase** interfaces, never raw `snake_case` rows |
| Errors | `if (error) throw error` — never return `{data, error}` to a screen |
| Multi-arg | 1–3 primitives positionally; more than that (or any create) takes a single `params` object |
| Private buckets | Short-lived signed URLs generated **per fetch**, batched with `createSignedUrls` |
| Public buckets | `getPublicUrl` at upload time; the returned URL is stored on the row |
| Realtime | `subscribe*` returns an unsubscribe function; topic strings carry a monotonic counter |

## Key files

| Path | Responsibility |
| --- | --- |
| `lib/supabase.ts` | The single client instance |
| `types/database.ts` | Hand-written `Database` generic + every enum union |
| `lib/reportError.ts` | Uniform user-facing error surfacing |
| `lib/uploadBody.ts` | Cross-platform file→upload-body conversion |
| `lib/uuid.ts` | Hermes-safe UUID for storage filenames |

---

## Client and types

```ts
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
```

Reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` and **throws at import time** if either is missing — which is why `jest.setup.js` seeds dummy values.

`types/database.ts` is **hand-written** to match `supabase/migrations/`. Its shape is load-bearing: supabase-js's `Database` generic requires each table to declare `Row`, `Insert`, `Update`, **and `Relationships: []`**, and the schema object needs `Tables`, **`Views: {}`**, and **`Functions: {}`** all present. Omitting any of these does not error — it silently resolves every query's type to `never`, and every call site starts failing type-check for unrelated-looking reasons. It also exports the app's enum unions (`ClubRole`, `MessageType`, `NotificationType`, `CalendarEventType`, `RoutineActivityType`, `ClubJoinPolicy`, `JoinRequestStatus`) and the `Functions` signatures for all 14 RPCs.

## Error handling

Two pieces, applied across ~24 screens:

```ts
export function reportError(err: unknown) {
  const message = err instanceof Error ? err.message : "Something went wrong";
  if (Platform.OS === "web") window.alert(message);
  else Alert.alert("Error", message);
}
```

`lib/reportError.ts` handles **action** failures (a save, a delete, a vote). `components/LoadError.tsx` handles **load** failures: a screen keeps a `loadError` boolean plus a `retryToken` counter, renders `<LoadError message="…" onRetry={() => setRetryToken(t => t + 1)} />`, and keys its loading effect on the token. Nothing is reported to any monitoring service.

## Uploads

Two helpers exist purely for platform parity:

- `lib/uploadBody.ts` — `readUploadBody(uri): Promise<Blob | ArrayBuffer>`. On web, `fetch(uri).blob()`. On native, `FileSystem.readAsStringAsync(uri, {encoding: Base64})` decoded via `base64-arraybuffer`, because RN's Blob polyfill cannot convert a `file://` fetch response into a Blob (Supabase Storage throws "Creating blobs from 'ArrayBuffer'… are not supported" deep inside). The `expo-file-system/legacy` API is used deliberately — SDK 57's new `File.arrayBuffer()` worked on iOS but reproduced the crash on Android.
- `lib/uuid.ts` — `randomUUID()`, a `Math.random`-based v4. `crypto.randomUUID()` doesn't exist in Hermes; this is only used for storage filenames, never anything security-sensitive.

Picker shims: `lib/pickImageOnWeb.ts` and `lib/pickDocumentOnWeb.ts` build a real `<input type="file">` and call `.click()` on it, because expo-image-picker's and expo-document-picker's web shims dispatch a **synthetic** click, which some browser configurations don't accept as user activation. `pickImageOnWeb({captureCamera: true})` additionally sets `capture="environment"`.

---

## Module reference

### `lib/clubs.ts` — clubs, join, avatars

| Export | Signature | Description |
| --- | --- | --- |
| `ClubWithRole`, `SearchedClub`, `ClubProfile` | interfaces | Return shapes |
| `fetchMyClubs` | `(userId) => Promise<ClubWithRole[]>` | Every club the caller belongs to, with their role |
| `createClub` | `({name, description, sport, createdBy, joinPolicy})` | Insert + return the new club |
| `joinClubByCode` | `(code)` | RPC `join_club_by_code` (lowercased, trimmed) |
| `buildClubJoinLink` | `(inviteCode) => string` | Wraps the code in a `clubchat://` deep link |
| `searchClubs` | `(query) => Promise<SearchedClub[]>` | RPC `search_clubs` |
| `joinOrRequestClub` | `(clubId) => Promise<"joined" \| "requested">` | RPC `join_or_request_club` |
| `fetchClubProfile` | `(clubId) => Promise<ClubProfile>` | — |
| `updateClubProfile` | `(clubId, {name, description, joinPolicy})` | — |
| `uploadClubAvatar` | `(clubId, fileUri, contentType) => Promise<string>` | Public `club-avatars` bucket → `getPublicUrl` |
| `deleteClub` | `(clubId)` | Owner-only at the RLS layer; cascades |

### `lib/members.ts` — club roster

| Export | Signature | Description |
| --- | --- | --- |
| `ClubMemberRow`, `JoinRequestRow`, `SearchedUser` | interfaces | — |
| `fetchClubMembers` | `(clubId) => Promise<ClubMemberRow[]>` | Roster with profile join |
| `promoteToAdmin` / `demoteToMember` | `(clubId, userId)` | Role writes |
| `transferOwnership` | `(clubId, newOwnerUserId)` | RPC `transfer_ownership` |
| `fetchPendingRequests` | `(clubId) => Promise<JoinRequestRow[]>` | — |
| `decideJoinRequest` | `(requestId, approve)` | RPC `decide_join_request` |
| `removeMember` | `(clubId, userId)` | — |
| `searchUsersToAdd` | `(query, excludeIds) => Promise<SearchedUser[]>` | Global profile search |
| `addMember` | `(clubId, userId)` | Direct add |

### `lib/messages.ts` — chat backend (channel-agnostic)

| Export | Signature | Description |
| --- | --- | --- |
| `DisplayMessage` | interface | 19 fields incl. `photoUrl`, `documentUrl`, `pollId`/`eventId`/`meetingId`, `deletedAt`, `reactions`, `mentions` |
| `fetchMessages` | `(channelId, options?: {limit?, before?}) => Promise<DisplayMessage[]>` | No options = full history (Highlights); `limit` = newest N; `limit + before` = the next older page |
| `fetchMessagesAround` | `(channelId, targetMessageId) => Promise<{messages, hasMoreOlder}>` | ≤50 at-or-before + ≤50 after — powers jump-to-message |
| `GalleryPhoto` | interface | — |
| `fetchChannelPhotos` | `(channelId) => Promise<GalleryPhoto[]>` | Gallery grid |
| `sendMessage` | `({channelId, senderId, body, messageType?, mentionedUserIds?})` | Insert, then tag mentions |
| `sendPhotoMessage` | `({channelId, senderId, fileUri, contentType, caption?})` | Upload to private `message-photos`, then insert |
| `sendDocumentMessage` | `({channelId, senderId, fileUri, contentType, fileName, fileSizeBytes})` | Upload to private `message-documents`; extension comes from the **filename**, not the MIME type |
| `togglePinned` | `(messageId, pinned)` | — |
| `deleteMessage` | `(messageId)` | **Soft** — `UPDATE` sets `deleted_at`, clears body/media/document fields |
| `reportMessage` | `({messageId, channelId, reporterId})` | No-ops on a repeat report |
| `ReportedMessage` / `fetchReportedMessages` / `dismissReports` | — | Admin Reports tab |
| `toggleReaction` | `(messageId, userId, emoji)` | — |
| `subscribeToNewMessages` | `(channelId, onChange) => () => void` | Realtime; topic carries a module-level counter so a fast remount can't collide with a not-yet-torn-down subscription |

Photo and document URLs are **signed per fetch** (1h TTL) via batched `createSignedUrls`, because both buckets are private and gated by the same `is_channel_member` check as `messages` itself.

### `lib/mentions.ts` — @mention parsing (pure, no I/O)

| Export | Signature | Description |
| --- | --- | --- |
| `MentionCandidate`, `MessageBodySegment` | types | — |
| `highlightMentions` | `(body, mentions) => MessageBodySegment[]` | Splits a body into text/mention spans, longest name first so a prefix name can't shadow a longer one |
| `matchTrailingMentionQuery` | `(draft) => string \| null` | Detects an in-progress `@…` |
| `insertMentionIntoDraft` | `(draft, query, candidate) => string` | — |
| `filterMentionCandidates` | `(candidates, query) => MentionCandidate[]` | — |

Message bodies store **plain typed text only**; who was mentioned lives in `message_mentions`. An earlier design embedded `@[Name](id)` markup in the draft and leaked it into the composer.

### `lib/calendar.ts` — club events

`DisplayCalendarEvent` · `fetchEvents(clubId)` · `fetchEvent(eventId)` · `createEvent({clubId, eventType, title, description, location, startAt, endAt})` · `updateEvent(eventId, {…same minus clubId})` · `deleteEvent(eventId)`.

### `lib/calendarFeed.ts` — the unified feed

| Export | Signature | Description |
| --- | --- | --- |
| `CalendarFeedItem` | interface | `{id, kind: "event"\|"race"\|"meeting"\|"poll", title, subtitle, badgeLabel, atIso, hasTime, path, isOpen?, clubName?}` |
| `fetchCalendarFeed` | `(clubId, userId, isClubAdmin) => Promise<CalendarFeedItem[]>` | Merges `fetchEvents` + `fetchRaces` + `fetchEboardChannel`/`fetchMeetings` + `fetchPolls` |
| `fetchGlobalCalendarFeed` | `(userId) => Promise<CalendarFeedItem[]>` | One `fetchCalendarFeed` per club from `fetchMyClubs`, merged and re-sorted, each item tagged `clubName` |

**Pure aggregation over existing per-feature reads — no new tables, no new RLS.** Every source already enforces its own visibility. `isOpen` exists because a poll has no fixed date: Upcoming/Past bucketing for polls uses `isPollEffectivelyClosed`, not a date compare, so an open-ended poll can't flip to "Past" the moment its `createdAt` passes.

### `lib/races.ts` — races and Meet Information

| Export | Signature | Description |
| --- | --- | --- |
| `RaceListItem` / `fetchRaces` | `(clubId, userId, isClubAdmin) => Promise<RaceListItem[]>` | Per-race access + request status + the caller's own `pinned` |
| `setRacePinned` | `(raceId, userId, pinned)` | Upsert/delete the caller's `race_pins` row; no admin check — RLS scopes it to `auth.uid()` |
| `createRace` | `({clubId, name, eventDate, createdBy})` | Name + date only; standalone, not tied to a calendar event |
| `requestJoinRace` | `(raceId) => Promise<"joined" \| "requested">` | RPC `request_join_race` |
| `RaceAccess` / `fetchRaceAccess` | `(raceId, userId)` | Membership + request status — used by the preview screen |
| `RaceDetail` / `fetchRace` | `(raceId)` | `channelId` is `string \| null` — a manager who isn't a member can't read the channel row |
| `RaceProfile` / `fetchRaceProfile` / `updateRaceProfile` / `uploadRaceAvatar` | — | Identity + public `race-avatars` bucket |
| `RaceMemberRow` / `fetchRaceMembers` / `addRaceMember` / `removeRaceMember` | — | Roster |
| `RaceJoinRequestRow` / `fetchPendingRaceRequests` / `decideRaceJoinRequest` | — | RPC-backed decision |
| `SearchedClubMember` / `searchClubMembersToAdd` | `(clubId, query, excludeIds)` | Add-member pool = the club's own roster |
| `RaceLocationInfo` / `fetchRaceLocationInfo` / `updateRaceLocationInfo` | — | All 5 Meet Information fields as one fetch/update |
| `deleteRace` | `(raceId)` | — |

### `lib/eboard.ts` — Eboard channel and meetings

`EboardChannel` · `fetchEboardChannel(clubId, userId)` · `createEboardChannel({clubId, name, description, createdBy})` · `updateEboardProfile` · `uploadEboardAvatar` · `deleteEboardChannel` · `requestJoinEboardChannel(id)` · `fetchEboardMembers` / `addEboardMember` / `removeEboardMember` · `fetchPendingEboardRequests` / `decideEboardJoinRequest` · `searchClubAdminsToAdd(clubId, query, excludeIds)` · `EboardMeeting` · `fetchMeetings(eboardChannelId)` / `fetchMeeting` / `createMeeting({eboardChannelId, title, description, meetingLink, meetingAt, createdBy})` / `updateMeeting` / `deleteMeeting`.

`fetchEboardChannel` checks membership with an **explicit `.eq("user_id", userId)`** — the mere presence of roster rows is not a valid "am I a member" proxy here, since any club admin can read the full roster.

### `lib/polls.ts` — polls across all three scopes

| Export | Signature | Description |
| --- | --- | --- |
| `PollScope` | `{type:"club",clubId} \| {type:"race",clubId,raceId} \| {type:"eboard",clubId,eboardChannelId}` | Threaded through instead of a bare `clubId` |
| `PollListItem` / `fetchPolls` | `(scope, currentUserId) => Promise<PollListItem[]>` | Carries `closesAt` + `hasVoted` (powers MY VOTES) |
| `createPoll` | `({scope, question, options, allowMultiple, isPrivate, closesAt, createdBy}) => Promise<{id}>` | — |
| `PollDetail`, `PollOptionDetail` / `fetchPoll` | `(pollId, currentUserId)` | — |
| `PollVoter` / `fetchPollVoters` | `(pollId) => Promise<Record<optionId, PollVoter[]>>` | Only called when eligible; selects `avatar_url` |
| `castVote` | `(optionId)` | RPC `cast_vote` — casts, toggles, or moves |
| `setPollClosed` / `deletePoll` | — | Creator-only at the RLS layer |
| `isPollEffectivelyClosed` | `({isClosed, closesAt}) => boolean` | Exported so clients can't drift from the server-side `is_poll_closed` check |

### `lib/routines.ts` — weekly workouts

`ACTIVITY_TYPES` (10 entries) · `ACTIVITY_LABELS` · `ACTIVITY_ICONS` · `DisplayRoutineWorkout` · `fetchWeekWorkouts(clubId, startDate, endDate)` · `fetchWorkout(workoutId)` · `createWorkout({clubId, workoutDate, activityType, title, description, createdBy}): Promise<string>` · `updateWorkout(workoutId, {title, description})` · `deleteWorkout(workoutId)`.

### `lib/carGroups.ts` — race carpools

`CarGroup`, `CarGroupMember` · `fetchCarGroups(raceId)` (groups with members + incharge name attached) · `createCarGroup({raceId, name, createdBy})` — **the caller computes the name** as `Group ${groups.length + 1}`, there is no server-side naming · `deleteCarGroup` · `addCarGroupMember({carGroupId, raceId, userId, addedBy})` · `removeCarGroupMember(carGroupId, userId)` · `setCarGroupIncharge(groupId, userId | null)` (RPC `set_car_group_incharge`, which validates current membership first) · `SearchedRaceParticipant` / `searchRaceParticipantsToAdd(raceId, query, excludeIds)` — the real race roster only, excluding anyone already in any group for that race.

### `lib/clubPosts.ts` — News & Highlights

`ClubPost` · `fetchClubPosts(clubId)` / `fetchClubPost(postId)` · `uploadClubPostPhoto(clubId, {uri, contentType})` · `createClubPost({clubId, createdBy, body, mediaUrl})` · `updateClubPost(postId, {body, mediaUrl?})` — an **omitted** `mediaUrl` leaves the photo untouched, a path replaces it, `null` removes it · `deleteClubPost` (hard delete — a post has no conversation-continuity reason to tombstone) · `toggleClubPostReaction(postId, userId, emoji)`. Private `club-post-photos` bucket, signed per fetch, same pattern as `lib/messages.ts`.

### `lib/notifications.ts` — inbox and unread ([Notifications](../PRD/10-notifications.md))

| Export | Signature | Description |
| --- | --- | --- |
| `NotificationFeedItem` | `{kind:"notification",…} \| {kind:"chat_unread",…}` | Discriminated union |
| `fetchNotificationFeed` | `(userId, options?: {limit?, before?})` | Merges `notifications` rows with `fetch_unread_channel_summaries()`; the RPC is fetched **only on page 1** (uncursored) since it's bounded by channel count |
| `fetchUnreadBadgeCount` | `(userId) => Promise<number>` | Drives the tab badge |
| `markAllNotificationsRead` | `(userId)` | Bulk; **excludes** the 3 pending-join-request types and never touches `channel_reads` |
| `markNotificationsReadForPath` | `(userId, targetPath)` | Exact-match; the only way the 3 request types clear |
| `markChannelRead` | `(channelId, _userId)` | RPC `mark_channel_read_and_log` — logs an already-read `chat_caught_up` row *before* advancing `channel_reads` |
| `fetchChannelLastReadAt` | `(channelId, userId) => Promise<string \| null>` | Read by `ChatScreen` before `markChannelRead`, to find the first unread message |
| `subscribeToNotifications` | `(userId, onChange, tag = "default") => () => void` | `tag` + a monotonic per-attempt counter keep independent subscribers off the same topic |

### `lib/profile.ts` — self

`Profile` · `fetchProfile(userId)` · `formatDateOfBirth(iso)` — builds the `Date` from split `y/m/d` so it can't render a day early behind UTC · `updateProfile(userId, {fullName, bio, city, dateOfBirth, school})` · `uploadAvatar(userId, fileUri, contentType)` (public `avatars` bucket) · `deleteAccount()` — RPC `delete_account`; **the caller must still call `supabase.auth.signOut()` immediately after**, since the RPC only blocks future auth.

### `lib/dates.ts` — pure date helpers (fully unit-tested)

`toDateKey` · `getMonday` · `addDays` · `addMonths` · `splitIso` · `combineToIso` · `timeAgo` · `isPastInstant` · `isPastDateOnly` · `isSameInstant` · `formatCountdown`. No I/O; extracted specifically to be testable — see [Testing & CI](09-testing-and-ci.md).

### `lib/legalContent.ts`

`LEGAL_LAST_UPDATED` · `LegalSection` · `PRIVACY_POLICY_SECTIONS` · `TERMS_SECTIONS`. Content data only, flagged in-file as a first draft needing real legal review.

---

## RPC wrappers

14 Postgres functions are called from the client. Each is declared in `types/database.ts`'s `Functions` block and wrapped by exactly one `lib/` function.

| RPC | Wrapper | Why an RPC |
| --- | --- | --- |
| `join_club_by_code` | `clubs.joinClubByCode` | Needs to read a club the caller can't yet see |
| `search_clubs` | `clubs.searchClubs` | Returns member counts + the caller's request status |
| `join_or_request_club` | `clubs.joinOrRequestClub` | Branches on `join_policy` server-side |
| `decide_join_request` | `members.decideJoinRequest` | Approval writes two tables + notifications |
| `transfer_ownership` | `members.transferOwnership` | Must demote before promoting (unique index is per-statement) |
| `request_join_race` / `decide_race_join_request` | `races.*` | Race equivalents |
| `request_join_eboard_channel` / `decide_eboard_join_request` | `eboard.*` | Eboard equivalents, decided by existing members |
| `cast_vote` | `polls.castVote` | Cast/toggle/move in one transaction; plain security-invoker, never `INSERT…RETURNING` |
| `set_car_group_incharge` | `carGroups.setCarGroupIncharge` | Validates current membership first |
| `delete_account` | `profile.deleteAccount` | Anonymize + `banned_until`, not a hard delete |
| `fetch_unread_channel_summaries` | `notifications.*` | Live unread computation, never stored |
| `mark_channel_read_and_log` | `notifications.markChannelRead` | Logs `chat_caught_up` before advancing the read cursor |

## Storage buckets

| Bucket | Visibility | Path shape | URL strategy |
| --- | --- | --- | --- |
| `avatars` | public | `${userId}/…` | `getPublicUrl`, stored on the row |
| `club-avatars` | public | `${clubId}/…` | `getPublicUrl` |
| `race-avatars` / `eboard-avatars` | public | scoped by id | `getPublicUrl` |
| `message-photos` | private | `${channelId}/${uuid}.ext` | `createSignedUrls`, 1h, per fetch |
| `message-documents` | private | `${channelId}/${uuid}.ext` | `createSignedUrls`, 1h, per fetch |
| `club-post-photos` | private | `${clubId}/${uuid}.ext` | `createSignedUrls`, per fetch |

See [Media & storage](07-media-and-storage.md) for the bucket policies themselves.

## Invariants

1. **No `supabase` import outside `lib/`**, except the two layout files noted in [Architecture](00-architecture.md).
2. **`lib` functions throw on error.** A screen catches and calls `reportError`, or flips `loadError` and renders `LoadError`.
3. **Return camelCase app types.** A raw row must never reach a component.
4. **Signed URLs are generated per fetch and never persisted.** Storing one would outlive its TTL and leak a bearer-ish URL.
5. **`types/database.ts` must keep `Row`/`Insert`/`Update`/`Relationships` and `Tables`/`Views`/`Functions`** — a missing key silently degrades to `never`.
6. **A new RPC needs its `Args`/`Returns` added to `types/database.ts`'s `Functions` block** before it can be called type-safely.
7. **`deleteAccount()` must be followed by `supabase.auth.signOut()`** at the call site.
8. **`isPollEffectivelyClosed` is the only client-side "is this poll closed" check** — do not re-derive it inline.
9. **Realtime topic strings include a monotonic counter**, so a fast unmount/remount can't collide with a pending teardown.
10. **Uploads go through `readUploadBody`**, never a bare `fetch(uri).blob()`.

## Extension points

| Goal | Do this |
| --- | --- |
| New feature with its own table | New `lib/<feature>.ts`; add the table to `types/database.ts` (all four keys); migration with RLS |
| New RPC | Add to the `Functions` block, wrap in exactly one `lib` function |
| New private bucket | Follow `message-photos`: `${scopeId}/${randomUUID()}.ext`, `createSignedUrls` batched per fetch, RLS keyed on the path's first segment |
| New aggregated view | Follow `calendarFeed.ts` — compose existing `fetch*` functions; do not add a new table or policy |
| New notification | Prefer a Postgres trigger; see [Realtime & notifications](06-realtime-and-notifications.md) |

## Known gaps

- **No caching or request deduplication.** Sibling screens refetch the same rows independently on every focus.
- **`types/database.ts` drift risk.** It is maintained by hand against `supabase/migrations/`; nothing verifies the two agree.
- **`fetchGlobalCalendarFeed` is N+1 by design** — one `fetchCalendarFeed` per club, each of which itself fans out per race. Fine at current club counts, not at scale.
- **`fetchMessages()` with no options fetches unbounded history**, and `HighlightsScreen` calls it that way.
- **No retry/backoff anywhere.** A transient network failure surfaces as a `LoadError` the user must tap through.
- **Errors are shown, never recorded.** See [Architecture](00-architecture.md)'s known gaps.
