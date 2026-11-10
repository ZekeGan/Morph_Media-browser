import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { ActionIcon, Tooltip } from '@mantine/core'
import type { FolderRow, Project, Request, Response } from '../../shared/model'
import { BoundaryFlag } from '../game/BoundaryFlag'
import { Card } from '../cells/Card'
import { t as tr } from '../i18n'
import { Icon } from '../common/icons'

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
  panelOpen,
  showPanelFor,
  act,
}: {
  rows: FolderRow[]
  project: Project
  itemsPerRow: number
  highlight?: string
  marked: string[]
  gestures: Gestures
  panelOpen: boolean
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
          {!panelOpen && (
            <Tooltip label={tr('顯示資料夾內容')}>
              <ActionIcon
                className="card-info"
                variant="default"
                size="sm"
                aria-label={tr('顯示資料夾內容')}
                onClick={(e) => {
                  e.stopPropagation()
                  showPanelFor(row.rowId)
                }}
              >
                <Icon name="panel-right" size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          <Card
            project={project}
            row={row}
            open={() => void act({ action: 'open', rowId: row.rowId })}
          />
          {(row.error || !row.record || row.readonly || row.boundary) && (
            <small className="folder-state">
              {row.error ? (
                tr('需要處理')
              ) : row.readonly ? (
                tr('受保護')
              ) : !row.record ? (
                tr('尚未建立資料')
              ) : (
                <BoundaryFlag />
              )}
            </small>
          )}
        </article>
      ))}
    </div>
  )
}
