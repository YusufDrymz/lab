/**
 * "The numbers do not add up" — what data-watchdog and go-reconcile are for.
 *
 * Two halves of the same problem. A watchdog runs read-only checks against a
 * live database and shouts when one fails; a reconciler goes back to the
 * provider for records that were never confirmed and repairs them. Detection
 * and recovery.
 *
 * Two invariants, same as every other model here:
 *
 *  1. Everything is a pure function of its inputs — no clock, no DOM, no
 *     `Math.random()`.
 *  2. **Money is an integer**, in minor units (kuruş). A model that reconciled
 *     with floats would be demonstrating its own bug rather than the one it
 *     means to teach.
 *
 * The SQL shown alongside each check is the query an operator would actually
 * write; the model computes the number directly rather than executing it. The
 * type names, the `expect` language, the severities, the fail-loud rule, the
 * replica-lag compensation and the reconcile outcomes are all taken from the
 * two tools, so the vocabulary transfers.
 */
import { createRng } from './prng'

export type Minor = number

export const formatMinor = (minor: Minor): string =>
  `${Math.floor(Math.abs(minor) / 100)}.${String(Math.abs(minor) % 100).padStart(2, '0')}`

/* ------------------------------------------------------------------ *
 * The dataset
 * ------------------------------------------------------------------ */

export type Order = { id: string }

export type Payment = {
  id: string
  /** null, or an order that no longer exists — either way an orphan */
  orderId: string | null
  amountMinor: Minor
  /** ticks ago, so "age" needs no clock */
  ageTicks: number
  status: 'pending' | 'paid'
}

export type Fee = { paymentId: string; kind: string; amountMinor: Minor }

export type Dataset = { orders: Order[]; payments: Payment[]; fees: Fee[] }

const FEE_KINDS = ['commission', 'fx', 'installment'] as const

export type DatasetConfig = {
  seed: number
  count: number
  /** payments pointing at an order that is not there */
  orphans: number
  /** payments still waiting for the provider's confirmation */
  pending: number
}

export const DEFAULT_DATASET: DatasetConfig = { seed: 20260719, count: 8, orphans: 0, pending: 0 }

export function buildDataset(config: Partial<DatasetConfig> = {}): Dataset {
  const c = { ...DEFAULT_DATASET, ...config }
  const rng = createRng(c.seed)

  const orders: Order[] = Array.from({ length: c.count }, (_, i) => ({ id: `ord-${9000 + i}` }))

  const payments: Payment[] = Array.from({ length: c.count }, (_, i) => ({
    id: `pay-${2001 + i}`,
    // The last `orphans` payments reference an order that was never created.
    orderId: i >= c.count - c.orphans ? `ord-${99000 + i}` : `ord-${9000 + i}`,
    amountMinor: (50 + rng.int(900)) * 100 + rng.int(100),
    ageTicks: 2 + i * 4,
    status: i >= c.count - c.pending ? 'pending' : 'paid',
  }))

  // One fee for most payments, two or three for some. The ones with more than
  // one are what inflate a careless total.
  const fees: Fee[] = payments.flatMap((payment, i) => {
    const many = i % 4 === 0 ? 3 : i % 3 === 0 ? 2 : 1
    return Array.from({ length: many }, (_, k) => ({
      paymentId: payment.id,
      kind: FEE_KINDS[k % FEE_KINDS.length]!,
      amountMinor: 50 + rng.int(400),
    }))
  })

  return { orders, payments, fees }
}

/* ------------------------------------------------------------------ *
 * The check result — data-watchdog's shape
 * ------------------------------------------------------------------ */

export type CheckType = 'freshness' | 'volume' | 'integrity' | 'custom' | 'replica-lag'

/** Only two levels exist, and neither changes the exit code. */
export type Severity = 'crit' | 'warn'

