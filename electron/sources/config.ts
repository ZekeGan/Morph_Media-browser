import { version } from '../../package.json'
import type { MetadataSourceId } from '../../shared/sources'

export type PublicSourceId = Exclude<MetadataSourceId, 'eh' | 'exh' | 'steam'>

// Sent with every website request so sites can tell who is asking.
export const userAgent = `M:orph/${version} (manual desktop metadata preview)`

// Per-site network rules. A request or cover outside these hosts is refused before anything is fetched.
//   requestHosts  hosts the adapter may ask for data (fixed URLs built from the validated work ID)
//   coverHosts    HTTPS hosts a cover image may come from
//   referer       send the work page as Referer (with the data request, and the work's canonical page with the cover)
export const sourceConfig: Record<
  PublicSourceId,
  { requestHosts: string[]; coverHosts: string[]; referer?: boolean }
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
}
