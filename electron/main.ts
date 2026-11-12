import {
  app,
  safeStorage,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  net,
  protocol,
  screen,
  shell,
} from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Library } from './library'
import { safePath } from './files'
import type { Response } from '../shared/model'
import { WorkspaceStore } from './workspace'
import type { WindowAction } from '../shared/workspace'
import { Explorer } from './explorer'
import { KeyStore } from './keys'
import { warmHiddenHelper } from './hidden'
import type { LocaleId } from '../shared/locales'
import { nativeText } from '../shared/native-messages'
import { libraryDispatcher } from './library-dispatch'
import { isExplorerRequest, isLibraryRequest, isWorkspaceCommand, ref } from './ipc-requests'

const directory = path.dirname(fileURLToPath(import.meta.url))
// Taskbar and Alt+Tab icon; a build without the build/ folder simply keeps the default icon.
const appIcon = path.join(directory, '../../build/icon.ico')
const rendererRoot = path.resolve(directory, '../renderer')
protocol.registerSchemesAsPrivileged(
  ['app', 'media'].map((scheme) => ({
    scheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  }))
)
let win: BrowserWindow | undefined
let library: Library
let workspace: WorkspaceStore
let pendingRequests = 0
let nativeLocale: LocaleId = 'zh-TW'
const nt = (source: Parameters<typeof nativeText>[0]) => nativeText(source, nativeLocale)
const devUrl = process.env.ELECTRON_RENDERER_URL
function trusted(url: string) {
  try {
    return devUrl
      ? new URL(url).origin === new URL(devUrl).origin
      : new URL(url).protocol === 'app:' && new URL(url).hostname === 'ui'
  } catch {
    return false
  }
}
// Automated UI tests run the real app. Unless MEDIA_VIEWER_TEST_VISIBLE=1 their window stays out of the way:
// fully transparent, click-through, never activated and not in the taskbar. It is still a normal visible window to
// Chromium, so rendering and screenshots keep their normal speed (an off-screen window was ten times slower). Real use and `pnpm dev` are unaffected.
const quietTest =
  !!process.env.MEDIA_VIEWER_TEST_DATA && process.env.MEDIA_VIEWER_TEST_VISIBLE !== '1'
// MEDIA_VIEWER_TEST_VISIBLE=1 lets you watch: half transparent, click-through and never activated, so the window
// you are working in keeps the focus and the clicks.
const watchTest = !!process.env.MEDIA_VIEWER_TEST_DATA && !quietTest
if (quietTest || watchTest) {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
}
// The product is called M:orph now, but its data stays in the original folder so no settings or index are lost.
if (process.env.MEDIA_VIEWER_TEST_DATA)
  app.setPath('userData', path.resolve(process.env.MEDIA_VIEWER_TEST_DATA))
