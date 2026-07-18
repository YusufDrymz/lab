<script setup lang="ts">
import { computed } from 'vue'
import ProseBlocks from '../components/ProseBlocks.vue'
import SectionUnprotected from '../sections/SectionUnprotected.vue'
import SectionWithKey from '../sections/SectionWithKey.vue'
import SectionRace from '../sections/SectionRace.vue'
import SectionFingerprint from '../sections/SectionFingerprint.vue'
import { REPOS, useContent } from '../content'

const content = useContent()
const idempotency = computed(() => content.value.idempotency)

// Index-matched against `idempotency.nav`; the parity test locks the two
// lengths together so a translated nav cannot drift out of alignment.
const ANCHORS = ['unprotected', 'with-key', 'race', 'fingerprint']
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
    <header class="py-14">
      <!-- The heading names the symptom; this names the subject, for a reader
           scanning the page and for anyone searching for the term itself. -->
      <p class="mb-3 font-mono text-xs tracking-widest text-accent-500 uppercase">
        {{ idempotency.topic }}
      </p>
      <h1 class="max-w-3xl text-4xl font-semibold tracking-tight text-ink-50 sm:text-5xl">
        {{ idempotency.title }}
      </h1>
      <div class="mt-5 flex max-w-2xl flex-col gap-4 text-lg leading-relaxed text-ink-400">
        <ProseBlocks :blocks="idempotency.intro" />
      </div>

      <nav class="mt-8 flex flex-wrap gap-2">
        <a
          v-for="(label, index) in idempotency.nav"
          :key="label"
          :href="`#${ANCHORS[index]}`"
          class="rounded-md border border-ink-800 px-3 py-1.5 font-mono text-xs text-ink-400 transition hover:border-accent-500 hover:text-ink-50"
        >
          {{ String(index).padStart(2, '0') }} {{ label }}
        </a>
      </nav>
    </header>

    <main>
      <SectionUnprotected />
      <SectionWithKey />
      <SectionRace />
      <SectionFingerprint />
    </main>

    <footer class="border-t border-ink-800 pt-8 text-sm text-ink-500">
      <p>
        {{ content.chrome.relatedRepo }}:
        <a
          :href="REPOS.goIdempotent"
          rel="noopener"
          class="text-accent-400 underline underline-offset-2 hover:text-accent-500"
          >go-idempotent</a
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
