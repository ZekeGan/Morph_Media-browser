import { fmt } from '../shared/message'
import { isFolderKind } from '../shared/kind'
import { archiveIndex, type ArchiveIndex } from './archive'
import { dateOrText, httpUrl, validFieldValue } from '../shared/fields'
import { type MetadataSourceId } from '../shared/sources'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { Library } from './library'
import { readFolder, relPath, safePath, saveFolder, within } from './files'
import { DATA_DIR, validateDetails, type Attribute, type FolderRecord } from '../shared/model'
import {
  documentFile,
  gameActionTemplates,
  gameExtras,
  newDetails,
  type ContentResult,
  type ExplorerRequest,
  type ExplorerResponse,
  type MetadataPreview,
  type OverviewResult,
} from '../shared/explorer'
import { SearchIndex } from './search-index'
import { completionNotice } from '../shared/notifications'
import { projectImageCells } from '../shared/layouts'
import { type ImageUrlOptions, type RemoteImage } from './image-url'
import { parseSubtitles } from '../shared/subtitles'
import { key, probeFile } from './media-files'
import * as contentFns from './explorer-content'
import * as streamFns from './explorer-stream'
import * as sourceFns from './explorer-source'
import * as overviewFns from './explorer-overview'
import { bundledSuggestions, engineSaveFolder, steamAppId, store, storeUrl } from './game-extras'
import { detectGame } from './game-detection'
import { readNovel } from './novel'
import type { KeyStore } from './keys'
import { keySite, KEY_REJECTED } from '../shared/keys'
import { metadata } from './metadata'
import { SourceError } from './metadata-common'
export { probeFile }

