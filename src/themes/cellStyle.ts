import type { CSSProperties } from 'react'
import type { Cell } from '../../shared/model'
// The shipped neutral/transparent baseline follows the app. Explicit custom
// backgrounds and other text colors retain their portable appearance.
const scale = { small: 0.85, medium: 1, large: 1.4 } as const
const justify = { left: 'flex-start', center: 'center', right: 'flex-end' } as const
export const cellColors = (cell: Cell): CSSProperties => ({
  color:
    cell.style.backgroundColor === 'transparent' && cell.style.textColor.toLowerCase() === '#e4e6e8'
      ? 'var(--text)'
      : cell.style.textColor,
  background: cell.style.backgroundColor,
  // Text size is a multiplier on each cell kind's own base size (see .card-cell span in style.css).
  ...(cell.style.fontSize ? ({ '--cell-scale': scale[cell.style.fontSize] } as CSSProperties) : {}),
  ...(cell.style.align
    ? { justifyContent: justify[cell.style.align], textAlign: cell.style.align }
    : {}),
})
