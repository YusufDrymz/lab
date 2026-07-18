<script setup lang="ts">
/**
 * One check, rendered the way `data-watchdog check` prints it: severity, name,
 * message, and — only when it failed — the query that finds the offending rows
 * and the first few of them.
 */
import type { CheckResult } from '../core/watchdog'

defineProps<{ result: CheckResult; evidenceLabel: string; rowLabel: string }>()
</script>

<template>
  <div
    class="rounded-lg border p-3 font-mono text-xs"
    :class="
      result.violated
        ? result.severity === 'crit'
          ? 'border-danger-500/40 bg-danger-500/5'
          : 'border-warn-500/40 bg-warn-500/5'
        : 'border-ink-800 bg-ink-900/40'
    "
  >
    <p :class="result.violated ? (result.severity === 'crit' ? 'text-danger-500' : 'text-warn-500') : 'text-healthy-500'">
      <template v-if="result.violated">[{{ result.severity.toUpperCase() }}]</template>
      <template v-else>ok:</template>
      {{ result.check }} — {{ result.message }}
    </p>

    <!-- Evidence only on failure. A passing check that dumped rows would be
         noise, and the rows are the expensive part to fetch. -->
    <template v-if="result.violated && result.evidenceSql">
      <p class="mt-2 break-all text-ink-500">{{ evidenceLabel }}: {{ result.evidenceSql }}</p>
      <p v-for="row in result.evidenceRows" :key="row" class="text-ink-500">
        {{ rowLabel }}: {{ row }}
      </p>
    </template>
  </div>
</template>
