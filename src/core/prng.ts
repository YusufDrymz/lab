/**
 * Seeded PRNG. Every simulation must be reproducible: the same seed replays
 * the exact same incident, so a reader can hit "restart" and see what they
 * just missed. Math.random() is never used anywhere in the core.
 */
export type Rng = {
  /** float in [0, 1) */
  next(): number
  /** integer in [0, maxExclusive) */
  int(maxExclusive: number): number
  /** picks one element; throws on an empty list rather than returning undefined */
  pick<T>(items: readonly T[]): T
  /** true with the given probability */
  chance(probability: number): boolean
}

/** mulberry32 — small, fast, good enough for visual simulation. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() on an empty list')
      return items[Math.floor(next() * items.length)]!
    },
    chance: (probability) => next() < probability,
  }
}
