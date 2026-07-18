/**
 * Query plans, and the shape that survives a literal change — what
 * pg-plan-guard is for.
 *
 * The same query is 3 ms in development and 40 seconds in production. The row
 * count is not the difference; the *plan* is. And a plan regression is
 * invisible in review, because the SQL did not change — an index was dropped, a
 * statistic went stale, a column got wrapped in a function.
 *
 * Two invariants, same as every other model here:
 *
 *  1. `planFor(config)` is pure, and so is everything downstream of it.
 *  2. No wall-clock, no DOM, no `Math.random()`. Same inputs, same plan.
 *
 * **This is not PostgreSQL's planner.** It does not read statistics, cost
 * anything, or consider more than a handful of alternatives. It is a model of
 * *why* a plan changes: table size, whether an index is usable, and whether the
 * row estimate is any good. The node names, the normalisation rules, the
 * finding codes and the severities are taken from pg-plan-guard itself, so what
 * the reader learns here transfers to the real output.
 */

/** Node names as they appear in EXPLAIN output. */
export type NodeType =
  | 'Seq Scan'
  | 'Index Scan'
  | 'Index Only Scan'
  | 'Bitmap Heap Scan'
  | 'Bitmap Index Scan'
  | 'Nested Loop'
  | 'Hash Join'
  | 'Merge Join'
  | 'Hash'
  | 'Sort'
  | 'Limit'
  | 'Materialize'
  | 'Memoize'
  | 'Gather'
  | 'Gather Merge'

/**
 * Nodes whose presence follows cost estimates rather than the shape of the
 * query, so a serial/parallel flip does not read as a structural regression.
 * The real default list, and it is configurable there too.
 */
export const TRANSPARENT_NODES: NodeType[] = ['Materialize', 'Memoize', 'Gather', 'Gather Merge']

export type PlanNode = {
  nodeType: NodeType
  relation?: string
  index?: string
  indexCond?: string
  hashCond?: string
  filter?: string
  children: PlanNode[]
}

/** What the reader can change. Everything else is derived. */
export type PlanConfig = {
  /** rows in `orders` */
  rows: number
  /** indexes that exist right now */
  indexes: string[]
  /**
   * How the predicate is written. Wrapping the column in a function is what
   * makes a perfectly good btree unusable.
   */
  predicate: 'plain' | 'lower'
  /** the literal in the query, so the reader can change it and watch the mask */
  literal: string
  /** whether the planner's row estimate is close to reality */
  statsFresh: boolean
  /** whether the planner chose a parallel plan (adds a Gather) */
  parallel: boolean
  /** join `orders` to `customers` */
  join: boolean
}

export const IDX_CUSTOMER = 'idx_orders_customer_created'
export const IDX_LOWER_EMAIL = 'idx_customers_lower_email'
export const IDX_EMAIL = 'idx_customers_email'

export const DEFAULT_PLAN_CONFIG: PlanConfig = {
  rows: 1_000,
  indexes: [IDX_CUSTOMER, IDX_EMAIL],
  predicate: 'plain',
  literal: "'2026-01-01'",
  statsFresh: true,
  parallel: false,
  join: false,
}

/* ------------------------------------------------------------------ *
 * Deriving a plan
 * ------------------------------------------------------------------ */

/**
 * Whether an index can serve the predicate at all.
 *
 * `WHERE lower(email) = ?` cannot use a btree on `email`: the index stores the
 * column, not the result of calling a function on it. Nothing warns you — the
 * query is valid, it just stops using the index.
 */
function usableIndex(config: PlanConfig): string | undefined {
  if (config.predicate === 'lower') {
    return config.indexes.includes(IDX_LOWER_EMAIL) ? IDX_LOWER_EMAIL : undefined
  }
  return config.indexes.includes(IDX_CUSTOMER) ? IDX_CUSTOMER : undefined
}

/**
 * Rows the scan is expected to return, and how many it really does.
 *
 * The match is a share of the table up to a ceiling, not a flat percentage.
 * The predicate is a recent window — `created_at >= ?` — and a recent window
 * returns roughly the same number of rows whether the table holds one year of
 * history or ten. Without the ceiling the indexed lookup would grow linearly
 * with the table too, and the whole point of the scale section (one curve
 * flattens, the other does not) would be untrue.
 */
