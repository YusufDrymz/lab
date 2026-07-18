<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import EventLog from '../components/EventLog.vue'
import {
  checkConsistency,
  createWritePath,
  handleOrder,
  runRelay,
  type CrashPoint,
  type WriteStrategy,
} from '../core/writepath'
import { makeOrder } from '../core/scenario'
import { createRng } from '../core/prng'
import { useContent } from '../content'

const c = computed(() => useContent().value.kafka.sections.writePath)

const strategy = ref<WriteStrategy>('dual-write')
const crashAt = ref<CrashPoint>('after-db-commit')

// shallowRef, not ref: the core clones state with structuredClone, and a deeply
// reactive ref would hand it a Proxy, which structuredClone refuses to clone.
// The state is replaced wholesale on every transition anyway, so deep
// reactivity would buy nothing but that crash.
const state = shallowRef(createWritePath(strategy.value, crashAt.value))

const reset = (): void => {
  state.value = createWritePath(strategy.value, crashAt.value)
}

const chooseStrategy = (value: WriteStrategy): void => {
  strategy.value = value
  reset()
}

const chooseCrash = (value: CrashPoint): void => {
  crashAt.value = value
  reset()
}

const rng = createRng(1041)
let sequence = 0

const sendOrder = (): void => {
  state.value = handleOrder(state.value, makeOrder(rng, sequence++))
}

const relay = (): void => {
  state.value = runRelay(state.value)
}

const verdict = computed(() => checkConsistency(state.value))
const pendingOutbox = computed(() => state.value.outbox.filter((r) => !r.published).length)

const strategies = computed<{ value: WriteStrategy; label: string }[]>(() => [
  { value: 'dual-write', label: c.value.ui.dualWrite! },
  { value: 'outbox', label: c.value.ui.outbox! },
  { value: 'cdc', label: c.value.ui.cdc! },
])

const crashes = computed<{ value: CrashPoint; label: string }[]>(() => [
  { value: 'none', label: c.value.ui.noCrash! },
  { value: 'after-db-commit', label: c.value.ui.crashAfterCommit! },
  { value: 'after-publish', label: c.value.ui.crashAfterPublish! },
])
</script>

<template>
  <SectionShell id="write-path" :number="0" :title="c.title" :lede="c.lede">
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
      <div class="flex flex-wrap gap-2">
        <button
          v-for="option in strategies"
          :key="option.value"
          type="button"
          class="rounded-md border px-3 py-1.5 text-sm transition"
          :class="
            strategy === option.value
              ? 'border-accent-500 text-ink-50'
              : 'border-ink-700 text-ink-400 hover:border-ink-500'
          "
          @click="chooseStrategy(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="option in crashes"
          :key="option.value"
          type="button"
          class="rounded-md border px-3 py-1.5 text-xs transition"
          :class="
            crashAt === option.value
              ? 'border-danger-500 text-ink-50'
              : 'border-ink-800 text-ink-500 hover:border-ink-600'
          "
          @click="chooseCrash(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="rounded-lg border border-ink-800 bg-ink-900/50 p-3">
          <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.ordersTable }}</p>
          <p class="font-mono text-2xl tabular-nums text-ink-50">{{ state.db.length }}</p>
        </div>
        <div class="rounded-lg border border-ink-800 bg-ink-900/50 p-3">
          <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.outboxLabel }}</p>
          <p
            class="font-mono text-2xl tabular-nums"
            :class="pendingOutbox > 0 ? 'text-warn-500' : 'text-ink-50'"
          >
            {{ pendingOutbox }}
          </p>
        </div>
        <div class="rounded-lg border border-ink-800 bg-ink-900/50 p-3">
          <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.ordersTopic }}</p>
          <p class="font-mono text-2xl tabular-nums text-accent-400">{{ state.topic.length }}</p>
        </div>
      </div>

      <div
        class="rounded-lg border p-3 text-sm"
        :class="
          verdict.consistent
            ? 'border-healthy-500/40 bg-healthy-500/5 text-healthy-500'
            : 'border-danger-500/40 bg-danger-500/5 text-danger-500'
        "
      >
        <template v-if="verdict.consistent">{{ c.ui.consistent }}</template>
        <template v-else>
          <span v-if="verdict.lost.length">
            {{ verdict.lost.length }} {{ c.ui.lost }} {{ verdict.lost.join(', ') }}.
          </span>
          <span v-if="verdict.phantom.length">
            {{ verdict.phantom.length }} {{ c.ui.phantom }} {{ verdict.phantom.join(', ') }}.
          </span>
        </template>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-ink-950 transition hover:bg-accent-400 disabled:opacity-40"
          :disabled="state.appCrashed"
          @click="sendOrder"
        >
          {{ c.ui.placeOrder }}
        </button>
        <button
          type="button"
          class="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 transition hover:border-ink-400"
          @click="relay"
        >
          {{ c.ui.runRelay }}
        </button>
        <button
          type="button"
          class="rounded-md border border-ink-700 px-3 py-1.5 text-sm text-ink-400 transition hover:border-ink-500"
          @click="reset"
        >
          {{ c.ui.reset }}
        </button>
      </div>

      <EventLog :lines="state.events" :limit="9" />
    </template>
  </SectionShell>
</template>
