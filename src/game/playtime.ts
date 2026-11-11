import { useSyncExternalStore } from 'react'
import type { FolderRow } from '../../shared/model'
import type { PlayRecord } from '../../shared/workspace'
import { currentLocale, t as tr } from '../i18n'

// Play time of games started from M:orph (R-308). Main writes it to the local settings when a game process ends;
// the window reads it at start and again whenever it gets focus back (usually right after the game was closed).
let records: Record<string, PlayRecord> = {}
const listeners = new Set<() => void>()
const publish = (next: Record<string, PlayRecord> | undefined) => {
  if (JSON.stringify(next ?? {}) === JSON.stringify(records)) return
  records = next ?? {}
  for (const listener of listeners) listener()
}
let started = false
export function startPlaytime() {
  if (started || typeof window === 'undefined' || !window.desktop) return
  started = true
  const load = () =>
    void window.desktop
      .workspace()
      .then((state) => publish(state.prefs.playtime))
      .catch(() => {})
  load()
  window.addEventListener('focus', load)
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function usePlaytime(folderId: string | undefined) {
  startPlaytime()
  return useSyncExternalStore(subscribe, () => (folderId ? records[folderId] : undefined))
}
export function usePlaytimes() {
  startPlaytime()
  return useSyncExternalStore(subscribe, () => records)
}
export const PLAY_TIME = '@playTime',
  LAST_PLAYED = '@lastPlayed'
// Values for sorting: seconds played, or the end of the last session as an ISO time (sorts as text).
export function playValue(row: FolderRow, id: string, all: Record<string, PlayRecord>) {
  const record = row.record ? all[row.record.folderId] : undefined
  if (!record) return undefined
  return id === PLAY_TIME ? record.total : record.last
}
export function formatPlayTime(seconds: number) {
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60)
  return hours ? tr('{0} 小時 {1} 分', hours, minutes) : tr('{0} 分', Math.max(1, minutes))
}
export function formatLastPlayed(iso: string) {
  return new Date(iso).toLocaleDateString(currentLocale())
}
export function formatPlayValue(id: string, value: unknown) {
  if (value === undefined) return ''
  return id === PLAY_TIME ? formatPlayTime(Number(value)) : formatLastPlayed(String(value))
}
