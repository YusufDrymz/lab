<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import SimControls from '../components/SimControls.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import EventLog from '../components/EventLog.vue'
import {
  advanceRetry,
  createRetry,
  replay,
  submit,
  type RetryState,
  type RetryStrategy,
} from '../core/retry'
import { makeOrder, TOPICS } from '../core/scenario'
import { createRng } from '../core/prng'
import { useTicker } from '../composables/useTicker'

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
</script>

<template>
  <SectionShell
    @mounted="sim.mount"
    id="dead-letters"
    :number="5"
    title="Dead letters, and the replay that makes it worse"
    lede="Kafka has no dead-letter queue. It is a convention built from ordinary topics, which is why every team builds it slightly differently and why replay is the most dangerous button in the system."
  >
    <template #prose>
      <p>
        One order in this batch carries a currency the handler rejects. It will never
        succeed, no matter how many times it runs. What you do with it decides whether
        you have one stuck order or a stuck partition.
      </p>
      <p>
        <strong>Retrying in place</strong> is the obvious approach and the wrong one. The
        consumer keeps re-running the failed record without committing, so the offset
        never advances — and because offsets advance in order, every healthy order behind
        it waits too. One bad payload stops the queue for everyone.
      </p>
      <p>
        <strong>Forwarding to a retry topic</strong> unblocks it. The failed record is
        produced to <code class="font-mono text-accent-400">{{ TOPICS.retry5s }}</code>,
        the offset is committed, and the main partition keeps flowing. The chain gives it
        two more chances with growing backoff, and if it still fails it lands in
        <code class="font-mono text-accent-400">{{ TOPICS.dlq }}</code> with its whole
        attempt history attached.
      </p>
      <p class="rounded-md border-l-2 border-danger-500 pl-4 text-ink-300">
        Then comes the part that turns an incident into a loop. Draining the DLQ back
        onto the main topic feels like recovery, but nothing about the message changed.
        It fails again, walks the chain again, and lands back in the DLQ — and on the way
        it competes with healthy traffic. <strong>Replay only helps after the fault is
        fixed.</strong> Try it in the wrong order below and watch the count come back.
      </p>

      <PredictPrompt
        question="Your DLQ has 12k messages from an outage. The bug is fixed and deployed. What do you do first?"
        :options="[
          'Drain all 12k back onto the main topic immediately',
          'Dry-run the replay, check why they failed, then drain in batches',
          'Delete the DLQ topic — the messages are stale anyway',
        ]"
        :answer="1"
        explanation="Not every message in a DLQ failed for the same reason, and 12k replayed records compete with live traffic on the same partitions. Filter by error, confirm the fix covers them, replay in controlled batches — and keep the ones that still fail separate."
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
          {{ option === 'retry-in-place' ? 'Retry in place' : 'Forward to retry topic' }}
        </button>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[11px] text-ink-400">processed</p>
          <p class="font-mono text-2xl tabular-nums text-healthy-500">
            {{ sim.state.value.succeeded.length }}
          </p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="blocked > 0 ? 'border-danger-500/50 bg-danger-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">blocked behind</p>
          <p class="font-mono text-2xl tabular-nums" :class="blocked > 0 ? 'text-danger-500' : 'text-ink-600'">
            {{ blocked }}
          </p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="sim.state.value.dlq.length ? 'border-warn-500/50 bg-warn-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">dead letters</p>
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
          <p class="text-ink-500">{{ letter.attempts.length }} attempts · died at t{{ letter.deadAt }}</p>
        </div>
      </div>

      <div
        v-if="dryRun.willFailAgain.length"
        class="rounded-lg border border-danger-500/40 bg-danger-500/5 p-3 text-sm text-danger-500"
      >
        Dry run: {{ dryRun.selected.length }} message(s) would be replayed,
        {{ dryRun.willFailAgain.length }} of them will fail again — the fault is still there.
      </div>
      <div
        v-else-if="dryRun.selected.length"
        class="rounded-lg border border-healthy-500/40 bg-healthy-500/5 p-3 text-sm text-healthy-500"
      >
        Dry run: {{ dryRun.selected.length }} message(s) would be replayed and should now succeed.
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 transition hover:border-ink-400 disabled:opacity-30"
          :disabled="!sim.state.value.dlq.length"
          @click="doReplay"
        >
          Replay the DLQ
        </button>
        <button
          type="button"
          class="rounded-md border border-healthy-500/60 px-3 py-1.5 text-sm text-healthy-500 transition hover:border-healthy-500 disabled:opacity-30"
          :disabled="fixed"
          @click="deployFix"
        >
          Deploy the fix
        </button>
      </div>

      <EventLog :lines="sim.state.value.events" :limit="7" />

      <p class="text-xs text-ink-500">
        Doing this on a real cluster is what
        <a
          href="https://github.com/YusufDrymz/kafka-dlq"
          class="text-accent-400 underline underline-offset-2"
          >kafka-dlq</a
        >
        is for — indexed dead letters, filtered replay and a dry run before you touch
        production.
      </p>
    </template>
  </SectionShell>
</template>
