# Engineering pitfalls

Every bug in this repo that cost real debugging time, written so the next person doesn't pay for it twice. Read this before touching RLS, `FlatList`, or navigation.

## Overview

Each entry is **Symptom → Root cause → Fix → Rule**. They are grouped by layer: RLS, list virtualization, navigation, platform, and tooling. The two RLS entries are the most expensive lessons in the project's history and are reproduced in full.

Related: [Security & RLS](02-security-rls.md) · [Migrations](11-migrations.md) · [Navigation & routing](03-navigation-and-routing.md) · [Media & storage](07-media-and-storage.md)

---

## 1. `INSERT ... RETURNING` also enforces the SELECT policy

**Symptom.** Club creation failed with `new row violates row-level security policy for table "clubs"` - after verifying, repeatedly and exhaustively, that the policy text, grants, `auth.uid()` resolution, function ownership/`bypassrls`, Postgres version and the `row_security` GUC were all correct. It reproduced on a **brand new scratch table** whose policy was literally `with check (true)`, across two different Supabase cloud projects in two different orgs. There was a genuine, unrelated Supabase incident active at the time, which made this look conclusively like a platform-wide outage. It was not.

**Root cause.** Every one of those "repro" scratch tables had an INSERT policy but **no SELECT policy**. When Postgres executes `INSERT ... RETURNING` - which is exactly what supabase-js's `.insert().select()` and PostgREST's `Prefer: return=representation` generate - it doesn't only check the INSERT policy's `WITH CHECK`. It **also re-checks the returned row against the table's SELECT policy**, because RETURNING is effectively "read this row back."

The real `clubs` SELECT policy required `is_club_member(id)`. At the instant a brand-new club is inserted, the creator is not yet a member - that only happens moments later, in the `on_club_created` trigger. Chicken and egg. The scratch tables all failed identically because they had *no* SELECT policy at all (default deny), not because RLS was broken.

**Fix** (live in `0003_rls.sql`):

```sql
create policy "members can read their clubs"
  on public.clubs for select
  to authenticated
  using (public.is_club_member(id) or created_by = auth.uid());
```

The creator can see their own row immediately, independent of trigger timing.

**Rule.** Any table whose "can I see this row" check depends on something a **trigger creates afterward** needs its SELECT policy to also cover "I am the one who just created this." And an INSERT `with check` must always *imply* that table's SELECT `using` - otherwise the write succeeds and the read-back fails with a misleading write-side error.

---

## 2. The subtler variant: a self-referential SELECT-policy function

Found live while building Polls' race/Eboard scoping (0038). Distinct from #1 - no trigger is involved at all.

**Symptom.** A plain `INSERT` into `polls` (no RETURNING) succeeded every time. The identical insert through supabase-js's `.insert().select()` failed with "new row violates row-level security policy" - even though running `select can_access_poll(id)` manually, immediately afterward in the same transaction, returned `true`.

**Root cause.** The new SELECT policy was written as `using (can_access_poll(id))`, where `can_access_poll(p_poll_id)` is a security-definer function that does `select ... from public.polls p where p.id = p_poll_id`. This was modeled on `is_channel_member`, which is used the same way inside `channels`' own SELECT policy and was believed proven safe by that precedent.

It isn't safe in this shape. The *original*, working policy (`is_club_member(club_id)`) evaluated a column read straight off the tuple being returned - no further lookup. Routing the check through `can_access_poll(id)` instead makes the SELECT-policy check **re-query `polls` by id, from inside a function, during the same RETURNING evaluation that is still producing that very row** - a self-referential subquery back into the table being inserted into.

The `is_channel_member`/`channels` precedent turns out never to have been exercised through a client `.insert().select()`: every `channels` row in this codebase is inserted server-side by a trigger and never returned to a caller.

Confirmed by reproducing both the failure and the fix directly in `psql`, impersonating the caller with `set local role authenticated` + `select set_config('request.jwt.claims', ...)`.

