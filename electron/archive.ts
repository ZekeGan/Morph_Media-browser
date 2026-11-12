import fs from 'node:fs/promises'
import path from 'node:path'
import { inflateRaw } from 'node:zlib'
import { promisify } from 'node:util'
import { identifyImage, imageTypes } from '../shared/images'

const inflate = promisify(inflateRaw)
const maxEntry = 64 * 1024 * 1024
export interface ArchiveImage {
  name: string
  offset: number
  packed: number
  size: number
  crc: number
  method: number
  flags: number
  rawName: Buffer
  mime: string
}
export interface ArchiveIndex {
  size: number
  modified: number
  central: number
  images: ArchiveImage[]
  // Text entries (EPUB chapters, package and table of contents), only when asked for (R-282).
  texts?: ArchiveImage[]
}
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let n = 0; n < 8; n++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
async function read(handle: fs.FileHandle, length: number, offset: number) {
  const bytes = Buffer.alloc(length),
    result = await handle.read(bytes, 0, length, offset)
  if (result.bytesRead !== length) throw new Error('壓縮檔已截斷或變更')
  return bytes
}
// Random access only. Nothing is extracted, executed or written to the media tree.
export async function archiveIndex(
  file: string,
  options: { texts?: RegExp } = {}
): Promise<ArchiveIndex> {
  const handle = await fs.open(file, 'r')
  try {
    const stat = await handle.stat(),
      length = Math.min(stat.size, 65557)
    if (length < 22) throw new Error('不是有效的 ZIP／CBZ')
    const tail = await read(handle, length, stat.size - length)
    let end = -1
    for (let i = length - 22; i >= 0; i--)
      if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === length) {
        end = i
        break
      }
    if (end < 0) throw new Error('找不到 ZIP 目錄')
    const count = tail.readUInt16LE(end + 10),
      centralSize = tail.readUInt32LE(end + 12),
      central = tail.readUInt32LE(end + 16)
    if (
      tail.readUInt16LE(end + 4) ||
      tail.readUInt16LE(end + 6) ||
      tail.readUInt16LE(end + 8) !== count ||
      count === 65535 ||
      central === 0xffffffff ||
      centralSize === 0xffffffff
    )
      throw new Error('暫不支援分卷或 ZIP64')
    if (
      count > 20000 ||
      centralSize > 8 * 1024 * 1024 ||
      central + centralSize !== stat.size - length + end
    )
      throw new Error('壓縮檔目錄超出限制')
    const directory = await read(handle, centralSize, central),
      images: ArchiveImage[] = [],
      texts: ArchiveImage[] = [],
      names = new Set<string>()
    let cursor = 0,
      total = 0
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > directory.length || directory.readUInt32LE(cursor) !== 0x02014b50)
        throw new Error('ZIP 目錄損壞')
      const flags = directory.readUInt16LE(cursor + 8),
        method = directory.readUInt16LE(cursor + 10),
        crc = directory.readUInt32LE(cursor + 16),
        packed = directory.readUInt32LE(cursor + 20),
        size = directory.readUInt32LE(cursor + 24),
        nameLength = directory.readUInt16LE(cursor + 28),
        extra = directory.readUInt16LE(cursor + 30),
        comment = directory.readUInt16LE(cursor + 32),
        offset = directory.readUInt32LE(cursor + 42)
      const next = cursor + 46 + nameLength + extra + comment
      if (
        next > directory.length ||
        directory.readUInt16LE(cursor + 34) ||
        [packed, size, offset].includes(0xffffffff)
      )
        throw new Error('ZIP 項目損壞或不支援')
      const rawName = directory.subarray(cursor + 46, cursor + 46 + nameLength),
        name = new TextDecoder(flags & 2048 ? 'utf-8' : 'windows-1252', { fatal: true }).decode(
          rawName
        )
      if (
        !name ||
        name.includes('\\') ||
        name.startsWith('/') ||
        name.includes(':') ||
        /[\x00-\x1f]/.test(name) ||
        name.split('/').some((part) => part === '..' || part === '.')
      )
        throw new Error('壓縮檔包含不安全路徑')
      if (names.has(name)) throw new Error('壓縮檔包含重複路徑')
      names.add(name)
      const unixMode = directory.readUInt32LE(cursor + 38) >>> 16
      if ((unixMode & 0xf000) === 0xa000) throw new Error('壓縮檔包含符號連結')
      if (offset + 30 + packed > central) throw new Error('ZIP 項目超出範圍')
      const mime = imageTypes[path.extname(name).slice(1).toLowerCase()]
      if (!mime && options.texts?.test(name) && !name.endsWith('/')) {
        if (flags & 0x41 || ![0, 8].includes(method))
          throw new Error('文字使用加密或不支援的壓縮方式')
        if (size > 16 * 1024 * 1024 || size > Math.max(packed * 200, 1024 * 1024))
          throw new Error('壓縮文字大小或壓縮比例超出限制')
        if ((total += size) > 2 * 1024 * 1024 * 1024) throw new Error('壓縮檔內容超出限制')
        texts.push({
          name,
          rawName: Buffer.from(rawName),
          offset,
          packed,
          size,
          crc,
          method,
          flags,
          mime: 'text/plain',
        })
      } else if (mime && !name.endsWith('/')) {
        if (flags & 0x41 || ![0, 8].includes(method))
          throw new Error('圖片使用加密或不支援的壓縮方式')
        if (
          packed > maxEntry + 1024 * 1024 ||
          size > maxEntry ||
          !size ||
          size > Math.max(packed * 200, 1024 * 1024) ||
          (total += size) > 2 * 1024 * 1024 * 1024
        )
          throw new Error('壓縮圖片大小或壓縮比例超出限制')
        images.push({
          name,
          rawName: Buffer.from(rawName),
          offset,
          packed,
          size,
          crc,
          method,
          flags,
          mime,
        })
      }
      cursor = next
    }
    if (cursor !== directory.length) throw new Error('ZIP 目錄長度不符')
    images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    return {
      size: stat.size,
      modified: stat.mtimeMs,
      central,
      images,
      ...(options.texts ? { texts } : {}),
    }
  } finally {
    await handle.close()
  }
}
export async function archiveImage(file: string, index: ArchiveIndex, entry: ArchiveImage) {
  const handle = await fs.open(file, 'r')
  try {
    const stat = await handle.stat()
    if (stat.size !== index.size || stat.mtimeMs !== index.modified)
      throw new Error('壓縮檔已變更，請重新開啟')
    const header = await read(handle, 30, entry.offset)
    if (
      header.readUInt32LE(0) !== 0x04034b50 ||
      header.readUInt16LE(6) !== entry.flags ||
      header.readUInt16LE(8) !== entry.method
    )
      throw new Error('ZIP 圖片標頭不符')
    const nameLength = header.readUInt16LE(26),
      start = entry.offset + 30 + nameLength + header.readUInt16LE(28)
    if (
      start + entry.packed > index.central ||
      !(await read(handle, nameLength, entry.offset + 30)).equals(entry.rawName)
    )
      throw new Error('ZIP 圖片位置不符')
    const packed = await read(handle, entry.packed, start),
      bytes =
        entry.method === 0
          ? packed
          : await inflate(packed, { maxOutputLength: Math.min(maxEntry, entry.size) })
    if (
      bytes.length !== entry.size ||
      crc32(bytes) !== entry.crc ||
      (entry.mime.startsWith('image/') && identifyImage(bytes)?.mime !== entry.mime)
    )
      throw new Error('ZIP 圖片內容或校驗不符')
    return bytes
  } finally {
    await handle.close()
  }
}
