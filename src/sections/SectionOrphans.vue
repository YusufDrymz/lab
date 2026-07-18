<script setup lang="ts">
import { computed, ref } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import CheckCard from '../components/CheckCard.vue'
import { buildDataset, orphanCheck, orphanRows } from '../core/watchdog'
import { useContent } from '../content'

const content = useContent()
const c = computed(() => content.value.reconcile.sections.orphans)

const orphans = ref(0)

const data = computed(() => buildDataset({ count: 9, orphans: orphans.value }))
const check = computed(() => orphanCheck(data.value))
const rows = computed(() => orphanRows(data.value))
</script>

<template>
  <SectionShell id="orphans" :number="2" :title="c.title" :lede="c.lede">
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
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md border border-danger-500/60 px-3 py-1.5 text-sm text-danger-500 transition hover:border-danger-500 disabled:opacity-30"
          :disabled="orphans >= 7"
          @click="orphans++"
        >
          {{ c.ui.addOrphan }}
        </button>
        <button
          type="button"
          class="rounded-md border border-healthy-500/60 px-3 py-1.5 text-sm text-healthy-500 transition hover:border-healthy-500 disabled:opacity-30"
          :disabled="orphans === 0"
          @click="orphans = 0"
        >
          {{ c.ui.repair }}
        </button>
      </div>

      <div
        class="rounded-lg border p-3"
        :class="orphans > 0 ? 'border-danger-500/50 bg-danger-500/5' : 'border-ink-800 bg-ink-900/40'"
      >
        <p class="mb-1 font-mono text-[11px] text-ink-400">{{ c.ui.orphansLabel }}</p>
        <p
          class="font-mono text-2xl tabular-nums"
          :class="orphans > 0 ? 'text-danger-500' : 'text-healthy-500'"
        >
          {{ rows.length }}
        </p>
      </div>

      <div>
        <p class="mb-2 font-mono text-[11px] text-ink-400">{{ c.ui.checkLabel }}</p>
        <!-- Past five, the report still counts them all but only shows five —
             an alert is a pointer, not a data export. -->
        <CheckCard
          :result="check"
          :evidence-label="c.ui.evidenceLabel ?? 'evidence'"
          :row-label="c.ui.rowLabel ?? 'row'"
        />
      </div>
    </template>
  </SectionShell>
</template>
