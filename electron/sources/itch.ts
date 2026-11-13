import { SourceError, sourceJson } from '../metadata-common'
import { clean, type Adapter } from './site'

// R-359: itch.io has no public API for other people's games, but every game page has a public data.json beside it
// (title, cover, authors, tags, price) and an information table on the page (genre, platforms, status, engine, first
// release). Checked 2026-11-13 on seven games, adult ones included: no login, no age check. The table only adds to
// data.json; when it cannot be read the preview still works. VNDB keeps itch.io links for visual novels, so the same
// game is looked up there and offered as a second source the user may choose; nothing is merged.
const gamePath = /^\/([a-z0-9][a-z0-9_-]{0,99})\/?$/i

// The information table: <tr><td>Label</td><td>value</td></tr>, with dates in an <abbr title="…">. The page is
// written by any itch.io user, so the work is bounded: rows are found with indexOf, at most 60, each cell 4000
// characters (a page full of half-open rows cannot keep the main process busy).
function infoTable(html: string) {
  const rows = new Map<string, { text: string; title?: string }>()
  let at = 0
  while (rows.size < 60) {
    const start = html.indexOf('<tr><td>', at)
    if (start < 0) break
    const labelEnd = html.indexOf('</td>', start + 8),
      end = html.indexOf('</td></tr>', labelEnd)
    if (labelEnd < 0 || end < 0) break
    at = end + 10
    const label = html.slice(start + 8, labelEnd)
    const cell = html.slice(labelEnd + 5, end)
    if (label.length > 40 || label.includes('<') || cell.length > 4000) continue
    const value = cell.replace(/^<td[^>]{0,200}>/, '')
    rows.set(label.trim(), {
      text: clean(value).replace(/\s+/g, ' ').trim(),
      title: /title="([^"]{1,100})"/.exec(value)?.[1],
    })
  }
  return rows
}
const split = (value?: string) =>
  value
    ? value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    : []
// "11 November 2026 @ 17:48 UTC" → 2026-11-11.
function day(value?: string) {
  if (!value) return undefined
  const time = Date.parse(value.replace('@', ''))
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : undefined
}
// The page's own description and rating (schema.org Product).
function product(html: string) {
  const open = '<script type="application/ld+json">'
  let at = 0
  // At most five blocks of 20000 characters, found with indexOf (bounded work on any page).
  for (let count = 0; count < 5; count++) {
    const start = html.indexOf(open, at)
    if (start < 0) break
    const end = html.indexOf('</script>', start + open.length)
    if (end < 0) break
    at = end + 9
    if (end - start > 20000) continue
    try {
      const data = sourceJson(html.slice(start + open.length, end))
      if (data?.['@type'] === 'Product') return data
    } catch {}
  }
  return undefined
}

export const itch: Adapter = async (site) => {
  const author = /^([a-z0-9-]{1,63})\.itch\.io$/.exec(site.input.hostname.toLowerCase())?.[1]
  const game = site.match(gamePath)[1].toLowerCase()
  if (!author) throw new Error('請輸入此來源的完整作品網址')
  const page = `https://${author}.itch.io/${game}`
  const data = await site.json(page + '/data.json')
  if (!data || typeof data.title !== 'string' || typeof data.id !== 'number')
    throw new SourceError('notFound')
  site.text('ITCH_ID', String(data.id))
  site.list(
    'AUTHORS',
    Array.isArray(data.authors) ? data.authors.map((a: { name?: unknown }) => a?.name) : []
  )
  site.list('TAGS', data.tags)
  site.text('PRICE', data.price)
  try {
    const html = await site.request(page)
    const rows = infoTable(html)
    site.list('GENRES', split(rows.get('Genre')?.text))
    site.list('PLATFORMS', split(rows.get('Platforms')?.text))
    site.text('RELEASE_STATUS', rows.get('Status')?.text)
    site.list('MADE_WITH', split(rows.get('Made with')?.text))
    site.list('LANGUAGES', split(rows.get('Languages')?.text))
    // Only the first release is a release date; "Updated" is the latest upload.
    const published = rows.get('Published')
    site.text('RELEASE_DATE', day(published?.title ?? published?.text))
    const about = product(html)
    site.text('DESCRIPTION', about?.description)
    site.number('RATING', Number(about?.aggregateRating?.ratingValue))
    site.number('RATING_COUNT', about?.aggregateRating?.ratingCount)
  } catch {
    // The page only adds to data.json.
  }
  // The same game on VNDB, offered as a separate source; a failed lookup is not an error.
  let related: { provider: 'vndb'; url: string; title: string } | undefined
  try {
    const release = (
      await site.json('https://api.vndb.org/kana/release', {
        filters: ['extlink', '=', ['itch', `${author}/${game}`]],
        fields: 'vns{id,title}',
        results: 1,
      })
    ).results?.[0]
    const vn = release?.vns?.[0]
    if (vn && typeof vn.id === 'string' && /^v[1-9]\d{0,11}$/.test(vn.id))
      related = {
        provider: 'vndb',
        url: 'https://vndb.org/' + vn.id,
        title: clean(vn.title).slice(0, 200),
      }
  } catch {}
  // The game's own link gives its exact address (slug spelling). It must stay on the pasted author's subdomain, so a
  // page cannot claim to be someone else's game.
  const self = typeof data.links?.self === 'string' ? data.links.self : ''
  let canonical = page
  try {
    const url = new URL(self)
    if (
      url.protocol === 'https:' &&
      url.hostname === author + '.itch.io' &&
      gamePath.test(url.pathname)
    )
      canonical = url.origin + url.pathname.replace(/\/$/, '')
  } catch {}
  return {
    title: clean(data.title),
    canonical,
    image: typeof data.cover_image === 'string' ? data.cover_image : undefined,
    related,
  }
}
