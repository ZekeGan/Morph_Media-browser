import { randomUUID } from 'node:crypto'
import { type ExplorerRequest, type OverviewResult } from '../shared/explorer'
import { mediaNames } from './media-files'
import type { Explorer } from './explorer'

export async function overview(
  ex: Explorer,
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
  const root = await ex.library.readableRow(request.rowId),
    snapshot = ex.library.snapshot()
  const notices: string[] = [],
    entries: OverviewResult['entries'] = []
  for (const [token, session] of ex.overviewPages)
    if (session.expires < Date.now()) ex.overviewPages.delete(token)
  let plan = request.cursor ? ex.overviewPages.get(request.cursor) : undefined
  if (request.cursor) {
    if (
      !plan ||
      plan.rootId !== root.rowId ||
      plan.folderId !== root.record!.folderId ||
      plan.scope !== request.scope
    )
      throw new Error('檔案總覽批次已失效，請重新整理')
    ex.overviewPages.delete(request.cursor)
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
      const result = await ex.content(rowId, limit - entries.length, plan!.contentCursor)
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
    while (ex.overviewPages.size >= 10)
      ex.overviewPages.delete(ex.overviewPages.keys().next().value!)
    ex.overviewPages.set(nextCursor, plan!)
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
