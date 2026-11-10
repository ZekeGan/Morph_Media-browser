import { useSyncExternalStore } from 'react'
import type { MediaEntry } from '../../shared/explorer'
type Stats = { files: number; size: number; updated: number }
const cache = new Map<string, Stats>()
const listeners = new Map<string, Set<() => void>>()
export function cacheFolderStats(rowId: string, entries: MediaEntry[]) {
  const files = entries.filter((entry) => entry.kind !== 'folder')
  cache.set(rowId, {
    files: files.length,
    size: files.reduce((sum, entry) => sum + entry.size, 0),
    updated: Date.now(),
  })
  if (cache.size > 5000) cache.delete(cache.keys().next().value!)
  for (const listener of listeners.get(rowId) ?? []) listener()
}
export function useFolderStats(rowId: string | undefined) {
  return useSyncExternalStore(
    (callback) => {
      if (!rowId) return () => {}
      let set = listeners.get(rowId)
      if (!set) {
        set = new Set()
        listeners.set(rowId, set)
      }
      set.add(callback)
      return () => {
        set!.delete(callback)
        if (!set!.size) listeners.delete(rowId)
      }
    },
    () => (rowId ? cache.get(rowId) : undefined)
  )
}
