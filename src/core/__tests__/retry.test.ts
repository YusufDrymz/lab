import { describe, expect, it } from 'vitest'
import {
  advanceRetry,
  chainFor,
  createRetry,
  DEFAULT_RETRY_CONFIG,
  replay,
  submit,
  type RetryState,
} from '../retry'
import { makeOrder, TOPICS } from '../scenario'
import { createRng } from '../prng'

const rng = () => createRng(2026)

const run = (state: RetryState, ticks: number): RetryState => {
  let s = state
  for (let i = 0; i < ticks; i++) s = advanceRetry(s)
  return s
}

/** Submits n orders and hands back both the state and the ids used. */
const withOrders = (state: RetryState, n: number) => {
  const r = rng()
  const events = Array.from({ length: n }, (_, i) => makeOrder(r, i))
  let s = state
  for (const event of events) s = submit(s, event)
  return { state: s, events }
}

describe('chain', () => {
  it('runs orders -> retry.5s -> retry.1m -> DLQ', () => {
    expect(chainFor(DEFAULT_RETRY_CONFIG)).toEqual([
      TOPICS.orders,
      TOPICS.retry5s,
      TOPICS.retry1m,
      TOPICS.dlq,
    ])
  })

  it('shortens when fewer backoff steps are configured', () => {
    expect(chainFor({ ...DEFAULT_RETRY_CONFIG, backoff: [10] })).toEqual([
      TOPICS.orders,
      TOPICS.retry5s,
      TOPICS.dlq,
    ])
  })
})

describe('happy path', () => {
  it('processes healthy messages without touching the retry chain', () => {
    const { state } = withOrders(createRetry(), 4)
    const s = run(state, 5)
    expect(s.succeeded).toHaveLength(4)
    expect(s.dlq).toHaveLength(0)
    expect(s.inFlight).toHaveLength(0)
  })
})

describe('poison message, retry-topic strategy', () => {
  it('forwards the poison message and lets healthy traffic through', () => {
    const r = rng()
    const poisonEvent = makeOrder(r, 0)
    let s = createRetry({ strategy: 'retry-topic', poison: [poisonEvent.order_id], backoff: [2, 3] })
    s = submit(s, poisonEvent)
    for (let i = 1; i < 4; i++) s = submit(s, makeOrder(r, i))

    s = run(s, 3)
    // The healthy messages are not waiting on the poison one.
    expect(s.succeeded.length).toBeGreaterThanOrEqual(3)
    expect(s.headOfLineBlocked).toBe(0)
  })

  it('eventually lands the poison message in the DLQ with its history', () => {
    const r = rng()
    const poisonEvent = makeOrder(r, 0)
    let s = createRetry({ strategy: 'retry-topic', poison: [poisonEvent.order_id], backoff: [2, 3] })
    s = submit(s, poisonEvent)
    s = run(s, 40)

    expect(s.dlq).toHaveLength(1)
    const letter = s.dlq[0]!
    expect(letter.event.order_id).toBe(poisonEvent.order_id)
    // One attempt per hop of the chain before the DLQ.
    expect(letter.attempts).toHaveLength(3)
    expect(letter.lastError).toContain('currency')
  })
})

describe('poison message, retry-in-place strategy', () => {
  it('blocks everything behind it on the partition', () => {
    const r = rng()
    const poisonEvent = makeOrder(r, 0)
    let s = createRetry({
      strategy: 'retry-in-place',
      poison: [poisonEvent.order_id],
      backoff: [3],
      maxInPlaceAttempts: 5,
    })
    s = submit(s, poisonEvent)
    for (let i = 1; i < 4; i++) s = submit(s, makeOrder(r, i))

    s = advanceRetry(s)
    // The head of the partition failed and was not committed, so the three
    // healthy messages behind it are stuck.
    expect(s.headOfLineBlocked).toBe(3)
    expect(s.succeeded).toHaveLength(0)
  })

  it('releases the partition once it finally gives up', () => {
    const r = rng()
    const poisonEvent = makeOrder(r, 0)
    let s = createRetry({
      strategy: 'retry-in-place',
      poison: [poisonEvent.order_id],
      backoff: [1],
      maxInPlaceAttempts: 3,
    })
    s = submit(s, poisonEvent)
    for (let i = 1; i < 4; i++) s = submit(s, makeOrder(r, i))

    s = run(s, 30)
    expect(s.dlq).toHaveLength(1)
    expect(s.dlq[0]!.attempts).toHaveLength(3)
    // Only now do the healthy messages get processed.
    expect(s.succeeded).toHaveLength(3)
    expect(s.headOfLineBlocked).toBe(0)
  })

  it('costs more latency than the retry-topic strategy', () => {
    const r = rng()
    const poisonEvent = makeOrder(r, 0)
    const build = (strategy: 'retry-in-place' | 'retry-topic') => {
      const r2 = rng()
      let s = createRetry({
        strategy,
        poison: [poisonEvent.order_id],
        backoff: [3, 3],
        maxInPlaceAttempts: 4,
      })
      s = submit(s, makeOrder(r2, 0))
      for (let i = 1; i < 4; i++) s = submit(s, makeOrder(r2, i))
      return s
    }

    const ticksToDrain = (state: RetryState) => {
      let s = state
      for (let t = 1; t <= 200; t++) {
        s = advanceRetry(s)
        if (s.succeeded.length === 3) return t
      }
      return Infinity
    }

    expect(ticksToDrain(build('retry-in-place'))).toBeGreaterThan(
      ticksToDrain(build('retry-topic')),
    )
  })
})

