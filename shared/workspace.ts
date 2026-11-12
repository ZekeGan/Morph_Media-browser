import type { BrowseState } from './explorer'
import type { ThemeId } from './themes'
import type { LocaleId } from './locales'
// What a player does when a track or video ends (R-268).
export const playOrders = ['stop', 'next', 'all', 'one'] as const
export type PlayOrder = (typeof playOrders)[number]
export const isPlayOrder = (value: unknown): value is PlayOrder =>
  playOrders.includes(value as PlayOrder)
// Seconds played in total, sessions counted, and when the last session ended (ISO time).
export interface PlayRecord {
  total: number
  count: number
  last: string
}
export interface ProjectPlacement {
  groupId: string | null
  favorite: boolean
  addedOrder: number
}
export interface WorkspacePrefs {
  schemaVersion: 1
  revision: number
  nextOrder: number
  sidebarWidth: number
  sidebarHidden: boolean
  collapsed: { favorites: boolean; recent: boolean; unclassified?: boolean }
  sections?: string[]
  projectOrder?: Record<string, string[]>
  browse?: Record<string, BrowseState>
  theme?: ThemeId
  locale?: LocaleId
  videoAudio?: { volume: number; muted: boolean }
  playOrder?: PlayOrder
  fileVisibility?: { hidden: boolean; dotfiles: boolean }
  // Locale Emulator's LEProc.exe (R-309), chosen in a main-process dialog; only main reads it to start a game.
  localeEmulator?: string
  // R-320: the program that plays .swf games (Flash Player projector or Ruffle), chosen like LEProc.exe.
  flashPlayer?: string
  // Play time of games started from M:orph (R-308), by folder identity. Local only, never in portable records.
  playtime?: Record<string, PlayRecord>
  groups: { id: string; name: string; collapsed: boolean }[]
  projects: Record<string, ProjectPlacement>
}
export interface SettingsPackage {
  kind: 'media-viewer.settings'
  schemaVersion: 1
  exportedAt: string
  prefs: Partial<WorkspacePrefs>
}
export interface SettingsImportPreview {
  token: string
  changes: { field: string; current: unknown; incoming: unknown }[]
}
export interface WorkspaceState {
  prefs: WorkspacePrefs
  error?: string
  settingsPackage?: SettingsPackage
  importPreview?: SettingsImportPreview
  backupId?: string
  backups?: { id: string; createdAt: string }[]
  cancelled?: boolean
}
export type WorkspaceCommand =
  | { action: 'exportPackage' }
  | { action: 'previewPackage'; value: unknown }
  | { action: 'applyPackage'; token: string; mode: 'merge' | 'replace' }
  | { action: 'restorePackage'; backupId: string }
  | { action: 'listBackups' }
  | { action: 'videoAudio'; value: { volume: number; muted: boolean } }
  | { action: 'playOrder'; value: PlayOrder }
  | { action: 'fileVisibility'; value: { hidden: boolean; dotfiles: boolean } }
  | { action: 'appearance'; theme: ThemeId; locale: LocaleId }
  | { action: 'createGroup'; name: string }
  | { action: 'renameGroup'; id: string; name: string }
  | { action: 'removeGroup'; id: string }
  | { action: 'collapseGroup'; id: string; value: boolean }
  | { action: 'moveProject'; projectId: string; groupId: string | null; beforeId?: string }
  | { action: 'reorderSections'; ids: string[] }
  | { action: 'reorderProject'; projectId: string; sectionId: string; beforeId?: string }
  | { action: 'favorite'; projectId: string; value: boolean }
  | { action: 'collapseSection'; section: 'favorites' | 'unclassified'; value: boolean }
  | { action: 'layout'; sidebarWidth?: number; sidebarHidden?: boolean }
  | { action: 'browse'; projectId: string; value: BrowseState }
export type WindowAction = 'state' | 'minimize' | 'toggleMaximize' | 'close'
export interface WindowState {
  maximized: boolean
  visible?: boolean
}
export interface FolderNavigation {
  delta: -1 | 1
  x: number
  y: number
}
export interface DesktopApi {
  workspace(): Promise<WorkspaceState>
  updateWorkspace(command: WorkspaceCommand): Promise<WorkspaceState>
  windowAction(action: WindowAction): Promise<WindowState>
  onWindowState(callback: (state: WindowState) => void): () => void
  onFolderNavigation(callback: (navigation: FolderNavigation) => void): () => void
}
export const defaultWorkspace = (): WorkspacePrefs => ({
  schemaVersion: 1,
  revision: 0,
  nextOrder: 1,
  sidebarWidth: 240,
  sidebarHidden: false,
  collapsed: { favorites: false, recent: false, unclassified: false },
  sections: ['favorites', 'unclassified'],
  projectOrder: {},
  groups: [],
  projects: {},
})
export function sectionIds(prefs: WorkspacePrefs) {
  const all = ['favorites', ...prefs.groups.map((g) => g.id), 'unclassified']
  return [
    ...(prefs.sections ?? []).filter((id) => all.includes(id)),
    ...all.filter((id) => !prefs.sections?.includes(id)),
  ]
}
export function sectionProjects(ids: string[], prefs: WorkspacePrefs, section: string) {
  const order = prefs.projectOrder?.[section] ?? []
  return ids
    .filter(
      (id) =>
        prefs.projects[id] &&
        (section === 'favorites'
          ? prefs.projects[id].favorite
          : section === 'unclassified'
            ? !prefs.projects[id].groupId
            : prefs.projects[id].groupId === section)
    )
    .sort(
      (a, b) =>
        (order.indexOf(a) < 0 ? Infinity : order.indexOf(a)) -
          (order.indexOf(b) < 0 ? Infinity : order.indexOf(b)) ||
        prefs.projects[a].addedOrder - prefs.projects[b].addedOrder ||
        a.localeCompare(b)
    )
}
