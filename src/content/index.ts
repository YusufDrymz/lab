import { computed, inject, provide, type InjectionKey, type Ref } from 'vue'
import { en } from './en'
import { tr } from './tr'
import type { Content, Locale } from './types'

export * from './types'

export const CONTENT: Record<Locale, Content> = { en, tr }

const KEY = Symbol('content') as InjectionKey<Ref<Content>>

/**
 * Locale is derived from the route rather than stored anywhere: `/tr/...` is
 * Turkish, everything else is English. No cookie, no detection, no redirect —
 * a shared link always opens in the language it was written in.
 */
export function provideContent(content: Ref<Content>): void {
  provide(KEY, content)
}

export function useContent(): Ref<Content> {
  const content = inject(KEY)
  if (!content) throw new Error('useContent() used outside a content provider')
  return content
}

/** Prefixes an internal path with the current locale. */
export function useLocalePath(): (path: string) => string {
  const content = useContent()
  return (path: string) => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (content.value.locale === 'en') return clean === '/' ? '/' : clean
    return clean === '/' ? '/tr' : `/tr${clean}`
  }
}

/** The same page in the other language, for the switcher. */
export function useAlternatePath(currentPath: string, locale: Locale): string {
  if (locale === 'en') {
    return currentPath === '/' ? '/tr' : `/tr${currentPath}`
  }
  const stripped = currentPath.replace(/^\/tr/, '')
  return stripped === '' ? '/' : stripped
}

export const localeFromPath = (path: string): Locale =>
  path === '/tr' || path.startsWith('/tr/') ? 'tr' : 'en'

export const useKafkaContent = () => computed(() => useContent().value.kafka)
