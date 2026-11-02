import fs from 'node:fs/promises'
import path from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'

// Shared Electron UI test harness: environment, launch with a fixed window size, and a close that
// bypasses unload prompts. New UI tests should use these instead of copying the boilerplate.
export const testEnv = (local: string) => {
  const env = Object.fromEntries(
    Object.entries({ ...process.env, MEDIA_VIEWER_TEST_DATA: local }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  )
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

export async function launchApp(
  local: string,
  errors: string[],
  size = { width: 1500, height: 900 }
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: ['.'], env: testEnv(local), timeout: 30000 }),
    page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  page.setDefaultTimeout(15000)
  await page.evaluate('window.__name=(target)=>target')
  await app.evaluate(({ BrowserWindow, dialog }, bounds) => {
    // A native message box cannot be answered by the tests and would stall them until someone clicks it.
    // Answer "discard" at once; tests that check a prompt replace this stub themselves.
    dialog.showMessageBoxSync = (() => 1) as typeof dialog.showMessageBoxSync
    dialog.showMessageBox = (async () => ({
      response: 1,
      checkboxChecked: false,
    })) as typeof dialog.showMessageBox
    dialog.showErrorBox = () => {}
    const win = BrowserWindow.getAllWindows()[0]
    win.setMinimumSize(0, 0)
    win.setBounds(bounds)
  }, size)
  return { app, page }
}

export async function closeApp(app: ElectronApplication) {
  await app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.removeAllListeners('close')
      win.webContents.on('will-prevent-unload', (event) => event.preventDefault())
    }
  })
  await app.close()
}

// On failure: a screenshot plus what the page was saying (alerts, toasts, dialogs), so one run explains the failure.
export async function reportFailure(page: Page, dir: string) {
  await page.screenshot({ path: path.join(dir, 'failure.png') }).catch(() => {})
  const said = await page
    .evaluate(() =>
      [...document.querySelectorAll('[role=alert],[role=dialog],.app-toasts')]
        .map((node) => node.textContent?.trim().slice(0, 300))
        .filter(Boolean)
    )
    .catch(() => [])
  console.error('Artifacts: ' + dir + (said.length ? '\nPage said: ' + said.join(' | ') : ''))
}

// Deletes a test's own folder; refuses anything outside .test-output.
export async function removeTestRoot(root: string) {
  const base = path.resolve('.test-output'),
    target = path.resolve(root)
  if (!target.startsWith(base + path.sep)) throw new Error('Unsafe cleanup: ' + target)
  await fs.rm(target, { recursive: true, force: true })
}
