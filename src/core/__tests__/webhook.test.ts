import { describe, expect, it } from 'vitest'
import {
  advanceInbox,
  atRiskCount,
  backoffFor,
  crash,
  createInbox,
  deadCount,
  deliveredCount,
  rejectedCount,
  replayDead,
  setHealth,
  type InboxState,
} from '../webhook'
import { createRng } from '../prng'

const run = (state: InboxState, ticks: number): InboxState => {
  let s = state
  for (let i = 0; i < ticks; i++) s = advanceInbox(s)
  return s
}

/**
 * Counting a fixed number of ticks and assuming something is in flight by then
 * is a coin toss — the arrival cadence and the jittered backoff both move. A
 * predicate makes the intent explicit and the test deterministic.
 */
const runUntil = (
  state: InboxState,
  predicate: (s: InboxState) => boolean,
  max = 600,
): InboxState => {
  let s = state
  for (let i = 0; i < max; i++) {
    if (predicate(s)) return s
    s = advanceInbox(s)
  }
  throw new Error('condition never held')
}

describe('determinism', () => {
  it('produces an identical run for the same seed', () => {
    const a = run(createInbox({ seed: 7, health: 'slow' }), 200)
    const b = run(createInbox({ seed: 7, health: 'slow' }), 200)
    expect(b.events).toEqual(a.events)
    expect(b.log).toEqual(a.log)
  })

  it('produces a different run for a different seed', () => {
    const a = run(createInbox({ seed: 7, health: 'slow' }), 200)
    const b = run(createInbox({ seed: 8, health: 'slow' }), 200)
    expect(b.events).not.toEqual(a.events)
  })

  it('does not mutate the state it is given', () => {
    const state = run(createInbox({ health: 'slow' }), 60)
    const before = structuredClone(state)
    advanceInbox(state)
    crash(state)
    setHealth(state, 'down')
    replayDead(state)
    expect(state).toEqual(before)
  })
})

describe('receiving', () => {
  it('acks the provider and stores the body before delivering, in persist-first', () => {
    const state = runUntil(createInbox(), (s) => s.events.length > 0)
    const event = state.events[0]!
    expect(event.stored).toBe(true)
    expect(event.providerAcked).toBe(true)
    expect(event.verifyStatus).toBe('verified')
    // Enqueued — a verified event always gets a delivery row, unlike a rejected
    // one. (Which row it is by now depends on how the first attempt went.)
    expect(event.delivery).not.toBeNull()
  })

  it('leaves the body unwritten until delivery succeeds, in forward-first', () => {
    const state = runUntil(createInbox({ mode: 'forward-first', health: 'down' }), (s) =>
      s.events.some((e) => e.attempts.length > 0),
    )
    const event = state.events[0]!
    expect(event.providerAcked).toBe(true)
    expect(event.stored).toBe(false)
    // The gap this whole page is about: the provider thinks it is done, and
    // there is nothing on disk.
    expect(atRiskCount(state)).toBeGreaterThan(0)
  })

  it('never leaves anything at risk in persist-first', () => {
    const state = run(createInbox({ health: 'down' }), 300)
    expect(atRiskCount(state)).toBe(0)
  })
})

describe('crash', () => {
  it('loses forward-first events that were acked but not written', () => {
    const before = runUntil(createInbox({ mode: 'forward-first', health: 'down' }), (s) =>
      s.events.some((e) => e.attempts.length > 0),
    )
    const after = crash(before)

    expect(after.lost).toBe(before.events.length)
    expect(after.events).toHaveLength(0)
  })

  it('loses nothing in persist-first and resumes delivery', () => {
    const before = runUntil(createInbox({ health: 'down' }), (s) => s.events.length >= 2)
    const after = crash(before)

    expect(after.lost).toBe(0)
    expect(after.events).toHaveLength(before.events.length)

    // Still deliverable: bring the endpoint back and they land.
    const recovered = run(setHealth(after, 'up'), 200)
    expect(deliveredCount(recovered)).toBeGreaterThan(0)
  })

  it('keeps delivered events across a crash in either mode', () => {
    const before = runUntil(createInbox({ mode: 'forward-first' }), (s) => deliveredCount(s) >= 2)
    const after = crash(before)
    expect(deliveredCount(after)).toBe(deliveredCount(before))
    expect(after.lost).toBe(0)
  })
})

