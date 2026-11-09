// Before / after capture for a polish pass: the same game at two points in its history, same seed, same
// autopilot, captured at exactly the same frames of play, side by side.
//
//   node .claude/skills/polish-pass/scripts/compare.mjs <game-id> <outDir> [options]
//
// Options:
//   --before <git-ref>   the "before" build (default HEAD, so uncommitted changes are the "after")
//   --before-dir <path>  use a repo checkout on disk as "before" instead of a git ref
//   --solo               capture only the current working tree (a baseline, or shots for a brief)
//   --seed <n>           seed passed as ?seed= (default 7)
//   --at 2,5,10,20       seconds of play to capture as stills (default 2,5,10,20)
//   --size 1280x800      viewport (a phone game: 390x844 or 844x390)
//   --scale 1            device scale factor (2 for crisp stills of a 2D game)
//   --query k=v&k2=v2    extra URL parameters for both builds
//   --video              also write side-by-side.mp4 (clip.mp4 with --solo) up to the last --at (needs ffmpeg)
//   --fps 30             frame rate of that clip: 15, 20, 30 or 60
//
// How the moments line up: the script runs each page on a virtual clock. It takes over
// requestAnimationFrame and performance.now, and once play starts it steps the game exactly 1/60 s per
// frame. Frame N is the same moment in both builds however slow headless rendering is, and a game that
// is deterministic for a seed (seeded RNG, an autopilot that reads only game state, no Math.random in the
// rules) plays the same run in both. Timers (setTimeout) and Date.now still run on real time.
//
// What the game needs (docs/game-design/debugging.md, "Test hooks"):
//   ?seed=n       a seeded RNG for everything that affects play
//   ?autopilot    an in-game bot that plays by itself from game state
//   __game.start  optional: start a run from the title (otherwise Enter is pressed)
//
// Writes into <outDir>: before-<t>.png, after-<t>.png, compare.png (a labelled grid), report.json
// (state at each still, frame cost, page errors, whether the runs diverged) and the clip with --video.
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const args = process.argv.slice(2)
const flags = {}
const pos = []
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (!a.startsWith('--')) pos.push(a)
  else if (['--solo', '--video'].includes(a)) flags[a.slice(2)] = true
  else flags[a.slice(2)] = args[++i]
}
const [id, outArg] = pos
if (!id || !outArg) {
  console.error('usage: compare.mjs <game-id> <outDir> [--before <ref> | --before-dir <path> | --solo] [--seed 7] [--at 2,5,10,20] [--size 1280x800] [--scale 1] [--query k=v] [--video] [--fps 30]')
  process.exit(1)
}
const outDir = path.resolve(outArg)
mkdirSync(outDir, { recursive: true })
const seed = flags.seed ?? '7'
const times = [...new Set((flags.at ?? '2,5,10,20').split(',').map(Number).filter((n) => n >= 0))].sort((a, b) => a - b)
const [vw, vh] = (flags.size ?? '1280x800').split('x').map(Number)
const scale = Number(flags.scale ?? 1)
const clipFps = Number(flags.fps ?? 30)
if (![15, 20, 30, 60].includes(clipFps)) {
  console.error('--fps must be 15, 20, 30 or 60')
  process.exit(1)
}
const query = `?seed=${seed}&autopilot${flags.query ? '&' + flags.query.replace(/^[?&]/, '') : ''}`
const gameRel = existsSync(path.join(root, 'games', id)) ? `games/${id}` : '.'
if (!existsSync(path.join(root, gameRel, 'pushplay.json'))) {
  console.error(`no game "${id}" here (looked for ${gameRel}/pushplay.json)`)
  process.exit(1)
}
const ffmpeg = (() => {
  if (!flags.video) return null
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return 'ffmpeg'
  } catch {
    console.warn('! ffmpeg not found on PATH: no clip, but the stills and compare.png still work')
    return null
  }
})()

const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' }).trim()
const cleanup = []
const servers = []

