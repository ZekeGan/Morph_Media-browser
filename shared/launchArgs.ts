// Launch arguments are typed as a JSON string array. A Windows path pasted with single backslashes is not valid
// JSON (and "\n" in "D:\new" would silently become a newline), so those are doubled rather than rejected.
export function parseLaunchArgs(text: string): string[] | undefined {
  const raw = text.trim() || '[]'
  const doubled = (value: string) =>
    value.replace(/\\\\|\\/g, (match) => (match.length === 2 ? match : '\\\\'))
  // A drive path with a single backslash means every backslash is meant literally.
  const attempts = /[A-Za-z]:\\(?!\\)/.test(raw) ? [doubled(raw), raw] : [raw, doubled(raw)]
  for (const attempt of attempts) {
    try {
      const parsed: unknown = JSON.parse(attempt)
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')) return parsed
    } catch {
      // try the next form
    }
  }
  return undefined
}
