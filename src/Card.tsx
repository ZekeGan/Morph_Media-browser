import { t as tr, useLocale, currentLocale } from './i18n'
import { Badge, Button, Group, Progress, Rating } from '@mantine/core'
import { TagList } from './TagList'
import { type Cell, type FolderRow, type Project } from '../shared/model'
import { cellField, cellVisible, copyableValue, numericDisplay } from '../shared/cells'
import { describeError } from './errors'
import { launchChoice } from '../shared/explorer'
import { rowCells } from '../shared/layouts'
import { useEffect, useState } from 'react'
import { httpUrl } from '../shared/fields'
import { useFolderStats } from './folderStats'
import { cellColors } from './themes/cellStyle'
import './cells.css'
type CellProps = {
  cell: Cell
  row?: FolderRow
  open?: () => void
  preview?: boolean
  project?: Project
}
// Covers come tall and wide; 'blur' shows all of the art and fills the rest with a blurred copy instead of bars or a crop.
function CellPicture({
  src,
  alt,
  fit,
}: {
  src: string
  alt: string
  fit: 'contain' | 'cover' | 'blur'
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (failed) return <span className="cell-image-placeholder">{tr('沒有圖片')}</span>
  if (fit !== 'blur')
    return (
      <img
        className="cell-image"
        style={{ objectFit: fit }}
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
      />
    )
  return (
    <span className="cell-image cell-blur">
      <img className="cell-blur-bg" src={src} alt="" aria-hidden="true" />
      <img className="cell-blur-fg" src={src} alt={alt} onError={() => setFailed(true)} />
    </span>
  )
}
export function CellContent(props: CellProps) {
  useLocale()
  const { cell, row, preview, project } = props,
    [copied, setCopied] = useState<string>(),
    [copyError, setCopyError] = useState('')
  if (!cellVisible(cell, row))
    return preview ? <span className="cell-condition-hidden">{tr('條件未符合')}</span> : null
  const shown = cellField(cell, row),
    copy = copyableValue(shown.value)
  return (
    <>
      {cell.scroll ? (
        <div className="cell-scroll-body" tabIndex={0} role="group" aria-label={tr('可捲動內容')}>
          <CellValue {...props} />
        </div>
      ) : (
        <CellValue {...props} />
      )}
      {cell.copyValue && (
        <span className="cell-copy">
          <button
            type="button"
            title={tr('複製欄位值')}
            aria-label={tr(
              '複製 {0}',
              project?.fieldBindings.find((field) => field.attributeId === shown.attributeId)
                ?.alias ?? tr('欄位')
            )}
            disabled={preview || copy === undefined}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={async (event) => {
              event.stopPropagation()
              if (copy === undefined || !row || !shown.attributeId) return
              try {
                await window.media.request({
                  action: 'copyFieldValue',
                  rowId: row.rowId,
                  attributeId: shown.attributeId,
                })
                setCopied(copy)
                setCopyError('')
              } catch (reason) {
                setCopied(undefined)
                setCopyError(String(reason))
              }
            }}
          >
            {copy !== undefined && copied === copy ? tr('已複製') : tr('複製')}
          </button>
          {copyError && <small role="alert">{copyError}</small>}
        </span>
      )}
    </>
  )
}
function CellValue({ cell, row, open, preview = false, project }: CellProps) {
  useLocale()
  const stats = useFolderStats(row?.rowId),
    [linkError, setLinkError] = useState('')
  if (cell.kind === 'static-text')
    return <span style={{ whiteSpace: 'pre-wrap' }}>{cell.text ?? ''}</span>
  if (cell.kind === 'spacer')
    return preview ? <span className="spacer-preview" aria-label={tr('空白間距')} /> : null
  if (cell.kind === 'system-info') {
    const category = {
      manga: tr('漫畫'),
      album: tr('相簿'),
      video: tr('影片'),
      game: tr('遊戲'),
      other: tr('其他'),
    }
    return (
      <span
        title={
          stats
            ? new Date(stats.updated).toLocaleString(currentLocale())
            : tr('開啟資料夾內容後更新')
        }
      >
        {cell.systemInfo === 'files'
          ? stats
            ? tr('{0} 個檔案', stats.files)
            : tr('尚未計算')
          : cell.systemInfo === 'size'
            ? stats
              ? `${(stats.size / 1024 / 1024).toLocaleString(currentLocale(), { maximumFractionDigits: 2 })} MB`
              : tr('尚未計算')
            : (category[project?.mediaCategory as keyof typeof category] ?? tr('其他'))}
      </span>
    )
  }

  if (cell.kind === 'open-folder')
    return (
      <Button
        size="compact-sm"
        variant="light"
        style={{ color: 'inherit' }}
        disabled={!row || preview}
        onClick={(e) => {
          e.stopPropagation()
          open?.()
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {tr('開啟資料夾')}
      </Button>
    )
  if (cell.kind === 'game-launch') {
    // The same launch the game page offers: the project's default launch action and the folder's bound target.
    const template = launchChoice(
        project ?? {},
        cell.actionId,
        cell.fallbackActionIds,
        row?.record?.details?.targets
      ),
      target = template ? row?.record?.details?.targets?.[template.id] : undefined,
      ready = !!template && !!target && target.kind === template.kind
    return (
      <span className="cell-launch">
        <Button
          size="compact-sm"
          color={template?.color}
          disabled={!row || preview || !ready}
          title={
            !template
              ? tr('尚無可用的啟動動作，請先在遊戲操作新增')
              : ready
                ? target.path
                : tr('尚未綁定')
          }
          onClick={async (e) => {
            e.stopPropagation()
            if (!row || !template) return
            if (
              ['exe', 'file-app', 'shortcut'].includes(template.kind) &&
              !window.confirm(
                tr(
                  '啟動「{0}」？',
                  template.id === 'default-launch-game' ? tr(template.label) : template.label
                )
              )
            )
              return
            try {
              await window.explorer.request({
                action: 'runTarget',
                rowId: row.rowId,
                templateId: template.id,
              })
              setLinkError('')
            } catch (reason) {
              setLinkError(describeError(reason).message)
            }
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {template && template.id !== 'default-launch-game' ? template.label : tr('啟動遊戲')}
        </Button>
        {linkError && <small role="alert">{linkError}</small>}
      </span>
    )
  }
  if (cell.kind === 'divider') return <hr className="cell-divider" />
  if (cell.kind === 'game-cover') {
    const asset =
      row?.record?.assets.find((a) => a.assetId === row.record?.details?.bannerAssetId) ??
      row?.record?.assets[0]
    return asset ? (
      <CellPicture
        src={`media://asset/${row!.rowId}/${asset.assetId}`}
        alt={asset.originalName}
        fit={cell.imageFit ?? 'blur'}
      />
    ) : (
      <span className="cell-image-placeholder">{tr('尚無封面')}</span>
    )
  }
  if (cell.kind === 'image') {
    const selected = row?.record?.details?.cellImages?.[cell.attributeId ?? cell.cellId],
      asset = selected
        ? row?.record?.assets.find((a) => a.assetId === selected)
        : cell.attributeId
          ? undefined
          : (row?.record?.assets.find((a) => a.assetId === row.record?.details?.bannerAssetId) ??
            row?.record?.assets[0])
    return asset ? (
      <CellPicture
        src={`media://asset/${row!.rowId}/${asset.assetId}`}
        alt={asset.originalName}
        fit={cell.imageFit ?? 'contain'}
      />
    ) : row && cell.imageIndex ? (
      // No picture chosen for this folder: its n-th image file, when it has one.
      <CellPicture
        src={`media://nth/${row.rowId}/${cell.imageIndex}`}
        alt={tr('資料夾內第 {0} 張圖片', cell.imageIndex)}
        fit={cell.imageFit ?? 'contain'}
      />
    ) : preview ? (
      <span>{tr('選用圖片 · 可留空')}</span>
    ) : null
  }
  const value =
    cell.kind === 'name' ? row?.name : cell.kind === 'path' ? row?.path : cellField(cell, row).value
  const label =
    typeof value === 'string' ? value : value == null ? '' : tr('⚠ 型別不符：{0}', String(value))
  if (cell.kind === 'field-tags')
    return Array.isArray(value) ? (
      <TagList
        tags={value}
        fit={!cell.scroll}
        colors={cell.tagColors}
        prefix={cell.tagPrefix !== false}
      />
    ) : (
      <span>{value == null ? '' : tr('⚠ 型別不符')}</span>
    )
  if (cell.kind === 'field-number') {
    const display = numericDisplay(
      value,
      cell.maximum ?? (cell.presentation === 'rating' ? 5 : 100)
    )
    if (!display) return <span>{value == null ? tr('未填') : tr('⚠ 型別不符')}</span>
    const format = (number: number) =>
      number.toLocaleString(
        currentLocale(),
        cell.decimals === undefined
          ? undefined
          : { minimumFractionDigits: cell.decimals, maximumFractionDigits: cell.decimals }
      )
    const label = `${format(display.value)} / ${format(display.maximum)}`
    if (cell.presentation === 'rating')
      return (
        <span className="cell-rating" title={label}>
          <Rating
            value={display.percent / 20}
            fractions={2}
            readOnly
            aria-label={label}
            size="xs"
          />
          <span>{label}</span>
        </span>
      )
    if (cell.presentation === 'progress')
      return (
        <span className="cell-progress">
          <Progress value={display.percent} aria-label={label} />
          <span>{label}</span>
        </span>
      )
    return (
      <span>
        {cell.unit && cell.unitPosition === 'prefix' ? cell.unit : ''}
        {format(display.value)}
        {cell.unit && cell.unitPosition !== 'prefix' ? cell.unit : ''}
      </span>
    )
  }
  if (cell.kind === 'field-date')
    return (
      <span>
        {typeof value === 'string'
          ? value.replace('T', ' ')
          : value == null
            ? ''
            : tr('⚠ 型別不符')}
      </span>
    )
  if (cell.kind === 'field-boolean') {
    const label =
      value === true
        ? tr('是')
        : value === false
          ? tr('否')
          : value == null
            ? tr('未填')
            : tr('⚠ 型別不符')
    return cell.presentation === 'badge' && typeof value === 'boolean' ? (
      <Badge color={value ? 'teal' : 'gray'} variant="light">
        {label}
      </Badge>
    ) : (
      <span>{label}</span>
    )
  }
  if (cell.kind === 'field-date-only' || cell.kind === 'field-enum') {
    const label = typeof value === 'string' ? value : value == null ? tr('未填') : tr('⚠ 型別不符')
    return cell.presentation === 'badge' && typeof value === 'string' && value.length ? (
      <Badge
        color={
          project?.fieldBindings.find(
            (field) => field.attributeId === cellField(cell, row).attributeId
          )?.optionColors?.[value] ?? 'gray'
        }
        variant="light"
        title={label}
      >
        {label}
      </Badge>
    ) : (
      <span>{label}</span>
    )
  }
  if (cell.kind === 'field-url')
    return httpUrl(value) ? (
      <span>
        <button
          className="cell-link"
          disabled={preview}
          onKeyDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={async (event) => {
            event.stopPropagation()
            try {
              await window.explorer.request({ action: 'openExternal', url: value })
              setLinkError('')
            } catch (reason) {
              setLinkError(String(reason))
            }
          }}
        >
          {cell.text || value}
        </button>
        {linkError && <small role="alert">{linkError}</small>}
      </span>
    ) : (
      <span>{value == null ? tr('未填') : tr('⚠ 型別不符')}</span>
    )
  return (
    <span
      className={[cell.kind === 'name' ? 'cell-name' : '', cell.wrap ? 'cell-wrap' : '']
        .filter(Boolean)
        .join(' ')}
      title={label}
    >
      {label || (preview ? tr('（此筆沒有值）') : '\u00a0')}
    </span>
  )
}
export function Card({
  project,
  row,
  open,
}: {
  project: Project
  row: FolderRow
  open: () => void
}) {
  useLocale()

  return (
    <div className="card-grid">
      {rowCells(project, row).map((cell) => (
        <div
          key={cell.cellId}
          className="card-cell"
          style={{
            gridColumn: `${cell.grid.x + 1} / span ${cell.grid.w}`,
            gridRow: `${cell.grid.y + 1} / span ${cell.grid.h}`,
            ...cellColors(cell),
          }}
        >
          <CellContent cell={cell} row={row} project={project} open={open} />
        </div>
      ))}
    </div>
  )
}
