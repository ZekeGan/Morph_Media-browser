import { Button, Group, Menu, Stack, Text } from '@mantine/core'
import type { ExplorerRequest, ExplorerResponse } from '../../shared/explorer'
import type { Asset, Cell, FolderRow, Request, Response } from '../../shared/model'
import { t as tr } from '../i18n'
import { HelpTip } from '../common/HelpTip'
import { Icon } from '../common/icons'
import { ImageUrlImport } from '../metadata/ImageUrlImport'

type Act = (request: Request) => Promise<Response | undefined>
type Run = (request: ExplorerRequest) => Promise<ExplorerResponse | undefined>

// The folder settings' Images tab: a picture for each image component, the game cover, and the saved images.
export function FolderImages({
  row,
  assets,
  imageCells,
  isGame,
  disabled,
  locked,
  act,
  run,
}: {
  row: FolderRow
  assets: Asset[]
  imageCells: Cell[]
  isGame: boolean
  disabled: boolean
  // Unsaved field edits block image changes, which would write the same record.
  locked: boolean
  act: Act
  run: Run
}) {
  const details = row.record?.details
  // Confirm first, naming every place that shows the picture; the file and all references go in one write.
  const deleteImage = (assetId: string, name: string) => {
    const used = [
      ...imageCells.flatMap((cell, index) =>
        details?.cellImages?.[cell.attributeId ?? cell.cellId] === assetId
          ? [tr('圖片') + (index + 1)]
          : []
      ),
      ...(details?.bannerAssetId === assetId ? [tr('遊戲封面')] : []),
    ]
    if (
      !window.confirm(
        tr('刪除已保存的圖片「{name}」？').replace('{name}', name) +
          (used.length
            ? '\n' +
              tr('正在使用：{places}，刪除後會一併清除。').replace('{places}', used.join('、'))
            : '') +
          '\n' +
          tr('只刪除此資料夾內保存的副本，原始檔案不受影響。')
      )
    )
      return
    void run({ action: 'deleteImage', rowId: row.rowId, revision: row.record!.revision, assetId })
  }
  // One thumbnail that opens a menu: pick a saved image, import a new one, or clear the choice.
  const imageChooser = ({
    label,
    current,
    onPick,
    onImport,
    onClear,
  }: {
    label: string
    current?: string
    onPick: (assetId: string) => void
    onImport: () => void
    onClear?: () => void
  }) => {
    const asset = assets.find((a) => a.assetId === current)
    return (
      <Menu position="bottom-start" withinPortal>
        <Menu.Target>
          <button
            type="button"
            className="image-thumb"
            aria-label={label}
            disabled={disabled || locked}
          >
            {asset ? (
              <img
                src={'media://asset/' + row.rowId + '/' + asset.assetId}
                alt={asset.originalName}
              />
            ) : (
              <span className="image-thumb-empty">
                <Icon name="plus" size={18} />
                {tr('選擇圖片')}
              </span>
            )}
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          {assets.map((a) => (
            <Menu.Item
              key={a.assetId}
              leftSection={
                <img
                  className="image-thumb-mini"
                  src={'media://asset/' + row.rowId + '/' + a.assetId}
                  alt=""
                />
              }
              rightSection={a.assetId === current ? <Icon name="check" size={14} /> : undefined}
              onClick={() => onPick(a.assetId)}
            >
              {a.originalName}
            </Menu.Item>
          ))}
          {!!assets.length && <Menu.Divider />}
          <Menu.Item onClick={onImport}>{tr('匯入新圖片…')}</Menu.Item>
          {asset && onClear && (
            <Menu.Item color="red" onClick={onClear}>
              {tr('清除指定')}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    )
  }
  return (
    <Stack>
      <div>
        <Group gap={4} wrap="nowrap">
          <Text fw={600}>{tr('選用圖片')}</Text>
          <HelpTip text={tr('每個圖片組件可分別選圖。沒有圖片的資料夾可以留空。')} />
        </Group>
      </div>
      {imageCells.map((cell, index) => {
        const assigned = details?.cellImages?.[cell.attributeId ?? cell.cellId],
          label = tr('圖片 ') + (index + 1) + tr(' 的來源')
        return (
          <section
            className="settings-section image-slot"
            key={cell.cellId}
            data-cell-id={cell.cellId}
          >
            <Text fw={600} mb="xs">
              {tr('圖片')}
              {index + 1}
            </Text>
            {imageChooser({
              label,
              current: assigned,
              onPick: (assetId) =>
                void run({
                  action: 'cellImage',
                  rowId: row.rowId,
                  revision: row.record!.revision,
                  cellId: cell.cellId,
                  assetId,
                }),
              onImport: () =>
                void act({
                  action: 'image',
                  rowId: row.rowId,
                  revision: row.record!.revision,
                  cellId: cell.cellId,
                }),
              onClear: () =>
                void run({
                  action: 'cellImage',
                  rowId: row.rowId,
                  revision: row.record!.revision,
                  cellId: cell.cellId,
                  assetId: null,
                }),
            })}
          </section>
        )
      })}
      {!imageCells.length && (
        <Text size="sm" c="dimmed">
          {tr('目前版面沒有圖片組件，無須為每個資料夾指定圖片。')}
        </Text>
      )}
      {isGame && (
        <section className="settings-section">
          <Text fw={600} mb="sm">
            {tr('遊戲封面')}
          </Text>
          {imageChooser({
            label: tr('封面圖片'),
            current: details?.bannerAssetId ?? assets[0]?.assetId,
            onPick: (assetId) =>
              void run({
                action: 'banner',
                rowId: row.rowId,
                revision: row.record!.revision,
                assetId,
              }),
            onImport: () =>
              void act({ action: 'image', rowId: row.rowId, revision: row.record!.revision }),
          })}
          <ImageUrlImport row={row} run={run} disabled={disabled || locked} />
        </section>
      )}
      {!!assets.length && (
        <section className="settings-section image-library">
          <Text fw={600} mb="xs">
            {tr('圖片庫')}（{assets.length}）
          </Text>
          <div className="images">
            {assets.map((a) => {
              const used = [
                ...imageCells
                  .map((cell, index) =>
                    details?.cellImages?.[cell.attributeId ?? cell.cellId] === a.assetId
                      ? tr('圖片') + (index + 1)
                      : ''
                  )
                  .filter(Boolean),
                ...(isGame && (details?.bannerAssetId ?? assets[0]?.assetId) === a.assetId
                  ? [tr('封面')]
                  : []),
              ]
              return (
                <figure key={a.assetId}>
                  <img src={'media://asset/' + row.rowId + '/' + a.assetId} alt={a.originalName} />
                  <figcaption>{a.originalName}</figcaption>
                  <small className="muted">
                    {used.length ? tr('用於：{0}', used.join('、')) : tr('未使用')}
                  </small>
                  <Button
                    variant="subtle"
                    color="red"
                    size="compact-xs"
                    aria-label={tr('刪除圖片 ') + a.originalName}
                    disabled={disabled || locked}
                    onClick={() => deleteImage(a.assetId, a.originalName)}
                  >
                    {tr('刪除圖片')}
                  </Button>
                </figure>
              )
            })}
          </div>
        </section>
      )}
    </Stack>
  )
}
