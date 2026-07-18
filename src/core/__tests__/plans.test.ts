import { describe, expect, it } from 'vitest'
import {
  compare,
  DEFAULT_PLAN_CONFIG,
  estimateMs,
  IDX_CUSTOMER,
  IDX_EMAIL,
  IDX_LOWER_EMAIL,
  label,
  maskLiterals,
  maxSeverity,
  normalize,
  planFor,
  shapeHash,
  shouldFail,
  summary,
  type PlanConfig,
  type Shape,
} from '../plans'

const config = (over: Partial<PlanConfig> = {}): PlanConfig => ({ ...DEFAULT_PLAN_CONFIG, ...over })
const shapeOf = (over: Partial<PlanConfig> = {}): Shape => normalize(planFor(config(over)))

/** Walks a shape to find the first node of a given type. */
const find = (shape: Shape, type: string): Shape | undefined => {
  if (shape.nodeType === type) return shape
  for (const child of shape.children) {
    const hit = find(child, type)
    if (hit) return hit
  }
  return undefined
}

describe('determinism', () => {
  it('produces the same plan for the same config', () => {
    expect(shapeOf({ rows: 50_000 })).toEqual(shapeOf({ rows: 50_000 }))
    expect(shapeHash(shapeOf())).toBe(shapeHash(shapeOf()))
  })

  it('does not mutate the config it is given', () => {
    const input = config({ rows: 1_000 })
    const before = structuredClone(input)
    planFor(input)
    estimateMs(input)
    expect(input).toEqual(before)
  })
})

describe('a function around the column', () => {
  it('cannot use a plain btree, and falls back to Seq Scan', () => {
    const shape = shapeOf({ predicate: 'lower', indexes: [IDX_EMAIL] })
    expect(find(shape, 'Seq Scan')).toBeDefined()
    expect(find(shape, 'Index Scan')).toBeUndefined()
  })

  it('uses the index again once a functional one exists', () => {
    const shape = shapeOf({ predicate: 'lower', indexes: [IDX_EMAIL, IDX_LOWER_EMAIL] })
    expect(find(shape, 'Seq Scan')).toBeUndefined()
    expect(find(shape, 'Index Scan')?.index).toBe(IDX_LOWER_EMAIL)
  })

  it('reports the fallback as a crit, naming the lost index', () => {
    const before = shapeOf({ predicate: 'lower', indexes: [IDX_EMAIL, IDX_LOWER_EMAIL] })
    const after = shapeOf({ predicate: 'lower', indexes: [IDX_EMAIL] })

    const findings = compare(before, after)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.code).toBe('seq-scan')
    expect(findings[0]!.severity).toBe('crit')
    expect(findings[0]!.message).toContain(IDX_LOWER_EMAIL)
  })
})

describe('scale', () => {
  it('costs a sequential scan in proportion to the table', () => {
    const small = estimateMs(config({ rows: 1_000, indexes: [] }))
    const large = estimateMs(config({ rows: 10_000_000, indexes: [] }))
    expect(large).toBeGreaterThan(small * 100)
  })

  it('flattens for an indexed lookup once the matched window stops growing', () => {
    // The claim the section makes: one curve keeps climbing, the other does
    // not. A time-window predicate matches a bounded slice however long the
    // history gets, so past the ceiling the lookup barely moves at all.
    const mid = estimateMs(config({ rows: 1_000_000 }))
    const large = estimateMs(config({ rows: 10_000_000 }))
    expect(large / mid).toBeLessThan(1.1)

    // Meanwhile the sequential scan over the same tables grows ten-fold.
    const scanMid = estimateMs(config({ rows: 1_000_000, indexes: [] }))
    const scanLarge = estimateMs(config({ rows: 10_000_000, indexes: [] }))
    expect(scanLarge / scanMid).toBeGreaterThan(9)
  })

  it('opens a wide gap between the two by the top of the range', () => {
    const indexed = estimateMs(config({ rows: 10_000_000 }))
    const scan = estimateMs(config({ rows: 10_000_000, indexes: [] }))
    expect(scan / indexed).toBeGreaterThan(25)
  })

  it('switches to a bitmap scan once enough rows match', () => {
    expect(find(shapeOf({ rows: 1_000 }), 'Index Scan')).toBeDefined()
    expect(find(shapeOf({ rows: 500_000 }), 'Bitmap Heap Scan')).toBeDefined()
  })

  it('treats the index-to-bitmap swap as equivalent', () => {
    // Same index, same access path, different row estimate. A guard that
    // flagged this would fire every time traffic shifted.
    const findings = compare(shapeOf({ rows: 1_000 }), shapeOf({ rows: 500_000 }))
    expect(findings).toEqual([])
  })

  it('flags the swap when the equivalence is switched off', () => {
    const findings = compare(shapeOf({ rows: 1_000 }), shapeOf({ rows: 500_000 }), {
      indexBitmapSwap: false,
    })
    expect(findings.length).toBeGreaterThan(0)
  })
})

