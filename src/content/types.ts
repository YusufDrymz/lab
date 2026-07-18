/**
 * All prose lives here rather than inside the section components.
 *
 * The site ships in two languages and the sections are prose-heavy, so the
 * alternative — a component per language — would mean maintaining the
 * simulation wiring twice and letting the two drift apart. Instead there is one
 * component per section and one content file per locale.
 */

export type Locale = 'en' | 'tr'

/**
 * A paragraph, with a tone that maps to the visual language used throughout:
 * accent for a clarification, warn for a caveat, danger for the failure mode
 * a reader should recognise in production.
 */
export type Block = {
  tone?: 'accent' | 'warn' | 'danger' | 'muted'
  /**
   * Limited inline markup — <strong>, <em>, <code>. Rendered with v-html.
   *
   * Safe here in a way it would not normally be: this is authored content
   * compiled into the bundle at build time. No user input, no network source,
   * nothing runtime-interpolated reaches it.
   */
  html: string
}

export type Predict = {
  question: string
  options: string[]
  /** index of the correct option */
  answer: number
  explanation: string
}

export type SectionContent = {
  title: string
  lede: string
  prose: Block[]
  predict: Predict
  /** button and status labels specific to this section's simulation */
  ui: Record<string, string>
}

/**
 * A lab page: heading, intro, one nav label per section, and the sections.
 *
 * Generic over the section map so each lab keeps named sections rather than a
 * bag of strings — a typo in a section key should not compile.
 */
export type LabContent<Sections> = {
  /** page-level heading and intro */
  title: string
  intro: Block[]
  nav: string[]
  sections: Sections
}

export type KafkaContent = LabContent<{
  writePath: SectionContent
  partitions: SectionContent
  groups: SectionContent
  rebalance: SectionContent
  offsets: SectionContent
  deadLetters: SectionContent
}>

export type HookkeepContent = LabContent<{
  persistFirst: SectionContent
  retryBackoff: SectionContent
  replay: SectionContent
  signature: SectionContent
}>

export type HomeContent = {
  title: string
  tagline: string
  intro: Block[]
  /** the principles that explain why the labs are built the way they are */
  principles: { title: string; body: string }[]
  labsHeading: string
  /** one card per lab, in the order they should be shown */
  labs: LabCard[]
}

export type LabCard = {
  /** locale-independent route, e.g. /kafka — localePath() prefixes it */
  path: string
  title: string
  summary: string
  topics: string[]
  cta: string
}

/** Repositories a lab points at. Kept next to the content so both locales share it. */
export const REPOS = {
  lab: 'https://github.com/YusufDrymz/lab',
  kafkaDlq: 'https://github.com/YusufDrymz/kafka-dlq',
  hookkeep: 'https://github.com/YusufDrymz/hookkeep',
  site: 'https://yusufdariyemez.com',
} as const

export type Chrome = {
  home: string
  /** link back to the personal site, so the lab is not a dead end */
  siteLabel: string
  siteHref: string
  repoLabel: string
  otherLocale: string
  otherLocaleHref: string
  builtBy: string
  sourceOn: string
  disclaimer: string
  /** shown on a lab page, linking to the repo that lab is about */
  relatedRepo: string
  controls: {
    play: string
    pause: string
    step: string
    restart: string
    speed: string
  }
  emptyLog: string
  predictRight: string
  predictWrong: string
}

export type Content = {
  locale: Locale
  chrome: Chrome
  home: HomeContent
  kafka: KafkaContent
  hookkeep: HookkeepContent
}
