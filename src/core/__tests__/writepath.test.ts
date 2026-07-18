import { describe, expect, it } from 'vitest'
import {
  checkConsistency,
  createWritePath,
  handleOrder,
  runRelay,
  type WritePathState,
} from '../writepath'
import { makeOrder } from '../scenario'
import { createRng } from '../prng'

const orders = (n: number) => {
  const rng = createRng(1041)
  return Array.from({ length: n }, (_, i) => makeOrder(rng, i))
}

const feed = (state: WritePathState, count: number): WritePathState => {
  let s = state
  orders(count).forEach((order) => {
    s = handleOrder(s, order)
  })
  return s
}

describe('dual-write', () => {
  it('is consistent when nothing goes wrong', () => {
    const s = feed(createWritePath('dual-write', 'none'), 5)
    expect(checkConsistency(s).consistent).toBe(true)
    expect(s.topic).toHaveLength(5)
  })

  it('loses the event when the process dies after the commit', () => {
    // The order is real, the rest of the system never hears about it.
    const s = feed(createWritePath('dual-write', 'after-db-commit'), 3)
    const verdict = checkConsistency(s)

    expect(verdict.consistent).toBe(false)
    expect(verdict.lost).toHaveLength(1)
    expect(verdict.phantom).toHaveLength(0)
    expect(s.db).toHaveLength(1)
    expect(s.topic).toHaveLength(0)
  })

  it('emits a phantom event when the transaction rolls back after publishing', () => {
    // The opposite ordering is not a fix — it just breaks the other way.
    const s = feed(createWritePath('dual-write', 'after-publish'), 3)
    const verdict = checkConsistency(s)

    expect(verdict.consistent).toBe(false)
    expect(verdict.phantom).toHaveLength(1)
    expect(verdict.lost).toHaveLength(0)
    expect(s.db).toHaveLength(0)
    expect(s.topic).toHaveLength(1)
  })

  it('has no relay to recover with', () => {
    const crashed = feed(createWritePath('dual-write', 'after-db-commit'), 2)
    const after = runRelay(runRelay(crashed))
    // Still lost. Nothing in the design can find it again.
    expect(checkConsistency(after).lost).toHaveLength(1)
  })

  it('stops accepting orders once the process is down', () => {
    const s = feed(createWritePath('dual-write', 'after-db-commit'), 4)
    expect(s.appCrashed).toBe(true)
    expect(s.db.length + s.topic.length).toBe(1)
  })
})

describe('outbox', () => {
  it('writes the order and the outbox row in one transaction', () => {
    const s = feed(createWritePath('outbox', 'none'), 3)
    expect(s.db).toHaveLength(3)
    expect(s.outbox).toHaveLength(3)
    // Nothing is published until the relay runs.
    expect(s.topic).toHaveLength(0)
  })

  it('delivers everything once the relay runs', () => {
    const s = runRelay(feed(createWritePath('outbox', 'none'), 3))
    expect(s.topic).toHaveLength(3)
    expect(checkConsistency(s).consistent).toBe(true)
    expect(s.outbox.every((row) => row.published)).toBe(true)
  })

  it('delays delivery across a crash but never loses it', () => {
    // The crash that destroys dual-write is survivable here: the relay is a
    // separate process and the outbox row is already durable.
    const crashed = feed(createWritePath('outbox', 'after-db-commit'), 3)
    expect(crashed.appCrashed).toBe(true)
    expect(checkConsistency(crashed).lost).toHaveLength(1)

    const recovered = runRelay(crashed)
    expect(checkConsistency(recovered).consistent).toBe(true)
  })

  it('never publishes an event for an order that is not in the database', () => {
    const s = runRelay(feed(createWritePath('outbox', 'after-db-commit'), 3))
    expect(checkConsistency(s).phantom).toHaveLength(0)
  })

  it('is idempotent — a second relay pass publishes nothing new', () => {
    const once = runRelay(feed(createWritePath('outbox', 'none'), 3))
    const twice = runRelay(once)
    expect(twice.topic).toHaveLength(3)
  })
})

describe('cdc', () => {
  it('publishes nothing until the relay tails the WAL', () => {
    const s = feed(createWritePath('cdc', 'none'), 3)
    expect(s.db).toHaveLength(3)
    expect(s.topic).toHaveLength(0)
    expect(s.outbox).toHaveLength(0)
  })

  it('derives events from committed rows', () => {
    const s = runRelay(feed(createWritePath('cdc', 'none'), 3))
    expect(s.topic).toHaveLength(3)
    expect(checkConsistency(s).consistent).toBe(true)
  })

  it('still emits the committed row after the app dies', () => {
    const s = runRelay(feed(createWritePath('cdc', 'after-db-commit'), 3))
    expect(checkConsistency(s).consistent).toBe(true)
  })

  it('is idempotent across passes', () => {
    const once = runRelay(feed(createWritePath('cdc', 'none'), 2))
    expect(runRelay(once).topic).toHaveLength(2)
  })
})

describe('checkConsistency', () => {
  it('calls an empty system consistent', () => {
    expect(checkConsistency(createWritePath()).consistent).toBe(true)
  })

  it('names the offending order ids', () => {
    const s = feed(createWritePath('dual-write', 'after-db-commit'), 2)
    expect(checkConsistency(s).lost[0]).toMatch(/^ord-/)
  })
})

describe('purity', () => {
  it('does not mutate the input state', () => {
    const before = createWritePath('outbox')
    const snapshot = structuredClone(before)
    handleOrder(before, orders(1)[0]!)
    runRelay(before)
    expect(before).toEqual(snapshot)
  })
})
