import { useRef, useState } from 'react'
import { Button, Group, Text, TextInput } from '@mantine/core'
import type { ExplorerRequest, ExplorerResponse } from '../../shared/explorer'
import type { FolderRow } from '../../shared/model'
import { t as tr, useLocale } from '../i18n'

type Preview = NonNullable<ExplorerResponse['imagePreview']>

// Cover import from a user-supplied image URL: main downloads and validates, the user previews and confirms.
export function ImageUrlImport({
  row,
  run,
  disabled,
}: {
  row: FolderRow
  run: (request: ExplorerRequest) => Promise<ExplorerResponse | undefined>
  disabled: boolean
}) {
  useLocale()
  const [url, setUrl] = useState(''),
    [preview, setPreview] = useState<Preview>(),
    [busy, setBusy] = useState<'preview' | 'save'>(),
    [error, setError] = useState('')
  const latest = useRef(0)
  const load = async () => {
    const token = ++latest.current
    setBusy('preview')
    setError('')
    setPreview(undefined)
    const result = await run({ action: 'imageUrlPreview', url: url.trim() })
    if (token !== latest.current) return
    setBusy(undefined)
    if (result?.imagePreview) setPreview(result.imagePreview)
    else setError(tr('無法取得圖片，原封面保持不變'))
  }
  const cancel = () => {
    latest.current++
    setBusy(undefined)
    setPreview(undefined)
    setError('')
  }
  const apply = async () => {
    if (!preview || !row.record) return
    const token = ++latest.current
    setBusy('save')
    const result = await run({
      action: 'imageUrlApply',
      rowId: row.rowId,
      revision: row.record.revision,
      token: preview.token,
      cover: true,
    })
    if (token !== latest.current) return
    setBusy(undefined)
    if (result?.snapshot) {
      setPreview(undefined)
      setUrl('')
    } else setError(tr('封面保存失敗，原封面保持不變'))
  }
  return (
    <div className="image-url-import">
      <TextInput
        label={tr('圖片網址')}
        placeholder="https://"
        size="xs"
        mt="sm"
        value={url}
        disabled={disabled || busy === 'save'}
        onChange={(event) => {
          latest.current++
          setBusy(undefined)
          setUrl(event.currentTarget.value)
          setPreview(undefined)
          setError('')
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && url.trim() && !busy) void load()
        }}
      />
      <Group gap="xs" mt="xs">
        <Button
          variant="default"
          size="xs"
          loading={busy === 'preview'}
          disabled={disabled || !url.trim() || busy === 'save'}
          onClick={() => void load()}
        >
          {tr('取得預覽')}
        </Button>
        {(preview || busy === 'preview') && (
          <Button variant="subtle" size="xs" disabled={busy === 'save'} onClick={cancel}>
            {tr('取消')}
          </Button>
        )}
      </Group>
      {error && (
        <Text size="xs" c="red" mt="xs" role="alert">
          {error}
        </Text>
      )}
      {preview && (
        <figure className="image-url-preview">
          <img src={preview.image} alt={tr('圖片預覽')} />
          <figcaption>
            {preview.name} · {(preview.size / 1024).toFixed(1)} KB
          </figcaption>
          <Button
            size="xs"
            loading={busy === 'save'}
            disabled={disabled}
            onClick={() => void apply()}
          >
            {tr('設為封面')}
          </Button>
        </figure>
      )}
    </div>
  )
}