**Fix.** Write the check inline, bound to the row's own columns:

```sql
create policy "eligible members can read polls"
  on public.polls for select
  to authenticated
  using (
    case
      when race_id is not null           then is_race_member(race_id)
      when eboard_channel_id is not null then is_eboard_member(eboard_channel_id)
      else                                    is_club_member(club_id)
    end
  );
```

(`can_access_poll` is still used - correctly - in `poll_options`' and `poll_votes`' policies, where it looks up a *different* table than the one being inserted into.)

**Rule.** A security-definer function that reads its own table from inside that table's SELECT policy is fine only when nothing ever does `INSERT...RETURNING` on a new row of that table. The moment a client `.insert().select()` must pass that policy, **bind the check to the row's own columns** rather than routing it through a "look this row up again by id" function.

---

## 3. `SELECT DISTINCT` breaks the implicit enum cast

**Symptom.** Posting an announcement in a **race** channel always failed with a 400 and rolled back the whole message insert. The identical action worked in club chat and Eboard chat.

**Root cause.** `notify_announcement`'s race branch was the only one of its three scope branches wrapping its recipient list in `select distinct ... from (... union ...)`. Postgres resolves an untyped literal like `'announcement'` against the INSERT target column's type **only while it stays "unknown"-typed** - but `SELECT DISTINCT` needs a concrete comparable type for every selected expression, so it forces the literal to `text` right there. Once it's genuinely `text`, Postgres refuses to implicitly cast it to a user-defined enum:

```
column "type" is of type notification_type but expression is of type text
```

Triggers run in the caller's transaction, so the whole `messages` insert aborted.

**Fix.** Cast explicitly wherever the literal is produced: `'announcement'::notification_type`. Applied to all three branches (0036), and re-applied when the same mistake recurred in `notify_poll_created` within the same session (0038).

**Rule.** Any enum literal inside a `SELECT DISTINCT` or `UNION` feeding an `INSERT ... SELECT` needs an explicit cast. Don't rely on the surrounding query's shape.

---

## 4. `role = 'admin'` audience filters silently exclude lone-Owner clubs

**Symptom.** A fresh test club with a single Owner and no separate Admins received **no** join-request notification at all. The `club_join_requests` row existed with `status='pending'`; zero `notifications` rows were ever inserted.

**Root cause.** 0043 introduced the `owner` role and widened `is_club_admin()` to `role in ('admin','owner')` - which fixed every *policy* for free. But audience queries that filter `club_members` directly were not swept: `notify_club_join_request`, `notify_race_join_request` (0046), and the race branches of `notify_announcement` and `notify_poll_created` (0048) all still filtered `cm.role = 'admin'`.

**Fix.** `cm.role in ('admin', 'owner')` in all four. `is_user_club_admin` (0017) still has this bug, currently masked because its only caller is bypassed by definer triggers - see [Security & RLS](02-security-rls.md).

**Rule.** Widening a role model means grepping for **direct role comparisons**, not just fixing the helper function. `grep -rn "role = 'admin'" supabase/migrations/` after any role change. Distinguish audience computations (must be swept) from role-*transition* checks like `if new.role = 'admin'` (must not be).

---

## 5. FlatList: four gotchas from "jump to this message" and unread-aware entry

All four were caught only by watching failures live, never by reading the code.

> **Update: the chat list is now `inverted`** (newest-first data, offset 0 = newest message at the visual bottom). The non-inverted design needed a scroll-to-bottom pass after every load, and that pass could land short of the true bottom - reproduced live as a caught-up chat opening a full screen above the latest message - because `scrollToEnd`'s notion of "the end" is only ever as good as what virtualization has measured. Inversion makes "at the latest message" the resting state instead of a scroll target, which **retires 5c and the `scrollToEnd` half of 5d entirely** (both branches no longer exist). Still live and load-bearing: **5a** (route-param refs), **5b** (`onScrollToIndexFailed`, now for the unread/Highlights landing), and 5d's mount-time guard (now on `onEndReached`, which is "load older" when inverted). Two inversion-specific facts worth knowing: `viewPosition` runs in the flipped coordinates (0 = visual bottom), and the content container's `paddingTop`/`paddingBottom` render swapped.