export interface DesktopOperations {
  external?(url: string): Promise<void>
  choose(
    kind: 'exe' | 'folder' | 'file' | 'subtitle',
    initialPath?: string
  ): Promise<string | undefined>
  open(file: string): Promise<void>
  reveal?(file: string): void
  // onExit is told when a started program ends (R-308 play time); it is not called when the program cannot be followed.
  launch(
    file: string,
    args: string[],
    onExit?: (started: number, ended: number) => void
  ): Promise<void>
  // R-307: whether some application handles this URL scheme (e.g. 'steam').
  protocolReady?(scheme: string): boolean
  // R-309: Locale Emulator's LEProc.exe from the app settings, and setting it.
  localeEmulator?(): string | undefined
  setLocaleEmulator?(file: string | undefined): Promise<void>
  // R-285: the encrypted website keys (main only).
  keyStore?: KeyStore
  // R-308: a session of a game started from M:orph ended.
  played?(folderId: string, started: number, ended: number): void
  thumbnail(file: string, mime?: string, url?: string): Promise<Buffer>
}
export class Explorer {
  readonly index: SearchIndex
  archives = new Map<string, { file: string; index: ArchiveIndex }>()
  overviewPages = new Map<
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
  files = new Map<
    string,
    { rowId: string; name: string; file: string; mime: string; portable?: boolean }
  >()
  externals = new Map<string, { rowId: string; file: string }>()
  imagePreviews = new Map<string, RemoteImage & { expires: number }>()
  imageUrlOptions: ImageUrlOptions = {}
  previews = new Map<
    string,
    {
      preview: MetadataPreview
      cover?: { bytes: Buffer; mime: string; ext: string }
      expires: number
    }
  >()
  thumbnailReads = 0
  audioCoverTail: Promise<unknown> = Promise.resolve()
  thumbnailJobs = new Map<string, { promise: Promise<Buffer>; signals: AbortSignal[] }>()
  thumbnailTail: Promise<unknown> = Promise.resolve()
  thumbnailTrim?: Promise<void>
  thumbnailTrimAt = 0
  contentPages = new Map<
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
    readonly library: Library,
    readonly root: string,
    readonly desktop: DesktopOperations
  ) {
    this.index = new SearchIndex(path.join(root, 'search.sqlite'))
    this.index.sync(library.snapshot())
  }
  async record(rowId: string, revision: number) {
    const row = await this.library.checkedRow(rowId, true),
      record = await readFolder(row.path)
    if (record.revision !== revision) throw new Error('版本衝突；草稿保留，重新載入後比較')
    return { row, record }
  }
  async details(
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
  async targetPath(root: string, file: string, kind: 'exe' | 'folder' | 'file') {
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
  async resolvedTarget(
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
    return contentFns.content(this, rowId, limit, cursor)
  }
  async file(rowId: string, id: string) {
    return contentFns.file(this, rowId, id)
  }
  async nthImage(
    rowId: string,
    index: number,
    request: globalThis.Request
  ): Promise<globalThis.Response> {
    return contentFns.nthImage(this, rowId, index, request)
  }
  async audioCover(rowId: string, id: string, signal?: AbortSignal): Promise<globalThis.Response> {
    return streamFns.audioCover(this, rowId, id, signal)
  }
  async readAudioCover(rowId: string, id: string): Promise<globalThis.Response> {
    return streamFns.readAudioCover(this, rowId, id)
  }
  async stream(
    rowId: string,
    id: string,
    request: globalThis.Request,
    thumbnail = false
  ): Promise<globalThis.Response> {
    return streamFns.stream(this, rowId, id, request, thumbnail)
  }
  async archiveStream(
    rowId: string,
    fileId: string,
    token: string,
    number: string
  ): Promise<globalThis.Response> {
    return streamFns.archiveStream(this, rowId, fileId, token, number)
  }
  async thumbnail(
    cache: string,
    source: string,
    mime: string,
    size: number,
    signal: AbortSignal,
    url: string
  ) {
    return streamFns.thumbnail(this, cache, source, mime, size, signal, url)
  }
  async trimThumbnails() {
    return streamFns.trimThumbnails(this)
  }
  checkValue(a: Attribute, record: FolderRecord) {
    if (!key(a.attributeId) || typeof a.key !== 'string' || a.key.length > 100)
      throw new Error('欄位身分不合法')
    const valid = validFieldValue(a.type, a.value)
    if (!valid) throw new Error(fmt('欄位 {0} 的值與型別 {1} 不符', a.key, a.type))
    const old = record.attributes.find((v) => v.attributeId === a.attributeId)
    if (old && old.type !== a.type && !dateOrText(old.type, a.type))
      throw new Error('不能改變既有欄位型別')
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
      const binding = allowed.get(value.attributeId),
        defined = project.fieldBindings.find((f) => f.attributeId === value.attributeId)
      // A value is saved with the type it already has, or with the project's type for the field: a field switched
      // between text and date saves new values with its current type (R-240).
      if (!binding || (binding.type !== value.type && defined?.type !== value.type))
        throw new Error('欄位未配置或型別不符')
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
      if (old && old.type !== value.type && !dateOrText(old.type, value.type))
        throw new Error('覆寫型別不符')
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
  async chooseSubtitle(rowId: string, filePath?: string): Promise<ExplorerResponse> {
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
      case 'fileProbe':
      case 'openFile':
      case 'revealFile': {
        // Only files the row published (resolved through the scoped file table) are ever touched.
        const entry = await this.file(req.rowId, req.fileId)
        if (req.action === 'openFile') {
          if (!/^(video|audio)\//.test(entry.mime))
            throw new Error('只能用系統預設程式開啟影音檔案')
          await this.desktop.open(entry.file)
          return {}
        }
        if (req.action === 'revealFile') {
          if (!this.desktop.reveal) throw new Error('目前環境無法顯示檔案位置')
          this.desktop.reveal(entry.file)
          return {}
        }
        return { probe: { kind: await probeFile(entry.file) } }
      }
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
            fmt(
              '批次保存 {0} 筆{1}',
              saved,
              failed.length ? fmt('\n失敗（已成功項目保留）：\n') + failed.join('\n') : ''
            )
          ),
        }
      }
      case 'reading':
        return this.after(
          await this.details(req.rowId, req.revision, (d) => {
            d.reading = req.prefs
          })
        )
      case 'folderKind': {
        if (req.kind !== null && !isFolderKind(req.kind)) throw new Error('資料夾類型不合法')
        const snapshot = await this.details(req.rowId, req.revision, (d) => {
          if (req.kind === null) delete d.kind
          else d.kind = req.kind
        })
        return {
          ...this.after(snapshot),
          notice: { level: 'success' as const, message: '已更新資料夾類型' },
        }
      }
      case 'folderKinds': {
        if (req.kind !== null && !isFolderKind(req.kind)) throw new Error('資料夾類型不合法')
        if (
          !Array.isArray(req.rows) ||
          !req.rows.length ||
          req.rows.length > 1000 ||
          new Set(req.rows.map((r) => r.rowId)).size !== req.rows.length
        )
          throw new Error('批次範圍不合法')
        // Each folder keeps its own record: one that cannot be written is reported and the rest still change.
        const failed: string[] = []
        let saved = 0
        for (const item of req.rows)
          try {
            await this.details(item.rowId, item.revision, (d) => {
              if (req.kind === null) delete d.kind
              else d.kind = req.kind
            })
            saved++
          } catch (e) {
            failed.push(`${item.rowId}: ${String(e)}`)
          }
        const snapshot = this.library.snapshot()
        this.index.sync(snapshot)
        return {
          snapshot,
          notice: completionNotice(
            saved,
            failed.length,
            fmt(
              '已指定 {0} 個資料夾的類型{1}',
              saved,
              failed.length ? fmt('\n失敗（已成功項目保留）：\n') + failed.join('\n') : ''
            )
          ),
        }
      }
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
      case 'actionVisible': {
        const row = await this.library.checkedRow(req.rowId),
          project = this.library
            .snapshot()
            .projects.find((p) => p.projectId === row.projectId)?.project
        if (typeof req.visible !== 'boolean') throw new Error('任務版型不存在')
        // R-315: the game page's own buttons are opt-in, kept as the list of extras shown.
        const extra = gameExtras.find((name) => 'extra-' + name === req.templateId)
        if (extra)
          return this.after(
            await this.details(req.rowId, req.revision, (d) => {
              const shown = new Set(d.shownExtras)
              if (req.visible) shown.add(extra)
              else shown.delete(extra)
              if (shown.size) d.shownExtras = gameExtras.filter((name) => shown.has(name))
              else delete d.shownExtras
            })
          )
        if (!project || !gameActionTemplates(project).some((t) => t.id === req.templateId))
          throw new Error('任務版型不存在')
        return this.after(
          await this.details(req.rowId, req.revision, (d) => {
            const hidden = new Set(d.hiddenActions)
            if (req.visible) hidden.delete(req.templateId)
            else hidden.add(req.templateId)
            if (hidden.size) d.hiddenActions = [...hidden]
            else delete d.hiddenActions
          })
        )
      }
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
          (['url', 'folder', 'shortcut', 'file'].includes(template.kind) && req.args.length) ||
          (req.localeEmulator !== undefined && typeof req.localeEmulator !== 'boolean')
        )
          throw new Error('參數不合法')
        let target: NonNullable<NonNullable<FolderRecord['details']>['targets']>[string]
        if (template.kind === 'url') {
          if (!httpUrl(req.url)) throw new Error('網址無法開啟')
          target = { kind: 'url', path: req.url!, relative: false, args: [] }
        } else if (template.kind === 'shortcut') {
          // Picked from the folder's own list, never through a file dialog that may resolve the shortcut to its target.
          const name = req.shortcut
          if (
            typeof name !== 'string' ||
            !/^[^\\/]+\.(lnk|url)$/i.test(name) ||
            name.includes('\0')
          )
            throw new Error('請選擇資料夾內的捷徑（.lnk／.url）')
          await this.targetPath(row.path, path.join(row.path, name), 'file')
          target = { kind: 'shortcut', path: name, relative: true, args: [] }
        } else {
          const chosen = await this.desktop.choose(
            template.kind === 'file-app' ? 'exe' : template.kind,
            row.path
          )
          if (!chosen) return { cancelled: true }
          const selected = await this.targetPath(
            row.path,
            chosen,
            template.kind === 'folder' ? 'folder' : template.kind === 'file' ? 'file' : 'exe'
          )
          // A bundled document is opened from inside the game folder only (R-306).
          if (template.kind === 'file' && (!selected.relative || !documentFile(selected.path)))
            throw new Error('請選擇遊戲資料夾內的說明文件（PDF、HTML、TXT、MD、RTF）')
          if (template.kind === 'file-app') {
            const file = await this.desktop.choose('file', row.path)
            if (!file) return { cancelled: true }
            target = {
              kind: template.kind,
              ...(await this.targetPath(row.path, file, 'file')),
              args: req.args,
              application: selected,
            }
          } else
            target = {
              kind: template.kind,
              ...selected,
              args: template.kind === 'file' ? [] : req.args,
              ...(template.kind === 'exe' && req.localeEmulator ? { localeEmulator: true } : {}),
            }
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
        } else if (target.kind === 'shortcut') {
          if (!/\.(lnk|url)$/i.test(target.path)) throw new Error('捷徑類型不符')
          await this.desktop.open(await this.resolvedTarget(row.path, target, 'file'))
        } else {
          const file = await this.resolvedTarget(
            row.path,
            target,
            target.kind === 'folder' ? 'folder' : target.kind === 'exe' ? 'exe' : 'file'
          )
          if (target.kind === 'file' && !documentFile(file)) throw new Error('目標類型不符')
          if (target.kind === 'folder' || target.kind === 'file') await this.desktop.open(file)
          else if (target.kind === 'exe' && target.localeEmulator) {
            // R-309: LEProc.exe starts the game in Japanese locale and exits at once, so this session is not timed.
            const runner = this.desktop.localeEmulator?.()
            if (!runner)
              throw new Error('尚未設定 Locale Emulator（LEProc.exe）；請到應用程式設定指定')
            await this.desktop.launch(runner, ['-run', file, ...target.args])
          } else if (target.kind === 'exe') {
            const folderId = record.folderId
            await this.desktop.launch(file, target.args, (started, ended) =>
              this.desktop.played?.(folderId, started, ended)
            )
          } else {
            if (!target.application) throw new Error('應用程式尚未綁定')
            const application = await this.resolvedTarget(row.path, target.application, 'exe')
            await this.desktop.launch(application, [...target.args, file])
          }
        }
        return { notice: { level: 'success', message: '已開啟指定目標' } }
      }
      case 'gameExtras': {
        const row = await this.library.checkedRow(req.rowId),
          record = await readFolder(row.path).catch(() => undefined),
          engines =
            row.boundary?.engines ??
            (await detectGame(row.path).catch(() => undefined))?.engines ??
            [],
          id = await steamAppId(row.path, record),
          user = record?.details?.saveFolder,
          engineFolder = user ? undefined : await engineSaveFolder(row.path, engines),
          bound = new Set(
            Object.values(record?.details?.targets ?? {})
              .filter((t) => t.relative)
              .map((t) => t.path.toLowerCase())
          )
        return {
          extras: {
            ...(id ? { steamAppId: id } : {}),
            steamReady: !!this.desktop.protocolReady?.('steam'),
            ...(store(record)
              ? { storeUrl: store(record)!.url, storeSite: store(record)!.site }
              : {}),
            save: user ? 'user' : engineFolder ? 'engine' : 'none',
            ...(engineFolder ? { saveEngine: engines.join('／') } : {}),
            suggestions: (await bundledSuggestions(row.path)).filter(
              (item) => !bound.has(item.name.toLowerCase())
            ),
            localeEmulator: !!this.desktop.localeEmulator?.(),
          },
        }
      }
      case 'runExtra': {
        const row = await this.library.checkedRow(req.rowId),
          record = await readFolder(row.path)
        if (req.extra === 'steam') {
          const id = await steamAppId(row.path, record)
          if (!id) throw new Error('找不到這個遊戲的 Steam App ID')
          if (!this.desktop.protocolReady?.('steam') || !this.desktop.external)
            throw new Error('這台電腦沒有安裝 Steam，無法用 Steam 啟動')
          await this.desktop.external('steam://run/' + id)
          return {}
        }
        if (req.extra === 'store') {
          const url = storeUrl(record)
          if (!url || !this.desktop.external) throw new Error('這個資料夾沒有商店網址')
          await this.desktop.external(url)
          return {}
        }
        const user = record.details?.saveFolder
        const folder = user
          ? await this.resolvedTarget(row.path, user, 'folder')
          : await engineSaveFolder(
              row.path,
              row.boundary?.engines ??
                (await detectGame(row.path).catch(() => undefined))?.engines ??
                []
            )
        if (!folder) throw new Error('找不到存檔資料夾；可以在遊戲操作裡自己指定')
        await this.desktop.open(folder)
        return {}
      }
      case 'chooseSaveFolder': {
        if (req.clear)
          return this.after(
            await this.details(req.rowId, req.revision, (d) => {
              delete d.saveFolder
            })
          )
        const row = await this.library.checkedRow(req.rowId, true),
          chosen = await this.desktop.choose('folder', row.path)
        if (!chosen) return { cancelled: true }
        const picked = await this.targetPath(row.path, chosen, 'folder')
        return this.after(
          await this.details(req.rowId, req.revision, (d) => {
            d.saveFolder = picked
          })
        )
      }
      case 'addSuggestion': {
        const { row, record } = await this.record(req.rowId, req.revision),
          suggestion = (await bundledSuggestions(row.path)).find((item) => item.name === req.name)
        if (!suggestion) throw new Error('這個檔案不在建議清單裡')
        const kind = suggestion.role === 'config' ? 'exe' : 'file',
          target = await this.targetPath(
            row.path,
            path.join(row.path, suggestion.name),
            kind === 'exe' ? 'exe' : 'file'
          )
        if (!target.relative) throw new Error('目標路徑不合法')
        const link = this.library.snapshot().projects.find((p) => p.projectId === row.projectId),
          project = link?.project
        if (!project) throw new Error('專案尚未連結')
        // Reuse a button of the same kind and name that this game has not used yet; otherwise add one.
        const base = suggestion.role === 'config' ? '設定程式' : '說明書',
          templates = gameActionTemplates(project)
        let template = templates.find(
          (t) =>
            t.kind === kind &&
            (t.label === base || t.label.startsWith(base + ' ')) &&
            !record.details?.targets?.[t.id]
        )
        if (!template) {
          if (templates.length >= 30) throw new Error('遊戲操作按鈕已達上限（30 個）')
          const used = new Set(templates.map((t) => t.label))
          let label = base
          for (let n = 2; used.has(label); n++) label = base + ' ' + n
          template = { id: randomUUID(), label, kind, color: '#868e96' }
          await this.library.saveProject({ ...project, actionTemplates: [...templates, template] })
        }
        record.details ??= newDetails()
        record.details.targets ??= {}
        record.details.targets[template.id] = { kind, ...target, args: [] }
        validateDetails(record.details)
        await saveFolder(row.path, record, req.revision)
        return this.after(await this.library.refreshRecord(req.rowId))
      }
      case 'keyStatus':
        return { keys: (await this.desktop.keyStore?.status()) ?? {} }
      case 'setKey': {
        if (!this.desktop.keyStore) throw new Error('無法保存金鑰')
        await this.desktop.keyStore.set(req.site, req.values)
        return { keys: await this.desktop.keyStore.status() }
      }
      case 'clearKey': {
        await this.desktop.keyStore?.clear(req.site)
        return { keys: (await this.desktop.keyStore?.status()) ?? {} }
      }
      case 'testKey': {
        // The key works when the site answers with or without the sample work; only a refusal fails the test.
        const definition = keySite(req.site),
          store = this.desktop.keyStore
        if (!definition || !store) throw new Error('沒有這個網站')
        let result: 'ok' | 'failed' = 'ok'
        try {
          await metadata(definition.sample, fetch, undefined, { keyFor: (site) => store.get(site) })
        } catch (error) {
          if (
            (error instanceof SourceError && error.kind === 'restricted') ||
            (error instanceof Error && error.message === KEY_REJECTED)
          )
            result = 'failed'
          else if (error instanceof SourceError && error.kind === 'offline') throw error
        }
        await store.mark(req.site, result)
        return { keys: await store.status() }
      }
      case 'novel': {
        const file = await this.file(req.rowId, req.fileId)
        if (!/\.(txt|epub)$/i.test(file.file)) throw new Error('不是文字書（TXT／EPUB）')
        // EPUB pictures reuse the read-only archive stream, registered like a comic archive.
        const token = randomUUID()
        const novel = await readNovel(
          file.file,
          (number) => `media://archive/${req.rowId}/${req.fileId}/${token}/${number}`
        )
        if (novel.format === 'epub') {
          while (this.archives.size >= 4) this.archives.delete(this.archives.keys().next().value!)
          this.archives.set(token, { file: file.file, index: await archiveIndex(file.file) })
        }
        return { novel }
      }
      case 'novelProgress': {
        const file = await this.file(req.rowId, req.fileId),
          row = await this.library.checkedRow(req.rowId, true),
          current = await readFolder(row.path)
        return this.after(
          await this.details(req.rowId, current.revision, (d) => {
            // Only the known fields are kept; anything else the window sent is dropped.
            const p = req.progress
            d.novels = {
              ...d.novels,
              [path.basename(file.file)]: {
                chapter: p.chapter,
                position: p.position,
                percent: p.percent,
                updated: p.updated,
                ...(Array.isArray(p.bookmarks)
                  ? {
                      bookmarks: p.bookmarks.map((b) => ({
                        chapter: b?.chapter,
                        position: b?.position,
                        label: b?.label,
                      })),
                    }
                  : {}),
              },
            }
          })
        )
      }
      case 'targetLocale':
        return this.after(
          await this.details(req.rowId, req.revision, (d) => {
            const target = d.targets?.[req.templateId]
            if (target?.kind !== 'exe') throw new Error('只有 EXE 操作可以用日文語系啟動')
            if (req.value) target.localeEmulator = true
            else delete target.localeEmulator
          })
        )
      case 'chooseLocaleEmulator': {
        if (!this.desktop.setLocaleEmulator) throw new Error('無法設定 Locale Emulator')
        if (req.clear) {
          await this.desktop.setLocaleEmulator(undefined)
          return {}
        }
        const chosen = await this.desktop.choose('exe')
        if (!chosen) return { cancelled: true }
        if (!/^leproc\.exe$/i.test(path.basename(chosen)))
          throw new Error('請選擇 Locale Emulator 的 LEProc.exe')
        const file = await fs.realpath(chosen)
        if (!/^leproc\.exe$/i.test(path.basename(file)) || !(await fs.stat(file)).isFile())
          throw new Error('請選擇 Locale Emulator 的 LEProc.exe')
        await this.desktop.setLocaleEmulator(file)
        return { localeEmulator: file }
      }
      case 'listShortcuts': {
        const row = await this.library.checkedRow(req.rowId)
        const entries = await fs.readdir(row.path, { withFileTypes: true })
        return {
          shortcuts: entries
            .filter((e) => e.isFile() && /\.(lnk|url)$/i.test(e.name))
            .map((e) => e.name)
            .sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true })),
        }
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
      case 'deleteImage': {
        // One record write drops the asset and every reference to it; the file goes only after that write succeeds.
        const { row, record } = await this.record(req.rowId, req.revision),
          asset = record.assets.find((a) => a.assetId === req.assetId)
        if (typeof req.assetId !== 'string' || !asset) throw new Error('圖片不存在')
        const file = path.join(row.path, DATA_DIR, asset.relativePath)
        await safePath(row.path, file)
        record.assets = record.assets.filter((a) => a.assetId !== req.assetId)
        const cellImages = record.details?.cellImages
        if (cellImages)
          for (const [key, id] of Object.entries(cellImages))
            if (id === req.assetId) delete cellImages[key]
        if (record.details?.bannerAssetId === req.assetId) delete record.details.bannerAssetId
        if (record.details) validateDetails(record.details)
        await saveFolder(row.path, record, req.revision)
        // Only a regular file inside this folder's own assets directory that no other entry shares.
        if (!record.assets.some((a) => a.relativePath === asset.relativePath)) {
          try {
            await safePath(row.path, file)
            if ((await fs.lstat(file)).isFile()) await fs.unlink(file)
          } catch {
            // The record is already consistent; a leftover or missing file is harmless.
          }
        }
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
  async overview(
    request: Extract<ExplorerRequest, { action: 'overview' }>
  ): Promise<OverviewResult> {
    return overviewFns.overview(this, request)
  }
  after(snapshot: ReturnType<Library['snapshot']>): ExplorerResponse {
    this.index.sync(snapshot)
    return { snapshot }
  }
  async metadataPreview(source: string, provider?: MetadataSourceId): Promise<MetadataPreview> {
    return sourceFns.metadataPreview(this, source, provider)
  }
  async imageUrlPreview(url: string) {
    return sourceFns.imageUrlPreview(this, url)
  }
  async applyImageUrl(req: Extract<ExplorerRequest, { action: 'imageUrlApply' }>) {
    return sourceFns.applyImageUrl(this, req)
  }
  async applyMetadata(req: Extract<ExplorerRequest, { action: 'metadataApply' }>) {
    return sourceFns.applyMetadata(this, req)
  }
}
