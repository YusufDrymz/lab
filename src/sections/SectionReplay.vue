<script setup lang="ts">
import { computed } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import SimControls from '../components/SimControls.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import EventLog from '../components/EventLog.vue'
import {
  advanceInbox,
  createInbox,
  deadCount,
  deliveredCount,
  replayDead,
  setHealth,
  type InboxState,
} from '../core/webhook'
import { useTicker } from '../composables/useTicker'
import { REPOS, useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.hookkeep.sections.replay)

/**
 * Starts with the endpoint already down and a short attempt budget, so a
 * backlog of dead deliveries builds without the reader having to wait for it.
 * The section is about what you do next, not about getting into the hole.
 */
const build = (): InboxState =>
  createInbox({ health: 'down', arrivalEvery: 8, maxAttempts: 2, baseBackoff: 4 })

const sim = useTicker(build, advanceInbox, { autoplay: true })

const dead = computed(() => deadCount(sim.state.value))
const delivered = computed(() => deliveredCount(sim.state.value))
const healthy = computed(() => sim.state.value.config.health === 'up')

const dryRun = computed(() => replayDead(sim.state.value, { dryRun: true }))

const bringUp = (): void => {
  sim.set(setHealth(sim.state.value, 'up'))
}

const doReplay = (): void => {
  sim.set(replayDead(sim.state.value).state)
}

const replayedCount = computed(
  () => sim.state.value.events.filter((e) => e.deliveryKind === 'replay').length,
)

/** The note carries a link, so the label is split around the {tool} placeholder. */
const toolNote = computed(() => {
  const parts = (c.value.ui.toolNote ?? '').split('{tool}')
  return { before: parts[0] ?? '', after: parts[1] ?? '' }
})
</script>

<template>
  <SectionShell
    @mounted="sim.mount"
    id="replay"
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

      <div class="grid grid-cols-3 gap-3">
        <div
          class="rounded-lg border p-3"
          :class="dead > 0 ? 'border-danger-500/50 bg-danger-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.dead }}</p>
          <p
            class="font-mono text-2xl tabular-nums"
            :class="dead > 0 ? 'text-danger-500' : 'text-ink-600'"
          >
            {{ dead }}
          </p>
        </div>
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.delivered }}</p>
          <p class="font-mono text-2xl tabular-nums text-healthy-500">{{ delivered }}</p>
        </div>
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.replayed }}</p>
          <p class="font-mono text-2xl tabular-nums text-accent-400">{{ replayedCount }}</p>
        </div>
      </div>

      <!-- Dry run first, deliberately: the banner turns from red to green only
           once the endpoint is actually fixed. -->
      <div
        v-if="dryRun.selected.length && !healthy"
        class="rounded-lg border border-danger-500/40 bg-danger-500/5 p-3 text-sm text-danger-500"
      >
        {{ c.ui.dryRunPrefix }} {{ dryRun.selected.length }} · {{ c.ui.dryRunBad }}
      </div>
      <div
        v-else-if="dryRun.selected.length"
        class="rounded-lg border border-healthy-500/40 bg-healthy-500/5 p-3 text-sm text-healthy-500"
      >
        {{ c.ui.dryRunPrefix }} {{ dryRun.selected.length }} · {{ c.ui.dryRunGood }}
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md border border-healthy-500/60 px-3 py-1.5 text-sm text-healthy-500 transition hover:border-healthy-500 disabled:opacity-30"
          :disabled="healthy"
          @click="bringUp"
        >
          {{ c.ui.bringUp }}
        </button>
        <button
          type="button"
          class="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 transition hover:border-ink-400 disabled:opacity-30"
          :disabled="!dead"
          @click="doReplay"
        >
          {{ c.ui.replay }}
        </button>
      </div>

      <EventLog :lines="sim.state.value.log" :limit="7" />

      <p class="text-xs text-ink-500">
        {{ toolNote.before
        }}<a :href="REPOS.hookkeep" rel="noopener" class="text-accent-400 underline underline-offset-2"
          >hookkeep</a
        >{{ toolNote.after }}
      </p>
    </template>
  </SectionShell>
</template>
