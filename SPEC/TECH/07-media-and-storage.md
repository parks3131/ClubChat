# Media & storage

Every Supabase Storage bucket, its path convention and access policies, plus the upload/display helpers that exist because browsers and React Native disagree about files.

## Overview

Seven buckets, split cleanly by whether the content is *identity* (public, served straight from a stored URL) or *content* (private, served via short-lived signed URLs generated per fetch).

The client never uploads through a server - it calls `supabase.storage.from(bucket).upload(path, body)` directly, and Storage's own RLS on `storage.objects` decides whether the write lands. Every private-bucket policy keys off the **first path segment**, which is why every path convention starts with the id that the check needs (`${channelId}/…`, `${clubId}/…`).

Related: [Data model](01-data-model.md) · [Security & RLS](02-security-rls.md) · [Data access layer](05-data-access-layer.md) · [Engineering pitfalls](12-engineering-pitfalls.md)

## Bucket catalogue

| Bucket | Public? | Path convention | Read policy | Write policy | Consumer |
| --- | --- | --- | --- | --- | --- |
| `avatars` (0010) | public | `${userId}/avatar` (no extension) | `bucket_id = 'avatars'`, role `public` | insert/update/delete: `(storage.foldername(name))[1] = auth.uid()::text` | `lib/profile.ts` → `uploadAvatar` |
| `club-avatars` (0014) | public | `${clubId}/avatar` | public | insert/update/delete: `is_club_admin(first_segment::uuid)` | `lib/clubs.ts` → `uploadClubAvatar` |
| `race-avatars` (0045) | public | `${raceId}/avatar` | public | insert/update/delete: `is_race_admin(first_segment::uuid)` | `lib/races.ts` → `uploadRaceAvatar` |
| `eboard-avatars` (0045) | public | `${eboardChannelId}/avatar` | public | insert/update/delete: `is_eboard_member(first_segment::uuid)` | `lib/eboard.ts` → `uploadEboardAvatar` |
| `message-photos` (0027) | **private** | `${channelId}/${uuid}.${ext}` | select: `is_channel_member(first_segment::uuid)` | insert: `is_channel_member(...)`. **No update/delete policy** | `lib/messages.ts` → `sendPhotoMessage` (write), `fetchMessages` + `fetchChannelPhotos` (read) |
| `message-documents` (0068) | **private** | `${channelId}/${uuid}.${ext}` | select: `is_channel_member(...)` | insert: `is_channel_member(...)`. No update/delete | `lib/messages.ts` → `sendDocumentMessage` |
| `club-post-photos` (0062) | **private** | `${clubId}/${uuid}.${ext}` | select: `is_club_member(first_segment::uuid)` | insert: `is_club_admin(first_segment::uuid)`. No update/delete | `lib/clubPosts.ts` → `uploadClubPostPhoto` |

Notes that matter:

- **Avatar buckets are public deliberately.** An `<Image source={{uri}}>` can then use a stored URL directly with no signing round-trip. Write access is still locked down; only *reads* are open, and only to a path that requires knowing the id.
- **Avatar paths carry no file extension** and are uploaded with `upsert: true`, so "one avatar per user/club/race/Eboard" needs no old-file cleanup. Storage serves the stored content-type regardless of extension. The stored URL is cache-busted with `?t=${Date.now()}` because the path never changes.
- **Chat and post content is private** because a private Eboard channel's photos must not be readable by anyone holding a guessable URL. The read check is the *same* `is_channel_member` that protects `messages` itself.
- **`message-photos` and `message-documents` are separate buckets** even though their policies are byte-identical - cheaper to reason about, and it keeps a future "documents are bigger, treat them differently" change local.
- **`message_type = 'photo'` and `'document'` both store their path in `messages.media_url`.** Documents add `document_name` and `document_size_bytes` for display; the extension in the path comes from the *filename* for documents (`workout_plan.pdf` → `pdf`) and from the *content type* for photos (`image/jpeg` → `jpeg`), because arbitrary document mime types don't split into a usable `type/subtype`.

## Signed URLs for private buckets

Private-bucket paths are stored in the database; a **displayable** URL is signed on demand and expires. Every signing call in the app goes through `lib/signedUrlCache.ts`, never through `createSignedUrls` directly.

```ts
// lib/signedUrlCache.ts
const TTL_SECONDS = 60 * 60 * 24 * 7;      // 7 days
const REFRESH_MARGIN_MS = 60 * 60 * 1000;  // re-sign an hour early

signStorageUrls(bucket, paths)  // memoized by `${bucket} ${path}`
```

