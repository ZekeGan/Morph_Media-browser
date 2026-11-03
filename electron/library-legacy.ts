import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { defaultCells, type Project, type LegacyPreview } from '../shared/model'
import {
  fingerprint,
  keyPath,
  message,
  readFolder,
  readJson,
  safePath,
  saveFolder,
  within,
} from './files'
import type { LegacyImportResult } from '../shared/model'
import type { Library } from './library'

export async function previewLegacy(ex: Library): Promise<LegacyPreview> {
  const base = path.join(ex.userData, 'app-data'),
    file = path.join(base, 'view.json')
  const views = await readJson(file)
  if (!Array.isArray(views)) throw new Error('舊 view.json 格式無法辨識')
  const token = randomUUID(),
    projects: LegacyPreview['projects'] = [],
    warnings: string[] = []
  for (const view of views) {
    if (
      !view ||
      !/^[\w-]+$/.test(view.id) ||
      typeof view.targetFolderPath !== 'string' ||
      !path.isAbsolute(view.targetFolderPath)
    ) {
      warnings.push('略過無法辨識的舊專案')
      continue
    }
    let count = 0
    try {
      const ids = await readJson(path.join(base, 'viewFolder', `${view.id}.json`))
      if (Array.isArray(ids)) count = ids.length
    } catch (e) {
      warnings.push(`${view.name}: ${message(e)}`)
    }
    projects.push({
      id: view.id,
      name: String(view.name),
      root: view.targetFolderPath,
      values: count,
    })
  }
  warnings.push(
    '只匯入可確認的 STRING 共用值；舊版面及其他型別保留在備份，不視為完整轉換。根路徑失效時先不要匯入。'
  )
  ex.legacyPlan = { token, hash: await fingerprint(file), views }
  return { token, projects, warnings }
}

export async function importLegacy(
  ex: Library,
  token: string,
  ids: string[],
  depth: Project['depth']
): Promise<LegacyImportResult> {
  const plan = ex.legacyPlan,
    base = path.join(ex.userData, 'app-data')
  if (
    !plan ||
    plan.token !== token ||
    plan.hash !== (await fingerprint(path.join(base, 'view.json')))
  )
    throw new Error('匯入預覽已失效')
  const backup = path.join(ex.userData, 'legacy-backups', randomUUID())
  await fs.cp(base, backup, {
    recursive: true,
    dereference: false,
    errorOnExist: true,
    force: false,
  })
  const imported: string[] = [],
    warnings: string[] = []
  for (const view of plan.views.filter((v) => ids.includes(v.id))) {
    try {
      if (!/^[\w-]+$/.test(view.id) || typeof view.targetFolderPath !== 'string')
        throw new Error('舊專案格式不符')
      const root = await fs.realpath(view.targetFolderPath)
      let linked = ex.state.projects.find(
        (r) => keyPath(r.root) === keyPath(root) && r.project?.legacySourceId === view.id
      )
      const createdForImport = !linked
      if (!linked) {
        if (ex.refs.some((r) => keyPath(r.root) === keyPath(root)))
          throw new Error('此根已連結至另一專案，現有資料保留；請先取消連結再匯入')
        await ex.create(root, { name: `${view.name}（匯入）`, depth })
        linked = ex.state.projects.at(-1)!
      }
      const project = linked.project!
      project.legacySourceId = view.id
      const map = new Map<string, { id: string; key: string }>()
      const keys = await readJson(path.join(base, 'viewColumn', `${view.id}.json`))
      for (const key of Array.isArray(keys) ? keys : []) {
        if (typeof key !== 'string' || !/^[\w-]+$/.test(key)) {
          warnings.push('略過無法辨識的舊欄位 key')
          continue
        }
        const col = (await readJson(path.join(base, 'column', `${key}.json`))) as {
          dataSource?: unknown
          dataType?: unknown
          id?: unknown
        } | null
        if (col?.dataSource !== 'USER' || col.dataType !== 'STRING' || typeof col.id !== 'string')
          continue
        const attributeId = createHash('sha256').update(`legacy:${col.id}`).digest('hex')
        map.set(key, { id: attributeId, key })
      }
      if (map.size) {
        project.fieldBindings = [...map.values()].map((f) => ({
          alias: f.key,
          attributeId: f.id,
          type: 'string',
        }))
        project.cells = createdForImport
          ? defaultCells(randomUUID, project.fieldBindings[0].attributeId)
          : project.cells.map((c) =>
              c.kind === 'field-text'
                ? { ...c, attributeId: project.fieldBindings[0].attributeId }
                : c
            )
      }
      await ex.saveProject(project)
      const folders = await readJson(path.join(base, 'viewFolder', `${view.id}.json`))
      for (const folderId of Array.isArray(folders) ? folders : []) {
        try {
          if (typeof folderId !== 'string' || !/^[\w-]+$/.test(folderId))
            throw new Error('舊資料夾 ID 不符')
          const old = (await readJson(path.join(base, 'folder', `${folderId}.json`))) as {
            lastReadPath?: unknown
            cells?: { key?: unknown; value?: unknown }[]
          } | null
          if (typeof old?.lastReadPath !== 'string' || !within(root, old.lastReadPath))
            throw new Error('舊路徑不在已確認根內')
          const legacyPath = old.lastReadPath
          await safePath(root, legacyPath)
          const row = ex.state.rows.find(
            (r) => r.projectId === project.projectId && keyPath(r.path) === keyPath(legacyPath)
          )
          if (!row?.record || row.error) throw new Error('資料夾不在本次成功掃描結果內')
          const values: Record<string, string> = {}
          for (const cell of Array.isArray(old.cells) ? old.cells : []) {
            const binding = typeof cell.key === 'string' ? map.get(cell.key) : undefined
            if (
              binding &&
              typeof cell.value === 'string' &&
              !row.record.attributes.some((a) => a.attributeId === binding.id)
            )
              values[binding.id] = cell.value
          }
          if (Object.keys(values).length) {
            const record = await readFolder(row.path)
            for (const [attributeId, value] of Object.entries(values))
              record.attributes.push({
                attributeId,
                key: [...map.values()].find((v) => v.id === attributeId)!.key,
                type: 'string',
                source: 'legacy-import',
                value,
              })
            await saveFolder(row.path, record, record.revision)
          }
        } catch (e) {
          warnings.push(`${folderId}: ${message(e)}`)
        }
      }
      imported.push(project.name)
    } catch (e) {
      warnings.push(`${view.name}: ${message(e)}`)
    }
  }
  await ex.scan()
  return { imported, warnings, backup }
}
