# Environments and Release

How ClubChat is configured, run locally, built natively, released, and verified in CI.

## Environments

| Environment | Supabase target | How the app points at it | Notes |
|---|---|---|---|
| Local dev (default) | Local Docker Supabase, `http://127.0.0.1:54321` | `.env` (gitignored) - `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | The everyday loop. Auto-confirms email signups, so no email gate when testing. Stops when the laptop sleeps; unreachable off this machine's network. |
| iOS Simulator / local native | Same local Docker Supabase | Same `.env` - the Simulator shares the Mac's network namespace, so `127.0.0.1` resolves correctly | `supabase start` must be running separately; `expo run:ios` does not start it. |
| Real device (LAN) | Same local Docker Supabase | `.env` with `EXPO_PUBLIC_SUPABASE_URL` swapped to the Mac's LAN IP | `127.0.0.1` on a phone means *the phone*. Same WiFi required. |
| Hosted (device testing / testers) | Hosted Supabase project `clubchat` (`us-east-1`), all migrations pushed and confirmed in sync | Not in this Mac's `.env`. The URL/key are set as EAS **preview**-environment variables, baked into EAS builds at build time | Requires email confirmation on signup by default (can be disabled in Authentication → Providers → Email while solo-testing). |
| Staging | - | - | Does not exist. See Known gaps. |

**History**: the project ran on hosted Supabase first, then deliberately pivoted to local Docker after an RLS debugging session coincided with an active Supabase cloud incident and the cloud org was deleted. Nothing in the schema or app code depends on which one is used - only `.env` does. A hosted project has since been re-provisioned for device testing, but `.env` still points at local Docker on purpose, to keep the dev loop fast.

**Standing up a hosted project from scratch** (the reusable procedure):

1. Create the project in the Supabase dashboard; save the generated DB password.
2. Copy the Project URL and the **publishable** key from Project Settings → API.
3. Link the CLI:

```bash
supabase link --project-ref <your-project-ref>
```

4. Replay every migration in `supabase/migrations/` in order, in one pass:

```bash
supabase db push
```

5. Swap the two `EXPO_PUBLIC_SUPABASE_*` values in `.env` (or set them as EAS environment variables for a build).

Storage buckets need no separate step - each one is created by an `insert into storage.buckets (...)` inside its own migration, so `db push` creates them and their RLS policies too.

`pg_cron` gotcha: migration `0048` runs `create extension pg_cron` for the poll-closing-soon job. It was preloaded on local Docker; on a hosted project, if `db push` fails specifically on `0048_poll_closing_soon_notify.sql`, enable `pg_cron` via Database → Extensions in the dashboard first, then re-run the push.

`SPEC.md` section 7 says to paste migrations into the SQL Editor one at a time - `supabase db push` supersedes that and is far less error-prone.

## Configuration

| Variable | Purpose | Where consumed |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase API base URL for the active environment | `lib/supabase.ts` (`createClient`); defaulted to `http://localhost:54321` in `jest.setup.js` for tests |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Publishable (anon) API key | `lib/supabase.ts`; defaulted to `test-anon-key` in `jest.setup.js` |

`lib/supabase.ts` throws at import time if either is missing, pointing at `.env.example`. `.env` is gitignored; `.env.example` holds placeholders only.

Any `EXPO_PUBLIC_*` variable is inlined into the JS bundle at build time and is therefore fully public - treat it as shipped-to-users, never as a secret.

**Key rule**: only the **publishable** key (`sb_publishable_…`, the modern replacement for the old JWT `anon` key) may ever appear client-side. The **secret** key (`sb_secret_…`, the RLS-bypassing equivalent of the old `service_role` key) must never be committed, never be put in `.env` for this app, and never be shipped in a build. RLS is the only thing standing between a client and the whole database; the secret key bypasses it entirely.

## Local development

Install dependencies:

```bash
npm install
```

Start the local Supabase stack (Postgres + Auth + Storage + Realtime, via Docker):

```bash
supabase start
```

Re-apply every `supabase/migrations/*.sql` from scratch:

```bash
supabase db reset
```

> **Warning - `supabase db reset` wipes the local database.** The local DB is not just test fixtures: it accumulates real usage data (real clubs, messages, accounts, purpose-built test personas) between sessions. Never run it against a DB you have not confirmed is disposable.

To apply a single new migration to a live local DB **without** a reset:

```bash
docker exec supabase_db_Club_Chat psql -U postgres -d postgres -f supabase/migrations/00NN_description.sql
```

Then register it by hand in `supabase_migrations.schema_migrations` (`version`, `name` columns) so a later `supabase db reset` still replays cleanly.

Dev server (interactive; press `w` for web, or scan the QR code for native):

```bash
npx expo start
```

Web directly:

```bash
npm run web
```

Headless web, for Playwright/Claude-in-Chrome smoke tests:

```bash
CI=1 npx expo start --web
```

CI mode disables Fast Refresh - **restart the dev server after any route/layout file change**, or it silently serves the old bundle.

Type check (strict; run before considering any change done):

```bash
npx tsc --noEmit
```

Full test suite:

```bash
npm test
```

A single test file:

```bash
npx jest lib/dates.test.ts
```

## Native builds

`ios/` and `android/` are **generated, never committed** (both are gitignored) - Expo's Continuous Native Generation. Never hand-edit them; change `app.json` and re-run `prebuild` instead, or the edit is lost on the next generation.

Generate the iOS project (also installs CocoaPods and runs `pod install`):

```bash
npx expo prebuild -p ios
```

Build and launch in the Simulator:

```bash
npx expo run:ios
```

Android equivalent:

```bash
npx expo run:android
```

Check that installed package versions match what the SDK expects:

```bash
npx expo-doctor
```

Realign them if they have drifted:

```bash
npx expo install --fix
```

### Real physical device (local, cabled)

```bash
npx expo run:ios --device
```

Enable Developer Mode on the phone (Settings → Privacy & Security - reboots the device), sign with an Apple ID under Xcode's Signing & Capabilities (a free account works for local testing but **the build expires after 7 days**), then trust the dev cert under Settings → General → VPN & Device Management on first launch.

**Critical**: on a real device, `127.0.0.1` means the phone itself, not the Mac. Swap `EXPO_PUBLIC_SUPABASE_URL` in `.env` to the Mac's LAN IP, and keep both on the same WiFi:

```bash
ipconfig getifaddr en0
```

### Gotchas

| Symptom | Cause / fix |
|---|---|
| `run:ios` fails with `No iOS devices available in Simulator.app` | A fresh Xcode ships **zero** simulator runtimes. Download one: `xcodebuild -downloadPlatform iOS` (~8.5GB, several minutes, plus an unpack step not reflected in the progress %). |
| A list won't scroll in the Simulator | A two-finger trackpad scroll does not produce touch events. Only a real click-and-drag does. Looks identical to a broken `FlatList`/`ScrollView` - check this before assuming an app bug. |
| Bare "fetch failed" on sign-in, no other symptom | Local Supabase isn't running. `run:ios`/`run:android` do not start it. Check `docker ps`, `open -a Docker`, then `supabase start`, before suspecting the app. |
| iOS Simulator app crashes instantly with a DYLD `Symbol not found` in `ExpoFileSystem.framework` after adding a native module | SDK 57's generated `Podfile` sets `RCT_USE_PREBUILT_RNCORE=1`; a stale precompiled `ExpoModulesCore` binary can mismatch. Clearing DerivedData does **not** help. Fix: `rm -rf ios/Pods ios/Podfile.lock`, then `RCT_USE_PREBUILT_RNCORE=0 pod install` from `ios/`, then rebuild. Android's Gradle build is unaffected. |
| Uploads crash on native with `Creating blobs from 'ArrayBuffer' … not supported` | `fetch(uri).blob()` on a `file://` URI does not work on native. Fixed in `lib/uploadBody.ts` - read as base64 via `expo-file-system/legacy`'s `readAsStringAsync`, decode with `base64-arraybuffer`. An earlier fix using SDK 57's new `File.arrayBuffer()` worked on iOS and failed identically on Android. |
| `Property 'crypto' doesn't exist` on native | Hermes has no `crypto.randomUUID()`. Fixed in `lib/uuid.ts`, a plain `Math.random()` v4 generator (storage-path uniqueness only, nothing security-sensitive). |

**Durable lesson from those last two**: web (Playwright / Claude-in-Chrome) and the jest-expo test environment cannot catch a native-only API gap - these only ever surface live on-device. And a brand-new framework API working on one OS is not evidence it works on the other; cross-platform frameworks do ship uneven per-platform implementations of the same method in the same release. Prefer the older, battle-tested API when uploading or touching the filesystem.