### 5a. A `useRef(initialValue)` seeded from a route param goes stale

**Symptom.** Chat → Highlights → tap a pinned message → chat opens but never scrolls to it; it silently falls through to the default behavior.

**Root cause.** The pending-scroll target was stored as `useRef<string | null>(targetMessageId ?? null)`, with `targetMessageId` from `useLocalSearchParams`. `useRef`'s initializer runs **once**, at mount. React Navigation reuses an already-mounted screen instance for the same route path with different search params (chat → Highlights → chat is a stack *pop* back to the existing chat screen, not a fresh push), so the ref never saw the new param.

**Fix.** Don't seed one-shot state from a hook value at declaration time. Set it **inside the effect that already reacts to that value changing** - here, the message-loading effect keyed on `[channelId, reload, targetMessageId]`.

**Rule.** Any "pending action" ref driven by a route param must be assigned in an effect keyed on that param, never in the `useRef` initializer. The same rule was deliberately applied to the deep-link invite-code handler.

### 5b. Retrying a failed `scrollToIndex` at the same index fails forever

**Symptom.** `onScrollToIndexFailed` fired repeatedly; the retry never landed.

**Root cause.** It fires when the target index is beyond `highestMeasuredFrameIndex`. Retrying the *same* call forces nothing new to render or measure, so it fails identically every time - this codebase's existing "retry after a short delay" pattern (used for restoring scroll position after prepending a page) does not transfer.

**Fix.** First `scrollToOffset` to an estimated position using the values the callback hands you for exactly this purpose (`info.averageItemLength * info.index`), which forces FlatList to render and measure further out; **then** retry `scrollToIndex` for the precise position.

### 5c. `onContentSizeChange` fires spuriously and a default branch undoes the jump

**Symptom.** The jump landed correctly, then the view snapped straight back to the bottom.

**Root cause.** `onContentSizeChange` fires repeatedly on this platform even when content hasn't grown - an assumption the original two-case handler ("just prepended an older page" / "everything else: scroll to bottom") had held implicitly since day one, never violated until a third path exercised it. Once the jump branch consumed its one-shot flag, every spurious re-fire fell into "everything else" and called `scrollToEnd()`.

**Fix.** While a jump target is active (`targetMessageId` still set - i.e. still viewing history the user explicitly navigated to), skip the default scroll-to-bottom branch entirely, including for realtime reloads that merge in new messages while old history is on screen.

**Rule (5b + 5c).** For any `scrollToIndex`-to-arbitrary-position feature: (a) never seed one-shot state from a hook value in a `useRef` declaration, and (b) audit **every existing branch** of a shared `onContentSizeChange`/`onScrollToIndexFailed` handler for "runs on every fire, not just the one you're adding" - a working two-case handler can hide an assumption a third case quietly violates.

### 5d. `initialNumToRender`, and the `onStartReached` that fires at mount

**Symptom (first).** A single `scrollToEnd()` from far up a long, mostly-unrendered list fell well short of the true bottom, and retrying barely helped.

**Root cause.** FlatList's default `initialNumToRender` is 10, so most of a 40–50 row page is genuinely unmeasured at mount, and `scrollToEnd`'s notion of "the end" is only as good as what's been measured.

**Fix.** `initialNumToRender={PAGE_SIZE}` - chat bubbles are cheap enough (mostly text) that rendering the whole page at mount isn't a real cost. This fixes the cause instead of papering over the symptom with more retries.

**Symptom (the new bug that fix caused).** An extra, unwanted older page loaded immediately on entering a chat.