**The URL must stay byte-identical across fetches, or nothing caches.** The signature rides in the query string and the query string is part of every cache key, so a freshly minted URL per fetch guarantees a permanent miss. The signature payload also embeds `iat` at one-second resolution, so re-signing the same path a second later genuinely produces a different URL. The memo is what holds it stable. See [ADR-0004](../decisions/0004-memoize-signed-media-urls.md) for the tradeoff and the rejected alternatives.

**Signing is batched, never per-row.** `attachSendersAndReactions` collects every photo path and every document path in the page, issues exactly one signing call per bucket for whatever is not already memoized, and resolves them into a `Map<path, signedUrl>` - all inside the same `Promise.all` that fetches profiles, reactions and mentions. A 50-message page therefore costs at most 2 signing calls, not 50, and zero on a revisit.

**Render sites must pass an explicit `cacheKey`.** The memo lives in memory, so a cold start re-signs everything; an `expo-image` disk cache keyed on the whole URL would miss on every launch. Photo sites pass `source.cacheKey = storageCacheKey(url)` (the URL with its query string stripped), which never rotates, plus `cachePolicy="memory-disk"`. Note both props are Android/iOS only - on web the browser's own HTTP cache is the only cache, and it keys on the full URL, which is exactly why the memo matters there.

The **Gallery** screen (`fetchChannelPhotos` → `components/GalleryScreen.tsx`, mounted for club / race / Eboard) reuses the same `signPhotoUrls` helper: one query for every `message_type = 'photo'` row in the channel, then **one** `createSignedUrls` call for the whole set. Rows whose signing fails are filtered out rather than rendered broken. Because it signs a channel's entire photo history in one call, it is the heaviest signing path in the app and the first place a per-page limit would be needed.

Consequences to keep in mind:

- URLs are **not stored in the database**, but they are **stable for a device** for up to seven days. Caching one is now expected rather than forbidden.
- The memo is per device and per process. Two devices still hold different URLs for the same object, so N viewers is still N origin downloads; only the repeat-fetch multiplier is gone.
- The memo is cleared on `SIGNED_OUT` (`contexts/AuthProvider.tsx`) so a second account on a shared device cannot inherit URLs for media it may not be allowed to see.
- A screen left open cannot go stale the way it used to: entries re-sign an hour before the seven day expiry.
- `DisplayMessage.photoUrl` / `.documentUrl` are always the signed form; `media_url` (the raw path) is not exposed to components. `storageCacheKey()` recovers the stable part from the signed URL for render sites that need it.

Public buckets use `getPublicUrl(path)` instead and store the resulting URL in the row (`profiles.avatar_url`, `clubs.avatar_url`, `races.avatar_url`, `eboard_channels.avatar_url`).

## The web file-picker workaround

`lib/pickImageOnWeb.ts` and `lib/pickDocumentOnWeb.ts` exist for one reason:

**Symptom.** On web, tapping "Photos" or "Document" ran the handler with no errors, but the native file dialog never opened for some users.

**Root cause.** `expo-image-picker`'s web shim (and `expo-document-picker`'s) opens its hidden `<input type="file">` via `input.dispatchEvent(new MouseEvent("click"))`. A synthetically dispatched event fires JS listeners but is **not** user activation as far as the browser is concerned - some configurations (privacy/content-blocking extensions) refuse to open the file dialog for it, while the handler itself still runs, so nothing looks wrong.

**Fix.** Bypass the library's web path entirely rather than patching `node_modules`: build the `<input>` by hand, append it, and call the real `input.click()`, which is specced to simulate a genuine click including the browser's default action. Native platforms are untouched - they use a real native module, not this DOM shim.

`pickImageOnWeb` also accepts `{ captureCamera: true }`, which sets `capture="environment"` to hint mobile browsers toward the camera; desktop browsers ignore it harmlessly. `pickDocumentOnWeb` was written **proactively** - the identical `dispatchEvent` pattern was spotted in `expo-document-picker` while building the attach menu, before it had a chance to bite.

Both return `{ uri }` where `uri` is a `blob:` URL from `URL.createObjectURL(file)`.

## `lib/uploadBody.ts` - the native upload fix

Every upload call site (7 of them: 4 avatars, chat photos, chat documents, club-post photos) reads the picked file through one helper:

```ts
export async function readUploadBody(uri: string): Promise<Blob | ArrayBuffer> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    return response.blob();            // blob: URL, real browser Blob
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return decode(base64);               // base64-arraybuffer → real ArrayBuffer
}
```

