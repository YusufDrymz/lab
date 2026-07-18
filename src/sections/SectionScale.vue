<script setup lang="ts">
import { computed, ref } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import PlanTree from '../components/PlanTree.vue'
import {
  DEFAULT_PLAN_CONFIG,
  estimateMs,
  IDX_CUSTOMER,
  normalize,
  planFor,
  type PlanConfig,
} from '../core/plans'
import { useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.plans.sections.scale)

/**
 * The slider is logarithmic: the interesting range spans four orders of
 * magnitude, and a linear slider would spend nine tenths of its travel between
 * one million and ten million rows.
 */
const exponent = ref(3)
const rows = computed(() => Math.round(10 ** exponent.value))

const withIndex = computed<PlanConfig>(() => ({
  ...DEFAULT_PLAN_CONFIG,
  rows: rows.value,
  indexes: [IDX_CUSTOMER],
}))
const withoutIndex = computed<PlanConfig>(() => ({ ...withIndex.value, indexes: [] }))

const indexedMs = computed(() => estimateMs(withIndex.value))
const scanMs = computed(() => estimateMs(withoutIndex.value))

/** How many times slower the scan is — the number that makes the point. */
const factor = computed(() => Math.round(scanMs.value / Math.max(0.01, indexedMs.value)))

const format = (value: number): string => Intl.NumberFormat('en').format(value)
</script>

<template>
  <SectionShell id="scale" :number="2" :title="c.title" :lede="c.lede">
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
        <div class="mb-2 flex items-baseline justify-between">
          <p class="font-mono text-[11px] text-ink-400">{{ c.ui.rowsLabel }}</p>
          <p class="font-mono text-sm tabular-nums text-ink-200">{{ format(rows) }}</p>
        </div>
        <input
          v-model.number="exponent"
          type="range"
          min="3"
          max="7"
          step="0.1"
          class="w-full accent-accent-500"
        />
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <div class="mb-2 flex items-baseline justify-between">
            <p class="font-mono text-[11px] text-ink-400">{{ c.ui.withIndex }}</p>
            <p class="font-mono text-xs text-healthy-500">{{ c.ui.estimate }} {{ indexedMs }} ms</p>
          </div>
          <PlanTree :shape="normalize(planFor(withIndex))" />
        </div>

        <div
          class="rounded-lg border p-3"
          :class="factor > 20 ? 'border-danger-500/50 bg-danger-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <div class="mb-2 flex items-baseline justify-between">
            <p class="font-mono text-[11px] text-ink-400">{{ c.ui.withoutIndex }}</p>
            <p
              class="font-mono text-xs"
              :class="factor > 20 ? 'text-danger-500' : 'text-warn-500'"
            >
              {{ c.ui.estimate }} {{ scanMs }} ms
            </p>
          </div>
          <PlanTree :shape="normalize(planFor(withoutIndex))" :danger="['Seq Scan']" />
        </div>
      </div>

      <!-- The ratio is the argument: at a thousand rows nobody would notice,
           and the same two plans are four orders of magnitude apart later. -->
      <div
        class="rounded-lg border p-3 text-sm"
        :class="
          factor > 20
            ? 'border-danger-500/40 bg-danger-500/5 text-danger-500'
            : 'border-ink-800 bg-ink-900/40 text-ink-400'
        "
      >
        {{ factor }}× {{ c.ui.slower }}
      </div>
    </template>
  </SectionShell>
</template>
