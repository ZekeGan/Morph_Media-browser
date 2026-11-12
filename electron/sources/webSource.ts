import type { MetadataPreview } from '../../shared/explorer'
import { fetchImageUrl } from '../image-url'
import { SourceError } from '../metadata-common'
import { clean, tags as tagList } from './site'
import { fetchPage, pageMeta, type PageMeta, type WebOptions } from './web'

export type WebResult = {
  preview: Omit<MetadataPreview, 'token'>
  cover?: { bytes: Buffer; mime: string; ext: string }
}

// Turns what a page says about itself into preview values; site adapters pass extra values of their own.
export async function webPreview(
  provider: string,
  page: { url: URL; meta: PageMeta },
  extra: MetadataPreview['values'],
  options: WebOptions & {
    canonical?: string
    title?: string
    image?: string
    fetcher?: typeof fetch
  } = {}
): Promise<WebResult> {
  const { meta } = page
  const title = clean(options.title ?? meta.title ?? '').slice(0, 1000)
  if (!title.trim()) throw new SourceError('format')
  const canonical = options.canonical ?? meta.canonical ?? page.url.href
  const values: MetadataPreview['values'] = [
    { key: 'TITLE', type: 'string', value: title },
    { key: 'SOURCE_URL', type: 'string', value: canonical },
  ]
  const text = (key: string, value: string | undefined) => {
    const result = clean(value)
    if (result && !values.some((v) => v.key === key))
      values.push({ key, type: 'string', value: result })
  }
  const list = (key: string, value: unknown) => {
    const result = tagList(value)
    if (result.length && !values.some((v) => v.key === key))
      values.push({ key, type: 'tags', value: result })
  }
  for (const value of extra) if (!values.some((v) => v.key === value.key)) values.push(value)
  text('DESCRIPTION', meta.description)
  list('AUTHORS', meta.authors)
  text('RELEASE_DATE', meta.date)
  list('TAGS', meta.keywords)
  text('SITE_NAME', meta.siteName)
  const result: WebResult = {
    preview: {
      provider: provider as MetadataPreview['provider'],
      title: title.slice(0, 200),
      source: canonical,
      values,
    },
  }
  // The cover can be on any host, so it goes through the safe image download: HTTPS, no private addresses,
  // limited size and redirects, and the bytes must be a known image format.
  const image = options.image ?? meta.image
  if (image && image.startsWith('https://'))
    try {
      const picture = await fetchImageUrl(image, {
        lookup: options.lookup,
        fetcher: options.fetcher,
      })
      result.cover = { bytes: picture.bytes, mime: picture.mime, ext: picture.ext }
      result.preview.image = 'data:' + picture.mime + ';base64,' + picture.bytes.toString('base64')
    } catch {
      values.push({ key: 'COVER_STATUS', type: 'string', value: '封面無法取得；可略過或手動匯入' })
    }
  return result
}

// R-283: any web page, from its JSON-LD, OpenGraph and title only.
export async function webMetadata(source: string, fetcher: typeof fetch, options: WebOptions = {}) {
  const { url, html } = await fetchPage(source, fetcher, options)
  return webPreview('web', { url, meta: pageMeta(html, url) }, [], { ...options, fetcher })
}
