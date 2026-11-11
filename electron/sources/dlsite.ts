import { SourceError } from '../metadata-common'
import { clean, type Adapter } from './site'

// Two public endpoints: product.json has the names (circle, creators by role, genres, series); the older
// info/ajax endpoint adds price, download count and rating and is optional.
export const dlsite: Adapter = async (site) => {
  const found = site.match(
      /^\/(maniax|home|girls|girls-drama|bl|bl-drama|comic|books|ai|soft|app|appx|pro)\/(?:work|announce)\/=\/product_id\/([A-Z]{2}\d{5,8})(?:\.html)?\/?$/
    ),
    shop = found[1],
    id = found[2]
  const list = await site.json(
    'https://www.dlsite.com/' + shop + '/api/=/product.json?workno=' + id
  )
  const data = Array.isArray(list) ? list.find((item) => item?.workno === id) : undefined
  if (!data || typeof data !== 'object') throw new SourceError('notFound')
  let sales: Record<string, unknown> | undefined
  try {
    sales = (
      await site.json(
        'https://www.dlsite.com/' +
          shop +
          '/product/info/ajax?product_id=' +
          id +
          '&cdn_cache_min=1'
      )
    )[id]
  } catch {}
  site.text('PRODUCT_ID', id)
  site.text('MAKER_NAME', data.maker_name)
  site.text('MAKER_ID', data.maker_id ?? sales?.maker_id)
  site.text('WORK_TYPE', data.work_type ?? sales?.work_type)
  site.text('WORK_TYPE_NAME', data.work_type_string)
  site.text('SERIES', data.series_name || sales?.title_name)
  // Creators are grouped by role (created_by, voice_by, scenario_by…); each role becomes its own tag field.
  if (data.creaters && typeof data.creaters === 'object' && !Array.isArray(data.creaters))
    for (const [role, people] of Object.entries(data.creaters).slice(0, 20))
      if (/^[a-z]{1,20}_by$/.test(role) && Array.isArray(people))
        site.list(
          role.toUpperCase(),
          people.map((person: { name?: unknown }) => person?.name)
        )
  site.list(
    'GENRES',
    Array.isArray(data.genres) ? data.genres.map((genre: { name?: unknown }) => genre?.name) : []
  )
  const date = data.regist_date ?? sales?.regist_date
  if (typeof date === 'string') site.text('RELEASE_DATE', date.slice(0, 10))
  site.text(
    'AGE_CATEGORY',
    ({ 1: '全年齡', 2: 'R-15', 3: '成人' } as Record<number, string>)[
      Number(data.age_category ?? sales?.age_category)
    ]
  )
  site.number('PRICE_JPY', sales?.price)
  site.number('DOWNLOAD_COUNT', sales?.dl_count)
  site.number('RATING', sales?.rate_average_2dp)
  const image = [data.image_main?.url, sales?.work_image].find(
    (url): url is string => typeof url === 'string' && url.startsWith('//')
  )
  return {
    title: clean(data.work_name ?? sales?.work_name),
    canonical: 'https://www.dlsite.com/' + shop + '/work/=/product_id/' + id + '.html',
    image: image ? 'https:' + image : undefined,
  }
}
