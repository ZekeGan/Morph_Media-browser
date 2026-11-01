import { spawn } from 'node:child_process'
import path from 'node:path'
import { DATA_DIR } from '../shared/model'
import { message, safePath } from './files'

// Reading attributes needs PowerShell, whose start-up alone costs about half a second. One long-lived helper answers
// every listing instead: it reads one JSON directory per line and writes one JSON line back. This does not change
// files or scan rules; if the helper dies or times out it is simply started again for the next request.
const hiddenScript = `[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$ErrorActionPreference = 'Stop'
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  try {
    $directory = ConvertFrom-Json $line
    $names = @((New-Object IO.DirectoryInfo($directory)).GetFileSystemInfos() | Where-Object { $_.Attributes -band ([IO.FileAttributes]::Hidden -bor [IO.FileAttributes]::System) } | ForEach-Object { $_.Name })
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject $names -Compress))
  } catch { [Console]::Out.WriteLine((ConvertTo-Json -InputObject @{ error = $_.Exception.Message } -Compress)) }
}`
type Pending = {
  resolve: (line: string) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}
let helper: { child: ReturnType<typeof spawn>; queue: Pending[]; buffer: string } | undefined
function startHelper() {
  const executable = path.join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )
  const child = spawn(
    executable,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(hiddenScript, 'utf16le').toString('base64'),
    ],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
  )
  const state = { child, queue: [] as Pending[], buffer: '' }
  const fail = (error: Error) => {
    if (helper === state) helper = undefined
    for (const item of state.queue.splice(0)) {
      clearTimeout(item.timer)
      item.reject(error)
    }
    child.kill()
  }
  child.stdout!.setEncoding('utf8').on('data', (chunk: string) => {
    state.buffer += chunk
    for (let end = state.buffer.indexOf('\n'); end >= 0; end = state.buffer.indexOf('\n')) {
      const line = state.buffer
        .slice(0, end)
        .replace(/^\uFEFF/, '')
        .trim()
      state.buffer = state.buffer.slice(end + 1)
      const item = state.queue.shift()
      if (!item) continue
      clearTimeout(item.timer)
      item.resolve(line)
    }
    if (state.buffer.length > 8 * 1024 * 1024) fail(new Error('隱藏屬性清單過大'))
  })
  child.stderr!.setEncoding('utf8').on('data', () => {})
  child.on('error', fail)
  child.on('close', () => fail(new Error('無法讀取隱藏屬性')))
  child.stdin!.on('error', () => fail(new Error('無法讀取隱藏屬性')))
  // The helper must never keep the application (or a test run) alive on its own.
  child.unref()
  ;(child.stdin as unknown as { unref?: () => void }).unref?.()
  ;(child.stdout as unknown as { unref?: () => void }).unref?.()
  ;(child.stderr as unknown as { unref?: () => void }).unref?.()
  return state
}
// Start the helper ahead of the first folder listing, so that listing does not pay the start-up time.
export function warmHiddenHelper() {
  if (process.platform === 'win32') helper ??= startHelper()
}
export async function hiddenFileNames(directory: string): Promise<Set<string>> {
  if (process.platform !== 'win32') return new Set()
  const state = (helper ??= startHelper())
  const output = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (helper === state) helper = undefined
      state.child.kill()
      reject(new Error('讀取隱藏屬性逾時'))
    }, 15000)
    state.queue.push({ resolve, reject, timer })
    state.child.stdin!.write(JSON.stringify(directory) + '\n')
  })
  const names: unknown = JSON.parse(output)
  if (names && typeof names === 'object' && !Array.isArray(names) && 'error' in names)
    throw new Error(String((names as { error: unknown }).error))
  if (!Array.isArray(names) || !names.every((name) => typeof name === 'string'))
    throw new Error('隱藏屬性結果不合法')
  return new Set(names)
}

// Paths are data on stdin, never interpolated into PowerShell source or wildcards.
const script = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$paths = ConvertFrom-Json ([Console]::In.ReadToEnd())
$failures = @()
foreach ($item in $paths) {
  try {
    $attrs = [IO.File]::GetAttributes($item)
    if (($attrs -band [IO.FileAttributes]::ReparsePoint) -or -not ($attrs -band [IO.FileAttributes]::Directory)) {
      throw 'Metadata path is not a regular directory'
    }
    if (-not ($attrs -band [IO.FileAttributes]::Hidden)) {
      [IO.File]::SetAttributes($item, ($attrs -bor [IO.FileAttributes]::Hidden))
    }
  } catch { $failures += @{ path = $item; error = $_.Exception.Message } }
}
ConvertTo-Json -InputObject @($failures) -Compress
`

export async function hideDirectories(dirs: string[]): Promise<{ dir: string; error: string }[]> {
  if (process.platform !== 'win32' || !dirs.length) return []
  const failures: { dir: string; error: string }[] = [],
    paths: string[] = []
  for (const dir of dirs) {
    try {
      const meta = path.join(dir, DATA_DIR)
      await safePath(dir, meta)
      paths.push(meta)
    } catch (error) {
      failures.push({ dir, error: message(error) })
    }
  }
  if (!paths.length) return failures
  try {
    const output = await new Promise<string>((resolve, reject) => {
      const executable = path.join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe'
      )
      const child = spawn(
        executable,
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          Buffer.from(script, 'utf16le').toString('base64'),
        ],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      let stdout = '',
        stderr = ''
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error('設定隱藏屬性逾時'))
      }, 30000)
      child.stdout.setEncoding('utf8').on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr.setEncoding('utf8').on('data', (chunk) => {
        stderr += chunk
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        code === 0 ? resolve(stdout) : reject(new Error(stderr || `隱藏屬性程序退出：${code}`))
      })
      child.stdin.on('error', reject)
      child.stdin.end(JSON.stringify(paths))
    })
    const reported: { path: string; error: string }[] = JSON.parse(output.replace(/^\uFEFF/, ''))
    failures.push(...reported.map((item) => ({ dir: path.dirname(item.path), error: item.error })))
  } catch (error) {
    failures.push(...paths.map((meta) => ({ dir: path.dirname(meta), error: message(error) })))
  }
  return failures
}
