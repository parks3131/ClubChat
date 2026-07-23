# Mobile Launch Plan — from local dev to a real phone

Goal: get ClubChat running on an actual Android/iOS device, backed by a
real hosted backend instead of your laptop's local Docker Supabase, so
you (and eventually a few real testers) can use it day-to-day off your
dev machine. This file is a checklist-style walkthrough — work top to
bottom, checking things off as you go. Not auto-loaded into
CLAUDE.md/SPEC.md context — read/update it directly.

There are two tracks here, and you don't have to pick just one:

- **Track A — Expo Go (today, free, zero setup)**: install the "Expo
  Go" app from the App Store/Play Store, run the dev server, scan a QR
  code. Nothing to build, nothing to sign, no Apple/Google accounts
  needed. Every dependency this app currently uses ships inside Expo
  Go's SDK 57 runtime, so this should just work. Best for "let me see
  it on my phone right now" and fast iteration.
- **Track B — a real installed build (EAS Build)**: produces an actual
  `.apk`/`.ipa` you install like any other app, works without the dev
  server running, and is the only path to eventually distributing it to
  other people (TestFlight, Play internal testing, or the real stores).
  Needs a bit more setup, and — for iOS specifically — an Apple
  Developer Program membership ($99/yr) before you can install on a
  real iPhone (Android sideloading is free, no account needed for that
  part).

Do Phase 1 (hosted backend) regardless of which track you pick — Expo
Go and a real build both need something other than
`http://127.0.0.1:54321` to talk to, since a phone can't reach your
laptop's `localhost`.

---

## Phase 0 — accounts you'll need

- [ ] **Supabase account** (free tier is plenty for MVP testing) — supabase.com
- [ ] **Expo account** (free) — expo.dev — needed for EAS Build (Track B) and recommended even for Track A
- [ ] **Apple Developer Program** ($99/yr) — only needed once you want
      Track B on a real iPhone (or TestFlight later). Not needed for
      Track A (Expo Go) or for Track B on Android.
- [ ] **Google Play Console** ($25 one-time) — only needed once you
      want to publish to the Play Store or use Play's internal testing
      tracks. Not needed just to sideload an APK on your own Android
      phone.

You can start everything below with just the Supabase + Expo accounts
and add the store accounts later, when you're ready to actually
distribute to other people.

---

## Phase 1 — stand up a real (hosted) Supabase project

Local Docker Supabase is dev-only: it stops when your laptop sleeps,
isn't reachable once you leave your Wi-Fi network, and isn't something
you'd hand to a real tester. This phase replaces it with a real hosted
project, using the exact same migration files you already have — no
schema redesign needed.

1. **Create the project**: supabase.com → New Project. Pick a region
   close to where you (and testers) actually are. Save the DB password
   it generates somewhere safe.
2. **Get your API credentials**: Project Settings → API. Copy the
   **Project URL** and the **`anon` / publishable key** (the new-format
   ones look like `sb_publishable_...` — see SPEC.md section 6's note on
   this; never copy the **secret**/`service_role` key into the app).
3. **Link the CLI and push every migration in one shot** (this replays
   all 79 files in `supabase/migrations/` in order, in a single
   transaction-safe pass — much less error-prone than pasting them into
   the SQL Editor one at a time):
   ```bash
   supabase link --project-ref <your-project-ref>   # ref is in the project's dashboard URL
   supabase db push
   ```
4. **Storage buckets need no separate manual step** — every bucket
   (`avatars`, `club-avatars`, `message-photos`, `message-documents`,
   `club-post-photos`, race/Eboard avatars, etc.) is created by an
   `insert into storage.buckets (...)` statement inside its own
   migration file, so `db push` already created all of them along with
   their RLS policies. Spot-check in the dashboard under Storage that
   they're there.
5. **pg_cron gotcha**: migration `0048` does `create extension pg_cron`
   for the poll-closing-soon scheduled job. On local Docker this was
   "already preloaded"; on a hosted project, enabling extensions
   sometimes needs the toggle in **Database → Extensions** in the
   dashboard rather than a raw `CREATE EXTENSION` from a migration, if
   the push errors on that step. If `db push` fails specifically on
   `0048_poll_closing_soon_notify.sql`, enable `pg_cron` via that
   dashboard toggle first, then re-run `supabase db push`.
