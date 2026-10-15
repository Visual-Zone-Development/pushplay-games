import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { chromium } from 'playwright'
import { ART, ART_FONTS, CHECK_RUN_MS, MANIFEST_FILE, VIEWPORT } from './config.mjs'
import { distDir, gamesRoot, GameError, outDir, presetFor, readManifest, ROOT, validateManifest } from './lib.mjs'
import { serve } from './server.mjs'

/** Generated art lives here inside each build, away from the game's own asset folders. */
export const ART_DIR = '__art'
const FONTSOURCE = join(ROOT, 'node_modules/@fontsource')
const SKIP = new Set(['node_modules', 'dist', '.git', '.vite', MANIFEST_FILE, 'package.json', 'package-lock.json'])

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
export async function buildGame(id, browser, { pack = true } = {}) {
  const manifest = readManifest(id)
  const { errors, warnings } = validateManifest(id, manifest)
  if (errors.length) throw new GameError(id, errors.join('\n'))

  const gameDir = join(gamesRoot, id)
  const out = outDir(id)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })

  // 1. Build
  let webEntry
  if (presetFor(id, manifest) === 'vite') {
    const result = spawnSync('npm', ['run', 'build', '--workspace', `games/${id}`], { cwd: ROOT, encoding: 'utf8' })
    if (result.status !== 0) {
      const output = `${result.stdout}\n${result.stderr}`.trim().split('\n').slice(-25).join('\n')
      throw new GameError(id, `npm run build failed in games/${id}:\n${output}`)
    }
    const built = join(gameDir, manifest.build?.output ?? 'dist')
    if (!existsSync(join(built, 'index.html'))) throw new GameError(id, `the build didn't produce ${basename(built)}/index.html`)
    cpSync(built, out, { recursive: true })
    webEntry = 'index.html'
  } else {
    cpSync(gameDir, out, {
      recursive: true,
      filter: (src) => src === gameDir || !(SKIP.has(basename(src)) || basename(src).startsWith('.'))
    })
    webEntry = manifest.entry.web
  }

  // 2. Play it headlessly, 3. render art
  mkdirSync(join(out, ART_DIR), { recursive: true })
  const server = await serve({ '/': out, '/__src/': gameDir, '/__fonts/': FONTSOURCE })
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

/** Load the game like the Deck would, and watch for crashes, missing files and internet use. */
async function playCheck(browser, server, out, entry, manifest) {
  const errors = []
  const warnings = []
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  const page = await context.newPage()

  // A connected standard gamepad, so games take their controller code path. A is tapped once
  // (most games start on A), then the left stick nudges right for a moment.
  await page.addInitScript(() => {
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
        const style = doc.namespaceURI === 'http://www.w3.org/2000/svg'
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
  const title = escapeHtml(name)
  const font = fontFaces(base)
  const cover = kind === 'cover'
  return `<style>${font}
    html,body{margin:0;width:${size.width}px;height:${size.height}px;overflow:hidden;background:#0d0f14}
    img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.1)}
    .shade{position:absolute;inset:0;background:linear-gradient(to top,rgba(13,15,20,.92),rgba(13,15,20,.15) 65%)}
    h1{position:absolute;left:36px;right:36px;bottom:84px;margin:0;color:#fff;
      font:700 64px/1 'Chakra Petch',sans-serif;text-shadow:0 2px 12px rgba(0,0,0,.5)}
  </style><img src="${base}/${ART_DIR}/screenshot.png"><div class="shade"></div>${cover ? `<h1>${title}</h1>` : ''}`
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