export type CheckResult = {
  check: string
  type: CheckType
  severity: Severity
  violated: boolean
  value: number | null
  threshold: string
  message: string
  /** set when the check could not run at all */
  error?: string
  /** the query an operator would run to see the offending rows */
  evidenceSql: string
  /** at most five, and never sent to a webhook */
  evidenceRows: string[]
}

export const EVIDENCE_LIMIT = 5

/* ------------------------------------------------------------------ *
 * The `expect` mini-language
 * ------------------------------------------------------------------ */

/**
 * Supports `= n`, `!= n`, `< n`, `<= n`, `> n`, `>= n` and `between a and b`
 * (inclusive). Anything else is a configuration error rather than a silent
 * pass — a check nobody can parse must not report all quiet.
 */
export function expectSatisfied(value: number, expect: string): boolean {
  const text = expect.trim()

  const between = /^between\s+(-?[\d.]+)\s+and\s+(-?[\d.]+)$/i.exec(text)
  if (between) {
    const low = Number(between[1])
    const high = Number(between[2])
    if (low > high) throw new Error(`invalid expect: ${expect}`)
    return value >= low && value <= high
  }

  const binary = /^(=|==|!=|<=|>=|<|>)\s*(-?[\d.]+)$/.exec(text)
  if (!binary) throw new Error(`invalid expect: ${expect}`)

  const target = Number(binary[2])
  switch (binary[1]) {
    case '=':
    case '==':
      return value === target
    case '!=':
      return value !== target
    case '<':
      return value < target
    case '<=':
      return value <= target
    case '>':
      return value > target
    default:
      return value >= target
  }
}

/* ------------------------------------------------------------------ *
 * 1 — the join that inflates the number a check reports
 * ------------------------------------------------------------------ */

export type JoinedRow = {
  paymentId: string
  paymentMinor: Minor
  feeKind: string
  feeMinor: Minor
  /** true when this payment appears on more than one row of the join */
  duplicated: boolean
}

/** `payments p JOIN fees f ON f.payment_id = p.id` — correct SQL, every row real. */
export function joinPaymentsToFees(data: Dataset): JoinedRow[] {
  const counts = new Map<string, number>()
  for (const fee of data.fees) counts.set(fee.paymentId, (counts.get(fee.paymentId) ?? 0) + 1)

  return data.fees.flatMap((fee) => {
    const payment = data.payments.find((p) => p.id === fee.paymentId)
    if (!payment) return []
    return [
      {
        paymentId: payment.id,
        paymentMinor: payment.amountMinor,
        feeKind: fee.kind,
        feeMinor: fee.amountMinor,
        duplicated: (counts.get(fee.paymentId) ?? 0) > 1,
      },
    ]
  })
}

/**
 * `SUM(p.amount)` over that join.
 *
 * Every row is a real row, so nothing looks wrong. But a payment with three
 * fees contributes its amount three times, and the total is quietly inflated —
 * which means a check written over this join reports a number that was never
 * true of the data.
 */
export const totalOverJoin = (joined: JoinedRow[]): Minor =>
  joined.reduce((total, row) => total + row.paymentMinor, 0)

/**
 * The same total, counting each payment once.
 *
 * In SQL: aggregate the fees in a subquery before joining, or sum the payments
 * on their own. Not `SUM(DISTINCT p.amount)` — that is a different and wronger
 * fix, since two payments for the same amount would collapse into one.
 */
export const totalWithoutFanout = (data: Dataset): Minor =>
  data.payments.reduce((total, payment) => total + payment.amountMinor, 0)

export const SQL_FANOUT =
  'SELECT sum(p.amount) FROM payments p JOIN fees f ON f.payment_id = p.id'
export const SQL_NO_FANOUT =
  'SELECT sum(p.amount) FROM payments p'

