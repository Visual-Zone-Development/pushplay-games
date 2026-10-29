// Star Courier: grab parcels, dodge asteroids, beat the clock.
// The sample game for this repo; it shows the conventions in AGENTS.md: title, pause and settings
// screens that work with a controller, a keyboard, a mouse and touch (menu.js), pause three ways
// plus auto-pause, input-aware prompts (prompts.js), saved best score (save.js), 1280×800 space (fit.js).
import { input } from './input.js'
import { createMenu } from './menu.js'
import { fitCanvas } from './fit.js'
import { createAudio } from './audio.js'
import { createSave, createSettings } from './save.js'
import { createSettingsScreen } from './settings.js'
import { drawPrompts } from './prompts.js'
import { PAL, bake, blit, bakeShip, bakeRocks, bakeParcel, bakeGlow, drawShip as drawShipArt, drawFlame, drawRock, drawBackdrop, drawVignette } from './art.js'

const ID = 'star-courier'
const W = 1280
const H = 800
const canvas = document.getElementById('game')
const fit = fitCanvas(canvas, { w: W, h: H, letterbox: '#05070f' })
const ctx = fit.ctx
input.attach(canvas, W, H)

const settings = createSettings(ID) // star-courier-settings-v1
const audio = createAudio({ settings })
// star-courier-save-v1; v1.0 kept the best score under a bare key, so migrate it once.
const save = createSave(ID, 1, { best: Number(localStorage.getItem('star-courier-best') ?? 0) || 0 })

const TUNING = { roundSeconds: 60, thrust: 900, boost: 1500, drag: 0.12, rockPenalty: 5, rocksEvery: 4 }

const state = {
  screen: 'title', // title | playing | paused | settings | gameover
  from: 'title', // where Settings returns to
  ship: { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2 },
  parcels: [],
  rocks: [],
  sparks: [],
  trail: [],
  score: 0,
  time: TUNING.roundSeconds,
  hitFlash: 0,
  shake: 0
}
window.__game = { state, TUNING, save, settings, get titleMenu() { return titleMenu } }
const debug = new URLSearchParams(location.search).has('debug')

const titleMenu = createMenu(
  [
    { id: 'launch', label: 'Launch' },
    { id: 'settings', label: 'Settings' }
  ],
  { y: H / 2 + 130 }
)
const pauseMenu = createMenu(
  [
    { id: 'resume', label: 'Resume' },
    { id: 'restart', label: 'Restart' },
    { id: 'settings', label: 'Settings' },
    { id: 'title', label: 'Quit to title' }
  ],
  { y: H / 2 - 60 }
)
const overMenu = createMenu(
  [
    { id: 'again', label: 'Play again' },
    { id: 'title', label: 'Title' }
  ],
  { y: H / 2 + 60 }
)
const settingsScreen = createSettingsScreen({ settings, audio })

// Pause button for mouse and touch, top centre, clear of the score and clock.
const PAUSE_BUTTON = { x: W / 2 - 28, y: 24, w: 56, h: 56 }
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

const rand = (min, max) => min + Math.random() * (max - min)
// Near stars drift over the baked backdrop for a little parallax.
const stars = Array.from({ length: 60 }, () => ({ x: rand(0, W), y: rand(0, H), z: rand(0.3, 1) }))

// Art (art.js): baked once at 2×, blitted every frame.
const ART = {
  ship: bakeShip(),
  rocks: bakeRocks(6),
  parcel: bakeParcel(),
  glowAmber: bakeGlow(PAL.amber, 40),
  glowRed: bakeGlow(PAL.danger, 24),
  backdrop: bake(W, H, (g) => (g.translate(-W / 2, -H / 2), drawBackdrop(g, W, H)), 2)
}
// Bundled fonts (OFL, see assets/CREDITS.md); text falls back to system-ui until they load.
for (const [family, file, weight] of [['Rubik', 'rubik-700', 700], ['Rubik', 'rubik-900', 900], ['Lilita One', 'lilita-one', 400]]) {
  const face = new FontFace(family, `url(./assets/fonts/${file}.woff2)`, { weight: String(weight) })
  face.load().then((f) => document.fonts.add(f), () => {})
}

// Launcher overlay, window hidden or unfocused, every controller gone: pause.
input.onPause(() => {
  if (state.screen === 'playing') pause()
})

