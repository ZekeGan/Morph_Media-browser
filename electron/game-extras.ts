import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { safePath } from './files'
import { httpUrl } from '../shared/fields'
import type { FolderRecord } from '../shared/model'

// Game page extras (R-305–R-310): everything here is read-only and worked out in main from the game folder and its
// record. The window only ever learns names and labels, never paths it could hand back to be opened.

// R-307: the Steam App ID from steam_appid.txt at the top of the game, or from a Steam import on the folder.
export async function steamAppId(root: string, record: FolderRecord | undefined) {
  const file = path.join(root, 'steam_appid.txt')
  try {
    await safePath(root, file)
    const stat = await fs.stat(file)
    if (stat.isFile() && stat.size <= 64) {
      const id = (await fs.readFile(file, 'utf8')).trim()
      if (/^[1-9]\d{0,9}$/.test(id) && Number(id) <= 4294967295) return id
    }
  } catch {}
  const value = record?.attributes.find((a) => a.attributeId === 'steam-app_id')?.value
  const id = typeof value === 'number' || typeof value === 'string' ? String(value) : ''
  return /^[1-9]\d{0,9}$/.test(id) && Number(id) <= 4294967295 ? id : undefined
}

// R-310: the work's page on a store or catalogue site, from what a website import saved. HTTPS only.
export function storeUrl(record: FolderRecord | undefined) {
  const attributes = record?.attributes ?? []
  const order = (id: string) => (id === 'steam-store_url' ? 0 : id.endsWith('-store_url') ? 1 : 2)
  return attributes
    .filter((a) => /-(store_url|source_url|gallery_url)$/.test(a.attributeId))
    .sort((a, b) => order(a.attributeId) - order(b.attributeId))
    .map((a) => (typeof a.value === 'string' ? a.value : ''))
    .find((value) => httpUrl(value) && value.startsWith('https://'))
}

const isDir = async (file: string) => {
  try {
    return (await fs.stat(file)).isDirectory()
  } catch {
    return false
  }
}
const readSmall = async (root: string, file: string, limit = 64 * 1024) => {
  try {
    await safePath(root, file)
    const stat = await fs.stat(file)
    return stat.isFile() && stat.size <= limit ? await fs.readFile(file, 'utf8') : undefined
  } catch {
    return undefined
  }
}
// A name taken from a game file must stay one plain folder name before it is joined to a user folder.
const plainName = (value: string) =>
  value && value.length <= 200 && !/[\\/:*?"<>|\0]/.test(value) && !/^\.+$/.test(value)
    ? value
    : undefined

// R-305: where the engine keeps saves, when it can be worked out and exists. Unity: *_Data/app.info names the company
// and product (AppData\LocalLow); Ren'Py: config.save_directory in game/options.rpy (AppData\Roaming\RenPy);
// RPG Maker MV/MZ: save or www/save inside the game; RPG Maker XP–Ace and WOLF: Save inside the game.
export async function engineSaveFolder(root: string, engines: string[], home = os.homedir()) {
  if (engines.includes('Unity')) {
    for (const entry of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || !/_Data$/i.test(entry.name)) continue
      const info = await readSmall(root, path.join(root, entry.name, 'app.info'), 4096)
      const [company, product] = (info ?? '').split(/\r?\n/).map((line) => line.trim())
      const safeCompany = plainName(company ?? ''),
        safeProduct = plainName(product ?? '')
      if (!safeCompany || !safeProduct) continue
      const folder = path.join(home, 'AppData', 'LocalLow', safeCompany, safeProduct)
      if (await isDir(folder)) return folder
    }
  }
  if (engines.includes('Ren’Py')) {
    const options = await readSmall(root, path.join(root, 'game', 'options.rpy'))
    const name = plainName(
      /config\.save_directory\s*=\s*["']([^"'\r\n]+)["']/.exec(options ?? '')?.[1] ?? ''
    )
    if (name) {
      const folder = path.join(home, 'AppData', 'Roaming', 'RenPy', name)
      if (await isDir(folder)) return folder
    }
  }
  const inside = [
    ...(engines.some((e) => /^RPG Maker M[VZ]$/.test(e)) ? ['www/save', 'save'] : []),
    ...(engines.some((e) => e === 'RPG Maker XP/VX/Ace' || e === 'WOLF RPG') ? ['Save'] : []),
  ]
  for (const rel of inside) {
    const folder = path.join(root, rel)
    try {
      await safePath(root, folder)
      if (await isDir(folder)) return folder
    } catch {}
  }
  return undefined
}

// R-306: bundled settings tools and manuals at the top of the game folder. Installers, uninstallers and runtime
// redistributables are left out; nothing is run or added until the user picks it.
const excluded =
  /^(unins|vcredist|vc_redist|dxsetup|dxwebsetup|directx|dotnet|ndp\d|oalinst|physx)/i
export async function bundledSuggestions(root: string) {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  const result: { name: string; role: 'config' | 'manual' }[] = []
  for (const entry of entries) {
    if (!entry.isFile() || excluded.test(entry.name)) continue
    if (/^(config|setup|環境設定.*|.*config.*)\.exe$/i.test(entry.name))
      result.push({ name: entry.name, role: 'config' })
    else if (
      /\.(pdf|html?)$/i.test(entry.name) ||
      /^(readme|manual|説明書|マニュアル|説明|はじめに|お読みください|使用說明|說明書)[^\\/]*\.(txt|md|rtf|pdf|html?)$/i.test(
        entry.name
      )
    )
      result.push({ name: entry.name, role: 'manual' })
  }
  return result
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name))
    .slice(0, 20)
}
