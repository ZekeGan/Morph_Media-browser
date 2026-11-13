import { fmt } from '../shared/message'
// Runs one library:request from the renderer. main.ts checks the sender and the request shape first
// (ipc-requests.ts); this module turns the request into Library, backup and native dialog calls.
import { app, clipboard, dialog, shell, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { imageTypes } from '../shared/images'
import type { Request, Response } from '../shared/model'
import { fieldValue } from '../shared/model'
import { copyableValue } from '../shared/cells'
import { completionNotice } from '../shared/notifications'
import type { nativeText } from '../shared/native-messages'
import type { Library } from './library'
import type { WorkspaceStore } from './workspace'
import {
  applyBackup,
  createKeptBackup,
  deleteBackup,
  exportBackup,
  keptBackup,
  listBackups,
  locateBackupProject,
  previewBackup,
} from './backup'

export interface DispatchContext {
  library: Library
  workspace: WorkspaceStore
  window: () => BrowserWindow
  text: (source: Parameters<typeof nativeText>[0]) => string
}

export function libraryDispatcher({ library, workspace, window, text: nt }: DispatchContext) {
  const rootChoices = new Map<string, { path: string; expires: number }>()
  async function selectFolder() {
    const result = await dialog.showOpenDialog(window(), { properties: ['openDirectory'] })
    return result.canceled ? undefined : result.filePaths[0]
  }
  // The renderer never names paths: a picked folder is remembered here and referred to by a short-lived token.
  function rememberChoice(path: string) {
    for (const [id, item] of rootChoices) if (item.expires < Date.now()) rootChoices.delete(id)
    if (rootChoices.size >= 10) rootChoices.delete(rootChoices.keys().next().value!)
    const token = randomUUID()
    rootChoices.set(token, { path, expires: Date.now() + 60 * 60 * 1000 })
    return { token, path }
  }
  async function chosenRoot(rootToken: string | undefined) {
    const choice = rootToken ? rootChoices.get(rootToken) : undefined
    if (rootToken && (!choice || choice.expires < Date.now()))
      throw new Error('資料夾選擇已失效，請重新選擇')
    return choice?.path ?? (await selectFolder())
  }

  return async function dispatch(request: Request): Promise<Response> {
    let extra: Partial<Response> = {}
    switch (request.action) {
      case 'snapshot':
        break
      case 'copyPath':
        clipboard.writeText((await library.readableRow(request.rowId)).path)
        break
      case 'copyFieldValue': {
        const row = await library.readableRow(request.rowId),
          project = library
            .snapshot()
            .projects.find((ref) => ref.projectId === row.projectId)?.project
        if (!project?.fieldBindings.some((field) => field.attributeId === request.attributeId))
          throw new Error('欄位不存在，無法複製')
        const value = copyableValue(fieldValue(row, request.attributeId))
        if (value === undefined) throw new Error('此欄位沒有可複製的值')
        clipboard.writeText(value)
        break
      }
      case 'scan':
        await library.scan()
        break
      case 'chooseRoot': {
        const root = await selectFolder()
        if (root)
          extra.rootSelection = {
            ...rememberChoice(root),
            existing: await library.projectsAt(root),
          }
        else extra.cancelled = true
        break
      }
      case 'create': {
        const root = await chosenRoot(request.rootToken)
        if (root) {
          await library.create(root, request.input)
          if (request.rootToken) rootChoices.delete(request.rootToken)
        } else extra.cancelled = true
        break
      }
      case 'link': {
        const root = await chosenRoot(request.rootToken)
        if (root) {
          await library.link(root)
          if (request.rootToken) rootChoices.delete(request.rootToken)
        } else extra.cancelled = true
        break
      }
      case 'unlink':
        await library.unlink(request.projectId)
        break
      case 'removeProjectPreview':
        extra.removalPreview = await library.previewRemoveProject(request.projectId)
        break
      case 'removeProject':
        extra.removal = await library.removeProject(request.token)
        break
      case 'fullRemovalPreview':
        extra.fullRemovalPreview = await library.previewFullRemoval(request.projectId)
        break
      case 'fullRemoval':
        extra.removal = await library.fullRemoveProject(request.token)
        break
      case 'deleteFieldPreview':
        extra.fieldDeletionPreview = await library.previewDeleteField(
          request.projectId,
          request.attributeId
        )
        break
      case 'deleteField':
        extra.recoveryPath = await library.deleteField(request.token)
        break
      case 'unifyFieldPreview':
        extra.fieldUnifyPreview = await library.previewUnifyField(
          request.projectId,
          request.attributeId
        )
        break
      case 'unifyField':
        extra.recoveryPath = await library.unifyField(request.token)
        break
      case 'saveProject':
        await library.saveProject(request.project)
        break
      case 'saveFolder':
        await library.saveValues(request.rowId, request.revision, request.values)
        break
      case 'image': {
        const selected = await dialog.showOpenDialog(window(), {
          properties: ['openFile'],
          filters: [{ name: nt('圖片'), extensions: Object.keys(imageTypes) }],
        })
        if (!selected.canceled)
          await library.addImage(
            request.rowId,
            request.revision,
            selected.filePaths[0],
            request.cellId
          )
        else extra.cancelled = true
        break
      }
      case 'open': {
        const row = await library.checkedRow(request.rowId)
        const error = await shell.openPath(row.path)
        if (error) throw new Error(error)
        break
      }
      case 'restore':
        await library.restore(request.rowId)
        break
      case 'restoreProject':
        await library.restoreProject(request.projectId)
        break
      case 'copyIdentity':
        await library.copyIdentity(request.rowId)
        break
      case 'resume':
        await library.resume(request.rowId)
        break
      case 'cleanupPreview':
        extra.preview = await library.previewCleanup(request.rowId, request.scope)
        break
      case 'cleanup':
        extra.cleanup = await library.cleanup(request.token, request.restart)
        break
      case 'createBackup': {
        const ids = library.snapshot().projects.map((p) => p.projectId)
        const result = await createKeptBackup(library, workspace, ids, app.getVersion())
        extra.notice = completionNotice(
          result.projects,
          result.skipped.length,
          '已建立備份' +
            (result.skipped.length ? fmt('\n未備份：{0}', result.skipped.join('、')) : '')
        )
        extra.backups = await listBackups(library)
        break
      }
      case 'listBackups':
        extra.backups = await listBackups(library)
        break
      case 'deleteBackup':
        await deleteBackup(library, request.id)
        extra.backups = await listBackups(library)
        break
      case 'exportBackup': {
        const chosen = await dialog.showOpenDialog(window(), {
          title: nt('選擇備份位置'),
          properties: ['openDirectory', 'createDirectory'],
        })
        if (chosen.canceled || !chosen.filePaths[0]) {
          extra.cancelled = true
          break
        }
        const target = await exportBackup(library, request.id, chosen.filePaths[0])
        extra.notice = completionNotice(1, 0, fmt('已匯出備份：{0}', target))
        break
      }
      case 'previewBackup': {
        let dir = request.id ? await keptBackup(library, request.id) : undefined
        if (!dir) {
          const chosen = await dialog.showOpenDialog(window(), {
            title: nt('選擇備份資料夾'),
            properties: ['openDirectory'],
          })
          if (chosen.canceled || !chosen.filePaths[0]) {
            extra.cancelled = true
            break
          }
          dir = chosen.filePaths[0]
        }
        const ids = library.snapshot().projects.map((p) => p.projectId)
        extra.backup = await previewBackup(library, workspace, ids, dir)
        break
      }
      case 'locateBackup': {
        const root = await selectFolder()
        if (!root) {
          extra.cancelled = true
          break
        }
        extra.backup = await locateBackupProject(library, request.token, request.projectId, root)
        break
      }
      case 'restoreBackup': {
        const result = await applyBackup(
          library,
          workspace,
          () => library.snapshot().projects.map((p) => p.projectId),
          request.token,
          request.settings,
          request.projects
        )
        extra.restored = result
        extra.backups = await listBackups(library)
        const done = result.projects.length + (result.settings ? 1 : 0)
        extra.notice = completionNotice(
          done,
          result.failed.length,
          fmt(
            '已還原：{0}',
            [...(result.settings ? [fmt('設定')] : []), ...result.projects].join('、') || fmt('無')
          ) + (result.failed.length ? fmt('\n未還原：{0}', result.failed.join('\n')) : '')
        )
        break
      }
      default:
        throw new Error('不支援的操作')
    }
    const cleanup = extra.cleanup ?? extra.removal
    if (cleanup?.failed.length) {
      extra.notice = completionNotice(
        cleanup.removed,
        cleanup.failed.length,
        nt('部分資料清理失敗：') + cleanup.failed.join('\n')
      )
    }
    return { snapshot: library.snapshot(), ...extra }
  }
}
