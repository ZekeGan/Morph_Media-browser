import { useRef, useState } from 'react'
import type { BrowseState } from '../shared/explorer'
import { fallbackColumns, groupColumns } from '../shared/browse'
import type { Project } from '../shared/model'
import { t as tr } from './i18n'

// TABLE columns: the project's fields after the three built-in ones, in the saved order, minus hidden ones (the
// name column always stays). Dragging a header moves a column; the moved one flashes briefly where it landed.
export function useTableColumns({
  project,
  browse,
  busy,
  saveOrder,
}: {
  project: Project
  browse: BrowseState
  busy: boolean
  saveOrder: (columnOrder: string[]) => void
}) {
  // dragover can arrive before React re-renders with the dragged column; the ref is set at once.
  const dragNow = useRef('')
  const [dragColumn, setDragState] = useState(''),
    [columnDrop, setColumnDrop] = useState<{ id: string; after: boolean }>(),
    [droppedColumn, setDroppedColumn] = useState('')
  const availableColumns = [
    { id: 'name', label: tr('資料夾名稱') },
    { id: 'path', label: tr('目前路徑') },
    { id: 'depth', label: tr('層級') },
    ...groupColumns(project),
    ...project.fieldBindings.map((f) => ({ id: f.attributeId, label: f.alias })),
    ...fallbackColumns(project).map(({ id, attributeId }) => ({
      id,
      label: tr(
        '{0}（含備用）',
        project.fieldBindings.find((f) => f.attributeId === attributeId)?.alias ?? ''
      ),
    })),
  ]
  const orderedColumns = [
    ...(browse.columnOrder ?? []).flatMap((id) => availableColumns.find((c) => c.id === id) ?? []),
    ...availableColumns.filter((c) => !browse.columnOrder?.includes(c.id)),
  ]
  const columns = orderedColumns.filter(
    (column) => column.id === 'name' || !browse.hiddenColumns?.includes(column.id)
  )
  const reorderColumn = (source: string, target: string, after: boolean) => {
    if (busy || source === target || !columns.some((c) => c.id === source)) return
    const ids = orderedColumns.map((c) => c.id).filter((id) => id !== source),
      index = ids.indexOf(target)
    if (index < 0) return
    ids.splice(index + (after ? 1 : 0), 0, source)
    if (ids.some((id, i) => orderedColumns[i].id !== id)) {
      saveOrder(ids)
      setDroppedColumn(source)
      setTimeout(() => setDroppedColumn(''), 700)
    }
  }
  const setDragColumn = (id: string) => {
    dragNow.current = id
    setDragState(id)
  }
  const draggingColumn = () => dragNow.current
  const endColumnDrag = () => {
    setDragColumn('')
    setColumnDrop(undefined)
  }
  return {
    orderedColumns,
    columns,
    dragColumn,
    setDragColumn,
    draggingColumn,
    columnDrop,
    setColumnDrop,
    droppedColumn,
    reorderColumn,
    endColumnDrag,
  }
}
