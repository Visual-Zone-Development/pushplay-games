# Debugging

Reproduce first, then fix the root cause. `npm run check <id>` is the first tool. It reports crashes, console errors, 404s, network requests, dialogs and blank screens, and saves a screenshot. But it only plays for **3 seconds**: it taps A once around 1.2s and nudges the stick right around 1.5–2.2s. For anything deeper, write a repro script (below).

## Common failures

| Symptom | Likely cause | Fix |
|---|---|---|
| Controller does nothing | `input.update()` not called each frame, or called after reading input | Call `input.update()` once at the top of the frame, before `update()` |
| A press triggers twice, or skips a screen | `held()` used where `pressed()` was meant; or two screens both read the same press in one frame | Use `pressed()` for one-shot actions; `return` after changing screens |
| Black or blank screen | Exception in the first frame; drawing before the canvas is sized; waiting on assets or fonts before drawing anything | Look for "the game crashed" in the check; draw a loading screen immediately |
| Blurry or offset image | Canvas backing size ≠ CSS size × `devicePixelRatio`; smoothing on pixel art | Reuse the starter's `resize()`; `ctx.imageSmoothingEnabled = false` for pixel art |
| No sound | `AudioContext` suspended | `audioCtx.resume()` on the first input (and on load; the Deck allows autoplay) |
| Game runs fast or slow on some screens | Movement per frame instead of per second | Multiply by `dt`; clamp `dt = Math.min(1/20, …)` |
| Stutters, frame drops | Unbounded particles or entities; allocations in the frame loop; heavy `shadowBlur`; too many draw calls in three.js | Cap arrays; reuse objects; pre-render glows; see [3d.md](3d.md) budgets |
| Old save breaks after an update | Save shape changed | Version the key (`<id>-save-v2`), migrate or fall back to defaults; wrap `JSON.parse` in try/catch |
| Check: "loads … from the internet" | CDN script, Google Font, remote image | Bundle the file in the game folder ([assets.md](assets.md)) |
| Check: "missing file … (404)" | Wrong relative path or filename case | Paths are case-sensitive on Linux; use paths relative to `index.html` |
| Check: dialog error | `alert()` / `confirm()` / `prompt()` | Draw the message in-game |
| Text unreadable on the Deck | Under 24px, low contrast, at the screen edge | ≥ 24px, strong contrast, ≥ 32px from the edges |

## Debug overlay convention

Every game should have a debug overlay that's **off by default**:

- Enabled by the `?debug` URL parameter (`new URLSearchParams(location.search).has('debug')`), or toggled in-game by **holding Select + Y** for a second. Never use Start + Select: the launcher reserves it.
- Shows FPS and frame time (ms), entity and particle counts, the current screen/state, and raw input (`input.x`, `input.y`, held buttons).
- Drawn last, top-left inside the 32px safe margin, in small monospace text. This is the one place where text under 24px is fine.

## Test hooks

Expose state for scripts and the console:

```js
const params = new URLSearchParams(location.search)
const seed = Number(params.get('seed')) || Date.now()   // seeded RNG → reproducible runs
window.__game = {
  state,                  // the live state object
  TUNING,                 // tweak live: __game.TUNING.enemySpeed = 300
  start: () => reset(),   // skip the title screen
  jumpTo: (level) => { /* load a specific level/wave */ },
}
```

With a seeded RNG (e.g. mulberry32) instead of `Math.random()`, `?seed=123` replays the same layout every time. That makes bugs reproducible.

## Repro script

When the bug happens after the first 3 seconds, or needs specific inputs, write a scratch script outside the game folder (e.g. in your scratch or temp directory). It uses the build kit's Playwright and a virtual gamepad driven by a timeline:

```js
// repro.mjs: node repro.mjs <repo-root> <game-id>
import { spawn } from 'node:child_process'
import { join } from 'node:path'
const [root, id] = process.argv.slice(2)
const { chromium } = await import(join(root, '.github/pushplay/node_modules/playwright/index.mjs'))

// 1. Serve the game (vite dev server, works for plain and --vite games)
const dev = spawn('npm', ['run', 'dev', id], { cwd: root, stdio: 'ignore', detached: true })
await new Promise((r) => setTimeout(r, 2500))

// 2. Input timeline: [startMs, endMs, { buttons: [indices], axes: [lx, ly, rx, ry] }]
//    Standard mapping: 0=A 1=B 2=X 3=Y 4=LB 5=RB 6=LT 7=RT 8=Select 9=Start 12=Up 13=Down 14=Left 15=Right
const timeline = [
  [500, 600, { buttons: [0] }],          // A: start game
  [1000, 4000, { axes: [1, 0, 0, 0] }],  // hold right
  [4200, 4300, { buttons: [0] }],        // A: action
]

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.addInitScript((timeline) => {
  const t0 = performance.now()
  const pad = () => {
    const t = performance.now() - t0
    const active = timeline.filter(([a, b]) => t >= a && t < b).map(([, , s]) => s)
    const buttons = new Set(active.flatMap((s) => s.buttons ?? []))
    const axes = active.find((s) => s.axes)?.axes ?? [0, 0, 0, 0]
    return {
      id: 'Repro pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: t, axes,
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.has(i), touched: buttons.has(i), value: buttons.has(i) ? 1 : 0 })),
      vibrationActuator: null,
    }
  }
  Object.defineProperty(Navigator.prototype, 'getGamepads', { value: () => [pad(), null, null, null] })
}, timeline)
page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => console.log(`[CRASH] ${e.message}`))

await page.goto('http://localhost:5173/?debug&seed=1')
let elapsed = 0
for (const ms of [1000, 3000, 5000, 8000]) {
  await page.waitForTimeout(ms - elapsed)
  elapsed = ms
  await page.screenshot({ path: `shot-${ms}.png` })
  console.log(ms, JSON.stringify(await page.evaluate(() => window.__game?.state?.screen)))
}
await browser.close()
process.kill(-dev.pid) // stop npm and the vite server it started
```

Run it, read the console output, and **look at the screenshots**. Use `page.evaluate(() => window.__game...)` to read or set state directly (e.g. jump to wave 10).

If the Chromium download isn't available in your environment, fall back to reading code carefully, adding `console.error` traces, and running `npm run check`.

## Performance

- Check FPS in the debug overlay during the busiest moment (late waves, max particles).
- In desktop Chrome DevTools → Performance, enable **4× CPU slowdown** as a rough Deck proxy, and record a few seconds of heavy play. Look for long frames, garbage-collection spikes (allocations in the loop) and expensive draw calls.
- three.js: log `renderer.info.render.calls` and `.triangles` against the [3d.md](3d.md) budget.
