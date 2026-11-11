import { SourceError } from '../metadata-common'
import { clean, type Adapter } from './site'

export const vndb: Adapter = async (site) => {
  const id = site.match(/^\/(v[1-9]\d{0,11})\/?$/)[1]
  const data = (
    await site.json('https://api.vndb.org/kana/vn', {
      filters: ['id', '=', id],
      fields: 'title,alttitle,description,released,languages,platforms,developers.name',
      results: 1,
    })
  ).results?.[0]
  if (!data || data.id !== id) throw new SourceError('notFound')
  site.text('TITLE_ORIGINAL', data.alttitle)
  site.text('DESCRIPTION', data.description)
  site.text('RELEASE_DATE', data.released)
  site.list('LANGUAGES', data.languages)
  site.list('PLATFORMS', data.platforms)
  site.list(
    'DEVELOPERS',
    data.developers?.map((developer: { name?: unknown }) => developer?.name)
  )
  return { title: clean(data.title), canonical: 'https://vndb.org/' + id }
}
