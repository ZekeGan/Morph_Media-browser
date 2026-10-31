import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// Failures nobody caught used to vanish; they now surface as a toast with a next step and the technical detail.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'error-recovery-ui-')),
  local = path.join(root, 'local')
await fs.mkdir(local, { recursive: true })
const errors: string[] = []
const { app, page } = await launchApp(local, errors)
let passed = false
try {
  await page.locator('.titlebar').waitFor()
  await page.evaluate(() => {
    void Promise.reject(new Error("EPERM: operation not permitted, open 'C:\\data\\a.json'"))
  })
  const toast = page.locator('.app-toasts [role=alert]')
  await toast.waitFor()
  assert.match(await toast.innerText(), /沒有權限完成這個操作/)
  assert.match(await toast.innerText(), /沒有設為唯讀/)
  await toast.getByText('技術細節').click()
  assert.match(await toast.innerText(), /EPERM: operation not permitted/)
  await toast.getByRole('button').first().click()
  await toast.waitFor({ state: 'detached' })

  // Interrupted work is not an error the user can act on.
  await page.evaluate(() => {
    void Promise.reject(new DOMException('The operation was aborted', 'AbortError'))
  })
  await page.waitForTimeout(400)
  assert.equal(await toast.count(), 0)
  passed = true
  console.log('PASS uncaught failures surface with a hint and detail; aborts stay quiet. ' + root)
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
