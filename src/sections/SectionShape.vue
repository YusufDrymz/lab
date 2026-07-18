<script setup lang="ts">
import { computed, ref } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import PlanTree from '../components/PlanTree.vue'
import {
  compare,
  DEFAULT_PLAN_CONFIG,
  IDX_CUSTOMER,
  normalize,
  planFor,
  shapeHash,
  shouldFail,
  summary,
  type PlanConfig,
} from '../core/plans'
import { REPOS, useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.plans.sections.shape)

const LITERALS = ["'2026-01-01'", "'2019-06-30'", "'2024-11-15'"]

const literal = ref(LITERALS[0]!)
const parallel = ref(false)
const indexDropped = ref(false)

/** What was snapshotted into plans.lock.json when the baseline was taken. */
const baseline: PlanConfig = {
  ...DEFAULT_PLAN_CONFIG,
  rows: 400_000,
  indexes: [IDX_CUSTOMER],
  literal: LITERALS[0]!,
}

const current = computed<PlanConfig>(() => ({
  ...baseline,
  literal: literal.value,
  parallel: parallel.value,
  indexes: indexDropped.value ? [] : [IDX_CUSTOMER],
}))

const baselineShape = computed(() => normalize(planFor(baseline)))
const currentShape = computed(() => normalize(planFor(current.value)))

const findings = computed(() => compare(baselineShape.value, currentShape.value))
const failed = computed(() => shouldFail(findings.value))
const same = computed(() => shapeHash(baselineShape.value) === shapeHash(currentShape.value))

const toolNote = computed(() => {
  const parts = (c.value.ui.toolNote ?? '').split('{tool}')
  return { before: parts[0] ?? '', after: parts[1] ?? '' }
})
</script>

<template>
  <SectionShell id="shape" :number="4" :title="c.title" :lede="c.lede">
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
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.literalLabel }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in LITERALS"
            :key="option"
            type="button"
            class="rounded-md border px-3 py-1.5 font-mono text-xs transition"
            :class="
              literal === option
                ? 'border-accent-500 text-ink-50'
                : 'border-ink-700 text-ink-400 hover:border-ink-500'
            "
            @click="literal = option"
          >
            {{ option }}
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md border px-3 py-1.5 text-sm transition"
          :class="
            parallel
              ? 'border-accent-500 text-ink-50'
              : 'border-ink-700 text-ink-400 hover:border-ink-500'
          "
          @click="parallel = !parallel"
        >
          {{ c.ui.parallelLabel }}
        </button>
        <button
          type="button"
          class="rounded-md border px-3 py-1.5 text-sm transition"
          :class="
            indexDropped
              ? 'border-danger-500 text-danger-500'
              : 'border-ink-600 text-ink-200 hover:border-ink-400'
          "
          @click="indexDropped = !indexDropped"
        >
          {{ indexDropped ? c.ui.restoreIndex : c.ui.dropIndex }}
        </button>
      </div>

      <!-- Baseline and current side by side. The hashes are the point: two of
           these three controls cannot move them. -->
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.baseline }}</p>
          <PlanTree :shape="baselineShape" />
          <p class="mt-2 font-mono text-[11px] text-ink-500">
            {{ c.ui.hashLabel }} {{ shapeHash(baselineShape) }}
          </p>
        </div>

        <div
          class="rounded-lg border p-3"
          :class="same ? 'border-ink-800 bg-ink-900/40' : 'border-danger-500/50 bg-danger-500/5'"
        >
          <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.current }}</p>
          <PlanTree :shape="currentShape" :danger="['Seq Scan']" />
          <p
            class="mt-2 font-mono text-[11px]"
            :class="same ? 'text-ink-500' : 'text-danger-500'"
          >
            {{ c.ui.hashLabel }} {{ shapeHash(currentShape) }}
          </p>
        </div>
      </div>

      <div
        v-if="findings.length === 0"
        class="rounded-lg border border-healthy-500/40 bg-healthy-500/5 p-3 font-mono text-xs text-healthy-500"
      >
        {{ c.ui.identical }} {{ summary(findings) }} · {{ c.ui.exitOk }}
      </div>
      <div v-else class="flex flex-col gap-2">
        <div
          v-for="finding in findings"
          :key="finding.code + finding.path"
          class="rounded-lg border p-3 font-mono text-xs"
          :class="
            finding.severity === 'crit'
              ? 'border-danger-500/40 bg-danger-500/5 text-danger-500'
              : 'border-warn-500/40 bg-warn-500/5 text-warn-500'
          "
        >
          [{{ finding.severity.toUpperCase() }}] {{ finding.code }} — {{ finding.message }}
          <span class="block text-ink-500">{{ finding.path }}</span>
        </div>
        <p class="font-mono text-xs" :class="failed ? 'text-danger-500' : 'text-ink-400'">
          {{ summary(findings) }} · {{ failed ? c.ui.exitFail : c.ui.exitOk }}
        </p>
      </div>

      <p class="text-xs text-ink-500">
        {{ toolNote.before
        }}<a
          :href="REPOS.pgPlanGuard"
          rel="noopener"
          class="text-accent-400 underline underline-offset-2"
          >pg-plan-guard</a
        >{{ toolNote.after }}
      </p>
    </template>
  </SectionShell>
</template>
