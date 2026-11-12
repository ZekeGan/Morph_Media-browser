import { fmt } from '../shared/message'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import {
  DATA_DIR,
  type FolderRecord,
  type FolderRow,
  type ScanProgress,
  type LinkedProject,
} from '../shared/model'
import {
  atomicJson,
  ensureFolder,
  exists,
  keyPath,
  message,
  missing,
  projectFile,
  readFolder,
  safePath,
  within,
} from './files'
import { hideDirectories } from './hidden'
import { detectGame, insideAppBundle, GameProbeLimit } from './game-detection'
import { isNewerFormat } from '../shared/upgrade'
import type { Library } from './library'

export async function scan(ex: Library) {
  ex.cancelled = false
  const progress: ScanProgress = {
    visited: 0,
    created: 0,
    errors: 0,
    active: true,
    cancelled: false,
  }
  const rows: FolderRow[] = [],
    structure: FolderRow[] = [],
    projects: LinkedProject[] = [],
    problems: string[] = []
  const cache = new Map<string, { record?: FolderRecord; error?: string }>()
  ex.progress({ ...progress })
  for (const ref of ex.refs) {
    const linked: LinkedProject = { ...ref }
    projects.push(linked)
    try {
      linked.project = await ex.currentProject(linked)
      if (await ex.protectedAncestor(ref.root))
        throw new Error('專案位於遊戲／App 保護邊界內；資料保留，請改用外層專案')
      const rootRecord = await readFolder(ref.root)
      if (rootRecord.folderId !== linked.project.rootFolderId)
        throw new Error('根資料夾身分已改變，請重新連結')
    } catch (e) {
      linked.error = message(e)
      problems.push(`${ref.root}: ${message(e)}`)
    }
  }
  const exclusions = new Set<string>()
  for (const linked of projects)
    if (linked.project && !linked.error) {
      const p = linked.project,
        keep: string[] = []
      for (const rel of p.excludedRelativePaths) {
        const target = path.join(linked.root, rel)
        try {
          if (await exists(target)) {
            keep.push(rel)
            exclusions.add(keyPath(target))
          }
        } catch {
          keep.push(rel)
          exclusions.add(keyPath(target))
        }
      }
      if (keep.length !== p.excludedRelativePaths.length) {
        try {
          await atomicJson(
            projectFile(linked.root, p.projectId),
            { ...p, revision: p.revision + 1, excludedRelativePaths: keep },
            p.revision
          )
          p.revision++
          p.excludedRelativePaths = keep
        } catch (e) {
          problems.push(message(e))
        }
      }
    }
  for (const linked of projects) {
    const p = linked.project
    if (!p || linked.error || ex.cancelled) continue
    type ScanEntry = { dir: string; depth: number; readonly?: boolean }
    const walk = async ({ dir, depth, readonly = false }: ScanEntry): Promise<ScanEntry[]> => {
      if (ex.cancelled) return []
      const stopped = exclusions.has(keyPath(dir)),
        cacheKey = keyPath(dir)
      let boundary: FolderRow['boundary'],
        probeError = ''
      try {
        await safePath(linked.root, dir)
        const existing = await readFolder(dir).catch((e) => {
          if (missing(e)) return undefined
          throw e
        })
        if (insideAppBundle(dir)) readonly = true
        if (existing?.details?.boundary?.state !== 'not-game' || insideAppBundle(dir)) {
          const saved = existing?.details?.boundary
          const detected = saved?.state === 'root' ? saved : ((await detectGame(dir)) ?? saved)
          if (detected)
            boundary = { ...detected, state: saved?.state === 'root' ? 'root' : 'candidate' }
        }
      } catch (e) {
        if (e instanceof GameProbeLimit)
          boundary = { state: 'candidate', engines: [], evidence: [e.message] }
        else {
          probeError = message(e)
          // A folder a newer version manages is left as it is, children included, until the app is updated.
          problems.push(
            isNewerFormat(e)
              ? fmt('{0}: 含較新版本的資料，唯讀且不深入', dir)
              : fmt('{0}: 無法確認邊界，停止此分支：{1}', dir, probeError)
          )
          progress.errors++
          progress.visited++
        }
      }
      let result = probeError ? { error: probeError } : readonly ? undefined : cache.get(cacheKey)
      if (!result) {
        try {
          await safePath(linked.root, dir)
          if (stopped || readonly)
            result = {
              record: await readFolder(dir).catch((e) => {
                if (missing(e)) return undefined
                throw e
              }),
            }
          else {
            const found = await ensureFolder(dir, false)
            result = { record: found.record }
            if (found.created) {
              progress.created++
              ex.hiddenKnown.delete(cacheKey)
            }
          }
        } catch (e) {
          result = { error: message(e) }
          progress.errors++
          problems.push(`${dir}: ${message(e)}`)
        }
        if (!readonly) cache.set(cacheKey, result)
        progress.visited++
        if (progress.visited % 20 === 0) ex.progress({ ...progress })
      }
      const row: FolderRow = {
        rowId: createHash('sha256').update(`${p.projectId}\0${cacheKey}`).digest('hex'),
        projectId: p.projectId,
        path: dir,
        name: path.basename(dir) || dir,
        depth,
        ...result,
        stopped,
        duplicate: false,
        readonly,
        boundary,
        structural: p.depth.mode === 'exact' && depth !== p.depth.level,
      }
      structure.push(row)
      if (!row.structural) rows.push(row)
      if (probeError) return []
      if (insideAppBundle(dir)) {
        problems.push(fmt('{0}: 受 App 邊界保護，唯讀且不深入', dir))
        return []
      }
      if (boundary) {
        problems.push(
          fmt(
            '{0}: {1} {2}，內部不寫入{3}',
            dir,
            boundary.engines.join('/'),
            boundary.state === 'root' ? fmt('遊戲根') : fmt('疑似遊戲'),
            row.structural ? fmt('；未達顯示深度') : ''
          )
        )
        if (!result?.record || !p.traversal?.[result.record.folderId]) return []
      }
      if ((!p.scanAll && depth >= p.depth.level) || ex.cancelled) return []
      const children: ScanEntry[] = []
      try {
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
          if (entry.name.toLowerCase() === DATA_DIR) continue
          if (entry.isSymbolicLink()) {
            problems.push(fmt('{0}: 略過連結', path.join(dir, entry.name)))
            continue
          }
          if (entry.isDirectory())
            children.push({
              dir: path.join(dir, entry.name),
              depth: depth + 1,
              readonly: readonly || !!boundary,
            })
        }
      } catch (e) {
        problems.push(`${dir}: ${message(e)}`)
        progress.errors++
      }
      return children
    }
    const pending: ScanEntry[] = [{ dir: linked.root, depth: 1 }]
    // Eight independent directories at most; complete in-flight writes on cancellation.
    while (pending.length && !ex.cancelled)
      pending.push(...(await Promise.all(pending.splice(0, 8).map(walk))).flat())
  }
  if (ex.hide) {
    const dirs = [...cache]
      .filter(([dir, value]) => value.record && !ex.hiddenKnown.has(dir))
      .map(([dir]) => dir)
    const failures = await hideDirectories(dirs),
      failed = new Set(failures.map((f) => keyPath(f.dir)))
    for (const dir of dirs) if (!failed.has(keyPath(dir))) ex.hiddenKnown.add(dir)
    for (const failure of failures) {
      problems.push(fmt('{0}: 設定隱藏屬性失敗，下次掃描重試：{1}', failure.dir, failure.error))
      progress.errors++
    }
  }
  const ids = new Map<string, Set<string>>()
  for (const [dir, value] of cache)
    if (value.record)
      ids.set(value.record.folderId, new Set([...(ids.get(value.record.folderId) ?? []), dir]))
  for (const row of structure)
    if (row.record && (ids.get(row.record.folderId)?.size ?? 0) > 1) {
      row.duplicate = true
      row.error = '重複 ID：暫停寫入，確認搬移或將副本分配新 ID'
    }
  progress.active = false
  progress.cancelled = ex.cancelled
  ex.progress({ ...progress })
  ex.state = {
    projects,
    rows,
    structure,
    problems,
    progress,
  }
  return ex.snapshot()
}

