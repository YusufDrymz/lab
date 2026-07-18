/**
 * Section 5 — retries and dead letters.
 *
 * Kafka has no dead-letter queue. There is no broker feature here at all: the
 * retry chain is a convention teams build out of ordinary topics, which is
 * exactly why everyone builds it slightly differently and why it goes wrong.
 *
 * The chain modelled here is the common one:
 *
 *   orders -> orders.retry.5s -> orders.retry.1m -> orders.DLQ
 *
 * Two things this section exists to show:
 *
 *  1. A poison message does not just fail — on the main topic it blocks the
 *     partition behind it, because offsets advance in order. Moving it to a
 *     retry topic is what unblocks the queue.
 *  2. Replay is the dangerous half. Draining a DLQ back onto the main topic
 *     without checking why the messages failed is how an incident loops: the
 *     same poison goes round again, fails again, and lands right back.
 */
import type { OrderEvent } from './scenario'
import { TOPICS } from './scenario'

export type RetryTopic = (typeof TOPICS)[keyof typeof TOPICS]

export type Attempt = {
  at: number
  error: string
}

export type InFlightMessage = {
  event: OrderEvent
  topic: RetryTopic
  attempts: Attempt[]
  /** ticks before this message becomes eligible again (the backoff) */
  waitTicks: number
}

export type DeadLetter = {
  event: OrderEvent
  attempts: Attempt[]
  /** why it ended up here, taken from the final attempt */
  lastError: string
  deadAt: number
}

/**
 * The choice the section turns on.
 *
 *   retry-in-place  the consumer keeps retrying the failed record without
 *                   committing. Correct-looking, and it stalls the partition:
 *                   offsets advance in order, so every healthy message behind
 *                   the poison one waits too.
 *   retry-topic     the failed record is forwarded to a retry topic and the
 *                   offset is committed, so the main partition keeps flowing.
 */
export type RetryStrategy = 'retry-in-place' | 'retry-topic'

export type RetryConfig = {
  strategy: RetryStrategy
  /** backoff per hop, in ticks; the length of this list is the chain depth */
  backoff: number[]
  /** order_ids that always fail, however many times they are retried */
  poison: string[]
  /** probability a non-poison message fails a given attempt */
  transientFailureRate: number
  /** attempts allowed before a retry-in-place consumer gives up */
  maxInPlaceAttempts: number
}

export type RetryState = {
  tick: number
  config: RetryConfig
  /** messages currently somewhere in the chain */
  inFlight: InFlightMessage[]
  succeeded: OrderEvent[]
  dlq: DeadLetter[]
  /** messages blocked behind a poison message on the main topic */
  headOfLineBlocked: number
  events: string[]
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  strategy: 'retry-topic',
  // 5s and 1m, expressed in ticks at roughly 10 ticks per second of story time.
  backoff: [50, 600],
  poison: [],
  transientFailureRate: 0,
  maxInPlaceAttempts: 5,
}

export function createRetry(config: Partial<RetryConfig> = {}): RetryState {
  return {
    tick: 0,
    config: { ...DEFAULT_RETRY_CONFIG, ...config },
    inFlight: [],
    succeeded: [],
    dlq: [],
    headOfLineBlocked: 0,
    events: [],
  }
}

const note = (state: RetryState, text: string): void => {
  state.events.push(`t${state.tick} · ${text}`)
  if (state.events.length > 300) state.events.splice(0, state.events.length - 300)
}

/** The chain, derived from the configured backoff depth. */
export function chainFor(config: RetryConfig): RetryTopic[] {
  const hops: RetryTopic[] = [TOPICS.orders]
  if (config.backoff.length >= 1) hops.push(TOPICS.retry5s)
  if (config.backoff.length >= 2) hops.push(TOPICS.retry1m)
  hops.push(TOPICS.dlq)
  return hops
}

export function submit(state: RetryState, event: OrderEvent): RetryState {
  const next = structuredClone(state)
  next.inFlight.push({ event, topic: TOPICS.orders, attempts: [], waitTicks: 0 })
  note(next, `${event.order_id} arrived on ${TOPICS.orders}`)
  return next
}

function isPoison(state: RetryState, event: OrderEvent): boolean {
  return state.config.poison.includes(event.order_id)
}

/**
 * Decides whether one attempt fails. Poison always fails; transient failures
 * are derived from the message id and attempt count rather than a random
 * number, so a replayed run behaves identically.
 */
