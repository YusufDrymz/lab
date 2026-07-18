import { CONTENT } from './index'
import type { Locale } from './types'

/**
 * The per-page metadata, derived from the content rather than written twice.
 *
 * This exists because lab is a single-page app: the router sets the title and
 * description after the app mounts, which Google handles but social scrapers
 * do not — Twitter, LinkedIn, Slack and WhatsApp read the served HTML and stop.
 * Without a static tag per route, every shared link previews as the same
 * generic site description no matter which lab it points at.
 *
 * `scripts/prerender.mjs` reads this at build time and writes one HTML file
 * per route; App.vue reads the same list to keep the client-side title in step.
 * Deriving both from CONTENT means a translated title cannot drift from the
 * page it names.
 */

export const SITE_URL = 'https://lab.yusufdariyemez.com'

export type Page = {
  /** the route as the app knows it, locale prefix included: /kafka, /tr */
  path: string
  /**
   * The URL this page is actually served at.
   *
   * Prerendering writes dist/kafka/index.html, and nginx's `try_files $uri
   * $uri/` answers a request for /kafka with a 301 to /kafka/ — so the served
   * URL carries a trailing slash even though the router does not. Canonical,
   * og:url, hreflang and the sitemap all use this form: a canonical tag that
   * disagrees with the URL it is served at defeats the point of having one.
   */
  url: string
  locale: Locale
  /** the same page in the other language, for hreflang and the switcher */
  alternate: string
  title: string
  description: string
}

/** Strips tags from a prose block so it can sit in a meta description. */
function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Search engines truncate descriptions around 160 characters. Cutting on a
 * word boundary and adding an ellipsis reads better than letting the engine
 * cut mid-word, and it keeps the important half of the sentence.
 */
function clamp(text: string, limit = 158): string {
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : limit).trimEnd()}…`
}

function pagesFor(locale: Locale): Page[] {
  const c = CONTENT[locale]
  const prefix = locale === 'tr' ? '/tr' : ''
  const other = locale === 'tr' ? '' : '/tr'

  const home: Page = {
    path: prefix || '/',
    url: prefix ? `${prefix}/` : '/',
    locale,
    alternate: other ? `${other}/` : '/',
    title: `${c.home.title} — ${c.home.tagline}`,
    description: clamp(plain(c.home.intro[0]?.html ?? c.home.tagline)),
  }

  // One entry per lab card, so adding a lab to the home page adds it here and
  // to the sitemap without a second edit.
  //
  // The title comes from the card rather than from a path-to-section mapping.
  // The mapping version was `path === '/kafka' ? kafka.title : hookkeep.title`,
  // which quietly gave a third lab the second one's title the moment one was
  // added — a default that is wrong rather than absent.
  const labs = c.home.labs.map((card): Page => {
    const labTitle = card.title
    return {
      path: `${prefix}${card.path}`,
      url: `${prefix}${card.path}/`,
      locale,
      alternate: `${other}${card.path}/`,
      title: `${labTitle} — lab`,
      description: clamp(card.summary),
    }
  })

  return [home, ...labs]
}

export const PAGES: Page[] = [...pagesFor('en'), ...pagesFor('tr')]

/** Looks up the metadata for a served path. */
export function pageFor(path: string): Page | undefined {
  const normalised = path.length > 1 ? path.replace(/\/$/, '') : path
  return PAGES.find((p) => p.path === normalised)
}
