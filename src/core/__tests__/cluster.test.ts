import { describe, expect, it } from 'vitest'
import {
  addConsumer,
  advance,
  append,
  createSim,
  isStalled,
  killConsumer,
  lagByPartition,
  totalLag,
  type SimState,
} from '../cluster'
import { makeOrder } from '../scenario'
import { createRng } from '../prng'

const run = (state: SimState, ticks: number): SimState => {
  let s = state
  for (let i = 0; i < ticks; i++) s = advance(s)
  return s
}

const recordCount = (s: SimState) => s.partitions.reduce((n, p) => n + p.records.length, 0)

/**
 * Advances until the predicate holds. A consumer only picks up its next record
 * on the tick after it finishes the previous one, so "run exactly N ticks and
 * assume something is in flight" is a coin flip — this makes it deterministic.
 */
const runUntil = (state: SimState, predicate: (s: SimState) => boolean, max = 500): SimState => {
  let s = state
  for (let i = 0; i < max; i++) {
    if (predicate(s)) return s
    s = advance(s)
  }
  throw new Error('condition never held')
}

const inFlightOf = (s: SimState) => s.group.consumers.find((c) => c.processing)

describe('determinism', () => {
  it('replays an identical run from the same seed', () => {
    const a = run(createSim({ seed: 42 }, ['c1', 'c2']), 200)
    const b = run(createSim({ seed: 42 }, ['c1', 'c2']), 200)
    expect(b.partitions).toEqual(a.partitions)
    expect(b.group.committed).toEqual(a.group.committed)
    expect(b.events).toEqual(a.events)
  })

  it('diverges for a different seed', () => {
    const a = run(createSim({ seed: 1 }), 200)
    const b = run(createSim({ seed: 2 }), 200)
    expect(b.partitions).not.toEqual(a.partitions)
  })

  it('does not mutate the state handed to advance()', () => {
    const before = createSim({ seed: 3 })
    const snapshot = structuredClone(before)
    advance(before)
    expect(before).toEqual(snapshot)
  })
})

describe('producing', () => {
  it('appends on the configured cadence and not otherwise', () => {
    const s = run(createSim({ seed: 5, produceEveryTicks: 10 }), 100)
    expect(recordCount(s)).toBe(10)
  })

  it('can be switched off entirely', () => {
    const s = run(createSim({ seed: 5, produceEveryTicks: 0 }), 100)
    expect(recordCount(s)).toBe(0)
  })

  it('keeps offsets contiguous within each partition', () => {
    const s = run(createSim({ seed: 6 }), 300)
    for (const partition of s.partitions) {
      partition.records.forEach((record, index) => expect(record.offset).toBe(index))
    }
  })

  it('routes every record by its key', () => {
    const s = run(createSim({ seed: 7 }), 300)
    for (const partition of s.partitions) {
      for (const record of partition.records) {
        expect(record.value.customer_id).toBe(record.key)
      }
    }
  })

  it('keeps one key on one partition', () => {
    // Ordering per key is the guarantee; if a key ever appeared on two
    // partitions the whole of section 1 would be wrong.
    const s = run(createSim({ seed: 8 }), 400)
    const partitionOf = new Map<string, number>()
    for (const partition of s.partitions) {
      for (const record of partition.records) {
        const seen = partitionOf.get(record.key)
        if (seen === undefined) partitionOf.set(record.key, partition.index)
        else expect(partition.index).toBe(seen)
      }
    }
  })

  it('creates a hot partition when skew is enabled', () => {
    const skewed = run(createSim({ seed: 9, skewed: true, produceEveryTicks: 2 }), 600)
    const sizes = skewed.partitions.map((p) => p.records.length)
    const max = Math.max(...sizes)
    const total = sizes.reduce((a, b) => a + b, 0)
    // The whale customer should own a clear majority of one partition's traffic.
    expect(max / total).toBeGreaterThan(0.45)
  })
})

