# Backend, Database and System Design: a learning path for ClubChat

A curriculum built backwards from the actual work in [the remediation plan](../SPEC/TECH/14-remediation-plan.md). Every topic here is named the way it is named in books, docs and search results, so you can look it up without guessing the vocabulary. Each one says why it matters *for this app specifically*, so nothing is abstract.

**How to use this.** Do not read it front to back. Each level maps to a phase of real work. Learn the level, then do that phase's work items, then move on. Concepts learned immediately before you use them stick; concepts learned six months early do not.

**The single best thing you can do while learning:** you have a local Postgres running in Docker with real data in it. Every idea below can be tested in `psql` in under a minute. Reading about an index scan teaches you the words. Running `explain analyze` on your own `messages` table and watching the plan change teaches you the thing.

```bash
docker exec -it supabase_db_Club_Chat psql -U postgres -d postgres
```

---

## Level 0: the vocabulary you are missing right now

These are the terms that appeared in the backend research and that make the rest unreadable if you do not have them.

| Topic | What to search | Why it matters here |
|---|---|---|
| **Client-server architecture** | "client server model", "thin client vs thick client" | Your app has no server. Understanding what a server normally does tells you what Postgres and RLS are doing instead |
| **Statelessness** | "stateless vs stateful services" | PostgREST is stateless, which is why 500 phones do not mean 500 database connections. This surprises people constantly |
| **Latency vs throughput** | "latency vs throughput", "p50 p95 p99 percentiles" | "Fast" is meaningless. p95 is the number that decides whether your app feels good. Learn to always ask "at what percentile" |
| **Read amplification** | "read amplification", "write amplification" | The core finding about your app: one message insert currently causes ~200 refetches. This is the term for that |
| **Fan-out** | "fan-out on write vs fan-out on read" | The single most important concept in messaging system design. Determines how unread counts, timelines and notifications are built |
| **Idempotency** | "idempotency", "idempotency key API" | Why a retried send does not create two messages. You are about to implement this in R10 |

**Self-check.** Can you explain, without notes, why sending one message currently costs work proportional to the number of *all users online*, not the number of people in that chat?

---

## Level 1: relational databases and SQL

This is the foundation and it is worth more than everything else combined, because your entire backend *is* a database.

| Topic | What to search | Why it matters here |
|---|---|---|
| **Relational modeling** | "database normalization", "1NF 2NF 3NF", "primary key foreign key" | Your schema has ~30 tables. Understanding why `messages` references `channels` which references `clubs` is understanding the app |
| **Foreign key cascades** | "ON DELETE CASCADE", "referential integrity" | Deleting a club really does remove everything under it, and cascades bypass RLS. This has surprised you already |
| **Indexes** | "B-tree index", "composite index column order", "covering index" | R9 adds `(channel_id, seq desc)`. Why that *order*, and why it makes pagination fast, is the single highest-value database concept for this app |
| **Query planning** | "EXPLAIN ANALYZE postgres", "sequential scan vs index scan", "query planner selectivity" | R11 is entirely about this. You cannot verify that item without being able to read a plan |
| **Transactions and ACID** | "ACID", "postgres transaction isolation levels", "read committed" | Why "approve the request and insert the membership row" must be one transaction, which is exactly what your `decide_join_request` RPC does |
| **Pagination** | "keyset pagination vs offset pagination", "cursor pagination" | Your chat uses keyset (correctly). R9 improves it. Offset pagination breaks at scale and on ties |
| **N+1 queries** | "N+1 query problem" | Your calendar feed has one. R13 fixes it |
| **Denormalization** | "denormalization tradeoffs" | R13 adds `channels.last_message_seq`. Deliberately storing derived data to avoid recomputing it |

**Resources, in order.**

1. **Use The Index, Luke** (use-the-index-luke.com). Free, online, and the best explanation of database indexing anywhere. Read the first three chapters and you will understand more about performance than most working developers.
2. **PostgreSQL official docs**, the tutorial and the "Performance Tips" chapter. Genuinely well written, unlike most vendor docs.
3. **"The Art of PostgreSQL"** by Dimitri Fontaine, if you want depth and enjoy SQL. Optional.
4. **explain.dalibo.com** for pasting an `explain analyze` output and getting a readable visualization.

**Self-check.** Run `explain analyze select * from messages where channel_id = '<some id>' order by created_at desc limit 50;` on your local database. Can you tell whether it used an index? Can you say what would happen without one?

---

## Level 2: authorization and security

Your entire security model is here, so a gap in this level is a gap in the product's safety.