function reset() {
  Object.assign(state.ship, { x: W / 2, y: H / 2, vx: 0, vy: 0 })
  state.parcels = Array.from({ length: 3 }, spawnParcel)
  state.rocks = Array.from({ length: 5 }, spawnRock)
  state.sparks = []
  state.trail = []
  state.score = 0
  state.time = TUNING.roundSeconds
  state.hitFlash = 0
  state.shake = 0
  state.screen = 'playing'
}
function pause() {
  pauseMenu.select('resume')
  state.screen = 'paused'
}
function openSettings(from) {
  state.from = from
  state.screen = 'settings'
}

function spawnParcel() {
  return { x: rand(80, W - 80), y: rand(100, H - 80), bob: rand(0, Math.PI * 2) }
}
function spawnRock() {
  const edge = Math.random() < 0.5
  return {
    x: edge ? -60 : rand(0, W),
    y: edge ? rand(0, H) : -60,
    vx: rand(60, 160) * (Math.random() < 0.5 ? 1 : -1),
    vy: rand(60, 160),
    r: rand(22, 44),
    spin: rand(-2, 2),
    a: 0,
    look: ART.rocks[Math.floor(Math.random() * ART.rocks.length)]
  }
}
function burst(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2)
    const s = rand(80, 320)
    state.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), color })
  }
}

function update(dt) {
  for (const s of stars) {
    s.y += 30 * s.z * dt
    if (s.y > H) s.y -= H
  }
  switch (state.screen) {
    case 'title': {
      const choice = titleMenu.update(input, dt)
      if (choice === 'launch') reset()
      if (choice === 'settings') openSettings('title')
      return
    }
    case 'settings':
      if (settingsScreen.update(input, dt) === 'back') state.screen = state.from
      return
    case 'gameover': {
      const choice = overMenu.update(input, dt)
      if (choice === 'again') reset()
      if (choice === 'title' || choice === 'back') state.screen = 'title'
      return
    }
    case 'paused': {
      const choice = pauseMenu.update(input, dt)
      if (choice === 'resume' || choice === 'back') state.screen = 'playing'
      if (choice === 'restart') reset()
      if (choice === 'settings') openSettings('paused')
      if (choice === 'title') state.screen = 'title'
      return
    }
  }
  play(dt)
}

function play(dt) {
  if (input.pointer.pressed && inside(input.pointer, PAUSE_BUTTON)) input.requestMenu()
  if (input.pressed('menu')) return pause()

  const ship = state.ship
  // Stick / keys thrust; a mouse or finger drags the ship towards the pointer.
  let dx = input.x
  let dy = input.y
  if (input.pointer.down && (input.mode === 'mouse' || input.mode === 'touch') && !inside(input.pointer, PAUSE_BUTTON)) {
    const ax = input.pointer.x - ship.x
    const ay = input.pointer.y - ship.y
    const d = Math.hypot(ax, ay)
    if (d > 12) (dx = ax / d), (dy = ay / d)
  }
  const boosting = input.held('a') || input.held('rt')
  const thrust = boosting ? TUNING.boost : TUNING.thrust
  // How hard the engine is burning (visual only): idle glow, more when steering, most on boost.
  const burn = Math.min(1, Math.hypot(dx, dy)) * (boosting ? 1 : 0.55)
  ship.burn = 0.15 + burn * 0.85
  ship.vx = (ship.vx + dx * thrust * dt) * Math.pow(TUNING.drag, dt)
  ship.vy = (ship.vy + dy * thrust * dt) * Math.pow(TUNING.drag, dt)
  ship.x = Math.max(20, Math.min(W - 20, ship.x + ship.vx * dt))
  ship.y = Math.max(20, Math.min(H - 20, ship.y + ship.vy * dt))
  if (Math.hypot(ship.vx, ship.vy) > 30) ship.angle = Math.atan2(ship.vy, ship.vx)

  state.time -= dt
  if (state.time <= 0) {
    state.time = 0
    state.screen = 'gameover'
    state.shake = 0
    overMenu.select('again')
    audio.tone({ freq: 330, dur: 0.5, type: 'triangle', slide: -200 })
    if (state.score > save.data.best) {
      save.data.best = state.score
      save.save()
    }
    return // the round is over: nothing else moves or hits this frame
  }

  state.parcels = state.parcels.map((p) => {
    p.bob += dt * 3
    if (Math.hypot(p.x - ship.x, p.y - ship.y) < 40) {
      state.score += 1
      burst(p.x, p.y, '#ffb547')
      audio.tone({ freq: 660 + state.score * 15, dur: 0.12, slide: 400, gain: 0.15 })
      if (state.score % TUNING.rocksEvery === 0) state.rocks.push(spawnRock())
      return spawnParcel()
    }
    return p
  })

  state.rocks = state.rocks.map((r) => {
    r.x += r.vx * dt
    r.y += r.vy * dt
    r.a += r.spin * dt
    if (r.x < -100 || r.x > W + 100 || r.y > H + 100) return spawnRock()
    if (Math.hypot(r.x - ship.x, r.y - ship.y) < r.r + 16 && state.hitFlash <= 0) {
      state.time = Math.max(0, state.time - TUNING.rockPenalty)
      state.hitFlash = 0.6
      state.shake = settings.data.reducedShake ? 0 : 0.35
      burst(ship.x, ship.y, '#ff7a6b', 22)
      audio.noise({ dur: 0.25, gain: 0.3 })
      ship.vx = (ship.x - r.x) * 8
      ship.vy = (ship.y - r.y) * 8
    }
    return r
  })
  state.hitFlash = Math.max(0, state.hitFlash - dt)
  state.shake = Math.max(0, state.shake - dt)

  state.sparks = state.sparks.filter((s) => (s.life -= dt) > 0)
  for (const s of state.sparks) {
    s.x += s.vx * dt
    s.y += s.vy * dt
  }
  // exhaust puffs from the nozzles, capped
  if (burn > 0.1 && state.trail.length < 90) {
    const bx = ship.x - Math.cos(ship.angle) * 34
    const by = ship.y - Math.sin(ship.angle) * 34
    state.trail.push({ x: bx + rand(-3, 3), y: by + rand(-3, 3), life: 0.45 * burn + 0.1, max: 0.45 * burn + 0.1 })
  }
  state.trail = state.trail.filter((t) => (t.life -= dt) > 0)
}