describe('assignment', () => {
  it('gives every partition exactly one owner', () => {
    const s = createSim({ partitionCount: 3 }, ['c1', 'c2'])
    const owned = s.group.consumers.flatMap((c) => c.assigned)
    expect(owned.sort()).toEqual([0, 1, 2])
  })

  it('leaves surplus consumers idle when they outnumber partitions', () => {
    // The lesson of section 2: parallelism is capped by partition count.
    const s = createSim({ partitionCount: 2 }, ['c1', 'c2', 'c3', 'c4'])
    const idle = s.group.consumers.filter((c) => c.assigned.length === 0)
    expect(idle).toHaveLength(2)
  })

  it('never assigns a partition to a dead consumer', () => {
    let s = createSim({ partitionCount: 3 }, ['c1', 'c2'])
    s = killConsumer(s, 'c1')
    s = run(s, 40)
    const dead = s.group.consumers.find((c) => c.id === 'c1')!
    expect(dead.alive).toBe(false)
    expect(dead.assigned).toEqual([])
    const live = s.group.consumers.find((c) => c.id === 'c2')!
    expect(live.assigned.sort()).toEqual([0, 1, 2])
  })
})

describe('rebalance', () => {
  it('stalls an eager group for the configured window', () => {
    let s = createSim({ seed: 11, rebalanceTicks: 12 }, ['c1', 'c2'])
    s = run(s, 60)
    s = addConsumer(s, 'c3')
    expect(isStalled(s)).toBe(true)

    const committedDuringStall = { ...s.group.committed }
    s = run(s, 11)
    expect(isStalled(s)).toBe(true)
    // Nothing is processed while the world is stopped.
    expect(s.group.committed).toEqual(committedDuringStall)

    s = advance(s)
    expect(isStalled(s)).toBe(false)
  })

  it('keeps producing while consumers are stalled, so lag grows', () => {
    let s = createSim({ seed: 12, rebalanceTicks: 20, produceEveryTicks: 3 }, ['c1'])
    s = run(s, 40)
    s = addConsumer(s, 'c2')
    const lagBefore = totalLag(s)
    s = run(s, 18)
    expect(totalLag(s)).toBeGreaterThan(lagBefore)
  })

  it('does not stop the world when cooperative', () => {
    let s = createSim({ seed: 13, rebalanceTicks: 20 }, ['c1', 'c2'])
    s.group.strategy = 'cooperative'
    s = run(s, 60)
    s = addConsumer(s, 'c3')
    expect(isStalled(s)).toBe(false)
  })

  it('counts rebalances', () => {
    let s = createSim({ seed: 14 }, ['c1'])
    expect(s.group.rebalanceCount).toBe(0)
    s = addConsumer(s, 'c2')
    s = killConsumer(s, 'c1')
    expect(s.group.rebalanceCount).toBe(2)
  })
})

