# lab

Interactive explanations of backend systems — the parts that only make sense
once you watch them fail.

Live at **[lab.yusufdariyemez.com](https://lab.yusufdariyemez.com)** — English at
`/`, Turkish at `/tr`.

Most explanations show you the architecture: the boxes, the arrows, the happy
path. That is usually the easy part. What costs you a night is the behaviour —
what happens when a process dies halfway through, when a queue backs up behind
one bad message, when two systems disagree about what was written. Each lab
hands you the controls, including the ones that break things.

Everything runs in the browser. No broker, no backend, no network calls. Each
simulation is a deterministic model, so the same seed always replays the same
incident, and pause / step / restart work exactly as you would expect.

| Lab | Subject | Sections |
|-----|---------|----------|
| [Kafka, by behaviour](https://lab.yusufdariyemez.com/kafka) | Apache Kafka | 6 |
| [Webhooks, and where they go](https://lab.yusufdariyemez.com/hookkeep) | Webhooks · [hookkeep](https://github.com/YusufDrymz/hookkeep) | 4 |
| [The same request, twice](https://lab.yusufdariyemez.com/idempotency) | Idempotency · [go-idempotent](https://github.com/YusufDrymz/go-idempotent) | 4 |
| [This query will fall over in production](https://lab.yusufdariyemez.com/plans) | Query plans · [pg-plan-guard](https://github.com/YusufDrymz/pg-plan-guard) | 4 |

---

## Kafka, by behaviour

Producers, brokers and boxes with arrows are well covered elsewhere, so this one
skips them and goes at the behaviour that actually causes incidents.

![Dual write: the order is committed, the process dies before publishing, and the event is never emitted](docs/kafka.jpg)

| # | Section | What it demonstrates |
|---|---------|----------------------|
| 0 | Write path | Dual writes are not atomic. Crash between `COMMIT` and publish and the order exists with nobody informed; publish first and roll back, and you emit an event for an order that never existed. Then the same crash against the outbox pattern and CDC. |
| 1 | Partitions | Keys are hashed with murmur2 and pinned to a partition. Ordering is per key, not per topic. Skewed traffic makes one partition hot, and adding consumers cannot help. |
| 2 | Consumer groups | Partitions divide across a group, one owner each. Partition count is the hard ceiling on parallelism — surplus consumers idle. |
| 3 | Rebalance | Eager rebalancing stops the world while producers keep writing. Cooperative sticky only revokes what moves. Includes the `max.poll.interval.ms` rebalance loop. |
| 4 | Offsets | Commit before processing is at-most-once; commit after is at-least-once. Kill a consumer mid-record and watch which one you chose. |
| 5 | Dead letters | Retrying in place blocks the partition behind a poison message. Retry topics unblock it. Replaying a DLQ before fixing the fault loops the incident. |

## Webhooks, and where they go

A provider sends an event and expects a quick 2xx. Your endpoint is slow, or
restarting, or briefly down. The provider retries, gives up, and marks the
delivery as succeeded. Where is the event?

![Forward-first after a restart: the provider believes it delivered four events, three are on disk, and one is lost for good](docs/hookkeep.jpg)

| # | Section | What it demonstrates |
|---|---------|----------------------|
| 0 | Persist first | Forward-first acks the provider before anything is written. Restart the process mid-delivery and the event is gone — permanently, because the provider already got its 200 and has stopped retrying. Persist-first keeps the *at risk* counter structurally zero. |
| 1 | Retry | `base * 2^(attempt-1)`, capped, ±20% jitter. Without the jitter every delivery that failed during one outage retries at the same instant and knocks the endpoint over again. A `slow` endpoint is worse than a `down` one: a timeout does not say whether the work happened. |
| 2 | Replay | Dead is not discarded. Fix the endpoint, dry-run the range, close the gap. Replay while it is still broken and the same deliveries walk straight back into `dead`. |
| 3 | Signatures | A forged event is stored as evidence with `verify_status = rejected` and never enqueued. Verification status and delivery status are separate axes, and a range replay skips rejected events on purpose. |

Status names are taken from hookkeep's own schema.

## The same request, twice

A payment request times out. The client cannot tell whether the charge went
through, so it retries. Attaching a key is the easy half.

![Check-then-claim under a simultaneous retry: both requests win the row, both return 201, and the customer is billed 499.80 instead of 249.90](docs/idempotency.jpg)

| # | Section | What it demonstrates |
|---|---------|----------------------|
| 0 | Unprotected | A client timeout closes a connection; it does not cancel the handler. Both requests run, both return 201, both charge — and nothing appears in your logs as an error. |
| 1 | With a key | The retry replays the stored response verbatim with `Idempotent-Replay: true`. Retry too eagerly and there is nothing stored yet, so the answer is `409` rather than the response. |
| 2 | The race | Check-then-claim is correct every time you test it by hand and wrong the first time two requests land together. `INSERT ... ON CONFLICT (key) DO NOTHING` makes the check and the claim one statement, so exactly one wins. |
| 3 | Same key, different body | A fingerprint mismatch is `422`, not a replay — nobody gets handed someone else's receipt. And a failed handler releases the key instead of burning it, so a retry can still succeed. |

Status codes and state names are the ones go-idempotent returns.

## This query will fall over in production

Three milliseconds on your laptop, forty seconds in production, and the SQL
never changed. An index was dropped, a column got wrapped in a function, a
statistic went stale — and the plan quietly became a different plan.

![A dropped index: the baseline's Bitmap Heap Scan has become a Seq Scan, the shape hashes differ, and the check exits 1 with a crit finding](docs/plans.jpg)

| # | Section | What it demonstrates |
|---|---------|----------------------|
| 0 | Lost index | A btree on `email` cannot serve `lower(email) = ?` — the index would have to be evaluated per row, which is the scan it was avoiding. Nothing warns you; a functional index on the same expression brings the lookup back. |
| 1 | Scale | Sequential scans are the right plan on a small table and the incident on a large one. Drag the row count and watch the ratio go from 1× to 31×, because one curve is linear in the table and the other flattens once the matched window stops growing. |
| 2 | Bad estimate | A nested loop is unbeatable when the outer side really is small. Make the statistics stale and the planner picks it for 30 rows that turn out to be 12,000 — the same plan, one inner lookup per row it did not expect. |
| 3 | Plan shape | Costs, row counts and literals are stripped; `Materialize`, `Memoize`, `Gather` and `Gather Merge` are dropped when they have one child; an `Index Scan` and a `Bitmap Heap Scan` over the same index are equivalent. What survives is a regression worth failing a build over. |

Node names, normalisation rules, finding codes and severities are taken from
pg-plan-guard. It is a model of *why* a plan changes, not a planner — see below.

---

## What it is not

Not an emulator, in any of the four. There is no Kafka wire protocol, no
replication or leader election; no HTTP stack or Postgres behind the webhook
inbox; no real HMAC behind the signature section; and the query planner reads no
statistics and costs no alternatives — it derives a plan shape from table size,
index availability and the quality of the row estimate. Each model reproduces the
behaviour its section is about and nothing more, and where it simplifies, the
prose says so.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # simulation cores and locale parity
npm run build    # typecheck, production build, per-route head, sitemap
```

The interesting code is in `src/core/` — pure TypeScript, no Vue, no DOM:

- `cluster.ts` — partitions, assignment, rebalancing, commit semantics
- `writepath.ts` — dual write vs outbox vs CDC, and the consistency verdict
- `retry.ts` — the retry chain, dead letters and replay
- `partition.ts` — a port of Kafka's murmur2 partitioner
- `webhook.ts` — the webhook inbox: persist order, backoff, replay, verification
- `idempotency.ts` — stored responses, the claim race, fingerprints, release
- `plans.ts` — plan derivation, shape normalisation, and the diff that grades it
- `prng.ts` — seeded RNG; `Math.random()` is not used anywhere in the core

Each model is a pure `advance(state) -> state` function. The UI is the only part
that knows time exists, which is what keeps the whole thing reproducible and
testable.

Prose lives in `src/content/{en,tr}.ts`, never in a component. `parity.test.ts`
locks the two locales to the same structure, so a drifted translation fails the
build rather than shipping as an empty string.

## Licence

MIT
