// Short reports of UI test runs (R-356): what went wrong in a failed run, without the whole log.

// Terminal colours make the text harder to search.
export const plain = (text) => text.replace(/\x1b\[[0-9;]*m/g, '')

// The error and its message lines (assertion values, Playwright's call log), the line of the test it stopped at, what
// the page said and where the screenshots are. Falls back to the end of the output when no error line is found.
export function failureSummary(text, name) {
  const lines = plain(text).split(/\r?\n/),
    start = lines.findIndex((line) => /^\s*(\w*Error\b|Error:)/.test(line))
  const picked = []
  if (start >= 0) {
    for (const line of lines.slice(start, start + 40)) {
      if (/^\s+at /.test(line) || /^Node\.js v/.test(line)) continue
      picked.push(line)
      if (picked.length >= 16) break
    }
    const own = lines.find(
      (line) => line.includes(`tests\\${name}.ts:`) || line.includes(`tests/${name}.ts:`)
    )
    const support = lines.find((line) => /tests[\\/]support[\\/][^:]+\.ts:\d+/.test(line))
    const at = own ?? support
    if (at)
      picked.push(
        'Stopped at: ' +
          at
            .trim()
            .replace(/^at\s+/, '')
            .replace(/\s*\{$/, '')
      )
  } else picked.push(...lines.filter(Boolean).slice(-12))
  for (const line of lines)
    if (/^(Artifacts|Page said):/.test(line) && !picked.includes(line))
      picked.push(line.length > 200 ? line.slice(0, 200) + '…' : line)
  return picked.join('\n')
}
