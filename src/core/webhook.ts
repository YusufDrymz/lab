/**
 * The webhook inbox — what hookkeep is for.
 *
 * A provider (Stripe, in the story this tells) emits an event and expects a 2xx
 * quickly. Your endpoint is slow, or down, or was restarted mid-request. The
 * provider retries a handful of times and then stops caring. The question the
 * whole simulation exists to answer is: at that point, where is the event?
 *
 * Two invariants, same as every other model here:
 *
 *  1. `advanceInbox(state) -> state` is pure. No clock, no DOM, no Math.random.
 *  2. Randomness comes from folding the seed with the tick, so a rerun of the
 *     same seed produces the same incident.
 *
 * Names are taken from hookkeep's own schema rather than invented for the
 * simulation, because a reader who goes on to run the real thing should
 * recognise what they are looking at. In particular there are *two* independent
 * status axes, and confusing them is a real source of production confusion:
 *
 *   events.verify_status      verified | rejected | unverified
 *   deliveries.status         pending | retrying | inflight | delivered | dead
 *
 * A rejected event has no delivery row at all — modelled here as `delivery:
 * null`. It is stored, and it is never sent anywhere.
 */
import { createRng, type Rng } from './prng'

/**
 * What the receiving endpoint is doing right now. The reader flips this.
 *
 *   up    responds promptly
 *   slow  responds, eventually — long enough that some attempts time out
 *   down  refuses the connection
 */
export type EndpointHealth = 'up' | 'slow' | 'down'

/**
 * The choice section 1 turns on.
 *
 *   persist-first   the raw body and headers are written to Postgres before
 *                   anything else happens. If that write fails the provider
 *                   gets a 500 — never a fake 200. Delivery happens afterwards,
 *                   from the stored record.
 *   forward-first   the event is forwarded to the endpoint and only written
 *                   down once that succeeds, with the provider acked up front
 *                   so it stops retrying. A crash mid-flight loses the event
 *                   permanently, and the provider's dashboard says 200.
 *
 * Only the first of these is what hookkeep does. The second exists so the
 * reader can break it on purpose.
 */
export type WriteMode = 'persist-first' | 'forward-first'

/** `events.verify_status` in the real schema. */
export type VerifyStatus =
  | 'verified'
  /** signature did not check out — kept as evidence, never enqueued */
  | 'rejected'
  /** no verifier configured for this source; accepted as-is */
  | 'unverified'

/** `deliveries.status` in the real schema. */
export type DeliveryStatus =
  /** enqueued, never attempted */
  | 'pending'
  /** attempted and failed; waiting out its backoff */
  | 'retrying'
  /** claimed by a worker, attempt in flight */
  | 'inflight'
  | 'delivered'
  /** attempts exhausted; still stored, still replayable */
  | 'dead'

/** `deliveries.kind` — whether this delivery came from ingest or from a replay. */
export type DeliveryKind = 'initial' | 'replay'

export type AttemptOutcome = 'ok' | 'timeout' | 'refused'

export type Attempt = {
  at: number
  outcome: AttemptOutcome
  /** the HTTP status, or 0 when nothing answered at all */
  status: number
}

export type WebhookEvent = {
  /** provider-assigned id — travels as `X-Hookkeep-Event-Id` so consumers can dedupe */
  id: string
  /** the provider's event type, e.g. payment_intent.succeeded */
  type: string
  receivedAt: number
  verifyStatus: VerifyStatus
  /** why verification failed, when it did */
  verifyReason: string | null
  /**
   * The delivery row, or null when there is none. Rejected events never get
   * one: they are evidence, not work.
   */
  delivery: DeliveryStatus | null
  deliveryKind: DeliveryKind
  attempts: Attempt[]
  /** ticks until this event is eligible for another attempt (the backoff) */
  waitTicks: number
  /**
   * Whether the raw body exists in hookkeep's own Postgres. This is the whole
   * argument: an event that is stored can be replayed weeks later, and an event
   * that is not is gone the moment the process dies.
   */
  stored: boolean
  /** whether the provider has been told 2xx and has stopped retrying */
  providerAcked: boolean
  replayedAt: number | null
}

export type InboxConfig = {
  seed: number
  mode: WriteMode
  health: EndpointHealth
  /**
   * Attempts before the delivery is marked dead. hookkeep's shipped default is
   * 10; the simulation uses a smaller number so the reader can watch a delivery
   * exhaust itself without waiting all day.
   */
  maxAttempts: number
  /** first backoff, in ticks; doubles per attempt, jittered, then capped */
  baseBackoff: number
  /** the cap — the real config calls this backoff.max */
  maxBackoff: number
  /** ticks between provider deliveries */
  arrivalEvery: number
  /** every Nth arriving event carries a bad signature; 0 disables */
  badSignatureEvery: number
  /** whether a verifier is configured for this source at all */
  verifySignatures: boolean
}

