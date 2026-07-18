<script setup lang="ts">
import { computed, ref } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import CheckCard from '../components/CheckCard.vue'
import {
  buildDataset,
  failCheck,
  freshnessCheck,
  orphanCheck,
  report,
  type CheckResult,
} from '../core/watchdog'
import { REPOS, useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.reconcile.sections.failLoud)

const NEWEST_AGE = 48
const MAX_AGE = 30
const LAG = 20

const onReplica = ref(true)
const broken = ref(false)

const results = computed<CheckResult[]>(() => {
  const freshness = freshnessCheck(NEWEST_AGE, MAX_AGE, {
    isReplica: onReplica.value,
    lagTicks: onReplica.value ? LAG : 0,
  })

  // A broken connection does not skip the check — it fails it.
  const orphans = broken.value
    ? failCheck('payment-orphans', 'integrity', 'connection refused')
    : orphanCheck(buildDataset({ count: 9 }))

  return [freshness, orphans]
})

const run = computed(() => report(results.value))

const toolNote = computed(() => {
  const parts = (c.value.ui.toolNote ?? '').split('{tool}')
  return { before: parts[0] ?? '', after: parts[1] ?? '' }
})
</script>

<template>
  <SectionShell id="fail-loud" :number="4" :title="c.title" :lede="c.lede">
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
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.replicaLabel }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in [false, true]"
            :key="String(option)"
            type="button"
            class="rounded-md border px-3 py-1.5 text-sm transition"
            :class="
              onReplica === option
                ? 'border-accent-500 text-ink-50'
                : 'border-ink-700 text-ink-400 hover:border-ink-500'
            "
            @click="onReplica = option"
          >
            {{ option ? c.ui.replica : c.ui.primary }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[10px] text-ink-400">{{ c.ui.ageLabel }}</p>
          <p class="font-mono text-xl tabular-nums text-ink-200">{{ NEWEST_AGE }}</p>
        </div>
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[10px] text-ink-400">{{ c.ui.limitLabel }}</p>
          <p class="font-mono text-xl tabular-nums text-ink-200">{{ MAX_AGE }}</p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="onReplica ? 'border-accent-500/40 bg-accent-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[10px] text-ink-400">{{ c.ui.lagLabel }}</p>
          <p
            class="font-mono text-xl tabular-nums"
            :class="onReplica ? 'text-accent-400' : 'text-ink-600'"
          >
            {{ onReplica ? LAG : 0 }}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md border px-3 py-1.5 text-sm transition"
          :class="
            broken
              ? 'border-healthy-500/60 text-healthy-500'
              : 'border-danger-500/60 text-danger-500 hover:border-danger-500'
          "
          @click="broken = !broken"
        >
          {{ broken ? c.ui.fixCheck : c.ui.breakCheck }}
        </button>
      </div>

      <div>
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.checkLabel }}</p>
        <div class="flex flex-col gap-2">
          <CheckCard
            v-for="result in run.results"
            :key="result.check"
            :result="result"
            :evidence-label="c.ui.evidenceLabel ?? 'evidence'"
            :row-label="c.ui.rowLabel ?? 'row'"
          />
        </div>
      </div>

      <!-- The summary and the exit code together: a broken check is the
           difference between "data is alive" and a non-zero exit. -->
      <div
        class="rounded-lg border p-3 font-mono text-xs"
        :class="
          run.exitCode === 0
            ? 'border-healthy-500/40 bg-healthy-500/5 text-healthy-500'
            : 'border-danger-500/40 bg-danger-500/5 text-danger-500'
        "
      >
        {{ run.summary }} · {{ c.ui.exit }} {{ run.exitCode }}
      </div>

      <p class="text-xs text-ink-500">
        {{ toolNote.before
        }}<a
          :href="REPOS.dataWatchdog"
          rel="noopener"
          class="text-accent-400 underline underline-offset-2"
          >data-watchdog</a
        >{{ toolNote.after }}
      </p>
    </template>
  </SectionShell>
</template>
