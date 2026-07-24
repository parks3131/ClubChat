# Testing and CI

What is actually covered by automated tests today, how the jest-expo setup works, what CI runs, and the manual smoke-test protocols that catch everything the tests don't.

## Overview

Automated coverage is **narrow and deliberate**: three unit-test files, 35 assertions, all covering pure or fully-mockable logic in `lib/`. Nothing renders a component; nothing touches a real Supabase instance. Everything else — every screen, every navigation path, every RLS interaction — is verified by **manual smoke tests**, either headlessly through Playwright MCP against `expo start --web`, or live through the Claude-in-Chrome extension.

Quality expectations for the product side are in [Non-functional requirements](../PRD/12-nonfunctional-requirements.md). That split is not accidental. Most of the real bugs this project has hit (see [Engineering pitfalls](12-engineering-pitfalls.md)) were navigation-state, RLS, or FlatList-virtualization bugs that a unit test would not have caught and a render test would have needed a full backend to reproduce.

## Key files

| Path | Responsibility |
| --- | --- |
| `jest.config.js` | 3 lines — `preset: "jest-expo"` + one setup file |
| `jest.setup.js` | Env-var stubs and the AsyncStorage mock |
| `.github/workflows/ci.yml` | Type check + test on every push and PR |
| `tsconfig.json` | `extends expo/tsconfig.base`, `strict: true`, `types: ["jest"]` |
| `lib/dates.test.ts` | 27 tests over the pure date helpers |
| `lib/calendarFeed.test.ts` | 6 tests over the feed merge, all sources mocked |
| `lib/profile.test.ts` | 2 tests over `formatDateOfBirth` |

## What is tested today

| File | Suites | Tests | Covers |
| --- | --- | --- | --- |
| `lib/dates.test.ts` | `toDateKey`, `getMonday`, `addDays`, `addMonths`, `splitIso`/`combineToIso`, `isPastInstant`, `isPastDateOnly`, `isSameInstant`, `formatCountdown` | 27 | Every export of `lib/dates.ts` except `timeAgo` |
| `lib/calendarFeed.test.ts` | `fetchCalendarFeed`, `fetchGlobalCalendarFeed` | 6 | Merge/sort/bucket logic across events, races, meetings, polls |
| `lib/profile.test.ts` | `formatDateOfBirth` | 2 | The UTC-midnight day-shift regression |

`lib/dates.ts` exists as a module *because* of this: date arithmetic was extracted out of screens specifically so it could be unit-tested without a renderer.

`lib/calendarFeed.test.ts` is the only test that mocks modules, and it does so carefully:

```ts
jest.mock("./polls", () => ({
  ...jest.requireActual("./polls"),
  fetchPolls: jest.fn(),
}));
```

`isPollEffectivelyClosed` keeps its real implementation, because `calendarFeed.ts` calls it directly to compute `isOpen` — a plain `jest.mock("./polls")` would replace it with a mock returning `undefined` for every poll and quietly invert the Upcoming/Past bucketing the test is meant to verify.

`lib/profile.test.ts` is a pure regression test: `new Date("1998-01-01")` parses as UTC midnight and renders as Dec 31 1997 in any timezone behind UTC, so the test asserts the formatted output contains `1998` and not `1997`.

## Jest setup

`jest.config.js`:

```js
module.exports = { preset: "jest-expo", setupFiles: ["<rootDir>/jest.setup.js"] };
```

`jest.setup.js` does exactly two things, both necessary rather than stylistic:

