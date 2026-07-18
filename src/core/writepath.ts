/**
 * Section 0 — where does the data actually come from?
 *
 * Every other section takes the producer for granted. This one does not,
 * because the most expensive Kafka mistake in production happens before a
 * single byte reaches a broker: the database and the log are two systems, and
 * writing to both is not atomic.
 *
 * Modelled here as three strategies over the same crash:
 *
 *   dual-write  the app commits to Postgres, then publishes. Crash in between
 *               and the order exists with nobody informed. Publish first and
 *               roll back instead, and an event describes an order that never
 *               existed. Both directions are broken.
 *   outbox      the order row and an outbox row are written in ONE transaction,
 *               so atomicity is the database's problem. A separate relay drains
 *               the outbox. A crash delays delivery; it never loses it.
 *   cdc         no outbox table at all — the relay tails Postgres' WAL and
 *               derives events from committed rows. The app never knows Kafka
 *               exists.
 *
 * Redis is deliberately absent, and that is the point: Redis is a cache, a lock
 * or a short-lived queue. It is not the source of a durable event log and
 * putting it on this path buys nothing but another system to lose writes in.
 */
import type { OrderEvent } from './scenario'

export type WriteStrategy = 'dual-write' | 'outbox' | 'cdc'

/** Where in the write path the process is killed. */
export type CrashPoint =
  | 'none'
  /** after the DB transaction commits, before the broker acknowledges */
  | 'after-db-commit'
  /** after the broker acknowledges, before the DB transaction commits */
  | 'after-publish'

export type OutboxRow = {
  id: number
  event: OrderEvent
  published: boolean
}

export type WritePathState = {
  tick: number
  strategy: WriteStrategy
  crashAt: CrashPoint
  /** committed order rows */
  db: OrderEvent[]
  /** only used by the outbox strategy */
  outbox: OutboxRow[]
  /** records that made it to the topic */
  topic: OrderEvent[]
  /** true once the app process has died; the relay keeps running */
  appCrashed: boolean
  events: string[]
}

export function createWritePath(
  strategy: WriteStrategy = 'dual-write',
  crashAt: CrashPoint = 'none',
): WritePathState {
  return {
    tick: 0,
    strategy,
    crashAt,
    db: [],
    outbox: [],
    topic: [],
    appCrashed: false,
    events: [],
  }
}

const note = (state: WritePathState, text: string): void => {
  state.events.push(`t${state.tick} · ${text}`)
}

/**
 * Handles one incoming order. Returns a new state; the caller decides when to
 * crash by having set `crashAt`.
 */
export function handleOrder(state: WritePathState, order: OrderEvent): WritePathState {
  const next = structuredClone(state)
  next.tick++

  if (next.appCrashed) {
    note(next, `${order.order_id} never reached the app — the process is down`)
    return next
  }

  switch (next.strategy) {
    case 'dual-write':
      return dualWrite(next, order)
    case 'outbox':
      return outboxWrite(next, order)
    case 'cdc':
      return cdcWrite(next, order)
  }
}

function dualWrite(state: WritePathState, order: OrderEvent): WritePathState {
  if (state.crashAt === 'after-publish') {
    // Publish-first ordering: the event escapes, then the transaction rolls
    // back. Downstream services now act on an order that does not exist.
    state.topic.push(order)
    note(state, `${order.order_id} published to orders`)
    state.appCrashed = true
    note(state, 'process died before COMMIT — transaction rolled back')
    note(state, `PHANTOM: ${order.order_id} is on the topic but not in the database`)
    return state
  }

  state.db.push(order)
  note(state, `${order.order_id} committed to orders table`)

  if (state.crashAt === 'after-db-commit') {
    state.appCrashed = true
    note(state, 'process died before publish')
    note(state, `LOST: ${order.order_id} exists in the database, no event was ever emitted`)
    return state
  }

  state.topic.push(order)
  note(state, `${order.order_id} published to orders`)
  return state
}

function outboxWrite(state: WritePathState, order: OrderEvent): WritePathState {
  // One transaction, two rows. Either both land or neither does.
  state.db.push(order)
  state.outbox.push({ id: state.outbox.length + 1, event: order, published: false })
  note(state, `${order.order_id} + outbox row committed in one transaction`)

  if (state.crashAt === 'after-db-commit') {
    state.appCrashed = true
    note(state, 'process died before the relay ran')
    note(state, `SAFE: ${order.order_id} is queued in the outbox — delivery is delayed, not lost`)
    return state
  }

  return state
}

function cdcWrite(state: WritePathState, order: OrderEvent): WritePathState {
  // The app writes its own table and nothing else. No outbox, no producer.
  state.db.push(order)
  note(state, `${order.order_id} committed — the app does not know Kafka exists`)

  if (state.crashAt === 'after-db-commit') {
    state.appCrashed = true
    note(state, 'process died — the WAL already has the commit, so CDC will still emit it')
  }
  return state
}

/**
 * One pass of the background relay. Runs independently of the app process,
 * which is exactly why it survives the crash that breaks dual-write.
 */
export function runRelay(state: WritePathState): WritePathState {
  const next = structuredClone(state)
  next.tick++

  if (next.strategy === 'outbox') {
    const pending = next.outbox.filter((row) => !row.published)
    if (pending.length === 0) {
      note(next, 'relay: outbox is empty')
      return next
    }
    for (const row of pending) {
      row.published = true
      next.topic.push(row.event)
      note(next, `relay: published ${row.event.order_id} and marked the outbox row done`)
    }
    return next
  }

  if (next.strategy === 'cdc') {
    // The WAL is the source of truth; anything committed but not yet emitted
    // gets picked up on the next pass.
    const emitted = new Set(next.topic.map((e) => e.order_id))
    const pending = next.db.filter((order) => !emitted.has(order.order_id))
    if (pending.length === 0) {
      note(next, 'cdc: caught up with the WAL')
      return next
    }
    for (const order of pending) {
      next.topic.push(order)
      note(next, `cdc: derived an event for ${order.order_id} from the WAL`)
    }
    return next
  }

  note(next, 'dual-write has no relay — that is the whole problem')
  return next
}

/**
 * The verdict the section is built around: is the database consistent with the
 * topic once the dust settles?
 */
export type Consistency = {
  consistent: boolean
  /** in the database, never announced */
  lost: string[]
  /** announced, never in the database */
  phantom: string[]
}

export function checkConsistency(state: WritePathState): Consistency {
  const inDb = new Set(state.db.map((o) => o.order_id))
  const onTopic = new Set(state.topic.map((o) => o.order_id))

  const lost = [...inDb].filter((id) => !onTopic.has(id))
  const phantom = [...onTopic].filter((id) => !inDb.has(id))

  return { consistent: lost.length === 0 && phantom.length === 0, lost, phantom }
}
