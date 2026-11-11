// Packaged start check (R-278), step 6 of docs/RELEASING.md, after pnpm dist:
//   pnpm check:packaged
// Starts the unpacked build in release/morph <version>/win-unpacked with a throw-away data folder (never the real
// one), waits for the home page and checks the status bar shows this version and the window reports no errors.
import fs from 'node:fs/promises'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'
import { closeApp, testEnv } from './app'

const version = JSON.parse(await fs.readFile('package.json', 'utf8')).version as string
const executable = path.resolve('release', `morph ${version}`, 'win-unpacked', 'Morph.exe')
await fs.access(executable).catch(() => {
  console.error(`No packaged build at ${executable}; run pnpm dist first.`)
  process.exit(1)
})
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const local = await fs.mkdtemp(path.join(base, 'packaged-'))
const app = await electron.launch({
  executablePath: executable,
  env: testEnv(local),
  timeout: 30000,
})
const errors: string[] = []
try {
  const page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('heading', { name: '你的資料夾，你的瀏覽方式' }).waitFor({ timeout: 20000 })
  const status = (await page.locator('.statusbar').textContent()) ?? ''
  if (!status.includes('v' + version))
    throw new Error(`Status bar shows "${status}", expected v${version}`)
  if (errors.length) throw new Error('Window errors: ' + errors.join(' | '))
  console.log(
    `Packaged ${version} starts: home page shown, v${version} in the status bar, no window errors.`
  )
} finally {
  await closeApp(app)
  await fs.rm(local, { recursive: true, force: true })
}
