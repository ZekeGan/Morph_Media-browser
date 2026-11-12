import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { checkedLookup, pinnedFetch } from '../electron/pinned-fetch'

const lookup = (
  answer: { address: string; family: number }[],
  all = true
): Promise<{ error: Error | null; result: unknown }> =>
  new Promise((resolve) =>
    checkedLookup(async () => answer)('example.test', { all }, (error, result) =>
      resolve({ error, result })
    )
  )

test('R-334: the connection only goes to an address that passed the check', async () => {
  const ok = await lookup([{ address: '93.184.216.34', family: 4 }])
  assert.equal(ok.error, null)
  assert.deepEqual(ok.result, [{ address: '93.184.216.34', family: 4 }])
  const single = await lookup([{ address: '93.184.216.34', family: 4 }], false)
  assert.equal(single.result, '93.184.216.34')
  // Any private answer in the list refuses the whole host.
  for (const address of ['127.0.0.1', '10.0.0.8', '192.168.1.1', '::1', '::ffff:7f00:1'])
    assert.match(
      String(
        (
          await lookup([
            { address: '93.184.216.34', family: 4 },
            { address, family: 6 },
          ])
        ).error
      ),
      /內網/,
      address
    )
  assert.match(String((await lookup([])).error), /無法解析/)
})

test('R-334: a host that answers with this computer is never connected to, even on a second lookup', async (t) => {
  let hits = 0
  const server = http.createServer((_, response) => {
    hits++
    response.end('SECRET')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())))
  const port = (server.address() as AddressInfo).port
  // The first answer (the one an earlier check would have seen) is public; the connection's own answer is loopback.
  let calls = 0
  const rebinding = async () =>
    calls++ === 0
      ? [{ address: '93.184.216.34', family: 4 }]
      : [{ address: '127.0.0.1', family: 4 }]
  await rebinding()
  await assert.rejects(pinnedFetch(`http://example.test:${port}/`, {}, rebinding), /內網/)
  assert.equal(hits, 0, 'the local server was never reached')
  // Only GET, and no credentials in the address.
  await assert.rejects(pinnedFetch('https://example.test/', { method: 'POST' }), /GET/)
  await assert.rejects(pinnedFetch('https://user:pw@example.test/'), /帳號密碼/)
  await assert.rejects(pinnedFetch('file:///C:/Windows/win.ini'), /HTTP/)
})

test('R-334: addresses written as IPs are checked, and the plain fetch handed down is never used for covers', async (t) => {
  for (const url of [
    'http://127.0.0.1/',
    'https://[::1]/',
    'https://192.168.0.2/x',
    'https://a.localhost/',
  ])
    await assert.rejects(pinnedFetch(url), /內網/, url)
  const original = globalThis.fetch
  let used = 0
  globalThis.fetch = (async () => {
    used++
    return new Response('x')
  }) as typeof fetch
  t.after(() => {
    globalThis.fetch = original
  })
  const { fetchImageUrl } = await import('../electron/image-url')
  // A host that does not resolve: the pinned connection fails, and the spy standing in for fetch is never called.
  await assert.rejects(
    fetchImageUrl('https://cover.invalid/a.png', {
      fetcher: globalThis.fetch,
      lookup: async () => ['93.184.216.34'],
    })
  )
  assert.equal(used, 0)
})
