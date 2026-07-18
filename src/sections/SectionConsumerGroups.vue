<script setup lang="ts">
import { computed } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import SimControls from '../components/SimControls.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import ClusterView from '../components/ClusterView.vue'
import { addConsumer, advance, createSim, killConsumer } from '../core/cluster'
import { useTicker } from '../composables/useTicker'

const build = () =>
  createSim({ seed: 77, partitionCount: 3, produceEveryTicks: 5, processingTicks: 5 }, ['consumer-1'])

const sim = useTicker(build, advance, { autoplay: true })

const live = computed(() => sim.state.value.group.consumers.filter((c) => c.alive))
const idle = computed(() => live.value.filter((c) => c.assigned.length === 0).length)

const add = (): void => {
  sim.set(addConsumer(sim.state.value, `consumer-${sim.state.value.group.consumers.length + 1}`))
}

const kill = (id: string): void => {
  sim.set(killConsumer(sim.state.value, id))
}
</script>

<template>
  <SectionShell
    @mounted="sim.mount"
    id="consumer-groups"
    :number="2"
    title="A group is a claim on partitions"
    lede="Consumer groups are how Kafka splits work — and also where its hardest scaling limit lives."
  >
    <template #prose>
      <p>
        Three services read <code class="font-mono text-accent-400">orders</code>:
        <code class="font-mono text-accent-400">payment-service</code>,
        <code class="font-mono text-accent-400">inventory-service</code> and
        <code class="font-mono text-accent-400">notification-service</code>. Each is its
        own consumer group, each keeps its own offsets, and each reads every single
        record independently. This is the part that makes Kafka not a queue: consuming a
        record does not remove it, and one slow service cannot starve another.
      </p>
      <p>
        Inside a group it works the other way round. The partitions are divided up, and
        every partition gets exactly one owner. Two consumers in the same group never
        read the same partition — that is what keeps per-key ordering intact once you
        scale out.
      </p>
      <p>
        Which gives you the ceiling: <strong>partition count is the maximum
        parallelism</strong>. Add a fourth consumer to a three-partition topic and it
        does not get a smaller slice of the work. It gets nothing, and sits there idle,
        holding a group membership and contributing no throughput at all.
      </p>
      <p class="text-ink-400">
        Click a consumer in the diagram to kill it and watch the partitions get picked up
        by whoever is left.
      </p>

      <PredictPrompt
        question="Your consumers cannot keep up. The topic has 6 partitions and you are running 6 consumers. What actually helps?"
        :options="[
          'Add more consumers to the group',
          'Add partitions, or make each record cheaper to process',
          'Increase the consumer poll interval',
        ]"
        :answer="1"
        explanation="At 6 of 6 you are already at the parallelism ceiling; a seventh consumer idles. You either raise the ceiling by adding partitions — accepting that keys get reshuffled — or you make the work per record smaller."
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

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-ink-950 transition hover:bg-accent-400"
          @click="add"
        >
          Add a consumer
        </button>
        <span v-if="idle > 0" class="text-xs text-warn-500">
          {{ idle }} consumer(s) idle — more consumers than partitions
        </span>
        <span v-else class="text-xs text-ink-500">
          {{ live.length }} live consumer(s) over {{ sim.state.value.partitions.length }} partitions
        </span>
      </div>

      <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <ClusterView :state="sim.state.value" @kill="kill" />
      </div>
    </template>
  </SectionShell>
</template>
