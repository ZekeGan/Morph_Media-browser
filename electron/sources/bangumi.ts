import { SourceError } from '../metadata-common'
import { clean, type Adapter } from './site'

export const bangumi: Adapter = async (site) => {
  const id = site.match(/^\/subject\/([1-9]\d{0,11})\/?$/)[1],
    data = await site.json('https://api.bgm.tv/v0/subjects/' + id)
  if (String(data.id) !== id) throw new SourceError('notFound')
  site.text('TITLE_ORIGINAL', data.name)
  site.text('DESCRIPTION', data.summary)
  site.text('RELEASE_DATE', data.date)
  site.number('EPISODE_COUNT', data.total_episodes)
  site.list(
    'TAGS',
    data.tags?.map((tag: { name?: unknown }) => tag?.name)
  )
  return {
    title: clean(data.name_cn || data.name),
    canonical: 'https://bgm.tv/subject/' + id,
    image: data.images?.medium,
  }
}
