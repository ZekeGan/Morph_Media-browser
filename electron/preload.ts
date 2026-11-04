import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ExplorerApi } from '../shared/explorer'
import type { MediaApi, Request, Response, ScanProgress } from '../shared/model'
import type { DesktopApi, FolderNavigation, WindowState } from '../shared/workspace'
const api: MediaApi = {
  request: (request: Request): Promise<Response> => ipcRenderer.invoke('library:request', request),
  onProgress(callback) {
    const listener = (_event: Electron.IpcRendererEvent, progress: ScanProgress) =>
      callback(progress)
    ipcRenderer.on('library:progress', listener)
    return () => ipcRenderer.removeListener('library:progress', listener)
  },
}
contextBridge.exposeInMainWorld('media', api)
const desktop: DesktopApi = {
  onFolderNavigation(callback) {
    let pending: { source: 'native' | 'mouse'; delta: number; time: number }[] = []
    const navigate = (navigation: FolderNavigation, source: 'native' | 'mouse') => {
      const time = performance.now()
      pending = pending.filter((event) => time - event.time < 500)
      const duplicate = pending.findIndex(
        (event) => event.source !== source && event.delta === navigation.delta
      )
      if (duplicate !== -1) {
        pending.splice(duplicate, 1)
        return
      }
      pending.push({ source, delta: navigation.delta, time })
      callback(navigation)
    }
    const listener = (_event: Electron.IpcRendererEvent, navigation: FolderNavigation) =>
      navigate(navigation, 'native')
    const mouse = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return
      event.preventDefault()
      // A side press must not dismiss a menu before its native command arrives.
      event.stopPropagation()
      // Some drivers deliver only DOM events. Match native/DOM pairs in either order.
      if (event.type === 'mouseup')
        navigate(
          { delta: event.button === 3 ? -1 : 1, x: event.clientX, y: event.clientY },
          'mouse'
        )
    }
    ipcRenderer.on('folder:navigate', listener)
    for (const type of ['mousedown', 'mouseup', 'auxclick'] as const)
      window.addEventListener(type, mouse, true)
    return () => {
      ipcRenderer.removeListener('folder:navigate', listener)
      for (const type of ['mousedown', 'mouseup', 'auxclick'] as const)
        window.removeEventListener(type, mouse, true)
    }
  },
  workspace: () => ipcRenderer.invoke('workspace:read'),
  updateWorkspace: (command) => ipcRenderer.invoke('workspace:update', command),
  windowAction: (action) => ipcRenderer.invoke('window:action', action),
  onWindowState(callback) {
    const listener = (_event: Electron.IpcRendererEvent, state: WindowState) => callback(state)
    ipcRenderer.on('window:state', listener)
    return () => ipcRenderer.removeListener('window:state', listener)
  },
}
contextBridge.exposeInMainWorld('desktop', desktop)
const explorer: ExplorerApi = {
  request: (request) => ipcRenderer.invoke('explorer:request', request),
  dropSubtitle: (rowId, file) => {
    const filePath = webUtils.getPathForFile(file)
    if (!filePath) return Promise.reject(new Error('需由檔案總管拖入實際字幕檔'))
    return ipcRenderer.invoke('explorer:subtitleDrop', rowId, filePath)
  },
}
contextBridge.exposeInMainWorld('explorer', explorer)
