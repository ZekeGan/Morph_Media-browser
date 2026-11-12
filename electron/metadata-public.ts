import type { MetadataPreview } from '../shared/explorer'
import { KEY_MISSING, KEY_REJECTED } from '../shared/keys'
import { imageType, limitedBytes, SourceError, sourceJson, sourceRequest } from './metadata-common'
import { sourceConfig, userAgent, type PublicSourceId } from './sources/config'
import { clean, tags, type Adapter, type RequestExtra, type Site } from './sources/site'
import { anilist } from './sources/anilist'
import { bangumi } from './sources/bangumi'
import { commons } from './sources/commons'
import { dlsite } from './sources/dlsite'
import { hitomi } from './sources/hitomi'
import { musicbrainz } from './sources/musicbrainz'
import { openlibrary } from './sources/openlibrary'
import { pixiv } from './sources/pixiv'
import { vndb } from './sources/vndb'
import { booth, kakuyomu } from './sources/pages'
import { fanza, steamgriddb, tmdb } from './sources/keyed'
import {
  danbooru,
  deezer,
  googlebooks,
  itunes,
  kitsu,
  mangadex,
  mangaupdates,
  narou,
} from './sources/batch1'

type Result = {
  preview: Omit<MetadataPreview, 'token'>
  cover?: { bytes: Buffer; mime: string; ext: string }
}
// One adapter per site in electron/sources/; their hosts, headers and cover hosts are in sources/config.ts.
const adapters: Record<PublicSourceId, Adapter> = {
  bangumi,
  anilist,
  vndb,
  musicbrainz,
  openlibrary,
  commons,
  dlsite,
  pixiv,
  hitomi,
  mangadex,
  kitsu,
  mangaupdates,
  narou,
  itunes,
  deezer,
  danbooru,
  googlebooks,
  booth,
  kakuyomu,
  tmdb,
  steamgriddb,
  fanza,
}

// The requested URLs are constructed from validated IDs, never from remote JSON links, and must be on the site's
// request hosts. Redirects and oversized responses fail without touching local data.
export async function publicMetadata(
  provider: PublicSourceId,
  source: string,
  fetcher: typeof fetch,
  options: { keyFor?: (site: string) => Promise<Record<string, string> | undefined> } = {}
): Promise<Result> {
  const config = sourceConfig[provider]
  const values: MetadataPreview['values'] = []
  // R-285: the user's own key for this site, read by main only. A required key that is missing stops here.
  const keys = config.keySite ? ((await options.keyFor?.(config.keySite)) ?? {}) : {}
  if (config.keySite && config.keyNeed === 'required' && !Object.keys(keys).length)
    throw new Error(KEY_MISSING)
  // R-293: a DMM/FANZA address without the user's key is looked up through VNDB (games only).
  if (provider === 'fanza' && !Object.keys(keys).length)
    return publicMetadata('vndb', source, fetcher, options)
  const request = async (url: string, body?: unknown, extra: RequestExtra = {}) => {
    const target = new URL(url)
    if (
      target.protocol !== 'https:' ||
      target.port ||
      target.username ||
      target.password ||
      !config.requestHosts.includes(target.hostname)
    )
      throw new Error('Request host not allowed for this source: ' + target.hostname)
    const raw = typeof extra.raw === 'string',
      form = typeof extra.form === 'string'
    try {
      const bytes = await sourceRequest(fetcher, target, {
        method: body !== undefined || raw || form ? 'POST' : (extra.method ?? 'GET'),
        headers: {
          Accept: config.accept ?? 'application/json',
          'User-Agent': userAgent,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(raw ? { 'Content-Type': 'text/plain' } : {}),
          ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...(config.referer ? { Referer: source } : {}),
          ...extra.headers,
        },
        ...(body !== undefined
          ? { body: JSON.stringify(body) }
          : raw
            ? { body: extra.raw }
            : form
              ? { body: extra.form }
              : {}),
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      })
      return bytes.toString('utf8')
    } catch (error) {
      // A refused key says so, instead of the general "needs access".
      if (error instanceof SourceError && error.kind === 'restricted' && Object.keys(keys).length)
        throw new Error(KEY_REJECTED)
      throw error
    }
  }
  const input = new URL(source)
  const site: Site = {
    input,
    source,
    match(expression) {
      const result = expression.exec(input.pathname)
      if (!result) throw new Error('請輸入此來源的完整作品網址')
      return result
    },
    request,
    json: async (url, body, extra) => sourceJson(await request(url, body, extra)),
    keys,
    text(key, value) {
      const result = clean(value)
      if (result) values.push({ key, type: 'string', value: result })
    },
    list(key, value) {
      const result = tags(value)
      if (result.length) values.push({ key, type: 'tags', value: result })
    },
    number(key, value) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
        values.push({ key, type: 'number', value })
    },
  }
  const { title, canonical, image } = await adapters[provider](site)
  if (!title.trim()) throw new SourceError('format')
  values.unshift(
    { key: 'TITLE', type: 'string', value: title },
    { key: 'SOURCE_URL', type: 'string', value: canonical }
  )
  const result: Result = {
    preview: { provider, title: title.slice(0, 200), source: canonical, values },
  }
  if (typeof image === 'string')
    try {
      const url = new URL(image)
      if (
        url.protocol !== 'https:' ||
        url.port ||
        url.username ||
        url.password ||
        !config.coverHosts.includes(url.hostname)
      )
        throw new Error('封面來源未允許')
      const bytes = await limitedBytes(
        await fetcher(url, {
          signal: AbortSignal.timeout(15000),
          redirect: 'error',
          headers: {
            'User-Agent': userAgent,
            ...(config.referer ? { Referer: canonical } : {}),
          },
        }),
        10 * 1024 * 1024
      )
      const type = imageType(bytes)
      if (!type) throw new Error('封面格式未支援')
      result.cover = { bytes, ...type }
      result.preview.image = 'data:' + type.mime + ';base64,' + bytes.toString('base64')
    } catch {
      values.push({ key: 'COVER_STATUS', type: 'string', value: '封面無法取得；可略過或手動匯入' })
    }
  return result
}
