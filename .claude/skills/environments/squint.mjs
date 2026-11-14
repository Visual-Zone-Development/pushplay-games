// Squint test (environments skill): turn a screenshot into what a player perceives at a glance — values only
// (greyscale) and shapes only (blurred) — and measure value separation between screen regions. Works for any
// game and any art style. Look at the output images: the player, hazards and the path should still pop.
//
//   node <skill-dir>/squint.mjs <screenshot.png> <out-dir> [--play x,y,w,h] [--bg x,y,w,h]
//
// --play / --bg: rectangles (in screenshot px) around the play layer (player, platforms, path) and the
// background. Prints their mean luminance and the contrast between them; under ~0.15 apart, the play layer
// probably sinks into the background.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const args = process.argv.slice(2)
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1].split(',').map(Number) : null }
const play = opt('--play'), bg = opt('--bg')
const [input, outDir] = args
if (!input || !outDir) { console.error('usage: node squint.mjs <screenshot.png> <out-dir> [--play x,y,w,h] [--bg x,y,w,h]'); process.exit(1) }
fs.mkdirSync(outDir, { recursive: true })

// Find Playwright without knowing where the project keeps it: the PW_MODULE env var (a path to a `playwright`
// or `playwright-core` package folder), then the working directory's own dependencies, then any
// node_modules up to two folders below the working directory (hidden folders included).
function findPlaywright() {
  const names = ['playwright-core', 'playwright']
  const cwd = process.cwd()
  const load = (dir) => createRequire(path.join(dir, 'package.json'))(dir)
  if (process.env.PW_MODULE) {
    try { return load(path.resolve(process.env.PW_MODULE)) } catch (e) {
      console.error(`PW_MODULE=${process.env.PW_MODULE} is not a playwright or playwright-core package folder (${e.message.split('\n')[0]})`)
      process.exit(1)
    }
  }
  const require = createRequire(path.join(cwd, 'package.json'))
  for (const name of names) { try { return require(name) } catch {} }
  const subdirs = (dir) => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== 'node_modules').map((e) => path.join(dir, e.name))
    } catch { return [] }
  }
  const level1 = subdirs(cwd)
  for (const dir of [cwd, ...level1, ...level1.flatMap(subdirs)]) {
    for (const name of names) {
      const pkg = path.join(dir, 'node_modules', name)
      if (fs.existsSync(path.join(pkg, 'package.json'))) { try { return load(pkg) } catch {} }
    }
  }
  console.error('Playwright not found. Install it in the project (npm i -D playwright) or set PW_MODULE to the folder of a playwright or playwright-core package.')
  process.exit(1)
}
const { chromium } = findPlaywright()
const browser = await chromium.launch()
const page = await browser.newPage()
const data = 'data:image/png;base64,' + fs.readFileSync(input).toString('base64')
const result = await page.evaluate(async ({ data, play, bg }) => {
  const img = new Image()
  img.src = data
  await img.decode()
  const W = img.naturalWidth, H = img.naturalHeight
  const make = (filter) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const g = c.getContext('2d'); g.filter = filter; g.drawImage(img, 0, 0)
    return c
  }
  const grey = make('grayscale(1)'), blur = make(`grayscale(1) blur(${Math.round(W / 160)}px)`)
  const g = grey.getContext('2d').getImageData(0, 0, W, H).data
  const lum = (x, y) => g[(y * W + x) * 4] / 255
  const mean = (r) => { let s = 0, n = 0; for (let y = r[1]; y < r[1] + r[3]; y += 2) for (let x = r[0]; x < r[0] + r[2]; x += 2) { s += lum(x, y); n++ } return s / n }
  const hist = new Array(8).fill(0)
  for (let i = 0; i < W * H; i += 4) hist[Math.min(7, Math.floor(g[i * 4] / 32))]++
  const tot = hist.reduce((a, b) => a + b, 0)
  return { grey: grey.toDataURL(), blur: blur.toDataURL(), hist: hist.map((h) => h / tot), play: play ? mean(play) : null, bg: bg ? mean(bg) : null }
}, { data, play, bg })
const base = path.basename(input, path.extname(input))
fs.writeFileSync(path.join(outDir, `${base}-values.png`), Buffer.from(result.grey.split(',')[1], 'base64'))
fs.writeFileSync(path.join(outDir, `${base}-squint.png`), Buffer.from(result.blur.split(',')[1], 'base64'))
console.log(`wrote ${base}-values.png and ${base}-squint.png`)
console.log('value histogram (dark → light):', result.hist.map((h) => `${Math.round(h * 100)}%`).join(' '))
if (result.hist.filter((h) => h > 0.04).length <= 3) console.log('· most of the screen sits in 3 or fewer value bands: flat; push darks and lights apart')
if (result.play != null && result.bg != null) {
  const d = Math.abs(result.play - result.bg)
  console.log(`play layer ${result.play.toFixed(2)}, background ${result.bg.toFixed(2)}, separation ${d.toFixed(2)}${d < 0.15 ? '  ✗ too close: darken / lighten the background or add haze' : '  ✓'}`)
}
await browser.close()
