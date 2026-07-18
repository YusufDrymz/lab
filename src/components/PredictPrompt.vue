<script setup lang="ts">
import { ref } from 'vue'
import { useContent } from '../content'

/**
 * Ask before showing.
 *
 * Making the reader commit to a guess before the simulation runs is the single
 * cheapest thing that turns watching into learning — they find out whether
 * their mental model was right, instead of nodding along to an animation.
 */
defineProps<{
  question: string
  options: string[]
  /** index of the correct option */
  answer: number
  explanation: string
}>()

const content = useContent()
const picked = ref<number | null>(null)
</script>

<template>
  <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-4">
    <p class="mb-3 text-sm font-medium text-ink-50">{{ question }}</p>

    <div class="flex flex-col gap-2">
      <button
        v-for="(option, index) in options"
        :key="option"
        type="button"
        class="rounded-md border px-3 py-2 text-left text-sm transition"
        :class="[
          picked === null
            ? 'border-ink-700 text-ink-200 hover:border-accent-500'
            : index === answer
              ? 'border-healthy-500 text-ink-50'
              : picked === index
                ? 'border-danger-500 text-ink-400'
                : 'border-ink-800 text-ink-600',
        ]"
        :disabled="picked !== null"
        @click="picked = index"
      >
        {{ option }}
      </button>
    </div>

    <p v-if="picked !== null" class="mt-3 text-sm text-ink-200">
      <span :class="picked === answer ? 'text-healthy-500' : 'text-warn-500'">
        {{ picked === answer ? content.chrome.predictRight : content.chrome.predictWrong }}
      </span>
      {{ ' ' }}{{ explanation }}
    </p>
  </div>
</template>
