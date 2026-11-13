// Adds interface text in all five languages to src/i18n/messages.json (R-358). Keys are the zh-TW sentence.
//   pnpm i18n add <file.json> [--force]
// The file maps each zh-TW sentence to its other four languages, as a list or an object:
//   { "上次讀到第 {0} 頁": ["上次读到第 {0} 页", "Last read: page {0}", "前回は {0} ページまで", "Última lectura: página {0}"] }
//   { "…": { "zh-CN": "…", "en": "…", "ja": "…", "es": "…" } }
// An existing key is only replaced with --force; every translation must keep the {n} placeholders of its key.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const languages = ['zh-CN', 'en', 'ja', 'es']
const placeholders = (text) =>
  [...text.matchAll(/\{\d+\}/g)]
    .map((m) => m[0])
    .sort()
    .join(',')

export function addMessages(messages, entries, force = false) {
  const out = { ...messages },
    added = []
  for (const [key, value] of Object.entries(entries)) {
    const translations = Array.isArray(value)
      ? Object.fromEntries(languages.map((language, i) => [language, value[i]]))
      : value
    for (const language of languages)
      if (typeof translations[language] !== 'string' || !translations[language].trim())
        throw new Error(`「${key}」缺少 ${language}`)
    for (const language of languages)
      if (placeholders(translations[language]) !== placeholders(key))
        throw new Error(`「${key}」的 ${language} 佔位符不一致：${translations[language]}`)
    if (key in out && !force) throw new Error(`「${key}」已經有翻譯（要取代就加 --force）`)
    out[key] = Object.fromEntries(languages.map((language) => [language, translations[language]]))
    added.push(key)
  }
  return { messages: out, added }
}

function main() {
  const [command, file, ...rest] = process.argv.slice(2)
  if (command !== 'add' || !file) {
    console.log(
      fs
        .readFileSync(import.meta.filename, 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('//'))
        .join('\n')
    )
    process.exit(command ? 2 : 0)
  }
  const target = path.resolve(import.meta.dirname, '../src/i18n/messages.json')
  const { messages, added } = addMessages(
    JSON.parse(fs.readFileSync(target, 'utf8')),
    JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')),
    rest.includes('--force')
  )
  fs.writeFileSync(target, JSON.stringify(messages, null, 2) + '\n')
  console.log(`加入 ${added.length} 句`)
}
if (import.meta.url === pathToFileURL(process.argv[1]).href)
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
