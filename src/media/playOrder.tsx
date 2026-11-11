import { useSyncExternalStore } from 'react'
import { ActionIcon, Tooltip } from '@mantine/core'
import { Icon, type IconName } from '../common/icons'
import { t as tr } from '../i18n'

// What happens when a track or video ends, shared by every player in the window (R-268). It lasts for this
// session; keeping it across restarts is part of the local record (R-253).
export type PlayOrder = 'stop' | 'next' | 'all' | 'one'

const orders: PlayOrder[] = ['stop', 'next', 'all', 'one']
let order: PlayOrder = 'stop'
const listeners = new Set<() => void>()

export function setPlayOrder(value: PlayOrder) {
  order = value
  for (const listener of listeners) listener()
}

export function usePlayOrder() {
  return useSyncExternalStore(
    (listener) => {
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

// One button, one click per step: stop → next → loop all → loop one → stop.
export function PlayOrderButton({ zIndex }: { zIndex?: number }) {
  const value = usePlayOrder(),
    label = playOrderLabel(value)
  return (
    <Tooltip label={label} zIndex={zIndex}>
      <ActionIcon
        className="play-order"
        aria-label={label}
        aria-pressed={value !== 'stop'}
        variant={value === 'stop' ? 'subtle' : 'light'}
        onClick={() => setPlayOrder(orders[(orders.indexOf(value) + 1) % orders.length])}
      >
        <Icon name={icons[value]} />
      </ActionIcon>
    </Tooltip>
  )
}
