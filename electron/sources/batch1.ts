import { SourceError } from '../metadata-common'
import { clean, type Adapter } from './site'

// R-284: public JSON APIs that need no key. Each adapter validates the work ID from the pasted address and asks only
// its own fixed host (see config.ts); covers must come from the site's image host.

type Strings = Record<string, string | undefined>
const pick = (titles: Strings | undefined, ...langs: string[]) =>
  langs.map((lang) => titles?.[lang]).find((value) => typeof value === 'string' && value.trim())

// MangaDex: /title/<uuid>; the cover file name comes from the related cover_art entry.
export const mangadex: Adapter = async (site) => {
  const id = site
    .match(/^\/title\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:\/[^/]*)?\/?$/i)[1]
    .toLowerCase()
  const data = (
    await site.json(
      'https://api.mangadex.org/manga/' +
        id +
        '?includes[]=cover_art&includes[]=author&includes[]=artist'
    )
  ).data
  if (data?.id !== id) throw new SourceError('notFound')
  const a = data.attributes ?? {},
    related = (type: string) =>
      (data.relationships ?? []).filter((r: { type?: string }) => r?.type === type) as {
        attributes?: { name?: string; fileName?: string }
      }[]
  const alt = (a.altTitles ?? []) as Strings[]
  site.text('TITLE_ORIGINAL', alt.map((t) => pick(t, 'ja', 'ko', 'zh')).find(Boolean))
  site.text('DESCRIPTION', pick(a.description, 'en', 'ja', 'zh-hk', 'zh'))
  site.list(
    'AUTHORS',
    related('author').map((r) => r.attributes?.name)
  )
  site.list(
    'ARTISTS',
    related('artist').map((r) => r.attributes?.name)
  )
  site.list(
    'TAGS',
    (a.tags ?? []).map((t: { attributes?: { name?: Strings } }) => t.attributes?.name?.en)
  )
  site.number('RELEASE_YEAR', a.year)
  site.text('STATUS', a.status)
  site.text('AGE_CATEGORY', a.contentRating)
  const file = related('cover_art')[0]?.attributes?.fileName
  return {
    title: clean(pick(a.title, 'en', 'ja-ro', 'ja') ?? Object.values(a.title ?? {})[0]),
    canonical: 'https://mangadex.org/title/' + id,
    image:
      typeof file === 'string' && /^[\w.-]+$/.test(file)
        ? 'https://uploads.mangadex.org/covers/' + id + '/' + file + '.512.jpg'
        : undefined,
  }
}

// Kitsu: /anime/<slug or id> or /manga/<slug or id>; genres are in the JSON:API "included" list.
export const kitsu: Adapter = async (site) => {
  const [, kind, key] = site.match(/^\/(anime|manga)\/([a-z0-9-]{1,100})\/?$/i)
  const query = /^\d+$/.test(key) ? 'filter[id]=' + key : 'filter[slug]=' + encodeURIComponent(key)
  const reply = await site.json(
    'https://kitsu.io/api/edge/' + kind.toLowerCase() + '?' + query + '&include=categories'
  )
  const data = reply.data?.[0]
  if (!data || !/^\d+$/.test(String(data.id))) throw new SourceError('notFound')
  const a = data.attributes ?? {}
  site.text('TITLE_ORIGINAL', pick(a.titles, 'ja_jp', 'ko_kr', 'zh_cn'))
  site.text('DESCRIPTION', a.synopsis)
  site.text('RELEASE_DATE', a.startDate)
  site.text('FORMAT', a.subtype)
  site.text('STATUS', a.status)
  site.number('EPISODE_COUNT', a.episodeCount)
  site.number('CHAPTER_COUNT', a.chapterCount)
  site.list(
    'GENRES',
    (reply.included ?? [])
      .filter((item: { type?: string }) => item?.type === 'categories')
      .map((item: { attributes?: { title?: string } }) => item.attributes?.title)
  )
  return {
    title: clean(a.canonicalTitle ?? pick(a.titles, 'en', 'en_jp')),
    canonical: 'https://kitsu.app/' + kind.toLowerCase() + '/' + (a.slug ?? data.id),
    image: a.posterImage?.medium ?? a.posterImage?.original,
  }
}

