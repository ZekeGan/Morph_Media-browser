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
  // R-284: public APIs without a key.
  {
    id: 'mangadex',
    name: 'MangaDex',
    group: '漫畫／動畫',
    categories: ['manga'],
    hint: 'https://mangadex.org/title/UUID',
  },
  {
    id: 'kitsu',
    name: 'Kitsu',
    group: '漫畫／動畫',
    categories: ['manga', 'video'],
    hint: 'https://kitsu.app/anime/SLUG',
  },
  {
    id: 'mangaupdates',
    name: 'MangaUpdates',
    group: '漫畫／動畫',
    categories: ['manga'],
    hint: 'https://www.mangaupdates.com/series/ID',
  },
  {
    id: 'narou',
    name: '小説家になろう',
    group: '書籍',
    categories: ['manga', 'other'],
    hint: 'https://ncode.syosetu.com/n0000aa/',
  },
  {
    id: 'itunes',
    name: 'Apple Music',
    group: '音樂',
    categories: ['music', 'other'],
    hint: 'https://music.apple.com/jp/album/NAME/ID',
  },
  {
    id: 'deezer',
    name: 'Deezer',
    group: '音樂',
    categories: ['music', 'other'],
    hint: 'https://www.deezer.com/album/ID',
  },
  {
    id: 'danbooru',
    name: 'Danbooru',
    group: '圖片／插畫',
    categories: ['album'],
    hint: 'https://danbooru.donmai.us/posts/ID',
  },
  {
    id: 'googlebooks',
    name: 'Google Books',
    group: '書籍',
    categories: ['manga', 'other'],
    hint: 'https://books.google.com/books?id=ID',
  },
  // R-292: page sources.
  {
    id: 'booth',
    name: 'BOOTH',
    group: '同人／商店',
    categories: ['manga', 'game', 'music', 'album', 'other'],
    hint: 'https://booth.pm/ja/items/ID',
  },
  {
    id: 'kakuyomu',
    name: 'カクヨム',
    group: '書籍',
    categories: ['manga', 'other'],
    hint: 'https://kakuyomu.jp/works/ID',
  },
  // R-285–R-290: sources that need the user's own key (shared/keys.ts).
  {
    id: 'tmdb',
    name: 'TMDB',
    group: '影視',
    categories: ['video'],
    hint: 'https://www.themoviedb.org/movie/ID',
  },
  {
    id: 'steamgriddb',
    name: 'SteamGridDB',
    group: '遊戲',
    categories: ['game'],
    hint: 'https://www.steamgriddb.com/game/ID',
  },
  {
    id: 'fanza',
    name: 'FANZA／DMM',
    group: '同人／商店',
    categories: ['manga', 'video', 'game', 'album'],
    hint: 'https://www.dmm.co.jp/…/cid=ID/',
  },
  // R-283: any other HTTPS page, read only from what it says about itself (JSON-LD, OpenGraph, title).
  {
    id: 'web',
    name: 'Web',
    group: '網頁',
    categories: ['manga', 'video', 'game', 'music', 'album', 'other'],
    hint: 'https://',
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
    'mangadex.org': 'mangadex',
    'kitsu.app': 'kitsu',
    'kitsu.io': 'kitsu',
    'www.mangaupdates.com': 'mangaupdates',
    'mangaupdates.com': 'mangaupdates',
    'ncode.syosetu.com': 'narou',
    'novel18.syosetu.com': 'narou',
    'music.apple.com': 'itunes',
    'www.deezer.com': 'deezer',
    'deezer.com': 'deezer',
    'danbooru.donmai.us': 'danbooru',
    'books.google.com': 'googlebooks',
    'booth.pm': 'booth',
    'kakuyomu.jp': 'kakuyomu',
    'www.themoviedb.org': 'tmdb',
    'themoviedb.org': 'tmdb',
    'www.steamgriddb.com': 'steamgriddb',
    'www.dmm.co.jp': 'fanza',
    'dlsoft.dmm.co.jp': 'fanza',
    'book.dmm.co.jp': 'fanza',
    'video.dmm.co.jp': 'fanza',
    'www.dmm.com': 'fanza',
    'book.dmm.com': 'fanza',
  } as Record<string, MetadataSourceId>
  if (url.hostname === 'www.google.com' && url.pathname.startsWith('/books/')) return 'googlebooks'
  // Shop pages on a BOOTH subdomain (<shop>.booth.pm/items/<id>).
  if (/^[a-z0-9-]{1,63}\.booth\.pm$/.test(url.hostname)) return 'booth'
  return Object.hasOwn(sources, url.hostname) ? sources[url.hostname] : 'web'
}