// Navigation is read-only: missing records are reported, never initialized here.
export async function visit(ex: Library, rowId: string) {
  const row = ex.row(rowId),
    root = ex.linked(row.projectId).root
  await safePath(root, row.path)
  if (
    row.readonly ||
    (await ex.protectedAncestor(row.path)) ||
    (ex.state.structure ?? []).some(
      (r) =>
        r.projectId === row.projectId &&
        r.path !== row.path &&
        r.boundary &&
        within(r.path, row.path)
    )
  )
    throw new Error('此資料夾受遊戲邊界保護，無法建立資料')
  if (row.stopped) throw new Error('此資料夾尚未建立資料或已停止記錄')
  let record: FolderRecord
  try {
    record = await readFolder(row.path)
  } catch (e) {
    if (missing(e)) throw new Error('此資料夾尚未建立資料，請先明確重新掃描或建立記錄')
    throw e
  }
  if (row.record && record.folderId !== row.record.folderId)
    throw new Error('目前位置已是另一資料夾，請重新掃描')
  if (row.error || row.duplicate) throw new Error(row.error ?? '記錄需要復原')
  row.record = record
  const saved = record.details?.boundary
  if (saved?.state === 'not-game') row.boundary = undefined
  else
    try {
      const boundary = saved?.state === 'root' ? saved : ((await detectGame(row.path)) ?? saved)
      row.boundary = boundary
        ? { ...boundary, state: saved?.state === 'root' ? 'root' : 'candidate' }
        : undefined
    } catch (error) {
      if (error instanceof GameProbeLimit)
        row.boundary = { state: 'candidate', engines: [], evidence: [error.message] }
      else throw error
    }
  if (row.boundary) {
    const beneath = (item: FolderRow) =>
      item.projectId === row.projectId &&
      keyPath(item.path) !== keyPath(row.path) &&
      within(row.path, item.path)
    const traverse = ex.linked(row.projectId).project!.traversal?.[record.folderId]
    if (!traverse) {
      // A root visit must honor the same stopping rule as scan(). Do not expose
      // internal placeholders, including stale descendants from an earlier scan.
      ex.state.structure = (ex.state.structure ?? ex.state.rows).filter((item) => !beneath(item))
      ex.state.rows = ex.state.rows.filter((item) => !beneath(item))
      return ex.snapshot()
    }
    for (const item of [...(ex.state.structure ?? []), ...ex.state.rows])
      if (beneath(item)) item.readonly = true
  }
  const structure = ex.state.structure ?? ex.state.rows
  for (const entry of await fs.readdir(row.path, { withFileTypes: true })) {
    if (entry.name.toLowerCase() === DATA_DIR || entry.isSymbolicLink() || !entry.isDirectory())
      continue
    const dir = path.join(row.path, entry.name)
    if (structure.some((r) => r.projectId === row.projectId && keyPath(r.path) === keyPath(dir)))
      continue
    await safePath(root, dir)
    let childRecord: FolderRecord | undefined, error: string | undefined
    if (!row.boundary)
      try {
        childRecord = await readFolder(dir)
      } catch (e) {
        if (!missing(e)) error = message(e)
      }
    const duplicate =
      !!childRecord &&
      structure.some(
        (r) => r.record?.folderId === childRecord!.folderId && keyPath(r.path) !== keyPath(dir)
      )
    structure.push({
      rowId: createHash('sha256')
        .update(`${row.projectId}\0${keyPath(dir)}`)
        .digest('hex'),
      projectId: row.projectId,
      path: dir,
      name: entry.name,
      depth: row.depth + 1,
      record: childRecord,
      error: duplicate ? '重複 ID：請先處理副本' : error,
      duplicate,
      stopped: false,
      readonly: !!row.boundary,
    })
  }
  ex.state.structure = structure
  return ex.snapshot()
}