/** A custom check over one of those two queries. */
export function amountCheck(data: Dataset, fanout: boolean, expect: string): CheckResult {
  const joined = joinPaymentsToFees(data)
  const value = fanout ? totalOverJoin(joined) : totalWithoutFanout(data)
  const satisfied = expectSatisfied(value, expect)

  return {
    check: 'settled-total',
    type: 'custom',
    severity: 'crit',
    violated: !satisfied,
    value,
    threshold: expect,
    message: `value ${value} ${satisfied ? 'satisfies' : 'does not satisfy'} ${expect}`,
    evidenceSql: fanout ? SQL_FANOUT : SQL_NO_FANOUT,
    evidenceRows: fanout
      ? joined
          .filter((row) => row.duplicated)
          .slice(0, EVIDENCE_LIMIT)
          .map((row) => `${row.paymentId}, ${formatMinor(row.paymentMinor)}, ${row.feeKind}`)
      : [],
  }
}

/* ------------------------------------------------------------------ *
 * 2 — orphans, and the evidence that names them
 * ------------------------------------------------------------------ */

export const SQL_ORPHANS =
  'SELECT count(*) FROM payments p LEFT JOIN orders o ON o.id = p.order_id WHERE o.id IS NULL'

export const SQL_ORPHAN_EVIDENCE =
  'SELECT p.id, p.order_id, p.amount FROM payments p LEFT JOIN orders o ON o.id = p.order_id WHERE o.id IS NULL ORDER BY p.id'

export function orphanRows(data: Dataset): Payment[] {
  const ids = new Set(data.orders.map((order) => order.id))
  return data.payments.filter((payment) => !payment.orderId || !ids.has(payment.orderId))
}

/**
 * An integrity check: a payment must belong to an order that exists.
 *
 * The count alone tells you something is wrong and nothing about what. The
 * evidence query is the difference between an alert you can act on and one you
 * have to reproduce by hand at 3am.
 */
export function orphanCheck(data: Dataset, expect = '= 0'): CheckResult {
  const rows = orphanRows(data)
  const value = rows.length
  const satisfied = expectSatisfied(value, expect)

  return {
    check: 'payment-orphans',
    type: 'integrity',
    severity: 'crit',
    violated: !satisfied,
    value,
    threshold: expect,
    message: `value ${value} ${satisfied ? 'satisfies' : 'does not satisfy'} ${expect}`,
    evidenceSql: SQL_ORPHAN_EVIDENCE,
    evidenceRows: rows
      .slice(0, EVIDENCE_LIMIT)
      .map((row) => `${row.id}, ${row.orderId ?? 'NULL'}, ${formatMinor(row.amountMinor)}`),
  }
}

/* ------------------------------------------------------------------ *
 * 3 — freshness, replica lag, and failing loudly
 * ------------------------------------------------------------------ */

export type ReplicaInfo = { isReplica: boolean; lagTicks: number }

/**
 * Freshness, compensated for replication lag.
 *
 * The newest row visible on a replica is at least one replication lag old, so
 * comparing it against the primary's threshold reports healthy traffic as
 * stale. Adding the lag to the limit is what stops a watchdog crying wolf
 * every time the replica falls behind — and the lag itself gets its own check,
 * so a replica that is genuinely far behind is still reported.
 */
export function freshnessCheck(
  newestAgeTicks: number,
  maxAgeTicks: number,
  replica: ReplicaInfo = { isReplica: false, lagTicks: 0 },
): CheckResult {
  let limit = maxAgeTicks
  let threshold = `max_age ${maxAgeTicks}`

  if (replica.isReplica && replica.lagTicks > 0) {
    limit += replica.lagTicks
    threshold += ` + replica lag ${replica.lagTicks}`
  }

  const violated = newestAgeTicks > limit

  return {
    check: 'orders-freshness',
    type: 'freshness',
    severity: 'crit',
    violated,
    value: newestAgeTicks,
    threshold,
    message: violated
      ? `newest orders.created_at is ${newestAgeTicks} old (limit ${limit})`
      : `newest orders.created_at is ${newestAgeTicks} old`,
    evidenceSql: 'SELECT max("created_at") FROM "orders"',
    evidenceRows: [],
  }
}

