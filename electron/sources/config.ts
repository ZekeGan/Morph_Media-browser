import { version } from '../../package.json'
import type { MetadataSourceId } from '../../shared/sources'

export type PublicSourceId = Exclude<MetadataSourceId, 'eh' | 'exh' | 'steam' | 'web'>

// Sent with every website request so sites can tell who is asking.
// The product token cannot contain a colon, so the name is written without it there.
export const userAgent = `Morph/${version} (M:orph; manual desktop metadata preview)`

// Per-site network rules. A request or cover outside these hosts is refused before anything is fetched.
//   requestHosts  hosts the adapter may ask for data (fixed URLs built from the validated work ID)
//   coverHosts    HTTPS hosts a cover image may come from
//   referer       send the work page as Referer (with the data request, and the work's canonical page with the cover)
export const sourceConfig: Record<
  PublicSourceId,
  { requestHosts: string[]; coverHosts: string[]; referer?: boolean; accept?: string }
> = {
  bangumi: { requestHosts: ['api.bgm.tv'], coverHosts: ['lain.bgm.tv'] },
  anilist: { requestHosts: ['graphql.anilist.co'], coverHosts: ['s4.anilist.co'] },
  vndb: { requestHosts: ['api.vndb.org'], coverHosts: [] },
  musicbrainz: { requestHosts: ['musicbrainz.org'], coverHosts: [] },
  openlibrary: { requestHosts: ['openlibrary.org'], coverHosts: ['covers.openlibrary.org'] },
  commons: { requestHosts: ['commons.wikimedia.org'], coverHosts: ['upload.wikimedia.org'] },
  dlsite: { requestHosts: ['www.dlsite.com'], coverHosts: ['img.dlsite.jp'] },
  pixiv: { requestHosts: ['www.pixiv.net'], coverHosts: ['i.pximg.net'], referer: true },
  // ltn.hitomi.la lost its DNS record in 2026-11; the gallery data moved here (R-297). The host may change again.
  hitomi: { requestHosts: ['ltn.gold-usergeneratedcontent.net'], coverHosts: [], referer: true },
  // R-292
  booth: { requestHosts: ['booth.pm'], coverHosts: ['booth.pximg.net'] },
  kakuyomu: { requestHosts: ['kakuyomu.jp'], coverHosts: ['cdn-static.kakuyomu.jp'] },
  // R-284
  mangadex: { requestHosts: ['api.mangadex.org'], coverHosts: ['uploads.mangadex.org'] },
  // Kitsu answers only the JSON:API media type (406 otherwise).
  kitsu: {
    requestHosts: ['kitsu.io'],
    coverHosts: ['media.kitsu.io', 'media.kitsu.app'],
    accept: 'application/vnd.api+json',
  },
  mangaupdates: { requestHosts: ['api.mangaupdates.com'], coverHosts: ['cdn.mangaupdates.com'] },
  narou: { requestHosts: ['api.syosetu.com'], coverHosts: [] },
  itunes: {
    requestHosts: ['itunes.apple.com'],
    coverHosts: [
      'is1-ssl.mzstatic.com',
      'is2-ssl.mzstatic.com',
      'is3-ssl.mzstatic.com',
      'is4-ssl.mzstatic.com',
      'is5-ssl.mzstatic.com',
    ],
  },
  deezer: {
    requestHosts: ['api.deezer.com'],
    coverHosts: ['e-cdns-images.dzcdn.net', 'cdn-images.dzcdn.net', 'cdns-images.dzcdn.net'],
  },
  danbooru: { requestHosts: ['danbooru.donmai.us'], coverHosts: ['cdn.donmai.us'] },
  googlebooks: {
    requestHosts: ['www.googleapis.com'],
    coverHosts: ['books.google.com', 'books.googleusercontent.com'],
  },
}
