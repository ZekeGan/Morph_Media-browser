// Sample library for the documentation screenshots: generated flat covers (no third-party artwork), fictional titles.
//   buildDemoLibrary(dir) writes the folders and returns the root; `pnpm shot:docs` uses it.
import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'

type Colour = [number, number, number]
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buffer: Buffer) => {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type), data]),
    out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc(body), body.length + 4)
  return out
}
function encodePng(width: number, height: number, pixel: (x: number, y: number) => Colour) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y)
      raw[row + 1 + x * 3] = r
      raw[row + 2 + x * 3] = g
      raw[row + 3 + x * 3] = b
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
const mix = (a: Colour, b: Colour, t: number): Colour => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
]
const hex = (value: string): Colour => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
]

const palettes = [
  ['#1d2b53', '#7e5aa8', '#f5c26b', '#f7ece1'],
  ['#0f4c5c', '#5fa8a0', '#fb8b24', '#fdf0d5'],
  ['#3a1c47', '#c8553d', '#f0b67f', '#fff1e6'],
  ['#1b3a2a', '#6a994e', '#f2e8cf', '#bc4749'],
  ['#102a43', '#486581', '#f0b429', '#f0f4f8'],
  ['#4a1942', '#e0777d', '#ffd6a5', '#fdf6ec'],
].map((list) => list.map(hex))

// One flat cover: a gradient sky, a sun or moon, and layered hills; `seed` picks palette, sun position and hill shape.
export function cover(seed: number, width = 360, height = 500) {
  const [sky, far, sun, near] = palettes[seed % palettes.length],
    sunX = width * (0.25 + ((seed * 37) % 50) / 100),
    sunY = height * (0.22 + ((seed * 17) % 20) / 100),
    radius = width * 0.16,
    phase = seed * 1.7
  return encodePng(width, height, (x, y) => {
    let colour = mix(sky, far, y / height)
    if ((x - sunX) ** 2 + (y - sunY) ** 2 < radius ** 2) colour = sun
    const hill1 = height * 0.62 + Math.sin(x / 55 + phase) * 28,
      hill2 = height * 0.76 + Math.sin(x / 38 + phase * 2) * 22
    if (y > hill1) colour = mix(far, sky, 0.35)
    if (y > hill2) colour = near
    if (y > height - 26) colour = mix(near, sky, 0.5)
    return colour
  })
}

const manga = ['月光花園', '紙燈籠', '鐵皮機器人日記', '雨天的圖書館']
const albums = ['春日散步', '海邊黃昏', '老街相簿', '山中小屋']
const games = ['星塵列車', '迷霧鎮', '琥珀城堡']

export async function buildDemoLibrary(dir: string) {
  const media = path.join(dir, '示範收藏')
  let seed = 0
  const make = async (name: string, files: number, game = false) => {
    const folder = path.join(media, name)
    await fs.mkdir(game ? path.join(folder, 'Game_Data') : folder, { recursive: true })
    for (let index = 1; index <= files; index++)
      await fs.writeFile(
        path.join(folder, `${String(index).padStart(2, '0')}.png`),
        cover(seed + index * 3)
      )
    if (game) await fs.writeFile(path.join(folder, 'Game.exe'), 'x')
    seed++
  }
  for (const name of manga) await make(name, 4)
  for (const name of albums) await make(name, 6)
  for (const name of games) await make(name, 3, true)
  return media
}

// Tags, rating and status shown on the cards.
export const demoDetails: Record<string, { tags: string[]; score: number; status: string }> = {
  月光花園: { tags: ['奇幻', '短篇'], score: 5, status: '已完成' },
  紙燈籠: { tags: ['日常', '溫馨'], score: 4, status: '進行中' },
  鐵皮機器人日記: { tags: ['科幻', '搞笑'], score: 4, status: '想看' },
  雨天的圖書館: { tags: ['日常', '推理'], score: 5, status: '進行中' },
  春日散步: { tags: ['風景', '春天'], score: 4, status: '已完成' },
  海邊黃昏: { tags: ['風景', '海'], score: 5, status: '已完成' },
  老街相簿: { tags: ['街景', '懷舊'], score: 3, status: '想看' },
  山中小屋: { tags: ['風景', '旅行'], score: 4, status: '進行中' },
  星塵列車: { tags: ['冒險', '劇情'], score: 5, status: '進行中' },
  迷霧鎮: { tags: ['推理', '恐怖'], score: 4, status: '想看' },
  琥珀城堡: { tags: ['奇幻', '解謎'], score: 3, status: '已完成' },
}
