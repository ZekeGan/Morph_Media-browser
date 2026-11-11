import { SourceError, sourceJson } from '../metadata-common'
import { clean, type Adapter } from './site'

// The gallery data is a JavaScript file; only its JSON object is read, the script itself is never run.
export const hitomi: Adapter = async (site) => {
  const id = site
    .match(/^\/(?:(?:reader|galleries)\/([1-9]\d{0,11})|[^/]+\/[^/]*-([1-9]\d{0,11}))\.html$/)
    .slice(1)
    .find(Boolean)!
  const script = await site.request(
    'https://ltn.gold-usergeneratedcontent.net/galleries/' + id + '.js'
  )
  const payload = /^\s*(?:var|let|const)\s+galleryinfo\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(script)
  if (!payload) throw new SourceError('format')
  const data = sourceJson(payload[1])
  if (String(data.id) !== id) throw new SourceError('notFound')
  site.text('TITLE_ORIGINAL', data.japanese_title)
  site.text('LANGUAGE', data.language)
  site.text('FORMAT', data.type)
  site.text('RELEASE_DATE', data.date)
  site.list(
    'AUTHORS',
    data.artists?.map((artist: { artist?: unknown }) => artist?.artist)
  )
  site.list(
    'TAGS',
    data.tags?.map((tag: { tag?: unknown }) => tag?.tag)
  )
  site.number('PAGE_COUNT', Array.isArray(data.files) ? data.files.length : undefined)
  return { title: clean(data.title), canonical: 'https://hitomi.la/reader/' + id + '.html' }
}
