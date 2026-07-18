/**
 * The one scenario the whole site uses: an e-commerce order stream.
 *
 * Every section reuses these names and payloads. Nothing here is abstract
 * "message 1 / message 2" — a reader should recognise the shape from their own
 * codebase, because the failure modes only feel real if the data does.
 */
import type { Rng } from './prng'

export type OrderEvent = {
  order_id: string
  customer_id: string
  amount: string
  currency: 'TRY'
  items: number
}

/** Topic names mirror a real deployment, retry chain included. */
export const TOPICS = {
  orders: 'orders',
  retry5s: 'orders.retry.5s',
  retry1m: 'orders.retry.1m',
  dlq: 'orders.DLQ',
} as const

/** The three services that independently consume `orders`. */
export const GROUPS = {
  payment: 'payment-service',
  inventory: 'inventory-service',
  notification: 'notification-service',
} as const

/**
 * A deliberately small customer pool. Few keys over several partitions is what
 * makes skew visible: with 200 customers everything looks evenly balanced and
 * the reader learns nothing.
 */
export const CUSTOMERS = [
  'cust-1041',
  'cust-1042',
  'cust-1043',
  'cust-1044',
  'cust-1045',
  'cust-1046',
  'cust-1047',
  'cust-1048',
] as const

/**
 * `cust-1041` is our whale: it produces a disproportionate share of orders.
 * Section 1 uses it to show a hot partition — one partition backs up while the
 * others idle, and adding consumers does not help because ordering pins that
 * key to a single partition.
 */
export const HOT_CUSTOMER = CUSTOMERS[0]

export function makeOrder(rng: Rng, sequence: number, options?: { skew?: boolean }): OrderEvent {
  const customer =
    options?.skew && rng.chance(0.55) ? HOT_CUSTOMER : rng.pick(CUSTOMERS)

  // Amounts look like money, not like random floats.
  const lira = 50 + rng.int(4950)
  const kurus = rng.int(100)

  return {
    order_id: `ord-${String(9000 + sequence)}`,
    customer_id: customer,
    amount: `${lira}.${String(kurus).padStart(2, '0')}`,
    currency: 'TRY',
    items: 1 + rng.int(4),
  }
}
