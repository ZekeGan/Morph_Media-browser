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
  // R-365: what the gallery page shows besides artists — circles, series and characters — and the ♀/♂ marks of its
  // tags, kept as "female:" / "male:" the way E-Hentai names them, with their own fields as well.
  const names = (list: unknown, key: string) =>
    Array.isArray(list) ? list.map((item: Record<string, unknown>) => item?.[key]) : []
  site.list('GROUP', names(data.groups, 'group'))
  site.list('PARODY', names(data.parodys, 'parody'))
  site.list('CHARACTER', names(data.characters, 'character'))
  const tags: { tag?: unknown; female?: unknown; male?: unknown }[] = Array.isArray(data.tags)
    ? data.tags
    : []
  const marked = (tag: (typeof tags)[number]) =>
    String(tag?.female) === '1' ? 'female' : String(tag?.male) === '1' ? 'male' : undefined
  site.list(
    'TAGS',
    tags.map((tag) =>
      marked(tag) && typeof tag?.tag === 'string' ? `${marked(tag)}:${tag.tag}` : tag?.tag
    )
  )
  site.list(
    'FEMALE',
    tags.filter((tag) => marked(tag) === 'female').map((tag) => tag?.tag)
  )
  site.list(
    'MALE',
    tags.filter((tag) => marked(tag) === 'male').map((tag) => tag?.tag)
  )
  site.number('PAGE_COUNT', Array.isArray(data.files) ? data.files.length : undefined)
  return { title: clean(data.title), canonical: 'https://hitomi.la/reader/' + id + '.html' }
}
