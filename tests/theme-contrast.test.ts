import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

// WCAG contrast of the colours the three themes use for text, so a palette tweak cannot quietly make text hard to read.
const css = fs.readFileSync('src/themes/themes.css', 'utf8')

function tokens(theme: string): Record<string, string> {
  const block = css
    .split('}')
    .find((part) => part.includes(`[data-theme='${theme}']`) && part.includes('--app-bg'))
  assert.ok(block, theme)
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()])
  )
}
type Colour = [number, number, number, number]
function parse(value: string): Colour | undefined {
  const match = /^#([0-9a-f]{3,8})$/i.exec(value)
  if (!match) return undefined
  let hex = match[1]
  if (hex.length <= 4) hex = [...hex].map((char) => char + char).join('')
  const part = (index: number) => parseInt(hex.slice(index, index + 2), 16)
  return [part(0), part(2), part(4), hex.length === 8 ? part(6) / 255 : 1]
}
// A translucent colour is judged as it looks over what is behind it.
function over(top: Colour, bottom: Colour): Colour {
  const alpha = top[3]
  return [0, 1, 2].map((i) => top[i] * alpha + bottom[i] * (1 - alpha)).concat(1) as Colour
}
function luminance(colour: Colour) {
  const channel = (value: number) => {
    const x = value / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(colour[0]) + 0.7152 * channel(colour[1]) + 0.0722 * channel(colour[2])
}
function ratio(a: Colour, b: Colour) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

// [text colour, background colour, minimum ratio]. 4.5 is WCAG AA for normal text; accent buttons use bold,
// larger text, where 3 is the AA minimum.
const pairs: [string, string, number][] = [
  ['text', 'app-bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'panel', 4.5],
  ['text', 'sidebar', 4.5],
  ['text', 'titlebar', 4.5],
  ['text', 'hover', 4.5],
  ['muted', 'app-bg', 4.5],
  ['muted', 'panel', 4.5],
  ['muted', 'sidebar', 4.5],
  ['accent-ink', 'panel', 4.5],
  ['accent-ink', 'app-bg', 4.5],
  ['selected-text', 'selected', 4.5],
  ['error', 'panel', 4.5],
  ['warning', 'warning-bg', 4.5],
  ['warning', 'panel', 4.5],
  ['accent-contrast', 'accent', 3],
]

for (const theme of ['dark', 'glass', 'paper']) {
  test(`the ${theme} theme keeps text readable`, () => {
    const set = tokens(theme),
      base = parse(set['app-bg'])!
    const colour = (key: string) => {
      const parsed = parse(set[key])
      assert.ok(parsed, `${theme}: ${key} is not a plain hex colour`)
      return over(parsed, base)
    }
    for (const [foreground, background, minimum] of pairs) {
      const back = colour(background),
        value = ratio(over(colour(foreground), back), back)
      assert.ok(
        value >= minimum,
        `${theme}: ${foreground} on ${background} is ${value.toFixed(2)}, needs ${minimum}`
      )
    }
  })
}
