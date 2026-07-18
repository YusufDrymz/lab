<script setup lang="ts">
import { computed } from 'vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import SectionWritePath from '../sections/SectionWritePath.vue'
import SectionPartitions from '../sections/SectionPartitions.vue'
import SectionConsumerGroups from '../sections/SectionConsumerGroups.vue'
import SectionRebalance from '../sections/SectionRebalance.vue'
import SectionOffsets from '../sections/SectionOffsets.vue'
import SectionDeadLetters from '../sections/SectionDeadLetters.vue'
import { REPOS, useContent } from '../content'

const content = useContent()
const kafka = computed(() => content.value.kafka)

const ANCHORS = [
  'write-path',
  'partitions',
  'consumer-groups',
  'rebalance',
  'offsets',
  'dead-letters',
]
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
    <header class="py-14">
      <p class="mb-3 font-mono text-xs tracking-widest text-accent-500 uppercase">
        {{ kafka.topic }}
      </p>
      <h1 class="max-w-3xl text-4xl font-semibold tracking-tight text-ink-50 sm:text-5xl">
        {{ kafka.title }}
      </h1>
      <div class="mt-5 flex max-w-2xl flex-col gap-4 text-lg leading-relaxed text-ink-400">
        <ProseBlocks :blocks="kafka.intro" />
      </div>

      <nav class="mt-8 flex flex-wrap gap-2">
        <a
          v-for="(label, index) in kafka.nav"
          :key="label"
          :href="`#${ANCHORS[index]}`"
          class="rounded-md border border-ink-800 px-3 py-1.5 font-mono text-xs text-ink-400 transition hover:border-accent-500 hover:text-ink-50"
        >
          {{ String(index).padStart(2, '0') }} {{ label }}
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
        {{ content.chrome.relatedRepo }}:
        <a
          :href="REPOS.kafkaDlq"
          rel="noopener"
          class="text-accent-400 underline underline-offset-2 hover:text-accent-500"
          >kafka-dlq</a
        >
      </p>
      <p class="mt-3">
        {{ content.chrome.builtBy }}
        <a
          :href="content.chrome.siteHref"
          class="text-ink-300 underline underline-offset-2 hover:text-ink-50"
          >Yusuf Erkan Darıyemez</a
        >. {{ content.chrome.sourceOn }}
        <a
          :href="REPOS.lab"
          rel="noopener"
          class="text-ink-300 underline underline-offset-2 hover:text-ink-50"
          >GitHub</a
        >.
      </p>
      <p class="mt-2 max-w-3xl">{{ content.chrome.disclaimer }}</p>
    </footer>
  </div>
</template>
