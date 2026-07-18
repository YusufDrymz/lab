<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import SiteHeader from './components/SiteHeader.vue'
import { CONTENT, localeFromPath, provideContent, useAlternatePath } from './content'
import { pageFor } from './content/seo'

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

  // The same PAGES list the prerender writes into the served HTML, so a
  // client-side navigation cannot disagree with what the scraper was given.
  // Keeping a second lab-to-title mapping here is how they drift apart.
  const page = pageFor(route.path)

  document.documentElement.lang = c.locale
  document.title = page?.title ?? `${c.home.title} — ${c.home.tagline}`

  // The prerendered description is correct on first paint but goes stale the
  // moment the router moves without a reload.
  const description = page?.description ?? c.home.tagline
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]']) {
    document.head.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', description)
  }
  document.head
    .querySelector<HTMLMetaElement>('meta[property="og:title"]')
    ?.setAttribute('content', document.title)

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
