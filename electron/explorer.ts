import { archiveIndex, archiveImage, type ArchiveIndex } from './archive'
import { httpUrl, validFieldValue } from '../shared/fields'
import { sourceForUrl, type MetadataSourceId } from '../shared/sources'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import type { Library } from './library'
import {
  atomicJson,
  exists,
  folderFile,
  readFolder,
  relPath,
  safePath,
  saveFolder,
  within,
} from './files'
import { DATA_DIR, validateDetails, type Attribute, type FolderRecord } from '../shared/model'
import {
  gameActionTemplates,
  newDetails,
  type ContentResult,
  type ExplorerRequest,
  type ExplorerResponse,
  type MediaEntry,
  type MetadataPreview,
  type OverviewResult,
} from '../shared/explorer'
import { SearchIndex } from './search-index'
import { completionNotice } from '../shared/notifications'
import { projectImageCells } from '../shared/layouts'
import { metadata } from './metadata'
import { fetchImageUrl, type ImageUrlOptions, type RemoteImage } from './image-url'
import { parseSubtitles } from '../shared/subtitles'
import { hiddenFileNames } from './hidden'
import { imageTypes } from '../shared/images'
import { identifyImage } from '../shared/images'
import { openAsBlob } from 'node:fs'
import { parseBlob, selectCover } from 'music-metadata'