const MAX_MATCHED_ROWS = 20_000

export function rowEstimate(config: PlanConfig): { estimated: number; actual: number } {
  const actual = Math.min(MAX_MATCHED_ROWS, Math.max(1, Math.round(config.rows * 0.02)))
  // A stale statistic is not a small error. The planner thinks the predicate is
  // far more selective than it is, and picks a plan that only works if it is.
  return { estimated: config.statsFresh ? actual : Math.max(1, Math.round(actual / 400)), actual }
}

function scanFor(config: PlanConfig): PlanNode {
  const index = usableIndex(config)
  const cond =
    config.predicate === 'lower'
      ? `(lower(email) = ${config.literal})`
      : `(created_at >= ${config.literal})`

  if (!index) {
    return { nodeType: 'Seq Scan', relation: 'orders', filter: cond, children: [] }
  }

  // Above a few thousand matched rows the planner prefers a bitmap: collect the
  // tids first, then read the heap in physical order. Same index, same access —
  // which is exactly why pg-plan-guard treats the swap as equivalent.
  const { actual } = rowEstimate(config)
  if (actual > 2_000) {
    return {
      nodeType: 'Bitmap Heap Scan',
      relation: 'orders',
      children: [{ nodeType: 'Bitmap Index Scan', index, indexCond: cond, children: [] }],
    }
  }

  return { nodeType: 'Index Scan', relation: 'orders', index, indexCond: cond, children: [] }
}

/** The plan the model would produce for this configuration. */
export function planFor(config: PlanConfig): PlanNode {
  let node = scanFor(config)

  if (config.join) {
    const inner: PlanNode = {
      nodeType: 'Index Scan',
      relation: 'customers',
      index: 'customers_pkey',
      indexCond: '(id = orders.customer_id)',
      children: [],
    }

    const { estimated } = rowEstimate(config)

    // The choice that decides everything. A nested loop is the right plan when
    // the outer side really is tiny; the planner picks it from the *estimate*,
    // so a stale statistic buys a plan that re-probes the inner side once per
    // row it did not expect.
    node = estimated < 100
      ? { nodeType: 'Nested Loop', children: [node, { nodeType: 'Materialize', children: [inner] }] }
      : {
          nodeType: 'Hash Join',
          hashCond: '(orders.customer_id = customers.id)',
          children: [node, { nodeType: 'Hash', children: [inner] }],
        }
  }

  if (config.parallel) {
    node = { nodeType: 'Gather', children: [node] }
  }

  return { nodeType: 'Limit', children: [node] }
}

/* ------------------------------------------------------------------ *
 * Timing — a model, not a measurement
 * ------------------------------------------------------------------ */

const PER_ROW_MS = 0.00025
const PER_MATCHED_ROW_MS = 0.004

/**
 * Roughly what the plan would cost, so the reader can see the cliff. The shape
 * is what pg-plan-guard compares; this is only here to make the consequence of
 * a shape change legible.
 */
export function estimateMs(config: PlanConfig): number {
  const { estimated, actual } = rowEstimate(config)
  const index = usableIndex(config)

  if (!index) return round(config.rows * PER_ROW_MS + 0.4)

  const lookup = Math.log2(Math.max(2, config.rows)) * 0.02 + actual * PER_MATCHED_ROW_MS + 0.3

  if (!config.join) return round(lookup)

  // The nested loop's cost is the whole point: one inner lookup per outer row,
  // and the planner sized it for `estimated`, not `actual`.
  if (estimated < 100) return round(lookup + actual * 0.09)
  return round(lookup + actual * 0.002 + 1.2)
}

const round = (value: number): number => Math.round(value * 100) / 100

/* ------------------------------------------------------------------ *
 * Normalisation — what pg-plan-guard actually compares
 * ------------------------------------------------------------------ */

/**
 * Masks literals out of a condition, the way the real tool does.
 *
 * String literals, `$n` parameters and bare numbers all become `?`; whitespace
 * collapses. Casts deliberately survive, because `?::date` and `?::text` are
 * not the same predicate. The digit rule ignores numbers inside identifiers, so
 * `idx_orders_2` keeps its name.
 */
