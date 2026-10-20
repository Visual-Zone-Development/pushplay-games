import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { chromium } from 'playwright'
import { ART, ART_FONTS, CHECK_RUN_MS, MANIFEST_FILE, NET_MEET_MS, NET_PLAY_MS, NET_WARN_BYTES_PER_SEC, VIEWPORT } from './config.mjs'
import { startLocalRelay } from './local-relay.mjs'
import { buildMode, display, distDir, GameError, npmSpawn, outDir, quote, readManifest, ROOT, validateManifest } from './repo.mjs'
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
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      // The online check runs two copies at once; neither may be throttled as a background window.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows'
    ]
  })
}

/**
 * Build one game end to end: validate → build → headless play check → art → package.
 * Throws GameError listing every problem if the game isn't shippable.
 * `beforePack(out, manifest)` runs on the finished build just before it's zipped; it may return warnings.
 */
export async function buildGame(game, browser, { pack = true, beforePack } = {}) {
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
    copyGameFiles(game.dir, out)
    webEntry = manifest.entry.web
  }

  // 2. Play it headlessly (online games against a local relay, then two copies together), 3. render art
  mkdirSync(join(out, ART_DIR), { recursive: true })
  const net = manifest.online ? netLibrary(game.dir) : null
  if (net) warnings.push(...net.warnings)
  const relay = net ? await startLocalRelay() : null
  const server = await serve({ '/': out, '/__src/': game.dir, '/__fonts/': FONTSOURCE }, relay ? { '/__net.json': JSON.stringify({ url: relay.url }) } : {})
  try {
    const play = await playCheck(browser, server, out, webEntry, manifest)
    if (relay && !play.errors.length) {
      const together = await netCheck(browser, server, webEntry, relay)
      play.errors.push(...together.errors)
      play.warnings.push(...together.warnings)
    }
    warnings.push(...play.warnings)
    if (play.errors.length) throw new GameError(id, play.errors.join('\n'))
    for (const kind of ['cover', 'hero']) await renderArt(browser, server, manifest, kind, join(out, ART_DIR, `${kind}.png`))
  } finally {
    await server.close()
    await relay?.close()
  }

  // 4. The manifest the launcher sees: built entry and generated art.
  const { $schema: _schema, build: _build, ...rest } = manifest
  const shipped = {
    ...rest,
    entry: { web: webEntry },
    art: { cover: `${ART_DIR}/cover.png`, hero: `${ART_DIR}/hero.png`, screenshots: [`${ART_DIR}/screenshot.png`] }
  }
  writeFileSync(join(out, MANIFEST_FILE), JSON.stringify(shipped, null, 2) + '\n')
  if (beforePack) warnings.push(...((await beforePack(out, shipped)) ?? []))

  return { id, manifest: shipped, out, files: pack ? packageGame(id, out) : {}, warnings }
}

/**
 * Copy a game without a build step. Hand-rolled because in a single-game repo the output folder
 * sits inside the game folder (under the hidden kit dir), which cpSync refuses even with a filter.
 */
function copyGameFiles(from, to) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue
    const src = join(from, entry.name)
    if (entry.isDirectory()) copyGameFiles(src, join(to, entry.name))
    else if (entry.isFile()) copyFileSync(src, join(to, entry.name))
  }
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
 * A connected standard gamepad, so games take their controller code path. A is tapped once
 * (most games start on A), then the left stick nudges right for a moment.
 */
function addVirtualGamepad(page) {
  return page.addInitScript(() => {
    const started = performance.now()
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
        buttons: Array.from({ length: 17 }, (_, i) => button(i === 0 && t > 1200 && t < 1400)),
        vibrationActuator: null
      }
    }
    Object.defineProperty(Navigator.prototype, 'getGamepads', { value: () => [pad(), null, null, null] })
    window.addEventListener('load', () => {
      setTimeout(() => window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad() })), 100)
    })
  })
}

