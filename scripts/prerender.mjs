// Writes one HTML file per route after `vite build`, plus a sitemap.
//
// lab is a single-page app, so the served HTML is identical for every route and
// the title only becomes correct once JavaScript runs. Google renders JS and
// copes; social scrapers do not. Sharing lab.yusufdariyemez.com/kafka anywhere
// — Slack, LinkedIn, WhatsApp, a Twitter card — previewed as the generic site
// description, because that is genuinely what the server sent.
//
// This is not server-side rendering. The body still mounts client-side; only
// the <head> is specialised per route. That is the part scrapers read, and it
// costs one build step instead of an SSR runtime.
//
// nginx serves these through `try_files $uri $uri/ /index.html`: /kafka finds
// dist/kafka/index.html, and anything unknown still falls back to the SPA.

import { build } from 'esbuild'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

/**
 * Loads the page metadata from the TypeScript source.
 *
 * The alternative is a hand-maintained JSON list of titles, which would be a
 * second source of truth for strings the content files already own — exactly
 * the drift the locale parity test exists to prevent.
 */
async function loadPages() {
  const bundlePath = join(root, 'node_modules', '.cache', 'lab-seo.mjs')
  await mkdir(dirname(bundlePath), { recursive: true })

  await build({
    entryPoints: [join(root, 'src', 'content', 'seo.ts')],
    outfile: bundlePath,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
  })

  // Cache-busted so a rebuild in the same process picks up edits.
  const module = await import(`${pathToFileURL(bundlePath).href}?t=${Date.now()}`)
  await rm(bundlePath, { force: true })
  return module
}

const escape = (value) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function headFor(page, siteUrl) {
  const url = `${siteUrl}${page.path === '/' ? '' : page.path}`
  const alternate = `${siteUrl}${page.alternate === '/' ? '' : page.alternate}`
  const enUrl = page.locale === 'en' ? url : alternate
  const trUrl = page.locale === 'tr' ? url : alternate

  return [
    `<title>${escape(page.title)}</title>`,
    `<meta name="description" content="${escape(page.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    // hreflang is what stops the two languages being read as duplicates of
    // each other. x-default points at English, which is the root.
    `<link rel="alternate" hreflang="en" href="${enUrl}" />`,
    `<link rel="alternate" hreflang="tr" href="${trUrl}" />`,
    `<link rel="alternate" hreflang="x-default" href="${enUrl}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="lab" />`,
    `<meta property="og:locale" content="${page.locale === 'tr' ? 'tr_TR' : 'en_GB'}" />`,
    `<meta property="og:title" content="${escape(page.title)}" />`,
    `<meta property="og:description" content="${escape(page.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${siteUrl}/og-card.png" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escape(page.title)}" />`,
    `<meta name="twitter:description" content="${escape(page.description)}" />`,
    `<meta name="twitter:image" content="${siteUrl}/og-card.png" />`,
  ].join('\n    ')
}

async function main() {
  const { PAGES, SITE_URL } = await loadPages()

  const template = await readFile(join(dist, 'index.html'), 'utf8')
  if (!template.includes('<!--seo-->')) {
    throw new Error('dist/index.html has no <!--seo--> marker; prerender would silently do nothing')
  }

  for (const page of PAGES) {
    const html = template
      .replace('<!--seo-->', headFor(page, SITE_URL))
      .replace('<html lang="en">', `<html lang="${page.locale}">`)

    // '/' writes dist/index.html itself; every other route gets a directory so
    // nginx's $uri/ lookup finds it.
    const target = page.path === '/' ? join(dist, 'index.html') : join(dist, page.path, 'index.html')
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, html)
    console.log(`prerendered ${page.path}`)
  }

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9"'.replace('www.sitemap.org', 'www.sitemaps.org'),
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...PAGES.map((page) => {
      const url = `${SITE_URL}${page.path === '/' ? '' : page.path}`
      const alternate = `${SITE_URL}${page.alternate === '/' ? '' : page.alternate}`
      const en = page.locale === 'en' ? url : alternate
      const tr = page.locale === 'tr' ? url : alternate
      return [
        '  <url>',
        `    <loc>${url}</loc>`,
        `    <xhtml:link rel="alternate" hreflang="en" href="${en}"/>`,
        `    <xhtml:link rel="alternate" hreflang="tr" href="${tr}"/>`,
        '  </url>',
      ].join('\n')
    }),
    '</urlset>',
    '',
  ].join('\n')

  await writeFile(join(dist, 'sitemap.xml'), sitemap)
  console.log(`sitemap: ${PAGES.length} urls`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