**Root cause.** With the whole page rendered at mount, the list genuinely sits at scrollTop 0 for one instant before the initial positioning runs. That trivially satisfies `onStartReachedThreshold`, so `onStartReached` fires and `handleLoadEarlier` really executes. It only reproduces when the initial fetch returns a *full* page - which is why smaller test datasets never triggered it, and how it slipped through the previous fix's own verification.

**Fix.** A short grace-period ref (`readyForLoadEarlierRef`, false until ~600ms after the initial load resolves - longer than the scroll-settle retries) checked first by `handleLoadEarlier`.

**Rule.** Fixing a virtualization symptom can be worse than fixing its cause - and fixing the cause can surface a new, previously-impossible bug at the boundary where "content exists" and "real user scrolling" stop being the same signal. Treat `onStartReached`/`onEndReached` as suspect during the first render after any (re)mount.

---

## 6. Navigation

### 6a. `router.back()` throws with no history

**Symptom.** `The action 'GO_BACK' was not handled by any navigator.`

**Root cause.** The screen was reached by direct URL / deep link / page refresh rather than by pushing from inside the app, so there is no history entry to pop.

**Fix.** Any programmatic back-navigation from a guard or an action (redirecting a non-admin off an admin screen, leaving a detail screen after a delete) checks `router.canGoBack()` first and falls back to `router.replace(...)` to a known-good route.

### 6b. A native `headerLeft` back button only renders when `canGoBack()` is true

**Symptom.** No back button at all on a screen reached by direct URL or after a refresh - even a non-root `Stack.Screen`.

**Fix.** `components/BackHeaderButton.tsx`'s `makeBackHeaderLeft(router, fallback)` gives every club-scoped screen an explicit `headerLeft` with a per-screen fallback route, rather than relying on the native button.

**Rule.** Click-through testing alone will never surface 6a or 6b. Test direct URL navigation to every screen.

### 6c. Cross-tab `router.push` leaves no real back-history

**Symptom.** Both the in-app back button and the browser's own back landed on the wrong tab's root.

**Fix.** Don't rely on generic back-navigation for cross-tab entry points. Pass the origin explicitly (`?from=profile`, `?from=clubsTab`) and have the destination check for it and `router.replace()` to the known origin, falling back to `canGoBack()` otherwise.

### 6d. `router.replace()` to another tab doesn't reset the origin tab's own Stack

**Symptom.** An infinite loop, found months later by a user clicking around: Profile → "Your clubs" → club hub → back (correctly lands on Profile) → tap the **Clubs tab** → instead of the clubs list, the same stale hub screen reappears, still tagged `?from=profile` in its persisted route params, so its back button fires the same override and returns to Profile. Forever.

**Root cause.** `router.replace("/profile")` changes which tab is active but does not pop or reset the **other** tab's history - the Clubs tab's Stack still had the tagged hub screen on top.

**Fix.** Before switching tabs, first `router.replace("/clubs")` to reset the Clubs Stack to its root, *then* `router.replace("/profile")`. Both run synchronously in one handler, so there's no visible flash.

**Rule.** Any cross-tab `replace()` from deeper than one level into a tab's Stack needs this "reset the origin Stack first" step, not just the destination-side `?from=` pattern. Verify all three paths afterward, including "switch away, then switch back."

### 6e. `replace` vs `dismissTo` - and `POP_TO` doesn't cross tabs

**Symptom (first).** Click into a club (stack `[index, hub]`), tap the Clubs tab again - the resulting "My Clubs" list showed an unwanted back button even though it's visually the tab's root.

**Root cause.** `router.replace("/clubs")` swaps the *top* entry rather than popping to the existing root, so the stack becomes `[index, index]` - still depth 2, so `canGoBack()` is still true.

**First fix.** Switch every "return to the Clubs root" call site to `router.dismissTo("/clubs")`, which dispatches a real `POP_TO` that pops back to an **existing** matching route.

