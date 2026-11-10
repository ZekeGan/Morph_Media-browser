import { calendarDate } from '../shared/fields'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { Snapshot } from '../shared/model'
import { fieldValue } from '../shared/model'
import type { SearchResult } from '../shared/explorer'
import {
  parseQuery,
  describeQuery,
  normalizeValue,
  queryField,
  restoreQuery,
  queryText,
  type StableQuery,
} from '../shared/query'
export class SearchIndex {
  private db: DatabaseSync
  private versions = new Map<string, string>()
  private snapshot?: Snapshot
  private fields: SearchResult['fields'] = []
  constructor(readonly file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    try {
      this.db = new DatabaseSync(file)
      this.db.exec('PRAGMA quick_check;')
    } catch {
      if (fs.existsSync(file)) fs.renameSync(file, file + '.damaged-' + Date.now())
      this.db = new DatabaseSync(file)
    }
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS docs(id TEXT PRIMARY KEY,project TEXT,name TEXT,path TEXT);
      CREATE TABLE IF NOT EXISTS vals(doc TEXT REFERENCES docs(id) ON DELETE CASCADE,field TEXT,key TEXT,type TEXT,text TEXT);
      CREATE INDEX IF NOT EXISTS by_project ON docs(project); CREATE INDEX IF NOT EXISTS by_field ON vals(field,doc); CREATE INDEX IF NOT EXISTS by_doc ON vals(doc,field);
      CREATE TABLE IF NOT EXISTS grams(gram TEXT,doc TEXT REFERENCES docs(id) ON DELETE CASCADE,field TEXT,PRIMARY KEY(gram,doc,field));
      CREATE INDEX IF NOT EXISTS grams_doc ON grams(doc);
      DELETE FROM grams; DELETE FROM vals; DELETE FROM docs;`)
  }
  close() {
    this.db.close()
  }
  sync(snapshot: Snapshot, force = false) {
    this.snapshot = snapshot
    const keys = new Map<string, SearchResult['fields'][number]>()
    const projects = new Map(
      snapshot.projects.map((linked) => [
        linked.projectId,
        {
          project: linked.project,
          bindings: new Map(
            linked.project?.fieldBindings.map((field) => [
              field.attributeId,
              {
                alias: field.alias,
                key: field.alias.toLocaleLowerCase(),
              },
            ])
          ),
        },
      ])
    )
    const rows = snapshot.rows,
      present = new Set(rows.map((r) => r.rowId))
    const insertDoc = this.db.prepare('INSERT INTO docs VALUES(?,?,?,?)'),
      insertVal = this.db.prepare('INSERT INTO vals VALUES(?,?,?,?,?)'),
      insertGram = this.db.prepare('INSERT OR IGNORE INTO grams VALUES(?,?,?)'),
      remove = this.db.prepare('DELETE FROM docs WHERE id=?')
    const nextVersions = new Map(this.versions)
    this.db.exec('BEGIN')
    try {
      for (const id of this.versions.keys())
        if (!present.has(id)) {
          remove.run(id)
          nextVersions.delete(id)
        }
      for (const row of rows) {
        const linked = projects.get(row.projectId),
          project = linked?.project
        const values: { field: string; key: string; type: string; value: unknown }[] = [
          { field: '@name', key: 'folder_name', type: 'string', value: row.name },
          { field: '@path', key: 'path', type: 'string', value: row.path },
        ]
        const all = new Map(
          [
            ...(row.record?.attributes ?? []),
            ...(row.record?.projectOverrides[row.projectId] ?? []),
          ].map((a) => [a.attributeId, a])
        )
        for (const a of all.values())
          if (
            ['string', 'tags', 'number', 'datetime', 'boolean', 'enum', 'url', 'date'].includes(
              a.type
            )
          ) {
            const binding = linked?.bindings.get(a.attributeId),
              alias = binding?.alias ?? a.key
            values.push({
              field: a.attributeId,
              key: binding?.key ?? alias.toLocaleLowerCase(),
              type: a.type,
              value: fieldValue(row, a.attributeId),
            })
            keys.set(`${row.projectId}/${a.attributeId}`, {
              key: alias,
              type: a.type,
              projectId: row.projectId,
              attributeId: a.attributeId,
            })
          }
        for (const f of project?.fieldBindings ?? [])
          keys.set(`${row.projectId}/${f.attributeId}`, {
            key: f.alias,
            type: f.type,
            projectId: row.projectId,
            attributeId: f.attributeId,
          })
        // A field group can be searched by its name; any member holding the value finds the folder.
        for (const g of project?.fieldGroups ?? [])
          keys.set(`${row.projectId}/${g.groupId}`, {
            key: g.name,
            type:
              project!.fieldBindings.find((f) => f.attributeId === g.memberIds[0])?.type ??
              'string',
            projectId: row.projectId,
            attributeId: g.groupId,
          })
        // Compare all searchable inputs before normalizing text/grams. This still
        // detects in-place value, path and alias edits without relying on revisions.
        const signature = createHash('sha256')
          .update(JSON.stringify([row.projectId, values]))
          .digest('hex')
        if (!force && this.versions.get(row.rowId) === signature) continue
        remove.run(row.rowId)
        insertDoc.run(row.rowId, row.projectId, row.name, row.path)
        for (const v of values) {
          const text = normalizeValue(v.value, v.type)
          insertVal.run(row.rowId, v.field, v.key, v.type, text)
          const chars = [...text]
          const grams = new Set<string>()
          for (let i = 0; i < chars.length - 2; i++) grams.add(chars.slice(i, i + 3).join(''))
          for (const gram of grams) insertGram.run(gram, row.rowId, v.field)
        }
        nextVersions.set(row.rowId, signature)
      }
      this.db.exec('COMMIT')
      this.versions = nextVersions
      this.fields = [...keys.values()]
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }
  search(
    query: string,
    projectId?: string,
    offset = 0,
    limit = 100,
    saved?: StableQuery
  ): SearchResult {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 500
    )
      throw new Error('查詢分頁不合法')
    if (projectId && !this.snapshot?.projects.some((p) => p.projectId === projectId))
      throw new Error('搜尋專案未連結')
    const params: (string | number)[] = [],
      available = this.fields.filter((f) => !projectId || f.projectId === projectId)
    // A field that a cell lists first with fallback fields also finds what is stored in those fallbacks (one value
    // that may come from several source sites). Only the set of fields in the query grows; nothing more is indexed.
    const chains = new Map<string, Set<string>>(),
      groupMembers = new Map<string, string[]>()
    for (const linked of this.snapshot?.projects ?? [])
      for (const group of linked.project?.fieldGroups ?? []) {
        chains.set(group.groupId, new Set(group.memberIds))
        groupMembers.set(group.groupId, group.memberIds)
      }
    for (const linked of this.snapshot?.projects ?? [])
      for (const cells of linked.project
        ? [
            linked.project.cells,
            ...(linked.project.layoutPresets?.map((preset) => preset.cells) ?? []),
            ...Object.values(linked.project.contentCells ?? {}),
          ]
        : [])
        for (const cell of cells)
          if (cell.attributeId && cell.fallbackIds?.length) {
            const set = chains.get(cell.attributeId) ?? new Set<string>()
            for (const id of cell.fallbackIds) set.add(id)
            chains.set(cell.attributeId, set)
          }
    const yesNoWording = (text: string, ids: string[]) => {
      const key = text.trim().toLocaleLowerCase()
      // Only the searched project's wording counts (the same field ID can carry other words elsewhere).
      for (const linked of this.snapshot?.projects ?? [])
        for (const field of !projectId || linked.projectId === projectId
          ? (linked.project?.fieldBindings ?? [])
          : [])
          if (ids.includes(field.attributeId)) {
            if (field.trueLabel?.trim().toLocaleLowerCase() === key) return 'true'
            if (field.falseLabel?.trim().toLocaleLowerCase() === key) return 'false'
          }
      return text
    }
    const groups = saved ? restoreQuery(saved, available) : parseQuery(query)
    const conditions = groups
      .map(
        (g) =>
          '(' +
          (g
            .map((t) => {
              let fields: string[] | undefined,
                type = 'string'
              if (t.fieldId) {
                fields = [t.fieldId]
                type = t.expectedType ?? 'string'
              } else if (t.key) {
                const found = queryField(t.key, available)
                fields = [found.field]
                type = found.type
              }
              const comparison =
                fields && ['number', 'date', 'datetime'].includes(type)
                  ? /^(>=|<=|>|<|=)(.+)$/.exec(t.value)
                  : null
              if (comparison) {
                const value = normalizeValue(comparison[2], type)
                if (type === 'number' && (!value.trim() || !Number.isFinite(Number(value))))
                  throw new Error('數值比較條件不合法')
                if (type === 'date' && value.length !== 10) throw new Error('日期比較條件不合法')
                if (
                  type !== 'number' &&
                  (!calendarDate(value.slice(0, 10)) ||
                    !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)?$/i.test(value))
                )
                  throw new Error('日期比較條件不合法')
                const compared = groupMembers.get(fields![0]) ?? [fields![0]]
                params.push(...compared, type === 'number' ? Number(value) : value)
                const column =
                  type === 'number'
                    ? 'CAST(v.text AS REAL)'
                    : value.length === 10
                      ? 'substr(v.text,1,10)'
                      : 'v.text'
                return (
                  (t.exclude ? 'NOT ' : '') +
                  'EXISTS(SELECT 1 FROM vals v WHERE v.doc=d.id AND v.field IN (' +
                  compared.map(() => '?').join(',') +
                  ") AND v.text IS NOT NULL AND v.text<>'' AND " +
                  column +
                  ' ' +
                  comparison[1] +
                  ' ?)'
                )
              }
              // A yes/no field can also be searched by its own wording (R-234).
              const wording =
                type === 'boolean' && fields
                  ? yesNoWording(t.value, [fields[0], ...(chains.get(fields[0]) ?? [])])
                  : t.value
              const value = normalizeValue(wording, type),
                gram = [...value].slice(0, 3).join('')
              let sql = 'v.doc=d.id'
              if (fields) {
                const searched = [fields[0], ...(chains.get(fields[0]) ?? [])]
                sql += ` AND v.field IN (${searched.map(() => '?').join(',')})`
                params.push(...searched)
              }
              if ([...value].length >= 3) {
                sql +=
                  ' AND EXISTS(SELECT 1 FROM grams g WHERE g.gram=? AND g.doc=v.doc AND g.field=v.field)'
                params.push(gram)
              }
              sql += ' AND instr(v.text,?)>0'
              params.push(value)
              return `${t.exclude ? 'NOT ' : ''}EXISTS(SELECT 1 FROM vals v WHERE ${sql})`
            })
            .join(' AND ') || '1') +
          ')'
      )
      .join(' OR ')
    const where = (projectId ? 'd.project=? AND ' : '') + `(${conditions})`,
      args = projectId ? [projectId, ...params] : params
    const total = Number(
      this.db.prepare(`SELECT count(*) n FROM docs d WHERE ${where}`).get(...args)!.n
    )
    const hits = this.db
      .prepare(
        `SELECT id rowId,project projectId,name,path FROM docs d WHERE ${where} ORDER BY name COLLATE NOCASE,id LIMIT ? OFFSET ?`
      )
      .all(...args, limit, offset)
      .map((v) => ({
        rowId: String(v.rowId),
        projectId: String(v.projectId),
        name: String(v.name),
        path: String(v.path),
        matched: this.db
          .prepare('SELECT key,text FROM vals WHERE doc=?')
          .all(String(v.rowId))
          .filter((v) => groups.flat().some((t) => !t.exclude && String(v.text).includes(t.value)))
          .map((v) => String(v.key)),
      }))
    return {
      ...(saved ? { resolvedQuery: queryText(groups) } : {}),
      hits,
      total,
      fields: available,
      incomplete:
        this.snapshot?.projects
          .filter((p) => p.error && (!projectId || p.projectId === projectId))
          .map((p) => p.root) ?? [],
      parsed: describeQuery(groups),
      index: 'SQLite · 三字索引／短字範圍掃描',
    }
  }
}