| Topic | What to search | Why it matters here |
|---|---|---|
| **Authentication vs authorization** | "authn vs authz" | Different problems. Supabase Auth does the first, RLS does the second. Conflating them causes real bugs |
| **Row-Level Security** | "postgres row level security", "RLS policy USING vs WITH CHECK" | The whole ballgame. `USING` filters what you can see, `WITH CHECK` validates what you write. Mixing them up is the most common RLS mistake |
| **`SECURITY DEFINER` vs `INVOKER`** | "postgres security definer function", "search_path attack" | Definer bypasses RLS entirely, which is why every one of yours re-checks authorization in its own body. The `set search_path` on each is a real security measure, not boilerplate |
| **Principle of least privilege** | "principle of least privilege" | Why the publishable key is safe in the app and the secret key would be catastrophic |
| **JWTs** | "JWT structure", "JWT claims", "bearer token" | `auth.uid()` reads a claim out of the token your client sends. Knowing this makes RLS stop feeling like magic |
| **Column-level authorization** | "column level security postgres" | R3 exists because RLS filters *rows*, not *fields*. Understanding that limit explains the pin bug exactly |
| **Rate limiting** | "rate limiting", "token bucket algorithm" | You have none. This is a real gap before public launch |
| **Threat modeling** | "STRIDE threat model" | A structured way to ask "who could abuse this and how" before shipping a feature |

**Resources.** Supabase's RLS documentation and their RLS performance troubleshooting page are both genuinely good and directly applicable. OWASP Top Ten for the general shape of what goes wrong. Your own [Security and RLS](../SPEC/TECH/02-security-rls.md) is the applied version of all of this.

**Self-check.** Explain why `INSERT ... RETURNING` also enforces the SELECT policy, and why that broke club creation. If you can explain that one, you understand RLS better than most people using it.

---

## Level 3: APIs, caching and the network

| Topic | What to search | Why it matters here |
|---|---|---|
| **REST** | "REST API design", "HTTP methods idempotency safety" | PostgREST turns your tables into a REST API. Knowing REST conventions tells you what supabase-js is actually sending |
| **Caching fundamentals** | "cache hit ratio", "TTL", "cache invalidation", "cache key" | R12 is a pure caching bug. The signature in your query string becomes part of the cache key, so nothing ever hits |
| **CDNs** | "content delivery network", "edge caching", "origin server" | Why "cached egress" costs a third of "uncached egress", and why your app pays the expensive rate for 100% of media |
| **Signed URLs** | "presigned URL S3", "signed URL vs signed cookie" | The mechanism your private buckets use, and its unavoidable tension with caching |
| **Timeouts and retries** | "exponential backoff with jitter", "retry storm" | Your `authenticated` role has an 8 second statement timeout. Naive retries make outages worse, not better |
| **Connection pooling** | "connection pooling", "pgbouncer transaction mode" | Why transaction mode breaks prepared statements and `LISTEN/NOTIFY`. Matters when CI connects, not for the app |

**Resources.** MDN's HTTP caching guide is the clearest explanation of cache keys and TTL. PostgREST's own documentation for what your queries become on the wire.

**Self-check.** Two users open the same chat photo. Explain exactly why that is currently two origin downloads instead of one download and one cache hit.

---

## Level 4: realtime and distributed systems

Where the interesting failures live, and where your app's worst current bug is.

| Topic | What to search | Why it matters here |
|---|---|---|
| **WebSockets** | "websocket vs http polling", "long polling" | How realtime actually reaches the phone. Zulip still uses long polling successfully, which is a useful antidote to cargo-culting |
| **Pub/sub** | "publish subscribe pattern", "message broker", "topic based routing" | Broadcast-from-database is pub/sub. `postgres_changes` is not, which is exactly why it costs more |
| **Delivery guarantees** | "at-most-once at-least-once exactly-once delivery" | Supabase Realtime is at-most-once. R1 exists because of this. "Exactly once" is famously not really achievable, which is why idempotency keys exist |
| **Eventual consistency** | "eventual consistency", "strong vs eventual consistency" | Slack deliberately makes unread badges eventually consistent while keeping message order strong. R2 adopts the same tradeoff |
| **Reconciliation** | "state reconciliation", "anti-entropy", "sync protocol" | The fix for an unreliable event stream is never a more reliable stream, it is refetching authoritative state on reconnect |
| **Sequence numbers and gap detection** | "monotonic sequence number", "gap detection message sync", "vector clock" (background only) | R9. Telegram's `pts` is the canonical published example |
| **Backpressure** | "backpressure", "queueing theory basics" | Why a single-threaded change processor collapses as subscribers grow, rather than degrading smoothly |
| **CAP theorem** | "CAP theorem", "PACELC" | Useful as intuition. Widely over-applied in interviews, so learn it and then hold it loosely |

