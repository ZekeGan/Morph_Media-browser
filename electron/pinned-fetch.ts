import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net, { type LookupFunction } from 'node:net'
import { pipeline, Readable } from 'node:stream'
import zlib from 'node:zlib'
import { privateAddress } from './image-url'

// R-334: fetching an address anyone could have typed (a web page, an image address). Checking the host's DNS
// answer first and letting fetch resolve it again leaves a gap: a second answer could point at this computer or the
// local network (DNS rebinding). Here the address is resolved and checked inside the connection itself, and the
// socket connects to exactly the address that passed. GET only; redirects are returned, never followed.
type Resolve = (host: string) => Promise<{ address: string; family: number }[]>
const systemResolve: Resolve = (host) => dns.promises.lookup(host, { all: true })

export function checkedLookup(resolve: Resolve = systemResolve): LookupFunction {
  return (host, options, callback) => {
    resolve(host).then(
      (list) => {
        if (!list.length) return callback(new Error('無法解析主機'), '', 4)
        if (list.some((entry) => privateAddress(entry.address)))
          return callback(new Error('不允許本機或內網位址'), '', 4)
        if (options.all) callback(null, list)
        else callback(null, list[0].address, list[0].family)
      },
      (error) => callback(error, '', 4)
    )
  }
}

export function pinnedFetch(
  input: string | URL | Request,
  init: RequestInit = {},
  resolve?: Resolve
): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    return Promise.reject(new Error('只接受不含帳號密碼的 HTTP(S) 網址'))
  // Node skips the lookup hook for an address written as an IP, so those are checked here.
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    (net.isIP(host) && privateAddress(host))
  )
    return Promise.reject(new Error('不允許本機或內網位址'))
  if ((init.method ?? 'GET').toUpperCase() !== 'GET') return Promise.reject(new Error('只接受 GET'))
  const headers: Record<string, string> = {}
  new Headers(init.headers).forEach((value, key) => (headers[key] = value))
  headers['accept-encoding'] = 'gzip, deflate, br'
  return new Promise((done, fail) => {
    const request = (url.protocol === 'https:' ? https : http).request(
      url,
      { method: 'GET', headers, lookup: checkedLookup(resolve), signal: init.signal ?? undefined },
      (response) => {
        const encoding = String(response.headers['content-encoding'] ?? '').toLowerCase()
        const decoder =
          encoding === 'gzip'
            ? zlib.createGunzip()
            : encoding === 'deflate'
              ? zlib.createInflate()
              : encoding === 'br'
                ? zlib.createBrotliDecompress()
                : undefined
        // pipeline passes a dropped connection or a timeout on to the decoder (pipe would leave it waiting), and
        // cancelling the decoded stream closes the connection.
        const body: Readable = decoder ? pipeline(response, decoder, () => {}) : response
        const result = new Headers()
        for (const [key, value] of Object.entries(response.headers))
          if (value !== undefined) result.set(key, Array.isArray(value) ? value.join(', ') : value)
        // The body below is already decoded, so its length and encoding no longer apply.
        result.delete('content-encoding')
        result.delete('content-length')
        const status = response.statusCode ?? 502
        const empty = [204, 205, 304].includes(status) || status < 200
        if (empty) response.resume()
        done(
          new Response(empty ? null : (Readable.toWeb(body) as ReadableStream<Uint8Array>), {
            status: status < 200 ? 502 : status,
            headers: result,
          })
        )
      }
    )
    request.on('error', fail)
    request.end()
  })
}