6. **Update `.env`** (this file is gitignored — never commit real
   hosted keys):
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
   ```
7. **Seed at least one real account** by just signing up through the
   app's own `/sign-up` screen once pointed at the new project — hosted
   Supabase projects require email confirmation by default (unlike
   local, which auto-confirms). Either confirm via the real email that
   gets sent, or turn off "Confirm email" in **Authentication →
   Providers → Email** while you're still in solo-testing mode.
8. **Sanity check on web first**, before touching a phone at all:
   ```bash
   pkill -f "expo start"
   CI=1 npx expo start --web
   ```
   Sign up, create a club, send a chat message, upload a photo. If this
   works against the hosted project in a browser, the phone will work
   too — any problem at this point is a backend/RLS problem, not a
   mobile problem, and is much faster to debug on web.

---

## Phase 2 — Track A: Expo Go (do this first, it's free and immediate)

1. Install **Expo Go** on your phone from the App Store / Play Store.
2. Make sure your phone and laptop are on the **same Wi-Fi network**.
3. From the repo:
   ```bash
   npx expo start
   ```
   (no `CI=1` here — you want the interactive terminal UI with the QR code, not the headless web mode)
4. Scan the QR code — iOS: Camera app; Android: Expo Go's own scanner.
5. The app loads inside Expo Go, talking to your hosted Supabase
   project from Phase 1. Test the golden paths: sign up/in, create or
   join a club, send messages, upload a photo, create a poll/event.

If your phone can't reach the dev server (corporate/guest Wi-Fi that
isolates devices from each other is the usual culprit), run
`npx expo start --tunnel` instead — slower, but routes through Expo's
relay instead of relying on local network discovery.

This is your fast loop for the rest of MVP testing — no rebuild needed
for JS/UI changes, just reload in Expo Go.

---

## Phase 3 — Track B: a real installable build via EAS

This produces an app you install once and open like any other app —
no dev server needed to run it afterward (it still needs your hosted
Supabase project from Phase 1 to talk to, since that's baked into the
build via `EXPO_PUBLIC_*` env vars at build time).

The repo already has bundle identifiers set
(`com.parkstechusa.clubchat` for both platforms) and an `eas.json` with
`development`/`preview`/`production` profiles scaffolded — this phase
is mostly the account-linking step that was left pending.

1. **Install the EAS CLI and log in**:
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. **Link this project to your Expo account** (one-time):
   ```bash
   eas init
   ```
   This writes a project ID into `app.json` — commit that change.
3. **Make sure your env vars reach the build.** EAS Build doesn't
   automatically read your local `.env` file — set the same two
   `EXPO_PUBLIC_SUPABASE_*` values as **EAS secrets** (or "Environment
   Variables" in the modern EAS dashboard UI) so the production/preview
   build bakes in the hosted project's URL/key, not `127.0.0.1`:
   ```bash
   eas env:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://<ref>.supabase.co" --visibility plaintext
   eas env:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "sb_publishable_..." --visibility plaintext
   ```
4. **Android — build and sideload (free, no Play account needed for this)**:
   ```bash
   eas build --profile preview --platform android
   ```
   EAS builds an `.apk` in the cloud and gives you a download link/QR
   at the end. Open that link on the phone (or scan the QR), download,
   and install — you'll need to allow "install unknown apps" for your
   browser/Files app once, a normal Android prompt for sideloaded apps.
5. **iOS — requires the Apple Developer Program membership from Phase 0**:
   ```bash
   eas build --profile preview --platform ios
   ```
   `eas build` will interactively walk you through registering your
   iPhone's UDID and creating the right provisioning profile the first
   time — follow its prompts (it can even generate a registration link
   you open on the phone itself to capture the UDID automatically).
   Once built, install the same way as Android: open the link EAS gives
   you on the phone.
6. From here on, any time you want a fresh build on your phone with
   the latest code, just re-run the same `eas build` command — there's
   no separate "publish" step needed for your own personal testing.

---

## Phase 4 — testing checklist (once on a real device, either track)

Go through the actual golden paths, not just "does it open":

- [ ] Sign up (real email, or confirmation-off if you disabled it in Phase 1.7) and sign in
- [ ] Create a club, then join a second test account into it (use a second phone, or sign out/in as a different account)
- [ ] Send a chat message, react to it, pin it, announce it
- [ ] Take a photo with the **camera** (not just the library) in chat — this is the exact permission path fixed alongside this plan (`app.json`'s `cameraPermission` string was missing before; without it, native camera capture would crash with no usage-description prompt)
- [ ] Attach a document
- [ ] Create a calendar event, a poll, a routine workout
- [ ] Create a race, request/approve joining it, post in its chat
- [ ] Create/join the Eboard channel, create a meeting
- [ ] Check the Notifications tab updates and the tab-bar badge clears correctly
- [ ] Background the app and reopen it — session should persist (no re-login)
- [ ] Airplane-mode-off-and-back-on — confirm realtime chat/notifications reconnect

---

## What's deliberately out of scope for "just testing on my phone"

- **Push notifications** (`expo-notifications`) — not wired up yet.
  Today, new-message/notification awareness only works while the app is
  open (via Supabase Realtime); nothing arrives while it's backgrounded
  or closed. Fine for solo/small-group testing, worth revisiting before
  a real launch.
- **OTA updates** (`expo-updates`) — not configured. Every code change
  currently means a fresh `eas build` + reinstall for Track B (Track A/
  Expo Go always runs your latest local code with no rebuild).
- **App Store / Play Store submission** — `eas submit` and the actual
  store listings (screenshots, privacy nutrition label / Data Safety
  form) are a separate, later phase once the build itself is confirmed
  working on real devices via the steps above.
- **Regenerating `types/database.ts`** — still hand-written (see
  SPEC.md section 6). Worth doing once the hosted project is stable:
  `npx supabase gen types typescript --project-id <ref> > types/database.ts`.

---

## Quick reference: local Docker vs. hosted, side by side

| | Local Docker (current default) | Hosted Supabase (this plan) |
|---|---|---|
| `.env` URL | `http://127.0.0.1:54321` | `https://<ref>.supabase.co` |
| Reachable from | This laptop only (or same-Wi-Fi via LAN IP) | Anywhere with internet |
| Survives laptop sleep/reboot | No | Yes |
| Email confirmation on signup | Auto-confirmed | Required by default (can be disabled) |
| Good for | Fast local dev loop, SPEC.md's existing workflow | Real device testing, testers, eventual launch |

Nothing about switching to hosted requires touching `supabase/migrations/`
or any application code beyond `.env` (and, for EAS builds, the
project's env vars) — the whole point of migrations-as-source-of-truth
is that the schema replays identically anywhere.
