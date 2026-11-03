import { defaultCells, type FolderRecord, type Project } from '../../shared/model'
import { defaultSubtitle, type FolderDetails } from '../../shared/explorer'

export function modelDetails(): FolderDetails {
  return {
    schemaVersion: 1,
    boundary: { state: 'root', engines: ['Example'], evidence: ['controlled fixture'] },
    bannerAssetId: 'cover',
    cellImages: { slot: 'cover' },
    reading: { page: 2, fit: 'width', spread: true, rtl: false, firstSingle: true },
    targets: { play: { kind: 'exe', path: 'Game.exe', relative: true, args: ['--windowed'] } },
    subtitles: [{ id: 'sub', name: 'example.srt', relativePath: 'subtitles/sub.srt' }],
    playback: { video: { time: 12.5, subtitle: 'sub', settings: { sub: defaultSubtitle() } } },
  }
}

export function modelFolder(): FolderRecord {
  return {
    kind: 'media-viewer.folder',
    schemaVersion: 1,
    folderId: 'folder',
    revision: 1,
    attributes: [
      { attributeId: 'title', key: 'TITLE', type: 'string', source: 'manual', value: '作品' },
    ],
    projectOverrides: {
      project: [
        { attributeId: 'title', key: 'TITLE', type: 'string', source: 'manual', value: '私有' },
      ],
    },
    assets: [
      {
        assetId: 'cover',
        relativePath: 'assets/cover.png',
        originalName: 'cover.png',
        mediaType: 'image/png',
      },
    ],
    details: modelDetails(),
  }
}

export function modelProject(): Project {
  let id = 0
  const cells = defaultCells(() => 'cell-' + id++, 'title')
  return {
    kind: 'media-viewer.project',
    schemaVersion: 1,
    projectId: 'project',
    rootFolderId: 'folder',
    revision: 1,
    name: '受控專案',
    depth: { mode: 'through', level: 3 },
    fieldBindings: [{ alias: 'TITLE', attributeId: 'title', type: 'string' }],
    cells,
    list: { itemsPerRow: 3, pageSize: 100 },
    excludedRelativePaths: ['Private'],
    scanAll: true,
    cardView: { mode: 'multi', level: 'all' },
    layoutPresets: [{ id: 'preset', name: 'Default', cells: structuredClone(cells) }],
    activeLayoutId: 'preset',
    contentCells: { manga: structuredClone(cells) },
    traversal: { folder: true },
    actionTemplates: [{ id: 'play', label: 'Play', kind: 'exe', color: '#ffffff' }],
    savedSearches: [{ id: 'search', name: 'Saved', query: 'name:作品' }],
  }
}
