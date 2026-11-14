// Render pages of a game to PNG with headless Chromium (WebGL via SwiftShader), for comparing assets
// with their reference and before/after. Works for any game (2D canvas, SVG, WebGL): it serves the game's
// folder (with the project's Vite when it has one, otherwise a plain static server), takes every shot, then stops.
// Run it from the project root.
//
//   node <skill-dir>/scripts/shot.mjs <game-dir> <outDir> "<page>|<name>.png[|options]" ...
//
// <skill-dir> is the folder of the skill this script belongs to. <game-dir> is the game's folder relative to
// the working directory: `.` for a game at the project root, or e.g. `games/my-game` (a bare `my-game` also
// finds `games/my-game`).
// Each shot waits for document.title === 'ready' (asset galleries and viewers set it), unless options say:
//   wait=<ms>        just wait this long (for pages that never set 'ready', e.g. the game itself)
//   keys=Enter,Space press these keys first (e.g. to leave the title screen), then wait
//   size=WxH         viewport (default 1280 wide, 800 high: what the toolkit galleries and viewers draw at;
//                    pass the game's own logical resolution for shots of the game)
// e.g. node <skill-dir>/scripts/shot.mjs . /tmp/shots \
//        "gallery.html?asset=hero&anim=run&frames=8|hero-run.png" "index.html|play.png|keys=Enter|wait=2500"
// Needs Playwright: see findPlaywright() below.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'

const DEFAULT_SIZE = { width: 1280, height: 800 }
const root = process.cwd()
const [gameArg, outDir, ...shots] = process.argv.slice(2)
if (!gameArg || !outDir || !shots.length || gameArg === '--help' || gameArg === '-h') {
  console.error(`usage: shot.mjs <game-dir> <outDir> "<page>|<name>.png[|wait=ms][|keys=Enter][|size=WxH]" ...
  <game-dir>: the game's folder relative to the working directory ("." for a game at the project root)`)
  process.exit(1)
}
const isDir = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory()
const gameDir = isDir(path.resolve(root, gameArg)) ? gameArg : isDir(path.join(root, 'games', gameArg)) ? path.join('games', gameArg) : null
if (!gameDir) {
  console.error(`shot.mjs: no folder "${gameArg}" (or "games/${gameArg}") in ${root}`)
  process.exit(1)
}

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
fs.mkdirSync(outDir, { recursive: true })

// Serve the game folder: the project's own Vite when it is installed (it resolves npm imports), else static files.
let stopServer
let port = 5300 + Math.floor(Math.random() * 400)
const viteBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite')
if (fs.existsSync(viteBin)) {
  const vite = spawn(viteBin, [gameDir, '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
  stopServer = () => vite.kill()
} else {
  const dir = path.resolve(root, gameDir)
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' }
  const server = http.createServer((req, res) => {
    let p = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (p.startsWith(dir) && isDir(p)) p = path.join(p, 'index.html')
    if (!p.startsWith(dir) || !fs.existsSync(p)) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' })
    fs.createReadStream(p).pipe(res)
  })
  await new Promise((r) => server.listen(0, r))
  port = server.address().port
  stopServer = () => server.close()
}
const base = `http://localhost:${port}/`
for (let i = 0; i < 60; i++) {
  try {
    await fetch(base)
    break
  } catch {}
  await new Promise((r) => setTimeout(r, 500))
}
// Use the preinstalled Chromium when there is one (cloud sandboxes), otherwise Playwright's own.
const exe = ['/opt/pw-browsers/chromium'].find(fs.existsSync)
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
let failed = null
try {
  for (const shot of shots) {
    const [url, name, ...rest] = shot.split('|')
    const opt = Object.fromEntries(rest.map((o) => o.split('=')))
    const [width, height] = opt.size ? opt.size.split('x').map(Number) : [DEFAULT_SIZE.width, DEFAULT_SIZE.height]
    const page = await browser.newPage({ viewport: { width, height } })
    failed = null
    page.on('pageerror', (e) => {
      console.log('pageerror:', e.message)
      failed ??= e.message
    })
    page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && console.log('console:', m.text().slice(0, 200)))
    await page.goto(base + url)
    if (opt.keys) {
      await page.waitForTimeout(800)
      for (const k of opt.keys.split(',')) {
        await page.keyboard.press(k)
        await page.waitForTimeout(250)
      }
    }
    if (opt.wait || opt.keys) await page.waitForTimeout(+(opt.wait ?? 1500))
    else {
      let tick
      try {
        await Promise.race([
          page.waitForFunction(() => document.title === 'ready', null, { timeout: 120000 }),
          new Promise((_, reject) => {
            tick = setInterval(() => failed && reject(new Error(`page error: ${failed}`)), 200)
          })
        ])
      } finally {
        clearInterval(tick)
      }
      await page.waitForTimeout(300)
    }
    const file = path.join(outDir, name)
    await page.screenshot({ path: file })
    console.log('wrote', file)
    await page.close()
  }
} finally {
  await browser.close()
  stopServer()
}
