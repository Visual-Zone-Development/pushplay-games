import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { chromium } from 'playwright'
import { ART, ART_FONTS, CHECK_RUN_MS, MANIFEST_FILE, RUNTIME_FILES, RUNTIME_HEADER_RE, VIEWPORT, VIEWPORT_DENSE } from './config.mjs'
import { buildMode, display, distDir, GameError, ignored, ignorePatterns, npmSpawn, outDir, quote, readManifest, ROOT, validateManifest } from './repo.mjs'
import { serve } from './server.mjs'

/** Generated art lives here inside each build, away from the game's own asset folders. */
export const ART_DIR = '__art'
/** Folder holding the @fontsource packages, wherever npm put them. */
const FONTSOURCE = dirname(dirname(createRequire(import.meta.url).resolve('@fontsource/rubik/package.json')))
/** Never shipped: tooling, dependencies, VCS, and the kit itself (dot-folders are skipped too). */
const SKIP = new Set(['node_modules', 'dist', 'package.json', 'package-lock.json', 'README.md', 'LICENSE', MANIFEST_FILE])

export function launchBrowser() {
  // SwiftShader gives headless Chromium software WebGL, so three.js/WebGL games can be checked in CI.
  return chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  })
}

/**
 * Build one game end to end: validate → build → headless play check → art → package.
 * Throws GameError listing every problem if the game isn't shippable.
 */
export async function buildGame(game, browser, { pack = true } = {}) {
  const { id } = game
  const manifest = readManifest(game)
  const { errors, warnings } = validateManifest(game, manifest)
  if (errors.length) throw new GameError(id, errors.join('\n'))

  const out = outDir(id)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })

  // 1. Build
  let webEntry
  if (buildMode(game, manifest) === 'npm') {
    runBuild(game)
    const built = join(game.dir, manifest.build?.output ?? 'dist')
    if (!existsSync(join(built, 'index.html'))) throw new GameError(id, `the build didn't produce ${display(built)}/index.html`)
    cpSync(built, out, { recursive: true })
    webEntry = 'index.html'
  } else {
    copyGameFiles(game.dir, out, ignorePatterns(game))
    webEntry = manifest.entry.web
  }
  const source = sourceChecks(game, manifest)
  warnings.push(...source.warnings)
  if (source.errors.length) throw new GameError(id, source.errors.join('\n'))

  // 2. Play it headlessly, 3. render art
  mkdirSync(join(out, ART_DIR), { recursive: true })
  const server = await serve({ '/': out, '/__src/': game.dir, '/__fonts/': FONTSOURCE })
  try {
    const play = await playCheck(browser, server, out, webEntry, manifest)
    warnings.push(...play.warnings)
    if (play.errors.length) throw new GameError(id, play.errors.join('\n'))
    for (const kind of ['cover', 'hero']) await renderArt(browser, server, manifest, kind, join(out, ART_DIR, `${kind}.png`))
  } finally {
    await server.close()
  }

  // 4. The manifest the launcher sees: built entry and generated art.
  const { $schema: _schema, build: _build, ...rest } = manifest
  const shipped = {
    ...rest,
    entry: { web: webEntry },
    art: { cover: `${ART_DIR}/cover.png`, hero: `${ART_DIR}/hero.png`, screenshots: [`${ART_DIR}/screenshot.png`] }
  }
  writeFileSync(join(out, MANIFEST_FILE), JSON.stringify(shipped, null, 2) + '\n')

  return { id, manifest: shipped, out, files: pack ? packageGame(id, out) : {}, warnings }
}

/**
 * Copy a game without a build step. Hand-rolled because in a single-game repo the output folder
 * sits inside the game folder (under the hidden kit dir), which cpSync refuses even with a filter.
 */
function copyGameFiles(from, to, patterns = [], rel = '') {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue
    const path = rel ? `${rel}/${entry.name}` : entry.name
    if (ignored(path, patterns, entry.isDirectory())) continue
    const src = join(from, entry.name)
    if (entry.isDirectory()) copyGameFiles(src, join(to, entry.name), patterns, path)
    else if (entry.isFile()) copyFileSync(src, join(to, entry.name))
  }
}