// --- the "before" checkout -----------------------------------------------------------------
let beforeRoot = null
if (!flags.solo) {
  if (flags['before-dir']) beforeRoot = path.resolve(flags['before-dir'])
  else {
    const ref = flags.before ?? 'HEAD'
    const sha = git('rev-parse', '--verify', `${ref}^{commit}`)
    if (ref === 'HEAD' && !git('status', '--porcelain', '--', gameRel)) {
      console.warn(`! ${gameRel} has no uncommitted changes, so before (HEAD) and after are the same code.`)
      console.warn('  Pass --before <the commit the pass started from>, or --solo for a single capture.')
    }
    beforeRoot = mkdtempSync(path.join(os.tmpdir(), `compare-${id}-`))
    rmSync(beforeRoot, { recursive: true })
    git('worktree', 'add', '--detach', beforeRoot, sha)
    cleanup.push(() => {
      try {
        git('worktree', 'remove', '--force', beforeRoot)
      } catch {
        rmSync(beforeRoot, { recursive: true, force: true })
        git('worktree', 'prune')
      }
    })
    // Its own node_modules (vite, and three or other packages in a --vite game), from the npm cache.
    if (existsSync(path.join(root, 'node_modules'))) {
      console.log(`installing packages for the before build (${sha.slice(0, 8)})…`)
      execFileSync('npm', ['install', '--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: beforeRoot, stdio: 'ignore' })
    }
  }
}

// --- serve both builds with vite -------------------------------------------------------------
async function serve(repoRoot) {
  const port = 5300 + Math.floor(Math.random() * 600)
  const vite = spawn('npx', ['vite', gameRel, '--port', String(port), '--strictPort'], { cwd: repoRoot, stdio: 'ignore', detached: true })
  servers.push(vite)
  const base = `http://localhost:${port}/`
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(base)).ok) return base
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`vite did not start for ${repoRoot}`)
}

const { chromium } = await import(path.join(root, '.github/pushplay/node_modules/playwright-core/index.mjs'))
const exe = ['/opt/pw-browsers/chromium'].find(existsSync)
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
})

// The virtual clock, injected before any game code runs. Until __cmp.manual(true) it follows the real
// display, one 1/60 s step per real frame; after that frames only advance through __cmp.step(n).
function virtualClock() {
  const realRaf = window.requestAnimationFrame.bind(window)
  let vt = performance.now()
  let frames = 0
  let manual = false
  let nextId = 1
  let queue = new Map()
  window.requestAnimationFrame = (cb) => {
    const id = nextId++
    queue.set(id, cb)
    return id
  }
  window.cancelAnimationFrame = (id) => queue.delete(id)
  performance.now = () => vt
  const step = () => {
    vt += 1000 / 60
    frames++
    const due = queue
    queue = new Map()
    for (const cb of due.values()) {
      try {
        cb(vt)
      } catch (e) {
        setTimeout(() => {
          throw e
        })
      }
    }
  }
  const pump = () => {
    if (!manual) step()
    realRaf(pump)
  }
  realRaf(pump)
  window.__cmp = {
    frames: () => frames,
    // Taking over also moves the clock to the same base in every page, so both builds see bit-identical
    // frame times from here on (a page's load time would otherwise change how 1/60 s rounds). The jump is
    // one long frame on the title screen, which the game's dt clamp absorbs.
    manual: (on) => {
      manual = on
      if (on && vt < 1e7) vt = 1e7
    },
    step: (n) => {
      const t0 = Date.now()
      for (let i = 0; i < n; i++) step()
      return Date.now() - t0
    }
  }
}

