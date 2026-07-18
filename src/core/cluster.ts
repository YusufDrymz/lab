/**
 * The simulation core.
 *
 * Two rules hold everywhere in this file:
 *
 *  1. `advance` is pure: `advance(state) -> state`. It never touches the clock,
 *     the DOM, or Math.random. The UI drives it from requestAnimationFrame, but
 *     the model has no idea time exists outside of `state.tick`.
 *  2. Randomness comes from a seed folded with the tick number, so replaying a
 *     run from tick 0 reproduces it exactly — including the failures.
 *
 * Everything the reader is meant to notice (a lost message, a duplicate, a
 * stalled group) is emitted into `state.events` rather than inferred by the UI,
 * so the narration and the picture can never disagree.
 */
import { createRng, type Rng } from './prng'
import { partitionForKey } from './partition'
import { makeOrder, type OrderEvent } from './scenario'

// ---------------------------------------------------------------- data model

export type LogRecord = {
  offset: number
  key: string
  value: OrderEvent
  /** tick at which the producer appended this record */
  producedAt: number
}

export type Partition = {
  index: number
  records: LogRecord[]
}

/**
 * How a consumer commits its offset. This single choice is the entire
 * difference between at-most-once and at-least-once, which is section 4.
 */
export type CommitMode = 'before-processing' | 'after-processing'

/** Eager stops the world; cooperative only revokes what actually moves. */
export type RebalanceStrategy = 'eager' | 'cooperative'

export type Processing = {
  partition: number
  offset: number
  ticksLeft: number
}

export type Consumer = {
  id: string
  alive: boolean
  /** partitions currently owned by this consumer */
  assigned: number[]
  /** next offset this consumer will read, per partition */
  position: Record<number, number>
  processing: Processing | null
}

export type Group = {
  id: string
  strategy: RebalanceStrategy
  commitMode: CommitMode
  consumers: Consumer[]
  /** committed offset per partition — survives consumer death, unlike position */
  committed: Record<number, number>
  /**
   * Ticks remaining in a rebalance. While this is above zero an eager group
   * processes nothing at all; that stall is the thing worth seeing.
   */
  rebalanceTicksLeft: number
  rebalanceCount: number
}

export type SimEvent = {
  tick: number
  kind:
    | 'produced'
    | 'processed'
    | 'consumer-died'
    | 'consumer-joined'
    | 'rebalance-started'
    | 'rebalance-finished'
    | 'message-lost'
    | 'message-duplicated'
  text: string
  /** set when the event concerns one specific record */
  ref?: { partition: number; offset: number }
}

export type SimConfig = {
  seed: number
  partitionCount: number
  /** produce one order every N ticks; 0 disables the producer */
  produceEveryTicks: number
  /** ticks a consumer needs to handle one record */
  processingTicks: number
  /** ticks an eager rebalance takes to settle */
  rebalanceTicks: number
  /** weight the producer towards one customer, creating a hot partition */
  skewed: boolean
}

export type SimState = {
  tick: number
  config: SimConfig
  partitions: Partition[]
  group: Group
  /** monotonic counter feeding order_id, independent of partition offsets */
  produced: number
  events: SimEvent[]
  /**
   * Offsets that were handed to a consumer that then died before committing.
   * Section 4 reads this to say "this one ran twice" out loud.
   */
  reprocessed: string[]
}

// ------------------------------------------------------------------ creation

export const DEFAULT_CONFIG: SimConfig = {
  seed: 1041,
  partitionCount: 3,
  produceEveryTicks: 6,
  processingTicks: 4,
  rebalanceTicks: 12,
  skewed: false,
}

export function createConsumer(id: string): Consumer {
  return { id, alive: true, assigned: [], position: {}, processing: null }
}

export function createSim(
  config: Partial<SimConfig> = {},
  consumerIds: string[] = ['consumer-1'],
): SimState {
  const merged: SimConfig = { ...DEFAULT_CONFIG, ...config }

  const state: SimState = {
    tick: 0,
    config: merged,
    partitions: Array.from({ length: merged.partitionCount }, (_, index) => ({
      index,
      records: [],
    })),
    group: {
      id: 'payment-service',
      strategy: 'eager',
      commitMode: 'after-processing',
      consumers: consumerIds.map(createConsumer),
      committed: {},
      rebalanceTicksLeft: 0,
      rebalanceCount: 0,
    },
    produced: 0,
    events: [],
    reprocessed: [],
  }

  // A fresh group always rebalances once to hand out its first assignment.
  assign(state)
  return state
}