export function maskLiterals(text: string): string {
  return text
    .replace(/'(?:[^']|'')*'/g, '?')
    .replace(/\$\d+/g, '?')
    .replace(/(^|[^A-Za-z0-9_$?])(\d+(?:\.\d+)?)/g, '$1?')
    .replace(/\s+/g, ' ')
    .trim()
}

export type Shape = {
  nodeType: NodeType
  relation?: string
  index?: string
  indexCond?: string
  hashCond?: string
  filter?: string
  children: Shape[]
}

/**
 * Strips a plan down to the parts that describe its structure.
 *
 * Costs, row counts and timings never enter the shape — they move on every run
 * and would make every comparison a false positive. Transparent nodes are
 * dropped, but only when they have exactly one child, so a node that is
 * genuinely restructuring the tree is never silently removed.
 */
export function normalize(node: PlanNode, transparent: NodeType[] = TRANSPARENT_NODES): Shape {
  if (transparent.includes(node.nodeType) && node.children.length === 1) {
    return normalize(node.children[0]!, transparent)
  }

  return {
    nodeType: node.nodeType,
    ...(node.relation ? { relation: node.relation } : {}),
    ...(node.index ? { index: node.index } : {}),
    ...(node.indexCond ? { indexCond: maskLiterals(node.indexCond) } : {}),
    ...(node.hashCond ? { hashCond: maskLiterals(node.hashCond) } : {}),
    ...(node.filter ? { filter: maskLiterals(node.filter) } : {}),
    children: node.children.map((child) => normalize(child, transparent)),
  }
}

/**
 * A short stand-in for the SHA-256 of the canonical shape JSON. Same purpose —
 * a cheap equality check — and deliberately not a real digest, because
 * nothing here needs one.
 */
