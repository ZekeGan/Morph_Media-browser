import { SourceError } from '../metadata-common'
import { clean, type Adapter } from './site'
import { attribute, blocks, entity } from './web'

// R-285–R-290: sources that need the user's own key (site.keys, read by main only). Each validates the work ID from
// the pasted address and asks only its fixed API host. Written against the sites' public API documentation; until
// the user enters keys they are verified with fixed replies only.

// TMDB: /movie/<id>-slug or /tv/<id>-slug. A Read Access Token (a JWT) goes in the Authorization header, an API key
// in the query. Pictures come from image.tmdb.org at a fixed size; the terms ask to credit TMDB (the window does).
export const tmdb: Adapter = async (site) => {
  const [, kind, id] = site.match(/^\/(movie|tv)\/(\d{1,10})(?:-[^/]*)?\/?$/)
  const token = site.keys.token ?? ''
  const bearer = token.startsWith('eyJ')
  const data = await site.json(
    'https://api.themoviedb.org/3/' +
      kind +
      '/' +
      id +
      '?language=en-US' +
      (bearer ? '' : '&api_key=' + encodeURIComponent(token)),
    undefined,
    bearer ? { headers: { Authorization: 'Bearer ' + token } } : {}
  )
  if (String(data.id) !== id) throw new SourceError('notFound')
  site.text('TITLE_ORIGINAL', data.original_title ?? data.original_name)
  site.text('DESCRIPTION', data.overview)
  site.text('RELEASE_DATE', data.release_date ?? data.first_air_date)
  site.list(
    'GENRES',
    (data.genres ?? []).map((g: { name?: string }) => g?.name)
  )
  site.list(
    'PUBLISHERS',
    (data.production_companies ?? []).map((c: { name?: string }) => c?.name)
  )
  site.number('RUNTIME', data.runtime)
  site.number('EPISODE_COUNT', data.number_of_episodes)
  site.text('SOURCE_CREDIT', 'TMDB')
  return {
    title: clean(data.title ?? data.name),
    canonical: 'https://www.themoviedb.org/' + kind + '/' + id,
    image:
      typeof data.poster_path === 'string' && /^\/[\w.-]+$/.test(data.poster_path)
        ? 'https://image.tmdb.org/t/p/w500' + data.poster_path
        : undefined,
  }
}

// MyAnimeList: /anime/<id> or /manga/<id>; the Client ID goes in X-MAL-CLIENT-ID.
export const mal: Adapter = async (site) => {
  const [, kind, id] = site.match(/^\/(anime|manga)\/(\d{1,10})(?:\/[^/]*)?\/?$/)
  const fields =
    kind === 'anime'
      ? 'title,alternative_titles,start_date,synopsis,genres,num_episodes,studios,main_picture,media_type,status'
      : 'title,alternative_titles,start_date,synopsis,genres,num_chapters,num_volumes,authors{first_name,last_name},main_picture,media_type,status'
  const data = await site.json(
    'https://api.myanimelist.net/v2/' + kind + '/' + id + '?fields=' + fields,
    undefined,
    { headers: { 'X-MAL-CLIENT-ID': site.keys.clientId ?? '' } }
  )
  if (String(data.id) !== id) throw new SourceError('notFound')
  site.text('TITLE_ORIGINAL', data.alternative_titles?.ja)
  site.text('DESCRIPTION', data.synopsis)
  site.text('RELEASE_DATE', data.start_date)
  site.text('FORMAT', data.media_type)
  site.text('STATUS', data.status)
  site.list(
    'GENRES',
    (data.genres ?? []).map((g: { name?: string }) => g?.name)
  )
  site.list(
    'PUBLISHERS',
    (data.studios ?? []).map((s: { name?: string }) => s?.name)
  )
  site.list(
    'AUTHORS',
    (data.authors ?? []).map((a: { node?: { first_name?: string; last_name?: string } }) =>
      [a?.node?.first_name, a?.node?.last_name].filter(Boolean).join(' ')
    )
  )
  site.number('EPISODE_COUNT', data.num_episodes)
  site.number('CHAPTER_COUNT', data.num_chapters)
  return {
    title: clean(data.title),
    canonical: 'https://myanimelist.net/' + kind + '/' + id,
    image: data.main_picture?.large ?? data.main_picture?.medium,
  }
}

