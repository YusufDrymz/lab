<script setup lang="ts">
import { onMounted, ref } from 'vue'

/**
 * Prose and simulation side by side, stacking on narrow screens.
 *
 * They are deliberately never separated into "an article" and "a demo page":
 * the explanation only works while the thing it describes is on screen.
 */
defineProps<{
  id: string
  number: number
  title: string
  lede: string
}>()

// Handed to the section's ticker so it can idle while scrolled out of view.
const emit = defineEmits<{ mounted: [el: HTMLElement | null] }>()
const root = ref<HTMLElement | null>(null)
onMounted(() => emit('mounted', root.value))
</script>

<template>
  <section :id="id" ref="root" class="scroll-mt-16 border-t border-ink-800 py-14">
    <header class="mb-8">
      <p class="mb-2 font-mono text-xs text-accent-500">{{ String(number).padStart(2, '0') }}</p>
      <h2 class="text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">{{ title }}</h2>
      <p class="mt-3 max-w-2xl text-ink-400">{{ lede }}</p>
    </header>

    <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div class="flex flex-col gap-5 text-[15px] leading-relaxed text-ink-200">
        <slot name="prose" />
      </div>
      <div class="flex flex-col gap-3">
        <slot name="sim" />
      </div>
    </div>
  </section>
</template>
