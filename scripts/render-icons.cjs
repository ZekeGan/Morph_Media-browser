// Renders the brand SVGs in docs/brand to PNG and packs build/icon.ico (PNG-compressed entries).
// Run with Electron so the browser engine draws the SVG:  pnpm exec electron scripts/render-icons.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

app.commandLine.appendSwitch('force-device-scale-factor', '1')
const root = path.resolve(__dirname, '..')
const brand = path.join(root, 'docs', 'brand')
const out = path.join(root, 'build')
// Small sizes use the heavier drawing so the colon stays visible.
const sizes = [16, 24, 32, 48, 64, 128, 256, 512]
const source = (size) => (size <= 32 ? 'morph-icon-small.svg' : 'morph-icon.svg')

// One offscreen window is reused: creating a second one after destroying the first fails to load.
let win
let last
function window(size) {
  if (!win) {
    win = new BrowserWindow({
      width: size,
      height: size,
      useContentSize: true,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: { offscreen: true },
    })
    win.webContents.setFrameRate(5)
    win.webContents.on('paint', (event, dirty, image) => {
      last = image
    })
  } else win.setContentSize(size, size)
  return win
}
async function render(svg, size) {
  const target = window(size)
  last = undefined
  const html =
    '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:' +
    size +
    'px;height:' +
    size +
    'px}</style>' +
    svg
  const page = path.join(os.tmpdir(), 'morph-icon-' + size + '.html')
  fs.writeFileSync(page, html)
  await target.loadFile(page)
  await new Promise((resolve) => setTimeout(resolve, 700))
  if (!last) throw new Error('nothing was painted for ' + size)
  const exact =
    last.getSize().width === size
      ? last
      : last.resize({ width: size, height: size, quality: 'best' })
  return exact.toPNG()
}

function ico(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  let offset = 6 + entries.length * 16
  const directory = entries.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...directory, ...entries.map((entry) => entry.png)])
}

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(path.join(out, 'icons'), { recursive: true })
    const entries = []
    for (const size of sizes) {
      const png = await render(fs.readFileSync(path.join(brand, source(size)), 'utf8'), size)
      fs.writeFileSync(path.join(out, 'icons', size + 'x' + size + '.png'), png)
      if (size <= 256) entries.push({ size, png })
      if (size === 512) fs.writeFileSync(path.join(out, 'icon.png'), png)
    }
    fs.writeFileSync(path.join(out, 'icon.ico'), ico(entries))
    console.log('icons written to', out)
    app.quit()
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