// OMDb, also for IMDb addresses: the tt number is the work ID.
export const omdb: Adapter = async (site) => {
  const id = site.match(/^\/title\/(tt\d{5,10})\/?$/)[1]
  const data = await site.json(
    'https://www.omdbapi.com/?i=' +
      id +
      '&plot=full&apikey=' +
      encodeURIComponent(site.keys.apiKey ?? '')
  )
  if (data.Response === 'False') {
    if (/api key/i.test(String(data.Error))) throw new SourceError('restricted')
    throw new SourceError('notFound')
  }
  if (data.imdbID !== id) throw new SourceError('notFound')
  const real = (value: unknown) =>
    typeof value === 'string' && value !== 'N/A' ? value : undefined
  const split = (value: unknown) => real(value)?.split(/,\s*/) ?? []
  site.text('RELEASE_DATE', real(data.Released))
  site.text('DESCRIPTION', real(data.Plot))
  site.list('GENRES', split(data.Genre))
  site.list('DIRECTORS', split(data.Director))
  site.list('AUTHORS', split(data.Writer))
  site.list('CAST', split(data.Actors))
  site.text('RUNTIME_TEXT', real(data.Runtime))
  return {
    title: clean(data.Title),
    canonical: 'https://www.imdb.com/title/' + id + '/',
    image: real(data.Poster),
  }
}

// Trakt: /movies/<slug> or /shows/<slug>. No pictures (the terms send you to TMDB for them).
export const trakt: Adapter = async (site) => {
  const [, kind, slug] = site.match(/^\/(movies|shows)\/([a-z0-9-]{1,120})\/?$/)
  const data = await site.json(
    'https://api.trakt.tv/' + kind + '/' + slug + '?extended=full',
    undefined,
    {
      headers: { 'trakt-api-version': '2', 'trakt-api-key': site.keys.clientId ?? '' },
    }
  )
  if (data.ids?.slug !== slug) throw new SourceError('notFound')
  site.text('DESCRIPTION', data.overview)
  site.text('RELEASE_DATE', data.released ?? data.first_aired?.slice(0, 10))
  site.list('GENRES', data.genres)
  site.number('RUNTIME', data.runtime)
  site.text('IMDB_ID', data.ids?.imdb)
  return { title: clean(data.title), canonical: 'https://trakt.tv/' + kind + '/' + slug }
}

// RAWG: /games/<slug>; the terms ask for a link back, kept as the source address.
export const rawg: Adapter = async (site) => {
  const slug = site.match(/^\/games\/([a-z0-9-]{1,150})\/?$/)[1]
  const data = await site.json(
    'https://api.rawg.io/api/games/' + slug + '?key=' + encodeURIComponent(site.keys.apiKey ?? '')
  )
  if (data.slug !== slug) throw new SourceError('notFound')
  site.text('RELEASE_DATE', data.released)
  site.text('DESCRIPTION', data.description_raw)
  site.list(
    'GENRES',
    (data.genres ?? []).map((g: { name?: string }) => g?.name)
  )
  site.list(
    'DEVELOPERS',
    (data.developers ?? []).map((g: { name?: string }) => g?.name)
  )
  site.list(
    'PUBLISHERS',
    (data.publishers ?? []).map((g: { name?: string }) => g?.name)
  )
  site.list(
    'PLATFORMS',
    (data.platforms ?? []).map((p: { platform?: { name?: string } }) => p?.platform?.name)
  )
  site.text('SOURCE_CREDIT', 'RAWG')
  return {
    title: clean(data.name),
    canonical: 'https://rawg.io/games/' + slug,
    image: data.background_image,
  }
}

