# AGENTS.md — working agreement for ClubChat

How any agent (or human) should work in this repo. Read this first, then
[`SPEC/README.md`](SPEC/README.md) for what the product is and how it's built.

---

## 0. Non-negotiables

1. **Expo has changed.** Read the exact versioned docs at
   <https://docs.expo.dev/versions/v57.0.0/> before writing Expo code. Training-data
   memory of older SDKs is actively wrong here.
2. **Never edit an applied migration.** A correction is always a new numbered file.
   See [`SPEC/templates/migration-checklist.md`](SPEC/templates/migration-checklist.md).
3. **Never run `supabase db reset` against a DB you haven't confirmed disposable.**
   The local DB accumulates real usage data between sessions — it is not fixtures.
4. **Read [`SPEC/TECH/12-engineering-pitfalls.md`](SPEC/TECH/12-engineering-pitfalls.md)
   before touching RLS, `FlatList` scrolling, or navigation.** Every entry in it cost
   a long debugging session at least once.
5. **`npx tsc --noEmit` and `npm test` must pass before any change is "done."**
6. **No secrets in the repo.** Only the `sb_publishable_…` key is client-safe. The
   `sb_secret_…` key bypasses RLS and must never appear in code, docs, or logs.

---

## 1. Repo map

| Path | What it is |
|---|---|
| `SPEC/` | The spec. Product in `PRD/`, engineering in `TECH/`, reusable forms in `templates/`, ADRs in `decisions/`. |
| `docs/HISTORY.md` | Task-by-task build narrative. Not auto-loaded — read on demand. |
| `app/` | Expo Router file-based routes. Screens only; no raw Supabase queries. |
| `components/` | Shared, scope-parametrized screens (`ChatScreen`, `PollsListScreen`, …). |
| `lib/` | Data-access layer. Plain async functions typed against `types/database.ts`. |
| `contexts/` | App-wide providers (auth, notifications, current club). |
| `supabase/migrations/` | Sequential SQL. The schema's source of truth. |
| `constants/theme.ts` | Design tokens. Never hardcode a color or spacing value. |

---

## 2. Commands

```bash
npm install
```

```bash
npx expo start
```

```bash
npx tsc --noEmit
```

```bash
npm test
```

```bash
supabase start
```

Leave a running `expo start --web` dev server alone between tasks unless asked to stop
it. CI mode disables Fast Refresh, so **restart the dev server after any route or
layout file change** — editing then re-navigating silently serves the stale bundle.

---

## 3. Workflow

### 3.1 Before writing code

1. Read the relevant `SPEC/PRD/` file for intended behavior, then the matching
   `SPEC/TECH/` file for how that area is built.
2. Find the closest existing feature and mirror it. This codebase is deliberately
   pattern-heavy — a race is a club nested one level down, an Eboard channel is the
   same shape again. Almost nothing here should be genuinely novel.
3. If the request is ambiguous about **who is allowed to do what**, ask. Permission
   models in this app are not derivable by analogy — Race Meet Info is "any admin",
   Eboard Meetings is "creator only", and both were explicit founder calls.

### 3.2 Writing code

| Layer | Rule |
|---|---|
| Screens (`app/`) | Call `lib/` functions. Never build a Supabase query inline. |
| Shared UI (`components/`) | Parametrize by scope (club / race / eboard) rather than forking a copy. |
| Data (`lib/`) | Plain exported async functions, typed, one concern per module. |
| Errors | Route through `lib/reportError.ts` + `components/LoadError.tsx`. |
| Styling | Tokens from `constants/theme.ts` only. |
| Schema | New file in `supabase/migrations/`, then hand-update `types/database.ts`. |

### 3.3 Verifying

Order matters — each step catches a class the previous one can't.

1. `npx tsc --noEmit` — strict mode; the hand-written `Database` type silently
   degrades to `never` if its shape is wrong, so a type error here is often a docs
   bug, not a code bug.
2. `npm test`.
3. Live smoke test. Headless: `CI=1 npx expo start --web` plus the Playwright MCP
   tools. Interactive: the Claude-in-Chrome extension — only a browser whose
   `list_connected_browsers` entry says `"isLocal": true` can reach this Mac's dev
   server.
4. For anything touching navigation: test **direct URL entry and page refresh**, not
   just clicking through. A native back button only renders when `canGoBack()` is
   true, and click-through alone will never surface that.
5. For anything destructive: confirm the row actually changed in Postgres.
   `Alert.alert` is a **no-op on web** — a delete button can report success, log
   nothing, and do nothing.

### 3.4 Finishing

1. Update the relevant `SPEC/PRD/` and `SPEC/TECH/` files in the same change. A
   feature whose spec wasn't updated is not done.
2. Append the full narrative — bugs hit, root causes, scope changes — to
   `docs/HISTORY.md` under that task's heading. Keep `SPEC/` itself summary-level;
   it loads into every session's context and detail there is expensive.
3. If a decision was architectural and non-obvious, write an ADR in
   `SPEC/decisions/` using [the template](SPEC/templates/adr-template.md).
4. Commit only when asked. Branch first if on `main`.

---

## 4. Documentation contract

| Document | Answers | Must not contain |
|---|---|---|
| `SPEC/PRD/*` | What the product does and why | File paths, SQL, component names |
| `SPEC/TECH/*` | How it's built, and what must not break | Product justification (link to PRD instead) |
| `SPEC/decisions/*` | Why we chose this over the alternative | Implementation detail that will drift |
| `docs/HISTORY.md` | How we got here, bug by bug | Anything needed to work today |
| `AGENTS.md` (this file) | How to work | Anything specific to one feature |

Keep `SPEC/` compact — `CLAUDE.md` pulls it into context every session. Long stories
belong in `docs/HISTORY.md`.

---

## 5. Failure modes specific to this codebase

Short list; full write-ups in
[`SPEC/TECH/12-engineering-pitfalls.md`](SPEC/TECH/12-engineering-pitfalls.md).

- **`INSERT … RETURNING` also enforces the SELECT policy.** Any table the client
  inserts into with `.insert().select()` needs a SELECT policy that covers "I am the
  one who just created this," and that check should be bound to the row's own columns
  — not routed through a function that re-queries the same table.
- **`role = 'admin'` is a bug.** It must be `role in ('admin','owner')`. This exact
  mistake shipped four separate times after the Owner tier was added.
- **`alter type … add value` gets its own migration file.** It cannot be used later in
  the same transaction that added it.
- **`router.back()` throws when there's no history.** Guard with `canGoBack()` and
  fall back to `replace`. `dismissTo` pops within the current Stack only — it silently
  no-ops across sibling tabs.
- **`FlatList` fires `onStartReached` at mount** and `onContentSizeChange` more often
  than the content actually changes. Treat both as suspect on first render.
- **A "hang" with no console errors and no network activity is navigation logic**, not
  a stuck client. That misdiagnosis has been made twice here.