export type InboxState = {
  tick: number
  config: InboxConfig
  events: WebhookEvent[]
  /**
   * Events that were acked to the provider and then lost to a crash. The
   * provider will never send them again; nobody is coming to fix this.
   */
  lost: number
  nextId: number
  log: string[]
}

export const DEFAULT_INBOX_CONFIG: InboxConfig = {
  seed: 20260718,
  mode: 'persist-first',
  health: 'up',
  maxAttempts: 5,
  baseBackoff: 8,
  maxBackoff: 160,
  arrivalEvery: 14,
  badSignatureEvery: 0,
  verifySignatures: true,
}

const EVENT_TYPES = [
  'payment_intent.succeeded',
  'charge.refunded',
  'invoice.paid',
  'customer.subscription.updated',
] as const

export function createInbox(config: Partial<InboxConfig> = {}): InboxState {
  return {
    tick: 0,
    config: { ...DEFAULT_INBOX_CONFIG, ...config },
    events: [],
    lost: 0,
    nextId: 1,
    log: [],
  }
}

/**
 * Randomness is derived, never stored. Folding the tick into the seed means the
 * same run replays identically without threading an Rng through the state.
 */
function rngFor(state: InboxState): Rng {
  return createRng((state.config.seed ^ Math.imul(state.tick + 1, 0x9e3779b9)) >>> 0)
}

const note = (state: InboxState, text: string): void => {
  state.log.push(`t${state.tick} · ${text}`)
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300)
}

/**
 * Exponential backoff with jitter, capped — `base * 2^(attempt-1)`, ±20%.
 *
 * The jitter is not decoration. Without it, every delivery that failed during
 * the same outage retries at the same instant, and the endpoint that just came
 * back up gets the entire backlog as one spike — so it goes down again, and the
 * fleet has synchronised itself into a loop.
 */
export function backoffFor(config: InboxConfig, attempt: number, rng: Rng): number {
  const base = config.baseBackoff * 2 ** Math.max(0, attempt - 1)
  const jitter = 0.8 + rng.next() * 0.4
  return Math.max(1, Math.min(config.maxBackoff, Math.round(base * jitter)))
}

/** One delivery attempt against the endpoint, given how it is behaving. */
function attemptOutcome(health: EndpointHealth, rng: Rng): AttemptOutcome {
  if (health === 'down') return 'refused'
  // A slow endpoint is the awkward case: it usually answers, and the attempts
  // that do not are the ones that leave you unsure whether it processed them.
  if (health === 'slow') return rng.chance(0.55) ? 'timeout' : 'ok'
  return 'ok'
}

function statusFor(outcome: AttemptOutcome): number {
  if (outcome === 'ok') return 200
  if (outcome === 'timeout') return 504
  return 0
}

/** The provider hands a new event to hookkeep. */
function receive(state: InboxState): void {
  const rng = rngFor(state)
  const id = `evt_${String(state.nextId).padStart(4, '0')}`
  const ordinal = state.nextId
  state.nextId++

  const forged =
    state.config.badSignatureEvery > 0 && ordinal % state.config.badSignatureEvery === 0

  const event: WebhookEvent = {
    id,
    type: rng.pick(EVENT_TYPES),
    receivedAt: state.tick,
    verifyStatus: 'verified',
    verifyReason: null,
    delivery: 'pending',
    deliveryKind: 'initial',
    attempts: [],
    waitTicks: 0,
    // This single line is the difference between the two modes. Persist-first
    // writes before acking; forward-first has nothing on disk yet.
    stored: state.config.mode === 'persist-first',
    providerAcked: true,
    replayedAt: null,
  }

  if (!state.config.verifySignatures) {
    // No verifier configured for this source. Accepted, but hookkeep records
    // that nobody proved where it came from.
    event.verifyStatus = 'unverified'
    state.events.push(event)
    note(state, `${id} accepted unverified — no verifier configured for this source`)
    return
  }

  if (forged) {
    // Stored, because a forged event is evidence and you will want it during
    // the incident review. No delivery row, because it is not from the provider.
    event.verifyStatus = 'rejected'
    event.verifyReason = 'signature mismatch'
    event.delivery = null
    event.stored = true
    event.providerAcked = false // the caller got a 401, not a 200
    state.events.push(event)
    note(state, `${id} signature mismatch — 401, stored as rejected, no delivery row`)
    return
  }

  state.events.push(event)
  note(
    state,
    state.config.mode === 'persist-first'
      ? `${id} received — body written to Postgres, then acked 200`
      : `${id} received — acked 200, nothing written yet`,
  )
}