// Giant Bomb and Comic Vine share one API style: /<slug>/<type>-<id>/ and ?api_key=…&format=json.
const whiskey =
  (host: string, kinds: Record<string, string>): Adapter =>
  async (site) => {
    const [, type, id] = site.match(/^\/[^/]+\/(\d{4})-(\d{1,10})\/?$/)
    const kind = kinds[type]
    if (!kind) throw new Error('請輸入此來源的完整作品網址')
    const reply = await site.json(
      'https://' +
        host +
        '/api/' +
        kind +
        '/' +
        type +
        '-' +
        id +
        '/?format=json&api_key=' +
        encodeURIComponent(site.keys.apiKey ?? '')
    )
    if (reply.status_code === 100) throw new SourceError('restricted')
    const data = reply.results
    if (!data || String(data.id) !== id) throw new SourceError('notFound')
    site.text('DESCRIPTION', data.deck)
    site.text('RELEASE_DATE', data.original_release_date ?? data.cover_date ?? data.start_year)
    site.list(
      'GENRES',
      (data.genres ?? []).map((g: { name?: string }) => g?.name)
    )
    site.list(
      'DEVELOPERS',
      (data.developers ?? []).map((g: { name?: string }) => g?.name)
    )
    site.list('PUBLISHERS', [
      data.publisher?.name,
      ...(data.publishers ?? []).map((g: { name?: string }) => g?.name),
    ])
    site.list(
      'PLATFORMS',
      (data.platforms ?? []).map((g: { name?: string }) => g?.name)
    )
    site.number('ISSUE_COUNT', data.count_of_issues)
    return {
      title: clean(data.name ?? data.volume?.name),
      canonical: 'https://' + host + '/' + type + '-' + id + '/',
      image: data.image?.medium_url ?? data.image?.original_url,
    }
  }
export const giantbomb = whiskey('www.giantbomb.com', { '3030': 'game' })
export const comicvine = whiskey('comicvine.gamespot.com', { '4050': 'volume', '4000': 'issue' })

// SteamGridDB: /game/<id>; only the name and the first grid picture.
export const steamgriddb: Adapter = async (site) => {
  const id = site.match(/^\/game\/(\d{1,10})(?:\/[^/]*)?\/?$/)[1]
  const auth = { headers: { Authorization: 'Bearer ' + (site.keys.apiKey ?? '') } }
  const game = await site.json('https://www.steamgriddb.com/api/v2/games/id/' + id, undefined, auth)
  if (!game.success || String(game.data?.id) !== id) throw new SourceError('notFound')
  const grids = await site
    .json(
      'https://www.steamgriddb.com/api/v2/grids/game/' + id + '?dimensions=600x900',
      undefined,
      auth
    )
    .catch(() => undefined)
  if (typeof game.data.release_date === 'number')
    site.text('RELEASE_DATE', new Date(game.data.release_date * 1000).toISOString().slice(0, 10))
  return {
    title: clean(game.data.name),
    canonical: 'https://www.steamgriddb.com/game/' + id,
    image: grids?.data?.[0]?.url,
  }
}

// Last.fm: /music/<artist>/<album>; names are in the address.
export const lastfm: Adapter = async (site) => {
  const [, artistPart, albumPart] = site.match(/^\/music\/([^/]{1,200})\/([^/_+][^/]{0,199})\/?$/)
  const decode = (part: string) => decodeURIComponent(part.replace(/\+/g, ' '))
  const artist = decode(artistPart),
    album = decode(albumPart)
  const reply = await site.json(
    'https://ws.audioscrobbler.com/2.0/?method=album.getinfo&format=json&autocorrect=0&api_key=' +
      encodeURIComponent(site.keys.apiKey ?? '') +
      '&artist=' +
      encodeURIComponent(artist) +
      '&album=' +
      encodeURIComponent(album)
  )
  if (reply.error === 10 || reply.error === 26) throw new SourceError('restricted')
  const data = reply.album
  if (!data || typeof data.name !== 'string') throw new SourceError('notFound')
  site.list('ARTISTS', [data.artist])
  site.list(
    'TAGS',
    (data.tags?.tag ?? []).map((t: { name?: string }) => t?.name)
  )
  site.list(
    'TRACKS',
    [data.tracks?.track ?? []].flat().map((t: { name?: string }) => t?.name)
  )
  site.text('DESCRIPTION', data.wiki?.summary)
  const image = (data.image ?? []).find((i: { size?: string }) => i?.size === 'extralarge')?.[
    '#text'
  ]
  return {
    title: clean(data.name),
    canonical: 'https://www.last.fm/music/' + artistPart + '/' + albumPart,
    image: typeof image === 'string' && image ? image : undefined,
  }
}

