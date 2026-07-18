/**
 * The same request, twice — what go-idempotent is for.
 *
 * A payment request times out. The client has no idea whether the charge went
 * through, so it retries. Did the customer just pay twice?
 *
 * Two invariants, same as every other model here:
 *
 *  1. `advanceIdem(state) -> state` is pure. No clock, no DOM, no Math.random.
 *  2. Randomness comes from folding the seed with the tick, so a rerun of the
 *     same seed produces the same incident.
 *
 * Names come from go-idempotent and from the Postgres store orderflow builds on
 * top of it, not from the simulation: `Begin` returns begun / in-flight /
 * completed, the stored row is `in_flight` or `completed`, a replayed response
 * carries `Idempotent-Replay: true`, a reused key with a different body is a
 * 422, and a second request that arrives mid-flight gets a 409 immediately —
 * it is not queued and there is no Retry-After.
 */
import { createRng, type Rng } from './prng'

/**
 * How the endpoint guards itself. Only the last of these is what the library
 * does; the first two exist so the reader can watch them fail.
 *
 *   none               no idempotency at all. Every request is a new charge.
 *   read-then-write    check the store, then claim it. Correct-looking, and it
 *                      has a window: two requests can both read "nothing here"
 *                      before either writes.
 *   insert-on-conflict `INSERT ... ON CONFLICT (key) DO NOTHING`. The claim and
 *                      the check are one atomic statement, so exactly one
 *                      request can win the row.
 */
export type Protection = 'none' | 'read-then-write' | 'insert-on-conflict'

/** What `Begin` tells the caller. */
export type BeginResult = 'begun' | 'in-flight' | 'completed'

/** `idempotency_keys.state` — the CHECK constraint allows exactly these two. */
export type KeyState = 'in_flight' | 'completed'

export type StoredEntry = {
  key: string
  state: KeyState
  /** SHA-256 of the request body. Modelled here as the amount that produced it. */
  fingerprint: string
  statusCode: number | null
  body: string | null
}

export type Response = {
  status: number
  body: string
  /** set when the answer came from the store rather than from the handler */
  replayed: boolean
}

export type Phase = 'in-transit' | 'processing' | 'answered'

export type Attempt = {
  id: string
  key: string
  /** stands in for the SHA-256 of the body: same amount, same fingerprint */
  fingerprint: string
  amount: string
  sentAt: number
  phase: Phase
  /** ticks remaining in the current phase */
  ticksLeft: number
  response: Response | null
  /** the client gave up waiting before an answer came back */
  timedOut: boolean
  /** true for a retry the client sent after a timeout */
  isRetry: boolean
}

/** What the customer is actually billed. Two of these for one order is the bug. */
export type Charge = {
  id: string
  key: string
  amount: string
  at: number
  byAttempt: string
}

export type IdemConfig = {
  seed: number
  protection: Protection
  /** how long the handler takes — the window everything else happens inside */
  processingTicks: number
  /** how long the client waits before giving up and retrying */
  clientTimeoutTicks: number
  /** the handler fails, so the middleware releases the key instead of storing a response */
  handlerFails: boolean
}

export type IdemState = {
  tick: number
  config: IdemConfig
  store: StoredEntry[]
  attempts: Attempt[]
  charges: Charge[]
  nextId: number
  log: string[]
}

export const DEFAULT_IDEM_CONFIG: IdemConfig = {
  seed: 20260719,
  protection: 'none',
  processingTicks: 24,
  clientTimeoutTicks: 16,
  handlerFails: false,
}

export function createIdem(config: Partial<IdemConfig> = {}): IdemState {
  return {
    tick: 0,
    config: { ...DEFAULT_IDEM_CONFIG, ...config },
    store: [],
    attempts: [],
    charges: [],
    nextId: 1,
    log: [],
  }
}

/** Unused for now beyond jitter-free determinism, but kept for parity with the other models. */
function rngFor(state: IdemState): Rng {
  return createRng((state.config.seed ^ Math.imul(state.tick + 1, 0x9e3779b9)) >>> 0)
}

const note = (state: IdemState, text: string): void => {
  state.log.push(`t${state.tick} · ${text}`)
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300)
}

const find = (state: IdemState, key: string): StoredEntry | undefined =>
  state.store.find((entry) => entry.key === key)

/** The client sends a request. `key` is the Idempotency-Key header. */
export function send(
  state: IdemState,
  options: { key: string; amount: string; isRetry?: boolean },
): IdemState {
  const next = structuredClone(state)
  const id = `req-${next.nextId}`
  next.nextId++

  next.attempts.push({
    id,
    key: options.key,
    fingerprint: options.amount,
    amount: options.amount,
    sentAt: next.tick,
    phase: 'in-transit',
    ticksLeft: 1,
    response: null,
    timedOut: false,
    isRetry: options.isRetry ?? false,
  })

  note(
    next,
    `${id} POST /orders/pay  Idempotency-Key: ${options.key}${options.isRetry ? '  (retry)' : ''}`,
  )
  return next
}

const answer = (state: IdemState, attempt: Attempt, response: Response, text: string): void => {
  attempt.phase = 'answered'
  attempt.response = response
  attempt.ticksLeft = 0
  note(state, `${attempt.id} ← ${response.status} ${text}`)
}

/**
 * The middleware's Begin step, for the two protections that consult the store.
 *
 * Returns the outcome; the caller decides what to do with it. Splitting the
 * read from the write is what makes the race in `read-then-write` expressible
 * at all — see `advanceIdem`.
 */