/**
 * A check that could not run is a violation.
 *
 * The tempting alternative — skip it, log it, carry on — turns a broken
 * watchdog into a silent one, and silence is indistinguishable from health. A
 * watchdog that cannot see is not allowed to report all quiet.
 */
export function failCheck(name: string, type: CheckType, error: string): CheckResult {
  return {
    check: name,
    type,
    severity: 'crit',
    violated: true,
    value: null,
    threshold: '',
    message: `check failed to run: ${error}`,
    error,
    evidenceSql: '',
    evidenceRows: [],
  }
}

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

export type Report = {
  results: CheckResult[]
  violations: number
  crit: number
  warn: number
  /** 0 data alive · 1 violations · 2 tool or usage error */
  exitCode: 0 | 1 | 2
  summary: string
}

export function report(results: CheckResult[]): Report {
  const violated = results.filter((r) => r.violated)
  const crit = violated.filter((r) => r.severity === 'crit').length
  const warn = violated.filter((r) => r.severity === 'warn').length

  return {
    results,
    violations: violated.length,
    crit,
    warn,
    // Severity does not change the exit code; it only shapes the report. Both
    // a crit and a warn exit 1.
    exitCode: violated.length > 0 ? 1 : 0,
    summary:
      violated.length === 0
        ? 'data is alive'
        : `${violated.length} violation(s): ${crit} crit, ${warn} warn`,
  }
}

/* ------------------------------------------------------------------ *
 * 4 — recovery: late is not lost
 * ------------------------------------------------------------------ */

/** Whether a candidate was repaired, left alone, or errored. */
export type Outcome = 'skipped' | 'reconciled' | 'failed' | 'too-young' | 'abandoned'

export type Candidate = { id: string; ageTicks: number; amountMinor: Minor }

/**
 * The window a scan considers.
 *
 *   minAge  a candidate must be older than this. A webhook that is thirty
 *           seconds late is not a lost webhook, and asking the provider about
 *           it races the delivery that is already on its way.
 *   maxAge  past this, stop guessing. The record is not a transient failure
 *           any more and belongs in front of a person.
 */
export type Query = { minAgeTicks: number; maxAgeTicks: number; limit: number }

export const DEFAULT_QUERY: Query = { minAgeTicks: 10, maxAgeTicks: 80, limit: 50 }

export type Stats = { scanned: number; reconciled: number; failed: number; skipped: number }

export type ScanResult = {
  stats: Stats
  outcomes: { id: string; outcome: Outcome }[]
}

/**
 * One pass over the pending records.
 *
 * `succeeded` stands in for the provider call: true means the payment really
 * did go through and we simply never heard, which is the case worth repairing.
 * False means it never happened, and the right action is to leave it alone —
 * a reconciler that "fixes" those would be inventing payments.
 */
export function scan(
  candidates: Candidate[],
  query: Query,
  succeeded: (candidate: Candidate) => boolean | 'error',
): ScanResult {
  const outcomes: { id: string; outcome: Outcome }[] = []
  const stats: Stats = { scanned: 0, reconciled: 0, failed: 0, skipped: 0 }

  for (const candidate of candidates) {
    if (candidate.ageTicks < query.minAgeTicks) {
      outcomes.push({ id: candidate.id, outcome: 'too-young' })
      continue
    }
    if (candidate.ageTicks > query.maxAgeTicks) {
      outcomes.push({ id: candidate.id, outcome: 'abandoned' })
      continue
    }
    if (stats.scanned >= query.limit) break

    stats.scanned++
    const answer = succeeded(candidate)

    if (answer === 'error') {
      // Fail open: one provider error must not stop the rest of the batch, and
      // the candidate stays pending for the next pass.
      stats.failed++
      outcomes.push({ id: candidate.id, outcome: 'failed' })
      continue
    }

    if (answer) {
      stats.reconciled++
      outcomes.push({ id: candidate.id, outcome: 'reconciled' })
    } else {
      stats.skipped++
      outcomes.push({ id: candidate.id, outcome: 'skipped' })
    }
  }

  return { stats, outcomes }
}
