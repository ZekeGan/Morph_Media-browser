import { useSyncExternalStore } from 'react'
import { ActionIcon, Tooltip } from '@mantine/core'
import { Icon, type IconName } from '../common/icons'
import { t as tr } from '../i18n'

import { isPlayOrder, playOrders, type PlayOrder } from '../../shared/workspace'

// What happens when a track or video ends, shared by every player in the window (R-268) and kept in the local
// workspace settings. A failed save keeps the choice for this session.
let order: PlayOrder = 'stop',
  loaded = false,
  chosen = false
const listeners = new Set<() => void>()
const notify = () => {
  for (const listener of listeners) listener()
}

export function setPlayOrder(value: PlayOrder) {
  order = value
  chosen = true
  notify()
  void window.desktop.updateWorkspace({ action: 'playOrder', value }).catch(() => {})
}

function load() {
  if (loaded) return
  loaded = true
  void window.desktop
    .workspace()
    .then((state) => {
      const saved = state.prefs.playOrder
      if (!chosen && isPlayOrder(saved) && saved !== order) {
        order = saved
        notify()
      }
    })
    .catch(() => {})
}

export function usePlayOrder() {
  return useSyncExternalStore(
    (listener) => {
      load()
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => order
  )
}

const icons: Record<PlayOrder, IconName> = {
  stop: 'play-once',
  next: 'auto-next',
  all: 'repeat',
  one: 'repeat-one',
}
export const playOrderLabel = (value: PlayOrder) =>
  value === 'next'
    ? tr('播放順序：接續下一首')
    : value === 'all'
      ? tr('播放順序：全部循環')
      : value === 'one'
        ? tr('播放順序：單曲循環')
        : tr('播放順序：播完停止')

const orderName = (value: PlayOrder) =>
  value === 'next'
    ? tr('接續下一首')
    : value === 'all'
      ? tr('全部循環')
      : value === 'one'
        ? tr('單曲循環')
        : tr('播完停止')

// One button, one click per step: stop → next → loop all → loop one → stop. The tooltip names the current order and
// the one a click switches to; it sits above the player overlays (R-273).
export function PlayOrderButton({ zIndex = 450 }: { zIndex?: number }) {
  const value = usePlayOrder(),
    label = playOrderLabel(value),
    following = playOrders[(playOrders.indexOf(value) + 1) % playOrders.length]
  return (
    <Tooltip label={tr('{0}（按一下改為{1}）', label, orderName(following))} zIndex={zIndex}>
      <ActionIcon
        className="play-order"
        aria-label={label}
        aria-pressed={value !== 'stop'}
        variant={value === 'stop' ? 'subtle' : 'light'}
        onClick={() => setPlayOrder(following)}
      >
        <Icon name={icons[value]} />
      </ActionIcon>
    </Tooltip>
  )
}
