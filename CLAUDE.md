# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@SPEC.md

`SPEC.md` (above) is the primary architecture reference — domain model, full repo layout, per-migration
changelog, current task status, and an RLS lessons-learned section. Read `docs/HISTORY.md` directly
(not auto-loaded) for the full task-by-task build narrative when a `SPEC.md` summary isn't enough detail.

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

For UI/route changes, smoke-test headlessly with `CI=1 npx expo start --web` + Playwright MCP tools
(see `SPEC.md` section 8). CI mode disables Fast Refresh, so **restart the dev server after any
route/layout file change** — editing then re-navigating without a restart silently serves the old bundle.

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
