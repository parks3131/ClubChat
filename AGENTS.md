# AGENTS.md - working agreement for ClubChat

How any agent (or human) should work in this repo. Read this first, then
[`SPEC/README.md`](SPEC/README.md) for what the product is and how it's built.

---

## 0. Standing instructions

These apply to every task in this repo, always, without being restated.

### Writing

1. **Never use an em dash (U+2014).** Use a plain hyphen (`-`) instead. Applies to
   code, comments, docs, commit messages, and anything shown to the user. Grep for it
   with `grep -rnP '\xe2\x80\x94' .` rather than pasting the character into a doc.
2. **Never add an agent name as a commit co-author.** Commit messages carry the
   author's intent, not the tool's byline. No `Co-Authored-By` line for an assistant.

### Deciding

3. **Do not weight development cost heavily when making a technical decision.**
   Prefer, in this order: quality, simplicity, robustness, scalability, long-term
   maintainability. "It's faster to build" is close to worthless as an argument here;
   "it's simpler to reason about in a year" is decisive. Record the reasoning in an
   [ADR](SPEC/templates/adr-template.md).

### Fixing bugs

4. **Reproduce the bug end-to-end before fixing it.** Start by reproducing it the way
   an end user would actually hit it - through the running app, on the relevant
   platform, with realistic data - not by reading code and reasoning about what might
   be wrong. A fix that was never preceded by a reproduction is a guess, and this
   repo's history contains several confident guesses that were wrong. Once fixed,
   re-run the same reproduction to prove it.

### Verifying

5. **Be picky about the UI. Pixel perfection is the standard.** When testing
   end-to-end, treat anything that looks off as a defect worth fixing, including
   things unrelated to the current task: misaligned rows, inconsistent spacing, a
   header that jumps, a colour that doesn't match the token, a control that is a few
   pixels from where it belongs. Fix it along the way rather than filing it.
6. **Hold engineering hygiene to the same bar.** A failing test, a flaky test, or a
   type error gets fixed when you see it, whether or not you caused it. Never work
   around a flake by re-running until it passes, and never leave the suite in a state
   where a red result is normal.

---

## 1. Non-negotiables

1. **Expo has changed.** Read the exact versioned docs at
   <https://docs.expo.dev/versions/v57.0.0/> before writing Expo code. Training-data
   memory of older SDKs is actively wrong here.
2. **Never edit an applied migration.** A correction is always a new numbered file.
   See [`SPEC/templates/migration-checklist.md`](SPEC/templates/migration-checklist.md).
3. **Never run `supabase db reset` against a DB you haven't confirmed is disposable.**
   The local DB accumulates real usage data between sessions. It is not fixtures.
4. **Read [`SPEC/TECH/12-engineering-pitfalls.md`](SPEC/TECH/12-engineering-pitfalls.md)
   before touching RLS, `FlatList` scrolling, or navigation.** Every entry in it cost
   a long debugging session at least once. For **any RLS policy** specifically, also
   work through [`SPEC/templates/rls-security-checklist.md`](SPEC/templates/rls-security-checklist.md) -
   the red-flag catalogue, attacker scenarios, and the psql proof step - and prove the
   forbidden case is actually blocked before calling it done.
5. **`npx tsc --noEmit` and `npm test` must pass before any change is "done."**
6. **No secrets in the repo.** Only the `sb_publishable_…` key is client-safe. The
   `sb_secret_…` key bypasses RLS and must never appear in code, docs, or logs.

---

## 2. Repo map

| Path | What it is |
|---|---|
| `SPEC/` | The spec. Product in `PRD/`, engineering in `TECH/`, reusable forms in `templates/`, ADRs in `decisions/`. |
| `docs/HISTORY.md` | Task-by-task build narrative. Not auto-loaded, read on demand. |
| `app/` | Expo Router file-based routes. Screens only, no raw Supabase queries. |
| `components/` | Shared, scope-parametrized screens (`ChatScreen`, `PollsListScreen`, …). |
| `lib/` | Data-access layer. Plain async functions typed against `types/database.ts`. |
| `contexts/` | App-wide providers (auth, notifications, current club). |
| `supabase/migrations/` | Sequential SQL. The schema's source of truth. |
| `constants/theme.ts` | Design tokens. Never hardcode a colour or spacing value. |

---

## 3. Commands

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
layout file change**. Editing and then re-navigating silently serves the stale bundle.

---

## 4. Workflow

### 4.1 Before writing code

1. Read the relevant `SPEC/PRD/` file for intended behaviour, then the matching
   `SPEC/TECH/` file for how that area is built.
