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
  send,
  totalCharged,
  type IdemState,
} from '../core/idempotency'
import { useTicker } from '../composables/useTicker'
import { useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.idempotency.sections.withKey)

const KEY = 'idem-7f3a'
const AMOUNT = '249.90'

const build = (): IdemState =>
  createIdem({ protection: 'insert-on-conflict', processingTicks: 24, clientTimeoutTicks: 12 })

const sim = useTicker(build, advanceIdem, { autoplay: true })

const sendPayment = (): void => {
  sim.set(send(sim.state.value, { key: KEY, amount: AMOUNT }))
}

const retry = (): void => {
  sim.set(send(sim.state.value, { key: KEY, amount: AMOUNT, isRetry: true }))
}

const attempts = computed(() => sim.state.value.attempts)
const first = computed(() => attempts.value[0])
/** The first request has committed, so there is now something to replay. */
const settled = computed(() => first.value?.phase === 'answered')
const charges = computed(() => chargesFor(sim.state.value, KEY))
const entry = computed(() => sim.state.value.store.find((e) => e.key === KEY))
</script>

<template>
  <SectionShell
    @mounted="sim.mount"
    id="with-key"
    :number="2"
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
          :disabled="attempts.length > 0"
          @click="sendPayment"
        >
          {{ c.ui.send }}
        </button>
        <!-- Retrying before the first commits is the 409 path; after it, the replay. -->
        <button
          type="button"
          class="rounded-md border border-warn-500/60 px-3 py-1.5 text-sm text-warn-500 transition hover:border-warn-500 disabled:opacity-30"
          :disabled="!attempts.length || settled"
          @click="retry"
        >
          {{ c.ui.retryEarly }}
        </button>
        <button
          type="button"
          class="rounded-md border border-accent-500/60 px-3 py-1.5 text-sm text-accent-400 transition hover:border-accent-500 disabled:opacity-30"
          :disabled="!settled"
          @click="retry"
        >
          {{ c.ui.retry }}
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

      <div v-if="entry" class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.storeLabel }}</p>
        <p class="font-mono text-xs text-ink-200">
          {{ entry.key }} ·
          <span :class="entry.state === 'completed' ? 'text-healthy-500' : 'text-warn-500'">
            {{ entry.state }}
          </span>
          <template v-if="entry.statusCode"> · {{ entry.statusCode }} {{ entry.body }}</template>
        </p>
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
          <p v-if="attempt.response?.replayed" class="text-accent-400">{{ c.ui.replayed }}</p>
          <p v-else-if="attempt.response?.status === 201" class="text-ink-500">{{ c.ui.fresh }}</p>
        </div>
      </div>

      <EventLog :lines="sim.state.value.log" :limit="7" />
    </template>
  </SectionShell>
</template>
