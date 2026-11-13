import { verticalCompactor } from 'react-grid-layout'
import type { Cell } from '../../shared/model'

// R-361: the editor's grid pulls every component up into free rows as it draws them, so the stored positions are
// settled the same way on every change: what is saved is what the editor shows. Spacers stay where they are (they are
// the way to keep a gap on purpose), as they do on the grid.
export function settleGrid(cells: Cell[], cols = 12): Cell[] {
  const layout = verticalCompactor.compact(
    cells.map((cell) => ({
      i: cell.cellId,
      ...cell.grid,
      ...(cell.kind === 'spacer' ? { static: true } : {}),
    })),
    cols
  )
  const placed = new Map(layout.map((item) => [item.i, item]))
  return cells.map((cell) => {
    const item = placed.get(cell.cellId)
    return item && (item.x !== cell.grid.x || item.y !== cell.grid.y)
      ? { ...cell, grid: { ...cell.grid, x: item.x, y: item.y } }
      : cell
  })
}
