import fs from 'node:fs/promises'
import path from 'node:path'
import { atomicJson, readJson, safePath } from './files'
import { keySite, type KeyStatus } from '../shared/keys'

// R-285: website keys, encrypted with the operating system's protection (Electron safeStorage, DPAPI on Windows)
// and kept in this computer's app data only. They never go into portable records, settings packages or the window.
export interface KeyCipher {
  available(): boolean
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
}
type Stored = {
  schemaVersion: 1
  sites: Record<string, { values: Record<string, string>; test?: 'ok' | 'failed' }>
}

export class KeyStore {
  readonly file: string
  private data: Stored = { schemaVersion: 1, sites: {} }
  private loaded = false
  constructor(
    private root: string,
    private cipher: KeyCipher
  ) {
    this.file = path.join(root, 'site-keys.json')
  }
  private async load() {
    if (this.loaded) return
    this.loaded = true
    try {
      await safePath(this.root, this.file)
      const value = (await readJson(this.file)) as Stored
      if (value?.schemaVersion === 1 && value.sites && typeof value.sites === 'object')
        this.data = value
    } catch {}
  }
  private async save() {
    await fs.mkdir(this.root, { recursive: true })
    await safePath(this.root, this.file)
    await atomicJson(this.file, this.data)
  }
  // A key that can no longer be decrypted (another user profile) counts as not set.
  async status(): Promise<Record<string, KeyStatus>> {
    await this.load()
    const result: Record<string, KeyStatus> = {}
    for (const [site, entry] of Object.entries(this.data.sites))
      if (await this.get(site))
        result[site] = { set: true, ...(entry.test ? { test: entry.test } : {}) }
    return result
  }
  async set(site: string, values: Record<string, string>) {
    const definition = keySite(site)
    if (!definition) throw new Error('沒有這個網站')
    if (!this.cipher.available()) throw new Error('這台電腦無法加密保存金鑰')
    const clean: Record<string, string> = {}
    for (const field of definition.fields) {
      const value = (values[field.id] ?? '').trim()
      if (!value && !field.optional) throw new Error('金鑰欄位未填')
      if (value.length > 2000 || /[\0\r\n]/.test(value)) throw new Error('金鑰格式不合法')
      if (value) clean[field.id] = this.cipher.encrypt(value).toString('base64')
    }
    await this.load()
    this.data.sites[site] = { values: clean }
    await this.save()
  }
  async clear(site: string) {
    await this.load()
    delete this.data.sites[site]
    await this.save()
  }
  async mark(site: string, test: 'ok' | 'failed') {
    await this.load()
    const entry = this.data.sites[site]
    if (!entry) return
    entry.test = test
    await this.save()
  }
  // The decrypted values of one site, for main's requests only.
  async get(site: string): Promise<Record<string, string> | undefined> {
    await this.load()
    const entry = this.data.sites[site]
    if (!entry || !this.cipher.available()) return undefined
    try {
      return Object.fromEntries(
        Object.entries(entry.values).map(([field, value]) => [
          field,
          this.cipher.decrypt(Buffer.from(value, 'base64')),
        ])
      )
    } catch {
      return undefined
    }
  }
}
