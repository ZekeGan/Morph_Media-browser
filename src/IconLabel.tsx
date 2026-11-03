import { Tooltip } from '@mantine/core'
import { Icon, type IconName } from './icons'

// Label for an icon-only segment: the icon is what shows, the name appears as a tooltip and stays in the page
// (visually hidden) so screen readers and keyboard users still get it.
export function iconLabel(icon: IconName, text: string, size = 16) {
  return (
    <Tooltip label={text} openDelay={350} withArrow>
      <span className="icon-seg">
        <Icon name={icon} size={size} />
        <span className="seg-text">{text}</span>
      </span>
    </Tooltip>
  )
}
