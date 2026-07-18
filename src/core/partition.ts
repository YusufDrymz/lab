/**
 * Key -> partition routing.
 *
 * Kafka's default partitioner hashes the key with murmur2 and masks off the
 * sign bit. We reimplement it rather than using a simpler hash on purpose:
 * the whole point of section 1 is that routing is *deterministic and
 * key-derived*, and a reader who checks our numbers against a real cluster
 * should get the same answer.
 */

/** Kafka's murmur2, ported from org.apache.kafka.common.utils.Utils. */
export function murmur2(data: Uint8Array): number {
  const length = data.length
  const seed = 0x9747b28c
  const m = 0x5bd1e995
  const r = 24

  let h = (seed ^ length) | 0
  const length4 = length >> 2

  for (let i = 0; i < length4; i++) {
    const i4 = i * 4
    let k =
      (data[i4]! & 0xff) +
      ((data[i4 + 1]! & 0xff) << 8) +
      ((data[i4 + 2]! & 0xff) << 16) +
      ((data[i4 + 3]! & 0xff) << 24)
    k = Math.imul(k, m) | 0
    k ^= k >>> r
    k = Math.imul(k, m) | 0
    h = Math.imul(h, m) | 0
    h ^= k
  }

  // trailing bytes
  const rem = length % 4
  if (rem === 3) {
    h ^= (data[(length & ~3) + 2]! & 0xff) << 16
  }
  if (rem >= 2) {
    h ^= (data[(length & ~3) + 1]! & 0xff) << 8
  }
  if (rem >= 1) {
    h ^= data[length & ~3]! & 0xff
    h = Math.imul(h, m) | 0
  }

  h ^= h >>> 13
  h = Math.imul(h, m) | 0
  h ^= h >>> 15

  return h | 0
}

const encoder = new TextEncoder()

/**
 * The routing rule the whole site rests on: same key -> same partition, always,
 * as long as the partition count does not change. Changing the partition count
 * reshuffles every key, which is why adding partitions breaks ordering
 * guarantees for in-flight keys.
 */
export function partitionForKey(key: string, partitionCount: number): number {
  if (partitionCount <= 0) throw new Error('partitionCount must be positive')
  const hash = murmur2(encoder.encode(key))
  // Kafka masks the sign bit rather than taking an absolute value, so that
  // Integer.MIN_VALUE does not overflow back to itself.
  return (hash & 0x7fffffff) % partitionCount
}
