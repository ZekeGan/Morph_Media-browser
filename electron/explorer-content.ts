import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { safePath } from './files'
import { DATA_DIR } from '../shared/model'
import { type ContentResult, type MediaEntry } from '../shared/explorer'
import { hiddenFileNames } from './hidden'
import { imageTypes } from '../shared/images'
import { mediaNames, mediaTypes as types } from './media-files'
import type { Explorer } from './explorer'

export async function content(
  ex: Explorer,
  rowId: string,
  limit?: number,
  cursor?: string
): Promise<ContentResult> {
  if (
    (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 500)) ||
    (cursor !== undefined &&
      (typeof cursor !== 'string' || cursor.length > 150 || limit === undefined))
  )
    throw new Error('內容分批設定不合法')
  const row = await ex.library.readableRow(rowId),
    notices: string[] = [],
    entries: MediaEntry[] = []
  let offset = 0,
    token = '',
    names: string[],
    hidden = new Set<string>()
  for (const [id, session] of ex.contentPages)
    if (session.expires < Date.now()) ex.contentPages.delete(id)
  if (cursor) {
    const match = /^([\w-]+):(\d+)$/.exec(cursor),
      session = match && ex.contentPages.get(match[1])
    offset = Number(match?.[2])
    if (
      !session ||
      session.rowId !== rowId ||
      session.path !== row.path ||
      session.folderId !== row.record?.folderId ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset >= session.names.length
    )
      throw new Error('資料夾內容批次已失效，請重新開啟資料夾')
    hidden = session.hidden
    names = session.names
    token = match![1]
    session.expires = Date.now() + 120000
  } else {
    try {
      hidden = await hiddenFileNames(row.path)
    } catch (error) {
      notices.push('無法確認隱藏屬性：' + String(error))
    }
    names = (await fs.readdir(row.path, { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.name.toLowerCase() !== DATA_DIR &&
          !entry.isSymbolicLink() &&
          (entry.isFile() || entry.isDirectory())
      )
      .map((entry) => entry.name)
      .sort((a, b) => mediaNames.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0))
    if (limit && names.length > limit) {
      while (ex.contentPages.size >= 8) ex.contentPages.delete(ex.contentPages.keys().next().value!)
      token = randomUUID()
      ex.contentPages.set(token, {
        rowId,
        path: row.path,
        folderId: row.record?.folderId,
        names,
        hidden,
        expires: Date.now() + 120000,
      })
    }
  }
  const batch = names.slice(offset, limit ? offset + limit : undefined)
  for (let start = 0; start < batch.length; start += 16)
    await Promise.all(
      batch.slice(start, start + 16).map(async (name) => {
        const file = path.join(row.path, name)
        try {
          await safePath(row.path, file)
          const stat = await fs.stat(file)
          if (!stat.isFile() && !stat.isDirectory()) return
          const imageMime = imageTypes[path.extname(file).slice(1).toLowerCase()]
          const [kind, mime] = stat.isDirectory()
            ? (['folder', 'application/octet-stream'] as const)
            : imageMime
              ? (['image', imageMime] as const)
              : (types[path.extname(file).toLowerCase()] ?? ['other', 'application/octet-stream'])
          const id = createHash('sha256').update(name).digest('hex'),
            url = `media://file/${rowId}/${id}`
          ex.files.set(`${rowId}/${id}`, { rowId, name, file, mime })
          entries.push({
            id,
            name,
            kind,
            mime,
            ...(hidden.has(name) ? { hidden: true } : {}),
            size: stat.size,
            modified: stat.mtimeMs,
            url,
            ...(['image', 'video'].includes(kind)
              ? { thumb: `media://thumb/${rowId}/${id}?v=${stat.size}-${stat.mtimeMs}` }
              : {}),
          })
        } catch (e) {
          notices.push(`${name}: ${String(e)}`)
        }
      })
    )
  entries.sort(
    (a, b) => mediaNames.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  )
  const next = offset + batch.length,
    complete = next >= names.length
  if (complete && token) ex.contentPages.delete(token)
  for (const sub of complete ? (row.record?.details?.subtitles ?? []) : []) {
    const file = path.join(row.path, DATA_DIR, sub.relativePath)
    ex.files.set(`${rowId}/${sub.id}`, {
      rowId,
      name: sub.name,
      file,
      mime: 'text/vtt',
      portable: true,
    })
    entries.push({
      id: sub.id,
      name: sub.name,
      kind: 'subtitle',
      mime: 'text/vtt',
      size: 0,
      modified: 0,
      url: `media://file/${rowId}/${sub.id}`,
    })
  }
  return {
    entries,
    notices,
    ...(limit
      ? {
          total: names.length + (row.record?.details?.subtitles?.length ?? 0),
          ...(!complete ? { nextCursor: token + ':' + next } : {}),
        }
      : {}),
  }
}

export async function file(ex: Explorer, rowId: string, id: string) {
  const row = await ex.library.readableRow(rowId),
    entry = ex.files.get(`${rowId}/${id}`)
  if (!entry || entry.rowId !== rowId) throw new Error('媒體不存在或需重新載入')
  await safePath(row.path, entry.file)
  if (!entry.portable && path.dirname(entry.file) !== row.path)
    throw new Error('媒體超出直接內容範圍')
  if (
    entry.portable &&
    !row.record?.details?.subtitles?.some(
      (s) => path.join(row.path, DATA_DIR, s.relativePath) === entry.file
    )
  )
    throw new Error('字幕不屬於此記錄')
  const stat = await fs.stat(entry.file)
  if (!stat.isFile()) throw new Error('不是檔案')
  return { ...entry, stat, row }
}

// The n-th image file (by name) directly inside the folder, as a thumbnail; used by image cells that pick by position.
export async function nthImage(
  ex: Explorer,
  rowId: string,
  index: number,
  request: globalThis.Request
): Promise<globalThis.Response> {
  if (!Number.isInteger(index) || index < 1 || index > 999)
    return new globalThis.Response(null, { status: 404 })
  const row = await ex.library.readableRow(rowId)
  let hidden = new Set<string>()
  try {
    hidden = await hiddenFileNames(row.path)
  } catch {
    // Without the attribute check, hidden images are simply not excluded.
  }
  const names = (await fs.readdir(row.path, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.isSymbolicLink() &&
        !hidden.has(entry.name) &&
        imageTypes[path.extname(entry.name).slice(1).toLowerCase()]
    )
    .map((entry) => entry.name)
    .sort((a, b) => mediaNames.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0))
  const name = names[index - 1]
  if (!name) return new globalThis.Response(null, { status: 404 })
  const file = path.join(row.path, name),
    id = createHash('sha256').update(name).digest('hex')
  await safePath(row.path, file)
  ex.files.set(`${rowId}/${id}`, {
    rowId,
    name,
    file,
    mime: imageTypes[path.extname(name).slice(1).toLowerCase()],
  })
  return ex.stream(rowId, id, request, true)
}