// ----------------------------------------------------------------- internals

/**
 * Randomness is derived, not carried. Folding the tick into the seed keeps
 * `advance` pure while still giving each tick its own stream.
 */
function rngFor(state: SimState): Rng {
  return createRng((state.config.seed ^ Math.imul(state.tick + 1, 0x9e3779b9)) >>> 0)
}

function log(state: SimState, event: Omit<SimEvent, 'tick'>): void {
  state.events.push({ tick: state.tick, ...event })
  // The UI only ever renders the tail; an unbounded log would leak memory in a
  // tab left open on the sandbox.
  if (state.events.length > 400) state.events.splice(0, state.events.length - 400)
}

function aliveConsumers(group: Group): Consumer[] {
  return group.consumers.filter((c) => c.alive)
}

/**
 * Round-robin partition assignment across live consumers.
 *
 * Real Kafka offers range, round-robin, sticky and cooperative-sticky. We model
 * round-robin because it makes the "more consumers than partitions" case
 * obvious: the extra consumers simply get an empty list and sit idle, which is
 * exactly the lesson of section 2.
 */
export function assign(state: SimState): void {
  const group = state.group
  const live = aliveConsumers(group)

  for (const consumer of group.consumers) consumer.assigned = []
  if (live.length === 0) return

  for (let partition = 0; partition < state.partitions.length; partition++) {
    const owner = live[partition % live.length]!
    owner.assigned.push(partition)
  }

  // A consumer resumes from the group's committed offset, never from whatever
  // it had read before. This is why uncommitted work is repeated after a crash.
  for (const consumer of live) {
    for (const partition of consumer.assigned) {
      if (consumer.position[partition] === undefined) {
        consumer.position[partition] = group.committed[partition] ?? 0
      }
    }
  }
}

function startRebalance(state: SimState, reason: string): void {
  const group = state.group
  group.rebalanceCount++
  log(state, { kind: 'rebalance-started', text: `Rebalance triggered: ${reason}` })

  if (group.strategy === 'eager') {
    // Stop-the-world: every consumer drops everything, including work in
    // progress, and nothing is processed until the group settles.
    for (const consumer of group.consumers) {
      consumer.assigned = []
      consumer.position = {}
      consumer.processing = null
    }
    group.rebalanceTicksLeft = state.config.rebalanceTicks
    return
  }

  // Cooperative: keep processing, recompute ownership, and only give up the
  // partitions that actually changed hands.
  const before = new Map(group.consumers.map((c) => [c.id, new Set(c.assigned)]))
  assign(state)
  for (const consumer of group.consumers) {
    const kept = before.get(consumer.id) ?? new Set<number>()
    for (const partition of Object.keys(consumer.position).map(Number)) {
      if (!consumer.assigned.includes(partition)) delete consumer.position[partition]
    }
    if (consumer.processing && !consumer.assigned.includes(consumer.processing.partition)) {
      consumer.processing = null
    }
    void kept
  }
  group.rebalanceTicksLeft = 0
  log(state, {
    kind: 'rebalance-finished',
    text: 'Cooperative rebalance: only the moved partitions were revoked',
  })
}

function produce(state: SimState, rng: Rng): void {
  const { produceEveryTicks, skewed } = state.config
  if (produceEveryTicks <= 0) return
  if (state.tick % produceEveryTicks !== 0) return

  const order = makeOrder(rng, state.produced, { skew: skewed })
  state.produced++
  append(state, order)
}

/** Appends an order to the partition its key routes to. */
export function append(state: SimState, order: OrderEvent): LogRecord {
  const index = partitionForKey(order.customer_id, state.partitions.length)
  const partition = state.partitions[index]!
  const record: LogRecord = {
    offset: partition.records.length,
    key: order.customer_id,
    value: order,
    producedAt: state.tick,
  }
  partition.records.push(record)
  log(state, {
    kind: 'produced',
    text: `${order.order_id} (${order.customer_id}) -> partition ${index}`,
    ref: { partition: index, offset: record.offset },
  })
  return record
}