**Symptom (the regression that caused).** Tapping the Clubs tab from Notifications, with no active club, silently did nothing at all.

**Root cause.** `POP_TO` only bubbles through nested Stacks that are **ancestors of the current screen**. A sibling tab's Stack isn't reachable that way. Confirmed by reading `StackRouter`'s `POP_TO` handler (`expo-router/build/react-navigation/routers/StackRouter.js`): it returns `null` when the current stack's `routeNames` doesn't include the target, with no cross-tab fallback.

**Final fix.** `dismissTo` only for call sites already nested inside the Clubs Stack (the hub's back button, the tabPress "already on the hub" branch, post-delete navigation from deep inside `club-profile`). The `!currentClub` branch stays a plain `router.replace("/clubs")`, because it genuinely needs to jump across tabs.

**Rule.** `dismissTo` means "pop back to a route I'm already nested under," not "navigate here from anywhere." Use `replace`/`navigate` whenever the call site can fire from a sibling tab.

---

## 7. `Alert.alert` is a total no-op on web

**Symptom.** Clicking Delete reported success with zero console errors - and the row was still in the database.

**Root cause.** `react-native-web`'s implementation is literally `static alert() {}` (see `node_modules/react-native-web/src/exports/Alert/index.js`). The confirm callback never runs, so the destructive action never fires, and nothing errors.

**Fix.** Every confirm-before-destructive-action flow needs a `Platform.OS === "web"` branch using `window.confirm`.

**Rule.** Caught only by clicking Delete in a smoke test **and then checking the database**. A UI that reports success is not evidence the write happened.

---

## 8. The auth-guard `/` redirect gap ("infinite spinner")

**Symptom.** Landing on `/` while already signed in hung on a spinner forever - no console errors, no relevant network requests. Misdiagnosed twice as a stuck Supabase `getSession()` call.

**Root cause.** The guard in `app/_layout.tsx` had only two branches:

```ts
const inAuthGroup = segments[0] === "(auth)";
if (!session && !inAuthGroup) router.replace("/(auth)/sign-in");
else if (session && inAuthGroup) router.replace("/(tabs)/clubs");
```

A session on plain `/` fell into neither branch, so nothing ever redirected. Temporary logging proved `getSession()` was resolving fine in ~2ms.

**Fix.**

```ts
const inTabsGroup = segments[0] === "(tabs)";
if (!session && !inAuthGroup) router.replace("/(auth)/sign-in");
else if (session && !inTabsGroup) router.replace("/(tabs)/clubs");
```

**Rule.** When a hang has zero console errors and zero relevant network requests, suspect the **navigation/state-machine logic** before the network client.

Two defense-in-depth measures from this investigation are still live even though neither was the cause: `AuthProvider`'s `getSession()` has a 5-second timeout falling back to "no session", and `sign-up.tsx` does an explicit `router.replace("/(tabs)/clubs")` rather than depending purely on the auth-state listener.

---

## 9. Expo Router structural requirements

| Symptom | Root cause | Fix |
| --- | --- | --- |
| "Unmatched Route" flashes at `/` before the guard redirects | Expo Router needs a real file at the route | `app/index.tsx` exists solely to render a spinner |
| `clubs/[clubId]` appeared as a **third, stray tab** in the bottom bar | Without its own layout, Expo Router hoists the nested route | `app/(tabs)/clubs/_layout.tsx` - a `Stack` wrapping `index` + `[clubId]` |
| A route/layout edit doesn't take effect | `CI=1 npx expo start --web` disables Fast Refresh | Restart the dev server (`pkill -f "expo start"`) after any route/layout change |

---

## 10. Native platform gotchas

### 10a. `fetch(uri).blob()` doesn't work for local files on native

**Symptom.** Every photo/document/avatar upload crashed with `Creating blobs from 'ArrayBuffer' and ArrayBufferView are not supported`, thrown inside Supabase Storage's `.upload()`. Never on web; jest-expo doesn't reproduce it either.

**Root cause.** All 7 upload call sites fetched the picked file's own `file://` URI and called `.blob()` - correct for the web pickers' `blob:` URLs, impossible for React Native's `Blob` polyfill on a local file.

**First fix - worked on iOS, failed on Android.** `lib/uploadBody.ts` branched by platform and read raw bytes via `expo-file-system`'s brand-new SDK 57 `File.arrayBuffer()`. Confirmed in the iOS Simulator; the identical crash reproduced on a real Android device. Tracing `@supabase/storage-js` (passes `ArrayBuffer` through untouched) and RN's `convertRequestBody` (also handles `ArrayBuffer` via base64) showed neither could explain a platform difference - pointing at `File.arrayBuffer()` itself.

**Actual fix.** Supabase's own documented React Native pattern: `expo-file-system/legacy`'s `readAsStringAsync(uri, { encoding: Base64 })` then `base64-arraybuffer`'s `decode()`. Confirmed working on both iOS Simulator and a real Android device.

**Rule.** A brand-new cross-platform API working on one OS is not evidence it works on the other. Cross-platform frameworks ship uneven per-platform implementations of the same method in the same release - prefer the older, documented path on a hot path.

### 10b. `crypto.randomUUID()` doesn't exist in Hermes

**Symptom.** `Property 'crypto' doesn't exist` - but only *after* 10a was fixed, because the crash previously happened first and the line was never reached.

**Root cause.** Web Crypto API, implemented by browsers, not by Hermes.

**Fix.** `lib/uuid.ts`, a plain `Math.random()`-based v4. Deliberately not `expo-crypto` - the id is only used for storage-path uniqueness, and another native module carries its own linking risk (see 10c).

**Rule.** A native crash can mask the next one. After fixing one platform bug, re-run the whole flow rather than assuming it's now clean.

### 10c. Expo's precompiled-binary cache produced a broken iOS build

**Symptom.** Right after adding `expo-file-system`, the Simulator app crashed instantly on launch with a DYLD `Symbol not found`: `ExpoFileSystem.framework` referenced `AnyModule._decorate(object:in:)`, which the linked `ExpoModulesCore.framework` didn't have - despite both reporting `57.0.1` in `Podfile.lock`.

**Root cause.** SDK 57's generated `ios/Podfile` sets `RCT_USE_PREBUILT_RNCORE=1`, downloading precompiled binaries instead of building from source. The cached prebuilt `ExpoModulesCore` was stale for this exact module combination. **Clearing Xcode's DerivedData did not help** - the stale artifact lives in a separate mechanism (`ios/Pods/ExpoModulesCore/artifacts/*.tar.gz`).

**Fix.** `rm -rf ios/Pods ios/Podfile.lock`, then `RCT_USE_PREBUILT_RNCORE=0 pod install`, then a full `expo run:ios`. iOS-specific; Android's Gradle build doesn't use this mechanism.

### 10d. Simulator and device environment traps

| Trap | Detail |
| --- | --- |
| Fresh Xcode ships with **zero Simulator runtimes** | `run:ios` fails with `No iOS devices available in Simulator.app` until `xcodebuild -downloadPlatform iOS` (~8.5GB, plus an unpack step not shown in the progress %) |
| A two-finger trackpad scroll **does not scroll a list** in the Simulator | Only a real click-and-drag produces a touch event. Looks identical to a broken `FlatList` - check this before assuming an app bug |
| Local Supabase must be started separately | `run:ios` doesn't do it. A "fetch failed" sign-in error with no other symptom usually means Docker or `supabase start` isn't running - check `docker ps` first |
| On a **real device**, `127.0.0.1` means the phone | Swap `EXPO_PUBLIC_SUPABASE_URL` to the Mac's LAN IP (`ipconfig getifaddr en0`), same WiFi required |
| `ios/` and `android/` are gitignored and generated | Never hand-edit them; re-run `npx expo prebuild` after any `app.json` change |

### 10e. Web file pickers and synthetic clicks

Expo's web shims open their hidden file input with `dispatchEvent(new MouseEvent("click"))`, which some browser configurations don't accept as user activation - the dialog silently never opens while the handler still runs. `lib/pickImageOnWeb.ts` / `lib/pickDocumentOnWeb.ts` bypass the shim with a real `.click()`. Full write-up in [Media & storage](07-media-and-storage.md).

---

## 11. `types/database.ts` is hand-written and fails silently

**Symptom.** Query results typed as `never` with no compile error pointing at the cause.

**Root cause.** supabase-js's `Database` generic requires each table to declare `Row`, `Insert`, `Update` **and `Relationships: []`**, and the schema object needs `Tables`, **`Views: {}`** and **`Functions: {}`** all present. Omitting any of them resolves to `never` rather than erroring.

**Fix / rule.** Keep the shape exact, and update the file in the same change as any migration touching a table or enum. Regenerate properly (`npx supabase gen types typescript`) once a stable hosted project exists.

---

## 12. The enum-value transaction restriction

**Symptom.** `supabase db reset` failed with `unsafe use of new value "owner" of enum type club_role (SQLSTATE 55P04)`.

**Root cause.** `alter type ... add value` can't be used later in the **same transaction** when the enum already existed beforehand. `supabase db reset` runs each migration file as one transaction - a plain `psql -f` is autocommit-per-statement and masks this entirely, which is how the restriction got verified against the wrong scenario the first time.

**Fix.** Split the `add value` into its own migration file (0042). Nine files now follow this rule.

**Rule.** New enum value → its own file, unless nothing in that file *uses* it. And always verify a new migration with a full `db reset`, not a direct `psql -f`. See [Migrations](11-migrations.md).

---

## Checklist before shipping a new table or policy

**Schema**

- [ ] RLS enabled (`alter table ... enable row level security`) - the blanket `authenticated` grant means an RLS-less table is fully public.
- [ ] A **SELECT policy exists**. No SELECT policy = every `.insert().select()` fails.
- [ ] The SELECT check is bound to the row's **own columns**, not a function that re-queries this table by id.
- [ ] If membership only appears via a trigger, the SELECT policy also covers `created_by = auth.uid()`.
- [ ] The INSERT `with check` **implies** the SELECT `using`.
- [ ] UPDATE and **DELETE** policies exist, or a comment says why not. Four migrations exist solely to add a forgotten DELETE policy.
- [ ] Self-service actions are an **extra permissive policy** (`user_id = auth.uid()`), not a widened admin policy.
- [ ] Role filters use `role in ('admin','owner')`, never `role = 'admin'`.
- [ ] FK cascade behavior is deliberate; anything referencing `profiles.id` is checked against the account-deletion model.
- [ ] Any new enum value is alone in its own migration file.
- [ ] Any enum literal inside `SELECT DISTINCT` / `UNION` is explicitly cast.
- [ ] `types/database.ts` updated in the same change, with `Relationships: []` present.

**Verification**

- [ ] `supabase db reset` succeeds from scratch (not just a `psql -f` apply).
- [ ] The policy was exercised through a real `.insert().select()`, not only a plain insert.
- [ ] Tested via RLS impersonation: `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid>"}', true);`
- [ ] `npx tsc --noEmit` clean, `npm test` passing.
- [ ] Destructive actions were clicked **and the database was checked** (`Alert.alert` is a no-op on web).
- [ ] Every new screen was reached by **direct URL**, not only by clicking through.
- [ ] Cross-tab entry points tested including "switch away, then switch back."
- [ ] If it uploads a file: goes through `readUploadBody` and `randomUUID`, and was tried on a real Android device, not only iOS.