function attemptFails(state: RetryState, message: InFlightMessage): boolean {
  if (isPoison(state, message.event)) return true
  if (state.config.transientFailureRate <= 0) return false

  const seed = [...message.event.order_id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
  const roll = ((seed ^ Math.imul(message.attempts.length + 1, 0x9e3779b9)) >>> 8) / 0xffffff
  return (roll % 1) < state.config.transientFailureRate
}

function nextTopic(state: RetryState, current: RetryTopic): RetryTopic {
  const chain = chainFor(state.config)
  const index = chain.indexOf(current)
  return chain[Math.min(index + 1, chain.length - 1)] ?? TOPICS.dlq
}

export function advanceRetry(state: RetryState): RetryState {
  const next = structuredClone(state)
  next.tick++
  next.headOfLineBlocked = 0

  const stillInFlight: InFlightMessage[] = []
  let mainTopicBlocked = false

  for (const message of next.inFlight) {
    // Ordering: everything behind a stuck message on the main topic waits,
    // because a consumer cannot skip an offset it has not committed.
    if (mainTopicBlocked && message.topic === TOPICS.orders) {
      next.headOfLineBlocked++
      stillInFlight.push(message)
      continue
    }

    if (message.waitTicks > 0) {
      message.waitTicks--
      stillInFlight.push(message)
      continue
    }

    if (!attemptFails(next, message)) {
      next.succeeded.push(message.event)
      note(next, `${message.event.order_id} processed from ${message.topic}`)
      continue
    }

    const error = isPoison(next, message.event)
      ? 'invalid payload: currency not supported'
      : 'downstream timeout'
    message.attempts.push({ at: next.tick, error })

    // Retrying in place never commits the offset, so the record stays at the
    // head of the partition and everything behind it is stuck waiting.
    if (next.config.strategy === 'retry-in-place' && message.topic === TOPICS.orders) {
      if (message.attempts.length >= next.config.maxInPlaceAttempts) {
        next.dlq.push({
          event: message.event,
          attempts: message.attempts,
          lastError: error,
          deadAt: next.tick,
        })
        note(
          next,
          `${message.event.order_id} gave up after ${message.attempts.length} in-place attempts -> ${TOPICS.dlq}`,
        )
        note(next, 'the partition only moves again now')
        continue
      }

      mainTopicBlocked = true
      message.waitTicks = next.config.backoff[0] ?? 0
      note(
        next,
        `${message.event.order_id} failed on ${TOPICS.orders} (${error}) — retrying in place, attempt ${message.attempts.length}`,
      )
      stillInFlight.push(message)
      continue
    }

    const target = nextTopic(next, message.topic)

    if (target === TOPICS.dlq) {
      next.dlq.push({
        event: message.event,
        attempts: message.attempts,
        lastError: error,
        deadAt: next.tick,
      })
      note(
        next,
        `${message.event.order_id} exhausted the chain after ${message.attempts.length} attempts -> ${TOPICS.dlq}`,
      )
      continue
    }

    note(
      next,
      message.topic === TOPICS.orders
        ? `${message.event.order_id} failed (${error}) — forwarded to ${target}, offset committed, partition keeps flowing`
        : `${message.event.order_id} failed again on ${message.topic} -> ${target}`,
    )

    const hop = chainFor(next.config).indexOf(target) - 1
    message.topic = target
    message.waitTicks = next.config.backoff[hop] ?? 0
    stillInFlight.push(message)
  }

  next.inFlight = stillInFlight
  return next
}

export type ReplayOptions = {
  /** only replay dead letters whose last error matches */
  errorContains?: string
  /** report what would happen without touching anything */
  dryRun?: boolean
}

export type ReplayResult = {
  state: RetryState
  selected: DeadLetter[]
  /** selected messages that will simply die again, because nothing was fixed */
  willFailAgain: DeadLetter[]
}

/**
 * Replays dead letters back onto the main topic.
 *
 * The dry run exists because this is the one operation in the whole site that
 * can make an incident worse. Draining a DLQ full of poison back onto `orders`
 * re-runs every failure and refills the DLQ — and on the way it can block the
 * partition again for the traffic that was healthy.
 */
export function replay(state: RetryState, options: ReplayOptions = {}): ReplayResult {
  const matches = (letter: DeadLetter): boolean =>
    options.errorContains ? letter.lastError.includes(options.errorContains) : true

  const selected = state.dlq.filter(matches)
  const willFailAgain = selected.filter((letter) => state.config.poison.includes(letter.event.order_id))

  if (options.dryRun) {
    return { state, selected, willFailAgain }
  }

  const next = structuredClone(state)
  // Re-select against the clone: structuredClone breaks object identity, so
  // filtering `next.dlq` by `selected.includes(...)` would silently match
  // nothing and leave every replayed letter sitting in the DLQ as well.
  const moving = next.dlq.filter(matches)
  next.dlq = next.dlq.filter((letter) => !matches(letter))
  for (const letter of moving) {
    next.inFlight.push({
      event: letter.event,
      topic: TOPICS.orders,
      // Attempt history is carried over, so a replayed message that dies again
      // is visibly on its second lap rather than looking brand new.
      attempts: letter.attempts,
      waitTicks: 0,
    })
  }
  note(next, `replayed ${selected.length} dead letters onto ${TOPICS.orders}`)
  if (willFailAgain.length > 0) {
    note(next, `WARNING: ${willFailAgain.length} of them still fail — nothing was fixed`)
  }

  return { state: next, selected, willFailAgain }
}
