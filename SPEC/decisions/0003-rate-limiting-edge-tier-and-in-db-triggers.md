# ADR-0003: Rate-limit spam in the database with token-bucket triggers, keeping the two-tier architecture

| | |
|---|---|
| Status | Accepted |
| Date | 2026-07-27 |
| Deciders | Founder (parks) |
| Supersedes | none |

> **Decision principle.** Do not weight development cost heavily. Rank options by
> quality, simplicity, robustness, scalability and long-term maintainability. "Faster
> to build" is not a sufficient reason to choose an option and should not appear alone
> in the Alternatives table; "simpler to reason about in two years" is decisive.

## Context

ClubChat is two-tier: the client talks to Postgres directly through PostgREST, with RLS
as the only access control (see [ADR-0002](0002-keep-postgres-and-rls-as-the-backend-contract.md)).
There is no application server, and there is no rate limiting on the data API, so a user
or script can spam message sends, join requests, and poll votes.

RLS answers *"are you allowed to do this at all?"* - it does **not** answer *"have you
done this too many times?"* A member who legitimately has permission can still spam. So a
second guard is needed for frequency, separate from authorization.

The alternative of adding a thin edge tier (Supabase Edge Functions + Upstash Redis) was
considered and rejected: it would turn a deliberate two-tier design into a three-tier one,
and for any operation left reachable through PostgREST it would force hand-rebuilding the
auto-generated API as bespoke functions. We want to preserve the two-tier architecture.

## Decision

We will implement rate limiting **entirely inside Postgres**, at the same chokepoint as
RLS: a `rate_limits` table, a token-bucket function (`rate_limit_spend`), and `before
insert` triggers on the spammable tables (starting with `messages`), plus equivalent
checks inside RPCs. No edge tier, no external service, no new architectural layer.

This addresses **a single actor spamming** (one user or script hammering an endpoint),
which is the abuse we actually face. It deliberately does **not** try to stop a
**volumetric DDoS** - many clients flooding at once - because the database must process
each request in order to reject it, so a flood large enough still burdens Postgres by
merely arriving.

## Consequences

| | |
|---|---|
| Positive | Preserves the two-tier architecture; the limit sits at the unbypassable chokepoint every path funnels through; no new service, dependency, or layer to operate; fully covers per-actor spam/abuse; same "push it into the DB" mental model as RLS. |
| Negative | Cannot stop a volumetric DDoS - the DB still has to process each request to reject it, so a large enough flood degrades Postgres regardless; adds a small extra read + write per protected write. |
| Follow-up needed | Build the `rate_limits` table + `rate_limit_spend` function + `before insert` trigger on `messages` (this task); extend to join requests / votes as needed. **If and when volumetric DDoS becomes a real threat**, put a CDN/WAF (e.g. Cloudflare) *in front of* the service - that is network infrastructure, **not** a third application tier, so it does not break this design; choose the best option at that time. Not built now. |

## Alternatives considered

| Alternative | Why not |
|---|---|
| Upstash Redis + Supabase Edge Functions (an edge tier) | Turns the two-tier design into three tiers and, for any PostgREST-reachable operation, forces hand-rebuilding the auto-generated API as bespoke functions - more to operate and reason about in two years, for protection the in-DB approach already provides against the per-actor spam we face. Its one unique benefit (rejecting *before* the DB) only matters for volumetric DoS, which a CDN handles without adding an application tier. |
| A traditional middle-tier application server (Node/etc.) | Reintroduces exactly the tier the architecture deliberately avoids ([ADR-0002](0002-keep-postgres-and-rls-as-the-backend-contract.md)); far more to run and maintain for no benefit over in-DB limits here. |
| Do nothing, rely on RLS | RLS answers "are you allowed?", not "how often?" - a permitted user can still spam. Authorization and rate limiting are different concerns. |
