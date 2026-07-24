# ADR-0002: Keep Postgres and RLS as the backend contract, add no API tier

| | |
|---|---|
| Status | Accepted |
| Date | 2026-07-24 |
| Deciders | Founder |
| Supersedes | none |

## Context

A native Swift iOS client is planned alongside the existing Expo client, which raises the question of what both clients bind to. The options were a direct-SDK model where RLS policies and RPCs are the contract, a custom API gateway both clients call, or a hybrid.

At the same time, the question of whether this backend design scales was open. The current schema pushes essentially all business logic into RLS policies, triggers and roughly 15 RPCs across 79 migrations, and there is no application server.

Research into comparable products (Discord, Signal, Zulip, Slack, Telegram, GroupMe) and into Supabase's current published limits was commissioned to answer both questions together.

## Decision

We will keep Postgres as the single source of truth and RLS plus the RPC catalogue as the I/O contract for every client. We will not build an API gateway. Edge Functions are scoped to outbound work that SQL cannot perform, which today means push dispatch only.

The contract is documented as a hand-written specification plus shared type definitions, and the specification is authoritative when a client disagrees with it.

## Consequences

| | |
|---|---|
| Positive | Both clients share one authorization layer, so a policy fix protects both at once. No tier to build, deploy, version or keep in sync with RLS. Supabase's own guidance endorses this shape rather than treating it as a shortcut. |
| Negative | Business logic lives in SQL, where it is harder to test and nearly invisible in production without deliberate observability. Scaling is vertical. There is no place to put a queue or a privileged computation, and a vendor outage is a total outage with no degraded mode. |
| Follow-up needed | The phased plan in [Backend design](../TECH/13-backend-design.md). Phase 0 items are launch blockers. |

## Alternatives considered

| Alternative | Why not |
|---|---|
| Custom API gateway in front of Postgres | Would duplicate authorization rules that already exist and are enforced in RLS, creating two sources of truth that drift. The cost is maintainability, not delivery speed, so the argument survives weighting quality over development cost. Revisit if the two clients ever need different authorization semantics for the same table. |
| Hybrid: SDK for reads and realtime, named endpoints for writes | Two contracts to document and keep aligned, for a benefit already provided by RPCs, which are named write operations that happen to be reachable through the same transport. |
| Move messages to a NoSQL store | Every documented migration of this kind happened at 10^8 to 10^12 messages. This product's realistic ceiling is around 10^6 per year. It would cost joins, RLS and transactional integrity that are currently free. |