/** Source files of a game (its own code, not the runtime modules, dependencies or build output). */
function sourceFiles(dir, out = [], rel = '') {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build', 'out', 'vendor', 'lib', 'libs'].includes(entry.name)) continue
    const path = rel ? `${rel}/${entry.name}` : entry.name
    const full = join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out, path)
    else if (/\.(m?js|ts|html)$/.test(entry.name)) {
      const text = readFileSync(full, 'utf8')
      if (RUNTIME_FILES.includes(entry.name) && RUNTIME_HEADER_RE.test(text)) continue
      out.push({ path, text })
    }
  }
  return out
}

/**
 * Static checks on the game's own code: the conventions that make a game playable on every
 * device (menu.js for menus, input.attach for mouse/touch, no F10, saves keyed by the game id).
 */
function sourceChecks(game, manifest) {
  const errors = []
  const warnings = []
  const files = sourceFiles(game.dir)
  const code = files.filter((f) => !f.path.endsWith('.html'))
  const all = files.map((f) => f.text).join('\n')
  const usesInput = /from\s+['"][^'"]*\/input\.js['"]/.test(all)
  if (!/from\s+['"][^'"]*\/menu\.js['"]/.test(all) && !/createMenu\(/.test(all)) {
    warnings.push('nothing imports menu.js: every menu (title, pause, settings, game over) must work with a controller, a keyboard, a mouse and touch, which createMenu does for you')
  }
  if (usesInput && !/input\.attach\(/.test(all)) warnings.push('input.js is imported but input.attach(canvas) is never called, so mouse and touch never reach the game')
  if (!/window\.__game\s*=/.test(all)) {
    warnings.push("set window.__game = { state, TUNING } with state.screen ('title' | 'playing' | 'paused' | 'settings' | 'gameover'), so the check can verify pausing and the debug overlay can read it")
  }
  for (const file of code) {
    if (/['"`]F10['"`]/.test(file.text)) errors.push(`${file.path} binds F10, which the launcher uses to open its own menu. Pause on input.pressed('menu') instead`)
    for (const m of file.text.matchAll(/localStorage\.(?:setItem|getItem|removeItem)\(\s*['"`]([^'"`$]+)['"`]/g)) {
      if (!m[1].startsWith(game.id)) warnings.push(`${file.path} uses the localStorage key "${m[1]}", which other games on the same device can clash with: use createSave('${game.id}', 1, { ... }) from save.js (keys become ${game.id}-save-v1)`)
    }
    for (const m of file.text.matchAll(/create(?:Save|Settings)\(\s*['"`]([^'"`$]+)['"`]/g)) {
      if (m[1] !== game.id) warnings.push(`${file.path} calls createSave/createSettings with "${m[1]}"; use the game id "${game.id}" so saves don't clash`)
    }
    if (/new\s+(?:window\.)?(?:webkit)?AudioContext\b/.test(file.text) && !/\.resume\(/.test(all)) {
      warnings.push(`${file.path} creates an AudioContext but nothing calls resume(): outside the launcher, browsers keep audio silent until the first key, tap or click. createAudio() from audio.js handles it`)
    }
  }
  if (manifest.inputs && !manifest.inputs.includes('gamepad')) warnings.push('"inputs" leaves out "gamepad": every kit game should play with a controller')
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

/**
 * Run the game's npm "build" script. Games inside a workspace-enabled repo (the template) build
 * through the workspace; anything else installs its own dependencies first if needed.
 */
function runBuild(game) {
  const run = (args, cwd) => spawnSync('npm', quote(args), { ...npmSpawn, cwd, encoding: 'utf8', env: { ...process.env, CI: 'true' } })
  let result
  const rootPkg = existsSync(join(ROOT, 'package.json')) ? JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) : null
  if (game.rel && rootPkg?.workspaces) {
    result = run(['run', 'build', '--workspace', game.rel], ROOT)
  } else {
    if (!existsSync(join(game.dir, 'node_modules'))) {
      const install = existsSync(join(game.dir, 'package-lock.json')) ? ['ci', '--no-audit', '--no-fund'] : ['install', '--no-audit', '--no-fund']
      const installed = run(install, game.dir)
      if (installed.status !== 0) throw new GameError(game.id, `npm ${install[0]} failed:\n${tail(installed)}`)
    }
    result = run(['run', 'build'], game.dir)
  }
  if (result.status !== 0) throw new GameError(game.id, `npm run build failed in ${display(game.dir)}:\n${tail(result)}`)
}

const tail = (result) => `${result.stdout}\n${result.stderr}`.trim().split('\n').slice(-25).join('\n')

/**
 * Load the game like the launcher would and watch for crashes, missing files and internet use,
 * then make sure it can be played and paused with a controller, a keyboard and touch, and that
 * it fits a denser screen. Games exposing window.__game.state.screen get the strict version.
 */
async function playCheck(browser, server, out, entry, manifest) {
  const errors = []
  const warnings = []
  const url = `${server.url}/${entry}`
  const offline = async (context) => {
    await context.route('**/*', (route) => {
      const target = route.request().url()
      if (target.startsWith(server.url) || target.startsWith('data:') || target.startsWith('blob:') || manifest.online) return route.continue()
      errors.push(`the game loads ${target} from the internet. Games must work offline: bundle it into the game folder (or set "online": true for multiplayer games)`)
      return route.abort()
    })
    await context.routeWebSocket(() => true, (ws) => {
      const target = ws.url()
      if (manifest.online || target.startsWith(server.url.replace('http', 'ws'))) return ws.connectToServer()
      errors.push(`the game opens a WebSocket to ${target}. Games must work offline (or set "online": true for multiplayer games)`)
      ws.close()
    })
  }
  const watch = (page) => {
    page.on('pageerror', (err) => errors.push(`the game crashed: ${err.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') warnings.push(`console error: ${msg.text().slice(0, 200)}`)
    })
    page.on('dialog', (dialog) => {
      errors.push(`the game opened a ${dialog.type()}() dialog, which blocks controller input; draw UI in the game instead`)
      void dialog.dismiss()
    })
  }
  const open = async (page, label) => {
    await page.goto(url, { waitUntil: 'load', timeout: 20_000 }).catch((err) => errors.push(`the game didn't load${label}: ${err.message}`))
  }
  const screen = (page) => page.evaluate(() => (window.__game?.state?.screen === undefined ? null : String(window.__game.state.screen)))

  // --- Pass 1: controller. A once (most games start on A), the stick nudges right, then Start must pause.
  {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    await offline(context)
    const page = await context.newPage()
    await page.addInitScript(() => {
      const started = performance.now()
      const check = (window.__kitCheck = { start: false, audio: [] })
      const button = (pressed) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 })
      const pad = () => {
        const t = performance.now() - started
        return {
          id: 'Headless check gamepad (STANDARD GAMEPAD)',
          index: 0,
          connected: true,
          mapping: 'standard',
          timestamp: t,
          axes: [t > 1500 && t < 2200 ? 0.8 : 0, 0, 0, 0],
          buttons: Array.from({ length: 17 }, (_, i) => button((i === 0 && t > 1200 && t < 1400) || (i === 9 && check.start))),
          vibrationActuator: null
        }
      }
      Object.defineProperty(Navigator.prototype, 'getGamepads', { value: () => [pad(), null, null, null] })
      window.addEventListener('load', () => {
        setTimeout(() => window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad() })), 100)
      })
      for (const name of ['AudioContext', 'webkitAudioContext']) {
        const Original = window[name]
        if (!Original) continue
        window[name] = class extends Original {
          constructor(...args) {
            super(...args)
            check.audio.push(this)
          }
        }
      }
    })
    watch(page)
    await open(page, '')
    await page.waitForTimeout(CHECK_RUN_MS)
    for (const path of server.missing) if (!path.startsWith('/__')) errors.push(`missing file: ${path} (404)`)

    const shot = await page.screenshot({ type: 'png' })
    writeFileSync(join(out, ART_DIR, 'screenshot.png'), shot)
    if (await looksBlank(page, shot)) {
      errors.push(`after ${CHECK_RUN_MS / 1000}s the screen is one flat color. The game should draw something right away (a title screen counts)`)
    }

    const before = await screen(page)
    if (before === null) {
      warnings.push("window.__game.state.screen is missing, so the check can't verify that Start / Esc pause the game. Expose it: window.__game = { state, TUNING }")
    } else if (before !== 'playing') {
      errors.push(`pressing A on the title didn't start the game: after ${CHECK_RUN_MS / 1000}s state.screen is "${before}", not "playing". The title menu's first item must start play`)
    } else {
      await page.evaluate(() => (window.__kitCheck.start = true))
      await page.waitForTimeout(150)
      await page.evaluate(() => (window.__kitCheck.start = false))
      await page.waitForTimeout(400)
      const after = await screen(page)
      if (after !== 'paused') errors.push(`pressing Start during play didn't pause: state.screen is "${after}", not "paused". Open the pause menu on input.pressed('menu')`)
    }
    const audio = await page.evaluate(() => {
      const list = window.__kitCheck?.audio ?? []
      return { created: list.length, running: list.some((c) => c.state === 'running') }
    })
    if (audio.created && !audio.running) warnings.push('an AudioContext was created but never started running after input: resume it on the first key, tap or button press (createAudio from audio.js does this)')
    await context.close()
  }

  // --- Pass 2: keyboard only, no controller. Enter starts, Escape must pause.
  {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    await offline(context)
    const page = await context.newPage()
    watch(page)
    await open(page, ' (keyboard pass)')
    await page.waitForTimeout(1000)
    const before = await page.screenshot({ type: 'png' })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const state = await screen(page)
    if (state !== null) {
      if (state !== 'paused') errors.push(`with only a keyboard, Enter then Escape didn't pause the game: state.screen is "${state}", not "paused". Enter chooses (a), Escape opens the pause menu (menu)`)
    } else if (before.equals(await page.screenshot({ type: 'png' }))) {
      warnings.push('with only a keyboard, pressing Enter then Escape changed nothing on screen. Menus must work with Enter / arrows and Escape must pause')
    }
    await context.close()
  }

  // --- Pass 3: touch only. Tapping the first title menu item should leave the title.
  {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, hasTouch: true })
    await offline(context)
    const page = await context.newPage()
    watch(page)
    await open(page, ' (touch pass)')
    await page.waitForTimeout(1000)
    const before = await page.screenshot({ type: 'png' })
    const state = await screen(page)
    const spot = await page.evaluate(() => {
      // The title menu's first item if the game exposes it (window.__game.titleMenu, a createMenu),
      // else where the default menu puts it (640,452 in a 1280×800 space); in CSS pixels.
      const menu = window.__game?.titleMenu
      const first = typeof menu?.rect === 'function' ? menu.rect(0) : { x: 430, y: 420, w: 420, h: 64 }
      const gx = first.x + first.w / 2
      const gy = first.y + first.h / 2
      const canvas = document.querySelector('canvas')
      const r = canvas?.getBoundingClientRect()
      return r && r.width ? { x: r.left + (gx / 1280) * r.width, y: r.top + (gy / 800) * r.height } : { x: gx, y: gy }
    })
    await page.touchscreen.tap(spot.x, spot.y)
    await page.waitForTimeout(500)
    const after = await screen(page)
    if (state !== null) {
      if (after === state) warnings.push(`with touch only, tapping the first title menu item (at ${Math.round(spot.x)},${Math.round(spot.y)}) changed nothing: state.screen is still "${after}". Menus must be tappable; expose the title menu as window.__game.titleMenu so the check knows where to tap`)
    } else if (before.equals(await page.screenshot({ type: 'png' }))) {
      warnings.push('with touch only, tapping the title menu changed nothing on screen. Menus must be tappable')
    }
    await context.close()
  }

  // --- Pass 4: a denser 16:9 screen (Legion Go class, launcher zoom). Not blank, canvas centred.
  {
    const { deviceScaleFactor, ...viewport } = VIEWPORT_DENSE
    const context = await browser.newContext({ viewport, deviceScaleFactor })
    await offline(context)
    const page = await context.newPage()
    watch(page)
    await open(page, ` (${viewport.width}×${viewport.height} @${deviceScaleFactor}x)`)
    await page.waitForTimeout(1500)
    const shot = await page.screenshot({ type: 'png' })
    if (await looksBlank(page, shot)) errors.push(`at ${viewport.width}×${viewport.height} with ${deviceScaleFactor}× pixels the screen is one flat color. Use fitCanvas from fit.js to size and centre the game`)
    const placement = await page.evaluate(() => {
      const canvases = [...document.querySelectorAll('canvas')].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0)
      if (!canvases.length) return null
      const r = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0]
      return { dx: r.left + r.width / 2 - innerWidth / 2, dy: r.top + r.height / 2 - innerHeight / 2, w: r.width, h: r.height }
    })
    if (placement && (Math.abs(placement.dx) > 2 || Math.abs(placement.dy) > 2)) {
      warnings.push(`at ${viewport.width}×${viewport.height} the canvas (${Math.round(placement.w)}×${Math.round(placement.h)}) isn't centred (off by ${Math.round(placement.dx)},${Math.round(placement.dy)}px). fitCanvas from fit.js letterboxes and centres it`)
    }
    await context.close()
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

/** True when the screen is a single flat color (nothing drawn, or a crash to black). */
async function looksBlank(page, png) {
  return page.evaluate(async (dataUrl) => {
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 100
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, 160, 100)
    const { data } = ctx.getImageData(0, 0, 160, 100)
    const counts = new Map()
    for (let i = 0; i < data.length; i += 4) {
      const key = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    // Ignore single stray samples (scaling noise); anything else drawn counts.
    return [...counts.values()].filter((n) => n >= 2).length <= 1
  }, `data:image/png;base64,${png.toString('base64')}`)
}

/** @font-face rules for ART_FONTS, served by the local server. */
function fontFaces(base) {
  return Object.entries(ART_FONTS)
    .flatMap(([family, [pkg, weights]]) =>
      weights.map(
        (w) => `@font-face{font-family:'${family}';font-weight:${w};src:url(${base}/__fonts/${pkg}/files/${pkg}-latin-${w}-normal.woff2) format('woff2')}`
      )
    )
    .join('\n')
}

/** Render the game's own art (svg/html/image) at the exact size, or generate it from the screenshot. */
async function renderArt(browser, server, manifest, kind, target) {
  const size = ART[kind]
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 })
  try {
    const source = manifest.art?.[kind]
    if (source && /\.(svg|html)$/i.test(source)) {
      // Open SVG/HTML as a document (not an <img>) so it can use the bundled fonts.
      await page.goto(`${server.url}/__src/${encodeURI(source)}`, { waitUntil: 'load' })
      await page.evaluate(async (css) => {
        const doc = document.documentElement
        const style =
          doc.namespaceURI === 'http://www.w3.org/2000/svg'
            ? document.createElementNS('http://www.w3.org/2000/svg', 'style')
            : document.createElement('style')
        style.textContent = css
        ;(document.head ?? doc).appendChild(style)
        await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})))
        await document.fonts.ready
      }, fontFaces(server.url))
    } else if (source) {
      await page.setContent(
        `<style>html,body{margin:0;background:#000}img{display:block;width:${size.width}px;height:${size.height}px;object-fit:cover}</style>` +
          `<img src="${server.url}/__src/${encodeURI(source)}">`
      )
      await page.locator('img').evaluate((img) => img.decode())
    } else {
      await page.setContent(fallbackArt(kind, manifest.name, server.url, size))
      await page.evaluate(() => document.fonts.ready)
      await page.locator('img').evaluate((img) => img.decode())
    }
    await page.waitForTimeout(150)
    await page.screenshot({ path: target, clip: { x: 0, y: 0, ...size } })
  } finally {
    await page.close()
  }
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** Screenshot + title. Used only when a game ships no art. */
function fallbackArt(kind, name, base, size) {
  const cover = kind === 'cover'
  return `<style>${fontFaces(base)}
    html,body{margin:0;width:${size.width}px;height:${size.height}px;overflow:hidden;background:#0d0f14}
    img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.1)}
    .shade{position:absolute;inset:0;background:linear-gradient(to top,rgba(13,15,20,.92),rgba(13,15,20,.15) 65%)}
    h1{position:absolute;left:36px;right:36px;bottom:120px;margin:0;color:#fff;
      font:700 64px/1 'Chakra Petch',sans-serif;text-shadow:0 2px 12px rgba(0,0,0,.5)}
  </style><img src="${base}/${ART_DIR}/screenshot.png"><div class="shade"></div>${cover ? `<h1>${escapeHtml(name)}</h1>` : ''}`
}

/** Zip the build and copy art next to it under release-asset names. */
function packageGame(id, out) {
  mkdirSync(distDir, { recursive: true })
  const zip = join(distDir, `${id}-web.zip`)
  rmSync(zip, { force: true })
  const result = spawnSync('zip', ['-qr', '-X', zip, '.'], { cwd: out, encoding: 'utf8' })
  if (result.status !== 0) throw new GameError(id, `zip failed: ${result.stderr}`)

  const files = { web: describeFile(zip) }
  for (const kind of ['cover', 'hero', 'screenshot']) {
    const dest = join(distDir, `${id}-${kind}.png`)
    copyFileSync(join(out, ART_DIR, `${kind}.png`), dest)
    files[kind] = describeFile(dest)
  }
  return files
}

function describeFile(path) {
  return {
    path,
    name: basename(path),
    size: statSync(path).size,
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex')
  }
}
