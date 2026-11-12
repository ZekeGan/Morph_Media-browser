import { SourceError } from '../metadata-common'
import { clean, type Adapter } from './site'

// R-285–R-290, R-321: sources that need the user's own key, kept where no keyless source does the job (site.keys, read by main only). Each validates the work ID from
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
