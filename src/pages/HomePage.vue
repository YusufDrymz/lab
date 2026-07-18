<script setup lang="ts">
import ProseBlocks from '../components/ProseBlocks.vue'
import { REPOS, useContent, useLocalePath } from '../content'

const content = useContent()
const localePath = useLocalePath()
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
    <header class="py-16 sm:py-24">
      <h1 class="max-w-3xl text-4xl font-semibold tracking-tight text-ink-50 sm:text-5xl">
        {{ content.home.tagline }}
      </h1>
      <div class="mt-6 flex max-w-2xl flex-col gap-4 text-lg leading-relaxed text-ink-400">
        <ProseBlocks :blocks="content.home.intro" />
      </div>
    </header>

    <!-- The principles still lead: they explain why the labs are built the way
         they are, which the card summaries deliberately do not repeat. -->
    <section class="grid gap-6 border-t border-ink-800 py-12 sm:grid-cols-3">
      <div v-for="principle in content.home.principles" :key="principle.title">
        <h2 class="mb-2 text-sm font-semibold text-ink-50">{{ principle.title }}</h2>
        <p class="text-sm leading-relaxed text-ink-400">{{ principle.body }}</p>
      </div>
    </section>

    <section class="border-t border-ink-800 py-12">
      <h2 class="mb-6 font-mono text-xs tracking-widest text-ink-500 uppercase">
        {{ content.home.labsHeading }}
      </h2>

      <!-- Two columns from lg up. Below that the cards stack: the topic lists
           are the useful part and they need the width to stay one line each. -->
      <div class="grid gap-5 lg:grid-cols-2">
        <RouterLink
          v-for="lab in content.home.labs"
          :key="lab.path"
          :to="localePath(lab.path)"
          class="group flex flex-col rounded-xl border border-ink-800 bg-ink-900/40 p-6 transition hover:border-accent-500/60 hover:bg-ink-900/70 sm:p-8"
        >
          <h3
            class="text-2xl font-semibold tracking-tight text-ink-50 transition group-hover:text-accent-400"
          >
            {{ lab.title }}
          </h3>
          <p class="mt-3 leading-relaxed text-ink-400">
            {{ lab.summary }}
          </p>

          <ul class="mt-5 grid gap-y-1.5 font-mono text-xs text-ink-500">
            <li v-for="topic in lab.topics" :key="topic">
              <span class="text-accent-600">›</span> {{ topic }}
            </li>
          </ul>

          <!-- mt-auto keeps the two calls to action aligned when the cards have
               different numbers of topics. -->
          <p class="mt-auto pt-6 text-sm font-medium text-accent-400">{{ lab.cta }} →</p>
        </RouterLink>
      </div>
    </section>

    <footer class="border-t border-ink-800 pt-8 text-sm text-ink-500">
      <p>
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
