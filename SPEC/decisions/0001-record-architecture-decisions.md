# ADR-0001: Record architecture decisions as ADRs

Establishes `SPEC/decisions/` as the home for architecture decision records in this repo.

| | |
|---|---|
| Status | Accepted |
| Date | 2026-07-24 |
| Deciders | Founder + Claude Code |
| Supersedes | none |

## Context

ClubChat's architectural decisions have so far been recorded as prose embedded in one large `SPEC.md` — mixed in with the domain model, the repo layout, a per-migration changelog, and a task status table. That file grew large enough to need active compression to stay loadable into every session's context, and it is now being split into `SPEC/PRD/` (product) and `SPEC/TECH/` (technical).

Several genuinely load-bearing decisions live in that prose today, but only as a sentence or two of justification attached to whatever section happened to describe the resulting code. There is no consistent place to record the *forces*, the alternatives that were rejected, or the date a decision was made — so a decision's reasoning is only discoverable by whoever remembers which section it hides in, and a later reversal (several have happened) leaves no trail linking the new choice to the old one.

## Decision

We will record each significant architecture decision as a numbered Markdown file in `SPEC/decisions/`, using `SPEC/templates/adr-template.md` — Status / Context / Decision / Consequences / Alternatives considered. Files are numbered sequentially, named `<NNNN>-<kebab-title>.md`, and never edited to reverse a decision: a reversal is a new ADR that marks the old one `Superseded by ADR-NNNN`.

"Significant" means a decision that constrains future work: schema shape, permission model, technology choice, or a cross-cutting pattern. Routine implementation choices stay in `SPEC/TECH/` and `docs/HISTORY.md`.

## Consequences

| | |
|---|---|
| Positive | Reasoning and rejected alternatives survive independently of the code they produced; a reversal is traceable rather than silent; `SPEC/TECH/` can stay descriptive ("what the architecture is") without carrying justification prose. |
| Negative | One more place to look, and one more file to write per significant decision. ADRs go stale unless superseded honestly. |
| Follow-up needed | Back-fill ADRs for the existing high-value decisions listed below. |

## Alternatives considered

| Alternative | Why not |
|---|---|
| Keep decisions as prose inside `SPEC/TECH/` | Exactly the status quo that motivated this — justification and description interleave, and reversals overwrite the reasoning that produced the original choice. |
| Record decisions only in `docs/HISTORY.md` | HISTORY is chronological build narrative keyed by task number; finding "why is `channels` generic?" means knowing which task built it. Wrong index for the question. |
| Git commit messages as the record | Commits explain a change, not a standing constraint, and are not discoverable when reading the spec. |
| No formal record | Already tried. The decisions below are real and correct, but their reasoning is scattered. |

## Back-fill candidates

Decisions already made and documented elsewhere in the spec, worth restating as ADRs when someone next touches the relevant area:

| Candidate | Currently captured in | Gist |
|---|---|---|
| Supabase (Postgres + RLS) over Firebase/Firestore | `SPEC.md` §3 | The domain is fundamentally relational (Club → Member → Race → Carpool); Postgres + RLS maps onto it naturally, and a document model makes nested race membership and carpool groups awkward. |
| One generic `channels` table across three scopes | `SPEC.md` §2 | `channels` is club-scoped by default, race-scoped via a nullable `race_id`, eboard-scoped via `eboard_channel_id` — rather than a per-feature chat table. Race and Eboard chat inherited the entire messages/reactions RLS and UI for free. |
| `join_policy` instead of an invite-only tier | `SPEC.md` §2 | Every club is `open` or `request`; the `invite_code` / join-link path is an orthogonal, always-instant private side channel rather than a third policy value. |
| Races created standalone, not spawned from a calendar event | `SPEC.md` §1, task #16 | The original plan had a race spawn from a `type: race` calendar entry; a founder wireframe made races a standalone list (name + date) with no link to the calendar. The calendar-linked version was never built. |
| A Race is a Club shape nested one level down | `SPEC.md` §2 | Membership + chat, not a separate concept — the reason the generic-`channels` decision paid off. |
| Race membership requires a real `race_members` row, even for the Owner | migrations `0044`, `0049`, `0050` | Reverses an earlier admin-auto-membership decision (`0041`) at explicit founder request; management authority and chat access were split into `isManager` vs `isMember`. A textbook case for a superseding ADR. |
