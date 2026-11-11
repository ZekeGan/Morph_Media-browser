import { SourceError } from '../metadata-common'
import { clean, type Adapter } from './site'

export const commons: Adapter = async (site) => {
  const pageId = site.input.searchParams.get('curid'),
    file =
      pageId && /^[1-9]\d{0,11}$/.test(pageId)
        ? undefined
        : decodeURIComponent(site.match(/^\/wiki\/(File:.+)$/)[1])
  if (file && file.length > 1000) throw new Error('來源檔名過長')
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'imageinfo',
    ...(file ? { titles: file } : { pageids: pageId! }),
    iiprop: 'url|extmetadata',
    iiurlwidth: '400',
  })
  const data = (await site.json('https://commons.wikimedia.org/w/api.php?' + params)).query
    ?.pages?.[0]
  if (
    !Number.isSafeInteger(data?.pageid) ||
    data.pageid < 1 ||
    (file
      ? data.title?.replaceAll('_', ' ') !== file.replaceAll('_', ' ')
      : String(data.pageid) !== pageId)
  )
    throw new SourceError('notFound')
  const info = data.imageinfo?.[0],
    meta = info?.extmetadata ?? {}
  site.text('AUTHORS', meta.Artist?.value)
  site.text('DESCRIPTION', meta.ImageDescription?.value)
  site.text('LICENSE', meta.LicenseShortName?.value)
  site.text('RELEASE_DATE', meta.DateTimeOriginal?.value)
  if (typeof meta.Categories?.value === 'string')
    site.list('TAGS', meta.Categories.value.split('|'))
  return {
    title: clean(meta.ObjectName?.value || data.title),
    canonical: 'https://commons.wikimedia.org/?curid=' + data.pageid,
    image: info?.thumburl,
  }
}
