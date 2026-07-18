import { describe, expect, it } from 'vitest'
import { murmur2, partitionForKey } from '../partition'
import { CUSTOMERS } from '../scenario'

const encode = (s: string) => new TextEncoder().encode(s)

describe('murmur2', () => {
  it('is deterministic', () => {
    expect(murmur2(encode('cust-1041'))).toBe(murmur2(encode('cust-1041')))
  })

  it('stays a 32-bit signed integer', () => {
    for (const key of CUSTOMERS) {
      const h = murmur2(encode(key))
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(-(2 ** 31))
      expect(h).toBeLessThan(2 ** 31)
    }
  })

  it('handles every trailing-byte length', () => {
    // The tail switch (length % 4) is the easiest part of murmur2 to get wrong.
    for (const key of ['a', 'ab', 'abc', 'abcd', 'abcde']) {
      expect(() => murmur2(encode(key))).not.toThrow()
    }
    // Different lengths must not collapse onto one another.
    const hashes = ['a', 'ab', 'abc', 'abcd'].map((k) => murmur2(encode(k)))
    expect(new Set(hashes).size).toBe(4)
  })

  it('treats the empty key as valid', () => {
    expect(Number.isInteger(murmur2(encode('')))).toBe(true)
  })
})

describe('partitionForKey', () => {
  it('always lands inside the partition range', () => {
    for (const count of [1, 2, 3, 5, 8, 12]) {
      for (const key of CUSTOMERS) {
        const p = partitionForKey(key, count)
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThan(count)
      }
    }
  })

  it('sends the same key to the same partition every time', () => {
    // The guarantee the whole site rests on.
    for (const key of CUSTOMERS) {
      const first = partitionForKey(key, 3)
      for (let i = 0; i < 50; i++) expect(partitionForKey(key, 3)).toBe(first)
    }
  })

  it('reshuffles keys when the partition count changes', () => {
    // Why adding partitions breaks ordering for in-flight keys: at least one
    // key must move, otherwise the lesson in section 1 would be a lie.
    const moved = CUSTOMERS.filter(
      (key) => partitionForKey(key, 3) !== partitionForKey(key, 4),
    )
    expect(moved.length).toBeGreaterThan(0)
  })

  it('spreads the customer pool evenly enough to be worth drawing', () => {
    // Not a property of murmur2 — a property of the ids we picked. An unlucky
    // block piles every customer onto one partition and the diagrams in
    // sections 1 to 4 stop demonstrating anything, so this is a real
    // regression guard rather than a tautology.
    for (const count of [2, 3, 4]) {
      const counts = new Array<number>(count).fill(0)
      for (const key of CUSTOMERS) counts[partitionForKey(key, count)]!++

      // Every partition gets something, and none carries more than 1.5× its
      // fair share. Perfect balance is not achievable for a fixed key set, but
      // this is close enough that the diagrams read correctly.
      expect(counts.every((n) => n > 0)).toBe(true)
      expect(Math.max(...counts)).toBeLessThanOrEqual(
        Math.ceil((CUSTOMERS.length / count) * 1.5),
      )
    }
  })

  it('distributes unrelated keys uniformly', () => {
    // Guards the murmur2 port itself: a broken hash would show up here as a
    // lopsided split long before anyone noticed it in the UI.
    const counts = [0, 0, 0]
    for (let i = 0; i < 3000; i++) counts[partitionForKey(`user-${i}-${i * 7}`, 3)]!++
    for (const n of counts) {
      expect(n).toBeGreaterThan(850)
      expect(n).toBeLessThan(1150)
    }
  })

  it('rejects a non-positive partition count', () => {
    expect(() => partitionForKey('cust-1041', 0)).toThrow()
  })
})
