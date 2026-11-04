import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { catalog } from '../src/i18n/catalog'
import { setLocale, t as tr, fieldTypeLabel } from '../src/i18n'
import { cellColors } from '../src/themes/cellStyle'
import { defaultCells } from '../shared/model'

test('every UI message has complete translations and preserves substitution values', () => {
  const sources = new Set<string>()
  for (const file of fs.readdirSync('src').filter((file) => /\.tsx?$/.test(file))) {
    const sf = ts.createSourceFile(
      file,
      fs.readFileSync('src/' + file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    )
    const walk = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(sf) === 'tr' &&
        ts.isStringLiteral(node.arguments[0])
      )
        sources.add(node.arguments[0].text.replace(/\s+/g, ' ').trim())
      ts.forEachChild(node, walk)
    }
    walk(sf)
  }
  for (const [locale, messages] of Object.entries(catalog)) {
    for (const source of sources) {
      assert.ok(messages[source], locale + ': ' + source)
      assert.deepEqual(
        [...messages[source].matchAll(/\{\d+\}/g)].map((v) => v[0]).sort(),
        [...source.matchAll(/\{\d+\}/g)].map((v) => v[0]).sort(),
        locale + ': ' + source
      )
    }
  }
  const userName = '漫畫 / 日常 · Café {1}'
  for (const locale of ['ja', 'zh-CN', 'en', 'es'] as const) {
    setLocale(locale)
    assert.ok(tr('開啟專案 {0}', userName).includes(userName))
    assert.equal(tr(userName), userName)
  }
  setLocale('zh-TW')
  assert.equal(fieldTypeLabel('boolean'), '是／否')
  assert.equal(fieldTypeLabel('enum'), '單選')
  assert.equal(fieldTypeLabel('custom-format'), 'custom-format')
  assert.equal(fieldTypeLabel('constructor'), 'constructor')
  assert.equal(tr('應用程式設定'), '應用程式設定')
})
test('translations contain no corrupted characters', () => {
  const garbled = /[\u0000-\u0008\u000b\u000c\u000e-\u001fᄀ-ᇿ᐀-ᙿ가-힯-�翿]/
  for (const [locale, messages] of Object.entries(catalog))
    for (const [source, text] of Object.entries(messages))
      assert.ok(!garbled.test(text), locale + ': "' + source + '" has garbled text')
})

test('only the shipped neutral transparent CELL baseline follows theme colors', () => {
  const cell = defaultCells(() => 'id')[0]
  assert.equal(cellColors(cell).color, 'var(--text)')
  assert.equal(
    cellColors({ ...cell, style: { textColor: '#ff0000', backgroundColor: 'transparent' } }).color,
    '#ff0000'
  )
  assert.deepEqual(
    cellColors({ ...cell, style: { textColor: '#e4e6e8', backgroundColor: '#112233' } }),
    { color: '#e4e6e8', background: '#112233' }
  )
})
