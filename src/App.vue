<script setup lang="ts">
import SectionWritePath from './sections/SectionWritePath.vue'
import SectionPartitions from './sections/SectionPartitions.vue'
import SectionConsumerGroups from './sections/SectionConsumerGroups.vue'
import SectionRebalance from './sections/SectionRebalance.vue'
import SectionOffsets from './sections/SectionOffsets.vue'
import SectionDeadLetters from './sections/SectionDeadLetters.vue'

const SECTIONS = [
  { id: 'write-path', label: 'Write path' },
  { id: 'partitions', label: 'Partitions' },
  { id: 'consumer-groups', label: 'Groups' },
  { id: 'rebalance', label: 'Rebalance' },
  { id: 'offsets', label: 'Offsets' },
  { id: 'dead-letters', label: 'Dead letters' },
]
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
    <header class="py-16">
      <p class="mb-3 font-mono text-xs tracking-widest text-accent-500 uppercase">lab</p>
      <h1 class="max-w-3xl text-4xl font-semibold tracking-tight text-ink-50 sm:text-5xl">
        Kafka, by behaviour
      </h1>
      <p class="mt-5 max-w-2xl text-lg leading-relaxed text-ink-400">
        Most explanations show you the architecture: producers, brokers, boxes with arrows
        between them. This one skips that and goes straight to the parts that actually
        page you at 3am — dual writes, hot partitions, rebalance stalls, offsets committed
        in the wrong order, and dead letters you cannot safely replay.
      </p>
      <p class="mt-4 max-w-2xl text-ink-500">
        Everything here runs in your browser. There is no broker, no backend and no
        network call: it is a deterministic model, so the same seed always replays the
        same incident. Break it as hard as you like.
      </p>

      <nav class="mt-8 flex flex-wrap gap-2">
        <a
          v-for="(section, index) in SECTIONS"
          :key="section.id"
          :href="`#${section.id}`"
          class="rounded-md border border-ink-800 px-3 py-1.5 font-mono text-xs text-ink-400 transition hover:border-accent-500 hover:text-ink-50"
        >
          {{ String(index).padStart(2, '0') }} {{ section.label }}
        </a>
      </nav>
    </header>

    <main>
      <SectionWritePath />
      <SectionPartitions />
      <SectionConsumerGroups />
      <SectionRebalance />
      <SectionOffsets />
      <SectionDeadLetters />
    </main>

    <footer class="border-t border-ink-800 pt-8 text-sm text-ink-500">
      <p>
        Built by
        <a
          href="https://yusufdariyemez.com"
          class="text-ink-300 underline underline-offset-2 hover:text-ink-50"
          >Yusuf Erkan Darıyemez</a
        >. Source on
        <a
          href="https://github.com/YusufDrymz/lab"
          class="text-ink-300 underline underline-offset-2 hover:text-ink-50"
          >GitHub</a
        >.
      </p>
      <p class="mt-2">
        The simulation is a teaching model, not an emulator. It reproduces the behaviour
        these sections are about — routing, assignment, commit semantics, retry chains —
        and deliberately leaves out replication, ISR and leader election.
      </p>
    </footer>
  </div>
</template>
