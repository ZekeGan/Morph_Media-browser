import { SourceError } from '../metadata-common'
import { clean, type Adapter } from './site'

export const dlsite: Adapter = async (site) => {
  const found = site.match(
      /^\/(maniax|home|girls|girls-drama|bl|bl-drama|comic|books|ai|soft|app|appx|pro)\/(?:work|announce)\/=\/product_id\/([A-Z]{2}\d{5,8})(?:\.html)?\/?$/
    ),
    shop = found[1],
    id = found[2]
  const data = (
    await site.json(
      'https://www.dlsite.com/' + shop + '/product/info/ajax?product_id=' + id + '&cdn_cache_min=1'
    )
  )[id]
  if (!data || typeof data !== 'object') throw new SourceError('notFound')
  site.text('PRODUCT_ID', id)
  site.text('MAKER_ID', data.maker_id)
  site.text('WORK_TYPE', data.work_type)
  site.text('SERIES', data.title_name)
  if (typeof data.regist_date === 'string') site.text('RELEASE_DATE', data.regist_date.slice(0, 10))
  site.text(
    'AGE_CATEGORY',
    ({ 1: '全年齡', 2: 'R-15', 3: '成人' } as Record<number, string>)[data.age_category]
  )
  site.number('PRICE_JPY', data.price)
  site.number('DOWNLOAD_COUNT', data.dl_count)
  site.number('RATING', data.rate_average_2dp)
  return {
    title: clean(data.work_name),
    canonical: 'https://www.dlsite.com/' + shop + '/work/=/product_id/' + id + '.html',
    image:
      typeof data.work_image === 'string' && data.work_image.startsWith('//')
        ? 'https:' + data.work_image
        : undefined,
  }
}
