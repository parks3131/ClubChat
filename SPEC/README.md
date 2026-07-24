# ClubChat - Spec Index

A purpose-built replacement for the GroupMe + Excel-screenshot workflow running clubs
use today: structured club chat, calendar, weekly routines, races-as-mini-clubs,
polls, and a private board channel - as a template any club can adopt.

**Stack:** React Native + Expo Router (TypeScript) · Supabase (Postgres + Auth +
Realtime + Storage) · 79 SQL migrations · RLS-enforced authorization.

---

## How to read this

| If you want… | Read |
|---|---|
| What the product does and why | [`PRD/`](PRD/) |
| How it's built and what must not break | [`TECH/`](TECH/) |
| Why a decision was made | [`decisions/`](decisions/) |
| To add a feature or migration | [`templates/`](templates/) |
| How to work in this repo | [`../AGENTS.md`](../AGENTS.md) |
| How we got here, bug by bug | [`../docs/HISTORY.md`](../docs/HISTORY.md) |

**Start here:** [PRD/00-overview.md](PRD/00-overview.md) → [TECH/00-architecture.md](TECH/00-architecture.md)
→ [TECH/12-engineering-pitfalls.md](TECH/12-engineering-pitfalls.md).

---

## PRD - product requirements

| # | Document | Covers |
|---|---|---|
| 00 | [Overview](PRD/00-overview.md) | Problem, product bet, principles, goals, non-goals, MVP order |
| 01 | [Personas & roles](PRD/01-personas-and-roles.md) | Owner / Admin / Member hierarchy, cross-feature permission matrix |
| 02 | [Clubs & membership](PRD/02-clubs-and-membership.md) | Create, join by link or search, join policies, roster, ownership transfer |
| 03 | [Chat](PRD/03-chat.md) | Messages, reactions, pins, announcements, mentions, attachments, moderation |
| 04 | [Calendar & events](PRD/04-calendar-and-events.md) | Club and global feeds, event types, detail views |
| 05 | [Routines](PRD/05-routines.md) | Weekly admin-authored workout plans |
| 06 | [Races](PRD/06-races.md) | Races & Meets as mini-clubs: roster, chat, meet info, car groups, pins |
| 07 | [Eboard & Council](PRD/07-eboard.md) | Private admins-only channel and meetings |
| 08 | [Polls](PRD/08-polls.md) | Creation, voting, deadlines, voter visibility, scoping |
| 09 | [News & Highlights](PRD/09-news-and-highlights.md) | Admin post feed, pinned/announcement highlights |
| 10 | [Notifications](PRD/10-notifications.md) | Notification catalogue, unread model, clearing rules |
| 11 | [Profile & account](PRD/11-profile-and-account.md) | Profile fields, avatars, legal docs, account deletion |
| 12 | [Non-functional requirements](PRD/12-nonfunctional-requirements.md) | Privacy, accessibility, performance, platform support |
| 13 | [Roadmap & open questions](PRD/13-roadmap-and-open-questions.md) | Not-yet-built, blocked, and undecided |

## TECH - technical spec

| # | Document | Covers |
|---|---|---|
| 00 | [Architecture](TECH/00-architecture.md) | System shape, layering, providers, the scoped mini-club pattern |
| 01 | [Data model](TECH/01-data-model.md) | ER diagram, every table, column, enum, index, cascade |
| 02 | [Security & RLS](TECH/02-security-rls.md) | Helper functions, per-table policy matrix, every RPC |
| 03 | [Navigation & routing](TECH/03-navigation-and-routing.md) | Route tree, guards, layout contexts, header and back conventions |
| 04 | [Component inventory](TECH/04-component-inventory.md) | Every shared component, its props, and its mount sites |
| 05 | [Data access layer](TECH/05-data-access-layer.md) | Every `lib/` module and exported function |
| 06 | [Realtime & notifications](TECH/06-realtime-and-notifications.md) | Subscriptions, trigger catalogue, unread computation, pg_cron |
| 07 | [Media & storage](TECH/07-media-and-storage.md) | Buckets, path conventions, signed URLs, upload paths |
| 08 | [Design system](TECH/08-design-system.md) | Tokens, typography, platform quirks |
| 09 | [Testing & CI](TECH/09-testing-and-ci.md) | Test suite, CI pipeline, smoke-test protocols, coverage gaps |
| 10 | [Environments & release](TECH/10-environments-and-release.md) | Local Supabase, config, native builds, EAS, release checklist |
| 11 | [Migrations](TECH/11-migrations.md) | Full 0001–0079 changelog and the migration workflow |
| 12 | [Engineering pitfalls](TECH/12-engineering-pitfalls.md) | The war stories. Read before touching RLS, FlatList, or navigation. |
| 13 | [Backend design and plan](TECH/13-backend-design.md) | Target backend shape, the phased plan to get there, and what is deliberately not built |
| 14 | [Remediation plan](TECH/14-remediation-plan.md) | Every known defect and gap, with the fix, verification, and acceptance criteria |

Learning the concepts behind all of this: [docs/LEARNING-PATH.md](../docs/LEARNING-PATH.md).

## Templates & decisions

| Document | Use when |
|---|---|
| [Feature spec template](templates/feature-spec-template.md) | Starting any new feature |
| [Migration checklist](templates/migration-checklist.md) | Writing a new `supabase/migrations/*.sql` |
| [ADR template](templates/adr-template.md) | Recording an architectural decision |
| [decisions/](decisions/) | Accepted architecture decision records |

---

## Conventions

- **PRD says what, TECH says how.** No file paths or SQL in `PRD/`; no product
  justification in `TECH/` - link across instead.
- **Keep it compact.** `CLAUDE.md` pulls this tree into every session's context.
  Long narratives go to [`../docs/HISTORY.md`](../docs/HISTORY.md).
- **The code and the migrations win.** Where a doc disagrees with the repo, the repo
  is right and the doc is a bug - fix it in the same change.