function beginFor(state: IdemState, attempt: Attempt): BeginResult {
  const existing = find(state, attempt.key)
  if (!existing) return 'begun'
  return existing.state === 'completed' ? 'completed' : 'in-flight'
}

/** Applies whatever Begin decided, for an attempt that is entering the handler. */
function applyBegin(state: IdemState, attempt: Attempt, result: BeginResult): boolean {
  if (result === 'completed') {
    const entry = find(state, attempt.key)!

    // Fingerprint is checked only on the completed path — the same key with a
    // different body is a caller bug, not a retry, and must not replay someone
    // else's answer.
    if (entry.fingerprint !== attempt.fingerprint) {
      answer(
        state,
        attempt,
        { status: 422, body: 'idempotency key reused with a different request', replayed: false },
        'Unprocessable Entity — same key, different body',
      )
      return false
    }

    answer(
      state,
      attempt,
      { status: entry.statusCode ?? 200, body: entry.body ?? '', replayed: true },
      `replayed from the store  Idempotent-Replay: true`,
    )
    return false
  }

  if (result === 'in-flight') {
    // No queueing, no Retry-After: the library answers immediately and lets the
    // client decide when to come back.
    answer(
      state,
      attempt,
      { status: 409, body: 'a request with this idempotency key is already in progress', replayed: false },
      'Conflict — already in progress',
    )
    return false
  }

  // Begun: claim the key and run the handler.
  state.store.push({
    key: attempt.key,
    state: 'in_flight',
    fingerprint: attempt.fingerprint,
    statusCode: null,
    body: null,
  })
  attempt.phase = 'processing'
  attempt.ticksLeft = state.config.processingTicks
  note(state, `${attempt.id} claimed ${attempt.key} → in_flight, handler running`)
  return true
}

export function advanceIdem(state: IdemState): IdemState {
  const next = structuredClone(state)
  next.tick++
  rngFor(next)

  // Attempts that finish transit this tick and are about to hit the middleware.
  const arriving: Attempt[] = []

  for (const attempt of next.attempts) {
    if (attempt.phase === 'in-transit') {
      attempt.ticksLeft--
      if (attempt.ticksLeft <= 0) arriving.push(attempt)
      continue
    }

    if (attempt.phase === 'processing') {
      attempt.ticksLeft--
      if (attempt.ticksLeft > 0) continue

      const entry = find(next, attempt.key)

      if (next.config.handlerFails) {
        // The middleware's deferred Release: the handler did not commit, so the
        // key is deleted rather than left claimed forever. A failed request
        // must not burn the key.
        if (entry) next.store = next.store.filter((e) => e.key !== attempt.key)
        answer(next, attempt, { status: 500, body: 'payment provider unavailable', replayed: false }, 'handler failed — key released, a retry can still succeed')
        continue
      }

      const charge: Charge = {
        id: `chg-${next.charges.length + 1}`,
        key: attempt.key,
        amount: attempt.amount,
        at: next.tick,
        byAttempt: attempt.id,
      }
      next.charges.push(charge)

      if (entry) {
        entry.state = 'completed'
        entry.statusCode = 201
        entry.body = charge.id
      }

      answer(next, attempt, { status: 201, body: charge.id, replayed: false }, `charged ${attempt.amount} TRY → ${charge.id}`)
      continue
    }
  }

  // The client stops waiting. The request is still running server-side — that
  // is the entire problem: a timeout tells the caller nothing about what
  // happened, only that it stopped hearing about it.
  for (const attempt of next.attempts) {
    if (attempt.phase !== 'processing' || attempt.timedOut) continue
    if (next.tick - attempt.sentAt >= next.config.clientTimeoutTicks) {
      attempt.timedOut = true
      note(next, `${attempt.id} client timed out — still running on the server`)
    }
  }

  if (arriving.length === 0) return next

  if (next.config.protection === 'none') {
    for (const attempt of arriving) {
      attempt.phase = 'processing'
      attempt.ticksLeft = next.config.processingTicks
      note(next, `${attempt.id} no idempotency key checked — handler running`)
    }
    return next
  }

  if (next.config.protection === 'read-then-write') {
    // The bug, made explicit: every arrival reads before any of them writes.
    // With one request per tick this is indistinguishable from the atomic
    // version — which is exactly why it survives testing and fails in
    // production, where two retries land in the same millisecond.
    const decisions = arriving.map((attempt) => [attempt, beginFor(next, attempt)] as const)
    for (const [attempt, result] of decisions) applyBegin(next, attempt, result)
    return next
  }

  // insert-on-conflict: the read and the claim are one statement, so each
  // arrival sees what the previous one just wrote.
  for (const attempt of arriving) applyBegin(next, attempt, beginFor(next, attempt))
  return next
}

/* Selectors. The UI derives nothing itself; it asks here. */

export const chargeCount = (state: IdemState): number => state.charges.length

export const chargesFor = (state: IdemState, key: string): Charge[] =>
  state.charges.filter((charge) => charge.key === key)

/** The headline defect: one order, more than one charge. */
export const doubleCharged = (state: IdemState): boolean =>
  state.charges.some((charge) => chargesFor(state, charge.key).length > 1)

export const totalCharged = (state: IdemState): string => {
  const total = state.charges.reduce((sum, charge) => sum + Number(charge.amount), 0)
  return total.toFixed(2)
}

export const responsesOf = (state: IdemState): Attempt[] =>
  state.attempts.filter((attempt) => attempt.phase === 'answered')

export const settled = (state: IdemState): boolean =>
  state.attempts.length > 0 && state.attempts.every((attempt) => attempt.phase === 'answered')