export function advanceInbox(state: InboxState): InboxState {
  const next = structuredClone(state)
  next.tick++

  if (next.tick % next.config.arrivalEvery === 0) receive(next)

  const rng = rngFor(next)

  for (const event of next.events) {
    if (event.delivery !== 'pending' && event.delivery !== 'retrying') continue

    if (event.waitTicks > 0) {
      event.waitTicks--
      continue
    }

    const outcome = attemptOutcome(next.config.health, rng)
    event.attempts.push({ at: next.tick, outcome, status: statusFor(outcome) })

    if (outcome === 'ok') {
      event.delivery = 'delivered'
      // In forward-first the write happens only now, which is precisely why a
      // crash before this line is unrecoverable.
      event.stored = true
      note(next, `${event.id} delivered 200 on attempt ${event.attempts.length}`)
      continue
    }

    if (event.attempts.length >= next.config.maxAttempts) {
      event.delivery = 'dead'
      note(
        next,
        `${event.id} exhausted ${event.attempts.length} attempts -> dead (still stored, still replayable)`,
      )
      continue
    }

    event.delivery = 'retrying'
    event.waitTicks = backoffFor(next.config, event.attempts.length, rng)
    note(
      next,
      `${event.id} attempt ${event.attempts.length} ${outcome} — next attempt in ${event.waitTicks} ticks`,
    )
  }

  return next
}

/**
 * The process dies. A deploy, an OOM kill, a node draining — it does not matter
 * which; what matters is what survives it.
 *
 * Anything already written to Postgres comes back and carries on: an `inflight`
 * delivery is reclaimed and retried, which in the real system is what the
 * `claimed_at` index is for. Anything that only existed in memory is gone, and
 * because the provider was already acked, it is gone for good.
 */
export function crash(state: InboxState): InboxState {
  const next = structuredClone(state)
  const survivors: WebhookEvent[] = []
  let lost = 0

  for (const event of next.events) {
    if (event.stored) {
      if (event.delivery === 'inflight') event.delivery = 'retrying'
      survivors.push(event)
      continue
    }
    lost++
  }

  next.events = survivors
  next.lost += lost
  note(next, 'process restarted')
  note(
    next,
    lost > 0
      ? `${lost} event(s) lost — never written down, and the provider already got its 200`
      : 'nothing lost — every event was on disk before the provider was acked',
  )
  return next
}

export function setHealth(state: InboxState, health: EndpointHealth): InboxState {
  const next = structuredClone(state)
  next.config.health = health
  note(next, `endpoint is ${health}`)
  return next
}

export type ReplayOptions = {
  /** only replay events received at or after this tick — the CLI's --from */
  since?: number
  /** report what would be replayed without touching anything */
  dryRun?: boolean
}

export type ReplayResult = {
  state: InboxState
  selected: WebhookEvent[]
}

/**
 * Replay dead deliveries.
 *
 * This is the payoff of persisting first. The provider gave up on these events
 * days ago and will not send them again — the only reason they can be recovered
 * at all is that the record is *yours*.
 *
 * Rejected events are deliberately not eligible. A range replay skips them,
 * because acting on a payload nobody could prove came from the provider is not
 * something an operator should do by accident. (The real CLI does allow
 * replaying one by id, as an explicit decision.)
 */
export function replayDead(state: InboxState, options: ReplayOptions = {}): ReplayResult {
  const matches = (event: WebhookEvent): boolean =>
    event.delivery === 'dead' && (options.since === undefined || event.receivedAt >= options.since)

  const selected = state.events.filter(matches)
  if (options.dryRun) return { state, selected }

  const next = structuredClone(state)
  // Re-select against the clone: structuredClone breaks object identity, so
  // matching by reference here would quietly replay nothing.
  for (const event of next.events) {
    if (!matches(event)) continue
    event.delivery = 'pending'
    event.deliveryKind = 'replay'
    event.waitTicks = 0
    event.replayedAt = next.tick
  }

  note(next, `replayed ${selected.length} dead delivery(ies)`)
  if (selected.length > 0 && next.config.health !== 'up') {
    note(next, `WARNING: endpoint is ${next.config.health} — these will just die again`)
  }
  return { state: next, selected }
}

/* Selectors. The UI derives nothing itself; it asks here. */

export const countByDelivery = (state: InboxState, status: DeliveryStatus): number =>
  state.events.filter((event) => event.delivery === status).length

export const deliveredCount = (state: InboxState): number => countByDelivery(state, 'delivered')
export const deadCount = (state: InboxState): number => countByDelivery(state, 'dead')

export const rejectedCount = (state: InboxState): number =>
  state.events.filter((event) => event.verifyStatus === 'rejected').length

/** Events the provider believes it delivered but that no longer exist anywhere. */
export const lostCount = (state: InboxState): number => state.lost

/**
 * The gap the whole page is about: acked to the provider, but not on disk. In
 * persist-first this is always zero, and that is the point.
 */
export const atRiskCount = (state: InboxState): number =>
  state.events.filter((event) => event.providerAcked && !event.stored).length
