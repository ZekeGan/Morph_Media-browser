import dns from 'node:dns/promises'
import net from 'node:net'
import { limitedBytes } from './metadata-common'
import { identifyImage } from '../shared/images'

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_REDIRECTS = 3

const privateV4 = (ip: string) => {
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    // Protocol assignments, documentation and benchmarking ranges.
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  )
}
// The eight 16-bit groups of an IPv6 address (with "::" expanded and a trailing dotted IPv4 converted).
function groups(ip: string): number[] | undefined {
  let value = ip.toLowerCase().split('%')[0]
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(value)
  if (dotted) {
    const [a, b, c, d] = dotted[1].split('.').map(Number)
    value =
      value.slice(0, -dotted[1].length) +
      ((a << 8) | b).toString(16) +
      ':' +
      ((c << 8) | d).toString(16)
  }
  const [head, tail] = value.split('::')
  const left = head ? head.split(':') : [],
    right = tail ? tail.split(':') : []
  const parts = value.includes('::')
    ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
    : left
  if (parts.length !== 8) return undefined
  const numbers = parts.map((part) => parseInt(part, 16))
  return numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? numbers : undefined
}
const v4 = (high: number, low: number) => [high >> 8, high & 255, low >> 8, low & 255].join('.')
// Any IPv6 form, including hex-written IPv4-mapped (::ffff:7f00:1), NAT64 (64:ff9b::/96) and 6to4 (2002::/16)
// addresses, is judged by the IPv4 address it carries.
export const privateAddress = (ip: string): boolean => {
  const version = net.isIP(ip)
  if (version === 4) return privateV4(ip)
  if (version !== 6) return true
  const g = groups(ip)
  if (!g) return true
  if (g.slice(0, 5).every((n) => n === 0) && (g[5] === 0xffff || g[5] === 0))
    return g[5] === 0 && g[6] === 0 ? true : privateV4(v4(g[6], g[7]))
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((n) => n === 0))
    return privateV4(v4(g[6], g[7]))
  if (g[0] === 0x2002) return privateV4(v4(g[1], g[2]))
  return (
    g.every((n) => n === 0) ||
    (g.slice(0, 7).every((n) => n === 0) && g[7] === 1) ||
    (g[0] & 0xfe00) === 0xfc00 ||
    (g[0] & 0xffc0) === 0xfe80 ||
    (g[0] & 0xff00) === 0xff00 ||
    (g[0] === 0x2001 && g[1] === 0x0db8)
  )
}

export interface RemoteImage {
  bytes: Buffer
  ext: string
  mime: string
  name: string
}
export interface ImageUrlOptions {
  fetcher?: typeof fetch
  allowPrivate?: boolean
  lookup?: (host: string) => Promise<string[]>
}

const resolveHost = async (host: string) =>
  (await dns.lookup(host, { all: true })).map((entry) => entry.address)

// Downloads a user-specified image URL under main-process control: HTTP(S) only, no credentials,
// no private or loopback targets, limited redirects, timeout and size, and content-based type checks.
export async function fetchImageUrl(
  raw: string,
  options: ImageUrlOptions = {}
): Promise<RemoteImage> {
  const fetcher = options.fetcher ?? fetch,
    lookup = options.lookup ?? resolveHost
  if (typeof raw !== 'string' || raw.length > 2048) throw new Error('圖片網址不合法')
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error('圖片網址不合法')
  }
  for (let hop = 0; ; hop++) {
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !url.hostname
    )
      throw new Error('只接受不含帳號密碼的 HTTP(S) 圖片網址')
    if (!options.allowPrivate) {
      const host = url.hostname.replace(/^\[|\]$/g, '')
      if (host.toLowerCase() === 'localhost' || host.toLowerCase().endsWith('.localhost'))
        throw new Error('不允許本機或內網位址')
      const addresses = net.isIP(host) ? [host] : await lookup(host).catch(() => [])
      if (!addresses.length) throw new Error('無法解析圖片網址的主機')
      if (addresses.some(privateAddress)) throw new Error('不允許本機或內網位址')
    }
    const response = await fetcher(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: { Accept: 'image/*' },
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location || hop >= MAX_REDIRECTS) throw new Error('圖片網址重新導向過多或無效')
      url = new URL(location, url)
      continue
    }
    const bytes = await limitedBytes(response, MAX_IMAGE_BYTES)
    const identified = identifyImage(bytes)
    if (!identified)
      throw new Error('網址內容不是支援的圖片（PNG、JPEG、GIF、WebP、BMP、AVIF、ICO）')
    const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '')
      .replace(/[\\/:*?"<>|\0]/g, '_')
      .slice(0, 80)
    return {
      bytes,
      ...identified,
      name: (last.replace(/\.[a-z0-9]{2,5}$/i, '') || 'image') + '.' + identified.ext,
    }
  }
}
