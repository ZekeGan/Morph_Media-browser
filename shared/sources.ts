export const metadataSources = [
  {
    id: 'eh',
    name: 'E-Hentai',
    group: '漫畫／動畫',
    categories: ['manga', 'album'],
    hint: 'https://e-hentai.org/g/ID/token/',
  },
  {
    id: 'exh',
    name: 'ExHentai',
    group: '漫畫／動畫',
    categories: ['manga', 'album'],
    hint: 'https://exhentai.org/g/ID/token/',
  },
  {
    id: 'hitomi',
    name: 'Hitomi.la',
    group: '漫畫／動畫',
    categories: ['manga', 'album'],
    hint: 'https://hitomi.la/reader/ID.html',
  },
  {
    id: 'bangumi',
    name: 'Bangumi',
    group: '漫畫／動畫',
    categories: ['manga', 'video', 'game'],
    hint: 'https://bgm.tv/subject/ID',
  },
  {
    id: 'anilist',
    name: 'AniList',
    group: '漫畫／動畫',
    categories: ['manga', 'video'],
    hint: 'https://anilist.co/manga/ID/',
  },
  {
    id: 'dlsite',
    name: 'DLsite',
    group: '同人／商店',
    categories: ['manga', 'video', 'game', 'music', 'album', 'other'],
    hint: 'https://www.dlsite.com/maniax/work/=/product_id/RJ123456.html',
  },
  {
    id: 'steam',
    name: 'Steam',
    group: '遊戲',
    categories: ['game'],
    hint: 'https://store.steampowered.com/app/ID/',
  },
  { id: 'vndb', name: 'VNDB', group: '遊戲', categories: ['game'], hint: 'https://vndb.org/vID' },
  {
    id: 'musicbrainz',
    name: 'MusicBrainz',
    group: '音樂',
    categories: ['music', 'other'],
    hint: 'https://musicbrainz.org/release/UUID',
  },
  {
    id: 'openlibrary',
    name: 'Open Library',
    group: '書籍',
    categories: ['manga', 'other'],
    hint: 'https://openlibrary.org/works/OL123W',
  },
  {
    id: 'pixiv',
    name: 'Pixiv',
    group: '圖片／插畫',
    categories: ['album', 'manga'],
    hint: 'https://www.pixiv.net/artworks/ID',
  },
  {
    id: 'commons',
    name: 'Wikimedia Commons',
    group: '圖片／插畫',
    categories: ['album', 'other'],
    hint: 'https://commons.wikimedia.org/wiki/File:NAME',
  },
] as const
export type MetadataSourceId = (typeof metadataSources)[number]['id']
// E-Hentai and ExHentai are one site with the same galleries: they share stored field ids (eh-…).
export const sourceFamily = (id?: string) => (id === 'exh' ? 'eh' : id)
export function sourceForUrl(source: string): MetadataSourceId | undefined {
  if (/^\d+$/.test(source.trim())) return 'steam'
  let url: URL
  try {
    url = new URL(source)
  } catch {
    return undefined
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return undefined
  const sources = {
    'e-hentai.org': 'eh',
    'exhentai.org': 'exh',
    'hitomi.la': 'hitomi',
    'bgm.tv': 'bangumi',
    'bangumi.tv': 'bangumi',
    'chii.in': 'bangumi',
    'anilist.co': 'anilist',
    'store.steampowered.com': 'steam',
    'vndb.org': 'vndb',
    'musicbrainz.org': 'musicbrainz',
    'openlibrary.org': 'openlibrary',
    'www.pixiv.net': 'pixiv',
    'pixiv.net': 'pixiv',
    'commons.wikimedia.org': 'commons',
    'www.dlsite.com': 'dlsite',
  } as Record<string, MetadataSourceId>
  return Object.hasOwn(sources, url.hostname) ? sources[url.hostname] : undefined
}