// Discogs: /release/<id> or /master/<id>; the token is optional (pictures need it).
export const discogs: Adapter = async (site) => {
  const [, kind, id] = site.match(/^\/(?:[a-z]{2}\/)?(release|master)\/(\d{1,12})(?:-[^/]*)?\/?$/)
  const token = site.keys.token
  const data = await site.json(
    'https://api.discogs.com/' + kind + 's/' + id,
    undefined,
    token ? { headers: { Authorization: 'Discogs token=' + token } } : {}
  )
  if (String(data.id) !== id) throw new SourceError('notFound')
  site.list(
    'ARTISTS',
    (data.artists ?? []).map((a: { name?: string }) => a?.name)
  )
  site.text('RELEASE_DATE', data.released ?? (data.year ? String(data.year) : undefined))
  site.list('GENRES', [...(data.genres ?? []), ...(data.styles ?? [])])
  site.list(
    'LABEL',
    (data.labels ?? []).map((l: { name?: string }) => l?.name)
  )
  site.list(
    'TRACKS',
    (data.tracklist ?? []).map((t: { title?: string }) => t?.title)
  )
  return {
    title: clean(data.title),
    canonical: 'https://www.discogs.com/' + kind + '/' + id,
    image: token ? data.images?.[0]?.uri : undefined,
  }
}

// IGDB: Twitch client credentials are exchanged for an app token (kept in memory until it nearly expires), then
// the game is looked up by the slug in the address with IGDB's query language.
const igdbTokens = new Map<string, { token: string; until: number }>()
export const igdb: Adapter = async (site) => {
  const slug = site.match(/^\/games\/([a-z0-9-]{1,150})\/?$/)[1]
  const clientId = site.keys.clientId ?? '',
    secret = site.keys.clientSecret ?? ''
  const cacheKey = clientId + '\n' + secret
  let cached = igdbTokens.get(cacheKey)
  if (!cached || cached.until < Date.now()) {
    // The secret travels in the form body, not the address.
    const reply = await site.json('https://id.twitch.tv/oauth2/token', undefined, {
      form:
        'grant_type=client_credentials&client_id=' +
        encodeURIComponent(clientId) +
        '&client_secret=' +
        encodeURIComponent(secret),
    })
    if (typeof reply.access_token !== 'string') throw new SourceError('restricted')
    cached = {
      token: reply.access_token,
      until: Date.now() + Math.max(60, Number(reply.expires_in) - 3600) * 1000,
    }
    igdbTokens.set(cacheKey, cached)
  }
  const list = await site.json('https://api.igdb.com/v4/games', undefined, {
    headers: { 'Client-ID': clientId, Authorization: 'Bearer ' + cached.token },
    raw:
      'fields name,slug,first_release_date,summary,genres.name,platforms.name,' +
      'involved_companies.company.name,involved_companies.developer,involved_companies.publisher,cover.image_id;' +
      ' where slug = "' +
      slug +
      '"; limit 1;',
  })
  const data = Array.isArray(list) ? list[0] : undefined
  if (!data || data.slug !== slug) throw new SourceError('notFound')
  const companies = (data.involved_companies ?? []) as {
    company?: { name?: string }
    developer?: boolean
    publisher?: boolean
  }[]
  site.text('DESCRIPTION', data.summary)
  if (typeof data.first_release_date === 'number')
    site.text('RELEASE_DATE', new Date(data.first_release_date * 1000).toISOString().slice(0, 10))
  site.list(
    'GENRES',
    (data.genres ?? []).map((g: { name?: string }) => g?.name)
  )
  site.list(
    'PLATFORMS',
    (data.platforms ?? []).map((p: { name?: string }) => p?.name)
  )
  site.list(
    'DEVELOPERS',
    companies.filter((c) => c.developer).map((c) => c.company?.name)
  )
  site.list(
    'PUBLISHERS',
    companies.filter((c) => c.publisher).map((c) => c.company?.name)
  )
  const cover = data.cover?.image_id
  return {
    title: clean(data.name),
    canonical: 'https://www.igdb.com/games/' + slug,
    image:
      typeof cover === 'string' && /^\w+$/.test(cover)
        ? 'https://images.igdb.com/igdb/image/upload/t_cover_big/' + cover + '.jpg'
        : undefined,
  }
}

