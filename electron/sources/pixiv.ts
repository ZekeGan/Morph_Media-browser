import { SourceError } from '../metadata-common'
import { clean, type Adapter } from './site'

// Pixiv artworks (/artworks/<id>) and, since R-284, novels (/novel/show.php?id=<id>).
export const pixiv: Adapter = async (site) => {
  if (site.input.pathname === '/novel/show.php') {
    const id = site.input.searchParams.get('id') ?? ''
    if (!/^[1-9]\d{0,12}$/.test(id)) throw new Error('請輸入此來源的完整作品網址')
    const response = await site.json('https://www.pixiv.net/ajax/novel/' + id)
    const data = response.body
    if (response.error || !data || String(data.id) !== id) throw new SourceError('restricted')
    site.text('AUTHORS', data.userName)
    site.text('DESCRIPTION', data.description)
    site.text('RELEASE_DATE', data.createDate)
    site.list(
      'TAGS',
      data.tags?.tags?.map((tag: { tag?: unknown }) => tag?.tag)
    )
    site.number('WORD_COUNT', data.characterCount ?? data.textCount)
    site.text('SERIES', data.seriesNavData?.title)
    return {
      title: clean(data.title),
      canonical: 'https://www.pixiv.net/novel/show.php?id=' + id,
      image: data.coverUrl,
    }
  }
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
