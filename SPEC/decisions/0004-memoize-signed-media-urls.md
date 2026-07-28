# 4. Memoize signed media URLs client-side rather than sharing one URL across users

Date: 2026-07-28

## Status

Accepted.

## Context

Private media lives in three buckets (`message-photos`, `message-documents`,
`club-post-photos`) gated by the same membership checks as the rows that reference them,
so a displayable URL has to be signed. Every fetch minted a fresh signature, and because
the signature rides in the query string - which is part of any cache key - no two
requests for the same object ever matched. The cache never warmed and every view hit the
storage origin. This is [R12](../TECH/14-remediation-plan.md).

The remediation plan's stated fix was to "memoize by storage path ... so all users and
all renders share one URL for its lifetime." Measured against local storage, that
outcome is not reachable from the client: the signature payload embeds `iat` at
one-second resolution, so two signing calls in different seconds return different tokens
for the same path and expiry. Two calls inside the same second do return byte-identical
URLs, which confirms the mechanism precisely. A client-side memo can therefore make one
device agree with itself, but never make two devices agree with each other.

That left three real options, differing in how much authorization they trade away.

## Decision

We memoize signed URLs client-side, keyed by `(bucket, path)`, with a seven day expiry
and a re-sign an hour before it lapses. Render sites pass `expo-image` an explicit
`cacheKey` of the URL with its query string removed, so the on-device disk cache survives
both a cold start (which empties the in-memory memo) and the eventual re-sign.

We deliberately do **not** store a shared URL server-side or make the buckets public.
Per-user authorization at fetch time is retained: each device still proves its own
membership to obtain a URL at all.

## Consequences

| | |
|---|---|
| Positive | Removes the per-device repeat-fetch multiplier, which is the dominant cost - a chat open plus N realtime refetches went from N+1 downloads of one photo to 1. No migration, no schema change, no new authorization surface, and fully reversible by deleting one module. Storage-level authorization is unchanged. |
| Negative | Does not dedupe across devices: N users viewing one photo is still N origin fetches. A URL now lives up to seven days instead of one hour, so a leaked URL is useful for longer. |
| Mitigation | The memo is cleared on `SIGNED_OUT`, so a second account signing in on a shared device cannot inherit URLs for media it may not be allowed to see. |
| Follow-up | If media egress becomes a real cost line, revisit sharing one URL across users. That is a separate decision with a genuine authorization tradeoff, and should be made against measured egress, not anticipated egress. |

## Alternatives considered

| Alternative | Why not |
|---|---|
| Mint a long-lived URL at upload time and store it on the row, so every user reads the identical URL | This is the only option that actually collapses N origin fetches to one, and it is the right answer *if* egress is the binding cost. It is not free: it needs a migration, a re-minting story for expiry, and it downgrades access from per-user authorization at fetch time to unguessable-until-expiry for anyone who can read the row. We have no egress measurement justifying that trade yet, and the per-device multiplier - which the cheap fix removes - is the larger factor at current scale. |
| Public buckets with unguessable UUID paths | Strongest caching, permanently stable URLs, and what Signal does for blobs. It also drops storage-level authorization entirely and is close to irreversible once URLs are in the wild. Disproportionate to a problem that is currently about repeat fetches, not about sharing. |
| Shorten the TTL and accept the misses | Keeps the bug. The whole defect is that the cache never warms. |
| Store dimensions and a generated thumbnail alongside, per the original plan text | Aimed at layout shift, which this app does not have: every photo render site already sets an explicit fixed height and a placeholder background. It would pay off only alongside a redesign to aspect-ratio-preserving bubbles, which is a product decision rather than a defect fix. |
