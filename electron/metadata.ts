import type { MetadataPreview } from '../shared/explorer'
import { limitedBytes, decode } from './metadata-common'
export { limitedBytes } from './metadata-common'
import { sourceForUrl, type MetadataSourceId } from '../shared/sources'
import { publicMetadata } from './metadata-public'
// E-Hentai tags are "namespace:name". Besides the full list, each namespace becomes its own field so that
// artist, parody, language, characters… can be shown and filtered on their own.
const tagNamespaces = [
  'language',
  'parody',
  'character',
  'artist',
  'group',
  'cosplayer',
  'female',
  'male',
  'mixed',
  'other',
  'reclass',
] as const
function galleryTagGroups(tags: unknown): MetadataPreview['values'] {
  if (!Array.isArray(tags)) return []
  const groups = new Map<string, string[]>()
  for (const tag of tags) {
    if (typeof tag !== 'string') continue
    const split = tag.indexOf(':')
    const space = tag.slice(0, split),
      name = tag.slice(split + 1).trim()
    if (
      split <= 0 ||
      !name ||
      name.length > 100 ||
      !(tagNamespaces as readonly string[]).includes(space)
    )
      continue
    groups.set(space, [...(groups.get(space) ?? []), name])
  }
  return tagNamespaces
    .filter((space) => groups.has(space))
    .map((space) => ({
      key: space.toUpperCase(),
      type: 'tags' as const,
      value: [...new Set(groups.get(space))].slice(0, 200),
    }))
}
export async function ehMetadata(
  source: string,
  fetcher: typeof fetch = fetch
): Promise<{
  preview: Omit<MetadataPreview, 'token'>
  cover?: { bytes: Buffer; mime: string; ext: string }
}> {
  if (typeof source !== 'string' || source.length > 2048) throw new Error('圖庫網址不合法')
  let url: URL
  try {
    url = new URL(source)
  } catch {
    throw new Error('請貼上完整的 E-Hentai／ExHentai 圖庫網址')
  }
  const match = /^\/g\/(\d{1,12})\/([0-9a-f]{10})\/?$/i.exec(url.pathname)
  if (
    url.protocol !== 'https:' ||
    !['e-hentai.org', 'exhentai.org'].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    !match
  )
    throw new Error(
      '只接受 E-Hentai／ExHentai 的完整公開圖庫網址（/g/ID/token/）；其他頁面連結未支援'
    )
  const response = await fetcher('https://api.e-hentai.org/api.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'gdata',
      gidlist: [[Number(match[1]), match[2]]],
      namespace: 1,
    }),
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  })
  const data = JSON.parse((await limitedBytes(response, 2 * 1024 * 1024)).toString()).gmetadata?.[0]
  if (
    !data ||
    data.error ||
    Number(data.gid) !== Number(match[1]) ||
    String(data.token).toLowerCase() !== match[2].toLowerCase()
  )
    throw new Error(`無法取得公開圖庫資料：${String(data?.error ?? '身分不符／來源可能需登入')}`)
  const title = decode(data.title).slice(0, 10000)
  if (!title) throw new Error('來源缺少標題')
  const values: MetadataPreview['values'] = [
    { key: 'TITLE', type: 'string', value: title },
    { key: 'TITLE_ORIGINAL', type: 'string', value: decode(data.title_jpn).slice(0, 10000) },
    {
      key: 'TAGS',
      type: 'tags',
      value: Array.isArray(data.tags)
        ? data.tags
            .filter((v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 100)
            .slice(0, 200)
        : [],
    },
    ...galleryTagGroups(data.tags),
    { key: 'GALLERY_CATEGORY', type: 'string', value: decode(data.category).slice(0, 100) },
    { key: 'UPLOADER', type: 'string', value: decode(data.uploader).slice(0, 100) },
    {
      key: 'GALLERY_URL',
      type: 'string',
      value: `https://${url.hostname}/g/${match[1]}/${match[2]}/`,
    },
  ]
  if (Number.isFinite(Number(data.posted)) && Number(data.posted) > 0)
    values.push({
      key: 'GALLERY_POSTED_UTC',
      type: 'string',
      value: new Date(Number(data.posted) * 1000).toISOString(),
    })
  if (Number.isSafeInteger(Number(data.filecount)) && Number(data.filecount) >= 0)
    values.push({ key: 'PAGE_COUNT', type: 'number', value: Number(data.filecount) })
  let cover: { bytes: Buffer; mime: string; ext: string } | undefined
  const preview: Omit<MetadataPreview, 'token'> = {
    title: title.slice(0, 200),
    provider: 'eh',
    source: `https://${url.hostname}/g/${match[1]}/${match[2]}/`,
    values,
  }
  if (typeof data.thumb === 'string') {
    try {
      const image = new URL(data.thumb)
      if (
        image.protocol !== 'https:' ||
        image.hostname !== 'ehgt.org' ||
        image.port ||
        image.username ||
        image.password
      )
        throw new Error('封面來源未允許')
      const bytes = await limitedBytes(
        await fetcher(image, { signal: AbortSignal.timeout(15000), redirect: 'error' }),
        10 * 1024 * 1024
      )
      const [ext, mime] =
        bytes[0] === 255 && bytes[1] === 216
          ? ['jpg', 'image/jpeg']
          : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? ['png', 'image/png']
            : []
      if (!ext || !mime) throw new Error('封面格式未支援')
      cover = { bytes, ext, mime }
      preview.image = `data:${mime};base64,${bytes.toString('base64')}`
    } catch {
      preview.values.push({
        key: 'COVER_STATUS',
        type: 'string',
        value: '封面縮圖無法取得；可略過或手動匯入',
      })
    }
  }
  return { preview, cover }
}