1. **Seeds `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.** `lib/supabase.ts` throws at *import* time when either is missing — so a test that only wants a sibling export (e.g. `formatDateOfBirth` from `lib/profile.ts`) still trips it, because importing the module imports the client. The stubs mean tests never need real credentials or a running Supabase.
2. **Mocks `@react-native-async-storage/async-storage`** with the package's own recommended mock. jest-expo mocks core Expo native modules but not this community package, and its native module isn't available under plain Jest.

Commands:

```bash
npm test                    # full suite
npx jest lib/dates.test.ts  # one file
npx tsc --noEmit            # strict type check — run before considering any change done
```

## CI

`.github/workflows/ci.yml`, on every `push` and `pull_request`:

| Step | Command |
| --- | --- |
| Checkout | `actions/checkout@v4` |
| Node | `actions/setup-node@v4`, Node 22, npm cache |
| Install | `npm ci` |
| Type check | `npx tsc --noEmit` |
| Test | `npm test` |

One job, one runner (`ubuntu-latest`). **There is no linter and no formatter configured in this repo** — `tsc --noEmit` under `strict: true` is the entire static-analysis budget. There is no build step, no Expo/EAS job, no migration verification, and no coverage gate.

## Manual smoke-test protocols

### Headless — Playwright MCP against web

```bash
CI=1 npx expo start --web
```

Then drive it with the Playwright MCP tools. Two rules that have each cost real debugging time:

- **CI mode disables Fast Refresh.** After *any* route or layout file change, kill and relaunch the dev server (`pkill -f "expo start"`, then relaunch). Editing and re-navigating without a restart silently serves the old bundle.
- **Test direct URL navigation, not just click-through.** A native `headerLeft` only renders when `canGoBack()` is true, and `router.back()` throws when there is no history — both classes of bug are invisible if you only ever click your way in.

Things this flow has actually caught: the `Alert.alert` web no-op (the Delete button reported success with zero console errors while the row survived), the Profile ↔ club-hub infinite loop, an infinite-render bug in Car Groups, and the FlatList `scrollToIndex`/`onContentSizeChange` sequence bugs (found by adding temporary `console.log`s to the handlers and reading the real order, not by re-reading plausible-looking code).

### Live — Claude-in-Chrome extension

Watch it happen in a real browser instead of inferring from snapshots. Two gotchas:

- **Machine mismatch.** `list_connected_browsers` can list browsers on *other* physical machines; `localhost:8081` there resolves to that machine's loopback and silently fails to load. Only an entry with `"isLocal": true` can reach this Mac's dev server — check that field, don't just use whichever browser is selected. To pair one: `switch_browser` broadcasts a connect prompt, then click the extension icon in the target Chrome and hit **Connect** with an identifiable name, then `select_browser` with the returned `deviceId`.
- **No known passwords for seeded test personas.** The local DB carries purpose-built accounts ("Requester Bob", "Voter Alice", "Header Tester", "Preview Tester") whose passwords are recorded nowhere. Don't guess. Sign up a fresh account through the app's own `/sign-up` (local Supabase auto-confirms, so there's no email step), then grant it whatever club/race/Eboard membership the test needs directly via SQL:

  ```bash
  docker exec supabase_db_Club_Chat psql -U postgres -d postgres -c "..."
  ```

### Native

`npx expo run:ios` / `run:android` against the same local Supabase. The Simulator shares the Mac's network namespace, so `127.0.0.1:54321` works unchanged — but **local Supabase must be started separately** (`supabase start`, with Docker Desktop up). A "fetch failed" sign-in error with no other symptom almost always means one of those two isn't running; check `docker ps` before suspecting the app. On a real device, `127.0.0.1` means the *phone*, so `EXPO_PUBLIC_SUPABASE_URL` must be swapped to the Mac's LAN IP.

## Coverage gaps

| Area | Covered? | Risk | Recommended next test |
| --- | --- | --- | --- |
| `lib/dates.ts` | ✅ (except `timeAgo`) | low | Add `timeAgo` cases |
| `lib/calendarFeed.ts` | ✅ | low | — |
| `lib/profile.ts` | partial — `formatDateOfBirth` only | low | — |
| `lib/mentions.ts` | ❌ | **high** — pure, regex-based, and has a real prefix-shadowing rule ("Parks" vs "Parks RPK") | Unit-test all four exports; the cheapest high-value test available |
| `lib/polls.ts` `isPollEffectivelyClosed` | ❌ directly | medium — the closed/open source of truth for chat, list, detail, and calendar | Unit test the three cases (`isClosed`, past `closesAt`, null `closesAt`) |
| `ChatScreen` message merging | ❌ | medium — `mergeMessages` is pure but module-private | Export it and test dedupe/ordering/tombstone-overwrite |
| `types/database.ts` ↔ migrations agreement | ❌ | medium — silent `never` degradation | A CI step running `supabase gen types` and diffing |
| All `lib/*` Supabase calls | ❌ | medium | Integration tests against a local Supabase in CI |
| Every component | ❌ | high | `@testing-library/react-native` smoke renders, starting with `PollCard` and `MembersScreen` (both are pure-props) |
| Navigation guards / redirects | ❌ | high — historically the buggiest area | End-to-end via Playwright in CI against `expo start --web` |
| RLS policies | ❌ | **highest** — every real security boundary | `pgTAP` (or plain SQL assertions) run against `supabase db reset` in CI |
| Migrations replay cleanly | ❌ | medium — an enum-in-transaction mistake has broken `db reset` before | CI job: `supabase db reset` on a throwaway container |

## Invariants

1. **`npx tsc --noEmit` and `npm test` must both pass before any change is considered done.** CI runs exactly these two.
2. **Tests must never require a running Supabase or real credentials.** `jest.setup.js`'s stubs are what make that true; keep new tests inside that constraint or add a clearly separated integration suite.
3. **Restart the dev server after any route/layout change** when smoke-testing in CI mode.
4. **Smoke tests must include direct URL entry**, not only click-through paths.
5. **Never guess a seeded test account's password.** Sign up a new one and grant access via SQL.
6. **Only use a browser whose `list_connected_browsers` entry has `isLocal: true`.**
7. **Partial-mock a module when the code under test also uses its pure helpers** (`jest.requireActual`), rather than blanket-mocking it.
8. **`supabase db reset` wipes the local DB**, which accumulates real usage data between sessions — never run it against a database you haven't confirmed is disposable.

## Extension points

- **New pure helper** → extract to `lib/` and add a `*.test.ts` next to it. This is the established pattern (`lib/dates.ts` exists for exactly this reason).
- **New aggregation over existing `fetch*` calls** → test it like `calendarFeed.test.ts`: mock the sources, partial-mock anything whose pure helpers you also rely on.
- **Component tests** → add `@testing-library/react-native`; `jest-expo` already provides the transform. Start with the prop-only components (`PollCard`, `MembersScreen`, `LoadError`, `LegalDocument`).
- **New CI check** → append a step to the single `test` job in `.github/workflows/ci.yml`; there is no matrix or job graph to fit into.

## Known gaps

- **No linter, no formatter.** Style is enforced only by convention and review.
- **Zero component or integration tests.** 35 assertions cover three files out of ~115 source files.
- **CI never exercises Supabase.** Migrations, RLS, RPCs, and triggers are validated only by hand locally.
- **No coverage reporting or threshold.**
- **No EAS/build job.** `eas.json` exists but nothing in CI builds the app; task #33 is still blocked on an interactive `eas login`/`eas init`.
- **Smoke-test protocols are documented, not automated.** Nothing replays them; each regression risk is re-checked manually or not at all.
