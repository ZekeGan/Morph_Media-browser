// Run manually for the POC performance gate, not on every code change.
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { filterRows, sortRows } from '../shared/search'
import { Explorer, type DesktopOperations } from '../electron/explorer'
import type { Snapshot } from '../shared/model'

async function measure(operation: () => unknown | Promise<unknown>, count = 24) {
  for (let i = 0; i < 3; i++) await operation()
  const samples: number[] = []
  for (let i = 0; i < count; i++) {
    const started = performance.now()
    await operation()
    samples.push(performance.now() - started)
  }
  samples.sort((a, b) => a - b)
  return {
    medianMs: samples[Math.floor(samples.length / 2)],
    p95Ms: samples[Math.ceil(samples.length * 0.95) - 1],
  }
}

async function searchPipeline(template: Snapshot, root: string, count: number) {
  const projectCount = 20
  const projects = Array.from({ length: projectCount }, (_, i) => ({
    projectId: 'perf-project-' + i,
    root: path.join(root, 'virtual', 'Project-' + i),
    project: {
      ...structuredClone(template.projects[0].project!),
      projectId: 'perf-project-' + i,
      rootFolderId: 'perf-root-' + i,
      fieldBindings: [
        { alias: 'title', attributeId: 'title', type: 'string' },
        { alias: 'tags', attributeId: 'tags', type: 'tags' },
        { alias: 'score', attributeId: 'score', type: 'number' },
      ],
    },
  }))
  const rows = Array.from({ length: count }, (_, i) => {
    const project = projects[i % projectCount],
      name = '作品 ' + String(i).padStart(5, '0')
    return {
      rowId: 'perf-row-' + i,
      projectId: project.projectId,
      path: path.join(project.root, name),
      name,
      depth: 2,
      stopped: false,
      duplicate: false,
      readonly: false,
      record: {
        kind: 'media-viewer.folder' as const,
        schemaVersion: 1 as const,
        folderId: 'perf-folder-' + i,
        revision: 1,
        attributes: [
          {
            attributeId: 'title',
            key: 'title',
            type: 'string',
            value: '作品標題 ' + i,
            source: 'manual',
          },
          {
            attributeId: 'tags',
            key: 'tags',
            type: 'tags',
            value: ['中文', 'game', i % 2 ? '日常' : '奇幻'],
            source: 'manual',
          },
          { attributeId: 'score', key: 'score', type: 'number', value: i % 10, source: 'manual' },
        ],
        projectOverrides:
          i % 7
            ? {}
            : {
                [project.projectId]: [
                  {
                    attributeId: 'title',
                    key: 'title',
                    type: 'string',
                    value: '私有作品 ' + i,
                    source: 'manual',
                  },
                ],
              },
        assets: [],
      },
    }
  })
  const state: Snapshot = { ...template, projects, rows, structure: rows, problems: [] }
  const library = new Library(path.join(root, 'synthetic-' + count), undefined, false)
  // Benchmark only: seed generated records to time the real snapshot/search methods.
  // These virtual paths are never scanned, opened or written.
  ;(library as unknown as { state: Snapshot }).state = state
  const unexpected = async (): Promise<never> => {
    throw new Error('Unexpected desktop operation in search benchmark')
  }
  const desktop: DesktopOperations = {
    choose: unexpected,
    open: unexpected,
    launch: unexpected,
    thumbnail: unexpected,
  }
  const started = performance.now()
  const explorer = new Explorer(library, library.userData, desktop)
  const initialIndexMs = performance.now() - started
  try {
    assert.equal((await explorer.request({ action: 'search', query: '' })).search!.total, count)
    assert.equal(
      (await explorer.request({ action: 'search', query: 'tags:中文' })).search!.total,
      count
    )
    assert.equal(
      (await explorer.request({ action: 'search', query: '', projectId: projects[0].projectId }))
        .search!.total,
      count / projectCount
    )
    const queries = ['作品', '099', 'title:私有', 'tags:中文,game', 'score:5', '-name:099']
    let index = 0
    const snapshot = await measure(() => library.snapshot())
    const sync = await measure(() => explorer.index.sync(state))
    const sql = await measure(() => explorer.index.search(queries[index++ % queries.length]))
    const request = await measure(() =>
      explorer.request({ action: 'search', query: queries[index++ % queries.length] })
    )
    const isolated = library.snapshot()
    isolated.rows[0].name = 'Modified clone'
    assert.equal(library.snapshot().rows[0].name, rows[0].name, 'snapshot must isolate callers')
    return {
      rows: count,
      projects: projectCount,
      synthetic: true,
      initialIndexMs,
      snapshot,
      sync,
      sql,
      request,
    }
  } finally {
    explorer.index.close()
  }
}

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'performance-'))
const count = Number(process.env.POC_PERF_COUNT ?? 1000)
assert.ok([1000, 10000].includes(count))
try {
  const media = path.join(root, 'media')
  await fs.mkdir(media)
  for (let i = 0; i < count; i++)
    await fs.mkdir(path.join(media, `漫畫 ${String(i).padStart(4, '0')}`))
  const library = new Library(path.join(root, 'local'))
  await library.init()
  const start = performance.now()
  const snapshot = await library.create(media, {
    name: '效能測試',
    depth: { mode: 'exact', level: 2 },
  })
  const firstScanMs = performance.now() - start
  assert.equal(snapshot.rows.length, count)
  assert.equal(snapshot.problems.length, 0)
  const rescanStart = performance.now()
  await library.scan()
  const rescanMs = performance.now() - rescanStart
  console.log(JSON.stringify({ phase: 'disk-scan', folders: count, firstScanMs, rescanMs }))
  const clone = await measure(() => library.snapshot())
  const samples = []
  for (let i = 0; i < 100; i++) {
    const startQuery = performance.now()
    const matches = filterRows(sortRows(snapshot.rows), '漫畫')
    assert.equal(matches.length, count)
    samples.push(performance.now() - startQuery)
  }
  samples.sort((a, b) => a - b)
  const pipelines = []
  for (const size of [1000, 10000]) {
    const pipeline = await searchPipeline(snapshot, root, size)
    pipelines.push(pipeline)
    console.log(JSON.stringify({ phase: 'search-pipeline', ...pipeline }))
  }
  const result = {
    folders: count,
    windowsHidden: process.platform === 'win32',
    firstScanMs,
    rescanMs,
    snapshot: clone,
    filterAndSortP95Ms: samples[94],
    pipelines,
    includesIPCOrUIRender: false,
  }
  const report = root + '.json'
  await fs.writeFile(report, JSON.stringify(result, null, 2))
  console.log(result)
  console.log('PERFORMANCE_REPORT ' + report)
  assert.ok(samples[94] < 200, 'POC in-memory filter/sort target exceeded')
} finally {
  if (!(await fs.realpath(root)).startsWith((await fs.realpath(base)) + path.sep))
    throw new Error('Unsafe fixture')
  await fs.rm(root, { recursive: true, force: true })
}
