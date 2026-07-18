<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import SimControls from '../components/SimControls.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import EventLog from '../components/EventLog.vue'
import {
  advanceInbox,
  atRiskCount,
  crash,
  createInbox,
  deliveredCount,
  type InboxState,
  type WriteMode,
} from '../core/webhook'
import { useTicker } from '../composables/useTicker'
import { useContent } from '../content'

const c = computed(() => useContent().value.hookkeep.sections.persistFirst)

const mode = ref<WriteMode>('persist-first')

/**
 * The endpoint is slow rather than down, so events sit in flight long enough
 * for the reader to press restart while something is actually at risk. On a
 * healthy endpoint the gap closes too fast to see, which is exactly why the bug
 * survives code review.
 */
const build = (): InboxState =>
  createInbox({ mode: mode.value, health: 'slow', arrivalEvery: 10, maxAttempts: 6 })

const sim = useTicker(build, advanceInbox, { autoplay: true })

watch(mode, () => sim.restart())

const restartProcess = (): void => {
  sim.set(crash(sim.state.value))
}

const stored = computed(() => sim.state.value.events.filter((e) => e.stored).length)
const delivered = computed(() => deliveredCount(sim.state.value))
const atRisk = computed(() => atRiskCount(sim.state.value))
const lost = computed(() => sim.state.value.lost)

/** What the provider believes it has handed over successfully. */
const acked = computed(() => sim.state.value.events.filter((e) => e.providerAcked).length + lost.value)
</script>

<template>
  <SectionShell
    @mounted="sim.mount"
    id="persist-first"
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

      <div>
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.modeLabel }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in (['persist-first', 'forward-first'] as WriteMode[])"
            :key="option"
            type="button"
            class="rounded-md border px-3 py-1.5 text-sm transition"
            :class="
              mode === option
                ? 'border-accent-500 text-ink-50'
                : 'border-ink-700 text-ink-400 hover:border-ink-500'
            "
            @click="mode = option"
          >
            {{ option === 'persist-first' ? c.ui.persistFirst : c.ui.forwardFirst }}
          </button>
        </div>
      </div>

      <!-- The two views side by side are the argument: they agree in
           persist-first and drift apart in forward-first. -->
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.providerView }}</p>
          <p class="font-mono text-2xl tabular-nums text-ink-200">{{ acked }}</p>
          <p class="mt-1 font-mono text-[11px] text-ink-500">200 OK</p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="
            stored < acked ? 'border-danger-500/50 bg-danger-500/5' : 'border-ink-800 bg-ink-900/40'
          "
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.ourView }}</p>
          <p
            class="font-mono text-2xl tabular-nums"
            :class="stored < acked ? 'text-danger-500' : 'text-healthy-500'"
          >
            {{ stored }}
          </p>
          <p class="mt-1 font-mono text-[11px] text-ink-500">{{ c.ui.stored }}</p>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.delivered }}</p>
          <p class="font-mono text-2xl tabular-nums text-healthy-500">{{ delivered }}</p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="atRisk > 0 ? 'border-warn-500/50 bg-warn-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.atRisk }}</p>
          <p
            class="font-mono text-2xl tabular-nums"
            :class="atRisk > 0 ? 'text-warn-500' : 'text-ink-600'"
          >
            {{ atRisk }}
          </p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="lost > 0 ? 'border-danger-500/50 bg-danger-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.lost }}</p>
          <p
            class="font-mono text-2xl tabular-nums"
            :class="lost > 0 ? 'text-danger-500' : 'text-ink-600'"
          >
            {{ lost }}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md border border-danger-500/60 px-3 py-1.5 text-sm text-danger-500 transition hover:border-danger-500"
          @click="restartProcess"
        >
          {{ c.ui.crash }}
        </button>
      </div>

      <EventLog :lines="sim.state.value.log" :limit="7" />
    </template>
  </SectionShell>
</template>
