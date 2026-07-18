<script setup lang="ts">
/**
 * The same transport bar in every section. Consistency matters more than
 * cleverness here: a reader who learned to pause in section 1 should not have
 * to look for the button again in section 4.
 */
import { useContent } from '../content'

defineProps<{
  running: boolean
  speed: number
  tick: number
}>()

const content = useContent()

const emit = defineEmits<{
  toggle: []
  step: []
  restart: []
  'update:speed': [value: number]
}>()

const SPEEDS = [0.5, 1, 2, 4]
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 rounded-lg border border-ink-800 bg-ink-900/60 p-2">
    <button
      type="button"
      class="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-ink-950 transition hover:bg-accent-400"
      @click="emit('toggle')"
    >
      {{ running ? content.chrome.controls.pause : content.chrome.controls.play }}
    </button>

    <button
      type="button"
      class="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 transition hover:border-ink-400 hover:text-ink-50"
      @click="emit('step')"
    >
      {{ content.chrome.controls.step }}
    </button>

    <button
      type="button"
      class="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 transition hover:border-ink-400 hover:text-ink-50"
      @click="emit('restart')"
    >
      {{ content.chrome.controls.restart }}
    </button>

    <div class="ml-auto flex items-center gap-1">
      <span class="mr-1 text-xs text-ink-400">{{ content.chrome.controls.speed }}</span>
      <button
        v-for="option in SPEEDS"
        :key="option"
        type="button"
        class="rounded px-2 py-1 text-xs transition"
        :class="
          speed === option
            ? 'bg-ink-800 text-ink-50'
            : 'text-ink-400 hover:text-ink-200'
        "
        @click="emit('update:speed', option)"
      >
        {{ option }}×
      </button>
    </div>

    <span class="font-mono text-xs text-ink-400 tabular-nums">t{{ tick }}</span>
  </div>
</template>
