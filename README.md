# lab

Interactive explanations of backend systems, starting with Kafka.

Live at **[lab.yusufdariyemez.com](https://lab.yusufdariyemez.com)** — English at `/`, Turkish at `/tr`.

## Kafka, by behaviour

Most Kafka visualisations show you the architecture — producers, brokers, boxes
with arrows between them. That part is well covered already, so this one skips it
and goes at the behaviour that actually causes incidents:

| # | Section | What it demonstrates |
|---|---------|----------------------|
| 0 | Write path | Dual writes are not atomic. Crash between `COMMIT` and publish and the order exists with nobody informed; publish first and roll back, and you emit an event for an order that never existed. Then the same crash against the outbox pattern and CDC. |
| 1 | Partitions | Keys are hashed with murmur2 and pinned to a partition. Ordering is per key, not per topic. Skewed traffic makes one partition hot, and adding consumers cannot help. |
| 2 | Consumer groups | Partitions divide across a group, one owner each. Partition count is the hard ceiling on parallelism — surplus consumers idle. |
| 3 | Rebalance | Eager rebalancing stops the world while producers keep writing. Cooperative sticky only revokes what moves. Includes the `max.poll.interval.ms` rebalance loop. |
| 4 | Offsets | Commit before processing is at-most-once; commit after is at-least-once. Kill a consumer mid-record and watch which one you chose. |
| 5 | Dead letters | Retrying in place blocks the partition behind a poison message. Retry topics unblock it. Replaying a DLQ before fixing the fault loops the incident. |

Everything runs in the browser. No broker, no backend, no network calls — the
simulation is a deterministic model, so the same seed always replays the same
incident, and pause / step / restart work exactly as you would expect.

### What it is not

A Kafka emulator. There is no replication, no ISR, no leader election and no wire
protocol. The model reproduces the behaviour each section is about and nothing
more; where it simplifies, it simplifies in ways the prose calls out.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # simulation core
npm run build    # typecheck + production build to dist/
```

The interesting code is in `src/core/` — pure TypeScript, no Vue, no DOM:

- `cluster.ts` — partitions, assignment, rebalancing, commit semantics
- `writepath.ts` — dual write vs outbox vs CDC, and the consistency verdict
- `retry.ts` — the retry chain, dead letters and replay
- `partition.ts` — a port of Kafka's murmur2 partitioner
- `prng.ts` — seeded RNG; `Math.random()` is not used anywhere in the core

Each model is a pure `advance(state) -> state` function. The UI is the only part
that knows time exists, which is what keeps the whole thing reproducible and
testable.

## Licence

MIT
