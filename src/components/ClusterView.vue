<script setup lang="ts">
import { computed } from 'vue'
import { lagByPartition, type SimState } from '../core/cluster'

/**
 * The picture every cluster section shares.
 *
 * SVG rather than canvas on purpose: consumers are clickable (killing one is
 * the whole interaction), the layout is a few dozen elements rather than
 * thousands, and it stays inspectable and accessible for free.
 */
const props = withDefaults(
  defineProps<{
    state: SimState
    /** how many records of tail history to draw per partition */
    window?: number
    interactive?: boolean
  }>(),
  { window: 14, interactive: true },
)

const emit = defineEmits<{ kill: [consumerId: string] }>()

const ROW_HEIGHT = 46
const CELL = 26
const LOG_X = 96
const TOP = 28

const height = computed(() => TOP + props.state.partitions.length * ROW_HEIGHT + 132)
const width = computed(() => LOG_X + props.window * CELL + 90)

const lag = computed(() => lagByPartition(props.state))

/** The tail of each partition, so a long-running sim stays readable. */
const rows = computed(() =>
  props.state.partitions.map((partition) => {
    const committed = props.state.group.committed[partition.index] ?? 0
    const start = Math.max(0, partition.records.length - props.window)
    return {
      index: partition.index,
      committed,
      start,
      cells: partition.records.slice(start).map((record) => ({
        offset: record.offset,
        key: record.key,
        done: record.offset < committed,
      })),
    }
  }),
)

const consumers = computed(() =>
  props.state.group.consumers.map((consumer, i) => ({
    ...consumer,
    x: LOG_X + i * 118,
    y: TOP + props.state.partitions.length * ROW_HEIGHT + 54,
  })),
)

const cellFill = (done: boolean, isHead: boolean): string => {
  if (done) return 'var(--color-ink-800)'
  if (isHead) return 'var(--color-accent-500)'
  return 'var(--color-accent-600)'
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    class="w-full"
    role="img"
    :aria-label="`Topic orders with ${state.partitions.length} partitions and ${state.group.consumers.length} consumers`"
  >
    <!-- partitions -->
    <g v-for="row in rows" :key="row.index">
      <text
        :x="0"
        :y="TOP + row.index * ROW_HEIGHT + 17"
        class="fill-ink-400 font-mono text-[11px]"
      >
        partition {{ row.index }}
      </text>

      <rect
        :x="LOG_X - 4"
        :y="TOP + row.index * ROW_HEIGHT - 2"
        :width="window * CELL + 8"
        :height="26"
        rx="4"
        fill="var(--color-ink-900)"
      />

      <g v-for="(cell, i) in row.cells" :key="cell.offset">
        <rect
          :x="LOG_X + i * CELL"
          :y="TOP + row.index * ROW_HEIGHT"
          :width="CELL - 4"
          :height="22"
          rx="3"
          :fill="cellFill(cell.done, cell.offset === row.committed)"
        >
          <title>offset {{ cell.offset }} · {{ cell.key }}</title>
        </rect>
      </g>

      <!-- lag badge -->
      <text
        :x="LOG_X + window * CELL + 12"
        :y="TOP + row.index * ROW_HEIGHT + 17"
        class="font-mono text-[11px]"
        :class="lag[row.index]! > 6 ? 'fill-danger-500' : 'fill-ink-400'"
      >
        lag {{ lag[row.index] }}
      </text>
    </g>

    <!-- ownership links -->
    <g v-for="consumer in consumers" :key="`link-${consumer.id}`">
      <line
        v-for="partition in consumer.assigned"
        :key="partition"
        :x1="LOG_X + 10"
        :y1="TOP + partition * ROW_HEIGHT + 11"
        :x2="consumer.x + 34"
        :y2="consumer.y - 4"
        :stroke="consumer.alive ? 'var(--color-ink-600)' : 'transparent'"
        stroke-width="1"
        stroke-dasharray="3 3"
      />
    </g>

    <!-- consumers -->
    <g
      v-for="consumer in consumers"
      :key="consumer.id"
      :class="interactive && consumer.alive ? 'cursor-pointer' : ''"
      @click="interactive && consumer.alive && emit('kill', consumer.id)"
    >
      <rect
        :x="consumer.x"
        :y="consumer.y"
        width="104"
        height="42"
        rx="6"
        :fill="consumer.alive ? 'var(--color-ink-900)' : 'transparent'"
        :stroke="consumer.alive ? 'var(--color-healthy-500)' : 'var(--color-danger-500)'"
        stroke-width="1"
        :stroke-dasharray="consumer.alive ? '' : '4 3'"
      />
      <text
        :x="consumer.x + 10"
        :y="consumer.y + 17"
        class="font-mono text-[11px]"
        :class="consumer.alive ? 'fill-ink-50' : 'fill-danger-500'"
      >
        {{ consumer.id }}
      </text>
      <text :x="consumer.x + 10" :y="consumer.y + 32" class="fill-ink-400 font-mono text-[10px]">
        <template v-if="!consumer.alive">dead</template>
        <template v-else-if="consumer.assigned.length === 0">idle — no partitions</template>
        <template v-else>
          p{{ consumer.assigned.join(', p') }}
          <template v-if="consumer.processing"> · working</template>
        </template>
      </text>
      <title v-if="interactive && consumer.alive">Click to kill {{ consumer.id }}</title>
    </g>
  </svg>
</template>
