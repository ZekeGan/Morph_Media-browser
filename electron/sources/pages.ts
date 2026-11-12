import { SourceError, sourceJson } from '../metadata-common'
import { clean, type Adapter } from './site'
import { attribute, blocks } from './web'

// R-292: sites without an API, read from what their pages already carry (no script runs). Checked 2026-11-12:
// BOOTH serves each item as JSON next to its page; カクヨム embeds the work in the page's Next.js data.
// AO3 and VGMdb answer automated requests with a block page (418 / Cloudflare challenge), so they are not used.

// BOOTH: /<lang>/items/<id>, or <shop>.booth.pm/items/<id>.
export const booth: Adapter = async (site) => {
  const id = site.match(/^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/items\/(\d{1,12})\/?$/i)[1]
  const data = await site.json('https://booth.pm/ja/items/' + id + '.json')
  if (String(data.id) !== id) throw new SourceError('notFound')
  site.list('GROUP', [data.shop?.name])
  site.text('DESCRIPTION', data.description)
  site.list('GENRES', [data.category?.parent?.name, data.category?.name])
  site.list(
    'TAGS',
    (data.tags ?? []).map((t: { name?: string }) => t?.name)
  )
  site.text('PRICE', data.price)
  site.text(
    'RELEASE_DATE',
    typeof data.published_at === 'string' ? data.published_at.slice(0, 10) : ''
  )
  site.text(
    'AGE_CATEGORY',
    data.is_adult === true ? '成人' : data.is_adult === false ? '全年齡' : undefined
  )
  return {
    title: clean(data.name),
    canonical: 'https://booth.pm/ja/items/' + id,
    image: data.images?.[0]?.original,
  }
}

// カクヨム: /works/<id>; the work is in the page's __NEXT_DATA__ (Apollo cache), read as JSON.
export const kakuyomu: Adapter = async (site) => {
  const id = site.match(/^\/works\/(\d{10,22})\/?$/)[1]
  const html = await site.request('https://kakuyomu.jp/works/' + id)
  const script = blocks(html, 'script', 8 * 1024 * 1024).find(
    (block) => attribute(block.tag, 'id') === '__NEXT_DATA__'
  )
  if (!script) throw new SourceError('format')
  const state = sourceJson(script.inner)?.props?.pageProps?.__APOLLO_STATE__
  const work = state?.['Work:' + id]
  if (!work || typeof work.title !== 'string') throw new SourceError('notFound')
  const author = typeof work.author?.__ref === 'string' ? state[work.author.__ref] : undefined
  site.list('AUTHORS', [work.alternateAuthorName ?? author?.activityName])
  site.text('CATCHPHRASE', work.catchphrase)
  site.text('DESCRIPTION', work.introduction)
  site.text('GENRES', work.genre)
  site.list('TAGS', work.tagLabels)
  site.text(
    'STATUS',
    work.serialStatus === 'COMPLETED'
      ? '完結'
      : work.serialStatus === 'RUNNING'
        ? '連載中'
        : undefined
  )
  site.number('CHAPTER_COUNT', work.publicEpisodeCount)
  site.number('WORD_COUNT', work.totalCharacterCount)
  site.text(
    'RELEASE_DATE',
    typeof work.publishedAt === 'string' ? work.publishedAt.slice(0, 10) : ''
  )
  return {
    title: clean(work.title),
    canonical: 'https://kakuyomu.jp/works/' + id,
    image: typeof work.ogImageUrl === 'string' ? work.ogImageUrl : undefined,
  }
}