// TheTVDB: log in with the key (and PIN) for a token, kept in memory for its month; the address has the slug.
const tvdbTokens = new Map<string, { token: string; until: number }>()
export const tvdb: Adapter = async (site) => {
  const slug = site.match(/^\/series\/([a-z0-9-]{1,150})\/?$/)[1]
  const key = (site.keys.apiKey ?? '') + '|' + (site.keys.pin ?? '')
  let cached = tvdbTokens.get(key)
  if (!cached || cached.until < Date.now()) {
    const login = await site.json('https://api4.thetvdb.com/v4/login', {
      apikey: site.keys.apiKey ?? '',
      ...(site.keys.pin ? { pin: site.keys.pin } : {}),
    })
    if (typeof login.data?.token !== 'string') throw new SourceError('restricted')
    cached = { token: login.data.token, until: Date.now() + 25 * 24 * 3600 * 1000 }
    tvdbTokens.set(key, cached)
  }
  const auth = { headers: { Authorization: 'Bearer ' + cached.token } }
  const found = await site.json('https://api4.thetvdb.com/v4/series/slug/' + slug, undefined, auth)
  const id = found.data?.id
  if (!Number.isSafeInteger(id)) throw new SourceError('notFound')
  const data = (
    await site.json(
      'https://api4.thetvdb.com/v4/series/' + id + '/extended?short=true',
      undefined,
      auth
    )
  ).data
  if (data?.id !== id) throw new SourceError('notFound')
  site.text('RELEASE_DATE', data.firstAired)
  site.text('DESCRIPTION', data.overview)
  site.text('STATUS', data.status?.name)
  site.list(
    'GENRES',
    (data.genres ?? []).map((g: { name?: string }) => g?.name)
  )
  return {
    title: clean(data.name),
    canonical: 'https://www.thetvdb.com/series/' + slug,
    image: data.image,
  }
}