**Symptom.** Every photo/document/avatar upload crashed on device with `Creating blobs from 'ArrayBuffer' and ArrayBufferView are not supported`, thrown deep inside Supabase Storage's `.upload()`. Never reproduced on web, and jest-expo's environment doesn't reproduce it either.

**Root cause.** The original code did `fetch(uri).blob()` everywhere. That is correct for the `blob:` URLs the web pickers produce, but on native the URI is a local `file://` path and React Native's `Blob` polyfill cannot perform that conversion.

**First fix (worked on iOS, failed on Android).** Branch by platform and read raw bytes on native via `expo-file-system`'s brand-new SDK 57 `File.arrayBuffer()`. Confirmed working in the iOS Simulator; the identical crash reproduced on a real Android device. Tracing `@supabase/storage-js` (passes an `ArrayBuffer` through untouched) and React Native's `convertRequestBody` (also handles `ArrayBuffer` via base64) showed neither could explain a platform difference - pointing at `File.arrayBuffer()` itself, genuinely new code whose Android implementation apparently doesn't produce a real `ArrayBuffer`.

**Actual fix.** Supabase's own documented React Native pattern: read the file as base64 with `expo-file-system/legacy`'s battle-tested `readAsStringAsync`, decode with `base64-arraybuffer`'s `decode()`. Confirmed working on both iOS Simulator and a real Android device.

**Rule: a brand-new cross-platform API working on one OS is not evidence it works on the other.** Prefer the older, documented path for anything on the upload hot path.

## `lib/uuid.ts` - storage filenames

```ts
export function randomUUID(): string { /* Math.random-based v4 */ }
```

**Symptom.** `Property 'crypto' doesn't exist` on native - but only *after* the upload crash above was fixed, because that line was previously never reached.

**Root cause.** `crypto.randomUUID()` is a Web Crypto method browsers implement and Hermes does not.

**Fix.** A plain `Math.random()`-based v4 generator. Deliberately **not** `expo-crypto`: this id is only ever used for storage-path uniqueness, never for anything security-sensitive, and adding another native module carries its own native-linking risk. Used by `sendPhotoMessage`, `sendDocumentMessage`, `uploadClubPostPhoto` - the three paths that need a unique filename. Avatar paths don't need it (they're keyed by owner id and upserted).

## Invariants

1. **Private-bucket policies key off the first path segment.** Any new private bucket's path convention must start with the id its policy needs to check, and every writer must construct paths that way.
2. **The database stores a *path* for private buckets and a *URL* for public ones.** `messages.media_url` and `club_posts.media_url` are paths; `*.avatar_url` columns are URLs.
3. **Signed URLs are generated per fetch, batched per bucket, and never persisted.**
4. **Every upload goes through `readUploadBody`.** A raw `fetch(uri).blob()` anywhere is a native crash waiting to happen.
5. **Every generated storage filename uses `randomUUID()` from `lib/uuid.ts`,** never `crypto.randomUUID()`.
6. **Web file pickers go through `pickImageOnWeb` / `pickDocumentOnWeb`,** never expo's web shim directly.
7. **Avatar uploads use `upsert: true` on a stable, extensionless path,** and the stored URL is cache-busted.

## Extension points

- **A new private bucket:** copy 0027 verbatim - `insert into storage.buckets ... public = false`, a select policy and an insert policy both gated on `(storage.foldername(name))[1]::uuid`, and a comment recording that no update/delete policy is intentional.
- **File size / type limits** are not configured anywhere. Supabase supports per-bucket `file_size_limit` and `allowed_mime_types`; both are currently unset on all seven buckets.
- **Image resizing/transformation** is not used; full-resolution originals are uploaded and displayed. Supabase's image transformation API would slot in at the `createSignedUrls` call sites.
- **Orphan cleanup** would be a scheduled job (the pg_cron pattern already exists) reconciling `storage.objects` against `messages.media_url` / `club_posts.media_url`.

## Known gaps

- **No storage cleanup at all.** Deleting a message, a post, a club, a race, or an account leaves every associated object in place. Explicitly accepted in 0027/0062/0068 comments.
- **No update/delete policy on the three private buckets**, so even an admin cannot remove an object through the client - only the referencing row goes away.
- **No file size or mime-type limits** on any bucket. A member can upload an arbitrarily large "document".
- **Signed URLs expire after 1 hour** with no refresh mechanism on an idle screen.
- **`fetchChannelPhotos` is unpaginated** - it signs every photo a channel has ever had in a single call. Fine today, unbounded by design.
- **Avatar cache-busting relies on `?t=` in a stored URL**, so the database row changes on every re-upload even though the path doesn't.
- **Documents are never scanned or type-restricted** - `accept="*/*"` on web, any picked file on native.
