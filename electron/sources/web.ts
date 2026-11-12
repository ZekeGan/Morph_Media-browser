import dns from 'node:dns/promises'
import net from 'node:net'
import { privateAddress } from '../image-url'
import { SourceError, sourceStatusKind, limitedBytes } from '../metadata-common'
import { userAgent } from './config'

// R-283: reading web pages without running them. A page is fetched under main's control (HTTPS only, no
// credentials, no local or private addresses, at most three redirects, 2 MiB, 15 s), decoded with the page's own
// charset, and read with forward-only scanning for JSON-LD, OpenGraph and the title. No script ever runs.
export interface WebOptions {
  lookup?: (host: string) => Promise<string[]>
  // Cookies a site needs to show its age-restricted pages, only after the user confirmed being an adult (R-293).
  cookie?: string
}
const resolveHost = async (host: string) =>
  (await dns.lookup(host, { all: true })).map((entry) => entry.address)

export async function safeAddress(url: URL, lookup = resolveHost) {
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || url.port)
    throw new Error('只接受不含帳號密碼的 HTTPS 網址')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host.toLowerCase() === 'localhost' || host.toLowerCase().endsWith('.localhost'))
    throw new Error('不允許本機或內網位址')
  const addresses = net.isIP(host) ? [host] : await lookup(host).catch(() => [])
  if (!addresses.length) throw new SourceError('offline')
  if (addresses.some(privateAddress)) throw new Error('不允許本機或內網位址')
}

export async function fetchPage(
  raw: string,
  fetcher: typeof fetch,
  options: WebOptions = {}
): Promise<{ url: URL; html: string }> {
  let url = new URL(raw)
  const origin = url.origin
  for (let hop = 0; ; hop++) {
    await safeAddress(url, options.lookup)
    let response: Response
    try {
      response = await fetcher(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': userAgent,
          // The age-confirmation cookie stays with the site it is for, never a redirect elsewhere.
          ...(options.cookie && url.origin === origin ? { Cookie: options.cookie } : {}),
        },
      })
    } catch {
      throw new SourceError('offline')
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location || hop >= 3) throw new SourceError('offline')
      url = new URL(location, url)
      continue
    }
    if (!response.ok) throw new SourceError(sourceStatusKind(response.status))
    const bytes = await limitedBytes(response, 2 * 1024 * 1024).catch((error) => {
      if (error instanceof Error && error.message === '來源回應過大') throw error
      throw new SourceError('offline')
    })
    return { url, html: decodePage(bytes, response.headers.get('content-type') ?? '') }
  }
}

const encodings: Record<string, string> = {
  shift_jis: 'shift_jis',
  'shift-jis': 'shift_jis',
  sjis: 'shift_jis',
  'x-sjis': 'shift_jis',
  'windows-31j': 'shift_jis',
  'euc-jp': 'euc-jp',
  'x-euc-jp': 'euc-jp',
  'utf-8': 'utf-8',
  utf8: 'utf-8',
  big5: 'big5',
  gbk: 'gbk',
  gb2312: 'gbk',
  'euc-kr': 'euc-kr',
}
// The charset from the HTTP header, else from a <meta> tag in the first 4 KiB, else UTF-8.
export function decodePage(bytes: Buffer, contentType: string) {
  const head = bytes.subarray(0, 4096).toString('latin1')
  const declared =
    /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1] ??
    /<meta[^>]{0,200}charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1]
  const encoding = encodings[(declared ?? 'utf-8').toLowerCase()] ?? 'utf-8'
  return new TextDecoder(encoding).decode(bytes)
}

// --- Forward-only scanning ---
export function tags(html: string, name: string) {
  const lower = html.toLowerCase(),
    open = '<' + name,
    found: string[] = []
  let at = 0
  while ((at = lower.indexOf(open, at)) >= 0) {
    const end = lower.indexOf('>', at)
    if (end < 0) break
    if (/[\s/>]/.test(lower[at + open.length] ?? '>'))
      found.push(html.slice(at, Math.min(end + 1, at + 4096)))
    at = end + 1
  }
  return found
}
export function blocks(html: string, name: string, limit = 200_000) {
  const lower = html.toLowerCase(),
    open = '<' + name,
    close = '</' + name,
    found: { tag: string; inner: string }[] = []
  let at = 0
  while ((at = lower.indexOf(open, at)) >= 0) {
    const end = lower.indexOf('>', at)
    if (end < 0) break
    if (!/[\s/>]/.test(lower[at + open.length] ?? '>')) {
      at = end + 1
      continue
    }
    const finish = lower.indexOf(close, end)
    if (finish < 0) break
    found.push({
      tag: html.slice(at, end + 1),
      inner: html.slice(end + 1, Math.min(finish, end + 1 + limit)),
    })
    at = finish + close.length
  }
  return found
}
export const attribute = (tag: string, name: string) => {
  const match = new RegExp(
    '\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))',
    'i'
  ).exec(tag)
  return match ? entity(match[2] ?? match[3] ?? match[4] ?? '') : undefined
}
export const entity = (value: string) =>
  value.replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi, (m, key: string) => {
    const named: Record<string, string> = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: ' ',
    }
    if (key[0] !== '#') return named[key.toLowerCase()] ?? m
    const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1))
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m
  })
