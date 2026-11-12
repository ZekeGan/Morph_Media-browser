// Website source health check (R-301): asks every metadata source for one known work and prints whether it still
// answers, and if not, why (the R-300 error kinds). Run by hand or before a release; it is not part of the commit
// checks because it needs the network. It reads only and never writes to any folder.
//   pnpm check:sources                  every source
//   pnpm check:sources hitomi steam     only these sources
//   pnpm check:sources hitomi=<url>     another work for a source (for example when the sample was taken down)
import { metadata } from '../electron/metadata'
import { SourceError } from '../electron/metadata-common'
import { metadataSources, type MetadataSourceId } from '../shared/sources'

// One public, long-lived work per source (ExHentai galleries are read through the same public API as E-Hentai).
const samples: Record<MetadataSourceId, string> = {
  eh: 'https://e-hentai.org/g/618395/0439fa3666/',
  exh: 'https://exhentai.org/g/618395/0439fa3666/',
  hitomi: 'https://hitomi.la/reader/1867432.html',
  bangumi: 'https://bgm.tv/subject/253',
  anilist: 'https://anilist.co/anime/1/',
  dlsite: 'https://www.dlsite.com/maniax/work/=/product_id/RJ01017217.html',
  steam: 'https://store.steampowered.com/app/620/',
  vndb: 'https://vndb.org/v17',
  musicbrainz: 'https://musicbrainz.org/release/b84ee12a-09ef-421b-82de-0441a926375b',
  openlibrary: 'https://openlibrary.org/works/OL45804W',
  pixiv: 'https://www.pixiv.net/artworks/20',
  commons: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
  mangadex: 'https://mangadex.org/title/801513ba-a712-498c-8f57-cae55b38cc92',
  kitsu: 'https://kitsu.app/anime/cowboy-bebop',
  mangaupdates: 'https://www.mangaupdates.com/series/njeqwry/berserk',
  narou: 'https://ncode.syosetu.com/n9669bk/',
  itunes: 'https://music.apple.com/jp/album/discovery/697194953',
  deezer: 'https://www.deezer.com/album/302127',
  danbooru: 'https://danbooru.donmai.us/posts/1',
  googlebooks: 'https://books.google.com/books?id=zyTCAlFPjgYC',
  booth: 'https://booth.pm/ja/items/8011749',
  kakuyomu: 'https://kakuyomu.jp/works/2912051603596422650',
  web: 'https://www.example.com/',
}
const args = process.argv.slice(2)
const overrides = new Map(
  args
    .filter((arg) => arg.includes('='))
    .map((arg) => arg.split(/=(.*)/s).slice(0, 2) as [string, string])
)
const picked = args.map((arg) => arg.split('=')[0])
const ids = metadataSources
  .map((source) => source.id)
  .filter((id) => !picked.length || picked.includes(id))

let failed = 0
for (const id of ids) {
  const url = overrides.get(id) ?? samples[id],
    name = metadataSources.find((source) => source.id === id)!.name,
    started = Date.now()
  let line: string
  try {
    const result = await metadata(url, fetch, id)
    const cover = result.cover ? 'cover' : 'no cover'
    line = `OK      ${result.preview.values.length} fields, ${cover} — ${result.preview.title.slice(0, 50)}`
  } catch (error) {
    failed++
    const kind = error instanceof SourceError ? error.kind : 'other'
    line = `FAIL    ${kind}: ${error instanceof Error ? error.message : String(error)}`
  }
  console.log(`${name.padEnd(18)} ${line}  (${Date.now() - started} ms)`)
  console.log(`${''.padEnd(18)} ${url}`)
}
console.log(
  failed
    ? `\n${failed} source(s) need a look. Error kinds: offline = can't connect (host moved?), notFound = sample work gone (pass <id>=<url>), restricted = needs access, format = the site changed its reply.`
    : '\nAll sources answered.'
)
process.exit(failed ? 1 : 0)
