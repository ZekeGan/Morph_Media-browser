import { SourceError } from '../metadata-common'
import { clean, type Adapter } from './site'

// R-367: nhentai's own API (v2, checked 2026-11-13: a single gallery is public without a key, 20 requests a minute
// without one; the old /api/gallery answers 403 and the pages sit behind a bot check). Fields are named the way
// E-Hentai's are, so both fit the same layouts: tags by kind (parody, character, artist, group, language, category)
// besides the full list.
export const nhentai: Adapter = async (site) => {
  const id = site.match(/^\/g\/([1-9]\d{0,9})\/?$/)[1]
  const data = await site.json('https://nhentai.net/api/v2/galleries/' + id)
  if (!data || String(data.id) !== id || !data.title || typeof data.title !== 'object')
    throw new SourceError('notFound')
  const tags: { type?: unknown; name?: unknown }[] = Array.isArray(data.tags) ? data.tags : []
  const ofType = (type: string) => tags.filter((tag) => tag?.type === type).map((tag) => tag.name)
  site.text('TITLE_ORIGINAL', data.title.japanese)
  site.text('TITLE_PRETTY', data.title.pretty)
  site.list(
    'TAGS',
    tags.map((tag) =>
      typeof tag?.name !== 'string'
        ? undefined
        : tag.type === 'tag'
          ? tag.name
          : `${tag.type}:${tag.name}`
    )
  )
  site.list('PARODY', ofType('parody'))
  site.list('CHARACTER', ofType('character'))
  site.list('ARTIST', ofType('artist'))
  site.list('GROUP', ofType('group'))
  site.list('LANGUAGE', ofType('language'))
  site.text('GALLERY_CATEGORY', ofType('category')[0])
  site.text('SCANLATOR', data.scanlator)
  site.number('PAGE_COUNT', data.num_pages)
  site.number('FAVORITE_COUNT', data.num_favorites)
  // The upload time is a Unix time; stored like E-Hentai's posting time (a date with its time).
  const posted =
    typeof data.upload_date === 'number' ? new Date(data.upload_date * 1000) : undefined
  if (posted && !Number.isNaN(posted.getTime()))
    site.text('GALLERY_POSTED_UTC', posted.toISOString())
  const cover = typeof data.cover?.path === 'string' ? data.cover.path : ''
  return {
    title: clean(data.title.english || data.title.japanese || data.title.pretty),
    canonical: 'https://nhentai.net/g/' + id + '/',
    // The cover path is checked before it becomes an address on the thumbnail host.
    image: /^galleries\/\d{1,12}\/cover\.(?:jpg|png|webp|gif)(?:\.webp)?$/.test(cover)
      ? 'https://t1.nhentai.net/' + cover
      : undefined,
  }
}
