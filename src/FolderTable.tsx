import type { Dispatch, MutableRefObject, SetStateAction, HTMLAttributes } from 'react'
import { t as tr } from './i18n'
import { Icon } from './icons'
import { BoundaryFlag } from './BoundaryFlag'
import { fieldValue, type FolderRow } from '../shared/model'
import type { BrowseState } from '../shared/explorer'

// The folders TABLE view: sortable, draggable and resizable columns, one row per folder.
export function FolderTable({
  columns,
  rows,
  sort,
  setSort,
  browse,
  busy,
  dragColumn,
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
  return (
    <div className="table-scroll">
      <table className="folder-table">
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
                  if (!busy && dragColumn && dragColumn !== c.id) {
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
                  ) : Array.isArray(fieldValue(r, c.id)) ? (
                    (fieldValue(r, c.id) as unknown[]).join(', ')
                  ) : typeof fieldValue(r, c.id) === 'boolean' ? (
                    fieldValue(r, c.id) ? (
                      tr('是')
                    ) : (
                      tr('否')
                    )
                  ) : (
                    String(fieldValue(r, c.id) ?? '')
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