## Release

Bundle identifiers (`app.json`) are set for both platforms:

| Field | Value |
|---|---|
| iOS `bundleIdentifier` | `com.parkstechusa.clubchat` |
| Android `package` | `com.parkstechusa.clubchat` |
| `scheme` (deep links, e.g. club join links) | `clubchat` |
| `version` | `1.0.0` |
| Expo `owner` / EAS project | `parks3131`, `extra.eas.projectId` set |

`eas.json` build profiles as they actually exist:

| Profile | Config | Use |
|---|---|---|
| `development` | `developmentClient: true`, `distribution: internal` | Dev-client builds |
| `preview` | `distribution: internal`, Android `buildType: apk` | Sideloadable APK / internal iOS install - the device-testing path |
| `production` | `autoIncrement: true` | Store builds |

`cli.appVersionSource` is `remote`, so EAS owns the build number. A `submit.production` stanza exists but is empty.

**Status**: `SPEC.md` task #33 calls this blocked on the founder's own interactive `eas login` / `eas init` - that is stale. `eas init` has been run (`app.json` carries `owner` and `extra.eas.projectId`), and Android `preview` builds are confirmed working on a real device including photo upload. iOS is blocked on **Apple Developer Program enrollment** (an Apple ID verification error), not on `eas login`.

Build an installable APK (free, no Play account needed to sideload):

```bash
eas build --profile preview --platform android
```

iOS equivalent, once Apple Developer Program enrollment clears:

```bash
eas build --profile preview --platform ios
```

EAS Build does not read the local `.env`. Set the same two variables as EAS environment variables so the build bakes in the hosted project, not `127.0.0.1`:

```bash
eas env:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://<ref>.supabase.co" --visibility plaintext
```

```bash
eas env:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<publishable key>" --visibility plaintext
```

### Pre-submission checklist

- [ ] Apple Developer Program membership active ($99/yr) - required for TestFlight and real-iPhone installs.
- [ ] Google Play Console account ($25 one-time) - required for Play tracks; not for sideloading an APK.
- [ ] Hosted Supabase project is the build's backend (verify via EAS environment variables, not `.env`).
- [ ] `npx expo-doctor` passes; `npx expo install --fix` run if it flags version drift.
- [ ] `npx tsc --noEmit` and `npm test` both green.
- [ ] Golden paths verified on a real device: sign up/in, create/join club, chat message + react + pin + announce, **camera** capture (not just library), document attach, calendar event, poll, routine, race request/approve + race chat, Eboard channel + meeting, Notifications badge clears, session persists across backgrounding, realtime reconnects after airplane mode.
- [ ] Privacy Policy and Terms reviewed by an actual lawyer - `lib/legalContent.ts` is flagged in-file as a first draft.
- [ ] **App Store privacy label / Google Play Data Safety form** filled out. Not a coding task; complete it at submission time against what the app actually collects (email, name, bio, city, date of birth, school, avatars, chat photos/documents).
- [ ] Store listing assets: screenshots, description, icon (`assets/icon.png` and the Android adaptive icon set already exist).

## CI

`.github/workflows/ci.yml` runs on every `push` and `pull_request`, on `ubuntu-latest`, Node 22 with npm cache:

| Step | Command |
|---|---|
| Install | `npm ci` |
| Type check | `npx tsc --noEmit` |
| Test | `npm test` |

That is the whole pipeline. There is **no linter and no formatter** configured in this repo, and CI does not build the app, run migrations, or exercise the browser.

## Known gaps

| Gap | Detail |
|---|---|
| No error monitoring | Nothing like Sentry is wired up. Runtime failures on a user's device are invisible. |
| No OTA updates | `expo-updates` is not configured. Every code change means a fresh `eas build` + reinstall for installed builds. |
| No push notifications | `expo-notifications` is not wired up. Notification awareness only works while the app is open, via Supabase Realtime. The `body`/`target_path` a payload would need are already computed. |
| No staging environment | Local Docker and one hosted project. No intermediate tier between dev and what testers use. |
| Hand-written database types | `types/database.ts` is maintained by hand. Regenerate once the hosted project is stable: `npx supabase gen types typescript --project-id <ref> > types/database.ts`. |
| No accessibility labels | Carried over from the task #25 audit; still open. |
| No lint/format | See CI above. |
