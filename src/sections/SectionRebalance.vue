<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SectionShell from '../components/SectionShell.vue'
import SimControls from '../components/SimControls.vue'
import PredictPrompt from '../components/PredictPrompt.vue'
import ClusterView from '../components/ClusterView.vue'
import EventLog from '../components/EventLog.vue'
import {
  addConsumer,
  advance,
  createSim,
  isStalled,
  killConsumer,
  totalLag,
  type RebalanceStrategy,
} from '../core/cluster'
import { useTicker } from '../composables/useTicker'

const strategy = ref<RebalanceStrategy>('eager')

const build = () => {
  const state = createSim(
    { seed: 314, partitionCount: 4, produceEveryTicks: 3, processingTicks: 4, rebalanceTicks: 40 },
    ['consumer-1', 'consumer-2'],
  )
  state.group.strategy = strategy.value
  return state
}

const sim = useTicker(build, advance, { autoplay: true })

// Switching strategy mid-run would compare two different histories, so restart.
watch(strategy, () => sim.restart())

const stalled = computed(() => isStalled(sim.state.value))
const lag = computed(() => totalLag(sim.state.value))

const kill = (id: string): void => {
  sim.set(killConsumer(sim.state.value, id))
}

const add = (): void => {
  sim.set(addConsumer(sim.state.value, `consumer-${sim.state.value.group.consumers.length + 1}`))
}
</script>

<template>
  <SectionShell
    @mounted="sim.mount"
    id="rebalance"
    :number="3"
    title="The pause nobody budgets for"
    lede="Membership changes are routine. What they cost you is not, and it is the single most common source of unexplained latency spikes."
  >
    <template #prose>
      <p>
        Whenever a consumer joins or leaves, the group has to agree on who owns what.
        That negotiation is a rebalance, and with the classic
        <strong>eager</strong> protocol it is stop-the-world: every consumer gives up
        every partition, including the work it was halfway through, and the entire group
        processes nothing until the new assignment is settled.
      </p>
      <p>
        Producers do not participate in any of this. They keep writing at full rate
        through the whole pause. Watch the lag counters while the group is stalled —
        that spike is not a slow consumer, it is a consumer group that briefly stopped
        existing.
      </p>
      <p>
        <strong>Cooperative sticky</strong> rebalancing fixes most of it. Instead of
        revoking everything, it computes the new assignment first and only takes away
        the partitions that actually change hands. Consumers keep working on what they
        already own, so the stall shrinks to almost nothing.
      </p>
      <p class="rounded-md border-l-2 border-danger-500 pl-4 text-ink-300">
        The failure mode worth recognising: if processing one batch takes longer than
        <code class="font-mono">max.poll.interval.ms</code>, the broker decides the
        consumer is dead and kicks it out. That triggers a rebalance, which stalls
        everyone, which makes the next batch take even longer — and now you have a
        rebalance loop that looks like the cluster is broken when the real problem is a
        slow handler.
      </p>

      <PredictPrompt
        question="An eager group is stalled in a rebalance for 40 ticks while the producer keeps writing. What does the lag graph do?"
        :options="[
          'Stays flat — no consumers means no lag change',
          'Climbs, then drops sharply once the group settles',
          'Drops, because nothing is being read',
        ]"
        :answer="1"
        explanation="Lag is records written minus records committed. Writes continue and commits stop, so lag climbs for the whole stall and only comes back down once the group resumes and works through the backlog."
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
          v-for="option in (['eager', 'cooperative'] as RebalanceStrategy[])"
          :key="option"
          type="button"
          class="rounded-md border px-3 py-1.5 text-sm transition"
          :class="
            strategy === option
              ? 'border-accent-500 text-ink-50'
              : 'border-ink-700 text-ink-400 hover:border-ink-500'
          "
          @click="strategy = option"
        >
          {{ option === 'eager' ? 'Eager (stop the world)' : 'Cooperative sticky' }}
        </button>

        <button
          type="button"
          class="ml-auto rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 transition hover:border-ink-400"
          @click="add"
        >
          Add a consumer
        </button>
      </div>

      <div
        class="flex items-center justify-between rounded-lg border p-3 text-sm transition"
        :class="
          stalled
            ? 'border-danger-500/50 bg-danger-500/5 text-danger-500'
            : 'border-ink-800 bg-ink-900/40 text-ink-400'
        "
      >
        <span>
          <template v-if="stalled">
            Group stalled — rebalancing, nothing is being processed
          </template>
          <template v-else>Group stable</template>
        </span>
        <span class="font-mono tabular-nums">
          lag {{ lag }} · {{ sim.state.value.group.rebalanceCount }} rebalance(s)
        </span>
      </div>

      <div class="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
        <ClusterView :state="sim.state.value" @kill="kill" />
      </div>

      <EventLog
        :lines="sim.state.value.events.map((e) => `t${e.tick} · ${e.text}`)"
        :kinds="sim.state.value.events.map((e) => e.kind)"
        :limit="7"
      />
    </template>
  </SectionShell>
</template>
