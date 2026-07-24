# SPEC.md has moved

This file was the project's single spec until it reached 2242 lines mixing
product vision, domain model, architecture, file layout, a migration changelog
and engineering war stories. It has been split by audience.

**Start at [`SPEC/README.md`](SPEC/README.md).**

Its full contents remain in git history if you need the original wording:
`git show 4963c2f:SPEC.md`.

## Where each section went

Existing references cite this file by section number, including sixteen applied
migrations that cannot be edited. This table is what those citations resolve to.

| Old section | Now lives in |
|---|---|
| 1. Product vision | [`SPEC/PRD/00-overview.md`](SPEC/PRD/00-overview.md) |
| 2. Domain model | [`SPEC/PRD/`](SPEC/PRD/) per feature, and [`SPEC/TECH/01-data-model.md`](SPEC/TECH/01-data-model.md) for the schema |
| 3. Tech stack | [`SPEC/TECH/00-architecture.md`](SPEC/TECH/00-architecture.md) |
| 4. Repo layout | [`SPEC/TECH/00-architecture.md`](SPEC/TECH/00-architecture.md), [`03-navigation-and-routing.md`](SPEC/TECH/03-navigation-and-routing.md), [`04-component-inventory.md`](SPEC/TECH/04-component-inventory.md), [`05-data-access-layer.md`](SPEC/TECH/05-data-access-layer.md) |
| 5. Current status | [`docs/HISTORY.md`](docs/HISTORY.md) for the build narrative, [`SPEC/PRD/13-roadmap-and-open-questions.md`](SPEC/PRD/13-roadmap-and-open-questions.md) for what is left |
| **6. Errors and lessons (RLS, FlatList, navigation)** | [`SPEC/TECH/12-engineering-pitfalls.md`](SPEC/TECH/12-engineering-pitfalls.md) |
| 7. Local development setup | [`SPEC/TECH/10-environments-and-release.md`](SPEC/TECH/10-environments-and-release.md) |
| 8. How to keep working from here | [`AGENTS.md`](AGENTS.md) |

Section 6 is the one cited most often from migration comments. It is now
[`SPEC/TECH/12-engineering-pitfalls.md`](SPEC/TECH/12-engineering-pitfalls.md),
and it is still the file to read before touching RLS, list virtualization, or
navigation.

## What is not here

The split was written against the code rather than against this file, and the
old text was stale in several places. Do not restore any of it without
re-checking: the calendar is a month grid with a separate events list rather
than one merged feed, club and race and Eboard profiles are separate screens
from their rosters, Eboard membership auto-syncs with the admin tier instead of
requiring a request, there are eighteen notification types rather than
thirteen, and the mention system, photo gallery and self-service leave paths
were never documented here at all.

Two documents did not exist before the split and have no old section number:
[`SPEC/TECH/13-backend-design.md`](SPEC/TECH/13-backend-design.md) and
[`SPEC/TECH/14-remediation-plan.md`](SPEC/TECH/14-remediation-plan.md).
