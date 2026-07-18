<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import SiteHeader from './components/SiteHeader.vue'
import { CONTENT, localeFromPath, provideContent, useAlternatePath } from './content'

const route = useRoute()
const content = computed(() => CONTENT[localeFromPath(route.path)])
provideContent(content)

/**
 * The document metadata is set here rather than in a plugin: there are two
 * locales and a handful of routes, so a watcher is the whole requirement.
 * `lang` matters for screen readers and hyphenation; `hreflang` is what stops
 * search engines treating the two languages as duplicates of each other.
 */
watchEffect(() => {
  const c = content.value
  const isHome = route.path === '/' || route.path === '/tr'

  document.documentElement.lang = c.locale
  document.title = isHome ? `${c.home.title} — ${c.home.tagline}` : `${c.kafka.title} — lab`

  const origin = window.location.origin
  const alternate = useAlternatePath(route.path, c.locale)

  const link = (rel: string, hreflang: string, href: string): void => {
    const selector = `link[rel="${rel}"][hreflang="${hreflang}"]`
    let el = document.head.querySelector<HTMLLinkElement>(selector)
    if (!el) {
      el = document.createElement('link')
      el.rel = rel
      el.hreflang = hreflang
      document.head.appendChild(el)
    }
    el.href = href
  }

  link('alternate', c.locale, origin + route.path)
  link('alternate', c.locale === 'en' ? 'tr' : 'en', origin + alternate)
})
</script>

<template>
  <SiteHeader />
  <RouterView />
</template>
