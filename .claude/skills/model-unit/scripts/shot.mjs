// Render pages of a game to PNG with headless Chromium (WebGL via SwiftShader), for comparing
// models against their reference. Starts Vite for the game, takes every shot, then stops it.
//
//   node .claude/skills/model-unit/scripts/shot.mjs <game-id> <outDir> "<page?query>|<name>.png" ...
//   e.g. node .claude/skills/model-unit/scripts/shot.mjs my-game /tmp/shots "viewer.html?unit=orc.grunt|grunt.png"
//
// The page must set document.title = 'ready' once it has rendered.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const [id, outDir, ...shots] = process.argv.slice(2)
if (!id || !outDir || !shots.length) {
  console.error('usage: shot.mjs <game-id> <outDir> "<page?query>|<name>.png" ...')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })
const { chromium } = await import(path.join(root, '.github/pushplay/node_modules/playwright-core/index.mjs'))
const port = 5300 + Math.floor(Math.random() * 400)
const vite = spawn('npx', ['vite', `games/${id}`, '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
const base = `http://localhost:${port}/`
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(base)).ok) break
  } catch {}
  await new Promise((r) => setTimeout(r, 500))
}
const exe = ['/opt/pw-browsers/chromium'].find(existsSync)
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
let failed = null
page.on('pageerror', (e) => {
  console.log('pageerror:', e.message)
  failed ??= e.message
})
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && console.log('console:', m.text().slice(0, 200)))
try {
  for (const shot of shots) {
    const [url, name] = shot.split('|')
    await page.goto(base + url)
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
    const file = path.join(outDir, name)
    await page.screenshot({ path: file })
    console.log('wrote', file)
  }
} finally {
  await browser.close()
  vite.kill()
}
