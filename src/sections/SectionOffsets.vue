<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import SimControls from '../components/SimControls.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import ClusterView from '../components/ClusterView.vue'
import EventLog from '../components/EventLog.vue'
import { advance, createSim, killConsumer, type CommitMode } from '../core/cluster'
import { useTicker } from '../composables/useTicker'

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
  sim.state.value.group.consumers.find((c) => c.alive && c.processing),
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
    title="At-least-once is a decision, not a setting"
    lede="Two lines of code in a different order is the entire difference between losing a message and processing it twice."
  >
    <template #prose>
      <p>
        An offset is a bookmark: the position the group has committed to having handled.
        Consumers do not track what they read, they track what they finished — and where
        you put the commit relative to the work decides what a crash costs you.
      </p>
      <p>
        <strong>Commit before processing</strong> gives you at-most-once. The bookmark
        moves first, then the work starts. Crash in the middle and nobody will ever read
        that record again, because the group has already recorded it as done. The order
        is silently never paid for.
      </p>
      <p>
        <strong>Commit after processing</strong> gives you at-least-once. The work
        happens, then the bookmark moves. Crash in between and the record is still
        pending, so whoever picks up the partition runs it again — the customer gets
        charged twice unless the handler is idempotent.
      </p>
      <p class="rounded-md border-l-2 border-accent-500 pl-4 text-ink-300">
        There is no third option that makes the problem disappear. Kafka's transactional
        producer gets you exactly-once <em>within Kafka</em> — read a topic, write a
        topic, commit the offset atomically. The moment your handler calls a payment API,
        you are back to at-least-once plus an idempotency key, because that external
        system is not in the transaction.
      </p>
      <p class="text-ink-400">
        Pick a commit mode, then kill the consumer while it is working. The log will tell
        you what it cost.
      </p>

      <PredictPrompt
        question="You commit after processing. A consumer charges a card, then dies before committing. What happens?"
        :options="[
          'The charge is rolled back with the offset',
          'Another consumer replays the record and charges again',
          'Kafka detects the duplicate and skips it',
        ]"
        :answer="1"
        explanation="Kafka has no idea what your handler did — it only sees an uncommitted offset, so the record is still pending and gets redelivered. The broker cannot deduplicate a side effect it never saw. That is what the idempotency key is for."
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
          {{ option === 'before-processing' ? 'Commit first (at-most-once)' : 'Commit last (at-least-once)' }}
        </button>

        <button
          type="button"
          class="ml-auto rounded-md border border-danger-500/60 px-3 py-1.5 text-sm text-danger-500 transition hover:border-danger-500 disabled:opacity-30"
          :disabled="!busyConsumer"
          @click="killBusy"
        >
          Kill a working consumer
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div
          class="rounded-lg border p-3"
          :class="lost.length ? 'border-danger-500/50 bg-danger-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">lost</p>
          <p class="font-mono text-2xl tabular-nums" :class="lost.length ? 'text-danger-500' : 'text-ink-600'">
            {{ lost.length }}
          </p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="duplicated.length ? 'border-warn-500/50 bg-warn-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">processed twice</p>
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