// FANZA / DMM.com: the content ID (cid) from the address; the DMM web service needs API ID and affiliate ID, and its
// terms ask to show a credit (the window does).
export const fanza: Adapter = async (site) => {
  const cid =
    /(?:^|[/?&])cid=([a-z0-9_]{3,40})/i.exec(site.input.pathname + site.input.search)?.[1] ??
    /\/detail\/([a-z0-9_]{3,40})\/?$/i.exec(site.input.pathname)?.[1]
  if (!cid) throw new Error('請輸入此來源的完整作品網址')
  const dmmSite = site.input.hostname.endsWith('dmm.com') ? 'DMM.com' : 'FANZA'
  const reply = await site.json(
    'https://api.dmm.com/affiliate/v3/ItemList?output=json&hits=1&site=' +
      encodeURIComponent(dmmSite) +
      '&cid=' +
      encodeURIComponent(cid.toLowerCase()) +
      '&api_id=' +
      encodeURIComponent(site.keys.apiId ?? '') +
      '&affiliate_id=' +
      encodeURIComponent(site.keys.affiliateId ?? '')
  )
  if (reply.result?.status === 400 || reply.result?.status === 401)
    throw new SourceError('restricted')
  const data = reply.result?.items?.[0]
  if (!data || String(data.content_id).toLowerCase() !== cid.toLowerCase())
    throw new SourceError('notFound')
  const names = (list: unknown) =>
    (Array.isArray(list) ? list : []).map((i: { name?: string }) => i?.name)
  const info = data.iteminfo ?? {}
  site.text('PRODUCT_ID', data.content_id)
  site.text('RELEASE_DATE', typeof data.date === 'string' ? data.date.slice(0, 10) : undefined)
  site.list('GENRES', names(info.genre))
  site.list('MAKER_NAME', names(info.maker))
  site.list('AUTHORS', [...names(info.author), ...names(info.actress), ...names(info.artist)])
  site.list('SERIES', names(info.series))
  site.text('SOURCE_CREDIT', 'Powered by FANZA Webサービス')
  return {
    title: clean(data.title),
    canonical:
      data.URL && /^https:\/\/[a-z0-9.-]+\.dmm\.(co\.jp|com)\//.test(data.URL)
        ? data.URL
        : site.source,
    image: data.imageURL?.large,
  }
}

// AniDB: the HTTP API (no HTTPS) for registered clients; gzip XML. AniDB bans clients that ask more often than
// once every two seconds or ask for the same anime again, so answers are cached and requests spaced.
const anidbCache = new Map<string, string>()
let anidbLast = 0
export const anidb: Adapter = async (site) => {
  const aid = site.match(/^\/anime\/(\d{1,8})\/?$/)[1]
  let xml = anidbCache.get(aid)
  if (!xml) {
    const wait = anidbLast + 2500 - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    anidbLast = Date.now()
    xml = await site.request(
      'http://api.anidb.net:9001/httpapi?request=anime&protover=1&client=' +
        encodeURIComponent(site.keys.client ?? '') +
        '&clientver=' +
        encodeURIComponent(site.keys.clientver ?? '') +
        '&aid=' +
        aid
    )
    if (/<error[\s>]/i.test(xml.slice(0, 500))) {
      if (/client|banned|access/i.test(xml.slice(0, 500))) throw new SourceError('restricted')
      throw new SourceError('notFound')
    }
    anidbCache.set(aid, xml)
  }
  const anime = blocks(xml, 'anime', 4 * 1024 * 1024)[0]
  if (!anime || attribute(anime.tag, 'id') !== aid) throw new SourceError('format')
  const titles = blocks(anime.inner, 'title', 1000)
  const titleOf = (type: string, lang?: string) =>
    titles.find(
      (t) => attribute(t.tag, 'type') === type && (!lang || attribute(t.tag, 'xml:lang') === lang)
    )?.inner
  const text = (name: string) => {
    const inner = blocks(anime.inner, name, 50_000)[0]?.inner
    return inner === undefined ? undefined : entity(inner.replace(/<[^<>]*>/g, '')).trim()
  }
  site.text('TITLE_ORIGINAL', titleOf('official', 'ja'))
  site.text('FORMAT', text('type'))
  site.number('EPISODE_COUNT', Number(text('episodecount')))
  site.text('RELEASE_DATE', text('startdate'))
  site.text('DESCRIPTION', text('description'))
  site.list(
    'TAGS',
    blocks(blocks(anime.inner, 'tags', 500_000)[0]?.inner ?? '', 'tag', 2000)
      .map((tag) => blocks(tag.inner, 'name', 200)[0]?.inner)
      .slice(0, 100)
  )
  const picture = text('picture')
  return {
    title: clean(titleOf('main') ?? titleOf('official', 'en')),
    canonical: 'https://anidb.net/anime/' + aid,
    image:
      picture && /^[\w.-]+$/.test(picture)
        ? 'https://cdn-eu.anidb.net/images/main/' + picture
        : undefined,
  }
}
