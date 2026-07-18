<script setup lang="ts">
import { computed, ref } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import CheckCard from '../components/CheckCard.vue'
import {
  amountCheck,
  buildDataset,
  formatMinor,
  joinPaymentsToFees,
  SQL_FANOUT,
  SQL_NO_FANOUT,
  totalOverJoin,
  totalWithoutFanout,
} from '../core/watchdog'
import { useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.reconcile.sections.multiplication)

/** Derived, not simulated: nothing here advances over time. */
const data = buildDataset({ count: 8 })
const joined = joinPaymentsToFees(data)

const fanout = ref(true)

const truth = totalWithoutFanout(data)
const inflated = totalOverJoin(joined)

const total = computed(() => (fanout.value ? inflated : truth))
const sql = computed(() => (fanout.value ? SQL_FANOUT : SQL_NO_FANOUT))

/** The threshold is the real total, so only the fan-out query fails it. */
const check = computed(() => amountCheck(data, fanout.value, `= ${truth}`))
</script>

<template>
  <SectionShell id="multiplication" :number="1" :title="c.title" :lede="c.lede">
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
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.fanoutLabel }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in [true, false]"
            :key="String(option)"
            type="button"
            class="rounded-md border px-3 py-1.5 text-sm transition"
            :class="
              fanout === option
                ? 'border-accent-500 text-ink-50'
                : 'border-ink-700 text-ink-400 hover:border-ink-500'
            "
            @click="fanout = option"
          >
            {{ option ? c.ui.withJoin : c.ui.withoutJoin }}
          </button>
        </div>
        <p class="mt-2 break-all font-mono text-[11px] text-ink-500">{{ sql }}</p>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.paymentsLabel }}</p>
          <p class="font-mono text-2xl tabular-nums text-ink-200">{{ data.payments.length }}</p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="fanout ? 'border-warn-500/50 bg-warn-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.rowsLabel }}</p>
          <p
            class="font-mono text-2xl tabular-nums"
            :class="fanout ? 'text-warn-500' : 'text-ink-200'"
          >
            {{ fanout ? joined.length : data.payments.length }}
          </p>
        </div>
        <div
          class="rounded-lg border p-3"
          :class="fanout ? 'border-danger-500/50 bg-danger-500/5' : 'border-ink-800 bg-ink-900/40'"
        >
          <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.total }}</p>
          <p
            class="font-mono text-2xl tabular-nums"
            :class="fanout ? 'text-danger-500' : 'text-healthy-500'"
          >
            {{ formatMinor(total) }}
          </p>
        </div>
      </div>

      <div
        v-if="fanout"
        class="rounded-lg border border-danger-500/40 bg-danger-500/5 p-3 font-mono text-xs text-danger-500"
      >
        {{ c.ui.truth }} {{ formatMinor(truth) }} · {{ c.ui.inflation }}
        {{ formatMinor(inflated - truth) }}
      </div>

      <!-- The joined rows themselves. Seeing the same payment id three times is
           what makes the inflated total obvious rather than abstract. -->
      <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <div
          v-for="(row, index) in joined.slice(0, 8)"
          :key="index"
          class="border-t border-ink-800 py-1.5 font-mono text-xs first:border-t-0"
          :class="fanout && row.duplicated ? 'text-danger-500' : 'text-ink-400'"
        >
          {{ row.paymentId }} · {{ formatMinor(row.paymentMinor) }} · {{ row.feeKind }}
          <span v-if="fanout && row.duplicated" class="text-ink-500">← {{ c.ui.duplicated }}</span>
        </div>
      </div>

      <div>
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.checkLabel }}</p>
        <CheckCard
          :result="check"
          :evidence-label="c.ui.evidenceLabel ?? 'evidence'"
          :row-label="c.ui.rowLabel ?? 'row'"
        />
      </div>
    </template>
  </SectionShell>
</template>
