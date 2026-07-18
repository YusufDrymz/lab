import { describe, expect, it } from 'vitest'
import {
  advanceIdem,
  chargeCount,
  chargesFor,
  createIdem,
  doubleCharged,
  send,
  settled,
  type IdemState,
  type Protection,
} from '../idempotency'

const KEY = 'idem-7f3a'
const AMOUNT = '249.90'

const run = (state: IdemState, ticks: number): IdemState => {
  let s = state
  for (let i = 0; i < ticks; i++) s = advanceIdem(s)
  return s
}

const runUntil = (
  state: IdemState,
  predicate: (s: IdemState) => boolean,
  max = 400,
): IdemState => {
  let s = state
  for (let i = 0; i < max; i++) {
    if (predicate(s)) return s
    s = advanceIdem(s)
  }
  throw new Error('condition never held')
}

/**
 * The classic story: the client gives up waiting, the server finishes anyway,
 * and the client retries afterwards (any real client backs off before retrying).
 * The gap between "the caller stopped listening" and "the work completed" is
 * where the double charge lives.
 */
const timeoutThenRetry = (protection: Protection): IdemState => {
  let s = createIdem({ protection, processingTicks: 24, clientTimeoutTicks: 12 })
  s = send(s, { key: KEY, amount: AMOUNT })
  s = runUntil(s, (x) => x.attempts.some((a) => a.timedOut))
  s = runUntil(s, (x) => x.attempts[0]!.phase === 'answered')
  s = send(s, { key: KEY, amount: AMOUNT, isRetry: true })
  return runUntil(s, settled)
}

/** Both requests land on the same tick — the race the atomic claim exists for. */
const simultaneous = (protection: Protection): IdemState => {
  let s = createIdem({ protection, processingTicks: 20 })
  s = send(s, { key: KEY, amount: AMOUNT })
  s = send(s, { key: KEY, amount: AMOUNT, isRetry: true })
  return runUntil(s, settled)
}

describe('determinism', () => {
  it('produces an identical run for the same seed', () => {
    const a = timeoutThenRetry('insert-on-conflict')
    const b = timeoutThenRetry('insert-on-conflict')
    expect(b.charges).toEqual(a.charges)
    expect(b.log).toEqual(a.log)
  })

  it('does not mutate the state it is given', () => {
    const state = run(send(createIdem(), { key: KEY, amount: AMOUNT }), 5)
    const before = structuredClone(state)
    advanceIdem(state)
    send(state, { key: 'other', amount: '10.00' })
    expect(state).toEqual(before)
  })
})

describe('no protection', () => {
  it('charges twice for one order', () => {
    const state = timeoutThenRetry('none')
    expect(chargesFor(state, KEY)).toHaveLength(2)
    expect(doubleCharged(state)).toBe(true)
  })

  it('answers both requests 201, so nothing looks wrong from outside', () => {
    const state = timeoutThenRetry('none')
    const statuses = state.attempts.map((a) => a.response?.status)
    expect(statuses).toEqual([201, 201])
  })
})

describe('idempotency key', () => {
  it('charges once and replays the stored response to the retry', () => {
    const state = timeoutThenRetry('insert-on-conflict')

    expect(chargesFor(state, KEY)).toHaveLength(1)

    const retry = state.attempts.find((a) => a.isRetry)!
    expect(retry.response?.replayed).toBe(true)
    expect(retry.response?.status).toBe(201)
  })

  it('replays the same body the first request got, not a fresh one', () => {
    const state = timeoutThenRetry('insert-on-conflict')
    const [first, retry] = state.attempts
    expect(retry!.response?.body).toBe(first!.response?.body)
  })

  it('answers 409, not a replay, when the retry lands before the first finishes', () => {
    // Retrying too eagerly gets a conflict rather than the answer: the first
    // request has not committed yet, so there is nothing to replay. The stored
    // response only exists once the handler is done.
    let s = createIdem({ protection: 'insert-on-conflict', processingTicks: 24, clientTimeoutTicks: 8 })
    s = send(s, { key: KEY, amount: AMOUNT })
    s = runUntil(s, (x) => x.attempts.some((a) => a.timedOut))
    s = send(s, { key: KEY, amount: AMOUNT, isRetry: true })
    s = runUntil(s, settled)

    expect(s.attempts[1]!.response?.status).toBe(409)
    expect(chargesFor(s, KEY)).toHaveLength(1)
  })

  it('marks the key completed once the handler commits', () => {
    const state = timeoutThenRetry('insert-on-conflict')
    const entry = state.store.find((e) => e.key === KEY)!
    expect(entry.state).toBe('completed')
    expect(entry.statusCode).toBe(201)
  })
})

