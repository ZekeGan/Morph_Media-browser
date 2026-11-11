import { useEffect, useState } from 'react'
import type { MediaEntry } from '../../shared/explorer'
import type { FolderRow } from '../../shared/model'
import { audioCover } from './MediaThumb'
import { t as tr } from '../i18n'

// The album cover at the top of a music folder (R-294), in the player's order: the folder's chosen cover, the first
// track's embedded cover, then a single cover/folder/front/album image. Several named images are not guessed between.
export function FolderAlbumCover({ row, files }: { row: FolderRow; files: MediaEntry[] }) {
  const first = files.find((entry) => entry.kind === 'audio')
  const chosen = row.record?.assets.find(
    (asset) => asset.assetId === row.record?.details?.bannerAssetId
  )
  const named = files.filter(
    (entry) => entry.kind === 'image' && /^(cover|folder|front|album)\.[^.]+$/i.test(entry.name)
  )
  const [embedded, setEmbedded] = useState<string | null>()
  const [failed, setFailed] = useState('')
  useEffect(() => {
    setEmbedded(undefined)
    if (!first || chosen) return
    let active = true
    void audioCover(first.url).then((url) => active && setEmbedded(url ?? null))
    return () => {
      active = false
    }
  }, [first?.url, chosen?.assetId])
  if (!first) return null
  const url = chosen
    ? `media://asset/${row.rowId}/${chosen.assetId}`
    : embedded === undefined
      ? undefined
      : (embedded ?? (named.length === 1 ? named[0].url : undefined))
  if (!url || failed === url) return null
  return (
    <div className="album-cover folder-album-cover">
      <img src={url} alt={tr('專輯封面')} onError={() => setFailed(url)} />
    </div>
  )
}