// Text of an HTML fragment: tags removed, entities decoded, spaces collapsed.
export const textOf = (fragment: string) =>
  entity(
    fragment
      .slice(0, 50_000)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^<>]*>/g, '')
  )
    .replace(/[ \t\r\f]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()

export interface PageMeta {
  title?: string
  description?: string
  image?: string
  siteName?: string
  canonical?: string
  authors: string[]
  date?: string
  keywords: string[]
  ld: Record<string, unknown>[]
}
// JSON-LD first, then OpenGraph / Twitter / plain <meta>, then <title>.
export function pageMeta(html: string, base: URL): PageMeta {
  const meta = new Map<string, string>()
  for (const tag of tags(html, 'meta')) {
    const key = (attribute(tag, 'property') ?? attribute(tag, 'name') ?? '').toLowerCase(),
      content = attribute(tag, 'content')
    if (key && content && !meta.has(key)) meta.set(key, content.trim())
  }
  const ld: Record<string, unknown>[] = []
  for (const script of blocks(html, 'script', 500_000)) {
    if (!/application\/ld\+json/i.test(attribute(script.tag, 'type') ?? '')) continue
    try {
      const value = JSON.parse(script.inner)
      const list = Array.isArray(value)
        ? value
        : Array.isArray(value?.['@graph'])
          ? value['@graph']
          : [value]
      for (const item of list) if (item && typeof item === 'object') ld.push(item)
    } catch {}
  }
  const main = ld.find((item) => typeof item.name === 'string' || typeof item.headline === 'string')
  const text = (value: unknown) => (typeof value === 'string' ? entity(value).trim() : undefined)
  const names = (value: unknown): string[] =>
    (Array.isArray(value) ? value : value ? [value] : [])
      .map((item) => (typeof item === 'string' ? item : (item as { name?: unknown })?.name))
      .filter((item): item is string => typeof item === 'string' && !!item.trim())
      .map((item) => entity(item).trim())
  const ldImage = main?.image,
    image =
      (typeof ldImage === 'string'
        ? ldImage
        : (names(ldImage)[0] ??
          (Array.isArray(ldImage) ? text(ldImage[0]) : (ldImage as { url?: string })?.url))) ??
      meta.get('og:image') ??
      meta.get('twitter:image')
  const absolute = (value: string | undefined) => {
    if (!value) return undefined
    try {
      return new URL(value, base).href
    } catch {
      return undefined
    }
  }
  const canonical = tags(html, 'link').find((tag) =>
    /\bcanonical\b/i.test(attribute(tag, 'rel') ?? '')
  )
  const keywords = (
    meta.get('keywords') ?? (typeof main?.keywords === 'string' ? main.keywords : '')
  )
    .split(/[,、，]/)
    .map((word) => word.trim())
    .filter(Boolean)
  return {
    title:
      text(main?.name) ??
      text(main?.headline) ??
      meta.get('og:title') ??
      meta.get('twitter:title') ??
      textOf(blocks(html, 'title')[0]?.inner ?? ''),
    description: text(main?.description) ?? meta.get('og:description') ?? meta.get('description'),
    image: absolute(image),
    siteName: meta.get('og:site_name'),
    canonical: absolute(canonical ? attribute(canonical, 'href') : meta.get('og:url')),
    authors: [...names(main?.author), ...names(main?.creator)].slice(0, 50),
    date: text(main?.datePublished) ?? meta.get('article:published_time'),
    keywords: [
      ...keywords,
      ...(Array.isArray(main?.genre) ? names(main.genre) : names(main?.genre)),
    ].slice(0, 200),
    ld,
  }
}
