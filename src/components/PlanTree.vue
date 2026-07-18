<script setup lang="ts">
/**
 * Renders a normalised plan the way `pg-plan-guard explain` prints it:
 * indented, one node per line, with the relation and index that identify it.
 *
 * Recursive — a plan is a tree and the depth is not known ahead of time. The
 * component refers to itself by filename, which `script setup` allows.
 */
import { label, type Shape } from '../core/plans'

defineProps<{
  shape: Shape
  depth?: number
  /** node types to mark as the problem, e.g. a Seq Scan that used to be a lookup */
  danger?: string[]
}>()
</script>

<template>
  <div>
    <p
      class="font-mono text-xs leading-relaxed"
      :class="danger?.includes(shape.nodeType) ? 'text-danger-500' : 'text-ink-200'"
      :style="{ paddingLeft: `${(depth ?? 0) * 14}px` }"
    >
      <span class="text-ink-500">{{ (depth ?? 0) > 0 ? '└─ ' : '' }}</span>{{ label(shape) }}
      <span v-if="shape.indexCond" class="text-ink-500">{{ shape.indexCond }}</span>
      <span v-else-if="shape.filter" class="text-ink-500">Filter: {{ shape.filter }}</span>
      <span v-else-if="shape.hashCond" class="text-ink-500">{{ shape.hashCond }}</span>
    </p>

    <PlanTree
      v-for="(child, index) in shape.children"
      :key="index"
      :shape="child"
      :depth="(depth ?? 0) + 1"
      :danger="danger"
    />
  </div>
</template>
