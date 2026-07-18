<script setup lang="ts">
import { computed } from 'vue'
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
} from '../core/idempotency'
import { useTicker } from '../composables/useTicker'
import { useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.idempotency.sections.unprotected)

const KEY = 'idem-7f3a'
const AMOUNT = '249.90'

/** No protection at all, and a handler slower than the client's patience. */
const build = (): IdemState =>
  createIdem({ protection: 'none', processingTicks: 24, clientTimeoutTicks: 12 })

const sim = useTicker(build, advanceIdem, { autoplay: true })

const sendPayment = (): void => {
  sim.set(send(sim.state.value, { key: KEY, amount: AMOUNT }))
}

const retry = (): void => {
  sim.set(send(sim.state.value, { key: KEY, amount: AMOUNT, isRetry: true }))
}

const charges = computed(() => chargesFor(sim.state.value, KEY))
const attempts = computed(() => sim.state.value.attempts)
const sent = computed(() => attempts.value.length > 0)
const anyTimedOut = computed(() => attempts.value.some((a) => a.timedOut))
const bad = computed(() => doubleCharged(sim.state.value))
</script>

<template>
  <SectionShell
    @mounted="sim.mount"
    id="unprotected"
    :number="1"
    :title="c.title"
    :lede="c.lede"
  >
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

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 transition hover:border-ink-400 disabled:opacity-30"
          :disabled="sent"
          @click="sendPayment"
        >
          {{ c.ui.send }}
        </button>
        <button
          type="button"
          class="rounded-md border border-warn-500/60 px-3 py-1.5 text-sm text-warn-500 transition hover:border-warn-500 disabled:opacity-30"
          :disabled="!anyTimedOut || attempts.length > 1"
          @click="retry"
        >
          {{ c.ui.retry }}
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
            :class="bad ? 'text-danger-500' : 'text-ink-200'"
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
            <span v-if="attempt.response" class="text-healthy-500">
              {{ attempt.response.status }}
            </span>
            <span v-else class="text-ink-500">{{ c.ui.processing }}</span>
          </div>
          <p v-if="attempt.timedOut" class="text-warn-500">{{ c.ui.timedOut }}</p>
        </div>
      </div>

      <div
        v-if="bad"
        class="rounded-lg border border-danger-500/40 bg-danger-500/5 p-3 text-sm text-danger-500"
      >
        {{ c.ui.doubleCharged }}
      </div>

      <EventLog :lines="sim.state.value.log" :limit="7" />
    </template>
  </SectionShell>
</template>
