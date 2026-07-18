<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import SimControls from '../components/SimControls.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import ClusterView from '../components/ClusterView.vue'
import EventLog from '../components/EventLog.vue'
import { advance, createSim, killConsumer, type CommitMode } from '../core/cluster'
import { useTicker } from '../composables/useTicker'
import { useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.kafka.sections.offsets)

const commitMode = ref<CommitMode>('after-processing')

const build = () => {
  const state = createSim(
    { seed: 909, partitionCount: 3, produceEveryTicks: 5, processingTicks: 10 },
    ['consumer-1', 'consumer-2'],
  )
  state.group.commitMode = commitMode.value
  return state
}

const sim = useTicker(build, advance, { autoplay: true })

watch(commitMode, () => sim.restart())

const lost = computed(() => sim.state.value.events.filter((e) => e.kind === 'message-lost'))
const duplicated = computed(() =>
  sim.state.value.events.filter((e) => e.kind === 'message-duplicated'),
)

/** Killing a consumer that is mid-record is the whole experiment. */
const busyConsumer = computed(() =>
  sim.state.value.group.consumers.find((x) => x.alive && x.processing),
)

const killBusy = (): void => {
  const victim = busyConsumer.value
  if (victim) sim.set(killConsumer(sim.state.value, victim.id))
}

const kill = (id: string): void => {
  sim.set(killConsumer(sim.state.value, id))
}
</script>

<template>
  <SectionShell
    @mounted="sim.mount"
    id="offsets"
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

      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="option in (['before-processing', 'after-processing'] as CommitMode[])"
          :key="option"
          type="button"
          class="rounded-md border px-3 py-1.5 text-sm transition"
          :class="
            commitMode === option
              ? 'border-accent-500 text-ink-50'
              : 'border-ink-700 text-ink-400 hover:border-ink-500'
          "
          @click="commitMode = option"
        >
          {{ option === 'before-processing' ? c.ui.commitFirst : c.ui.commitLast }}
        </button>

        <button
          type="button"
          class="ml-auto rounded-md border border-danger-500/60 px-3 py-1.5 text-sm text-danger-500 transition hover:border-danger-500 disabled:opacity-30"
          :disabled="!busyConsumer"
          @click="killBusy"
        >
          {{ c.ui.killBusy }}
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div
          class="rounded-lg border p-3"
          :class="lost.length ? 'border-danger-500/50 bg-danger-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.lost }}</p>
          <p class="font-mono text-2xl tabular-nums" :class="lost.length ? 'text-danger-500' : 'text-ink-600'">
            {{ lost.length }}
          </p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="duplicated.length ? 'border-warn-500/50 bg-warn-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.duplicated }}</p>
          <p class="font-mono text-2xl tabular-nums" :class="duplicated.length ? 'text-warn-500' : 'text-ink-600'">
            {{ duplicated.length }}
          </p>
        </div>
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