else app.setPath('userData', path.join(app.getPath('appData'), 'media-viewer'))
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    win?.restore()
    win?.focus()
  })
  app
    .whenReady()
    .then(async () => {
      library = new Library(app.getPath('userData'), (progress) =>
        win?.webContents.send('library:progress', progress)
      )
      let startupError = ''
      try {
        await library.init()
      } catch (e) {
        startupError = String(e)
        console.error(e)
      }
      workspace = new WorkspaceStore(
        app.getPath('userData'),
        process.env.MEDIA_VIEWER_TEST_DATA ? ['zh-TW'] : app.getPreferredSystemLanguages()
      )
      await workspace.init()
      const checkSender = (event: Electron.IpcMainInvokeEvent) => {
        if (
          event.sender !== win?.webContents ||
          event.senderFrame !== win.webContents.mainFrame ||
          !trusted(event.senderFrame.url)
        )
          throw new Error('拒絕未授權的操作')
      }
      const dispatch = libraryDispatcher({
        library,
        workspace,
        window: () => win!,
        text: nt,
      })
      const projectIds = () => library.snapshot().projects.map((p) => p.projectId)
      nativeLocale = (await workspace.read(projectIds())).prefs.locale ?? 'zh-TW'
      const explorer = new Explorer(library, app.getPath('userData'), {
        external: (url) => shell.openExternal(url),
        choose: async (kind, initialPath) => {
          const result = await dialog.showOpenDialog(win!, {
            defaultPath: initialPath,
            properties: [kind === 'folder' ? 'openDirectory' : 'openFile'],
            ...(['folder', 'file'].includes(kind)
              ? {}
              : {
                  filters: [
                    {
                      name: nt(kind === 'subtitle' ? '字幕' : '程式'),
                      extensions:
                        kind === 'game'
                          ? ['exe', 'swf']
                          : kind === 'exe'
                            ? ['exe']
                            : ['srt', 'vtt'],
                    },
                  ],
                }),
          })
          return result.canceled ? undefined : result.filePaths[0]
        },
        open: async (file) => {
          const error = await shell.openPath(file)
          if (error) throw new Error(error)
        },
        reveal: (file) => shell.showItemInFolder(file),
        launch: (file, args, onExit) =>
          new Promise<void>((resolve, reject) => {
            const child = spawn(file, args, {
              cwd: path.dirname(file),
              shell: false,
              detached: true,
              stdio: 'ignore',
              windowsHide: false,
            })
            child.once('error', reject)
            child.once('spawn', () => {
              // R-308: only this process is followed; if M:orph closes first, the session is not counted.
              const started = Date.now()
              if (onExit) child.once('exit', () => onExit(started, Date.now()))
              child.unref()
              resolve()
            })
          }),
        protocolReady: (scheme) => !!app.getApplicationNameForProtocol(scheme + '://'),
        localeEmulator: () => workspace.localeEmulatorPath(),
        setLocaleEmulator: async (file) => {
          await workspace.setLocaleEmulator(file)
        },
        flashPlayer: () => workspace.flashPlayerPath(),
        setFlashPlayer: async (file) => {
          await workspace.setFlashPlayer(file)
        },
        keyStore: new KeyStore(app.getPath('userData'), {
          // Linux without a keyring falls back to plain text; keys are not stored then.
          available: () =>
            safeStorage.isEncryptionAvailable() &&
            (process.platform !== 'linux' ||
              safeStorage.getSelectedStorageBackend?.() !== 'basic_text'),
          encrypt: (text) => safeStorage.encryptString(text),
          decrypt: (data) => safeStorage.decryptString(data),
        }),
        played: (folderId, started, ended) => {
          void workspace.recordPlay(folderId, started, ended).catch(() => {})
        },
        thumbnail: async (file, mime, url) => {
          if (mime?.startsWith('video/')) {
            // A box, not a fixed size: the shell keeps the aspect ratio. 160x90 looked blurry in tiles.
            const image = await nativeImage.createThumbnailFromPath(file, {
              width: 480,
              height: 480,
            })
            if (image.isEmpty()) throw new Error('無影片縮圖')
            return image.toJPEG(85)
          }
          if (
            !win ||
            win.isDestroyed() ||
            !trusted(win.webContents.getURL()) ||
            !url?.startsWith('media://file/')
          )
            throw new Error('圖片解碼器尚未就緒')
          // Decode asynchronously from the already-scoped stream. No original image
          // buffer/base64 crosses IPC, and full bitmap decoding stays off main.
          const bytes = await win.webContents.executeJavaScript(
            // i18n-ignore: script source run in the hidden window; its two messages have their own keys
            `(async()=>{const response=await fetch(${JSON.stringify(url)});if(!response.ok)throw new Error('圖片來源已失效');const bitmap=await createImageBitmap(await response.blob(),{resizeWidth:320,resizeQuality:'low'});try{if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>100000000)throw new Error('圖片尺寸過大');const scale=Math.min(1,320/Math.max(bitmap.width,bitmap.height));const canvas=new OffscreenCanvas(Math.max(1,Math.round(bitmap.width*scale)),Math.max(1,Math.round(bitmap.height*scale)));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);return Array.from(new Uint8Array(await(await canvas.convertToBlob({type:'image/jpeg',quality:.78})).arrayBuffer()))}finally{bitmap.close()}})()`
          )
          return Buffer.from(bytes)
        },
      })
      warmHiddenHelper()
      app.on('will-quit', () => explorer.index.close())
      ipcMain.handle('explorer:request', async (event, request: unknown) => {
        checkSender(event)
        if (!isExplorerRequest(request)) throw new Error('無效的操作')
        pendingRequests++
        try {
          return await library.run(() => explorer.request(request))
        } finally {
          pendingRequests--
        }
      })
      ipcMain.handle('explorer:subtitleDrop', async (event, rowId: unknown, file: unknown) => {
        checkSender(event)
        if (!ref(rowId) || !ref(file)) throw new Error('無效的操作')
        pendingRequests++
        try {
          return await library.run(() => explorer.droppedSubtitle(rowId, file))
        } finally {
          pendingRequests--
        }
      })
      ipcMain.handle('workspace:read', async (event) => {
        checkSender(event)
        pendingRequests++
        try {
          return await workspace.read(projectIds())
        } finally {
          pendingRequests--
        }
      })
      ipcMain.handle('workspace:update', async (event, command: unknown) => {
        checkSender(event)
        if (!isWorkspaceCommand(command)) throw new Error('無效的操作')
        pendingRequests++
        try {
          const state = await workspace.update(command, projectIds())
          nativeLocale = state.prefs.locale ?? 'zh-TW'
          return state
        } finally {
          pendingRequests--
        }
      })
      ipcMain.handle('window:action', (event, action: WindowAction) => {
        checkSender(event)
        if (!['state', 'minimize', 'toggleMaximize', 'close'].includes(action))
          throw new Error('不支援的視窗操作')
        if (action === 'minimize') win!.minimize()
        if (action === 'toggleMaximize') {
          if (win!.isMaximized()) win!.unmaximize()
          else win!.maximize()
        }
        const state = {
          maximized: win!.isMaximized(),
          visible: win!.isVisible() && !win!.isMinimized(),
        }
        if (action === 'close') win!.close()
        return state
      })
      protocol.handle('app', async (request) => {
        try {
          const url = new URL(request.url)
          if (url.hostname !== 'ui') return new Response(null, { status: 403 })
          const file = path.resolve(rendererRoot, '.' + decodeURIComponent(url.pathname))
          await safePath(rendererRoot, file)
          return net.fetch(pathToFileURL(file).toString())
        } catch {
          return new Response(null, { status: 404 })
        }
      })
      protocol.handle('media', async (request) => {
        try {
          const url = new URL(request.url),
            parts = url.pathname.split('/').filter(Boolean)
          if (url.hostname === 'audio-cover' && parts.length === 2) {
            const response = await explorer.audioCover(parts[0], parts[1], request.signal)
            response.headers.set(
              'Access-Control-Allow-Origin',
              devUrl ? new URL(devUrl).origin : 'app://ui'
            )
            return response
          }
          if (['file', 'thumb'].includes(url.hostname) && parts.length === 2) {
            const response = await explorer.stream(
              parts[0],
              parts[1],
              request,
              url.hostname === 'thumb'
            )
            response.headers.set(
              'Access-Control-Allow-Origin',
              devUrl ? new URL(devUrl).origin : 'app://ui'
            )
            response.headers.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges')
            return response
          }
          if (url.hostname === 'nth' && parts.length === 2) {
            const response = await explorer.nthImage(parts[0], Number(parts[1]), request)
            response.headers.set(
              'Access-Control-Allow-Origin',
              devUrl ? new URL(devUrl).origin : 'app://ui'
            )
            return response
          }
          if (url.hostname === 'archive' && parts.length === 4)
            return explorer.archiveStream(parts[0], parts[1], parts[2], parts[3])
          if (url.hostname !== 'asset' || parts.length !== 2)
            return new Response(null, { status: 403 })
          const asset = await library.asset(parts[0], parts[1])
          return net.fetch(pathToFileURL(asset.file).toString())
        } catch {
          return new Response(null, { status: 404 })
        }
      })
      ipcMain.handle('library:request', async (event, request: unknown) => {
        checkSender(event)
        if (!isLibraryRequest(request)) throw new Error('無效的操作')
        if (request.action === 'cancelScan') {
          library.cancelScan()
          return { snapshot: library.snapshot() }
        }
        if (request.action === 'snapshot' && startupError)
          return {
            snapshot: library.snapshot(),
            notice: { level: 'error', message: startupError },
          } satisfies Response
        pendingRequests++
        try {
          return await library.run(() => dispatch(request))
        } finally {
          pendingRequests--
        }
      })
      win = new BrowserWindow({
        width: 1280,
        height: 850,
        minWidth: 760,
        minHeight: 580,
        frame: false,
        backgroundColor: '#202124',
        ...(existsSync(appIcon) ? { icon: appIcon } : {}),
        ...(quietTest ? { opacity: 0, skipTaskbar: true } : watchTest ? { opacity: 0.6 } : {}),
        show: false,
        webPreferences: {
          preload: path.join(directory, '../preload/preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          plugins: true,
          ...(quietTest || watchTest ? { backgroundThrottling: false } : {}),
        },
      })
      win.setMenu(null)
      win.on('app-command', (event, command) => {
        if (command !== 'browser-backward' && command !== 'browser-forward') return
        event.preventDefault()
        if (!win?.isFocused() || !win.isVisible() || win.isMinimized()) return
        const cursor = screen.getCursorScreenPoint(),
          bounds = win.getContentBounds(),
          zoom = win.webContents.getZoomFactor()
        win.webContents.send('folder:navigate', {
          delta: command === 'browser-backward' ? -1 : 1,
          x: (cursor.x - bounds.x) / zoom,
          y: (cursor.y - bounds.y) / zoom,
        })
      })
      const contents = win.webContents
      contents.on('before-input-event', (event, input) => {
        if (input.key !== 'F12') return
        event.preventDefault()
        if (input.type === 'keyDown' && !input.isAutoRepeat) contents.toggleDevTools()
      })
      const publishWindowState = () =>
        win?.webContents.send('window:state', {
          maximized: win.isMaximized(),
          visible: win.isVisible() && !win.isMinimized(),
        })
      win.on('maximize', publishWindowState)
      win.on('unmaximize', publishWindowState)
      win.on('hide', publishWindowState)
      win.on('show', publishWindowState)
      win.on('minimize', publishWindowState)
      win.on('restore', publishWindowState)
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      win.on('close', (event) => {
        if (pendingRequests) {
          event.preventDefault()
          dialog.showMessageBoxSync(win!, {
            type: 'info',
            message: nt('操作仍在進行'),
            detail: nt('請等候保存完成；掃描可先按「取消掃描」，再關閉程式。'),
            buttons: [nt('繼續等待')],
          })
        }
      })
      win.webContents.on('will-prevent-unload', (event) => {
        if (pendingRequests) return
        const choice = dialog.showMessageBoxSync(win!, {
          type: 'question',
          message: nt('要放棄尚未保存的變更嗎？'),
          detail: nt('返回可繼續編輯；放棄後會關閉或重新載入畫面。'),
          buttons: [nt('返回編輯'), nt('放棄變更')],
          defaultId: 0,
          cancelId: 0,
        })
        if (choice === 1) event.preventDefault()
      })
      win.webContents.on('will-navigate', (event, url) => {
        if (!trusted(url)) event.preventDefault()
      })
      const allowFullscreen = (
        contents: Electron.WebContents | null,
        permission: string,
        details: { isMainFrame?: boolean; requestingUrl?: string }
      ) =>
        permission === 'fullscreen' &&
        !!contents &&
        contents === win?.webContents &&
        details.isMainFrame === true &&
        trusted(details.requestingUrl ?? '') &&
        trusted(contents.getURL())
      win.webContents.session.setPermissionCheckHandler((contents, permission, _origin, details) =>
        allowFullscreen(contents, permission, details)
      )
      win.webContents.session.setPermissionRequestHandler(
        (contents, permission, callback, details) =>
          callback(allowFullscreen(contents, permission, details))
      )
      // A crashed renderer would leave a blank window; reload it (the data on disk is untouched).
      win.webContents.on('render-process-gone', (_event, details) => {
        console.error('Renderer process gone:', details.reason)
        if (details.reason === 'clean-exit') return
        setTimeout(() => {
          if (win && !win.isDestroyed()) win.webContents.reload()
        }, 300)
      })
      win.once('ready-to-show', () => {
        if (!quietTest && !watchTest) return win?.show()
        win?.setIgnoreMouseEvents(true)
        win?.showInactive()
      })
      await win.loadURL(devUrl ?? 'app://ui/index.html')
    })
    .catch((error) => {
      console.error(error)
      dialog.showErrorBox(nt('啟動失敗'), String(error))
      app.quit()
    })
  app.on('window-all-closed', () => app.quit())
}