export async function steamMetadata(
  source: string,
  fetcher: typeof fetch = fetch
): Promise<{
  preview: Omit<MetadataPreview, 'token'>
  cover?: { bytes: Buffer; mime: string; ext: string }
}> {
  if (typeof source !== 'string' || source.length > 2048)
    throw new Error('Steam 網址或 App ID 不合法')
  let appId = source.trim()
  if (!/^[1-9]\d{0,9}$/.test(appId)) {
    let url: URL
    try {
      url = new URL(appId)
    } catch {
      throw new Error('請輸入 Steam 商店網址或 App ID')
    }
    const match = /^\/app\/([1-9]\d{0,9})(?:\/[^/]*)?\/?$/.exec(url.pathname)
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'store.steampowered.com' ||
      url.port ||
      url.username ||
      url.password ||
      !match
    )
      throw new Error('只接受 Steam 官方 /app/ 商店網址或 App ID')
    appId = match[1]
  }
  if (Number(appId) > 4294967295) throw new Error('Steam App ID 超出範圍')
  const response = await fetcher(
    'https://store.steampowered.com/api/appdetails?appids=' + appId + '&l=english',
    { signal: AbortSignal.timeout(15000), redirect: 'error' }
  )
  const item = JSON.parse((await limitedBytes(response, 2 * 1024 * 1024)).toString())[appId],
    data = item?.data
  if (
    item?.success !== true ||
    !data ||
    String(data.steam_appid) !== appId ||
    typeof data.name !== 'string' ||
    !data.name.trim()
  )
    throw new Error('無法取得 Steam 商店資料：遊戲可能尚未公開、已下架或此地區無法查看')
  const clean = (value: unknown) =>
    decode(value)
      .replace(/<[^>]*>/g, '')
      .slice(0, 10000)
  const tags = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((v) => typeof v === 'string' && v.length > 0 && v.length <= 100).slice(0, 200)
      : []
  const values: MetadataPreview['values'] = [
    { key: 'TITLE', type: 'string', value: clean(data.name) },
    { key: 'APP_ID', type: 'number', value: Number(appId) },
    {
      key: 'STORE_URL',
      type: 'string',
      value: 'https://store.steampowered.com/app/' + appId + '/',
    },
    { key: 'PRODUCT_TYPE', type: 'string', value: clean(data.type) },
    { key: 'DESCRIPTION', type: 'string', value: clean(data.short_description) },
    { key: 'DEVELOPERS', type: 'tags', value: tags(data.developers) },
    { key: 'PUBLISHERS', type: 'tags', value: tags(data.publishers) },
    {
      key: 'GENRES',
      type: 'tags',
      value: tags(
        Array.isArray(data.genres)
          ? data.genres.map((g: { description?: unknown }) => g?.description)
          : []
      ),
    },
  ]
  if (typeof data.release_date?.date === 'string' && data.release_date.date)
    values.push({ key: 'STORE_RELEASE_DATE', type: 'string', value: clean(data.release_date.date) })
  if (data.release_date?.coming_soon === true)
    values.push({ key: 'RELEASE_STATUS', type: 'string', value: '尚未發售' })
  const preview: Omit<MetadataPreview, 'token'> = {
    provider: 'steam',
    title: clean(data.name).slice(0, 200),
    source: 'https://store.steampowered.com/app/' + appId + '/',
    values,
  }
  let cover: { bytes: Buffer; mime: string; ext: string } | undefined
  if (typeof data.header_image === 'string') {
    try {
      const image = new URL(data.header_image)
      const allowed = [
        'shared.fastly.steamstatic.com',
        'shared.akamai.steamstatic.com',
        'cdn.akamai.steamstatic.com',
        'cdn.cloudflare.steamstatic.com',
        'cdn.fastly.steamstatic.com',
      ]
      if (
        image.protocol !== 'https:' ||
        !allowed.includes(image.hostname) ||
        image.port ||
        image.username ||
        image.password ||
        (!image.pathname.startsWith('/store_item_assets/steam/apps/' + appId + '/') &&
          !image.pathname.startsWith('/steam/apps/' + appId + '/'))
      )
        throw new Error('Steam 封面來源未允許')
      const bytes = await limitedBytes(
        await fetcher(image, { signal: AbortSignal.timeout(15000), redirect: 'error' }),
        10 * 1024 * 1024
      )
      const [ext, mime] =
        bytes[0] === 255 && bytes[1] === 216
          ? ['jpg', 'image/jpeg']
          : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? ['png', 'image/png']
            : []
      if (!ext || !mime) throw new Error('封面格式未支援')
      cover = { bytes, ext, mime }
      preview.image = 'data:' + mime + ';base64,' + bytes.toString('base64')
    } catch {
      preview.values.push({
        key: 'COVER_STATUS',
        type: 'string',
        value: '封面無法取得；可略過或手動匯入',
      })
    }
  }
  return { preview, cover }
}
export async function metadata(
  source: string,
  fetcher: typeof fetch = fetch,
  expected?: MetadataSourceId
) {
  if (typeof source !== 'string' || source.length > 2048) throw new Error('來源網址不合法')
  source = source.trim()
  const provider = sourceForUrl(source)
  if (!provider || (expected && provider !== expected))
    throw new Error('來源網址與選定來源不符或未支援')
  if (provider === 'steam') return steamMetadata(source, fetcher)
  if (provider === 'eh' || provider === 'exh') return ehMetadata(source, fetcher)
  return publicMetadata(provider, source, fetcher)
}