describe('offset commit semantics', () => {
  it('loses the in-flight record when committing before processing', () => {
    // at-most-once: committed, then the consumer dies mid-work. Nobody reads it
    // again, because the group has already moved past it.
    let s = createSim({ seed: 21, processingTicks: 8, produceEveryTicks: 4 }, ['c1'])
    s.group.commitMode = 'before-processing'
    s = runUntil(s, (x) => x.group.consumers[0]!.processing !== null)

    const inFlight = s.group.consumers[0]!.processing!

    s = killConsumer(s, 'c1')
    expect(s.events.some((e) => e.kind === 'message-lost')).toBe(true)
    expect(s.events.some((e) => e.kind === 'message-duplicated')).toBe(false)
    // The committed offset is already past the record that never got handled.
    expect(s.group.committed[inFlight.partition]).toBe(inFlight.offset + 1)
  })

  it('repeats the in-flight record when committing after processing', () => {
    // at-least-once: the work happened but was never committed, so a surviving
    // consumer picks it up again.
    let s = createSim({ seed: 22, processingTicks: 8, produceEveryTicks: 4 }, ['c1', 'c2'])
    s.group.commitMode = 'after-processing'
    s = runUntil(s, (x) => inFlightOf(x) !== undefined)

    const victim = inFlightOf(s)!
    const inFlight = victim.processing!

    s = killConsumer(s, victim.id)
    expect(s.events.some((e) => e.kind === 'message-duplicated')).toBe(true)
    expect(s.events.some((e) => e.kind === 'message-lost')).toBe(false)
    expect(s.reprocessed).toContain(`${inFlight.partition}:${inFlight.offset}`)
    // The offset was never advanced, so the record is still pending.
    expect(s.group.committed[inFlight.partition] ?? 0).toBeLessThanOrEqual(inFlight.offset)
  })

  it('actually reprocesses the uncommitted record after recovery', () => {
    let s = createSim({ seed: 23, processingTicks: 6, produceEveryTicks: 4 }, ['c1', 'c2'])
    s = runUntil(s, (x) => inFlightOf(x) !== undefined)
    const victim = inFlightOf(s)!
    const { partition, offset } = victim.processing!

    s = killConsumer(s, victim.id)
    s = run(s, 120)

    const processedAgain = s.events.filter(
      (e) =>
        e.kind === 'processed' && e.ref?.partition === partition && e.ref.offset === offset,
    )
    expect(processedAgain.length).toBeGreaterThanOrEqual(1)
    expect(s.group.committed[partition] ?? 0).toBeGreaterThan(offset)
  })

  it('reports no loss and no duplication when nothing was in flight', () => {
    let s = createSim({ seed: 24, produceEveryTicks: 0 }, ['c1', 'c2'])
    s = run(s, 20)
    s = killConsumer(s, 'c1')
    expect(s.events.some((e) => e.kind === 'message-lost')).toBe(false)
    expect(s.events.some((e) => e.kind === 'message-duplicated')).toBe(false)
  })
})

describe('lag', () => {
  it('is zero on an empty topic', () => {
    expect(totalLag(createSim({ produceEveryTicks: 0 }))).toBe(0)
  })

  it('counts records written but not yet committed', () => {
    const s = createSim({ produceEveryTicks: 0 }, ['c1'])
    const rng = createRng(1)
    append(s, makeOrder(rng, 0))
    append(s, makeOrder(rng, 1))
    expect(totalLag(s)).toBe(2)
  })

  it('drains to zero once a healthy group catches up', () => {
    let s = createSim({ seed: 31, produceEveryTicks: 8, processingTicks: 1 }, ['c1', 'c2', 'c3'])
    s = run(s, 200)
    // Stop writing and let the consumers finish the backlog.
    s.config.produceEveryTicks = 0
    s = run(s, 200)
    expect(totalLag(s)).toBe(0)
  })

  it('reports lag per partition', () => {
    const s = createSim({ partitionCount: 3, produceEveryTicks: 0 })
    expect(lagByPartition(s)).toEqual([0, 0, 0])
  })

  it('grows without bound when every consumer is dead', () => {
    let s = createSim({ seed: 32, produceEveryTicks: 4 }, ['c1'])
    s = killConsumer(s, 'c1')
    s = run(s, 100)
    expect(totalLag(s)).toBeGreaterThan(10)
  })
})

describe('event log', () => {
  it('stays bounded on a long run', () => {
    const s = run(createSim({ seed: 41, produceEveryTicks: 1 }), 2000)
    expect(s.events.length).toBeLessThanOrEqual(400)
  })

  it('stamps every event with the tick it happened on', () => {
    const s = run(createSim({ seed: 42 }), 100)
    expect(s.events.length).toBeGreaterThan(0)
    for (const event of s.events) {
      expect(event.tick).toBeGreaterThanOrEqual(0)
      expect(event.tick).toBeLessThanOrEqual(s.tick)
    }
  })
})
