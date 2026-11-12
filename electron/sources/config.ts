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
  {
    requestHosts: string[]
    coverHosts: string[]
    referer?: boolean
    accept?: string
    // R-285: the key site (shared/keys.ts) and whether the source works without it.
    keySite?: string
    keyNeed?: 'required' | 'optional'
    // The one plain-HTTP origin a source may use (AniDB's API has no HTTPS).
    plainOrigin?: string
  }
> = {
  // Bangumi's optional token opens NSFW entries (R-286).
  bangumi: {
    requestHosts: ['api.bgm.tv'],
    coverHosts: ['lain.bgm.tv'],
    keySite: 'bangumi',
    keyNeed: 'optional',
  },
  anilist: { requestHosts: ['graphql.anilist.co'], coverHosts: ['s4.anilist.co'] },
  vndb: { requestHosts: ['api.vndb.org'], coverHosts: [] },
  musicbrainz: { requestHosts: ['musicbrainz.org'], coverHosts: [] },
  openlibrary: { requestHosts: ['openlibrary.org'], coverHosts: ['covers.openlibrary.org'] },
  commons: { requestHosts: ['commons.wikimedia.org'], coverHosts: ['upload.wikimedia.org'] },
  dlsite: { requestHosts: ['www.dlsite.com'], coverHosts: ['img.dlsite.jp'] },
  pixiv: { requestHosts: ['www.pixiv.net'], coverHosts: ['i.pximg.net'], referer: true },
  // ltn.hitomi.la lost its DNS record in 2026-11; the gallery data moved here (R-297). The host may change again.
  hitomi: { requestHosts: ['ltn.gold-usergeneratedcontent.net'], coverHosts: [], referer: true },
  // R-285–R-290: keyed sources.
  tmdb: {
    requestHosts: ['api.themoviedb.org'],
    coverHosts: ['image.tmdb.org'],
    keySite: 'tmdb',
    keyNeed: 'required',
  },
  mal: {
    requestHosts: ['api.myanimelist.net'],
    coverHosts: ['cdn.myanimelist.net', 'api-cdn.myanimelist.net'],
    keySite: 'mal',
    keyNeed: 'required',
  },
  omdb: {
    requestHosts: ['www.omdbapi.com'],
    coverHosts: ['m.media-amazon.com'],
    keySite: 'omdb',
    keyNeed: 'required',
  },
  trakt: { requestHosts: ['api.trakt.tv'], coverHosts: [], keySite: 'trakt', keyNeed: 'required' },
  rawg: {
    requestHosts: ['api.rawg.io'],
    coverHosts: ['media.rawg.io'],
    keySite: 'rawg',
    keyNeed: 'required',
  },
  giantbomb: {
    requestHosts: ['www.giantbomb.com'],
    coverHosts: ['www.giantbomb.com'],
    keySite: 'giantbomb',
    keyNeed: 'required',
  },
  comicvine: {
    requestHosts: ['comicvine.gamespot.com'],
    coverHosts: ['comicvine.gamespot.com'],
    keySite: 'comicvine',
    keyNeed: 'required',
  },
  steamgriddb: {
    requestHosts: ['www.steamgriddb.com'],
    coverHosts: ['cdn2.steamgriddb.com'],
    keySite: 'steamgriddb',
    keyNeed: 'required',
  },
  lastfm: {
    requestHosts: ['ws.audioscrobbler.com'],
    coverHosts: ['lastfm.freetls.fastly.net'],
    keySite: 'lastfm',
    keyNeed: 'required',
  },
  discogs: {
    requestHosts: ['api.discogs.com'],
    coverHosts: ['i.discogs.com'],
    keySite: 'discogs',
    keyNeed: 'optional',
  },
  igdb: {
    requestHosts: ['id.twitch.tv', 'api.igdb.com'],
    coverHosts: ['images.igdb.com'],
    keySite: 'igdb',
    keyNeed: 'required',
  },
  tvdb: {
    requestHosts: ['api4.thetvdb.com'],
    coverHosts: ['artworks.thetvdb.com'],
    keySite: 'tvdb',
    keyNeed: 'required',
  },
  fanza: {
    requestHosts: ['api.dmm.com'],
    coverHosts: ['pics.dmm.co.jp', 'pics.dmm.com', 'doujin-assets.dmm.co.jp'],
    keySite: 'fanza',
    keyNeed: 'required',
  },
  anidb: {
    requestHosts: ['api.anidb.net'],
    coverHosts: ['cdn-eu.anidb.net', 'cdn-us.anidb.net'],
    keySite: 'anidb',
    keyNeed: 'required',
    plainOrigin: 'http://api.anidb.net:9001',
    accept: 'application/xml',
  },
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
  danbooru: {
    requestHosts: ['danbooru.donmai.us'],
    coverHosts: ['cdn.donmai.us'],
    keySite: 'danbooru',
    keyNeed: 'optional',
  },
  googlebooks: {
    requestHosts: ['www.googleapis.com'],
    coverHosts: ['books.google.com', 'books.googleusercontent.com'],
    keySite: 'googlebooks',
    keyNeed: 'optional',
  },
}
