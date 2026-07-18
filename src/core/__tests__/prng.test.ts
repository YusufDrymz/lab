import { describe, expect, it } from 'vitest'
import { createRng } from '../prng'

describe('createRng', () => {
  it('replays the identical stream for a given seed', () => {
    const a = createRng(1041)
    const b = createRng(1041)
    const left = Array.from({ length: 100 }, () => a.next())
    const right = Array.from({ length: 100 }, () => b.next())
    expect(left).toEqual(right)
  })

  it('produces different streams for different seeds', () => {
    const a = Array.from({ length: 20 }, ((r) => () => r.next())(createRng(1)))
    const b = Array.from({ length: 20 }, ((r) => () => r.next())(createRng(2)))
    expect(a).not.toEqual(b)
  })

  it('stays in [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 5000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('bounds int() below the exclusive maximum', () => {
    const rng = createRng(99)
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(3)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(3)
    }
  })

  it('eventually returns every value in a small range', () => {
    const rng = createRng(5)
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) seen.add(rng.int(4))
    expect(seen.size).toBe(4)
  })

  it('throws rather than returning undefined on an empty pick', () => {
    // noUncheckedIndexedAccess would otherwise let an undefined leak into the
    // simulation and surface as a blank message hours later.
    expect(() => createRng(1).pick([])).toThrow()
  })

  it('honours chance() at the extremes', () => {
    const rng = createRng(11)
    expect(rng.chance(1)).toBe(true)
    expect(rng.chance(0)).toBe(false)
  })
})