const font = (weight, px, family = 'Rubik') => `${weight} ${Math.round(px * settings.data.textScale)}px ${family}, system-ui, sans-serif`
const now = () => performance.now() / 1000

/** Text with an ink edge, so it reads over the nebula. */
function inkText(text, x, y, color = PAL.text, edge = 6) {
  ctx.lineJoin = 'round'
  ctx.lineWidth = edge
  ctx.strokeStyle = PAL.ink
  ctx.strokeText(text, x, y)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

/** In play the baked sprite; big (the title) the vector art itself, so it stays sharp. */
function drawShip(x, y, angle, scale = 1, burn = 0.3) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.scale(scale, scale)
  drawFlame(ctx, burn, now())
  if (scale === 1) blit(ctx, ART.ship, 0, 0)
  else drawShipArt(ctx)
  ctx.restore()
}

function draw() {
  ctx.save()
  // Shake only counts down in play(), so it only applies there: a hit that ends the round must not
  // leave the game-over screen shaking.
  if (state.shake > 0 && state.screen === 'playing') ctx.translate((Math.random() - 0.5) * 16 * state.shake, (Math.random() - 0.5) * 16 * state.shake)
  ctx.fillStyle = PAL.space
  ctx.fillRect(-20, -20, W + 40, H + 40)
  ctx.drawImage(ART.backdrop.canvas, 0, 0, W, H)
  for (const s of stars) {
    ctx.fillStyle = `rgba(220,236,255,${0.2 + s.z * 0.5})`
    ctx.fillRect(s.x, s.y, s.z * 2.2, s.z * 2.2)
  }
  if (state.screen === 'title' || state.screen === 'settings') drawVignette(ctx, W, H, 0.5)
  ctx.textBaseline = 'middle'

  if (state.screen === 'title') drawTitle()
  else if (state.screen === 'settings') {
    settingsScreen.draw(ctx, { font: font(600, 28) })
    drawPrompts(ctx, input, [['left', 'Change'], ['b', 'Back']], { size: 24 * settings.data.textScale })
  } else {
    drawPlay()
    if (state.screen === 'paused' || state.screen === 'gameover') {
      ctx.fillStyle = 'rgba(5,7,15,0.7)'
      ctx.fillRect(0, 0, W, H)
      ctx.textAlign = 'center'
      ctx.font = font(400, 76, 'Lilita One')
      if (state.screen === 'paused') {
        inkText('Paused', W / 2, H / 2 - 150)
        pauseMenu.draw(ctx, font(700, 30))
      } else {
        inkText(`${state.score} parcels delivered`, W / 2, H / 2 - 80)
        const best = state.score > 0 && state.score >= save.data.best
        ctx.font = font(700, 28)
        ctx.fillStyle = best ? PAL.amber : '#c9cfdb'
        ctx.fillText(best ? 'New best!' : `Best ${save.data.best}`, W / 2, H / 2 - 10)
        overMenu.draw(ctx, font(700, 30))
      }
    }
  }
  ctx.restore()
  if (debug) drawDebug()
}