describe('backoff', () => {
  it('holds a message for the configured number of ticks', () => {
    const r = rng()
    const poisonEvent = makeOrder(r, 0)
    let s = createRetry({ strategy: 'retry-topic', poison: [poisonEvent.order_id], backoff: [10, 10] })
    s = submit(s, poisonEvent)

    s = advanceRetry(s)
    expect(s.inFlight[0]!.topic).toBe(TOPICS.retry5s)
    expect(s.inFlight[0]!.waitTicks).toBe(10)

    s = run(s, 5)
    // Still waiting out the backoff, no new attempt yet.
    expect(s.inFlight[0]!.attempts).toHaveLength(1)
  })
})

describe('replay', () => {
  const deadState = () => {
    const r = rng()
    const poisonEvent = makeOrder(r, 0)
    let s = createRetry({ strategy: 'retry-topic', poison: [poisonEvent.order_id], backoff: [1, 1] })
    s = submit(s, poisonEvent)
    s = run(s, 20)
    return { state: s, poisonId: poisonEvent.order_id }
  }

  it('reaches the DLQ first', () => {
    expect(deadState().state.dlq).toHaveLength(1)
  })

  it('dry run changes nothing', () => {
    const { state } = deadState()
    const result = replay(state, { dryRun: true })
    expect(result.state).toBe(state)
    expect(result.state.dlq).toHaveLength(1)
    expect(result.selected).toHaveLength(1)
  })

  it('dry run warns that unfixed messages will die again', () => {
    // The point of the whole section: replaying poison re-runs the incident.
    const { state } = deadState()
    expect(replay(state, { dryRun: true }).willFailAgain).toHaveLength(1)
  })

  it('puts replayed messages back on the main topic', () => {
    const { state } = deadState()
    const { state: after } = replay(state)
    expect(after.dlq).toHaveLength(0)
    expect(after.inFlight).toHaveLength(1)
    expect(after.inFlight[0]!.topic).toBe(TOPICS.orders)
  })

  it('carries the attempt history across the replay', () => {
    const { state } = deadState()
    const { state: after } = replay(state)
    // A replayed message is visibly on its second lap, not brand new.
    expect(after.inFlight[0]!.attempts.length).toBeGreaterThan(0)
  })

  it('loops the incident when nothing was fixed', () => {
    const { state } = deadState()
    const { state: after } = replay(state)
    const settled = run(after, 30)
    // Straight back where it started.
    expect(settled.dlq).toHaveLength(1)
  })

  it('succeeds once the underlying fault is fixed', () => {
    const { state } = deadState()
    const { state: after } = replay(state)
    // Deploy the fix: the payload is no longer rejected.
    after.config.poison = []
    const settled = run(after, 30)
    expect(settled.dlq).toHaveLength(0)
    expect(settled.succeeded).toHaveLength(1)
  })

  it('filters by error so one bad batch can be drained alone', () => {
    const { state } = deadState()
    expect(replay(state, { errorContains: 'timeout', dryRun: true }).selected).toHaveLength(0)
    expect(replay(state, { errorContains: 'currency', dryRun: true }).selected).toHaveLength(1)
  })
})

describe('purity', () => {
  it('does not mutate the input state', () => {
    const { state } = withOrders(createRetry(), 2)
    const snapshot = structuredClone(state)
    advanceRetry(state)
    replay(state)
    expect(state).toEqual(snapshot)
  })
})
