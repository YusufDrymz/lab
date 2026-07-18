import { describe, expect, it } from 'vitest'
import {
  amountCheck,
  buildDataset,
  DEFAULT_QUERY,
  EVIDENCE_LIMIT,
  expectSatisfied,
  failCheck,
  formatMinor,
  freshnessCheck,
  joinPaymentsToFees,
  orphanCheck,
  orphanRows,
  report,
  scan,
  totalOverJoin,
  totalWithoutFanout,
  type Candidate,
} from '../watchdog'

describe('determinism', () => {
  it('builds the same dataset for the same seed', () => {
    expect(buildDataset({ seed: 5 })).toEqual(buildDataset({ seed: 5 }))
  })

  it('builds a different one for a different seed', () => {
    expect(buildDataset({ seed: 5 })).not.toEqual(buildDataset({ seed: 6 }))
  })

  it('keeps money in integers', () => {
    for (const payment of buildDataset().payments) {
      expect(Number.isInteger(payment.amountMinor)).toBe(true)
    }
    expect(formatMinor(24990)).toBe('249.90')
    expect(formatMinor(5)).toBe('0.05')
  })
})

describe('the expect language', () => {
  it('handles the comparison operators', () => {
    expect(expectSatisfied(0, '= 0')).toBe(true)
    expect(expectSatisfied(3, '= 0')).toBe(false)
    expect(expectSatisfied(3, '!= 0')).toBe(true)
    expect(expectSatisfied(120, '>= 100')).toBe(true)
    expect(expectSatisfied(99, '>= 100')).toBe(false)
    expect(expectSatisfied(4, '< 5')).toBe(true)
  })

  it('handles an inclusive between', () => {
    expect(expectSatisfied(5, 'between 5 and 10')).toBe(true)
    expect(expectSatisfied(10, 'between 5 and 10')).toBe(true)
    expect(expectSatisfied(11, 'between 5 and 10')).toBe(false)
  })

  it('throws rather than quietly passing on nonsense', () => {
    // A check nobody can parse must not report all quiet.
    expect(() => expectSatisfied(1, 'roughly 5')).toThrow()
    expect(() => expectSatisfied(1, 'between 10 and 5')).toThrow()
  })
})

describe('row multiplication', () => {
  const data = buildDataset({ count: 8 })

  it('produces more joined rows than payments', () => {
    const joined = joinPaymentsToFees(data)
    expect(joined.length).toBeGreaterThan(data.payments.length)
  })

  it('inflates the total, while every joined row is real', () => {
    const joined = joinPaymentsToFees(data)
    // Nothing is fabricated — the payment is simply counted once per fee.
    expect(totalOverJoin(joined)).toBeGreaterThan(totalWithoutFanout(data))
  })

  it('counts a payment exactly as many times as it has fees', () => {
    const joined = joinPaymentsToFees(data)
    const first = data.payments[0]!
    const feeCount = data.fees.filter((f) => f.paymentId === first.id).length
    const counted = joined.filter((row) => row.paymentId === first.id).length
    expect(counted).toBe(feeCount)
  })

  it('makes a check report a number that was never true', () => {
    const truth = totalWithoutFanout(data)
    const overJoin = amountCheck(data, true, `= ${truth}`)
    const direct = amountCheck(data, false, `= ${truth}`)

    expect(direct.violated).toBe(false)
    expect(overJoin.violated).toBe(true)
    expect(overJoin.message).toContain('does not satisfy')
  })

  it('names the duplicated payments as evidence', () => {
    const result = amountCheck(data, true, '= 0')
    expect(result.evidenceRows.length).toBeGreaterThan(0)
    expect(result.evidenceRows.length).toBeLessThanOrEqual(EVIDENCE_LIMIT)
  })
})

describe('orphans', () => {
  it('passes when every payment has its order', () => {
    const result = orphanCheck(buildDataset({ orphans: 0 }))
    expect(result.violated).toBe(false)
    expect(result.value).toBe(0)
    expect(result.message).toBe('value 0 satisfies = 0')
  })

  it('fails and names the rows when one does not', () => {
    const data = buildDataset({ orphans: 3 })
    const result = orphanCheck(data)

    expect(result.violated).toBe(true)
    expect(result.value).toBe(3)
    expect(result.type).toBe('integrity')
    expect(orphanRows(data)).toHaveLength(3)
    // The count says something is wrong; the evidence says what.
    expect(result.evidenceRows).toHaveLength(3)
    expect(result.evidenceRows[0]).toContain('pay-')
  })

  it('never returns more than five evidence rows', () => {
    const result = orphanCheck(buildDataset({ count: 20, orphans: 9 }))
    expect(result.value).toBe(9)
    expect(result.evidenceRows).toHaveLength(EVIDENCE_LIMIT)
  })
})

