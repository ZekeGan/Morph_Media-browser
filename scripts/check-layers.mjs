// Layer check (R-248): the renderer (src/) runs sandboxed in the window, the main process (electron/) owns files and
// the system, and shared/ is plain logic both use. Imports must not cross those lines:
//   src/      may not import electron/, Electron or Node built-ins
//   shared/   may not import src/, electron/, Electron, Node built-ins, React or Mantine
//   electron/ may not import src/
// `import type` is allowed everywhere: types vanish at build time. Run by .githooks/pre-commit (about 0.1 s).
import fs from 'node:fs'
import path from 'node:path'
import { builtinModules } from 'node:module'

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')),
  '..'
)
const builtins = new Set(builtinModules.flatMap((name) => [name, 'node:' + name]))
const rules = {
  src: { folders: ['electron'], packages: (name) => name === 'electron' || builtins.has(name) },
  shared: {
    folders: ['src', 'electron'],
    packages: (name) =>
      name === 'electron' ||
      builtins.has(name) ||
      /^(react|react-dom)(\/|$)/.test(name) ||
      name.startsWith('@mantine/'),
  },
  electron: { folders: ['src'], packages: () => false },
}
const files = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory()
      ? files(full)
      : /\.(ts|tsx|mts|js|mjs)$/.test(entry.name)
        ? [full]
        : []
  })
// Static imports and re-exports (skipping `import type` / `export type`), side-effect imports and import().
const pattern =
  /(?:^|[;\n])\s*(?:import|export)\s+(type\s+)?(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

const problems = []
for (const [layer, rule] of Object.entries(rules)) {
  for (const file of files(path.join(root, layer))) {
    const text = fs.readFileSync(file, 'utf8')
    for (const match of text.matchAll(pattern)) {
      if (match[1]) continue
      const spec = match[2] ?? match[3]
      const line =
        text.slice(0, match.index).split('\n').length + (text[match.index] === '\n' ? 1 : 0)
      const where = `${path.relative(root, file).replaceAll('\\', '/')}:${line}`
      if (spec.startsWith('.')) {
        const target = path
          .relative(root, path.resolve(path.dirname(file), spec))
          .split(path.sep)[0]
        if (rule.folders.includes(target)) problems.push(`${where} imports ${target}/ (${spec})`)
      } else if (rule.packages(spec)) problems.push(`${where} imports ${spec}`)
    }
  }
}
if (problems.length) {
  console.error('Imports that cross process layers (see scripts/check-layers.mjs):')
  for (const problem of problems) console.error('  ' + problem)
  process.exit(1)
}
console.log('Layers: no imports cross src/, shared/ and electron/.')
