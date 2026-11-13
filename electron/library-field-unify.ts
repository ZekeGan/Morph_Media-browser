import { fmt } from '../shared/message'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { FieldUnifyPreview, FolderRecord } from '../shared/model'
import { textAsDate, unifyTarget } from '../shared/unifyDates'
import { fingerprint, folderFile, keyPath, readFolder, safePath } from './files'
import { applyMaintenance } from './maintenance'
import type { Library } from './library'

// R-364: a field stored as text in some folders and as a date in others (imports before R-240 kept dates as text) is
// unified in one step: a preview counts what would change and lists what cannot be read, and only a confirmed preview
// writes, through the same guarded maintenance as field deletion (fingerprints checked again, a recovery copy first).
// Only this project's folders change: their shared values and this project's private values; nothing else.
export async function previewUnifyField(
  ex: Library,
  projectId: string,
  attributeId: string
): Promise<FieldUnifyPreview> {
  const ref = ex.refs.find((item) => item.projectId === projectId)
  if (!ref) throw new Error('專案未連結，請重新載入')
  if (await ex.protectedAncestor(ref.root)) throw new Error('專案位於保護邊界內，無法改寫欄位')
  const rows = [
    ...new Map(
      (ex.state.structure ?? ex.state.rows)
        .filter(
          (row) =>
            row.projectId === projectId && row.record && !row.readonly && !row.stopped && !row.error
        )
        .map((row) => [keyPath(row.path), row])
    ).values(),
  ]
  const ownValues = (record: FolderRecord) => [
    ...record.attributes,
    ...(record.projectOverrides[projectId] ?? []),
  ]
  // Each record is fingerprinted before it is read and checked again after, so the plan never pairs old content
  // with the hash of a file saved in between (applying it would undo that save).
  const records = new Map<string, { record: FolderRecord; hash: string }>()
  for (const row of rows) {
    const file = folderFile(row.path)
    await safePath(row.path, file)
    const hash = await fingerprint(file),
      record = await readFolder(row.path)
    if ((await fingerprint(file)) !== hash) throw new Error('資料正在變更，請稍後再預覽')
    records.set(row.path, { record, hash })
  }
  const found = [...records.values()].flatMap(({ record }) =>
    ownValues(record).filter((value) => value.attributeId === attributeId)
  )
  const to = unifyTarget(found.map((value) => value.type))
  if (!to) throw new Error('這個欄位不是文字與日期混用，沒有可統一的值')
  // Shared values are read by every project that links the folder: a project that uses this field as another type
  // (text, for example) would see its values change, so then nothing is changed.
  for (const other of ex.state.projects) {
    const binding = other.project?.fieldBindings.find((field) => field.attributeId === attributeId)
    if (binding && binding.type !== to)
      throw new Error(fmt('專案「{0}」把這個欄位當成其他型別使用，不能統一', other.project!.name))
  }
  const token = randomUUID(),
    preview: FieldUnifyPreview = {
      token,
      attributeId,
      name: found[0]?.key ?? attributeId,
      to,
      folders: 0,
      values: 0,
      unreadable: [],
      recoveryPath: path.join(ex.userData, 'maintenance-backups', token),
    }
  const changes: Parameters<typeof applyMaintenance>[0] = [],
    guards: { root: string; path: string; hash: string }[] = []
  for (const [folder, { record, hash }] of records) {
    const guard = { root: folder, path: folderFile(folder), hash }
    let changed = 0
    const convert = (values: FolderRecord['attributes']) =>
      values.map((value) => {
        if (value.attributeId !== attributeId || value.type !== 'string') return value
        const date = textAsDate(value.value, to)
        if (date === undefined) {
          if (
            typeof value.value === 'string' &&
            value.value.trim() &&
            preview.unreadable.length < 50
          )
            preview.unreadable.push({ path: folder, value: value.value.slice(0, 200) })
          return value
        }
        changed++
        return { ...value, type: to, value: date }
      })
    const next: FolderRecord = {
      ...record,
      attributes: convert(record.attributes),
      projectOverrides: record.projectOverrides[projectId]
        ? { ...record.projectOverrides, [projectId]: convert(record.projectOverrides[projectId]) }
        : record.projectOverrides,
    }
    if (!changed) continue
    guards.push(guard)
    changes.push({ ...guard, value: { ...next, revision: record.revision + 1 } })
    preview.folders++
    preview.values += changed
  }
  ex.unifyPlans.clear()
  ex.unifyPlans.set(token, {
    changes,
    guards,
    refs: JSON.stringify(ex.refs),
    scope: ex.fieldScope(),
  })
  return preview
}

export async function unifyField(ex: Library, token: string) {
  const plan = ex.unifyPlans.get(token)
  ex.unifyPlans.delete(token)
  if (!plan || plan.refs !== JSON.stringify(ex.refs) || plan.scope !== ex.fieldScope())
    throw new Error('欄位統一預覽已失效，請重新預覽')
  if (!plan.changes.length) throw new Error('沒有可統一的值')
  const check = async () => {
    for (const guard of plan.guards) {
      await safePath(guard.root, guard.path)
      if ((await fingerprint(guard.path)) !== guard.hash)
        throw new Error('預覽後資料已變更，未執行統一')
    }
    for (const root of new Set(plan.changes.map((change) => change.root)))
      if (await ex.protectedAncestor(root)) throw new Error('保護邊界已變更，未執行統一')
  }
  await check()
  const recovery = await ex.maintenanceRecovery(
    token,
    ex.refs.map((ref) => ref.root)
  )
  await applyMaintenance(
    plan.changes,
    recovery,
    ex.userData,
    ex.refs.map((ref) => ref.root),
    check
  )
  await ex.scan()
  return recovery
}
