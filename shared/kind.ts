import type { FolderRow } from './model'
import { isGameFolder } from './media'

// What a folder is decides how it is shown and what it offers; the project only arranges folders.
// "general" is the safe default: anything we are not sure about is browsed as plain files.
export type FolderKind = 'game' | 'book' | 'media' | 'general'
export const folderKinds: FolderKind[] = ['game', 'book', 'media', 'general']
export const isFolderKind = (value: unknown): value is FolderKind =>
  typeof value === 'string' && (folderKinds as string[]).includes(value)

// A small look at what a folder contains (counts of the first files listed).
export interface KindSample {
  images: number
  videos: number
  audio: number
  total: number
}
export const sampleOf = (entries: { kind: string }[]): KindSample => {
  const files = entries.filter((entry) => entry.kind !== 'folder' && entry.kind !== 'subtitle')
  return {
    images: files.filter((entry) => entry.kind === 'image').length,
    videos: files.filter((entry) => entry.kind === 'video').length,
    audio: files.filter((entry) => entry.kind === 'audio').length,
    total: files.length,
  }
}

export type KindSource = 'manual' | 'game' | 'reading' | 'content' | 'default'
export interface DetectedKind {
  kind: FolderKind
  source: KindSource
}
// Order: what you set by hand, then a detected game (its boundary protection applies in any project), then a folder
// already read as a book, then what the files look like. Unsure means general.
export function detectFolderKind(row: FolderRow, sample?: KindSample): DetectedKind {
  const manual = row.record?.details?.kind
  if (manual) return { kind: manual, source: 'manual' }
  if (isGameFolder(row)) return { kind: 'game', source: 'game' }
  if (row.record?.details?.reading?.mode === 'manga') return { kind: 'book', source: 'reading' }
  if (sample && sample.total > 0) {
    if ((sample.videos + sample.audio) * 2 >= sample.total)
      return { kind: 'media', source: 'content' }
    if (sample.images >= 3 && sample.images * 10 >= sample.total * 7)
      return { kind: 'book', source: 'content' }
  }
  return { kind: 'general', source: 'default' }
}

// The kind the interface follows for a folder: what you set, what it is detected as, else general.
export const effectiveKind = (row: FolderRow, sample?: KindSample): FolderKind =>
  detectFolderKind(row, sample).kind