const types: Record<string, [MediaEntry['kind'], string]> = {
  '.mp3': ['audio', 'audio/mpeg'],
  '.m4a': ['audio', 'audio/mp4'],
  '.aac': ['audio', 'audio/aac'],
  '.wav': ['audio', 'audio/wav'],
  '.flac': ['audio', 'audio/flac'],
  '.ogg': ['audio', 'audio/ogg'],
  '.opus': ['audio', 'audio/ogg'],
  '.weba': ['audio', 'audio/webm'],
  '.pdf': ['pdf', 'application/pdf'],
  '.zip': ['archive', 'application/zip'],
  '.cbz': ['archive', 'application/zip'],
  '.png': ['image', 'image/png'],
  '.jpg': ['image', 'image/jpeg'],
  '.jpeg': ['image', 'image/jpeg'],
  '.gif': ['image', 'image/gif'],
  '.webp': ['image', 'image/webp'],
  '.mp4': ['video', 'video/mp4'],
  '.webm': ['video', 'video/webm'],
  '.mkv': ['video', 'video/x-matroska'],
  '.avi': ['video', 'video/x-msvideo'],
  '.mov': ['video', 'video/quicktime'],
  '.srt': ['subtitle', 'text/plain'],
  '.vtt': ['subtitle', 'text/vtt'],
}
const key = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,100}$/.test(v)
const mediaNames = new Intl.Collator('zh-Hant', { numeric: true })
export interface DesktopOperations {
  external?(url: string): Promise<void>
  choose(
    kind: 'exe' | 'folder' | 'file' | 'subtitle',
    initialPath?: string
  ): Promise<string | undefined>
  open(file: string): Promise<void>
  launch(file: string, args: string[]): Promise<void>
  thumbnail(file: string, mime?: string, url?: string): Promise<Buffer>
}
export class Explorer {
  readonly index: SearchIndex
  private archives = new Map<string, { file: string; index: ArchiveIndex }>()
  private overviewPages = new Map<
    string,
    {
      rootId: string
      folderId: string
      scope: string
      folders: string[]
      folder: number
      contentCursor?: string
      expires: number
    }
  >()
  private files = new Map<
    string,
    { rowId: string; name: string; file: string; mime: string; portable?: boolean }
  >()
  private externals = new Map<string, { rowId: string; file: string }>()
  private imagePreviews = new Map<string, RemoteImage & { expires: number }>()
  imageUrlOptions: ImageUrlOptions = {}
  private previews = new Map<
    string,
    {
      preview: MetadataPreview
      cover?: { bytes: Buffer; mime: string; ext: string }
      expires: number
    }
  >()
  private thumbnailReads = 0
  private audioCoverTail: Promise<unknown> = Promise.resolve()
  private thumbnailJobs = new Map<string, { promise: Promise<Buffer>; signals: AbortSignal[] }>()
  private thumbnailTail: Promise<unknown> = Promise.resolve()
  private thumbnailTrim?: Promise<void>
  private thumbnailTrimAt = 0
  private contentPages = new Map<
    string,
    {
      rowId: string
      path: string
      folderId?: string
      names: string[]
      hidden: Set<string>
      expires: number
    }
  >()
  constructor(
    private library: Library,
    private root: string,
    private desktop: DesktopOperations
  ) {
    this.index = new SearchIndex(path.join(root, 'search.sqlite'))
    this.index.sync(library.snapshot())
  }
  private async record(rowId: string, revision: number) {
    const row = await this.library.checkedRow(rowId, true),
      record = await readFolder(row.path)
    if (record.revision !== revision) throw new Error('版本衝突；草稿保留，重新載入後比較')
    return { row, record }
  }
  private async details(
    rowId: string,
    revision: number,
    mutate: (details: NonNullable<FolderRecord['details']>, record: FolderRecord) => void
  ) {
    const { row, record } = await this.record(rowId, revision)
    record.details ??= newDetails()
    mutate(record.details, record)
    validateDetails(record.details)
    await saveFolder(row.path, record, revision)
    return this.library.refreshRecord(rowId)
  }
  private async targetPath(root: string, file: string, kind: 'exe' | 'folder' | 'file') {
    if (!path.isAbsolute(file) || file.includes('\0')) throw new Error('目標路徑不合法')
    await safePath(path.parse(file).root, file)
    const target = await fs.realpath(file),
      stat = await fs.stat(target)
    if (
      kind === 'folder'
        ? !stat.isDirectory()
        : !stat.isFile() || (kind === 'exe' && path.extname(target).toLowerCase() !== '.exe')
    )
      throw new Error('目標類型不符')
    return {
      path: within(root, target) ? relPath(root, target) : target,
      relative: within(root, target),
    }
  }
  private async resolvedTarget(
    root: string,
    target: { path: string; relative: boolean },
    kind: 'exe' | 'folder' | 'file'
  ) {
    const file = target.relative ? path.join(root, target.path) : target.path
    if (target.relative) await safePath(root, file)
    await this.targetPath(root, file, kind)
    return file
  }
  async content(rowId: string, limit?: number, cursor?: string): Promise<ContentResult> {
    if (
      (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 500)) ||
      (cursor !== undefined &&
        (typeof cursor !== 'string' || cursor.length > 150 || limit === undefined))
    )
      throw new Error('內容分批設定不合法')
    const row = await this.library.readableRow(rowId),
      notices: string[] = [],
      entries: MediaEntry[] = []
    let offset = 0,
      token = '',
      names: string[],
      hidden = new Set<string>()
    for (const [id, session] of this.contentPages)
      if (session.expires < Date.now()) this.contentPages.delete(id)
    if (cursor) {
      const match = /^([\w-]+):(\d+)$/.exec(cursor),
        session = match && this.contentPages.get(match[1])
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
        while (this.contentPages.size >= 8)
          this.contentPages.delete(this.contentPages.keys().next().value!)
        token = randomUUID()
        this.contentPages.set(token, {
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
            this.files.set(`${rowId}/${id}`, { rowId, name, file, mime })
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
      (a, b) =>
        mediaNames.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    )
    const next = offset + batch.length,
      complete = next >= names.length
    if (complete && token) this.contentPages.delete(token)
    for (const sub of complete ? (row.record?.details?.subtitles ?? []) : []) {
      const file = path.join(row.path, DATA_DIR, sub.relativePath)
      this.files.set(`${rowId}/${sub.id}`, {
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
  private async file(rowId: string, id: string) {
    const row = await this.library.readableRow(rowId),
      entry = this.files.get(`${rowId}/${id}`)
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
  async audioCover(rowId: string, id: string, signal?: AbortSignal): Promise<globalThis.Response> {
    const task = this.audioCoverTail.then(() =>
      signal?.aborted ? new Response(null, { status: 499 }) : this.readAudioCover(rowId, id)
    )
    this.audioCoverTail = task.catch(() => {})
    return task
  }
  private async readAudioCover(rowId: string, id: string): Promise<globalThis.Response> {
    try {
      const entry = await this.file(rowId, id)
      if (!entry.mime.startsWith('audio/')) return new Response(null, { status: 415 })
      // Blob parsing seeks through the original read-only file; never load the whole file into RAM.
      if (entry.stat.size > 256 * 1024 * 1024) return new Response(null, { status: 413 })
      const metadata = await parseBlob(await openAsBlob(entry.file, { type: entry.mime }), {
        duration: false,
        skipPostHeaders: true,
      })
      const cover = selectCover(metadata.common.picture)
      if (!cover) return new Response(null, { status: 204 })
      if (cover.data.byteLength > 8 * 1024 * 1024) return new Response(null, { status: 413 })
      const image = identifyImage(cover.data)
      if (!image) return new Response(null, { status: 415 })
      return new Response(new Uint8Array(cover.data), {
        headers: {
          'Content-Type': image.mime,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch {
      return new Response(null, { status: 422 })
    }
  }
  async stream(
    rowId: string,
    id: string,
    request: globalThis.Request,
    thumbnail = false
  ): Promise<globalThis.Response> {
    try {
      const entry = await this.file(rowId, id)
      if (thumbnail) {
        if (!/^(image|video)\//.test(entry.mime))
          return new globalThis.Response(null, { status: 415 })
        const cache = path.join(this.root, 'thumbnails')
        await fs.mkdir(cache, { recursive: true })
        const file = path.join(
          cache,
          createHash('sha256')
            // Video previews are cached per size generation, so the old low-resolution ones are not reused.
            .update(
              `${entry.file}/${entry.stat.size}/${entry.stat.mtimeMs}` +
                (entry.mime.startsWith('video/') ? '/480' : '')
            )
            .digest('hex') + '.jpg'
        )
        await safePath(this.root, file)
        const bytes = await this.thumbnail(
          file,
          entry.file,
          entry.mime,
          entry.stat.size,
          request.signal,
          `media://file/${rowId}/${id}`
        )
        if (
          ++this.thumbnailReads % 32 === 1 &&
          !this.thumbnailTrim &&
          Date.now() - this.thumbnailTrimAt > 60000
        ) {
          this.thumbnailTrimAt = Date.now()
          this.thumbnailTrim = this.trimThumbnails()
            .catch(() => {})
            .finally(() => {
              this.thumbnailTrim = undefined
            })
        }
        const version =
          new URL(request.url).searchParams.get('v') === `${entry.stat.size}-${entry.stat.mtimeMs}`
        return new globalThis.Response(new Uint8Array(bytes), {
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': version ? 'private, max-age=86400, immutable' : 'no-cache',
          },
        })
      }
      if (!/^(image|video|audio)\//.test(entry.mime) && entry.mime !== 'application/pdf')
        return new globalThis.Response(null, { status: 415 })
      const size = entry.stat.size,
        headers: Record<string, string> = {
          'Content-Type': entry.mime,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        }
      const range = request.headers.get('range')
      let start = 0,
        end = size - 1,
        status = 200
      if (range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (!m || (!m[1] && !m[2]))
          return new globalThis.Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${size}` },
          })
        if (!m[1]) start = Math.max(0, size - Number(m[2]))
        else start = Number(m[1])
        if (m[2] && m[1]) end = Math.min(end, Number(m[2]))
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start > end ||
          start >= size
        )
          return new globalThis.Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${size}` },
          })
        status = 206
        headers['Content-Range'] = `bytes ${start}-${end}/${size}`
      }
      headers['Content-Length'] = String(Math.max(0, end - start + 1))
      if (request.method === 'HEAD' || !size)
        return new globalThis.Response(null, { status, headers })
      const stream = createReadStream(entry.file, { start, end })
      request.signal.addEventListener('abort', () => stream.destroy(), { once: true })
      return new globalThis.Response(Readable.toWeb(stream) as ReadableStream, { status, headers })
    } catch {
      return new globalThis.Response(null, { status: 404 })
    }
  }
  async archiveStream(
    rowId: string,
    fileId: string,
    token: string,
    number: string
  ): Promise<globalThis.Response> {
    try {
      const file = await this.file(rowId, fileId),
        cached = this.archives.get(token),
        index = cached?.index
      if (
        file.mime !== 'application/zip' ||
        !index ||
        cached?.file !== file.file ||
        !/^\d{1,5}$/.test(number)
      )
        throw new Error('壓縮頁面已失效')
      const entry = index.images[Number(number)]
      if (!entry) throw new Error('壓縮頁面不存在')
      const bytes = await archiveImage(file.file, index, entry)
      return new globalThis.Response(new Uint8Array(bytes), {
        headers: {
          'Content-Type': entry.mime,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch {
      return new globalThis.Response(null, { status: 404 })
    }
  }
  private async thumbnail(
    cache: string,
    source: string,
    mime: string,
    size: number,
    signal: AbortSignal,
    url: string
  ) {
    const jpeg = (b: Buffer) =>
      b.length > 4 && b[0] === 255 && b[1] === 216 && b.at(-2) === 255 && b.at(-1) === 217
    // Warm thumbnails never wait behind unrelated cold image decoding.
    try {
      const bytes = await fs.readFile(cache)
      if (jpeg(bytes)) return bytes
    } catch {}
    if (signal.aborted) throw new Error('縮圖已取消')
    const pending = this.thumbnailJobs.get(cache)
    if (pending) {
      pending.signals.push(signal)
      return pending.promise
    }
    const signals = [signal]
    const job = this.thumbnailTail.then(async () => {
      if (signals.every((signal) => signal.aborted)) throw new Error('縮圖已取消')
      try {
        const cached = await fs.readFile(cache)
        if (jpeg(cached)) return cached
      } catch {}
      if (mime.startsWith('image/') && size > 100 * 1024 * 1024)
        throw new Error('圖片過大，請直接檢視原圖')
      const bytes = await this.desktop.thumbnail(source, mime, url)
      if (!jpeg(bytes)) throw new Error('縮圖解碼失敗')
      const temp = cache + '.' + randomUUID() + '.tmp'
      try {
        await fs.writeFile(temp, bytes, { flag: 'wx' })
        await fs.rename(temp, cache)
      } finally {
        await fs.unlink(temp).catch(() => {})
      }
      return bytes
    })
    this.thumbnailTail = job.catch(() => {})
    this.thumbnailJobs.set(cache, { promise: job, signals })
    try {
      return await job
    } finally {
      this.thumbnailJobs.delete(cache)
    }
  }
  private async trimThumbnails() {
    const cache = path.join(this.root, 'thumbnails')
    await safePath(this.root, cache)
    if (!(await exists(cache))) return
    const files: { file: string; size: number; time: number }[] = []
    for (const entry of await fs.readdir(cache, { withFileTypes: true }))
      if (entry.isFile() && !entry.isSymbolicLink() && /^[0-9a-f]{64}\.jpg$/.test(entry.name)) {
        const file = path.join(cache, entry.name),
          stat = await fs.stat(file)
        files.push({ file, size: stat.size, time: stat.mtimeMs })
      }
    let size = files.reduce((sum, f) => sum + f.size, 0),
      count = files.length
    for (const f of files.sort((a, b) => a.time - b.time)) {
      if (count <= 3000 && size <= 512 * 1024 * 1024) break
      await safePath(cache, f.file)
      await fs.unlink(f.file)
      size -= f.size
      count--
    }
  }
  private checkValue(a: Attribute, record: FolderRecord) {
    if (!key(a.attributeId) || typeof a.key !== 'string' || a.key.length > 100)
      throw new Error('欄位身分不合法')
    const valid = validFieldValue(a.type, a.value)
    if (!valid) throw new Error(`欄位 ${a.key} 的值與型別 ${a.type} 不符`)
    const old = record.attributes.find((v) => v.attributeId === a.attributeId)
    if (old && old.type !== a.type) throw new Error('不能改變既有欄位型別')
  }
  async attributes(rowId: string, revision: number, values: Attribute[], privateValues: boolean) {
    if (
      !Array.isArray(values) ||
      values.length > 200 ||
      typeof privateValues !== 'boolean' ||
      new Set(values.map((v) => v.attributeId)).size !== values.length
    )
      throw new Error('欄位更新不合法')
    const { row, record } = await this.record(rowId, revision),
      project = this.library
        .snapshot()
        .projects.find((p) => p.projectId === row.projectId)!.project!
    const allowed = new Map([
      ...project.fieldBindings.map((f) => [f.attributeId, { key: f.alias, type: f.type }] as const),
      ...record.attributes.map((a) => [a.attributeId, a] as const),
    ])
    const target = privateValues
      ? (record.projectOverrides[row.projectId] ?? [])
      : record.attributes
    for (const value of values) {
      this.checkValue(value, record)
      const binding = allowed.get(value.attributeId)
      if (!binding || binding.type !== value.type) throw new Error('欄位未配置或型別不符')
      if (
        value.type === 'enum' &&
        !validFieldValue(
          value.type,
          value.value,
          project.fieldBindings.find((field) => field.attributeId === value.attributeId)?.options
        )
      )
        throw new Error('單選值不在選項內')
      const old = target.find((a) => a.attributeId === value.attributeId)
      if (old && old.type !== value.type) throw new Error('覆寫型別不符')
      const a = {
        ...value,
        key: binding.key ?? ('alias' in binding ? binding.alias : ''),
        source: 'manual',
      }
      delete a.sourceRecord
      const i = target.findIndex((a) => a.attributeId === value.attributeId)
      if (i < 0) target.push(a)
      else target[i] = a
    }
    if (privateValues) record.projectOverrides[row.projectId] = target
    else record.attributes = target
    await saveFolder(row.path, record, revision)
  }
  async droppedSubtitle(rowId: string, filePath: string) {
    return this.chooseSubtitle(rowId, filePath)
  }
  private async chooseSubtitle(rowId: string, filePath?: string): Promise<ExplorerResponse> {
    await this.library.checkedRow(rowId)
    const file = filePath ?? (await this.desktop.choose('subtitle'))
    if (!file) return { cancelled: true }
    if (!path.isAbsolute(file) || !['.srt', '.vtt'].includes(path.extname(file).toLowerCase()))
      throw new Error('僅支援 SRT／VTT')
    const real = await fs.realpath(file),
      stat = await fs.stat(real)
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error('字幕需為 5MB 以內的文字檔')
    const bytes = await fs.readFile(real),
      token = 'ext-' + createHash('sha256').update(bytes).digest('hex')
    this.externals.set(`${rowId}/${token}`, { rowId, file: real })
    return {
      subtitle: {
        token,
        name: path.basename(real),
        text: new TextDecoder('utf-8').decode(bytes),
        portable: false,
      },
    }
  }
  async request(req: ExplorerRequest): Promise<ExplorerResponse> {
    if (req.action === 'visit') return this.after(await this.library.visit(req.rowId))
    if (!req || typeof req.action !== 'string') throw new Error('無效的操作')
    switch (req.action) {
      case 'archive': {
        const file = await this.file(req.rowId, req.fileId)
        if (file.mime !== 'application/zip') throw new Error('不是 ZIP／CBZ')
        const index = await archiveIndex(file.file),
          token = randomUUID()
        while (this.archives.size >= 4) this.archives.delete(this.archives.keys().next().value!)
        this.archives.set(token, { file: file.file, index })
        return {
          content: {
            entries: index.images.map((entry, i) => ({
              id: token + '-' + i,
              name: entry.name,
              kind: 'image',
              mime: entry.mime,
              size: entry.size,
              modified: index.modified,
              url: `media://archive/${req.rowId}/${req.fileId}/${token}/${i}`,
            })),
            notices: [],
          },
        }
      }
      case 'overview':
        return { overview: await this.overview(req) }
      case 'openExternal':
        if (!httpUrl(req.url) || !this.desktop.external) throw new Error('網址無法開啟')
        await this.desktop.external(req.url)
        return {}
      case 'search':
        this.index.sync(this.library.snapshot())
        return {
          search: this.index.search(req.query, req.projectId, req.offset, req.limit, req.queryAst),
        }
      case 'rebuildIndex':
        this.index.sync(this.library.snapshot(), true)
        return { notice: { level: 'success', message: '索引已由可攜資料重建' } }
      case 'content':
        return { content: await this.content(req.rowId, req.limit, req.cursor) }
      case 'attributes':
        await this.attributes(req.rowId, req.revision, req.values, req.private)
        return this.after(await this.library.refreshRecord(req.rowId))
      case 'batch': {
        if (
          !Array.isArray(req.rows) ||
          !req.rows.length ||
          req.rows.length > 1000 ||
          !['replace', 'add', 'remove'].includes(req.mode) ||
          new Set(req.rows.map((r) => r.rowId)).size !== req.rows.length
        )
          throw new Error('批次範圍不合法')
        const failed: string[] = []
        let saved = 0
        for (const item of req.rows)
          try {
            const { row, record } = await this.record(item.rowId, item.revision),
              p = this.library
                .snapshot()
                .projects.find((p) => p.projectId === row.projectId)!.project!,
              field = p.fieldBindings.find((f) => f.attributeId === req.attributeId)
            if (!field) throw new Error('專案未配置欄位')
            let value = req.value
            if (field.type === 'tags' && req.mode !== 'replace') {
              if (!Array.isArray(req.value)) throw new Error('標籤應為清單')
              const old =
                record.attributes.find((a) => a.attributeId === field.attributeId)?.value ?? []
              if (!Array.isArray(old)) throw new Error('型別衝突')
              value =
                req.mode === 'add'
                  ? [...new Set([...old, ...req.value])]
                  : old.filter((v) => !(req.value as unknown[]).includes(v))
            } else if (req.mode !== 'replace') throw new Error('只有標籤支援新增／移除')
            await this.attributes(
              item.rowId,
              item.revision,
              [
                {
                  attributeId: field.attributeId,
                  key: field.alias,
                  type: field.type,
                  value,
                  source: 'manual',
                },
              ],
              false
            )
            saved++
          } catch (e) {
            failed.push(`${item.rowId}: ${String(e)}`)
          }
        for (const item of req.rows) await this.library.refreshRecord(item.rowId).catch(() => {})
        const snapshot = this.library.snapshot()
        this.index.sync(snapshot)
        return {
          snapshot,
          notice: completionNotice(
            saved,
            failed.length,
            `批次保存 ${saved} 筆${failed.length ? '\n失敗（已成功項目保留）：\n' + failed.join('\n') : ''}`
          ),
        }
      }
      case 'reading':
        return this.after(
          await this.details(req.rowId, req.revision, (d) => {
            d.reading = req.prefs
          })
        )
      case 'playback': {
        const f = await this.file(req.rowId, req.fileId)
        if (!f.mime.startsWith('video/')) throw new Error('不是影片')
        return this.after(
          await this.details(req.rowId, req.revision, (d) => {
            d.playback ??= {}
            const p = d.playback[req.fileId] ?? { time: 0 }
            p.time = req.time
            if (req.subtitle !== undefined) p.subtitle = req.subtitle
            if (req.settings) {
              p.settings ??= {}
              if (!req.subtitle) throw new Error('字幕來源未指定')
              p.settings[req.subtitle] = req.settings
            }
            d.playback[req.fileId] = p
          })
        )
      }
      case 'boundary': {
        if (
          !['root', 'candidate', 'not-game'].includes(req.state) ||
          (req.traverse !== undefined && typeof req.traverse !== 'boolean')
        )
          throw new Error('邊界設定不合法')
        const detected = (await this.library.checkedRow(req.rowId)).boundary
        await this.details(req.rowId, req.revision, (d) => {
          d.boundary = {
            state: req.state,
            engines: d.boundary?.engines ?? detected?.engines ?? [],
            evidence: d.boundary?.evidence ?? detected?.evidence ?? ['使用者指定'],
          }
        })
        const row = await this.library.checkedRow(req.rowId),
          p = this.library.snapshot().projects.find((p) => p.projectId === row.projectId)!.project!
        if (req.traverse !== undefined)
          await this.library.saveProject({
            ...p,
            traversal: { ...p.traversal, [row.record!.folderId]: req.traverse },
          })
        break
      }
      case 'banner':
        return this.after(
          await this.details(req.rowId, req.revision, (d, r) => {
            if (!r.assets.some((a) => a.assetId === req.assetId))
              throw new Error('圖片不屬於此資料夾')
            d.bannerAssetId = req.assetId
          })
        )
      case 'bindTarget': {
        const { row, record } = await this.record(req.rowId, req.revision),
          project = this.library
            .snapshot()
            .projects.find((p) => p.projectId === row.projectId)?.project,
          template = project && gameActionTemplates(project).find((t) => t.id === req.templateId)
        if (!template) throw new Error('任務版型不存在')
        if (
          !Array.isArray(req.args) ||
          req.args.length > 100 ||
          !req.args.every(
            (arg) => typeof arg === 'string' && arg.length <= 10000 && !arg.includes('\0')
          ) ||
          (['url', 'folder'].includes(template.kind) && req.args.length)
        )
          throw new Error('參數不合法')
        let target: NonNullable<NonNullable<FolderRecord['details']>['targets']>[string]
        if (template.kind === 'url') {
          if (!httpUrl(req.url)) throw new Error('網址無法開啟')
          target = { kind: 'url', path: req.url!, relative: false, args: [] }
        } else {
          const chosen = await this.desktop.choose(
            template.kind === 'file-app' ? 'exe' : template.kind,
            row.path
          )
          if (!chosen) return { cancelled: true }
          const selected = await this.targetPath(
            row.path,
            chosen,
            template.kind === 'folder' ? 'folder' : 'exe'
          )
          if (template.kind === 'file-app') {
            const file = await this.desktop.choose('file', row.path)
            if (!file) return { cancelled: true }
            target = {
              kind: template.kind,
              ...(await this.targetPath(row.path, file, 'file')),
              args: req.args,
              application: selected,
            }
          } else target = { kind: template.kind, ...selected, args: req.args }
        }
        record.details ??= newDetails()
        record.details.targets ??= {}
        record.details.targets[template.id] = target
        validateDetails(record.details)
        await saveFolder(row.path, record, req.revision)
        break
      }
      case 'runTarget': {
        const row = await this.library.checkedRow(req.rowId),
          record = await readFolder(row.path),
          p = this.library.snapshot().projects.find((p) => p.projectId === row.projectId)!.project!,
          template = gameActionTemplates(p).find((t) => t.id === req.templateId),
          target = record.details?.targets?.[req.templateId]
        if (!template || !target || template.kind !== target.kind)
          throw new Error('任務尚未綁定；請重新指定')
        if (target.kind === 'url') {
          if (!httpUrl(target.path) || !this.desktop.external) throw new Error('網址無法開啟')
          await this.desktop.external(target.path)
        } else {
          const file = await this.resolvedTarget(
            row.path,
            target,
            target.kind === 'folder' ? 'folder' : target.kind === 'exe' ? 'exe' : 'file'
          )
          if (target.kind === 'folder') await this.desktop.open(file)
          else if (target.kind === 'exe') await this.desktop.launch(file, target.args)
          else {
            if (!target.application) throw new Error('應用程式尚未綁定')
            const application = await this.resolvedTarget(row.path, target.application, 'exe')
            await this.desktop.launch(application, [...target.args, file])
          }
        }
        return { notice: { level: 'success', message: '已開啟指定目標' } }
      }
      case 'chooseSubtitle': {
        return this.chooseSubtitle(req.rowId)
      }
      case 'subtitle': {
        let file: string,
          portable = false,
          token = req.fileId ?? req.externalToken ?? ''
        if (req.fileId) {
          const f = await this.file(req.rowId, req.fileId)
          if (!['.srt', '.vtt'].includes(path.extname(f.file).toLowerCase()))
            throw new Error('字幕格式未支援')
          file = f.file
          portable = true
        } else {
          const external = this.externals.get(`${req.rowId}/${token}`)
          if (!external || external.rowId !== req.rowId) throw new Error('外部字幕未授權')
          file = external.file
        }
        if ((await fs.stat(file)).size > 5 * 1024 * 1024) throw new Error('字幕過大')
        const bytes = await fs.readFile(file),
          text = new TextDecoder(req.encoding ?? 'utf-8', { fatal: true }).decode(bytes)
        parseSubtitles(text)
        if (req.import && !portable) {
          const row = await this.library.checkedRow(req.rowId, true),
            r = await readFolder(row.path),
            id = randomUUID(),
            relativePath = `subtitles/${id}${path.extname(file).toLowerCase()}`,
            target = path.join(row.path, DATA_DIR, relativePath)
          await safePath(row.path, target)
          await fs.mkdir(path.dirname(target), { recursive: true })
          await fs.writeFile(target, bytes, { flag: 'wx' })
          r.details ??= newDetails()
          r.details.subtitles ??= []
          r.details.subtitles.push({ id, name: path.basename(file), relativePath })
          try {
            await saveFolder(row.path, r, r.revision)
          } catch (e) {
            await fs.unlink(target)
            throw e
          }
          portable = true
          token = id
          await this.library.scan()
          await this.content(req.rowId)
        }
        return {
          subtitle: { token, name: path.basename(file), text, portable },
          snapshot: this.library.snapshot(),
        }
      }
      case 'cellImage': {
        const { row, record } = await this.record(req.rowId, req.revision),
          project = this.library
            .snapshot()
            .projects.find((p) => p.projectId === row.projectId)!.project!,
          cell = projectImageCells(project).find((c) => c.cellId === req.cellId)
        if (
          !cell ||
          (req.assetId !== null && !record.assets.some((a) => a.assetId === req.assetId))
        )
          throw new Error('圖片組件或圖片不存在')
        record.details ??= newDetails()
        record.details.cellImages ??= {}
        if (req.assetId === null) delete record.details.cellImages[cell.attributeId ?? cell.cellId]
        else record.details.cellImages[cell.attributeId ?? cell.cellId] = req.assetId
        await saveFolder(row.path, record, req.revision)
        break
      }
      case 'imageUrlPreview':
        return { imagePreview: await this.imageUrlPreview(req.url) }
      case 'imageUrlApply':
        await this.applyImageUrl(req)
        break
      case 'metadataPreview':
        return { preview: await this.metadataPreview(req.source, req.provider) }
      case 'metadataApply':
        await this.applyMetadata(req)
        break
      default:
        throw new Error('不支援的操作')
    }
    return this.after(await this.library.scan())
  }
  private async overview(
    request: Extract<ExplorerRequest, { action: 'overview' }>
  ): Promise<OverviewResult> {
    const limit = request.limit ?? 96
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 200 ||
      !['current', 'descendants'].includes(request.scope)
    )
      throw new Error('檔案總覽範圍不合法')
    const root = await this.library.readableRow(request.rowId),
      snapshot = this.library.snapshot()
    const notices: string[] = [],
      entries: OverviewResult['entries'] = []
    for (const [token, session] of this.overviewPages)
      if (session.expires < Date.now()) this.overviewPages.delete(token)
    let plan = request.cursor ? this.overviewPages.get(request.cursor) : undefined
    if (request.cursor) {
      if (
        !plan ||
        plan.rootId !== root.rowId ||
        plan.folderId !== root.record!.folderId ||
        plan.scope !== request.scope
      )
        throw new Error('檔案總覽批次已失效，請重新整理')
      this.overviewPages.delete(request.cursor)
    } else {
      const base = root.path.replaceAll('\\', '/').replace(/\/$/, '').toLocaleLowerCase()
      const candidates = (snapshot.structure ?? snapshot.rows).filter(
        (row) =>
          row.projectId === root.projectId &&
          (row.rowId === root.rowId ||
            (request.scope === 'descendants' &&
              row.path
                .replaceAll('\\', '/')
                .toLocaleLowerCase()
                .startsWith(base + '/')))
      )
      const allowed = candidates.filter(
        (row) => row.record && !row.readonly && !row.stopped && !row.error && !row.duplicate
      )
      if (candidates.length !== allowed.length)
        notices.push('只列出目前已納入且允許瀏覽的範圍；缺失記錄或保護區域未列入')
      allowed.sort((a, b) => mediaNames.compare(a.path, b.path) || a.rowId.localeCompare(b.rowId))
      plan = {
        rootId: root.rowId,
        folderId: root.record!.folderId,
        scope: request.scope,
        folders: allowed.map((row) => row.rowId),
        folder: 0,
        expires: Date.now() + 120000,
      }
    }
    let batches = 0
    while (plan!.folder < plan!.folders.length && entries.length < limit && batches++ < 8) {
      const rowId = plan!.folders[plan!.folder],
        row = (snapshot.structure ?? snapshot.rows).find((row) => row.rowId === rowId)
      try {
        if (!row) throw new Error('資料夾已離開允許範圍')
        const result = await this.content(rowId, limit - entries.length, plan!.contentCursor)
        notices.push(...result.notices)
        entries.push(
          ...result.entries
            .filter((entry) => entry.kind !== 'folder')
            .map((entry) => ({ ...entry, rowId, folderName: row.name, sourcePath: row.path }))
        )
        plan!.contentCursor = result.nextCursor
        if (!result.nextCursor) plan!.folder++
      } catch (reason) {
        notices.push((row?.name ?? rowId) + ': ' + String(reason))
        plan!.contentCursor = undefined
        plan!.folder++
      }
    }
    const complete = plan!.folder >= plan!.folders.length
    let nextCursor: string | undefined
    if (!complete) {
      nextCursor = randomUUID()
      plan!.expires = Date.now() + 120000
      while (this.overviewPages.size >= 10)
        this.overviewPages.delete(this.overviewPages.keys().next().value!)
      this.overviewPages.set(nextCursor, plan!)
    }
    return {
      entries,
      notices,
      complete,
      foldersVisited: plan!.folder,
      foldersTotal: plan!.folders.length,
      ...(nextCursor ? { nextCursor } : {}),
    }
  }
  private after(snapshot: ReturnType<Library['snapshot']>): ExplorerResponse {
    this.index.sync(snapshot)
    return { snapshot }
  }
  private async metadataPreview(
    source: string,
    provider?: MetadataSourceId
  ): Promise<MetadataPreview> {
    const item = await metadata(source, fetch, provider),
      preview: MetadataPreview = { ...item.preview, token: randomUUID() }
    for (const [id, p] of this.previews) if (p.expires < Date.now()) this.previews.delete(id)
    if (this.previews.size >= 10) this.previews.delete(this.previews.keys().next().value!)
    this.previews.set(preview.token, {
      preview,
      cover: item.cover,
      expires: Date.now() + 15 * 60 * 1000,
    })
    return preview
  }
  private async imageUrlPreview(url: string) {
    const item = await fetchImageUrl(url, this.imageUrlOptions),
      token = randomUUID()
    for (const [id, p] of this.imagePreviews)
      if (p.expires < Date.now()) this.imagePreviews.delete(id)
    while (this.imagePreviews.size >= 5)
      this.imagePreviews.delete(this.imagePreviews.keys().next().value!)
    this.imagePreviews.set(token, { ...item, expires: Date.now() + 15 * 60 * 1000 })
    return {
      token,
      image: 'data:' + item.mime + ';base64,' + item.bytes.toString('base64'),
      name: item.name,
      size: item.bytes.length,
    }
  }
  private async applyImageUrl(req: Extract<ExplorerRequest, { action: 'imageUrlApply' }>) {
    const item = this.imagePreviews.get(req.token)
    if (!item || item.expires < Date.now()) throw new Error('圖片預覽已過期，請重新取得')
    const { row, record } = await this.record(req.rowId, req.revision),
      assetId = randomUUID(),
      relativePath = `assets/${assetId}.${item.ext}`,
      target = path.join(row.path, DATA_DIR, relativePath)
    await safePath(row.path, target)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, item.bytes, { flag: 'wx' })
    record.assets.push({ assetId, relativePath, originalName: item.name, mediaType: item.mime })
    if (req.cover) {
      record.details ??= newDetails()
      record.details.bannerAssetId = assetId
      validateDetails(record.details)
    }
    try {
      await saveFolder(row.path, record, req.revision)
    } catch (e) {
      await fs.unlink(target).catch(() => {})
      throw e
    }
    this.imagePreviews.delete(req.token)
  }
  private async applyMetadata(req: Extract<ExplorerRequest, { action: 'metadataApply' }>) {
    const item = this.previews.get(req.token)
    if (!item || item.expires < Date.now()) throw new Error('候選已過期，請重新取得')
    if (
      !Array.isArray(req.keys) ||
      !req.keys.every((k) => item.preview.values.some((v) => v.key === k))
    )
      throw new Error('匯入欄位不合法')
    const { row, record } = await this.record(req.rowId, req.revision)
    if (req.mode !== undefined && !['fill', 'replace'].includes(req.mode))
      throw new Error('來源匯入模式不合法')
    for (const v of item.preview.values.filter((v) => req.keys.includes(v.key))) {
      const provider = item.preview.provider ?? 'eh',
        attributeId = provider + '-' + v.key.toLowerCase(),
        old = record.attributes.find((attribute) => attribute.attributeId === attributeId)
      if (old && sourceForUrl(old.source) !== provider) throw new Error('既有欄位來源衝突')
      const filled =
        old &&
        old.value !== null &&
        old.value !== undefined &&
        old.value !== '' &&
        (!Array.isArray(old.value) || old.value.length > 0)
      if (req.mode !== 'replace' && filled) continue
      const attribute: Attribute = {
        ...v,
        attributeId,
        source: item.preview.source,
        sourceRecord: { provider, url: item.preview.source, fetchedAt: new Date().toISOString() },
      }
      this.checkValue(attribute, record)
      record.attributes = record.attributes.filter(
        (attribute) => attribute.attributeId !== attributeId
      )
      record.attributes.push(attribute)
    }
    let added: string | undefined
    if (
      req.image &&
      item.cover &&
      (req.mode === 'replace' ||
        !record.assets.some((asset) =>
          asset.originalName.startsWith((item.preview.provider ?? 'eh') + '-cover.')
        ))
    ) {
      const { bytes, ext, mime } = item.cover,
        assetId = randomUUID(),
        relativePath = `assets/${assetId}.${ext}`
      added = path.join(row.path, DATA_DIR, relativePath)
      await safePath(row.path, added)
      await fs.mkdir(path.dirname(added), { recursive: true })
      await fs.writeFile(added, bytes, { flag: 'wx' })
      record.assets.push({
        assetId,
        relativePath,
        originalName: (item.preview.provider ?? 'eh') + '-cover.' + ext,
        mediaType: mime,
      })
    }
    try {
      await saveFolder(row.path, record, req.revision)
    } catch (e) {
      if (added) await fs.unlink(added)
      throw e
    }
  }
}
