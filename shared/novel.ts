// R-282: pure helpers shared by the novel reader (window) and the EPUB reader (main).

// A path inside an EPUB, resolved against the file that names it; outside links and paths leaving the package give
// undefined.
export function packagePath(base: string, href: string) {
  let clean: string
  try {
    clean = decodeURIComponent(href.split('#')[0].split('?')[0])
  } catch {
    return undefined
  }
  if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean)) return undefined
  const parts = clean.startsWith('/')
    ? []
    : base
        .split('/')
        .slice(0, -1)
        .filter((p) => p && p !== '.')
  for (const part of clean.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) return undefined
      parts.pop()
    } else parts.push(part)
  }
  return parts.join('/')
}

// Ruby as web novels write it: ｜漢字《かんじ》 (or |漢字《かんじ》) marks the base explicitly; otherwise the kanji run
// right before 《…》 is the base. Returns plain pieces and ruby pieces in order.
export type TextPiece = string | { base: string; ruby: string }
export function rubyPieces(line: string): TextPiece[] {
  const pieces: TextPiece[] = []
  const pattern =
    /[｜|]([^｜|《》\n]{1,30})《([^《》\n]{1,30})》|([一-鿿々〆ヶ]{1,20})《([^《》\n]{1,30})》/g
  let last = 0
  for (const match of line.matchAll(pattern)) {
    if (match.index! > last) pieces.push(line.slice(last, match.index))
    pieces.push({ base: match[1] ?? match[3], ruby: match[2] ?? match[4] })
    last = match.index! + match[0].length
  }
  if (last < line.length) pieces.push(line.slice(last))
  return pieces
}

// The share of the whole book read: chapters weighted by their length.
export function bookPercent(lengths: number[], chapter: number, position: number) {
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (!total) return 0
  const before = lengths.slice(0, chapter).reduce((sum, length) => sum + length, 0)
  return Math.min(1, Math.max(0, (before + (lengths[chapter] ?? 0) * position) / total))
}

// The text book in a folder read most recently, for the reading progress / last read cells and columns.
export function latestNovel(
  novels: Record<string, { percent: number; updated: string }> | undefined
) {
  return Object.values(novels ?? {}).sort((a, b) => b.updated.localeCompare(a.updated))[0]
}
