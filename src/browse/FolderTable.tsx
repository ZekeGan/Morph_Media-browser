import {
  useLayoutEffect,
  useRef,
  type Dispatch,
  MutableRefObject,
  SetStateAction,
  HTMLAttributes,
} from 'react'
import { t as tr } from '../i18n'
import { formatPlayValue } from '../game/playtime'
import { yesNo } from '../editor/fieldTypes'
import { Icon } from '../common/icons'
import { BoundaryFlag } from '../game/BoundaryFlag'
import type { FolderRow } from '../../shared/model'
import type { BrowseState } from '../../shared/explorer'

// The folders TABLE view: sortable, draggable and resizable columns, one row per folder.
export function FolderTable({
  columns,
  rows,
  sort,
  setSort,
  browse,
  busy,
  dragColumn,
  draggingColumn,
  valueOf,
  labelsOf,
  setDragColumn,
  columnDrop,
  setColumnDrop,
  droppedColumn,
  reorderColumn,
  endColumnDrag,
  persist,
  state,
  resize,
  moveWidth,
  stopWidth,
  highlight,
  marked,
  gestures,
  panelOpen,
  showPanelFor,
}: {
  columns: { id: string; label: string }[]
  rows: FolderRow[]
  sort: { field: string; asc: boolean }
  setSort: Dispatch<SetStateAction<{ field: string; asc: boolean }>>
  browse: BrowseState
  busy: boolean
  dragColumn: string
  // The column being dragged, read at once (state may lag one render behind dragover).
  draggingColumn: () => string
  // A row's value in a column (a field, or a card component's fallback chain).
  valueOf: (row: FolderRow, columnId: string) => unknown
  // A yes/no column's own wording (R-234).
  labelsOf: (columnId: string) => { trueLabel?: string; falseLabel?: string } | undefined
  setDragColumn: (id: string) => void
  columnDrop?: { id: string; after: boolean }
  setColumnDrop: Dispatch<SetStateAction<{ id: string; after: boolean } | undefined>>
  droppedColumn: string
  reorderColumn: (source: string, target: string, after: boolean) => void
  endColumnDrag: () => void
  persist: (next: BrowseState) => void
  state: MutableRefObject<BrowseState>
  resize: MutableRefObject<{ id: string; start: number; width: number } | undefined>
  moveWidth: (event: React.PointerEvent) => void
  stopWidth: () => void
  highlight?: string
  marked: string[]
  gestures: (id: string) => HTMLAttributes<HTMLElement>
  panelOpen: boolean
  showPanelFor: (id: string) => void
}) {
  const table = useRef<HTMLTableElement>(null),
    seen = useRef({ order: '', lefts: new Map<string, number>() })
  const order = columns.map((c) => c.id).join('|')
  // When the column order changes, slide each moved column from where it was to where it now is.
  useLayoutEffect(() => {
    const head = table.current?.tHead?.rows[0]
    if (!head || !table.current) return
    const lefts = new Map(
      Array.from(head.cells).map((cell) => [cell.dataset.columnId ?? '', cell.offsetLeft])
    )
    const previous = seen.current
    seen.current = { order, lefts }
    if (
      !previous.order ||
      previous.order === order ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return
    const rows = [head, ...Array.from(table.current.tBodies[0]?.rows ?? [])]
    Array.from(head.cells).forEach((cell, index) => {
      const id = cell.dataset.columnId ?? '',
        shift = (previous.lefts.get(id) ?? lefts.get(id)!) - lefts.get(id)!
      if (!shift) return
      for (const row of rows)
        row.cells[index]?.animate(
          [{ transform: `translateX(${shift}px)` }, { transform: 'none' }],
          { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
        )
    })
  })
  return (
    <div className="table-scroll">
      <table className="folder-table" ref={table}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.id}
                data-column-id={c.id}
                className={[
                  columnDrop?.id === c.id
                    ? columnDrop.after
                      ? 'column-insert-after'
                      : 'column-insert-before'
                    : '',
                  dragColumn === c.id ? 'column-dragging' : '',
                  droppedColumn === c.id ? 'column-dropped' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-sort={sort.field === c.id ? (sort.asc ? 'ascending' : 'descending') : 'none'}
                style={{
                  width: browse.widths[c.id] ?? 180,
                  minWidth: browse.widths[c.id] ?? 180,
                }}
                onDragOver={(e) => {
                  if (!busy && draggingColumn() && draggingColumn() !== c.id) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    const rect = e.currentTarget.getBoundingClientRect()
                    const after = e.clientX >= rect.left + rect.width / 2
                    setColumnDrop((previous) =>
                      previous?.id === c.id && previous.after === after
                        ? previous
                        : { id: c.id, after }
                    )
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const rect = e.currentTarget.getBoundingClientRect()
                  reorderColumn(
                    e.dataTransfer.getData('application/x-media-viewer-column'),
                    c.id,
                    e.clientX >= rect.left + rect.width / 2
                  )
                  endColumnDrag()
                }}
              >
                <button
                  className="column-head"
                  disabled={busy}
                  draggable={!busy}
                  title={tr('點擊排序；拖曳調整欄位順序（Alt+←／→）')}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-media-viewer-column', c.id)
                    e.dataTransfer.effectAllowed = 'move'
                    setDragColumn(c.id)
                  }}
                  onDragEnd={endColumnDrag}
                  onKeyDown={(e) => {
                    if (e.altKey && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                      e.preventDefault()
                      const index = columns.findIndex((column) => column.id === c.id),
                        next = columns[index + (e.key === 'ArrowLeft' ? -1 : 1)]
                      if (next) reorderColumn(c.id, next.id, e.key === 'ArrowRight')
                    }
                  }}
                  onClick={() =>
                    setSort((s) => ({ field: c.id, asc: s.field === c.id ? !s.asc : true }))
                  }
                >
                  {c.label}
                  {sort.field === c.id ? (sort.asc ? ' ↑' : ' ↓') : ''}
                </button>
                {c.id !== 'name' && (
                  <button
                    type="button"
                    className="column-hide"
                    disabled={busy}
                    aria-label={tr('隱藏此欄')}
                    title={tr('隱藏此欄')}
                    onClick={() =>
                      persist({
                        ...state.current,
                        hiddenColumns: [...new Set([...(state.current.hiddenColumns ?? []), c.id])],
                      })
                    }
                  >
                    <Icon name="eye-off" size={13} />
                  </button>
                )}
                <span
                  className="column-resizer"
                  role="separator"
                  aria-label={tr('調整 ') + c.label + tr(' 欄寬')}
                  onPointerDown={(e) => {
                    e.preventDefault()
                    resize.current = {
                      id: c.id,
                      start: e.clientX,
                      width: browse.widths[c.id] ?? 180,
                    }
                    e.currentTarget.setPointerCapture(e.pointerId)
                  }}
                  onPointerMove={moveWidth}
                  onPointerUp={stopWidth}
                  onPointerCancel={() => {
                    resize.current = undefined
                  }}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.rowId}
              data-row-id={r.rowId}
              className={
                (highlight === r.rowId ? 'selected ' : '') +
                (marked.includes(r.rowId) ? 'marked' : '')
              }
              tabIndex={0}
              {...gestures(r.rowId)}
            >
              {columns.map((c) => (
                <td
                  key={c.id}
                  style={{ maxWidth: browse.widths[c.id] ?? 180 }}
                  title={c.id === 'path' ? r.path : undefined}
                >
                  {c.id === 'name' ? (
                    <>
                      {r.name}
                      {!r.record ? ' ⚠' : r.boundary ? <BoundaryFlag /> : null}
                      {!panelOpen && (
                        <button
                          type="button"
                          className="row-info"
                          aria-label={tr('顯示資料夾內容')}
                          title={tr('顯示資料夾內容')}
                          onClick={(e) => {
                            e.stopPropagation()
                            showPanelFor(r.rowId)
                          }}
                        >
                          <Icon name="panel-right" size={14} />
                        </button>
                      )}
                    </>
                  ) : c.id === 'path' ? (
                    r.path
                  ) : c.id === 'depth' ? (
                    r.depth
                  ) : c.id.startsWith('@') ? (
                    formatPlayValue(c.id, valueOf(r, c.id))
                  ) : Array.isArray(valueOf(r, c.id)) ? (
                    (valueOf(r, c.id) as unknown[]).join(', ')
                  ) : typeof valueOf(r, c.id) === 'boolean' ? (
                    yesNo(valueOf(r, c.id) as boolean, labelsOf(c.id))
                  ) : (
                    String(valueOf(r, c.id) ?? '')
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
