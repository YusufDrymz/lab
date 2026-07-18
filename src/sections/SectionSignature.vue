<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import SimControls from '../components/SimControls.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import EventLog from '../components/EventLog.vue'
import {
  advanceInbox,
  createInbox,
  deliveredCount,
  rejectedCount,
  type InboxState,
  type VerifyStatus,
} from '../core/webhook'
import { useTicker } from '../composables/useTicker'
import { useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.hookkeep.sections.signature)

const verify = ref(true)

/**
 * Every third arrival is forged. Turning verification off does not make those
 * events legitimate — it just stops anyone noticing, which is the comparison
 * the section is built around.
 */
const build = (): InboxState =>
  createInbox({ verifySignatures: verify.value, badSignatureEvery: 3, arrivalEvery: 10 })

const sim = useTicker(build, advanceInbox, { autoplay: true })

watch(verify, () => sim.restart())

const rejected = computed(() => rejectedCount(sim.state.value))
const delivered = computed(() => deliveredCount(sim.state.value))

const rows = computed(() => sim.state.value.events.slice(-6).reverse())

// See the note in SectionRetryBackoff: `ui` lookups are optional under
// noUncheckedIndexedAccess, and the parity test is what actually guards them.
const statusLabel = (status: VerifyStatus): string =>
  (status === 'verified'
    ? c.value.ui.verified
    : status === 'rejected'
      ? c.value.ui.rejected
      : c.value.ui.unverified) ?? status

const statusClass = (status: VerifyStatus): string =>
  status === 'verified'
    ? 'text-healthy-500'
    : status === 'rejected'
      ? 'text-danger-500'
      : 'text-warn-500'
</script>

<template>
  <SectionShell
    @mounted="sim.mount"
    id="signatures"
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

      <div>
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.verifierLabel }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in [true, false]"
            :key="String(option)"
            type="button"
            class="rounded-md border px-3 py-1.5 text-sm transition"
            :class="
              verify === option
                ? 'border-accent-500 text-ink-50'
                : 'border-ink-700 text-ink-400 hover:border-ink-500'
            "
            @click="verify = option"
          >
            {{ option ? c.ui.verifierOn : c.ui.verifierOff }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.delivered }}</p>
          <p class="font-mono text-2xl tabular-nums text-healthy-500">{{ delivered }}</p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="
            rejected > 0 ? 'border-danger-500/50 bg-danger-500/5' : 'border-ink-800 bg-ink-900/40'
          "
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.rejected }}</p>
          <p
            class="font-mono text-2xl tabular-nums"
            :class="rejected > 0 ? 'text-danger-500' : 'text-ink-600'"
          >
            {{ rejected }}
          </p>
        </div>
      </div>

      <!-- The two axes side by side: what the signature said, and whether a
           delivery row was ever created. -->
      <div v-if="rows.length" class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <div
          v-for="event in rows"
          :key="event.id"
          class="border-t border-ink-800 py-2 font-mono text-xs first:border-t-0"
        >
          <div class="flex items-baseline justify-between gap-3">
            <span class="text-ink-200">{{ event.id }}</span>
            <span :class="statusClass(event.verifyStatus)">{{ statusLabel(event.verifyStatus) }}</span>
          </div>
          <p v-if="event.delivery === null" class="text-ink-500">
            {{ c.ui.evidence }} · {{ c.ui.reason }}: {{ event.verifyReason }}
          </p>
          <p v-else class="text-ink-500">{{ event.type }} · {{ event.delivery }}</p>
        </div>
      </div>

      <EventLog :lines="sim.state.value.log" :limit="7" />
    </template>
  </SectionShell>
</template>
