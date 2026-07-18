<script setup lang="ts">
import { computed, ref } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import SimControls from '../components/SimControls.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import ClusterView from '../components/ClusterView.vue'
import { advance, createSim } from '../core/cluster'
import { partitionForKey } from '../core/partition'
import { CUSTOMERS, HOT_CUSTOMER } from '../core/scenario'
import { useTicker } from '../composables/useTicker'
import { useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.kafka.sections.partitions)

const partitionCount = ref(3)
const skewed = ref(false)

const build = () =>
  createSim(
    { seed: 1041, partitionCount: partitionCount.value, skewed: skewed.value, produceEveryTicks: 5 },
    ['consumer-1'],
  )

const sim = useTicker(build, advance, { autoplay: true })

const rebuild = (): void => {
  sim.restart()
}

/** The routing table, computed the same way the simulation does it. */
const routing = computed(() =>
  CUSTOMERS.map((key) => ({
    key,
    partition: partitionForKey(key, partitionCount.value),
    hot: key === HOT_CUSTOMER && skewed.value,
  })),
)
</script>

<template>
  <SectionShell
    @mounted="sim.mount"
    id="partitions"
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

      <div class="flex flex-wrap items-center gap-3 rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <label class="flex items-center gap-2 text-xs text-ink-400">
          {{ c.ui.partitions }}
          <input
            v-model.number="partitionCount"
            type="range"
            min="1"
            max="6"
            class="accent-[var(--color-accent-500)]"
            @change="rebuild"
          />
          <span class="font-mono text-ink-50">{{ partitionCount }}</span>
        </label>

        <label class="flex items-center gap-2 text-xs text-ink-400">
          <input
            v-model="skewed"
            type="checkbox"
            class="accent-[var(--color-warn-500)]"
            @change="rebuild"
          />
          {{ c.ui.skewed }}
        </label>
      </div>

      <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <ClusterView :state="sim.state.value" :interactive="false" />
      </div>

      <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.routing }}</p>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs sm:grid-cols-4">
          <p v-for="row in routing" :key="row.key" :class="row.hot ? 'text-warn-500' : 'text-ink-300'">
            {{ row.key }} → p{{ row.partition }}
          </p>
        </div>
      </div>
    </template>
  </SectionShell>
</template>
