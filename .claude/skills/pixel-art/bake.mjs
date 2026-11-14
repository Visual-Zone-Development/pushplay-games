// Bake sprite sheets to PNG ahead of time (pixel-art skill). High-detail sheets take seconds to minutes to
// render, too slow for game start, so render them once here and ship the PNGs.
//
//   node <skill-dir>/bake.mjs <root-dir> <page> [out-dir]      (<skill-dir> is the folder this file is in)
//   e.g. node <skill-dir>/bake.mjs . tools/bake.html assets/sprites
//
// <root-dir> is served over HTTP; <page> (relative to it) renders the sheets and sets
//   window.__bake = [{ name, canvas, meta? }, …]   then   window.__bakeDone = true
// Each entry is written to <out-dir>/<name>.png (+ <name>.json when meta is given). Keep the page in the game's
// tools/ folder (kept out of the build), where it can import the game's own models and the toolkit copies.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const [root, page, outArg] = process.argv.slice(2)
if (!root || !page) {
  console.error('usage: node bake.mjs <root-dir> <page> [out-dir]')
  process.exit(1)
}
const out = path.resolve(outArg || path.join(root, 'assets', 'sprites'))
fs.mkdirSync(out, { recursive: true })

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

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  const p = path.join(path.resolve(root), decodeURIComponent(new URL(req.url, 'http://x').pathname))
  if (!p.startsWith(path.resolve(root)) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' })
  fs.createReadStream(p).pipe(res)
})
await new Promise((r) => server.listen(0, r))
const port = server.address().port

const { chromium } = findPlaywright()
const browser = await chromium.launch()
const tab = await browser.newPage()
tab.on('pageerror', (e) => console.error('page error:', e.message))
tab.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()))
const t0 = Date.now()
await tab.goto(`http://localhost:${port}/${page}`)
await tab.waitForFunction(() => window.__bakeDone === true, null, { timeout: 30 * 60 * 1000, polling: 500 })
const items = await tab.evaluate(() => window.__bake.map((b) => ({ name: b.name, url: b.canvas.toDataURL('image/png'), meta: b.meta ?? null })))
for (const it of items) {
  fs.writeFileSync(path.join(out, `${it.name}.png`), Buffer.from(it.url.split(',')[1], 'base64'))
  if (it.meta) fs.writeFileSync(path.join(out, `${it.name}.json`), JSON.stringify(it.meta, null, 2))
  console.log(`wrote ${path.relative(process.cwd(), path.join(out, it.name))}.png`)
}
console.log(`baked ${items.length} sheet(s) in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
await browser.close()
server.close()
