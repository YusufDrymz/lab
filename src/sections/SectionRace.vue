<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import SimControls from '../components/SimControls.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import EventLog from '../components/EventLog.vue'
import {
  advanceIdem,
  chargesFor,
  createIdem,
  doubleCharged,
  send,
  totalCharged,
  type IdemState,
  type Protection,
} from '../core/idempotency'
import { useTicker } from '../composables/useTicker'
import { REPOS, useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.idempotency.sections.race)

const KEY = 'idem-7f3a'
const AMOUNT = '249.90'

const protection = ref<Protection>('read-then-write')

const build = (): IdemState =>
  createIdem({ protection: protection.value, processingTicks: 20 })

const sim = useTicker(build, advanceIdem, { autoplay: true })

watch(protection, () => sim.restart())

/**
 * Both requests are queued in the same tick, so they reach the middleware
 * together — the only situation in which the two strategies differ.
 */
const sendBoth = (): void => {
  let next = send(sim.state.value, { key: KEY, amount: AMOUNT })
  next = send(next, { key: KEY, amount: AMOUNT, isRetry: true })
  sim.set(next)
}

const attempts = computed(() => sim.state.value.attempts)
const charges = computed(() => chargesFor(sim.state.value, KEY))
const bad = computed(() => doubleCharged(sim.state.value))

const toolNote = computed(() => {
  const parts = (c.value.ui.toolNote ?? '').split('{tool}')
  return { before: parts[0] ?? '', after: parts[1] ?? '' }
})
</script>

<template>
  <SectionShell @mounted="sim.mount" id="race" :number="3" :title="c.title" :lede="c.lede">
    <template #prose>
      <ProseBlocks :blocks="c.prose" />
      <PredictPrompt
        :question="c.predict.question"
        :options="c.predict.options"
        :answer="c.predict.answer"
        :explanation="c.predict.explanation"
      />
    </template>

    <template #sim>
      <SimControls
        :running="sim.running.value"
        :speed="sim.speed.value"
        :tick="sim.state.value.tick"
        @toggle="sim.toggle"
        @step="sim.step"
        @restart="sim.restart"
        @update:speed="sim.speed.value = $event"
      />

      <div>
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.protection }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in (['read-then-write', 'insert-on-conflict'] as Protection[])"
            :key="option"
            type="button"
            class="rounded-md border px-3 py-1.5 text-sm transition"
            :class="
              protection === option
                ? 'border-accent-500 text-ink-50'
                : 'border-ink-700 text-ink-400 hover:border-ink-500'
            "
            @click="protection = option"
          >
            {{ option === 'read-then-write' ? c.ui.readThenWrite : c.ui.insertOnConflict }}
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 transition hover:border-ink-400 disabled:opacity-30"
          :disabled="attempts.length > 0"
          @click="sendBoth"
        >
          {{ c.ui.sendBoth }}
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div
          class="rounded-lg border p-3"
          :class="bad ? 'border-danger-500/50 bg-danger-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.charges }}</p>
          <p
            class="font-mono text-2xl tabular-nums"
            :class="bad ? 'text-danger-500' : 'text-healthy-500'"
          >
            {{ charges.length }}
          </p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="bad ? 'border-danger-500/50 bg-danger-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.total }}</p>
          <p
            class="font-mono text-2xl tabular-nums"
            :class="bad ? 'text-danger-500' : 'text-ink-200'"
          >
            {{ totalCharged(sim.state.value) }}
          </p>
        </div>
      </div>

      <div v-if="attempts.length" class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.requests }}</p>
        <div
          v-for="attempt in attempts"
          :key="attempt.id"
          class="border-t border-ink-800 py-2 font-mono text-xs first:border-t-0"
        >
          <div class="flex items-baseline justify-between gap-3">
            <span class="text-ink-200">{{ attempt.id }}</span>
            <span
              v-if="attempt.response"
              :class="attempt.response.status === 409 ? 'text-warn-500' : 'text-healthy-500'"
            >
              {{ attempt.response.status }}
            </span>
          </div>
          <p class="text-ink-500">
            {{ attempt.response?.status === 409 ? c.ui.lost : c.ui.won }}
          </p>
        </div>
      </div>

      <EventLog :lines="sim.state.value.log" :limit="7" />

      <p class="text-xs text-ink-500">
        {{ toolNote.before
        }}<a
          :href="REPOS.goIdempotent"
          rel="noopener"
          class="text-accent-400 underline underline-offset-2"
          >go-idempotent</a
        >{{ toolNote.after }}
      </p>
    </template>
  </SectionShell>
</template>
