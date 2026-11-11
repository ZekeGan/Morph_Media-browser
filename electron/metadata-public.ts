import type { MetadataPreview } from '../shared/explorer'
import type { MetadataSourceId } from '../shared/sources'
import { decode, limitedBytes, SourceError, sourceJson, sourceRequest } from './metadata-common'

const clean = (value: unknown) =>
  decode(value)
    .replace(/<[^>]*>/g, '')
    .slice(0, 10000)
const tags = (value: unknown) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => clean(item).slice(0, 100))
            .filter(Boolean)
        ),
      ].slice(0, 200)
    : []
type Result = {
  preview: Omit<MetadataPreview, 'token'>
  cover?: { bytes: Buffer; mime: string; ext: string }
}

// The requested URLs below are constructed from validated IDs, never from remote
// JSON links. Redirects and oversized responses fail without touching local data.
export async function publicMetadata(
  provider: Exclude<MetadataSourceId, 'eh' | 'exh' | 'steam'>,
  source: string,
  fetcher: typeof fetch
): Promise<Result> {
  const input = new URL(source)
  const request = async (url: string, body?: unknown) => {
    const bytes = await sourceRequest(fetcher, url, {
      method: body ? 'POST' : 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MediaViewer/0.9.0 (manual desktop metadata preview)',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(['pixiv', 'hitomi'].includes(provider) ? { Referer: source } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    })
    return bytes.toString('utf8')
  }
  const json = async (url: string, body?: unknown) => sourceJson(await request(url, body))
  let title = '',
    canonical = source,
    image: string | undefined
  const values: MetadataPreview['values'] = []
  const text = (key: string, value: unknown) => {
    const result = clean(value)
    if (result) values.push({ key, type: 'string', value: result })
  }
  const list = (key: string, value: unknown) => {
    const result = tags(value)
    if (result.length) values.push({ key, type: 'tags', value: result })
  }
  const number = (key: string, value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
      values.push({ key, type: 'number', value })
  }
  const match = (expression: RegExp) => {
    const result = expression.exec(input.pathname)
    if (!result) throw new Error('請輸入此來源的完整作品網址')
    return result
  }
  switch (provider) {
    case 'bangumi': {
      const id = match(/^\/subject\/([1-9]\d{0,11})\/?$/)[1],
        data = await json('https://api.bgm.tv/v0/subjects/' + id)
      if (String(data.id) !== id) throw new SourceError('notFound')
      canonical = 'https://bgm.tv/subject/' + id
      title = clean(data.name_cn || data.name)
      text('TITLE_ORIGINAL', data.name)
      text('DESCRIPTION', data.summary)
      text('RELEASE_DATE', data.date)
      number('EPISODE_COUNT', data.total_episodes)
      list(
        'TAGS',
        data.tags?.map((tag: { name?: unknown }) => tag?.name)
      )
      image = data.images?.medium
      break
    }
    case 'anilist': {
      const parts = match(/^\/(anime|manga)\/([1-9]\d{0,11})(?:\/[^/]*)?\/?$/),
        id = Number(parts[2])
      const data = (
        await json('https://graphql.anilist.co', {
          query:
            'query($id:Int!){Media(id:$id){id title{romaji english native} description genres format episodes chapters startDate{year month day} coverImage{large}}}',
          variables: { id },
        })
      ).data?.Media
      if (!data || data.id !== id) throw new SourceError('notFound')
      canonical = 'https://anilist.co/' + parts[1] + '/' + id + '/'
      title = clean(data.title?.native || data.title?.english || data.title?.romaji)
      text('TITLE_ORIGINAL', data.title?.native)
      text('DESCRIPTION', data.description)
      text('FORMAT', data.format)
      list('GENRES', data.genres)
      number('EPISODE_COUNT', data.episodes)
      number('CHAPTER_COUNT', data.chapters)
      const date = data.startDate
      if (date?.year)
        text(
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
      image = data.coverImage?.large
      break
    }
    case 'vndb': {
      const id = match(/^\/(v[1-9]\d{0,11})\/?$/)[1]
      const data = (
        await json('https://api.vndb.org/kana/vn', {
          filters: ['id', '=', id],
          fields: 'title,alttitle,description,released,languages,platforms,developers.name',
          results: 1,
        })
      ).results?.[0]
      if (!data || data.id !== id) throw new SourceError('notFound')
      canonical = 'https://vndb.org/' + id
      title = clean(data.title)
      text('TITLE_ORIGINAL', data.alttitle)
      text('DESCRIPTION', data.description)
      text('RELEASE_DATE', data.released)
      list('LANGUAGES', data.languages)
      list('PLATFORMS', data.platforms)
      list(
        'DEVELOPERS',
        data.developers?.map((developer: { name?: unknown }) => developer?.name)
      )
      break
    }
    case 'musicbrainz': {
      const id = match(
        /^\/release\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/?$/i
      )[1].toLowerCase()
      const data = await json(
        'https://musicbrainz.org/ws/2/release/' + id + '?inc=artist-credits+recordings&fmt=json'
      )
      if (data.id !== id) throw new SourceError('notFound')
      canonical = 'https://musicbrainz.org/release/' + id
      title = clean(data.title)
      text('RELEASE_DATE', data.date)
      text('COUNTRY', data.country)
      text('BARCODE', data.barcode)
      list(
        'ARTISTS',
        data['artist-credit']?.map((artist: { name?: unknown }) => artist?.name)
      )
      list(
        'TRACKS',
        data.media?.flatMap(
          (medium: { tracks?: { title?: unknown }[] }) =>
            medium.tracks?.map((track) => track.title) ?? []
        )
      )
      break
    }
    case 'openlibrary': {
      const parts = match(/^\/(works|books)\/(OL[1-9]\d{0,12}[WM])(?:\/[^/]*)?\/?$/)
      canonical = 'https://openlibrary.org/' + parts[1] + '/' + parts[2]
      const data = await json(canonical + '.json')
      if (data.key !== '/' + parts[1] + '/' + parts[2]) throw new SourceError('notFound')
      title = clean(data.title)
      text(
        'DESCRIPTION',
        typeof data.description === 'string' ? data.description : data.description?.value
      )
      text('RELEASE_DATE', data.publish_date || data.first_publish_date)
      list('ISBN', data.isbn_13 ?? data.isbn_10)
      list('TAGS', data.subjects)
      list('PUBLISHERS', data.publishers)
      const authors = []
      for (const author of (data.authors ?? []).slice(0, 3)) {
        const key = author.author?.key ?? author.key
        if (typeof key === 'string' && /^\/authors\/OL[1-9]\d{0,12}A$/.test(key))
          try {
            authors.push((await json('https://openlibrary.org' + key + '.json')).name)
          } catch {}
      }
      list('AUTHORS', authors)
      if (Number.isSafeInteger(data.covers?.[0]) && data.covers[0] > 0)
        image = 'https://covers.openlibrary.org/b/id/' + data.covers[0] + '-M.jpg?default=false'
      break
    }
    case 'commons': {
      const pageId = input.searchParams.get('curid'),
        file =
          pageId && /^[1-9]\d{0,11}$/.test(pageId)
            ? undefined
            : decodeURIComponent(match(/^\/wiki\/(File:.+)$/)[1])
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
      const data = (await json('https://commons.wikimedia.org/w/api.php?' + params)).query
        ?.pages?.[0]
      if (
        !Number.isSafeInteger(data?.pageid) ||
        data.pageid < 1 ||
        (file
          ? data.title?.replaceAll('_', ' ') !== file.replaceAll('_', ' ')
          : String(data.pageid) !== pageId)
      )
        throw new SourceError('notFound')
      canonical = 'https://commons.wikimedia.org/?curid=' + data.pageid
      const info = data.imageinfo?.[0],
        meta = info?.extmetadata ?? {}
      title = clean(meta.ObjectName?.value || data.title)
      text('AUTHORS', meta.Artist?.value)
      text('DESCRIPTION', meta.ImageDescription?.value)
      text('LICENSE', meta.LicenseShortName?.value)
      text('RELEASE_DATE', meta.DateTimeOriginal?.value)
      if (typeof meta.Categories?.value === 'string') list('TAGS', meta.Categories.value.split('|'))
      image = info?.thumburl
      break
    }
    case 'dlsite': {
      const found = match(
          /^\/(maniax|home|girls|girls-drama|bl|bl-drama|comic|books|ai|soft|app|appx|pro)\/(?:work|announce)\/=\/product_id\/([A-Z]{2}\d{5,8})(?:\.html)?\/?$/
        ),
        site = found[1],
        id = found[2]
      const data = (
        await json(
          'https://www.dlsite.com/' +
            site +
            '/product/info/ajax?product_id=' +
            id +
            '&cdn_cache_min=1'
        )
      )[id]
      if (!data || typeof data !== 'object') throw new SourceError('notFound')
      canonical = 'https://www.dlsite.com/' + site + '/work/=/product_id/' + id + '.html'
      title = clean(data.work_name)
      text('PRODUCT_ID', id)
      text('MAKER_ID', data.maker_id)
      text('WORK_TYPE', data.work_type)
      text('SERIES', data.title_name)
      if (typeof data.regist_date === 'string') text('RELEASE_DATE', data.regist_date.slice(0, 10))
      text(
        'AGE_CATEGORY',
        ({ 1: '全年齡', 2: 'R-15', 3: '成人' } as Record<number, string>)[data.age_category]
      )
      number('PRICE_JPY', data.price)
      number('DOWNLOAD_COUNT', data.dl_count)
      number('RATING', data.rate_average_2dp)
      if (typeof data.work_image === 'string' && data.work_image.startsWith('//'))
        image = 'https:' + data.work_image
      break
    }
    case 'pixiv': {
      const id = match(/^(?:\/[a-z]{2})?\/artworks\/([1-9]\d{0,12})\/?$/)[1],
        response = await json('https://www.pixiv.net/ajax/illust/' + id)
      const data = response.body
      if (response.error || !data || String(data.id ?? data.illustId) !== id)
        throw new SourceError('restricted')
      canonical = 'https://www.pixiv.net/artworks/' + id
      title = clean(data.title)
      text('AUTHORS', data.userName)
      text('DESCRIPTION', data.description)
      text('RELEASE_DATE', data.createDate)
      list(
        'TAGS',
        data.tags?.tags?.map((tag: { tag?: unknown }) => tag?.tag)
      )
      number('PAGE_COUNT', data.pageCount)
      image = data.urls?.small
      break
    }
    case 'hitomi': {
      const id = match(
        /^\/(?:(?:reader|galleries)\/([1-9]\d{0,11})|[^/]+\/[^/]*-([1-9]\d{0,11}))\.html$/
      )
        .slice(1)
        .find(Boolean)!
      // ltn.hitomi.la lost its DNS record in 2026-11; the gallery data moved here (R-297). The host may change again.
      const script = await request(
        'https://ltn.gold-usergeneratedcontent.net/galleries/' + id + '.js'
      )
      const payload = /^\s*(?:var|let|const)\s+galleryinfo\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(
        script
      )
      if (!payload) throw new SourceError('format')
      const data = sourceJson(payload[1])
      if (String(data.id) !== id) throw new SourceError('notFound')
      canonical = 'https://hitomi.la/reader/' + id + '.html'
      title = clean(data.title)
      text('TITLE_ORIGINAL', data.japanese_title)
      text('LANGUAGE', data.language)
      text('FORMAT', data.type)
      text('RELEASE_DATE', data.date)
      list(
        'AUTHORS',
        data.artists?.map((artist: { artist?: unknown }) => artist?.artist)
      )
      list(
        'TAGS',
        data.tags?.map((tag: { tag?: unknown }) => tag?.tag)
      )
      number('PAGE_COUNT', Array.isArray(data.files) ? data.files.length : undefined)
      break
    }
  }
  if (!title.trim()) throw new SourceError('format')
  values.unshift(
    { key: 'TITLE', type: 'string', value: title },
    { key: 'SOURCE_URL', type: 'string', value: canonical }
  )
  const result: Result = {
    preview: { provider, title: title.slice(0, 200), source: canonical, values },
  }
  if (typeof image === 'string')
    try {
      const url = new URL(image),
        hosts = [
          'lain.bgm.tv',
          's4.anilist.co',
          'covers.openlibrary.org',
          'upload.wikimedia.org',
          'i.pximg.net',
          'img.dlsite.jp',
        ]
      if (
        url.protocol !== 'https:' ||
        url.port ||
        url.username ||
        url.password ||
        !hosts.includes(url.hostname)
      )
        throw new Error('封面來源未允許')
      const bytes = await limitedBytes(
        await fetcher(url, {
          signal: AbortSignal.timeout(15000),
          redirect: 'error',
          ...(provider === 'pixiv' ? { headers: { Referer: canonical } } : {}),
        }),
        10 * 1024 * 1024
      )
      const [ext, mime] =
        bytes[0] === 255 && bytes[1] === 216
          ? ['jpg', 'image/jpeg']
          : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? ['png', 'image/png']
            : bytes.subarray(0, 4).toString() === 'RIFF' &&
                bytes.subarray(8, 12).toString() === 'WEBP'
              ? ['webp', 'image/webp']
              : []
      if (!ext || !mime) throw new Error('封面格式未支援')
      result.cover = { bytes, ext, mime }
      result.preview.image = 'data:' + mime + ';base64,' + bytes.toString('base64')
    } catch {
      values.push({ key: 'COVER_STATUS', type: 'string', value: '封面無法取得；可略過或手動匯入' })
    }
  return result
}