export function shapeHash(shape: Shape): string {
  const json = JSON.stringify(shape)
  let h = 0x811c9dc5
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** `Index Scan(orders via idx_orders_customer_created)` — the report's label. */
export function label(shape: Shape): string {
  if (shape.index && shape.relation) return `${shape.nodeType}(${shape.relation} via ${shape.index})`
  if (shape.index) return `${shape.nodeType}(via ${shape.index})`
  if (shape.relation) return `${shape.nodeType}(${shape.relation})`
  return shape.nodeType
}

/* ------------------------------------------------------------------ *
 * Diffing
 * ------------------------------------------------------------------ */

export type Severity = 'info' | 'warn' | 'crit'

export type Finding = {
  severity: Severity
  /** the real finding codes, so the reader recognises them in CI output */
  code: string
  message: string
  path: string
}

const SEVERITY_ORDER: Record<Severity, number> = { info: 0, warn: 1, crit: 2 }

const usesIndex = (type: NodeType): boolean =>
  type === 'Index Scan' ||
  type === 'Index Only Scan' ||
  type === 'Bitmap Heap Scan' ||
  type === 'Bitmap Index Scan'

const isJoin = (type: NodeType): boolean =>
  type === 'Nested Loop' || type === 'Hash Join' || type === 'Merge Join'

const isSort = (type: NodeType): boolean => type === 'Sort'

/**
 * An Index Scan and a Bitmap Heap Scan over the same index are the same access
 * path; PostgreSQL picks between them on estimated row counts. Treating the
 * swap as a regression would mean a plan guard that cries wolf every time
 * traffic shifts, so it is an explicit equivalence.
 */
function bitmapSwapEquivalent(a: Shape, b: Shape): boolean {
  const oneWay = (idx: Shape, bmp: Shape): boolean =>
    idx.nodeType === 'Index Scan' &&
    bmp.nodeType === 'Bitmap Heap Scan' &&
    idx.children.length === 0 &&
    bmp.children.length === 1 &&
    bmp.children[0]!.nodeType === 'Bitmap Index Scan' &&
    idx.relation === bmp.relation &&
    idx.index === bmp.children[0]!.index

  return oneWay(a, b) || oneWay(b, a)
}

/** Every index named anywhere in a shape. */
function indexesIn(shape: Shape): string[] {
  const found = shape.index ? [shape.index] : []
  return [...found, ...shape.children.flatMap(indexesIn)]
}

export type DiffOptions = { indexBitmapSwap?: boolean }

export function compare(
  baseline: Shape,
  current: Shape,
  options: DiffOptions = {},
): Finding[] {
  const swapAllowed = options.indexBitmapSwap ?? true
  const findings: Finding[] = []
  /** Indexes already accounted for by a crit, so they are not reported twice. */
  const claimed = new Set<string>()

  const walk = (a: Shape, b: Shape, path: string): void => {
    const here = path ? `${path} > ${label(a)}` : label(a)

    if (swapAllowed && bitmapSwapEquivalent(a, b)) return

    if (a.nodeType !== b.nodeType) {
      if (usesIndex(a.nodeType) && b.nodeType === 'Seq Scan' && a.relation === b.relation) {
        // Everything the dropped subtree used is now explained by this one
        // finding; the set-level pass below must not repeat it.
        const lost = indexesIn(a)
        for (const index of lost) claimed.add(index)
        findings.push({
          severity: 'crit',
          code: 'seq-scan',
          message: `${label(a)} degraded to ${label(b)}${lost.length ? ` (lost: ${lost.join(', ')})` : ''}`,
          path: here,
        })
        return
      }
      if (isJoin(a.nodeType) && isJoin(b.nodeType)) {
        findings.push({
          severity: 'warn',
          code: 'join-method',
          message: `${a.nodeType} became ${b.nodeType}`,
          path: here,
        })
      } else if (!isSort(a.nodeType) && isSort(b.nodeType)) {
        findings.push({ severity: 'warn', code: 'sort-added', message: 'a Sort appeared', path: here })
      } else {
        findings.push({
          severity: 'warn',
          code: 'node-changed',
          message: `${a.nodeType} became ${b.nodeType}`,
          path: here,
        })
      }
    } else if (a.index && b.index && a.index !== b.index) {
      findings.push({
        severity: 'crit',
        code: 'index-changed',
        message: `index changed: ${a.index} -> ${b.index}`,
        path: here,
      })
    } else if (a.indexCond !== b.indexCond || a.filter !== b.filter || a.hashCond !== b.hashCond) {
      findings.push({
        severity: 'warn',
        code: 'predicate-changed',
        message: 'the masked predicate differs',
        path: here,
      })
    }

    if (a.children.length !== b.children.length) {
      findings.push({
        severity: 'warn',
        code: 'children-changed',
        message: `${a.children.length} child(ren) became ${b.children.length}`,
        path: here,
      })
      return
    }

    a.children.forEach((child, i) => walk(child, b.children[i]!, here))
  }

  walk(baseline, current, '')

  // A safety net over the tree as a whole: an index that vanished somewhere the
  // node-by-node walk did not flag — a restructured tree, a subtree that moved.
  const after = new Set(indexesIn(current))
  for (const index of indexesIn(baseline)) {
    if (!after.has(index) && !claimed.has(index)) {
      findings.push({
        severity: 'crit',
        code: 'index-lost',
        message: `${index} is no longer used anywhere in the plan`,
        path: label(baseline),
      })
    }
  }

  return findings
}

export const maxSeverity = (findings: Finding[]): Severity | null =>
  findings.reduce<Severity | null>(
    (worst, f) => (worst === null || SEVERITY_ORDER[f.severity] > SEVERITY_ORDER[worst] ? f.severity : worst),
    null,
  )

/**
 * Whether `check` fails. Stale and missing baselines always fail, whatever
 * `--fail-on` says: a comparison that could not be made is not a pass.
 */
export function shouldFail(
  findings: Finding[],
  failOn: Severity = 'crit',
  state: { stale?: boolean; missing?: boolean } = {},
): boolean {
  if (state.stale || state.missing) return true
  const worst = maxSeverity(findings)
  return worst !== null && SEVERITY_ORDER[worst] >= SEVERITY_ORDER[failOn]
}

/** `1 finding(s): 1 crit, 0 warn, 0 info` — the summary line the CLI prints. */
export function summary(findings: Finding[]): string {
  if (findings.length === 0) return 'ok — no plan changes'
  const count = (s: Severity): number => findings.filter((f) => f.severity === s).length
  return `${findings.length} finding(s): ${count('crit')} crit, ${count('warn')} warn, ${count('info')} info`
}
