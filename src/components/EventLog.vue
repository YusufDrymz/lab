<script setup lang="ts">
import { computed } from 'vue'
import { useContent } from '../content'

/**
 * The narration channel. Everything the reader is meant to notice is written
 * here by the model itself, so the prose and the picture can never disagree.
 */
const props = withDefaults(
  defineProps<{
    lines: string[]
    /** optional severity per line, matched by index */
    kinds?: string[]
    limit?: number
  }>(),
  { limit: 8 },
)

const content = useContent()

const visible = computed(() => {
  const start = Math.max(0, props.lines.length - props.limit)
  return props.lines.slice(start).map((text, i) => ({
    text,
    kind: props.kinds?.[start + i] ?? '',
    key: start + i,
  }))
})

const toneFor = (kind: string): string => {
  if (kind === 'message-lost') return 'text-danger-500'
  if (kind === 'message-duplicated') return 'text-warn-500'
  if (kind === 'processed') return 'text-healthy-500'
  if (kind.startsWith('rebalance')) return 'text-accent-400'
  if (kind === 'consumer-died') return 'text-danger-500'
  return 'text-ink-400'
}
</script>

<template>
  <div
    class="h-44 overflow-y-auto rounded-lg border border-ink-800 bg-ink-950 p-3 font-mono text-xs leading-relaxed"
    aria-live="polite"
  >
    <p v-if="visible.length === 0" class="text-ink-600">{{ content.chrome.emptyLog }}</p>
    <p v-for="line in visible" :key="line.key" :class="toneFor(line.kind)">
      {{ line.text }}
    </p>
  </div>
</template>
