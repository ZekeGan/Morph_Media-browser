import type { MediaEntry } from './explorer'
import type { FolderRow } from './model'

export type MediaFilter = 'all' | 'image' | 'video' | 'audio' | 'other'
export interface FileVisibility {
  hidden: boolean
  dotfiles: boolean
}
export const defaultVisibility: FileVisibility = { hidden: false, dotfiles: true }
export const isGameFolder = (row: FolderRow) =>
  row.record?.details?.boundary?.state !== 'not-game' &&
  !!(row.boundary || ['root', 'candidate'].includes(row.record?.details?.boundary?.state ?? ''))
export const visibleFile = (entry: MediaEntry, visibility = defaultVisibility) =>
  (visibility.hidden || !entry.hidden) && (visibility.dotfiles || !entry.name.startsWith('.'))
export const matchesMedia = (entry: MediaEntry, filter: MediaFilter) =>
  entry.kind !== 'folder' &&
  (filter === 'all' ||
    (filter === 'other'
      ? !['image', 'video', 'audio'].includes(entry.kind)
      : entry.kind === filter))
export const canPreviewMedia = (entry: MediaEntry) =>
  ['image', 'video', 'audio', 'pdf', 'archive'].includes(entry.kind)
export const mediaIdentity = (entry: MediaEntry) =>
  'rowId' in entry ? String(entry.rowId) + '/' + entry.id : entry.id
// Queue identity and order are inherited from the displayed direct-folder results.
export const mediaQueue = (entries: MediaEntry[], selected: MediaEntry) =>
  entries.filter((entry) => entry.kind === selected.kind && canPreviewMedia(entry))
