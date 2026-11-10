import type { ReactNode } from 'react'
import { ActionIcon, Group, Tooltip } from '@mantine/core'
import { Icon } from './icons'
import { t as tr } from '../i18n'

// A small "?" that explains a control on hover or keyboard focus, so help text does not take up room in the layout.
// Inside a form label the icon must not become part of the control's accessible name, so it is hover-only there.
export function HelpTip({ text, inLabel = false }: { text: string; inLabel?: boolean }) {
  return (
    <Tooltip
      label={text}
      multiline
      maw={260}
      withArrow
      openDelay={150}
      events={{ hover: true, focus: true, touch: true }}
    >
      <ActionIcon
        variant="transparent"
        size="xs"
        color="gray"
        className="help-tip"
        {...(inLabel
          ? { 'aria-hidden': true, tabIndex: -1 }
          : { 'aria-label': tr('說明：{0}', text) })}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => event.preventDefault()}
      >
        <Icon name="help" size={13} />
      </ActionIcon>
    </Tooltip>
  )
}
// A control label followed by its "?" help.
export function HelpLabel({ label, help }: { label: ReactNode; help: string }) {
  return (
    <Group gap={4} wrap="nowrap" component="span" display="inline-flex">
      <span>{label}</span>
      <HelpTip text={help} inLabel />
    </Group>
  )
}
