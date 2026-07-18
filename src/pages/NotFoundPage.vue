<script setup lang="ts">
import { useContent, useLocalePath } from '../content'

const content = useContent()
const localePath = useLocalePath()
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 py-32 sm:px-8">
    <p class="mb-3 font-mono text-xs text-accent-500">404</p>
    <h1 class="text-3xl font-semibold tracking-tight text-ink-50">
      {{ content.locale === 'tr' ? 'Bu sayfa yok.' : 'Nothing here.' }}
    </h1>
    <RouterLink
      :to="localePath('/')"
      class="mt-6 inline-block text-accent-400 underline underline-offset-4 hover:text-accent-500"
    >
      {{ content.locale === 'tr' ? 'Ana sayfaya dön' : 'Back to the labs' }}
    </RouterLink>
  </div>
</template>
