import type { CSSProperties } from 'react'
import type { Cell } from '../../shared/model'
// The shipped neutral/transparent baseline follows the app. Explicit custom
// backgrounds and other text colors retain their portable appearance.
const scale = { xsmall: 0.72, small: 0.85, medium: 1, large: 1.4, xlarge: 1.8 } as const
const justify = { left: 'flex-start', center: 'center', right: 'flex-end' } as const
const vertical = { top: 'flex-start', center: 'center', bottom: 'flex-end' } as const
const weights = { light: 300, normal: 400, bold: 700 } as const
const paddings = { compact: '3px', roomy: '12px' } as const
const radii = { small: '6px', large: '14px' } as const
const borders = { thin: '1px', thick: '2px' } as const
const opacities = { soft: 0.7, faint: 0.45 } as const
const lineHeights = { tight: 1.15, loose: 1.7 } as const

// Every optional style is a plain CSS property or variable on the cell, so cards and the editor look the same.
export const cellColors = (cell: Cell): CSSProperties => {
  const style = cell.style,
    decorations = [style.underline && 'underline', style.strike && 'line-through'].filter(Boolean)
  return {
    color:
      style.backgroundColor === 'transparent' && style.textColor.toLowerCase() === '#e4e6e8'
        ? 'var(--text)'
        : style.textColor,
    background: style.backgroundColor,
    // Text size is a multiplier on each cell kind's own base size (see .card-cell span in style.css).
    ...(style.fontSize ? ({ '--cell-scale': scale[style.fontSize] } as CSSProperties) : {}),
    ...(style.align ? { justifyContent: justify[style.align], textAlign: style.align } : {}),
    ...(style.valign ? { alignItems: vertical[style.valign] } : {}),
    ...(style.weight
      ? ({
          fontWeight: weights[style.weight],
          '--cell-weight': weights[style.weight],
        } as CSSProperties)
      : {}),
    ...(style.italic ? { fontStyle: 'italic' } : {}),
    ...(decorations.length ? { textDecoration: decorations.join(' ') } : {}),
    ...(style.lineHeight ? { lineHeight: lineHeights[style.lineHeight] } : {}),
    ...(style.letterSpacing ? { letterSpacing: '0.06em' } : {}),
    ...(style.padding ? { padding: paddings[style.padding] } : {}),
    ...(style.radius ? { borderRadius: radii[style.radius] } : {}),
    ...(style.borderColor && style.borderWidth
      ? { border: `${borders[style.borderWidth]} solid ${style.borderColor}` }
      : {}),
    ...(style.opacity ? { opacity: opacities[style.opacity] } : {}),
  }
}
