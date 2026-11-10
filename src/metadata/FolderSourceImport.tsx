import { useState } from 'react'
import { Alert, Badge, Button, Checkbox, Group, Stack, Text, TextInput } from '@mantine/core'
import { metadataSources, sourceForUrl } from '../../shared/sources'
import type { ExplorerRequest, ExplorerResponse, MetadataPreview } from '../../shared/explorer'
import type { FolderRow } from '../../shared/model'
import { t as tr } from '../i18n'
import { HelpLabel, HelpTip } from '../common/HelpTip'
import { Icon } from '../common/icons'
import { importedFieldLabels } from '../editor/importedFieldLabels'

type Run = (request: ExplorerRequest) => Promise<ExplorerResponse | undefined>

// The import draft lives in the folder panel, so switching tabs keeps the pasted address and the preview.
export function useSourceImport() {
  const [source, setSource] = useState(''),
    [preview, setPreview] = useState<MetadataPreview>(),
    [keys, setKeys] = useState<string[]>([]),
    [cover, setCover] = useState(true),
    [result, setResult] = useState(''),
    [replace, setReplace] = useState(false)
  return {
    source,
    setSource,
    preview,
    setPreview,
    keys,
    setKeys,
    cover,
    setCover,
    result,
    setResult,
    replace,
    setReplace,
  }
}
export type SourceImport = ReturnType<typeof useSourceImport>

