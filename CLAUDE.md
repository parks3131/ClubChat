# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@SPEC/README.md

`AGENTS.md` is the working agreement — read it first. `SPEC/README.md` (above) is the spec index:
product requirements in `SPEC/PRD/`, technical spec in `SPEC/TECH/`, decisions in `SPEC/decisions/`,
reusable forms in `SPEC/templates/`. Only the index auto-loads; Read the individual files on demand.

Highest-value entry points: `SPEC/TECH/12-engineering-pitfalls.md` before touching RLS, `FlatList`
scrolling, or navigation; `SPEC/TECH/01-data-model.md` and `SPEC/TECH/02-security-rls.md` before any
schema change. Read `docs/HISTORY.md` directly (not auto-loaded) for the full task-by-task build
narrative when a spec summary isn't enough detail.

## Commands

```bash
npm install              # install dependencies
npx expo start            # dev server; press w for web, or scan the QR code for native
npm run web                # expo start --web directly
npm run ios / npm run android
npx tsc --noEmit           # type check (strict mode; run before considering any change done)
npm test                    # full jest-expo test suite
npx jest lib/dates.test.ts   # a single test file
```

CI (`.github/workflows/ci.yml`) runs `npx tsc --noEmit` and `npm test` on every push/PR. There is no
linter or formatter configured in this repo.

For UI/route changes, smoke-test headlessly with `CI=1 npx expo start --web` + Playwright MCP tools,
or live in a real browser via the Claude-in-Chrome extension (see `SPEC/TECH/09-testing-and-ci.md` for
device-pairing steps and the no-known-password test-account workaround). CI mode disables Fast
Refresh, so **restart the dev server after any route/layout file change** — editing then
re-navigating without a restart silently serves the old bundle.

### Local Supabase

```bash
supabase start    # Postgres + Auth + Storage + Realtime, via Docker
supabase db reset  # re-apply every supabase/migrations/*.sql file from scratch
```

`supabase db reset` wipes the local Postgres instance and rebuilds it from migrations — the local DB is
not just test fixtures, it accumulates real usage data (real clubs/messages/accounts) between sessions.
Don't run it against a DB you haven't confirmed is disposable. To apply a single new migration to a live
local DB without resetting, apply it directly (`docker exec supabase_db_Club_Chat psql -U postgres -d
postgres -f path/to/migration.sql`) and register it by hand in `supabase_migrations.schema_migrations`
(`version`, `name` columns) so `supabase db reset` still replays cleanly later.

New migration files go in `supabase/migrations/`, numbered sequentially (`00NN_description.sql`) and
never edited in place after being applied — a follow-up change is always its own new migration.
