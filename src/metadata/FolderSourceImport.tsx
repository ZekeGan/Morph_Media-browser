import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Checkbox, Group, Stack, Text, TextInput } from '@mantine/core'
import { metadataSources, sourceForUrl } from '../../shared/sources'
import { keySite, type KeyStatus } from '../../shared/keys'
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
    [listOpen, setListOpen] = useState(false)
  // R-285: a site that needs the user's own key says so here, with a way to the settings, before anything is asked.
  const keyed = detected ? keySite(detected) : undefined,
    [keyStatus, setKeyStatus] = useState<Record<string, KeyStatus>>()
  useEffect(() => {
    if (!keyed) return
    let alive = true
    void window.explorer
      .request({ action: 'keyStatus' })
      .then((result) => alive && setKeyStatus(result.keys ?? {}))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [keyed?.id])
  // R-293: a store address (or FANZA without the key) is looked up through VNDB, and the badge says so.
  const viaVndb =
    (detected === 'vndb' && !/^https:\/\/vndb\.org\//.test(source.trim())) ||
    (detected === 'fanza' && !!keyStatus && !keyStatus.fanza?.set)
  const detectedName = viaVndb
    ? tr('經 VNDB')
    : metadataSources.find((item) => item.id === detected)?.name
  const missingKey =
    !!keyed && keyed.need === 'required' && !!keyStatus && !keyStatus[keyed.id]?.set
  const openKeys = () =>
    window.dispatchEvent(
      new CustomEvent('morph:open-settings', { detail: { tab: 'keys', site: keyed?.id } })
    )
  // R-359: also called with the related work's address (the same game on VNDB) to preview that source instead.
  const loadPreview = async (address = source.trim()) => {
    setError('')
    importer.setResult('')
    const provider = address === source.trim() ? detected : sourceForUrl(address)
    if (!provider) {
      setError(tr('無法辨識這個網址的來源'))
      return
    }
    const result = await run({
      action: 'metadataPreview',
      source: address,
      provider,
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
                help={tr('貼上作品頁的網址，會自動認出是哪個網站，例如 https://vndb.org/v97')}
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
          {/* R-329: the supported sites, by kind, only when asked for. */}
          <div>
            <Button
              variant="subtle"
              size="compact-xs"
              aria-expanded={listOpen}
              onClick={() => setListOpen((open) => !open)}
            >
              {listOpen ? tr('收合支援的網站') : tr('支援的網站')}
            </Button>
            {listOpen && (
              <dl className="source-site-list">
                {[...new Set(metadataSources.map((item) => item.group))].map((group) => (
                  <div key={group}>
                    <dt>{tr(group)}</dt>
                    <dd>
                      {metadataSources
                        .filter((item) => item.group === group)
                        .map((item) => item.name)
                        .join('、')}
                    </dd>
                  </div>
                ))}
                <div>
                  <dt>{tr('經 VNDB')}</dt>
                  <dd>
                    Getchu、{tr('批評空間')}、Melonbooks、{tr('虎之穴')}、FANZA
                  </dd>
                </div>
              </dl>
            )}
          </div>
          <Group justify="flex-end">
            <Button
              disabled={disabled || fieldDirty || !detected || missingKey}
              loading={busy}
              onClick={() => void loadPreview()}
            >
              {tr('取得預覽')}
            </Button>
          </Group>
        </Stack>
      </section>

      {keyed &&
        (missingKey || (keyed.need === 'optional' && keyStatus && !keyStatus[keyed.id]?.set)) && (
          <Alert color={missingKey ? 'orange' : 'gray'}>
            <Group justify="space-between" wrap="nowrap">
              <span>
                {missingKey
                  ? tr('{0} 需要你自己的金鑰才能查資料。', keyed.name)
                  : tr('{0} 可以加上你的金鑰：{1}', keyed.name, tr(keyed.purpose))}
              </span>
              <Button size="xs" variant="light" onClick={openKeys}>
                {tr('前往設定')}
              </Button>
            </Group>
          </Alert>
        )}
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
          {preview.related && (
            <Alert color="blue" mt="sm" className="source-related">
              <Group gap="xs" justify="space-between" wrap="nowrap">
                <Text size="sm">
                  {tr('VNDB 也有這部作品：{0}', preview.related.title || preview.related.url)}
                </Text>
                <Button
                  size="compact-xs"
                  variant="light"
                  disabled={disabled}
                  onClick={() => {
                    const url = preview.related!.url
                    setSource(url)
                    void loadPreview(url)
                  }}
                >
                  {tr('改看 VNDB 的資料')}
                </Button>
              </Group>
            </Alert>
          )}
          <Text size="sm" c="dimmed" my="sm">
            {preview.provider === 'steam'
              ? tr('發售日保留 Steam 商店顯示的日期，不推定為作品首次發行日。')
              : tr('日期依來源保留，不推定為作品首次發行日。')}
            {/* Attribution the sources' terms ask for. */}
            {preview.provider === 'tmdb' &&
              ' ' + tr('本產品使用 TMDB API，但未經 TMDB 認可或認證。')}
            {preview.provider === 'fanza' && ' Powered by FANZA Webサービス'}
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
                      <td>{current ? <LongValue text={current} /> : '—'}</td>
                      <td>{same ? tr('相同') : <LongValue text={next} />}</td>
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

// R-332: a long value (a synopsis) shows a few lines and opens on a click.
function LongValue({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  if (text.length <= 160) return <>{text}</>
  return (
    <div className={'source-long' + (open ? ' open' : '')}>
      <span>{text}</span>
      <Button variant="subtle" size="compact-xs" onClick={() => setOpen(!open)}>
        {open ? tr('收合') : tr('展開全文')}
      </Button>
    </div>
  )
}