2. Find the closest existing feature and mirror it. This codebase is deliberately
   pattern-heavy: a race is a club nested one level down, an Eboard channel is the
   same shape again. Almost nothing here should be genuinely novel.
3. If the request is ambiguous about **who is allowed to do what**, ask. Permission
   models in this app are not derivable by analogy. Race Meet Info is "any admin",
   Eboard Meetings is "creator only", and both were explicit founder calls.

### 4.2 Writing code

| Layer | Rule |
|---|---|
| Screens (`app/`) | Call `lib/` functions. Never build a Supabase query inline. |
| Shared UI (`components/`) | Parametrize by scope (club / race / eboard) rather than forking a copy. |
| Data (`lib/`) | Plain exported async functions, typed, one concern per module. |
| Errors | Route through `lib/reportError.ts` + `components/LoadError.tsx`. |
| Styling | Tokens from `constants/theme.ts` only. |
| Schema | New file in `supabase/migrations/`, then hand-update `types/database.ts`. |

### 4.3 Verifying

Order matters. Each step catches a class the previous one cannot.

1. `npx tsc --noEmit`. Strict mode, and the hand-written `Database` type silently
   degrades to `never` if its shape is wrong, so a type error here is often a docs bug
   rather than a code bug.
2. `npm test`. Zero failures, zero flakes. See standing instruction 6.
3. Live smoke test. Headless: `CI=1 npx expo start --web` plus the Playwright MCP
   tools. Interactive: the Claude-in-Chrome extension, where only a browser whose
   `list_connected_browsers` entry says `"isLocal": true` can reach this Mac's dev
   server. Apply standing instruction 5 while you are in there.
4. For anything touching navigation, test **direct URL entry and page refresh**, not
   just clicking through. A native back button only renders when `canGoBack()` is
   true, and click-through alone will never surface that.
5. For anything destructive, confirm the row actually changed in Postgres.
   `Alert.alert` is a **no-op on web**, so a delete button can report success, log
   nothing, and do nothing.

### 4.4 Finishing

1. Update the relevant `SPEC/PRD/` and `SPEC/TECH/` files in the same change. A
   feature whose spec was not updated is not done.
2. Append the full narrative - bugs hit, root causes, scope changes - to
   `docs/HISTORY.md` under that task's heading. Keep `SPEC/` itself summary-level; it
   loads into every session's context and detail there is expensive.
3. If a decision was architectural and non-obvious, write an ADR in
   `SPEC/decisions/` using [the template](SPEC/templates/adr-template.md).
4. Commit only when asked. No agent co-author line.
5. **This is a solo repo: commit and push directly to `main`.** Do not branch or open
   a PR unless explicitly asked. CI (`tsc --noEmit` + `npm test`) runs on the push; if
   it goes red, fix forward or revert the commit. The one exception is a change the
   author flags as risky and wants reviewed first.

---

## 5. Documentation contract

| Document | Answers | Must not contain |
|---|---|---|
| `SPEC/PRD/*` | What the product does and why | File paths, SQL, component names |
| `SPEC/TECH/*` | How it's built, and what must not break | Product justification (link to PRD instead) |
| `SPEC/decisions/*` | Why we chose this over the alternative | Implementation detail that will drift |
| `docs/HISTORY.md` | How we got here, bug by bug | Anything needed to work today |
| `AGENTS.md` (this file) | How to work | Anything specific to one feature |

Keep `SPEC/` compact. `CLAUDE.md` pulls it into context every session, so long stories
belong in `docs/HISTORY.md`.

---

## 6. Failure modes specific to this codebase

Short list. Full write-ups in
[`SPEC/TECH/12-engineering-pitfalls.md`](SPEC/TECH/12-engineering-pitfalls.md).

- **`INSERT … RETURNING` also enforces the SELECT policy.** Any table the client
  inserts into with `.insert().select()` needs a SELECT policy that covers "I am the
  one who just created this," and that check should be bound to the row's own columns
  rather than routed through a function that re-queries the same table.
- **`role = 'admin'` is a bug.** It must be `role in ('admin','owner')`. This exact
  mistake shipped four separate times after the Owner tier was added.
- **`alter type … add value` gets its own migration file.** It cannot be used later in
  the same transaction that added it.
- **`router.back()` throws when there is no history.** Guard with `canGoBack()` and
  fall back to `replace`. `dismissTo` pops within the current Stack only, and silently
  no-ops across sibling tabs.
- **`FlatList` fires `onStartReached` at mount** and `onContentSizeChange` more often
  than the content actually changes. Treat both as suspect on first render.
- **A "hang" with no console errors and no network activity is navigation logic**, not
  a stuck client. That misdiagnosis has been made twice here.