// MangaUpdates: the address carries the series ID in base 36; the API wants the number.
export const mangaupdates: Adapter = async (site) => {
  const short = site.match(/^\/series\/([0-9a-z]{1,12})(?:\/[^/]*)?\/?$/i)[1].toLowerCase(),
    id = parseInt(short, 36)
  if (!Number.isSafeInteger(id) || id <= 0) throw new SourceError('notFound')
  const data = await site.json('https://api.mangaupdates.com/v1/series/' + id)
  if (Number(data.series_id) !== id) throw new SourceError('notFound')
  site.text('DESCRIPTION', data.description)
  site.text('FORMAT', data.type)
  site.text('RELEASE_YEAR', data.year)
  site.text('STATUS', data.status)
  site.list(
    'GENRES',
    (data.genres ?? []).map((g: { genre?: string }) => g?.genre)
  )
  site.list(
    'AUTHORS',
    (data.authors ?? []).map((a: { name?: string }) => a?.name)
  )
  site.list(
    'TITLE_ALIASES',
    (data.associated ?? []).map((a: { title?: string }) => a?.title)
  )
  site.list(
    'PUBLISHERS',
    (data.publishers ?? []).map((p: { publisher_name?: string }) => p?.publisher_name)
  )
  return {
    title: clean(data.title),
    canonical: 'https://www.mangaupdates.com/series/' + short,
    image: data.image?.url?.original,
  }
}

// 小説家になろう (and its R18 sister ノクターン／ムーンライト at novel18): the official novel API by ncode.
export const narou: Adapter = async (site) => {
  const ncode = site.match(/^\/(n\d{4}[a-z]{1,3})\/?(?:\d+\/?)?$/i)[1].toLowerCase()
  const adult = site.input.hostname === 'novel18.syosetu.com'
  const reply = await site.json(
    'https://api.syosetu.com/' +
      (adult ? 'novel18api' : 'novelapi') +
      '/api/?out=json&lim=1&of=t-w-s-g-k-gf-ga-nu-l-e&ncode=' +
      ncode
  )
  const data = Array.isArray(reply) ? reply[1] : undefined
  if (!data || typeof data.title !== 'string') throw new SourceError('notFound')
  site.list('AUTHORS', [data.writer])
  site.text('DESCRIPTION', data.story)
  site.list('TAGS', typeof data.keyword === 'string' ? data.keyword.split(/\s+/) : [])
  site.text(
    'RELEASE_DATE',
    typeof data.general_firstup === 'string' ? data.general_firstup.slice(0, 10) : ''
  )
  site.number('CHAPTER_COUNT', data.general_all_no)
  site.number('WORD_COUNT', data.length)
  site.text('STATUS', data.end === 0 ? '完結' : data.end === 1 ? '連載中' : undefined)
  return {
    title: clean(data.title),
    canonical: 'https://' + (adult ? 'novel18' : 'ncode') + '.syosetu.com/' + ncode + '/',
  }
}

// Apple Music / iTunes: the album ID at the end of the address; songs come in the same lookup.
export const itunes: Adapter = async (site) => {
  const [, country, id] = site.match(/^\/([a-z]{2})\/album\/(?:[^/]+\/)?(?:id)?(\d{1,15})\/?$/i)
  const reply = await site.json(
    'https://itunes.apple.com/lookup?id=' +
      id +
      '&entity=song&limit=200&country=' +
      country.toLowerCase()
  )
  const results = (reply.results ?? []) as Record<string, unknown>[]
  const album = results.find((r) => r.wrapperType === 'collection' && String(r.collectionId) === id)
  if (!album) throw new SourceError('notFound')
  site.list('ARTISTS', [album.artistName])
  site.list('GENRES', [album.primaryGenreName])
  site.text(
    'RELEASE_DATE',
    typeof album.releaseDate === 'string' ? album.releaseDate.slice(0, 10) : ''
  )
  site.number('TRACK_COUNT', album.trackCount)
  site.text('COPYRIGHT', album.copyright)
  site.list(
    'TRACKS',
    results.filter((r) => r.wrapperType === 'track').map((r) => r.trackName)
  )
  const art = typeof album.artworkUrl100 === 'string' ? album.artworkUrl100 : undefined
  return {
    title: clean(album.collectionName),
    canonical: 'https://music.apple.com/' + country.toLowerCase() + '/album/' + id,
    image: art?.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/600x600bb.$1'),
  }
}

