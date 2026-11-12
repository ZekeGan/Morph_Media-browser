import { SourceError } from '../metadata-common'
import { clean, type Adapter } from './site'

// R-293: a store page address (Getchu, ErogameScape, Melonbooks, Toranoana, DMM/FANZA) names the game by the link
// VNDB keeps for each release, so the work is found through VNDB's API instead of reading the store's own pages
// (no age check, no region block, no page layout to break). The link is rebuilt from validated IDs only.
export const VNDB_STORE_MISSING = 'VNDB 沒有這個商店網址的作品；可以改貼 VNDB 或 DLsite 的作品網址'
export function storeLink(input: URL): [string, string | number] | undefined {
  const host = input.hostname,
    query = input.searchParams,
    number = (value: string | null | undefined, digits = 10) =>
      value && new RegExp(`^[1-9]\\d{0,${digits - 1}}$`).test(value) ? Number(value) : undefined
  if (host === 'www.getchu.com' || host === 'getchu.com') {
    const id = input.pathname === '/soft.phtml' ? number(query.get('id')) : undefined
    return id ? ['getchu', id] : undefined
  }
  if (host === 'dl.getchu.com') {
    const id = number(/^\/i\/item(\d+)\/?$/.exec(input.pathname)?.[1])
    return id ? ['getchudl', id] : undefined
  }
  if (host === 'erogamescape.dyndns.org' || host === 'erogamescape.org') {
    const id = /\/toukei_kaiseki\/game\.php$/.test(input.pathname)
      ? number(query.get('game'))
      : undefined
    return id ? ['egs', id] : undefined
  }
  if (host === 'www.melonbooks.co.jp') {
    const id = input.pathname === '/detail/detail.php' ? number(query.get('product_id')) : undefined
    return id ? ['melonjp', id] : undefined
  }
  if (host === 'ec.toranoana.shop' || host === 'ec.toranoana.jp') {
    const id = number(/^\/(?:tora|joshi)\/ec\/item\/0*(\d{1,12})\/?$/.exec(input.pathname)?.[1], 12)
    return id ? ['toranoana', id] : undefined
  }
  // VNDB keeps DMM links as host + path (with the trailing slash).
  if (
    /^(www|dlsoft|book)\.dmm\.(co\.jp|com)$/.test(host) &&
    /^\/[\w\-/=.%]{1,300}$/.test(input.pathname)
  )
    return ['dmm', host + input.pathname.replace(/\/?$/, '/')]
  return undefined
}

export const vndb: Adapter = async (site) => {
  // A store host only ever gives a store link; a "/v97" path there is not taken as a VNDB ID.
  const isVndb = site.input.hostname === 'vndb.org',
    store = isVndb ? undefined : storeLink(site.input)
  if (!isVndb && !store) throw new Error(VNDB_STORE_MISSING)
  const id = store ? undefined : site.match(/^\/(v[1-9]\d{0,11})\/?$/)[1]
  const data = (
    await site.json('https://api.vndb.org/kana/vn', {
      filters: store ? ['release', '=', ['extlink', '=', store]] : ['id', '=', id],
      fields: 'title,alttitle,description,released,languages,platforms,developers.name',
      results: 1,
    })
  ).results?.[0]
  if (
    !data ||
    typeof data.id !== 'string' ||
    !/^v[1-9]\d{0,11}$/.test(data.id) ||
    (id && data.id !== id)
  )
    throw store ? new Error(VNDB_STORE_MISSING) : new SourceError('notFound')
  site.text('TITLE_ORIGINAL', data.alttitle)
  site.text('DESCRIPTION', data.description)
  site.text('RELEASE_DATE', data.released)
  site.list('LANGUAGES', data.languages)
  site.list('PLATFORMS', data.platforms)
  site.list(
    'DEVELOPERS',
    data.developers?.map((developer: { name?: unknown }) => developer?.name)
  )
  return { title: clean(data.title), canonical: 'https://vndb.org/' + data.id }
}
