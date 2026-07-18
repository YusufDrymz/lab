<script setup lang="ts">
import { computed } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import SimControls from '../components/SimControls.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import ClusterView from '../components/ClusterView.vue'
import { addConsumer, advance, createSim, killConsumer } from '../core/cluster'
import { useTicker } from '../composables/useTicker'
import { useContent } from '../content'

const c = computed(() => useContent().value.kafka.sections.groups)

const build = () =>
  createSim({ seed: 77, partitionCount: 3, produceEveryTicks: 5, processingTicks: 5 }, ['consumer-1'])

const sim = useTicker(build, advance, { autoplay: true })

const live = computed(() => sim.state.value.group.consumers.filter((x) => x.alive))
const idle = computed(() => live.value.filter((x) => x.assigned.length === 0).length)

const add = (): void => {
  sim.set(addConsumer(sim.state.value, `consumer-${sim.state.value.group.consumers.length + 1}`))
}

const kill = (id: string): void => {
  sim.set(killConsumer(sim.state.value, id))
}
</script>

<template>
  <SectionShell
    @mounted="sim.mount"
    id="consumer-groups"
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

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-ink-950 transition hover:bg-accent-400"
          @click="add"
        >
          {{ c.ui.addConsumer }}
        </button>
        <span v-if="idle > 0" class="text-xs text-warn-500">
          {{ idle }} {{ c.ui.idle }}
        </span>
        <span v-else class="text-xs text-ink-500">
          {{ live.length }} {{ c.ui.liveOver }} {{ sim.state.value.partitions.length }}
          {{ c.ui.partitionsWord }}
        </span>
      </div>

      <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <ClusterView :state="sim.state.value" @kill="kill" />
      </div>
    </template>
  </SectionShell>
</template>