function drawTitle() {
  const t = now()
  drawShip(W / 2, H / 2 - 222 + Math.sin(t * 1.6) * 6, -Math.PI / 2, 2.4, 0.45)
  ctx.textAlign = 'center'
  ctx.font = font(400, 104, 'Lilita One')
  inkText('Star Courier', W / 2, H / 2 - 14, PAL.text, 12)
  ctx.font = font(700, 28)
  ctx.fillStyle = '#c9cfdb'
  ctx.fillText(`Grab parcels. Dodge rocks. ${TUNING.roundSeconds} seconds on the clock.${save.data.best ? ` Best: ${save.data.best}` : ''}`, W / 2, H / 2 + 55)
  titleMenu.draw(ctx, font(700, 30))
  drawPrompts(ctx, input, [['a', 'Boost'], ['menu', 'Pause']], { size: 24 * settings.data.textScale })
}

function drawPlay() {
  // additive layer: exhaust, parcel halos
  ctx.globalCompositeOperation = 'lighter'
  for (const t of state.trail) {
    const k = t.life / t.max
    ctx.globalAlpha = k * 0.5
    blit(ctx, ART.glowAmber, t.x, t.y, 0, 0.25 + (1 - k) * 0.35)
  }
  for (const p of state.parcels) {
    ctx.globalAlpha = 0.55 + Math.sin(p.bob * 1.3) * 0.2
    blit(ctx, ART.glowAmber, p.x, p.y + Math.sin(p.bob) * 6, 0, 1.1)
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  for (const p of state.parcels) blit(ctx, ART.parcel, p.x, p.y + Math.sin(p.bob) * 6, Math.sin(p.bob * 0.7) * 0.12)
  for (const r of state.rocks) drawRock(ctx, r.look, r.x, r.y, r.r, r.a)
  if (state.hitFlash <= 0 || Math.floor(state.hitFlash * 20) % 2) drawShip(state.ship.x, state.ship.y, state.ship.angle, 1, state.ship.burn ?? 0.3)
  ctx.globalCompositeOperation = 'lighter'
  for (const s of state.sparks) {
    ctx.globalAlpha = Math.min(1, s.life * 2)
    blit(ctx, s.color === PAL.danger ? ART.glowRed : ART.glowAmber, s.x, s.y, 0, 0.35)
    ctx.fillStyle = '#fff3d6'
    ctx.fillRect(s.x - 2, s.y - 2, 4, 4)
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  drawVignette(ctx, W, H, 0.5)

  ctx.font = font(700, 32)
  ctx.textAlign = 'left'
  inkText(`Parcels ${state.score}`, 32, 52, PAL.amber)
  ctx.textAlign = 'right'
  inkText(`${Math.ceil(state.time)}s`, W - 32, 52, state.time < 10 ? PAL.danger : PAL.text)
  if (state.screen === 'playing') {
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath()
    ctx.roundRect(PAUSE_BUTTON.x, PAUSE_BUTTON.y, PAUSE_BUTTON.w, PAUSE_BUTTON.h, 12)
    ctx.fill()
    ctx.fillStyle = '#eef0f5'
    ctx.fillRect(PAUSE_BUTTON.x + 18, PAUSE_BUTTON.y + 16, 7, 24)
    ctx.fillRect(PAUSE_BUTTON.x + 31, PAUSE_BUTTON.y + 16, 7, 24)
    drawPrompts(ctx, input, [['a', 'Boost'], ['menu', 'Pause']], { size: 22 * settings.data.textScale, color: 'rgba(238,240,245,0.75)' })
  }
}

/** ?debug: live state in the corner. */
function drawDebug() {
  ctx.save()
  ctx.font = '500 16px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(8, 8, 360, 76)
  ctx.fillStyle = '#9fe'
  ctx.fillText(`screen ${state.screen}  mode ${input.mode}${input.gamingMode ? ' (gaming mode)' : ''}`, 16, 16)
  ctx.fillText(`fps ${fps.toFixed(0)}  scale ${fit.scale.toFixed(2)}  dpr ${fit.dpr}  rocks ${state.rocks.length}`, 16, 36)
  ctx.fillText(`ship ${state.ship.x.toFixed(0)},${state.ship.y.toFixed(0)}  pads ${input.pads.filter((p) => p.connected).length}`, 16, 56)
  ctx.restore()
}

let last = performance.now()
let fps = 60
function frame(now) {
  const dt = Math.min(1 / 20, (now - last) / 1000)
  last = now
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05
  input.update(dt)
  update(dt)
  draw()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
