import { useSyncExternalStore } from 'react'
import { Tooltip } from '@mantine/core'
import type { FolderRow } from '../../shared/model'
import { detectFolderKind, type KindSample } from '../../shared/kind'
import { t as tr, useLocale } from '../i18n'
import { Icon, type IconName } from '../common/icons'
import { useFolderSample } from './folderStats'

// R-343: what a folder is, shown as its icon in the tree, table and panel title, and as a small badge on its card.
// A folder that has not been opened yet is only known by what was set by hand, a game boundary or its reading mode.
export type KindLook = 'game' | 'novel' | 'manga' | 'music' | 'video' | 'general'
const looks: Record<KindLook, { icon: IconName; label: string }> = {
  game: { icon: 'game', label: '遊戲' },
  novel: { icon: 'book', label: '小說' },
  manga: { icon: 'page-spread', label: '漫畫' },
  music: { icon: 'music', label: '音樂' },
  video: { icon: 'video', label: '影片' },
  general: { icon: 'folder', label: '一般' },
}
export function kindLook(row: FolderRow, sample?: KindSample) {
  const detected = detectFolderKind(row, sample)
  const look: KindLook =
    detected.kind === 'game'
      ? 'game'
      : detected.kind === 'book'
        ? (sample?.texts ?? 0) > (sample?.images ?? 0)
          ? 'novel'
          : 'manga'
        : detected.kind === 'media'
          ? (sample?.audio ?? 0) > (sample?.videos ?? 0)
            ? 'music'
            : 'video'
          : 'general'
  const candidate =
    row.boundary?.state === 'candidate' || row.record?.details?.boundary?.state === 'candidate'
  return { look, manual: detected.source === 'manual', candidate }
}
// What the scan counted (R-340) is enough for folders never opened; an opened folder's content sample is more exact.
export function useKindLook(row: FolderRow) {
  return kindLook(row, useFolderSample(row.rowId) ?? row.contents)
}

// The icon only (tree, table, panel title); a candidate game shows the game icon in its unconfirmed style.
export function KindIcon({ row, size = 16 }: { row: FolderRow; size?: number }) {
  useLocale()
  const { look, candidate } = useKindLook(row)
  const shown = candidate && look === 'general' ? 'game' : look
  return (
    <span
      className={'kind-icon kind-' + shown + (candidate && look !== 'game' ? ' unconfirmed' : '')}
      aria-hidden="true"
    >
      <Icon name={looks[shown].icon} size={size} />
    </span>
  )
}

// The badge on a card: the kind's icon; its tooltip says whether it was detected or set by hand, and a click opens
// the folder settings where the kind is chosen. Plain folders have no badge.
export function KindBadge({ row, configure }: { row: FolderRow; configure?: () => void }) {
  useLocale()
  const { look, manual, candidate } = useKindLook(row)
  const visible = useKindBadgeVisible()
  if (!visible || (look === 'general' && !candidate)) return null
  const shown = look === 'general' ? 'game' : look,
    unconfirmed = candidate && look !== 'game',
    label = unconfirmed
      ? tr('疑似遊戲 · 尚未確認')
      : tr(looks[shown].label) + ' · ' + (manual ? tr('你指定的') : tr('自動判斷'))
  return (
    <Tooltip label={label} withArrow>
      <button
        type="button"
        className={'kind-badge kind-' + shown + (unconfirmed ? ' unconfirmed' : '')}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation()
          configure?.()
        }}
      >
        <Icon name={looks[shown].icon} size={14} />
      </button>
    </Tooltip>
  )
}

// Showing the card badges is this computer's choice (on unless turned off).
const badgeKey = 'morph.kindBadge'
const badgeListeners = new Set<() => void>()
const readBadge = () => {
  try {
    return localStorage.getItem(badgeKey) !== 'off'
  } catch {
    return true
  }
}
export function setKindBadgeVisible(value: boolean) {
  try {
    localStorage.setItem(badgeKey, value ? 'on' : 'off')
  } catch {}
  for (const listener of badgeListeners) listener()
}
export function useKindBadgeVisible() {
  return useSyncExternalStore((callback) => {
    badgeListeners.add(callback)
    return () => badgeListeners.delete(callback)
  }, readBadge)
}