/** Load the game like the Deck would, and watch for crashes, missing files and internet use. */
async function playCheck(browser, server, out, entry, manifest) {
  const errors = []
  const warnings = []
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await addVirtualGamepad(page)

  page.on('pageerror', (err) => errors.push(`the game crashed: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') warnings.push(`console error: ${msg.text().slice(0, 200)}`)
  })
  page.on('dialog', (dialog) => {
    errors.push(`the game opened a ${dialog.type()}() dialog, which blocks controller input; draw UI in the game instead`)
    void dialog.dismiss()
  })
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith(server.url) || url.startsWith('data:') || url.startsWith('blob:') || manifest.online) return route.continue()
    errors.push(`the game loads ${url} from the internet. Games must work offline: bundle it into the game folder (or set "online": true for multiplayer games)`)
    return route.abort()
  })

  await page
    .goto(`${server.url}/${entry}`, { waitUntil: 'load', timeout: 20_000 })
    .catch((err) => errors.push(`the game didn't load: ${err.message}`))
  await page.waitForTimeout(CHECK_RUN_MS)

  for (const path of server.missing) if (!path.startsWith('/__')) errors.push(`missing file: ${path} (404)`)

  const shot = await page.screenshot({ type: 'png' })
  writeFileSync(join(out, ART_DIR, 'screenshot.png'), shot)
  if (await looksBlank(page, shot)) {
    errors.push(`after ${CHECK_RUN_MS / 1000}s the screen is one flat color. The game should draw something right away (a title screen counts)`)
  }

  await context.close()
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

const NET_VERSION = /export const NET_VERSION = (\d+)/

/**
 * Online games that use the kit's net.js: find it and warn when the copy is older than the kit's.
 * Returns null for games that bring their own networking (they skip the two-copy check).
 */
function netLibrary(dir) {
  const find = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
      const full = join(d, entry.name)
      if (entry.isDirectory()) {
        const found = find(full)
        if (found) return found
      } else if (entry.name === 'net.js' && NET_VERSION.test(readFileSync(full, 'utf8'))) return full
    }
    return null
  }
  const file = find(dir)
  if (!file) return null
  const theirs = Number(readFileSync(file, 'utf8').match(NET_VERSION)[1])
  const ours = Number(readFileSync(join(import.meta.dirname, 'templates/online/net.js'), 'utf8').match(NET_VERSION)[1])
  return {
    warnings: theirs < ours ? [`${display(file)} is version ${theirs}; the kit has version ${ours}. Copy ${display(join(import.meta.dirname, 'templates/online'))}/net.js and lobby.js over it`] : []
  }
}

/**
 * Online games: two copies quick-match through the local relay, the host starts, and they play
 * for a moment. Checks that they met, that the second copy received the host's game state, and
 * how much the game sends.
 */
async function netCheck(browser, server, entry, relay) {
  const errors = []
  const warnings = []
  const contexts = []
  const status = (p) => p.evaluate(() => window.__kitNet && { status: window.__kitNet.status, error: window.__kitNet.error, room: window.__kitNet.room }).catch(() => null)
  // Each copy in its own window, as on two Decks.
  const open = async () => {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    contexts.push(context)
    await context.addInitScript(() => (window.__kitNetTest = true))
    const page = await context.newPage()
    page.on('pageerror', (err) => errors.push(`the game crashed during the two-player online check: ${err.message}`))
    await page.goto(`${server.url}/${entry}`, { waitUntil: 'load', timeout: 20_000 })
    return page
  }
  // Press A (Space) until the copy leaves the title; in the check, the lobby then quick-matches by itself.
  const enterRoom = async (page) => {
    const deadline = Date.now() + NET_MEET_MS
    while (Date.now() < deadline) {
      const s = await status(page)
      if (s?.room) return true
      if (!s || s.status === 'idle') {
        await page.keyboard.down('Space')
        await page.waitForTimeout(120)
        await page.keyboard.up('Space')
      }
      await page.waitForTimeout(400)
    }
    return false
  }
  const describe = (s) => (s ? `${s.status}${s.error ? `, "${s.error}"` : ''}` : 'no net')
  try {
    // The first copy opens a room before the second looks for one.
    const host = await open()
    await enterRoom(host)
    const guest = await open()
    await enterRoom(guest)
    const playing = () => window.__kitNet?.status === 'playing' && window.__kitNet.players.length >= 2
    const met = await Promise.all([host, guest].map((p) => p.waitForFunction(playing, null, { timeout: NET_MEET_MS }).then(() => true, () => false)))
    if (!met.every(Boolean)) {
      const s = await Promise.all([host, guest].map(status))
      if (s.some((x) => !x)) errors.push('this online game never created its net (createNet from net.js), so two copies could not meet')
      else
        errors.push(
          `two copies of the game didn't get into a match together within ${NET_MEET_MS / 1000}s (first: ${describe(s[0])}; second: ${describe(s[1])}). ` +
            `Keep the flow from the online template: title (A starts) → lobby (lobby.update) → play when it returns "start"`
        )
      return { errors, warnings }
    }
    const before = relay.stats.bytes
    await guest.waitForTimeout(NET_PLAY_MS)
    const perSecond = Math.round(((relay.stats.bytes - before) / NET_PLAY_MS) * 1000)
    const received = await guest.evaluate(() => JSON.stringify(window.__kitNet.state) !== '{}')
    if (!received) errors.push("the second player never received any game state. On the host, write what players need to see into net.state (net.js sends the changes)")
    if (perSecond > NET_WARN_BYTES_PER_SEC) {
      warnings.push(`two players used about ${Math.round(perSecond / 1024)} KB/s through the relay; aim for under ${NET_WARN_BYTES_PER_SEC / 1024} KB/s. Keep net.state to what players must see, and key things by id instead of array position`)
    }
  } catch (err) {
    errors.push(`the two-player online check failed: ${err.message}`)
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
  return { errors, warnings }
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
