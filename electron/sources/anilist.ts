import { SourceError } from '../metadata-common'
import { clean, type Adapter } from './site'

export const anilist: Adapter = async (site) => {
  const parts = site.match(/^\/(anime|manga)\/([1-9]\d{0,11})(?:\/[^/]*)?\/?$/),
    id = Number(parts[2])
  const data = (
    await site.json('https://graphql.anilist.co', {
      query:
        'query($id:Int!){Media(id:$id){id title{romaji english native} description genres format episodes chapters startDate{year month day} coverImage{large}}}',
      variables: { id },
    })
  ).data?.Media
  if (!data || data.id !== id) throw new SourceError('notFound')
  site.text('TITLE_ORIGINAL', data.title?.native)
  site.text('DESCRIPTION', data.description)
  site.text('FORMAT', data.format)
  site.list('GENRES', data.genres)
  site.number('EPISODE_COUNT', data.episodes)
  site.number('CHAPTER_COUNT', data.chapters)
  const date = data.startDate
  if (date?.year)
    site.text(
      'RELEASE_DATE',
      [
        date.year,
        ...(date.month
          ? [
              String(date.month).padStart(2, '0'),
              ...(date.day ? [String(date.day).padStart(2, '0')] : []),
            ]
          : []),
      ].join('-')
    )
  return {
    title: clean(data.title?.native || data.title?.english || data.title?.romaji),
    canonical: 'https://anilist.co/' + parts[1] + '/' + id + '/',
    image: data.coverImage?.large,
  }
}
