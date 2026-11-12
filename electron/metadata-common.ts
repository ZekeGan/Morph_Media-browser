import { fmt } from '../shared/message'
export async function limitedBytes(response: Response, limit: number) {
  if (!response.ok) throw new Error(fmt('來源無法取得（HTTP {0}）', response.status))
  if (Number(response.headers.get('content-length') ?? 0) > limit) throw new Error('來源回應過大')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('來源沒有內容')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error('來源回應過大')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  return Buffer.concat(chunks)
}
// Why a website source failed (R-300). Each kind is one fixed sentence so the window can translate it by lookup.
export type SourceErrorKind = 'offline' | 'notFound' | 'restricted' | 'format'
export const sourceErrorText: Record<SourceErrorKind, string> = {
  offline: '無法連線到來源網站；網站可能暫時無法使用或已更換網址',
  notFound: '來源找不到這個作品；請確認網址或 ID 是否正確',
  restricted: '來源需要金鑰、登入或成人內容權限才能取得這個作品',
  format: '來源資料格式已變更，無法解析；未執行遠端程式',
}
export class SourceError extends Error {
  constructor(readonly kind: SourceErrorKind) {
    super(sourceErrorText[kind])
  }
}
export function sourceStatusKind(status: number): SourceErrorKind {
  if (status === 404 || status === 410) return 'notFound'
  // 400 is how token endpoints (Twitch, DMM) answer wrong credentials.
  if (status === 400 || status === 401 || status === 403) return 'restricted'
  return 'offline'
}
// Requests a website source: a failed lookup, refused connection or timeout is "offline", and an HTTP error is
// classified by its status before the body is read.
export async function sourceRequest(
  fetcher: typeof fetch,
  url: string | URL,
  init: RequestInit,
  limit = 2 * 1024 * 1024
) {
  let response: Response
  try {
    response = await fetcher(url, init)
  } catch {
    throw new SourceError('offline')
  }
  if (!response.ok) throw new SourceError(sourceStatusKind(response.status))
  try {
    return await limitedBytes(response, limit)
  } catch (error) {
    // An oversized reply keeps its own message; a timeout or dropped connection mid-body is "offline".
    if (error instanceof Error && error.message === '來源回應過大') throw error
    throw new SourceError('offline')
  }
}
// Parses a source's JSON reply; text that is not JSON means the site changed its format.
export function sourceJson(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    throw new SourceError('format')
  }
}
// A cover is kept only when its bytes are a JPEG, PNG or WebP image, whatever the server says it is.
export function imageType(bytes: Buffer): { ext: string; mime: string } | undefined {
  if (bytes[0] === 255 && bytes[1] === 216) return { ext: 'jpg', mime: 'image/jpeg' }
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { ext: 'png', mime: 'image/png' }
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP')
    return { ext: 'webp', mime: 'image/webp' }
}
export const decode = (value: unknown) =>
  String(value ?? '').replace(/&(amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi, (m, key: string) => {
    const common: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }
    if (key[0] !== '#') return common[key.toLowerCase()] ?? m
    const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1))
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m
  })