// "Fill in from a website": paste an address, preview what the site has, pick the fields to import.
export function FolderSourceImport({
  importer,
  row,
  busy,
  disabled,
  fieldDirty,
  run,
  setError,
}: {
  importer: SourceImport
  row: FolderRow
  busy: boolean
  disabled: boolean
  fieldDirty: boolean
  run: Run
  setError: (error: string) => void
}) {
  const sourceLabels = importedFieldLabels()
  const { source, setSource, preview, setPreview, keys, setKeys, cover, setCover } = importer
  // The source is recognised from the pasted address alone; the preview button only works for a known site.
  const detected = sourceForUrl(source.trim()),
    detectedName = metadataSources.find((item) => item.id === detected)?.name
  const loadPreview = async () => {
    setError('')
    importer.setResult('')
    if (!detected) {
      setError(tr('無法辨識這個網址的來源'))
      return
    }
    const result = await run({
      action: 'metadataPreview',
      source: source.trim(),
      provider: detected,
    })
    if (result?.preview) {
      importer.setReplace(false)
      setPreview(result.preview)
      setKeys(result.preview.values.filter((v) => v.key !== 'COVER_STATUS').map((v) => v.key))
    }
  }
  return (
    <Stack gap="sm" className="folder-source">
      <div>
        <Group gap={4} wrap="nowrap">
          <Text fw={600}>{tr('從網站補充資訊')}</Text>
          <HelpTip text={tr('選來源、貼連結、預覽後再決定要匯入的欄位。')} />
        </Group>
      </div>
      <section className="settings-section">
        <Stack gap="sm">
          <TextInput
            id="folder-source-url"
            disabled={busy}
            label={
              <HelpLabel
                label={tr('作品網址或 ID')}
                help={
                  tr('直接貼上網址，自動辨識來源。支援：') +
                  metadataSources.map((item) => item.name).join('、')
                }
              />
            }
            placeholder={tr('貼上作品網址（Steam 可直接輸入 App ID）')}
            error={source.trim() && !detected ? tr('無法辨識這個網址的來源') : undefined}
            rightSectionWidth={detectedName ? 96 : undefined}
            rightSection={
              detectedName ? (
                <Badge color="teal" variant="light" leftSection={<Icon name="check" size={10} />}>
                  {detectedName}
                </Badge>
              ) : undefined
            }
            value={source}
            onChange={(event) => {
              setSource(event.currentTarget.value)
              setPreview(undefined)
            }}
          />
          <Group justify="flex-end">
            <Button
              disabled={disabled || fieldDirty || !detected}
              loading={busy}
              onClick={() => void loadPreview()}
            >
              {tr('取得預覽')}
            </Button>
          </Group>
        </Stack>
      </section>

      {importer.result && <Alert color="teal">{importer.result}</Alert>}
      {preview && (
        <Checkbox
          label={
            <HelpLabel
              label={tr('覆寫已填來源欄位')}
              help={tr('預設只填空值；人工欄位保持原樣。')}
            />
          }
          checked={importer.replace}
          onChange={(event) => importer.setReplace(event.currentTarget.checked)}
        />
      )}
      {preview && (
        <section className="settings-section source-preview">
          <Group align="start">
            {preview.image && (
              <img className="metadata-cover" src={preview.image} alt={tr('候選封面')} />
            )}
            <div>
              <Text fw={600}>{preview.title}</Text>
              <Text size="xs" c="dimmed" className="path">
                {preview.source}
              </Text>
            </div>
          </Group>
          <Text size="sm" c="dimmed" my="sm">
            {preview.provider === 'steam'
              ? tr('發售日保留 Steam 商店顯示的日期，不推定為作品首次發行日。')
              : tr('日期依來源保留，不推定為作品首次發行日。')}
            {tr('預設只填空值；人工欄位保持原樣。')}
          </Text>
          <table className="source-diff">
            <thead>
              <tr>
                <th aria-label={tr('匯入')} />
                <th>{tr('欄位')}</th>
                <th>{tr('現值')}</th>
                <th>{tr('新值')}</th>
              </tr>
            </thead>
            <tbody>
              {preview.values
                .filter((v) => v.key !== 'COVER_STATUS')
                .map((v) => {
                  const next = Array.isArray(v.value) ? v.value.join('、') : String(v.value),
                    existing = row.record?.attributes.find(
                      (attribute) =>
                        attribute.attributeId ===
                        (preview.provider ?? 'eh') + '-' + v.key.toLowerCase()
                    ),
                    current = existing
                      ? Array.isArray(existing.value)
                        ? existing.value.join('、')
                        : String(existing.value)
                      : '',
                    same = !!existing && current === next
                  return (
                    <tr key={v.key} className={same ? 'same' : undefined}>
                      <td>
                        <Checkbox
                          aria-label={sourceLabels[v.key] ?? v.key}
                          checked={keys.includes(v.key)}
                          onChange={(e) =>
                            setKeys((list) =>
                              e.currentTarget.checked
                                ? [...list, v.key]
                                : list.filter((k) => k !== v.key)
                            )
                          }
                        />
                      </td>
                      <th scope="row">{sourceLabels[v.key] ?? v.key}</th>
                      <td>{current || '—'}</td>
                      <td>{same ? tr('相同') : next}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
          {preview.values.find((v) => v.key === 'COVER_STATUS') && (
            <Alert color="orange" mt="sm">
              {String(preview.values.find((v) => v.key === 'COVER_STATUS')!.value)}
            </Alert>
          )}
          {preview.image && (
            <Checkbox
              mt="md"
              label={tr('同時保存封面圖片')}
              checked={cover}
              onChange={(e) => setCover(e.currentTarget.checked)}
            />
          )}
          <Group justify="flex-end" mt="md" className="settings-savebar">
            <Button variant="default" disabled={busy} onClick={() => setPreview(undefined)}>
              {tr('取消預覽')}
            </Button>
            <Button
              disabled={disabled || fieldDirty || (!keys.length && !(preview.image && cover))}
              onClick={async () => {
                if (
                  await run({
                    action: 'metadataApply',
                    rowId: row.rowId,
                    revision: row.record!.revision,
                    token: preview.token,
                    keys,
                    image: !!preview.image && cover,
                    mode: importer.replace ? 'replace' : 'fill',
                  })
                ) {
                  importer.setResult(tr('已匯入選定資料，可至「資料」查看。'))
                  setPreview(undefined)
                }
              }}
            >
              {tr('匯入選定資料')}
            </Button>
          </Group>
        </section>
      )}
    </Stack>
  )
}
