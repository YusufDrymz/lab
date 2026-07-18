<script setup lang="ts">
import { computed, ref } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import PlanTree from '../components/PlanTree.vue'
import {
  compare,
  DEFAULT_PLAN_CONFIG,
  estimateMs,
  IDX_CUSTOMER,
  normalize,
  planFor,
  rowEstimate,
  type PlanConfig,
} from '../core/plans'
import { useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.plans.sections.nestedLoop)

const statsFresh = ref(true)

const base: PlanConfig = {
  ...DEFAULT_PLAN_CONFIG,
  rows: 600_000,
  join: true,
  indexes: [IDX_CUSTOMER],
}

const config = computed<PlanConfig>(() => ({ ...base, statsFresh: statsFresh.value }))
const shape = computed(() => normalize(planFor(config.value)))
const ms = computed(() => estimateMs(config.value))
const estimate = computed(() => rowEstimate(config.value))

/** How far the planner's estimate is from reality — the cause, stated plainly. */
const ratio = computed(() => Math.round(estimate.value.actual / Math.max(1, estimate.value.estimated)))

/** What a plan guard would say about the switch, using the real finding codes. */
const findings = computed(() =>
  compare(normalize(planFor({ ...base, statsFresh: true })), shape.value),
)

const format = (value: number): string => Intl.NumberFormat('en').format(value)
</script>

<template>
  <SectionShell id="nested-loop" :number="3" :title="c.title" :lede="c.lede">
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
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.statsLabel }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in [true, false]"
            :key="String(option)"
            type="button"
            class="rounded-md border px-3 py-1.5 text-sm transition"
            :class="
              statsFresh === option
                ? 'border-accent-500 text-ink-50'
                : 'border-ink-700 text-ink-400 hover:border-ink-500'
            "
            @click="statsFresh = option"
          >
            {{ option ? c.ui.fresh : c.ui.stale }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.estimatedRows }}</p>
          <p class="font-mono text-2xl tabular-nums text-ink-200">
            {{ format(estimate.estimated) }}
          </p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="ratio > 1 ? 'border-danger-500/50 bg-danger-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.actualRows }}</p>
          <p
            class="font-mono text-2xl tabular-nums"
            :class="ratio > 1 ? 'text-danger-500' : 'text-ink-200'"
          >
            {{ format(estimate.actual) }}
          </p>
          <p v-if="ratio > 1" class="mt-1 font-mono text-[11px] text-danger-500">
            {{ c.ui.offBy }} {{ ratio }}×
          </p>
        </div>
      </div>

      <div
        class="rounded-lg border p-3"
        :class="statsFresh ? 'border-ink-800 bg-ink-900/40' : 'border-danger-500/50 bg-danger-500/5'"
      >
        <div class="mb-2 flex items-baseline justify-between">
          <p class="font-mono text-[11px] text-ink-400">{{ c.ui.planLabel }}</p>
          <p class="font-mono text-xs" :class="statsFresh ? 'text-healthy-500' : 'text-danger-500'">
            {{ c.ui.estimate }} {{ ms }} ms
          </p>
        </div>
        <PlanTree :shape="shape" :danger="['Nested Loop']" />
      </div>

      <div
        v-for="finding in findings"
        :key="finding.code"
        class="rounded-lg border border-warn-500/40 bg-warn-500/5 p-3 font-mono text-xs text-warn-500"
      >
        [{{ finding.severity.toUpperCase() }}] {{ finding.code }} — {{ finding.message }}
      </div>
    </template>
  </SectionShell>
</template>