// Deezer: /<language>/album/<id>.
export const deezer: Adapter = async (site) => {
  const id = site.match(/^\/(?:[a-z]{2}\/)?album\/(\d{1,15})\/?$/i)[1]
  const data = await site.json('https://api.deezer.com/album/' + id)
  if (data.error || String(data.id) !== id)
    throw new SourceError(data.error ? 'notFound' : 'format')
  site.list('ARTISTS', [
    data.artist?.name,
    ...(data.contributors ?? []).map((c: { name?: string }) => c?.name),
  ])
  site.list(
    'GENRES',
    (data.genres?.data ?? []).map((g: { name?: string }) => g?.name)
  )
  site.text('RELEASE_DATE', data.release_date)
  site.text('LABEL', data.label)
  site.text('BARCODE', data.upc)
  site.number('TRACK_COUNT', data.nb_tracks)
  site.list(
    'TRACKS',
    (data.tracks?.data ?? []).map((t: { title?: string }) => t?.title)
  )
  return {
    title: clean(data.title),
    canonical: 'https://www.deezer.com/album/' + id,
    image: data.cover_xl ?? data.cover_big,
  }
}

// Danbooru: /posts/<id>; tags come grouped (artist, copyright, character, general). Rating g/s/q/e.
export const danbooru: Adapter = async (site) => {
  const id = site.match(/^\/posts\/(\d{1,12})\/?$/)[1]
  const data = await site.json('https://danbooru.donmai.us/posts/' + id + '.json')
  if (String(data.id) !== id) throw new SourceError('notFound')
  const split = (value: unknown) =>
    typeof value === 'string' ? value.split(' ').filter(Boolean) : []
  site.list('ARTIST', split(data.tag_string_artist))
  site.list('PARODY', split(data.tag_string_copyright))
  site.list('CHARACTER', split(data.tag_string_character))
  site.list('TAGS', split(data.tag_string_general))
  site.text(
    'AGE_CATEGORY',
    ({ g: 'general', s: 'sensitive', q: 'questionable', e: 'explicit' } as Strings)[data.rating]
  )
  site.text('RELEASE_DATE', typeof data.created_at === 'string' ? data.created_at.slice(0, 10) : '')
  const copyright = split(data.tag_string_copyright)[0],
    character = split(data.tag_string_character)[0]
  return {
    title: clean([character, copyright].filter(Boolean).join(' · ') || 'Danbooru #' + id),
    canonical: 'https://danbooru.donmai.us/posts/' + id,
    image: data.large_file_url ?? data.preview_file_url,
  }
}

// Google Books: books.google.com/books?id=… or google.com/books/edition/_/… .
export const googlebooks: Adapter = async (site) => {
  const fromQuery =
    site.input.pathname.replace(/\/$/, '') === '/books' ? site.input.searchParams.get('id') : null
  const id =
    fromQuery && /^[\w-]{6,20}$/.test(fromQuery)
      ? fromQuery
      : site.match(/^\/books\/edition\/[^/]*\/([\w-]{6,20})\/?$/)[1]
  const data = await site.json('https://www.googleapis.com/books/v1/volumes/' + id)
  if (data.id !== id) throw new SourceError('notFound')
  const v = data.volumeInfo ?? {}
  site.text('SUBTITLE', v.subtitle)
  site.list('AUTHORS', v.authors)
  site.list('PUBLISHERS', [v.publisher])
  site.text('RELEASE_DATE', v.publishedDate)
  site.text('DESCRIPTION', v.description)
  site.number('PAGE_COUNT', v.pageCount)
  site.list('GENRES', v.categories)
  site.text('LANGUAGE', v.language)
  site.list(
    'ISBN',
    (v.industryIdentifiers ?? [])
      .filter((i: { type?: string }) => /ISBN/.test(i?.type ?? ''))
      .map((i: { identifier?: string }) => i?.identifier)
  )
  const thumb = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail
  return {
    title: clean(v.title),
    canonical: 'https://books.google.com/books?id=' + id,
    image:
      typeof thumb === 'string'
        ? thumb.replace(/^http:/, 'https:').replace('&edge=curl', '')
        : undefined,
  }
}
