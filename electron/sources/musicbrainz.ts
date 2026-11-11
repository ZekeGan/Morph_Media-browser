import { SourceError } from '../metadata-common'
import { clean, type Adapter } from './site'

export const musicbrainz: Adapter = async (site) => {
  const id = site
    .match(/^\/release\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/?$/i)[1]
    .toLowerCase()
  const data = await site.json(
    'https://musicbrainz.org/ws/2/release/' + id + '?inc=artist-credits+recordings&fmt=json'
  )
  if (data.id !== id) throw new SourceError('notFound')
  site.text('RELEASE_DATE', data.date)
  site.text('COUNTRY', data.country)
  site.text('BARCODE', data.barcode)
  site.list(
    'ARTISTS',
    data['artist-credit']?.map((artist: { name?: unknown }) => artist?.name)
  )
  site.list(
    'TRACKS',
    data.media?.flatMap(
      (medium: { tracks?: { title?: unknown }[] }) =>
        medium.tracks?.map((track) => track.title) ?? []
    )
  )
  return { title: clean(data.title), canonical: 'https://musicbrainz.org/release/' + id }
}