describe('a stale estimate', () => {
  it('picks a nested loop when it thinks the outer side is tiny', () => {
    const shape = shapeOf({ join: true, statsFresh: false, rows: 200_000 })
    expect(find(shape, 'Nested Loop')).toBeDefined()
    expect(find(shape, 'Hash Join')).toBeUndefined()
  })

  it('picks a hash join once the estimate is honest', () => {
    const shape = shapeOf({ join: true, statsFresh: true, rows: 200_000 })
    expect(find(shape, 'Hash Join')).toBeDefined()
  })

  it('is dramatically slower, because the loop runs per actual row', () => {
    const good = estimateMs(config({ join: true, statsFresh: true, rows: 200_000 }))
    const bad = estimateMs(config({ join: true, statsFresh: false, rows: 200_000 }))
    expect(bad).toBeGreaterThan(good * 10)
  })

  it('reports the switch as a join-method warning', () => {
    const before = shapeOf({ join: true, statsFresh: true, rows: 200_000 })
    const after = shapeOf({ join: true, statsFresh: false, rows: 200_000 })

    const findings = compare(before, after)
    expect(findings.some((f) => f.code === 'join-method' && f.severity === 'warn')).toBe(true)
  })
})

describe('normalisation', () => {
  it('masks string literals, parameters and numbers', () => {
    expect(maskLiterals("(created_at >= '2026-01-01')")).toBe('(created_at >= ?)')
    expect(maskLiterals('(id = $1)')).toBe('(id = ?)')
    expect(maskLiterals('(total > 250.50)')).toBe('(total > ?)')
  })

  it('keeps casts, because they change what the predicate means', () => {
    expect(maskLiterals("('2026-01-01'::date)")).toBe('(?::date)')
  })

  it('leaves digits inside identifiers alone', () => {
    expect(maskLiterals('(idx_orders_2)')).toBe('(idx_orders_2)')
  })

  it('gives the same hash to the same query with a different literal', () => {
    // The whole premise: EXPLAIN text differs on every run, the shape does not.
    const a = shapeOf({ literal: "'2026-01-01'" })
    const b = shapeOf({ literal: "'2019-06-30'" })
    expect(shapeHash(b)).toBe(shapeHash(a))
    expect(compare(a, b)).toEqual([])
  })

  it('drops transparent nodes with a single child', () => {
    const withGather = planFor(config({ parallel: true }))
    const without = planFor(config({ parallel: false }))
    // A serial/parallel flip follows cost estimates, not the query.
    expect(normalize(withGather)).toEqual(normalize(without))
    expect(compare(normalize(without), normalize(withGather))).toEqual([])
  })

  it('keeps a transparent node that has more than one child', () => {
    const shape = normalize({
      nodeType: 'Gather',
      children: [
        { nodeType: 'Seq Scan', relation: 'orders', children: [] },
        { nodeType: 'Seq Scan', relation: 'customers', children: [] },
      ],
    })
    // Removing it would silently discard a branch.
    expect(shape.nodeType).toBe('Gather')
    expect(shape.children).toHaveLength(2)
  })

  it('never lets a cost or a row count into the shape', () => {
    const json = JSON.stringify(shapeOf({ rows: 900_000 }))
    expect(json).not.toMatch(/cost|rows|width|time/i)
  })
})

describe('reporting', () => {
  it('labels a node the way the report does', () => {
    expect(label({ nodeType: 'Index Scan', relation: 'orders', index: IDX_CUSTOMER, children: [] }))
      .toBe(`Index Scan(orders via ${IDX_CUSTOMER})`)
    expect(label({ nodeType: 'Hash Join', children: [] })).toBe('Hash Join')
  })

  it('summarises a clean run and a failing one', () => {
    expect(summary([])).toBe('ok — no plan changes')
    const findings = compare(
      shapeOf({ predicate: 'lower', indexes: [IDX_EMAIL, IDX_LOWER_EMAIL] }),
      shapeOf({ predicate: 'lower', indexes: [IDX_EMAIL] }),
    )
    expect(summary(findings)).toBe('1 finding(s): 1 crit, 0 warn, 0 info')
  })

  it('fails on crit but not on warn, by default', () => {
    const crit = [{ severity: 'crit' as const, code: 'seq-scan', message: '', path: '' }]
    const warn = [{ severity: 'warn' as const, code: 'join-method', message: '', path: '' }]

    expect(shouldFail(crit)).toBe(true)
    expect(shouldFail(warn)).toBe(false)
    expect(shouldFail(warn, 'warn')).toBe(true)
    expect(maxSeverity([...warn, ...crit])).toBe('crit')
  })

  it('fails on a stale or missing baseline whatever --fail-on says', () => {
    // A comparison that could not be made is not a pass.
    expect(shouldFail([], 'crit', { stale: true })).toBe(true)
    expect(shouldFail([], 'crit', { missing: true })).toBe(true)
  })

  it('reports one regression once, not twice', () => {
    const before = shapeOf({ predicate: 'lower', indexes: [IDX_EMAIL, IDX_LOWER_EMAIL] })
    const after = shapeOf({ predicate: 'lower', indexes: [IDX_EMAIL] })
    const findings = compare(before, after)
    // The seq-scan crit already explains the lost index; index-lost must not
    // repeat it.
    expect(findings.filter((f) => f.code === 'index-lost')).toHaveLength(0)
  })

  it('finds an index that vanished without a scan degrading', () => {
    const before: Shape = {
      nodeType: 'Nested Loop',
      children: [
        { nodeType: 'Index Scan', relation: 'orders', index: IDX_CUSTOMER, children: [] },
        { nodeType: 'Index Scan', relation: 'customers', index: 'customers_pkey', children: [] },
      ],
    }
    const after: Shape = {
      nodeType: 'Nested Loop',
      children: [
        { nodeType: 'Index Scan', relation: 'orders', index: IDX_CUSTOMER, children: [] },
        { nodeType: 'Index Scan', relation: 'customers', index: 'customers_email_key', children: [] },
      ],
    }
    const findings = compare(before, after)
    expect(findings.some((f) => f.code === 'index-changed' && f.severity === 'crit')).toBe(true)
  })
})
