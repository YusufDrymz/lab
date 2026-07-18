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

/**
 * Must be called at the top level of `setup`, and the returned ref used from
 * there on — never called again inside a computed getter or a handler.
 *
 * `inject` only resolves while a component instance is current. A getter like
 * `computed(() => useContent().value.x)` works on first evaluation, because
 * that happens during setup, and then throws the next time the computed is
 * invalidated — on a locale switch, or while the component is being torn down.
 * Every section had this shape once; the failure only ever showed up in the
 * browser console, never in a test.
 */
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
