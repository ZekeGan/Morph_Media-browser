import { ActionIcon, Tooltip } from '@mantine/core'
import { Icon } from '../common/icons'
import { t as tr } from '../i18n'

export type QueueView = 'list' | 'images'

// The list/image presentation switch shared by every media queue.
export function ViewToggle({
  view,
  change,
}: {
  view: QueueView
  change: (view: QueueView) => void
}) {
  return (
    <div role="group" aria-label={tr('影片佇列展示')}>
      {(['list', 'images'] as const).map((mode) => (
        <Tooltip key={mode} zIndex={450} label={tr(mode === 'list' ? '清單模式' : '圖片模式')}>
          <ActionIcon
            variant={view === mode ? 'light' : 'subtle'}
            aria-label={tr(mode === 'list' ? '清單模式' : '圖片模式')}
            aria-pressed={view === mode}
            onClick={() => change(mode)}
          >
            <Icon name={mode === 'list' ? 'list' : 'image'} />
          </ActionIcon>
        </Tooltip>
      ))}
    </div>
  )
}
