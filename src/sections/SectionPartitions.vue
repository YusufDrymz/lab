<script setup lang="ts">
import { computed, ref } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import SimControls from '../components/SimControls.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import ClusterView from '../components/ClusterView.vue'
import { advance, createSim } from '../core/cluster'
import { partitionForKey } from '../core/partition'
import { CUSTOMERS, HOT_CUSTOMER } from '../core/scenario'
import { useTicker } from '../composables/useTicker'

const partitionCount = ref(3)
const skewed = ref(false)

const build = () =>
  createSim(
    { seed: 1041, partitionCount: partitionCount.value, skewed: skewed.value, produceEveryTicks: 5 },
    ['consumer-1'],
  )

const sim = useTicker(build, advance, { autoplay: true })

const rebuild = (): void => {
  sim.restart()
}

/** The routing table, computed the same way the simulation does it. */
const routing = computed(() =>
  CUSTOMERS.map((key) => ({
    key,
    partition: partitionForKey(key, partitionCount.value),
    hot: key === HOT_CUSTOMER && skewed.value,
  })),
)
</script>

<template>
  <SectionShell
    @mounted="sim.mount"
    id="partitions"
    :number="1"
    title="A key decides everything"
    lede="Ordering in Kafka is not a property of the topic. It is a property of the key you chose, and most surprises trace back to that choice."
  >
    <template #prose>
      <p>
        Our producer writes orders to <code class="font-mono text-accent-400">orders</code>
        with the customer id as the key. The broker hashes that key with murmur2 and takes
        it modulo the partition count. Same key, same partition — always.
      </p>
      <p>
        This is the whole ordering guarantee, and it is narrower than people expect.
        Kafka promises that <strong>records with the same key arrive in the order they
        were written</strong>. It promises nothing at all about the order of two records
        with different keys, because they live in different partitions being read by
        different consumers at different speeds.
      </p>
      <p>
        Turn on the skew and watch what happens to
        <code class="font-mono text-accent-400">{{ HOT_CUSTOMER }}</code>. One customer
        producing most of the traffic means one partition holding most of the records —
        a hot partition. Adding consumers will not help: that key is pinned to that
        partition, and a partition is read by exactly one consumer in the group.
      </p>
      <p class="rounded-md border-l-2 border-warn-500 pl-4 text-ink-300">
        Change the partition count and look at the routing table. Keys move. That is why
        adding partitions to a live topic quietly breaks ordering for every key already
        in flight — the old records stay where they were, the new ones land somewhere
        else.
      </p>

      <PredictPrompt
        question="Your topic has 3 partitions and one customer generates 60% of orders. You add 3 more consumers. What happens to that customer's backlog?"
        :options="[
          'It drains roughly twice as fast',
          'Nothing changes — it is still one partition, one consumer',
          'Kafka rebalances the key across the new consumers',
        ]"
        :answer="1"
        explanation="A key maps to one partition, and within a consumer group a partition has exactly one owner. Extra consumers sit idle. The only fixes are a better key, or more partitions — and more partitions reshuffles everything."
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

      <div class="flex flex-wrap items-center gap-3 rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <label class="flex items-center gap-2 text-xs text-ink-400">
          partitions
          <input
            v-model.number="partitionCount"
            type="range"
            min="1"
            max="6"
            class="accent-[var(--color-accent-500)]"
            @change="rebuild"
          />
          <span class="font-mono text-ink-50">{{ partitionCount }}</span>
        </label>

        <label class="flex items-center gap-2 text-xs text-ink-400">
          <input
            v-model="skewed"
            type="checkbox"
            class="accent-[var(--color-warn-500)]"
            @change="rebuild"
          />
          skewed traffic
        </label>
      </div>

      <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <ClusterView :state="sim.state.value" :interactive="false" />
      </div>

      <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <p class="mb-2 font-mono text-[11px] text-ink-400">key → partition</p>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs sm:grid-cols-4">
          <p v-for="row in routing" :key="row.key" :class="row.hot ? 'text-warn-500' : 'text-ink-300'">
            {{ row.key }} → p{{ row.partition }}
          </p>
        </div>
      </div>
    </template>
  </SectionShell>
</template>