describe('retry and backoff', () => {
  it('grows the interval exponentially and caps it', () => {
    const rng = createRng(1)
    const config = { ...createInbox().config, baseBackoff: 10, maxBackoff: 100 }

    const first = backoffFor(config, 1, rng)
    const second = backoffFor(config, 2, rng)
    const far = backoffFor(config, 12, rng)

    // ±20% jitter around 10 and 20 respectively.
    expect(first).toBeGreaterThanOrEqual(8)
    expect(first).toBeLessThanOrEqual(12)
    expect(second).toBeGreaterThanOrEqual(16)
    expect(second).toBeLessThanOrEqual(24)
    expect(far).toBe(100)
  })

  it('jitters, so a fleet of retries does not resynchronise', () => {
    const rng = createRng(99)
    const config = { ...createInbox().config, baseBackoff: 50, maxBackoff: 10_000 }
    const values = new Set(Array.from({ length: 20 }, () => backoffFor(config, 3, rng)))
    expect(values.size).toBeGreaterThan(1)
  })

  it('marks a delivery dead once attempts are exhausted', () => {
    const state = runUntil(createInbox({ health: 'down', maxAttempts: 3 }), (s) => deadCount(s) > 0)
    const dead = state.events.find((e) => e.delivery === 'dead')!
    expect(dead.attempts).toHaveLength(3)
    // Dead is not lost. The record is still there.
    expect(dead.stored).toBe(true)
  })

  it('stops attempting once dead', () => {
    const state = runUntil(createInbox({ health: 'down', maxAttempts: 3 }), (s) => deadCount(s) > 0)
    const dead = state.events.find((e) => e.delivery === 'dead')!
    const later = run(state, 200)
    const same = later.events.find((e) => e.id === dead.id)!
    expect(same.attempts).toHaveLength(dead.attempts.length)
  })

  it('delivers without retrying while the endpoint is up', () => {
    const state = run(createInbox({ health: 'up' }), 200)
    expect(deadCount(state)).toBe(0)
    for (const event of state.events) {
      if (event.delivery === 'delivered') expect(event.attempts).toHaveLength(1)
    }
  })
})

describe('replay', () => {
  it('reports what it would do without changing anything, as a dry run', () => {
    const state = runUntil(createInbox({ health: 'down', maxAttempts: 2 }), (s) => deadCount(s) >= 2)
    const result = replayDead(state, { dryRun: true })
    expect(result.selected.length).toBe(deadCount(state))
    expect(result.state).toBe(state)
  })

  it('closes the gap once the endpoint is healthy again', () => {
    const dead = runUntil(createInbox({ health: 'down', maxAttempts: 2 }), (s) => deadCount(s) >= 2)
    const healthy = setHealth(dead, 'up')
    const replayed = replayDead(healthy).state

    expect(deadCount(replayed)).toBe(0)
    const settled = run(replayed, 100)
    expect(deliveredCount(settled)).toBeGreaterThanOrEqual(2)
  })

  it('marks replayed deliveries so a second lap is visible', () => {
    const dead = runUntil(createInbox({ health: 'down', maxAttempts: 2 }), (s) => deadCount(s) >= 1)
    const replayed = replayDead(setHealth(dead, 'up')).state
    const event = replayed.events.find((e) => e.replayedAt !== null)!
    expect(event.deliveryKind).toBe('replay')
  })

  it('dies again when nothing was fixed', () => {
    const dead = runUntil(createInbox({ health: 'down', maxAttempts: 2 }), (s) => deadCount(s) >= 1)
    const before = deadCount(dead)
    const settled = run(replayDead(dead).state, 400)
    // Endpoint still down: the same deliveries walk straight back into dead.
    expect(deadCount(settled)).toBeGreaterThanOrEqual(before)
    expect(deliveredCount(settled)).toBe(0)
  })

  it('honours a since window', () => {
    const state = runUntil(createInbox({ health: 'down', maxAttempts: 2 }), (s) => deadCount(s) >= 3)
    const cutoff = state.events[1]!.receivedAt
    const result = replayDead(state, { since: cutoff, dryRun: true })
    expect(result.selected.every((e) => e.receivedAt >= cutoff)).toBe(true)
    expect(result.selected.length).toBeLessThan(deadCount(state))
  })
})

describe('signature verification', () => {
  it('stores a forged event as evidence and never enqueues it', () => {
    const state = runUntil(createInbox({ badSignatureEvery: 2 }), (s) => rejectedCount(s) > 0)
    const rejected = state.events.find((e) => e.verifyStatus === 'rejected')!

    expect(rejected.stored).toBe(true)
    expect(rejected.delivery).toBeNull()
    expect(rejected.verifyReason).toBe('signature mismatch')
    // A 401 went back, not a 200 — the caller was not told this worked.
    expect(rejected.providerAcked).toBe(false)
  })

  it('never delivers a rejected event, however long it runs', () => {
    const state = run(createInbox({ badSignatureEvery: 2 }), 400)
    expect(rejectedCount(state)).toBeGreaterThan(0)
    for (const event of state.events) {
      if (event.verifyStatus === 'rejected') expect(event.attempts).toHaveLength(0)
    }
  })

  it('excludes rejected events from a range replay', () => {
    const state = run(createInbox({ badSignatureEvery: 2, health: 'down', maxAttempts: 2 }), 400)
    const result = replayDead(state, { dryRun: true })
    expect(result.selected.every((e) => e.verifyStatus !== 'rejected')).toBe(true)
  })

  it('accepts events as unverified when no verifier is configured', () => {
    const state = runUntil(createInbox({ verifySignatures: false }), (s) => s.events.length > 0)
    const event = state.events[0]!
    expect(event.verifyStatus).toBe('unverified')
    // Unverified still gets delivered; only `rejected` is held back.
    expect(event.delivery).not.toBeNull()
  })
})

describe('event log', () => {
  it('stays bounded on a long run', () => {
    const state = run(createInbox({ health: 'slow', arrivalEvery: 3 }), 3000)
    expect(state.log.length).toBeLessThanOrEqual(300)
  })
})
