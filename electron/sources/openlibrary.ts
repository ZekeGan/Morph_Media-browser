import { SourceError } from '../metadata-common'
import { clean, type Adapter } from './site'

export const openlibrary: Adapter = async (site) => {
  const parts = site.match(/^\/(works|books)\/(OL[1-9]\d{0,12}[WM])(?:\/[^/]*)?\/?$/),
    canonical = 'https://openlibrary.org/' + parts[1] + '/' + parts[2]
  const data = await site.json(canonical + '.json')
  if (data.key !== '/' + parts[1] + '/' + parts[2]) throw new SourceError('notFound')
  site.text(
    'DESCRIPTION',
    typeof data.description === 'string' ? data.description : data.description?.value
  )
  site.text('RELEASE_DATE', data.publish_date || data.first_publish_date)
  site.list('ISBN', data.isbn_13 ?? data.isbn_10)
  site.list('TAGS', data.subjects)
  site.list('PUBLISHERS', data.publishers)
  const authors = []
  for (const author of (data.authors ?? []).slice(0, 3)) {
    const key = author.author?.key ?? author.key
    if (typeof key === 'string' && /^\/authors\/OL[1-9]\d{0,12}A$/.test(key))
      try {
        authors.push((await site.json('https://openlibrary.org' + key + '.json')).name)
      } catch {}
  }
  site.list('AUTHORS', authors)
  return {
    title: clean(data.title),
    canonical,
    image:
      Number.isSafeInteger(data.covers?.[0]) && data.covers[0] > 0
        ? 'https://covers.openlibrary.org/b/id/' + data.covers[0] + '-M.jpg?default=false'
        : undefined,
  }
}
