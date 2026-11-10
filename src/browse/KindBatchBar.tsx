import { t as tr } from '../i18n'
import { ActionIcon, Select, Text, Tooltip } from '@mantine/core'
import { Icon } from '../common/icons'
import { folderKinds, type FolderKind } from '../../shared/kind'
import type { FolderRow } from '../../shared/model'
import type { ExplorerRequest, ExplorerResponse } from '../../shared/explorer'

// Shown while folders are marked in the list: sets their type in one step (folders without a record or
// protected ones are left out).
export function KindBatchBar({
  rows,
  busy,
  run,
  clear,
}: {
  rows: FolderRow[]
  busy: boolean
  run: (request: ExplorerRequest) => Promise<ExplorerResponse | undefined>
  clear: () => void
}) {
  const writable = rows.filter((row) => row.record && !row.readonly && !row.stopped && !row.error),
    labels: Record<FolderKind, string> = {
      game: tr('遊戲'),
      book: tr('書籍／漫畫'),
      media: tr('影音'),
      general: tr('一般'),
    }
  return (
    <div className="kind-batch-bar" role="region" aria-label={tr('批次指定資料夾類型')}>
      <Text size="sm">
        {tr('已選 {0} 個資料夾', rows.length)}
        {writable.length < rows.length &&
          ' · ' + tr('{0} 個無法修改，將略過', rows.length - writable.length)}
      </Text>
      <Select
        size="xs"
        aria-label={tr('指定類型')}
        placeholder={tr('指定類型…')}
        value={null}
        disabled={busy || !writable.length}
        data={[
          { value: 'auto', label: tr('自動偵測') },
          ...folderKinds.map((kind) => ({ value: kind, label: labels[kind] })),
        ]}
        onChange={(value) => {
          if (!value) return
          void run({
            action: 'folderKinds',
            rows: writable.map((row) => ({ rowId: row.rowId, revision: row.record!.revision })),
            kind: value === 'auto' ? null : (value as FolderKind),
          }).then((result) => result && clear())
        }}
      />
      <Tooltip label={tr('取消選取')}>
        <ActionIcon aria-label={tr('取消選取')} variant="subtle" onClick={clear}>
          <Icon name="close" />
        </ActionIcon>
      </Tooltip>
    </div>
  )
}
