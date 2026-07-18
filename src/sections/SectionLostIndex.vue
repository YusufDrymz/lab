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
  IDX_EMAIL,
  IDX_LOWER_EMAIL,
  normalize,
  planFor,
  type PlanConfig,
} from '../core/plans'
import { useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.plans.sections.lostIndex)

/**
 * No ticker here. Nothing in this lab advances over time — a plan is a function
 * of the schema and the query, so the state is derived rather than simulated.
 */
const predicate = ref<PlanConfig['predicate']>('lower')
const functional = ref(false)

const config = computed<PlanConfig>(() => ({
  ...DEFAULT_PLAN_CONFIG,
  rows: 2_000_000,
  predicate: predicate.value,
  indexes: functional.value
    ? [IDX_CUSTOMER, IDX_EMAIL, IDX_LOWER_EMAIL]
    : [IDX_CUSTOMER, IDX_EMAIL],
}))

const shape = computed(() => normalize(planFor(config.value)))
const ms = computed(() => estimateMs(config.value))
const scanning = computed(() => JSON.stringify(shape.value).includes('Seq Scan'))
</script>

<template>
  <SectionShell id="lost-index" :number="1" :title="c.title" :lede="c.lede">
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
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.predicateLabel }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in (['plain', 'lower'] as PlanConfig['predicate'][])"
            :key="option"
            type="button"
            class="rounded-md border px-3 py-1.5 font-mono text-xs transition"
            :class="
              predicate === option
                ? 'border-accent-500 text-ink-50'
                : 'border-ink-700 text-ink-400 hover:border-ink-500'
            "
            @click="predicate = option"
          >
            {{ option === 'plain' ? c.ui.plain : c.ui.lower }}
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md border px-3 py-1.5 text-sm transition"
          :class="
            functional
              ? 'border-healthy-500/60 text-healthy-500'
              : 'border-ink-600 text-ink-200 hover:border-ink-400'
          "
          @click="functional = !functional"
        >
          {{ functional ? c.ui.dropFunctional : c.ui.addFunctional }}
        </button>
      </div>

      <div
        class="rounded-lg border p-3"
        :class="scanning ? 'border-danger-500/50 bg-danger-500/5' : 'border-ink-800 bg-ink-900/40'"
      >
        <div class="mb-2 flex items-baseline justify-between">
          <p class="font-mono text-[11px] text-ink-400">{{ c.ui.planLabel }}</p>
          <p class="font-mono text-xs" :class="scanning ? 'text-danger-500' : 'text-healthy-500'">
            {{ c.ui.estimate }} {{ ms }} ms
          </p>
        </div>
        <PlanTree :shape="shape" :danger="['Seq Scan']" />
      </div>

      <p class="font-mono text-[11px] text-ink-500">
        {{ Intl.NumberFormat('en').format(config.rows) }} {{ c.ui.rowsLabel }} · orders
      </p>
    </template>
  </SectionShell>
</template>