describe('freshness and replica lag', () => {
  it('passes on a primary when the data is recent', () => {
    expect(freshnessCheck(10, 30).violated).toBe(false)
  })

  it('fails on a primary when it is not', () => {
    const result = freshnessCheck(48, 30)
    expect(result.violated).toBe(true)
    expect(result.message).toContain('limit 30')
  })

  it('does not call healthy traffic stale on a lagging replica', () => {
    // Same 48-tick-old row: a violation against the primary's threshold, and
    // fine once the replica's own lag is accounted for.
    const naive = freshnessCheck(48, 30)
    const compensated = freshnessCheck(48, 30, { isReplica: true, lagTicks: 20 })

    expect(naive.violated).toBe(true)
    expect(compensated.violated).toBe(false)
    expect(compensated.threshold).toContain('replica lag 20')
  })

  it('still fails when the replica is genuinely behind', () => {
    expect(freshnessCheck(90, 30, { isReplica: true, lagTicks: 20 }).violated).toBe(true)
  })
})

describe('failing loudly', () => {
  it('counts a check that could not run as a violation', () => {
    const result = failCheck('orders-freshness', 'freshness', 'connection refused')
    expect(result.violated).toBe(true)
    expect(result.value).toBeNull()
    expect(result.message).toContain('check failed to run')
  })

  it('does not let a blind watchdog report all quiet', () => {
    const clean = report([orphanCheck(buildDataset())])
    expect(clean.exitCode).toBe(0)
    expect(clean.summary).toBe('data is alive')

    const blind = report([failCheck('payment-orphans', 'integrity', 'timeout')])
    expect(blind.exitCode).toBe(1)
    expect(blind.summary).toBe('1 violation(s): 1 crit, 0 warn')
  })

  it('exits 1 for a warn as well as a crit', () => {
    const warn = { ...orphanCheck(buildDataset({ orphans: 1 })), severity: 'warn' as const }
    const result = report([warn])
    expect(result.crit).toBe(0)
    expect(result.warn).toBe(1)
    // Severity shapes the report, not the exit code.
    expect(result.exitCode).toBe(1)
  })
})

describe('recovery', () => {
  const candidates: Candidate[] = [
    { id: 'pay-1', ageTicks: 4, amountMinor: 1000 },
    { id: 'pay-2', ageTicks: 30, amountMinor: 2000 },
    { id: 'pay-3', ageTicks: 40, amountMinor: 3000 },
    { id: 'pay-4', ageTicks: 200, amountMinor: 4000 },
  ]

  it('leaves a candidate alone until it is old enough', () => {
    // The webhook may still be on its way; asking now races the delivery.
    const result = scan(candidates, DEFAULT_QUERY, () => true)
    expect(result.outcomes.find((o) => o.id === 'pay-1')?.outcome).toBe('too-young')
    expect(result.stats.scanned).toBe(2)
  })

  it('abandons one that is past the far edge of the window', () => {
    const result = scan(candidates, DEFAULT_QUERY, () => true)
    expect(result.outcomes.find((o) => o.id === 'pay-4')?.outcome).toBe('abandoned')
  })

  it('repairs the ones the provider confirms', () => {
    const result = scan(candidates, DEFAULT_QUERY, () => true)
    expect(result.stats.reconciled).toBe(2)
    expect(result.stats.skipped).toBe(0)
  })

  it('leaves alone the ones that never succeeded', () => {
    // Repairing these would be inventing payments.
    const result = scan(candidates, DEFAULT_QUERY, () => false)
    expect(result.stats.reconciled).toBe(0)
    expect(result.stats.skipped).toBe(2)
  })

  it('fails open: one provider error does not stop the batch', () => {
    const result = scan(candidates, DEFAULT_QUERY, (c) => (c.id === 'pay-2' ? 'error' : true))
    expect(result.stats.failed).toBe(1)
    expect(result.stats.reconciled).toBe(1)
    expect(result.stats.scanned).toBe(2)
  })

  it('honours the limit', () => {
    const many: Candidate[] = Array.from({ length: 10 }, (_, i) => ({
      id: `pay-${i}`,
      ageTicks: 30,
      amountMinor: 100,
    }))
    const result = scan(many, { ...DEFAULT_QUERY, limit: 3 }, () => true)
    expect(result.stats.scanned).toBe(3)
  })
})
