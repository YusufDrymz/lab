<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import SectionShell from '../components/SectionShell.vue'
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

const STRATEGIES: { value: WriteStrategy; label: string }[] = [
  { value: 'dual-write', label: 'Dual write' },
  { value: 'outbox', label: 'Outbox' },
  { value: 'cdc', label: 'CDC' },
]

const CRASHES: { value: CrashPoint; label: string }[] = [
  { value: 'none', label: 'No crash' },
  { value: 'after-db-commit', label: 'Crash after COMMIT' },
  { value: 'after-publish', label: 'Crash after publish' },
]
</script>

<template>
  <SectionShell
    id="write-path"
    :number="0"
    title="Where does the data come from?"
    lede="Every other explanation of Kafka starts with a producer that already exists. The most expensive mistake happens earlier than that."
  >
    <template #prose>
      <p>
        Kafka is not a database and not a cache. It is an append-only log that your
        application <em>writes to</em> — which means that on every order you take, two
        different systems have to be updated: the database that owns the truth, and the
        log that tells everyone else about it.
      </p>
      <p>
        Those two writes are not atomic. There is no transaction that spans Postgres and
        a broker. Crash in the gap and you get one of two broken outcomes, and which one
        you get depends only on the order you happened to write the code in.
      </p>
      <p class="rounded-md border-l-2 border-accent-500 pl-4 text-ink-300">
        Worth saying plainly, because it is the most common confusion: <strong>Redis is
        not the source of this event log.</strong> Redis is a cache, a lock, a
        short-lived queue. Putting it on this path buys you another system to lose
        writes in, not durability.
      </p>
      <p>
        The fix is not to try harder at the two writes. It is to stop having two. With
        the <strong>outbox</strong> pattern the order row and the event row are written
        in a single transaction, and a separate relay drains the outbox afterwards —
        atomicity becomes the database's problem, which is the one system that is
        actually good at it. <strong>CDC</strong> goes further: no outbox table, the
        relay tails Postgres' WAL and the application never learns that Kafka exists.
      </p>

      <PredictPrompt
        question="Dual write: the app commits the order, then dies before publishing. What does the rest of the system see?"
        :options="[
          'Nothing — the order rolls back too',
          'An order that exists but was never announced',
          'The event arrives late, once the app restarts',
        ]"
        :answer="1"
        explanation="The COMMIT already happened, so the order is real and permanent. The publish never did, and nothing in the design remembers that it was supposed to. Payment, inventory and notification will never hear about this order."
      />
    </template>

    <template #sim>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="option in STRATEGIES"
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
          v-for="option in CRASHES"
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
          <p class="mb-2 font-mono text-[11px] text-ink-400">orders table</p>
          <p class="font-mono text-2xl tabular-nums text-ink-50">{{ state.db.length }}</p>
        </div>
        <div class="rounded-lg border border-ink-800 bg-ink-900/50 p-3">
          <p class="mb-2 font-mono text-[11px] text-ink-400">outbox</p>
          <p class="font-mono text-2xl tabular-nums" :class="state.outbox.filter((r) => !r.published).length > 0 ? 'text-warn-500' : 'text-ink-50'">
            {{ state.outbox.filter((r) => !r.published).length }}
          </p>
        </div>
        <div class="rounded-lg border border-ink-800 bg-ink-900/50 p-3">
          <p class="mb-2 font-mono text-[11px] text-ink-400">orders topic</p>
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
        <template v-if="verdict.consistent">Database and topic agree.</template>
        <template v-else>
          <span v-if="verdict.lost.length">
            {{ verdict.lost.length }} order(s) in the database that nobody was told about:
            {{ verdict.lost.join(', ') }}.
          </span>
          <span v-if="verdict.phantom.length">
            {{ verdict.phantom.length }} event(s) for orders that do not exist:
            {{ verdict.phantom.join(', ') }}.
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
          Place an order
        </button>
        <button
          type="button"
          class="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 transition hover:border-ink-400"
          @click="relay"
        >
          Run the relay
        </button>
        <button
          type="button"
          class="rounded-md border border-ink-700 px-3 py-1.5 text-sm text-ink-400 transition hover:border-ink-500"
          @click="reset"
        >
          Reset
        </button>
      </div>

      <EventLog :lines="state.events" :limit="9" />
    </template>
  </SectionShell>
</template>
