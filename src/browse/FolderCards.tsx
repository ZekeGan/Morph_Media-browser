import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { KindBadge } from './folderKind'
import type { FolderRow, Project, Request, Response } from '../../shared/model'
import { Card } from '../cells/Card'
import { t as tr } from '../i18n'

type Act = (request: Request) => Promise<Response | undefined>
export type Gestures = (id: string) => {
  onClick: (e: MouseEvent) => void
  onDoubleClick: () => void
  onContextMenu: (e: MouseEvent) => void
  onKeyDown: (e: KeyboardEvent) => void
}

// The CARD grid: one card per folder, with its selection and multi-select marks, and a small state note.
export function FolderCards({
  rows,
  project,
  itemsPerRow,
  highlight,
  marked,
  gestures,
  showPanelFor,
  act,
}: {
  rows: FolderRow[]
  project: Project
  itemsPerRow: number
  highlight?: string
  marked: string[]
  gestures: Gestures
  showPanelFor: (id: string) => void
  act: Act
}) {
  return (
    <div className="cards" style={{ '--columns': itemsPerRow } as CSSProperties}>
      {rows.map((row) => (
        <article
          key={row.rowId}
          data-row-id={row.rowId}
          className={
            'folder-card ' +
            (highlight === row.rowId ? 'selected ' : '') +
            (marked.includes(row.rowId) ? 'marked' : '')
          }
          tabIndex={0}
          {...gestures(row.rowId)}
        >
          <KindBadge row={row} show={() => showPanelFor(row.rowId)} />
          <Card
            project={project}
            row={row}
            open={() => void act({ action: 'open', rowId: row.rowId })}
          />
          {(row.error || !row.record || row.readonly) && (
            <small className="folder-state">
              {row.error ? tr('需要處理') : row.readonly ? tr('受保護') : tr('尚未建立資料')}
            </small>
          )}
        </article>
      ))}
    </div>
  )
}
