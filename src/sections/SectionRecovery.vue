<script setup lang="ts">
import { computed, ref } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import {
  DEFAULT_QUERY,
  formatMinor,
  scan,
  type Candidate,
  type Outcome,
} from '../core/watchdog'
import { REPOS, useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.reconcile.sections.recovery)

/** A fixed cast, spread across the window so every outcome is reachable. */
const CANDIDATES: Candidate[] = [
  { id: 'pay-2001', ageTicks: 3, amountMinor: 24990 },
  { id: 'pay-2002', ageTicks: 6, amountMinor: 8450 },
  { id: 'pay-2003', ageTicks: 24, amountMinor: 119900 },
  { id: 'pay-2004', ageTicks: 45, amountMinor: 6700 },
  { id: 'pay-2005', ageTicks: 62, amountMinor: 34500 },
  { id: 'pay-2006', ageTicks: 140, amountMinor: 91000 },
]

type Answer = 'succeeded' | 'not-succeeded' | 'errors'
const answer = ref<Answer>('succeeded')

const result = computed(() =>
  scan(CANDIDATES, DEFAULT_QUERY, () =>
    answer.value === 'errors' ? 'error' : answer.value === 'succeeded',
  ),
)

const outcomeOf = (id: string): Outcome | undefined =>
  result.value.outcomes.find((o) => o.id === id)?.outcome

const OUTCOME_CLASS: Record<Outcome, string> = {
  reconciled: 'text-healthy-500',
  skipped: 'text-ink-400',
  failed: 'text-danger-500',
  'too-young': 'text-warn-500',
  abandoned: 'text-warn-500',
}

const outcomeLabel = (outcome: Outcome | undefined): string => {
  if (outcome === 'too-young') return c.value.ui.tooYoung ?? outcome
  if (outcome === 'abandoned') return c.value.ui.abandoned ?? outcome
  if (outcome === 'reconciled') return c.value.ui.reconciled ?? outcome
  if (outcome === 'skipped') return c.value.ui.skipped ?? outcome
  if (outcome === 'failed') return c.value.ui.failed ?? outcome
  return ''
}

const toolNote = computed(() => {
  const parts = (c.value.ui.toolNote ?? '').split('{tool}')
  return { before: parts[0] ?? '', after: parts[1] ?? '' }
})
</script>

<template>
  <SectionShell id="recovery" :number="3" :title="c.title" :lede="c.lede">
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
      <div>
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.providerLabel }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in (['succeeded', 'not-succeeded', 'errors'] as Answer[])"
            :key="option"
            type="button"
            class="rounded-md border px-3 py-1.5 text-sm transition"
            :class="
              answer === option
                ? 'border-accent-500 text-ink-50'
                : 'border-ink-700 text-ink-400 hover:border-ink-500'
            "
            @click="answer = option"
          >
            {{
              option === 'succeeded'
                ? c.ui.succeeded
                : option === 'not-succeeded'
                  ? c.ui.notSucceeded
                  : c.ui.errors
            }}
          </button>
        </div>
      </div>

      <p class="font-mono text-[11px] text-ink-500">
        {{ c.ui.minAge }} {{ DEFAULT_QUERY.minAgeTicks }} · {{ c.ui.maxAge }}
        {{ DEFAULT_QUERY.maxAgeTicks }}
      </p>

      <div class="grid grid-cols-4 gap-2">
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[10px] text-ink-400">{{ c.ui.scanned }}</p>
          <p class="font-mono text-xl tabular-nums text-ink-200">{{ result.stats.scanned }}</p>
        </div>
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[10px] text-ink-400">{{ c.ui.reconciled }}</p>
          <p class="font-mono text-xl tabular-nums text-healthy-500">
            {{ result.stats.reconciled }}
          </p>
        </div>
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[10px] text-ink-400">{{ c.ui.skipped }}</p>
          <p class="font-mono text-xl tabular-nums text-ink-400">{{ result.stats.skipped }}</p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="
            result.stats.failed > 0
              ? 'border-danger-500/50 bg-danger-500/5'
              : 'border-ink-800 bg-ink-900/40'
          "
        >
          <p class="mb-1 font-mono text-[10px] text-ink-400">{{ c.ui.failed }}</p>
          <p
            class="font-mono text-xl tabular-nums"
            :class="result.stats.failed > 0 ? 'text-danger-500' : 'text-ink-600'"
          >
            {{ result.stats.failed }}
          </p>
        </div>
      </div>

      <!-- Age is the whole story: the same provider answer produces a different
           outcome depending on where the record sits in the window. -->
      <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.candidates }}</p>
        <div
          v-for="candidate in CANDIDATES"
          :key="candidate.id"
          class="flex items-baseline justify-between gap-3 border-t border-ink-800 py-1.5 font-mono text-xs first:border-t-0"
        >
          <span class="text-ink-200">{{ candidate.id }}</span>
          <span class="text-ink-500">
            {{ candidate.ageTicks }} · {{ formatMinor(candidate.amountMinor) }}
          </span>
          <span :class="OUTCOME_CLASS[outcomeOf(candidate.id) ?? 'skipped']">
            {{ outcomeLabel(outcomeOf(candidate.id)) }}
          </span>
        </div>
      </div>

      <p class="text-xs text-ink-500">
        {{ toolNote.before
        }}<a
          :href="REPOS.goReconcile"
          rel="noopener"
          class="text-accent-400 underline underline-offset-2"
          >go-reconcile</a
        >{{ toolNote.after }}
      </p>
    </template>
  </SectionShell>
</template>
