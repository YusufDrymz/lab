<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import SimControls from '../components/SimControls.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import EventLog from '../components/EventLog.vue'
import { advanceRetry, createRetry, replay, submit, type RetryState, type RetryStrategy } from '../core/retry'
import { makeOrder, TOPICS } from '../core/scenario'
import { createRng } from '../core/prng'
import { useTicker } from '../composables/useTicker'
import { REPOS, useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.kafka.sections.deadLetters)

const strategy = ref<RetryStrategy>('retry-topic')
const fixed = ref(false)

/**
 * A fixed cast: four orders, one of which carries a payload the handler will
 * always reject. The poison one is what the section is about.
 */
const build = (): RetryState => {
  const rng = createRng(1041)
  const orders = Array.from({ length: 4 }, (_, i) => makeOrder(rng, i))
  const poison = orders[1]!

  let state = createRetry({
    strategy: strategy.value,
    poison: fixed.value ? [] : [poison.order_id],
    backoff: [24, 60],
    maxInPlaceAttempts: 4,
  })
  for (const order of orders) state = submit(state, order)
  return state
}

const sim = useTicker(build, advanceRetry, { autoplay: true })

watch([strategy, fixed], () => sim.restart())

const dryRun = computed(() => replay(sim.state.value, { dryRun: true }))

const doReplay = (): void => {
  sim.set(replay(sim.state.value).state)
}

/** Deploying the fix mid-incident, without losing what is already in the DLQ. */
const deployFix = (): void => {
  fixed.value = true
  const next = structuredClone(sim.state.value)
  next.config.poison = []
  sim.set(next)
}

const blocked = computed(() => sim.state.value.headOfLineBlocked)

/** The note carries a link, so the label is split around the {tool} placeholder. */
const toolNote = computed(() => {
  const parts = (c.value.ui.toolNote ?? '').split('{tool}')
  return { before: parts[0] ?? '', after: parts[1] ?? '' }
})
</script>

<template>
  <SectionShell
    @mounted="sim.mount"
    id="dead-letters"
    :number="5"
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
          v-for="option in (['retry-in-place', 'retry-topic'] as RetryStrategy[])"
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
          {{ option === 'retry-in-place' ? c.ui.retryInPlace : c.ui.retryTopic }}
        </button>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.processed }}</p>
          <p class="font-mono text-2xl tabular-nums text-healthy-500">
            {{ sim.state.value.succeeded.length }}
          </p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="blocked > 0 ? 'border-danger-500/50 bg-danger-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.blocked }}</p>
          <p class="font-mono text-2xl tabular-nums" :class="blocked > 0 ? 'text-danger-500' : 'text-ink-600'">
            {{ blocked }}
          </p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="sim.state.value.dlq.length ? 'border-warn-500/50 bg-warn-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.deadLetters }}</p>
          <p
            class="font-mono text-2xl tabular-nums"
            :class="sim.state.value.dlq.length ? 'text-warn-500' : 'text-ink-600'"
          >
            {{ sim.state.value.dlq.length }}
          </p>
        </div>
      </div>

      <div
        v-if="sim.state.value.dlq.length"
        class="rounded-lg border border-ink-800 bg-ink-900/40 p-3"
      >
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ TOPICS.dlq }}</p>
        <div
          v-for="letter in sim.state.value.dlq"
          :key="letter.event.order_id"
          class="border-t border-ink-800 py-2 font-mono text-xs first:border-t-0"
        >
          <p class="text-ink-200">{{ letter.event.order_id }} · {{ letter.event.customer_id }}</p>
          <p class="text-danger-500">{{ letter.lastError }}</p>
          <p class="text-ink-500">
            {{ letter.attempts.length }} {{ c.ui.attempts }}{{ letter.deadAt }}
          </p>
        </div>
      </div>

      <div
        v-if="dryRun.willFailAgain.length"
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
          class="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 transition hover:border-ink-400 disabled:opacity-30"
          :disabled="!sim.state.value.dlq.length"
          @click="doReplay"
        >
          {{ c.ui.replay }}
        </button>
        <button
          type="button"
          class="rounded-md border border-healthy-500/60 px-3 py-1.5 text-sm text-healthy-500 transition hover:border-healthy-500 disabled:opacity-30"
          :disabled="fixed"
          @click="deployFix"
        >
          {{ c.ui.deployFix }}
        </button>
      </div>

      <EventLog :lines="sim.state.value.events" :limit="7" />

      <p class="text-xs text-ink-500">
        {{ toolNote.before
        }}<a :href="REPOS.kafkaDlq" rel="noopener" class="text-accent-400 underline underline-offset-2"
          >kafka-dlq</a
        >{{ toolNote.after }}
      </p>
    </template>
  </SectionShell>
</template>