// Plays one build and captures it.
async function run(label, repoRoot) {
  const base = await serve(repoRoot)
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: scale })
  await ctx.addInitScript(virtualClock)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text().slice(0, 200)))
  await page.goto(base + query)
  await page.waitForFunction(() => window.__game?.state?.screen, null, { timeout: 60000 })
  const hasStart = await page.evaluate(() => typeof window.__game.start === 'function')

  // Take over the clock first, then leave the title: __game.start() if the game has it, otherwise Enter
  // (up to a few times for a menu), stepping one frame at a time. Frame 0 of play is the first frame on
  // 'playing' in both builds, wherever the title happened to be.
  await page.evaluate(() => {
    window.__cmp.manual(true)
    window.__cmp.step(2)
  })
  const untilPlaying = () =>
    page.evaluate(() => {
      for (let k = 0; k < 30 && window.__game.state.screen !== 'playing'; k++) window.__cmp.step(1)
      return window.__game.state.screen
    })
  let screen = await page.evaluate(() => window.__game.state.screen)
  for (let i = 0; i < 6 && screen !== 'playing'; i++) {
    if (i === 0 && hasStart) await page.evaluate(() => window.__game.start())
    else await page.keyboard.press('Enter')
    screen = await untilPlaying()
  }
  const started = screen === 'playing'
  if (!started) errors.push(`never reached state.screen 'playing' (stuck on '${screen}')`)

  const snapshot = () =>
    page.evaluate(() => {
      const s = window.__game.state
      const out = { screen: s.screen }
      for (const [k, v] of Object.entries(s)) if (typeof v === 'number' && Object.keys(out).length < 12) out[k] = Math.round(v * 100) / 100
      return out
    })

  // One timeline in frames of play: clip frames every 60/fps frames (with --video) and the stills.
  const framesDir = path.join(outDir, `.frames-${label}`)
  const lastFrame = Math.round(times.at(-1) * 60)
  const marks = new Map()
  for (const t of times) marks.set(Math.round(t * 60), { still: t })
  if (ffmpeg) {
    mkdirSync(framesDir, { recursive: true })
    const every = 60 / clipFps
    for (let f = 0, k = 0; f <= lastFrame; f += every, k++) marks.set(f, { ...marks.get(f), clip: k })
  }
  const shots = []
  let at = 0
  let stepMs = 0
  for (const f of [...marks.keys()].sort((a, b) => a - b)) {
    if (f > at) stepMs += await page.evaluate((n) => window.__cmp.step(n), f - at)
    at = f
    const m = marks.get(f)
    if (m.clip !== undefined) await page.screenshot({ path: path.join(framesDir, `${String(m.clip).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 85 })
    if (m.still !== undefined) {
      const file = path.join(outDir, `${label}-${m.still}.png`)
      await page.screenshot({ path: file })
      const state = await snapshot()
      shots.push({ t: m.still, file, state })
      console.log(`${label} t=${m.still}s`, JSON.stringify(state))
    }
  }
  await ctx.close()
  const msPerFrame = Math.round((stepMs / Math.max(1, lastFrame)) * 10) / 10
  return { label, started, shots, msPerFrame, errors, framesDir: ffmpeg ? framesDir : null }
}

let results
try {
  const jobs = [run(flags.solo ? 'now' : 'after', root)]
  if (beforeRoot) jobs.unshift(run('before', beforeRoot))
  results = await Promise.all(jobs)

  // --- the labelled grid ------------------------------------------------------------------------
  const cols = results.map((r) => r.label)
  const cellW = results.length === 1 ? 640 : 560
  const cellH = Math.round((cellW * vh) / vw)
  const img = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`
  const rows = times.map((t, i) => `<div class="t">${t}s</div>${results.map((r) => `<img src="${img(r.shots[i].file)}">`).join('')}`).join('')
  const html = `<!doctype html><html><head><style>
    body{margin:0;background:#14161c;font:600 18px system-ui,sans-serif;color:#e8eaf0}
    .g{display:grid;grid-template-columns:56px repeat(${cols.length},${cellW}px);gap:10px;padding:16px;align-items:center}
    .h{font-size:15px;letter-spacing:.18em;text-transform:uppercase;padding:6px 12px;border-radius:999px;justify-self:start}
    .before,.now{background:#3a3f4b}.after{background:#f2c230;color:#1c1d22}
    .t{color:#9aa0ad;text-align:right}
    img{width:${cellW}px;height:${cellH}px;border-radius:10px;display:block}
  </style></head><body><div class="g"><div></div>${cols.map((c) => `<div class="h ${c}">${c}</div>`).join('')}${rows}</div></body></html>`
  const page = await browser.newPage({ viewport: { width: 72 + cols.length * (cellW + 10) + 32, height: 400 } })
  await page.setContent(html)
  await page.waitForFunction(() => [...document.images].every((i) => i.complete))
  const grid = path.join(outDir, 'compare.png')
  await page.screenshot({ path: grid, fullPage: true })
  await page.close()
  console.log('wrote', grid)

  // --- the clip ----------------------------------------------------------------------------------
  if (ffmpeg) {
    const clip = path.join(outDir, results.length === 2 ? 'side-by-side.mp4' : 'clip.mp4')
    const w = Math.min(960, vw * scale) & ~1
    const inputs = results.flatMap((r) => ['-framerate', String(clipFps), '-i', path.join(r.framesDir, '%05d.jpg')])
    const filter = results.length === 2 ? `[0:v]scale=${w}:-2[l];[1:v]scale=${w}:-2[r];[l][r]hstack=inputs=2` : `[0:v]scale=${w}:-2`
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', clip])
    for (const r of results) rmSync(r.framesDir, { recursive: true, force: true })
    console.log('wrote', clip)
  }

  // --- report ---------------------------------------------------------------------------------------
  let diverged = []
  if (results.length === 2) {
    const [b, a] = results
    const same = (x, y) => Object.keys(x).every((k) => !(k in y) || k === 'shake' || x[k] === y[k])
    diverged = times.filter((t, i) => !same(b.shots[i].state, a.shots[i].state))
  }
  const report = { id, seed, times, size: `${vw}x${vh}`, scale, diverged, results: results.map(({ framesDir, ...r }) => r) }
  writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
  for (const r of results) {
    if (r.errors.length) console.warn(`! ${r.label}: ${r.errors.length} page error(s), first: ${r.errors[0]}`)
    console.log(`${r.label}: ~${r.msPerFrame} ms of script per frame (headless; GPU time not included: compare the two builds, not with the Deck)`)
  }
  if (diverged.length)
    console.warn(
      `! the runs differ in state at ${diverged.join(', ')}s. Expected if the pass changed the rules or timing (hit-stop); otherwise something in play isn't seeded (Math.random, Date.now) or the autopilot reads input.`
    )
} finally {
  await browser.close()
  for (const s of servers) {
    try {
      process.kill(-s.pid)
    } catch {}
  }
  for (const c of cleanup) c()
}
