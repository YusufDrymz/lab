<script setup lang="ts">
import type { Block } from '../content'

/**
 * Renders authored prose blocks.
 *
 * v-html is used deliberately and is safe here: these strings are authored by
 * us and compiled into the bundle at build time. Nothing user-supplied, fetched
 * or runtime-interpolated ever reaches this component — if that ever changes,
 * this is the line that has to change with it.
 */
defineProps<{ blocks: Block[] }>()

const toneClass = (tone?: Block['tone']): string => {
  switch (tone) {
    case 'accent':
      return 'rounded-md border-l-2 border-accent-500 pl-4 text-ink-300'
    case 'warn':
      return 'rounded-md border-l-2 border-warn-500 pl-4 text-ink-300'
    case 'danger':
      return 'rounded-md border-l-2 border-danger-500 pl-4 text-ink-300'
    case 'muted':
      return 'text-ink-400'
    default:
      return ''
  }
}
</script>

<template>
  <p
    v-for="(block, index) in blocks"
    :key="index"
    :class="toneClass(block.tone)"
    class="[&_code]:font-mono [&_code]:text-accent-400 [&_strong]:text-ink-50"
    v-html="block.html"
  />
</template>