**Resources.**

1. **"Designing Data-Intensive Applications"** by Martin Kleppmann. This is *the* book. Chapters 1 to 5 and 11 are directly relevant to you. If you read one technical book this year, this is it. It is dense; read a chapter a week, not a night.
2. **Engineering blogs, as primary sources.** Discord on storing trillions of messages, Slack on real-time messaging, Zulip's architecture docs, Telegram's update protocol specification. These are how the research behind your plan was done, and reading them yourself is the fastest way to develop judgment about which patterns apply at which scale.

**Self-check.** Your app currently has no way to notice it missed a message. Describe two independent mechanisms that would let it notice, and say which one R9 gives you.

---

## Level 5: mobile and client architecture

| Topic | What to search | Why it matters here |
|---|---|---|
| **Offline-first** | "offline first architecture", "local first software" | R15. What "the app works on a track with no signal" actually requires |
| **Optimistic UI** | "optimistic updates", "optimistic concurrency" | Render the message immediately, reconcile with the server after. Needs R10's idempotency key to be safe |
| **Outbox pattern** | "outbox pattern", "transactional outbox" | A durable queue of pending sends on the device |
| **App lifecycle** | "ios app lifecycle background foreground", "react native AppState" | R1 and R2 both hinge on what happens when a phone backgrounds |
| **Push notifications** | "APNs", "Firebase Cloud Messaging", "push token lifecycle", "silent push" | R14. Note that badge counts are computed *by your server*, not by iOS |
| **Virtualized lists** | "list virtualization", "windowing", "FlatList performance" | Every scroll bug in your pitfalls doc comes from virtualization. Understanding "only rendered rows are measured" explains all four at once |

---

## Level 6: operations

Boring right up until the moment it is the only thing that matters.

| Topic | What to search | Why it matters here |
|---|---|---|
| **Backups, RPO and RTO** | "RPO RTO", "point in time recovery postgres" | R6. RPO is how much data you can afford to lose; RTO is how long you can be down. Decide both *before* you need them |
| **Schema migrations** | "database migration versioning", "expand contract migration pattern", "zero downtime migration" | You already do this well. Expand-contract is the pattern for changing a column without downtime, and you will need it eventually |
| **Observability** | "logs metrics traces", "observability vs monitoring", "structured logging" | You have none. Three different things, commonly confused |
| **Error monitoring** | "error tracking Sentry", "source maps" | The difference between "a user says it crashed" and knowing the stack trace |
| **Environment parity** | "dev prod parity", "twelve factor app" | R7. Version skew between local and hosted causes bugs that look like nothing else |
| **Feature flags** | "feature flags", "trunk based development" | How to ship unfinished work safely once a real club depends on the app |

---

## Level 7: system design, for when you want the big picture

Study this *after* Levels 1 to 4, not before. It is mostly the vocabulary for trade-offs you will already have met.

| Topic | What to search |
|---|---|
| Vertical vs horizontal scaling | "scale up vs scale out" |
| Sharding and partitioning | "database sharding", "hot partition problem" |
| Replication | "primary replica replication", "read replicas", "replication lag" |
| Load balancing | "load balancer algorithms" |
| Message queues | "message queue", "dead letter queue", "visibility timeout" |
| Caching layers | "cache aside", "write through cache", "thundering herd" |
| Consistent hashing | "consistent hashing" |

**A warning about this level.** Most "system design" content online is interview preparation, and it optimizes for sounding impressive about problems at Google's scale. That is actively harmful advice for an app with a realistic ceiling around a million messages a year. The research behind your backend plan found that every documented migration away from a relational message store happened at 10^8 to 10^12 messages, while Zulip serves thousands of organizations on one Postgres. Learn these concepts to recognize when they apply. Assume, by default, that they do not apply to you yet.

---

## The honest ordering

If you only do part of this:

1. **Level 1 indexes and `EXPLAIN ANALYZE`.** Highest return per hour of anything on this page.
2. **Level 2 RLS, `USING` versus `WITH CHECK`, and definer functions.** Your security depends on it and nobody else is reviewing it.
3. **Level 4 delivery guarantees and reconciliation.** Explains your worst current bug.
4. **Kleppmann chapters 1 to 5.** Turns scattered facts into a mental model.

Everything else can wait until the work needs it.

## Keeping your own notes

You already keep `learning.md`, with what you asked, what you were actually thinking, and what the quiz revealed. That habit is worth more than this document. Keep doing it, especially the part where you write down what you *thought* was true beforehand. The gap between the two is the actual learning, and it is the thing you will not be able to reconstruct later.
