<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import SimControls from '../components/SimControls.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import ClusterView from '../components/ClusterView.vue'
import EventLog from '../components/EventLog.vue'
import {
  addConsumer,
  advance,
  createSim,
  isStalled,
  killConsumer,
  totalLag,
  type RebalanceStrategy,
} from '../core/cluster'
import { useTicker } from '../composables/useTicker'
import { useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.kafka.sections.rebalance)

const strategy = ref<RebalanceStrategy>('eager')

const build = () => {
  const state = createSim(
    { seed: 314, partitionCount: 4, produceEveryTicks: 3, processingTicks: 4, rebalanceTicks: 40 },
    ['consumer-1', 'consumer-2'],
  )
  state.group.strategy = strategy.value
  return state
}

const sim = useTicker(build, advance, { autoplay: true })

// Switching strategy mid-run would compare two different histories, so restart.
watch(strategy, () => sim.restart())

const stalled = computed(() => isStalled(sim.state.value))
const lag = computed(() => totalLag(sim.state.value))

const kill = (id: string): void => {
  sim.set(killConsumer(sim.state.value, id))
}

const add = (): void => {
  sim.set(addConsumer(sim.state.value, `consumer-${sim.state.value.group.consumers.length + 1}`))
}
</script>

<template>
  <SectionShell
    @mounted="sim.mount"
    id="rebalance"
    :number="3"
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

      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="option in (['eager', 'cooperative'] as RebalanceStrategy[])"
          :key="option"
          type="button"
          class="rounded-md border px-3 py-1.5 text-sm transition"
          :class="
            strategy === option
              ? 'border-accent-500 text-ink-50'
              : 'border-ink-700 text-ink-400 hover:border-ink-500'
          "
          @click="strategy = option"
        >
          {{ option === 'eager' ? c.ui.eager : c.ui.cooperative }}
        </button>

        <button
          type="button"
          class="ml-auto rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 transition hover:border-ink-400"
          @click="add"
        >
          {{ c.ui.addConsumer }}
        </button>
      </div>

      <div
        class="flex items-center justify-between rounded-lg border p-3 text-sm transition"
        :class="
          stalled
            ? 'border-danger-500/50 bg-danger-500/5 text-danger-500'
            : 'border-ink-800 bg-ink-900/40 text-ink-400'
        "
      >
        <span>{{ stalled ? c.ui.stalled : c.ui.stable }}</span>
        <span class="font-mono tabular-nums">
          {{ c.ui.lag }} {{ lag }} · {{ sim.state.value.group.rebalanceCount }} {{ c.ui.rebalances }}
        </span>
      </div>

      <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <ClusterView :state="sim.state.value" @kill="kill" />
      </div>

      <EventLog
        :lines="sim.state.value.events.map((e) => `t${e.tick} · ${e.text}`)"
        :kinds="sim.state.value.events.map((e) => e.kind)"
        :limit="7"
      />
    </template>
  </SectionShell>
</template>
