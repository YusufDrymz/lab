<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { REPOS, useAlternatePath, useContent, useLocalePath } from '../content'

/**
 * The lab should not be a dead end: from any page you can get back to the site
 * it belongs to, to the source, and to the same page in the other language.
 */
const content = useContent()
const route = useRoute()
const localePath = useLocalePath()

const alternate = computed(() => useAlternatePath(route.path, content.value.locale))
</script>

<template>
  <header
    class="sticky top-0 z-20 border-b border-ink-800 bg-ink-950/85 backdrop-blur supports-[backdrop-filter]:bg-ink-950/70"
  >
    <div class="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3 sm:px-8">
      <RouterLink
        :to="localePath('/')"
        class="font-mono text-sm tracking-widest text-accent-500 uppercase transition hover:text-accent-400"
      >
        {{ content.chrome.home }}
      </RouterLink>

      <nav class="ml-auto flex items-center gap-1 text-xs sm:gap-3">
        <a
          :href="content.chrome.siteHref"
          class="rounded px-2 py-1 text-ink-400 transition hover:text-ink-50"
        >
          {{ content.chrome.siteLabel }}
        </a>

        <a
          :href="REPOS.lab"
          class="rounded px-2 py-1 text-ink-400 transition hover:text-ink-50"
          rel="noopener"
        >
          {{ content.chrome.repoLabel }}
        </a>

        <RouterLink
          :to="alternate"
          class="rounded border border-ink-700 px-2 py-1 font-mono text-ink-300 transition hover:border-accent-500 hover:text-ink-50"
        >
          {{ content.chrome.otherLocale }}
        </RouterLink>
      </nav>
    </div>
  </header>
</template>
