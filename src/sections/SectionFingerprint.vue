<script setup lang="ts">
import { computed, ref } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import SimControls from '../components/SimControls.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import EventLog from '../components/EventLog.vue'
import {
  advanceIdem,
  createIdem,
  send,
  totalCharged,
  type IdemState,
} from '../core/idempotency'
import { useTicker } from '../composables/useTicker'
import { useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.idempotency.sections.fingerprint)

const KEY = 'idem-7f3a'
const AMOUNT = '249.90'
const OTHER_AMOUNT = '999.00'

const build = (): IdemState =>
  createIdem({ protection: 'insert-on-conflict', processingTicks: 12, clientTimeoutTicks: 30 })

const sim = useTicker(build, advanceIdem, { autoplay: true })

/**
 * Toggled on the live state rather than through a rebuild: the point of the
 * section is deploying a fix mid-incident and retrying the same key.
 */
const handlerFails = ref(false)
const toggleFailure = (): void => {
  handlerFails.value = !handlerFails.value
  const next = structuredClone(sim.state.value)
  next.config.handlerFails = handlerFails.value
  sim.set(next)
}

const pay = (amount: string, isRetry = false): void => {
  sim.set(send(sim.state.value, { key: KEY, amount, isRetry }))
}

const attempts = computed(() => sim.state.value.attempts)
const entry = computed(() => sim.state.value.store.find((e) => e.key === KEY))
const charges = computed(() => sim.state.value.charges)

const statusClass = (status: number): string =>
  status === 201 ? 'text-healthy-500' : status === 422 || status === 500 ? 'text-danger-500' : 'text-warn-500'
</script>

<template>
  <SectionShell
    @mounted="sim.mount"
    id="fingerprint"
    :number="4"
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
          class="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 transition hover:border-ink-400"
          @click="pay(AMOUNT)"
        >
          {{ c.ui.sendOriginal }}
        </button>
        <button
          type="button"
          class="rounded-md border border-danger-500/60 px-3 py-1.5 text-sm text-danger-500 transition hover:border-danger-500"
          @click="pay(OTHER_AMOUNT)"
        >
          {{ c.ui.sendDifferent }}
        </button>
        <button
          type="button"
          class="rounded-md border border-warn-500/60 px-3 py-1.5 text-sm text-warn-500 transition hover:border-warn-500"
          @click="pay(AMOUNT, true)"
        >
          {{ c.ui.retry }}
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md border px-3 py-1.5 text-sm transition"
          :class="
            handlerFails
              ? 'border-danger-500 text-danger-500'
              : 'border-ink-700 text-ink-400 hover:border-ink-500'
          "
          @click="toggleFailure"
        >
          {{ c.ui.failToggle }}
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.charges }}</p>
          <p class="font-mono text-2xl tabular-nums text-healthy-500">{{ charges.length }}</p>
        </div>
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.total }}</p>
          <p class="font-mono text-2xl tabular-nums text-ink-200">
            {{ totalCharged(sim.state.value) }}
          </p>
        </div>
      </div>

      <!-- The row disappearing after a failure is the thing to watch: the key
           was claimed, the handler did not commit, so the claim is given back. -->
      <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.storeLabel }}</p>
        <p v-if="entry" class="font-mono text-xs text-ink-200">
          {{ entry.key }} ·
          <span :class="entry.state === 'completed' ? 'text-healthy-500' : 'text-warn-500'">
            {{ entry.state }}
          </span>
          <template v-if="entry.statusCode"> · {{ entry.statusCode }} {{ entry.body }}</template>
        </p>
        <p v-else class="font-mono text-xs text-ink-600">{{ c.ui.empty }}</p>
      </div>

      <div v-if="attempts.length" class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.requests }}</p>
        <div
          v-for="attempt in attempts.slice(-5)"
          :key="attempt.id"
          class="border-t border-ink-800 py-2 font-mono text-xs first:border-t-0"
        >
          <div class="flex items-baseline justify-between gap-3">
            <span class="text-ink-200">{{ attempt.id }} · {{ attempt.amount }}</span>
            <span v-if="attempt.response" :class="statusClass(attempt.response.status)">
              {{ attempt.response.status }}
            </span>
          </div>
          <p v-if="attempt.response && attempt.response.status !== 201" class="text-ink-500">
            {{ attempt.response.body }}
          </p>
        </div>
      </div>

      <EventLog :lines="sim.state.value.log" :limit="7" />
    </template>
  </SectionShell>
</template>
