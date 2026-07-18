import { describe, expect, it } from 'vitest'
import { en } from '../en'
import { tr } from '../tr'
import type { Content } from '../types'

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
    const sections = (c: Content) => Object.entries(c.kafka.sections)
    for (const [key, section] of sections(en)) {
      const other = section
      const trSection = (tr.kafka.sections as Record<string, typeof other>)[key]!
      expect(trSection.predict.answer, `${key}: answer index moved`).toBe(section.predict.answer)
      expect(trSection.predict.options).toHaveLength(section.predict.options.length)
    }
  })

  it('preserves inline markup and code spans across translations', () => {
    // <code> holds topic and config names; they are identifiers, not prose, and
    // translating one would quietly invent a topic that does not exist.
    const codeSpans = (html: string) => [...html.matchAll(/<code>(.*?)<\/code>/g)].map((m) => m[1])

    for (const [key, section] of Object.entries(en.kafka.sections)) {
      const trSection = (tr.kafka.sections as Record<string, typeof section>)[key]!
      expect(trSection.prose, `${key}: block count`).toHaveLength(section.prose.length)

      section.prose.forEach((block, i) => {
        const trBlock = trSection.prose[i]!
        expect(trBlock.tone, `${key} block ${i}: tone`).toBe(block.tone)
        expect(codeSpans(trBlock.html), `${key} block ${i}: code spans`).toEqual(
          codeSpans(block.html),
        )
      })
    }
  })

  it('keeps the {tool} placeholder that carries the repository link', () => {
    expect(en.kafka.sections.deadLetters.ui.toolNote).toContain('{tool}')
    expect(tr.kafka.sections.deadLetters.ui.toolNote).toContain('{tool}')
  })

  it('lists one nav label per section', () => {
    const count = Object.keys(en.kafka.sections).length
    expect(en.kafka.nav).toHaveLength(count)
    expect(tr.kafka.nav).toHaveLength(count)
  })
})
