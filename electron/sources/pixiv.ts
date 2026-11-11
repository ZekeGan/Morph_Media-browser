import { SourceError } from '../metadata-common'
import { clean, type Adapter } from './site'

export const pixiv: Adapter = async (site) => {
  const id = site.match(/^(?:\/[a-z]{2})?\/artworks\/([1-9]\d{0,12})\/?$/)[1],
    response = await site.json('https://www.pixiv.net/ajax/illust/' + id)
  const data = response.body
  if (response.error || !data || String(data.id ?? data.illustId) !== id)
    throw new SourceError('restricted')
  site.text('AUTHORS', data.userName)
  site.text('DESCRIPTION', data.description)
  site.text('RELEASE_DATE', data.createDate)
  site.list(
    'TAGS',
    data.tags?.tags?.map((tag: { tag?: unknown }) => tag?.tag)
  )
  site.number('PAGE_COUNT', data.pageCount)
  return {
    title: clean(data.title),
    canonical: 'https://www.pixiv.net/artworks/' + id,
    image: data.urls?.small,
  }
}
