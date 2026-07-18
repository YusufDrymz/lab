import { describe, expect, it } from 'vitest'
import { en } from '../en'
import { tr } from '../tr'
import type { SectionContent } from '../types'

/**
 * Every lab page, so adding one cannot quietly opt out of these checks. The
 * sections are compared as plain records; the typed shapes differ per lab and
 * nothing here cares which keys they are, only that both locales agree.
 */
const LABS = ['kafka', 'hookkeep', 'idempotency', 'plans', 'reconcile'] as const

const sectionsOf = (
  content: typeof en | typeof tr,
  lab: (typeof LABS)[number],
): Record<string, SectionContent> =>
  content[lab].sections as unknown as Record<string, SectionContent>

/**
 * Structural parity between the two locales.
 *
 * A missing key does not crash anything — it renders as an empty string or the
 * literal `undefined`, which is exactly the kind of defect that survives review
 * and ships. These tests make a drifted translation a build failure instead.
 */

const paths = (value: unknown, prefix = ''): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => paths(item, `${prefix}[${i}]`))
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, val]) =>
      paths(val, prefix ? `${prefix}.${key}` : key),
    )
  }
  return [prefix]
}

describe('locale parity', () => {
  it('exposes the same key paths in both languages', () => {
    expect(paths(tr).sort()).toEqual(paths(en).sort())
  })

  it('declares the right locale on each', () => {
    expect(en.locale).toBe('en')
    expect(tr.locale).toBe('tr')
  })

  it('points each language switcher at the other one', () => {
    expect(en.chrome.otherLocaleHref).toBe('/tr')
    expect(tr.chrome.otherLocaleHref).toBe('/')
  })

  it('has no empty strings', () => {
    for (const [name, content] of [
      ['en', en],
      ['tr', tr],
    ] as const) {
      const walk = (value: unknown, path: string): void => {
        if (typeof value === 'string') {
          expect(value.trim(), `${name}.${path} is empty`).not.toBe('')
          return
        }
        if (Array.isArray(value)) {
          value.forEach((item, i) => walk(item, `${path}[${i}]`))
          return
        }
        if (value && typeof value === 'object') {
          for (const [key, val] of Object.entries(value)) walk(val, `${path}.${key}`)
        }
      }
      walk(content, '')
    }
  })

  it('keeps the same correct answer for every prediction', () => {
    // A translator reordering options would silently make the right answer
    // wrong, and the reader would be told they were mistaken when they were not.
    for (const lab of LABS) {
      for (const [key, section] of Object.entries(sectionsOf(en, lab))) {
        const trSection = sectionsOf(tr, lab)[key]!
        expect(trSection.predict.answer, `${lab}.${key}: answer index moved`).toBe(
          section.predict.answer,
        )
        expect(trSection.predict.options).toHaveLength(section.predict.options.length)
      }
    }
  })

  it('preserves inline markup and code spans across translations', () => {
    // <code> holds topic and config names; they are identifiers, not prose, and
    // translating one would quietly invent a topic that does not exist.
    const codeSpans = (html: string) => [...html.matchAll(/<code>(.*?)<\/code>/g)].map((m) => m[1])

    for (const lab of LABS) {
      for (const [key, section] of Object.entries(sectionsOf(en, lab))) {
        const trSection = sectionsOf(tr, lab)[key]!
        expect(trSection.prose, `${lab}.${key}: block count`).toHaveLength(section.prose.length)

        section.prose.forEach((block, i) => {
          const trBlock = trSection.prose[i]!
          expect(trBlock.tone, `${lab}.${key} block ${i}: tone`).toBe(block.tone)
          expect(codeSpans(trBlock.html), `${lab}.${key} block ${i}: code spans`).toEqual(
            codeSpans(block.html),
          )
        })
      }
    }
  })

  it('keeps the {tool} placeholder that carries the repository link', () => {
    // The label is split around the placeholder to wrap a link, so losing it in
    // translation would drop the link entirely rather than fail loudly.
    for (const lab of LABS) {
      for (const [key, section] of Object.entries(sectionsOf(en, lab))) {
        if (!section.ui.toolNote) continue
        expect(section.ui.toolNote, `en ${lab}.${key}`).toContain('{tool}')
        expect(sectionsOf(tr, lab)[key]!.ui.toolNote, `tr ${lab}.${key}`).toContain('{tool}')
      }
    }
  })

  it('lists one nav label per section', () => {
    for (const lab of LABS) {
      const count = Object.keys(sectionsOf(en, lab)).length
      expect(en[lab].nav, `en ${lab}`).toHaveLength(count)
      expect(tr[lab].nav, `tr ${lab}`).toHaveLength(count)
    }
  })

  it('keeps every lab card in step with the lab it links to', () => {
    // seo.ts builds each page's <title> from the card rather than from the lab,
    // to avoid a path-to-section mapping that silently mistitles a new lab. That
    // is only safe while the two agree.
    for (const content of [en, tr]) {
      for (const card of content.home.labs) {
        const lab = content[card.path.slice(1) as (typeof LABS)[number]]
        expect(card.title, `${content.locale} ${card.path}: card title`).toBe(lab.title)
        expect(card.topic, `${content.locale} ${card.path}: card topic`).toBe(lab.topic)
      }
    }
  })

  it('names the subject in every lab title or topic', () => {
    // The SEO title falls back to "Topic: Title" when the title omits the
    // subject; an empty topic would make that fallback silently useless.
    for (const content of [en, tr]) {
      for (const lab of LABS) expect(content[lab].topic.trim()).not.toBe('')
    }
  })

  it('points every lab card at a route that exists', () => {
    const paths = en.home.labs.map((lab) => lab.path)
    expect(paths).toEqual(tr.home.labs.map((lab) => lab.path))
    expect(paths).toEqual(LABS.map((lab) => `/${lab}`))
  })
})
