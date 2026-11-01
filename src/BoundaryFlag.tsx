import { Tooltip } from '@mantine/core'
import { Icon } from './icons'
import { t as tr } from './i18n'

// A game boundary is marked with a flag; the words live in the tooltip.
export function BoundaryFlag({ detail }: { detail?: string }) {
  const label = detail ? tr('遊戲邊界') + ' · ' + detail : tr('遊戲邊界')
  return (
    <Tooltip label={label} withArrow>
      <span className="boundary-flag" role="img" aria-label={label} tabIndex={0}>
        <Icon name="flag" size={14} />
      </span>
    </Tooltip>
  )
}