describe('the race', () => {
  it('lets both requests through when the check and the claim are separate', () => {
    // read-then-write looks correct and passes any test that sends one request
    // at a time. Two in the same tick is what breaks it.
    const state = simultaneous('read-then-write')
    expect(chargesFor(state, KEY)).toHaveLength(2)
    expect(doubleCharged(state)).toBe(true)
  })

  it('lets exactly one win with INSERT ... ON CONFLICT', () => {
    const state = simultaneous('insert-on-conflict')
    expect(chargesFor(state, KEY)).toHaveLength(1)
    expect(doubleCharged(state)).toBe(false)
  })

  it('answers the loser 409 immediately, without queueing it', () => {
    const state = simultaneous('insert-on-conflict')
    const conflict = state.attempts.find((a) => a.response?.status === 409)!

    expect(conflict.response?.body).toContain('already in progress')
    // Answered on arrival, not after waiting out the handler.
    expect(conflict.phase).toBe('answered')
    expect(state.charges).toHaveLength(1)
  })

  it('is indistinguishable from the atomic version when requests are spaced out', () => {
    // The reason this bug ships: sequentially, read-then-write is correct.
    const state = timeoutThenRetry('read-then-write')
    expect(chargesFor(state, KEY)).toHaveLength(1)
  })
})

describe('fingerprint', () => {
  it('rejects a reused key carrying a different body with 422', () => {
    let s = createIdem({ protection: 'insert-on-conflict', processingTicks: 10 })
    s = send(s, { key: KEY, amount: AMOUNT })
    s = runUntil(s, settled)
    s = send(s, { key: KEY, amount: '999.00' })
    s = runUntil(s, settled)

    const second = s.attempts[1]!
    expect(second.response?.status).toBe(422)
    expect(second.response?.replayed).toBe(false)
    // Crucially it did not replay the first answer, and did not charge again.
    expect(chargeCount(s)).toBe(1)
  })

  it('replays when the body matches', () => {
    let s = createIdem({ protection: 'insert-on-conflict', processingTicks: 10 })
    s = send(s, { key: KEY, amount: AMOUNT })
    s = runUntil(s, settled)
    s = send(s, { key: KEY, amount: AMOUNT })
    s = runUntil(s, settled)

    expect(s.attempts[1]!.response?.status).toBe(201)
    expect(s.attempts[1]!.response?.replayed).toBe(true)
  })
})

describe('release on failure', () => {
  it('frees the key when the handler fails, so a retry can still succeed', () => {
    let s = createIdem({ protection: 'insert-on-conflict', processingTicks: 8, handlerFails: true })
    s = send(s, { key: KEY, amount: AMOUNT })
    s = runUntil(s, settled)

    expect(s.attempts[0]!.response?.status).toBe(500)
    // A failed request must not burn the key: the row is gone, not left claimed.
    expect(s.store.find((e) => e.key === KEY)).toBeUndefined()
    expect(chargeCount(s)).toBe(0)

    // Now the provider recovers and the client retries with the same key.
    s = { ...s, config: { ...s.config, handlerFails: false } }
    s = send(s, { key: KEY, amount: AMOUNT, isRetry: true })
    s = runUntil(s, settled)

    expect(s.attempts[1]!.response?.status).toBe(201)
    expect(chargeCount(s)).toBe(1)
  })

  it('would have locked the key out forever if the row were left in_flight', () => {
    // Guards the reason Release exists: without it the stored row stays
    // in_flight and every later retry answers 409 rather than succeeding.
    let s = createIdem({ protection: 'insert-on-conflict', processingTicks: 8, handlerFails: true })
    s = send(s, { key: KEY, amount: AMOUNT })
    s = runUntil(s, settled)
    expect(s.store).toHaveLength(0)
  })
})

describe('event log', () => {
  it('stays bounded on a long run', () => {
    let s = createIdem({ protection: 'insert-on-conflict', processingTicks: 2 })
    for (let i = 0; i < 200; i++) s = send(s, { key: `k-${i}`, amount: '10.00' })
    s = run(s, 300)
    expect(s.log).toHaveLength(300)
  })
})
