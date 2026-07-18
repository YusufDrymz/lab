<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import SimControls from '../components/SimControls.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import EventLog from '../components/EventLog.vue'
import {
  advanceInbox,
  countByDelivery,
  createInbox,
  deadCount,
  deliveredCount,
  setHealth,
  type EndpointHealth,
  type InboxState,
} from '../core/webhook'
import { useTicker } from '../composables/useTicker'
import { useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.hookkeep.sections.retryBackoff)

const health = ref<EndpointHealth>('down')

const build = (): InboxState =>
  createInbox({
    health: health.value,
    arrivalEvery: 12,
    maxAttempts: 5,
    baseBackoff: 6,
    maxBackoff: 120,
  })

const sim = useTicker(build, advanceInbox, { autoplay: true })

// Changing the endpoint mid-run is the interesting move, so this flips health
// on the live state rather than rebuilding and throwing the incident away.
watch(health, (next) => sim.set(setHealth(sim.state.value, next)))

const delivered = computed(() => deliveredCount(sim.state.value))
const retrying = computed(() => countByDelivery(sim.state.value, 'retrying'))
const dead = computed(() => deadCount(sim.state.value))

/** In-flight and dead deliveries, newest first — the dead ones are the story. */
const rows = computed(() =>
  sim.state.value.events
    .filter((event) => event.delivery !== null && event.delivery !== 'delivered')
    .slice(-6)
    .reverse(),
)

const HEALTH_OPTIONS: EndpointHealth[] = ['up', 'slow', 'down']

// `ui` is a Record<string, string>, so every lookup is optional under
// noUncheckedIndexedAccess. The parity test already guarantees these keys exist
// in both locales; the fallback is here to satisfy the compiler, not the reader.
const healthLabel = (option: EndpointHealth): string =>
  (option === 'up' ? c.value.ui.up : option === 'slow' ? c.value.ui.slow : c.value.ui.down) ?? option
</script>

<template>
  <SectionShell
    @mounted="sim.mount"
    id="retry"
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

      <div>
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.endpointLabel }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in HEALTH_OPTIONS"
            :key="option"
            type="button"
            class="rounded-md border px-3 py-1.5 text-sm transition"
            :class="
              health === option
                ? 'border-accent-500 text-ink-50'
                : 'border-ink-700 text-ink-400 hover:border-ink-500'
            "
            @click="health = option"
          >
            {{ healthLabel(option) }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.delivered }}</p>
          <p class="font-mono text-2xl tabular-nums text-healthy-500">{{ delivered }}</p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="retrying > 0 ? 'border-warn-500/50 bg-warn-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.retrying }}</p>
          <p
            class="font-mono text-2xl tabular-nums"
            :class="retrying > 0 ? 'text-warn-500' : 'text-ink-600'"
          >
            {{ retrying }}
          </p>
        </div>
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
      </div>

      <!-- Watching one row's backoff grow is what makes "exponential" concrete. -->
      <div v-if="rows.length" class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <div
          v-for="event in rows"
          :key="event.id"
          class="border-t border-ink-800 py-2 font-mono text-xs first:border-t-0"
        >
          <div class="flex items-baseline justify-between gap-3">
            <span class="text-ink-200">{{ event.id }}</span>
            <span :class="event.delivery === 'dead' ? 'text-danger-500' : 'text-warn-500'">
              {{ event.delivery === 'dead' ? c.ui.dead : c.ui.retrying }}
            </span>
          </div>
          <p class="text-ink-500">
            {{ event.attempts.length }} {{ c.ui.attempts }}
            <template v-if="event.delivery !== 'dead' && event.waitTicks > 0">
              · {{ c.ui.nextIn }} {{ event.waitTicks }}
            </template>
          </p>
        </div>
      </div>

      <EventLog :lines="sim.state.value.log" :limit="7" />
    </template>
  </SectionShell>
</template>