function consume(state: SimState): void {
  const group = state.group

  for (const consumer of aliveConsumers(group)) {
    if (consumer.processing) {
      consumer.processing.ticksLeft--
      if (consumer.processing.ticksLeft > 0) continue

      const { partition, offset } = consumer.processing
      consumer.processing = null

      if (group.commitMode === 'after-processing') {
        // at-least-once: the work is done, only now do we commit. A crash
        // between these two moments repeats the record.
        group.committed[partition] = offset + 1
      }
      log(state, {
        kind: 'processed',
        text: `${consumer.id} processed partition ${partition} @ ${offset}`,
        ref: { partition, offset },
      })
      continue
    }

    // Nothing in flight — try to fetch the next record.
    for (const partition of consumer.assigned) {
      const position = consumer.position[partition] ?? 0
      const record = state.partitions[partition]?.records[position]
      if (!record) continue

      consumer.position[partition] = position + 1
      consumer.processing = {
        partition,
        offset: record.offset,
        ticksLeft: state.config.processingTicks,
      }

      if (group.commitMode === 'before-processing') {
        // at-most-once: we commit before we know whether the work succeeds. A
        // crash now loses the record permanently — nobody will read it again.
        group.committed[partition] = record.offset + 1
      }
      break
    }
  }
}

// -------------------------------------------------------------------- public

/** One simulation step. Pure with respect to everything outside `state`. */
export function advance(state: SimState): SimState {
  const next = structuredClone(state)
  next.tick++

  const group = next.group

  if (group.rebalanceTicksLeft > 0) {
    group.rebalanceTicksLeft--
    if (group.rebalanceTicksLeft === 0) {
      assign(next)
      log(next, {
        kind: 'rebalance-finished',
        text: 'Group is stable again — processing resumes',
      })
    }
    // An eager rebalance still accepts writes; producers do not care that the
    // consumer group is stuck. That growing lag is the point.
    produce(next, rngFor(next))
    return next
  }

  produce(next, rngFor(next))
  consume(next)
  return next
}

/** Kills a consumer, the way section 3 and 4 want the reader to. */
export function killConsumer(state: SimState, consumerId: string): SimState {
  const next = structuredClone(state)
  const consumer = next.group.consumers.find((c) => c.id === consumerId)
  if (!consumer || !consumer.alive) return next

  consumer.alive = false
  log(next, { kind: 'consumer-died', text: `${consumerId} died` })

  // Whatever it was holding decides between loss and duplication.
  if (consumer.processing) {
    const { partition, offset } = consumer.processing
    if (next.group.commitMode === 'before-processing') {
      log(next, {
        kind: 'message-lost',
        text: `partition ${partition} @ ${offset} was committed but never processed — it is gone`,
        ref: { partition, offset },
      })
    } else {
      next.reprocessed.push(`${partition}:${offset}`)
      log(next, {
        kind: 'message-duplicated',
        text: `partition ${partition} @ ${offset} was processed but not committed — someone will run it again`,
        ref: { partition, offset },
      })
    }
  }
  consumer.processing = null

  startRebalance(next, `${consumerId} left the group`)
  return next
}

export function addConsumer(state: SimState, consumerId: string): SimState {
  const next = structuredClone(state)
  if (next.group.consumers.some((c) => c.id === consumerId)) return next
  next.group.consumers.push(createConsumer(consumerId))
  log(next, { kind: 'consumer-joined', text: `${consumerId} joined the group` })
  startRebalance(next, `${consumerId} joined the group`)
  return next
}

/** Records written minus records committed, per partition — the lag panel. */
export function lagByPartition(state: SimState): number[] {
  return state.partitions.map(
    (partition) => partition.records.length - (state.group.committed[partition.index] ?? 0),
  )
}

export function totalLag(state: SimState): number {
  return lagByPartition(state).reduce((sum, lag) => sum + lag, 0)
}

/** True while an eager rebalance is holding the whole group still. */
export function isStalled(state: SimState): boolean {
  return state.group.rebalanceTicksLeft > 0
}
