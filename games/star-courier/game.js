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
const stars = Array.from({ length: 140 }, () => ({ x: rand(0, W), y: rand(0, H), z: rand(0.2, 1) }))

// Launcher overlay, window hidden or unfocused, every controller gone: pause.
input.onPause(() => {
  if (state.screen === 'playing') pause()
})

function reset() {
  Object.assign(state.ship, { x: W / 2, y: H / 2, vx: 0, vy: 0 })
  state.parcels = Array.from({ length: 3 }, spawnParcel)
  state.rocks = Array.from({ length: 5 }, spawnRock)
  state.sparks = []
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
    a: 0
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
  const thrust = input.held('a') || input.held('rt') ? TUNING.boost : TUNING.thrust
  ship.vx = (ship.vx + dx * thrust * dt) * Math.pow(TUNING.drag, dt)
  ship.vy = (ship.vy + dy * thrust * dt) * Math.pow(TUNING.drag, dt)
  ship.x = Math.max(20, Math.min(W - 20, ship.x + ship.vx * dt))
  ship.y = Math.max(20, Math.min(H - 20, ship.y + ship.vy * dt))
  if (Math.hypot(ship.vx, ship.vy) > 30) ship.angle = Math.atan2(ship.vy, ship.vx)

  state.time -= dt
  if (state.time <= 0) {
    state.time = 0
    state.screen = 'gameover'
    overMenu.select('again')
    audio.tone({ freq: 330, dur: 0.5, type: 'triangle', slide: -200 })
    if (state.score > save.data.best) {
      save.data.best = state.score
      save.save()
    }
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
}

const font = (weight, px) => `${weight} ${Math.round(px * settings.data.textScale)}px system-ui, sans-serif`

function drawShip(x, y, angle, scale = 1) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.scale(scale, scale)
  ctx.fillStyle = '#5cc8ff'
  ctx.beginPath()
  ctx.moveTo(26, 0)
  ctx.lineTo(-18, -16)
  ctx.lineTo(-10, 0)
  ctx.lineTo(-18, 16)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffb547'
  ctx.beginPath()
  ctx.moveTo(-12, -6)
  ctx.lineTo(-26 - Math.random() * 10, 0)
  ctx.lineTo(-12, 6)
  ctx.fill()
  ctx.restore()
}

function draw() {
  ctx.save()
  if (state.shake > 0) ctx.translate((Math.random() - 0.5) * 16 * state.shake, (Math.random() - 0.5) * 16 * state.shake)
  ctx.fillStyle = '#0b1024'
  ctx.fillRect(-20, -20, W + 40, H + 40)
  for (const s of stars) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 + s.z * 0.6})`
    ctx.fillRect(s.x, s.y, s.z * 2.5, s.z * 2.5)
  }
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
      ctx.fillStyle = '#eef0f5'
      ctx.textAlign = 'center'
      ctx.font = font(800, 72)
      if (state.screen === 'paused') {
        ctx.fillText('Paused', W / 2, H / 2 - 150)
        pauseMenu.draw(ctx, font(600, 30))
      } else {
        ctx.fillText(`${state.score} parcels delivered`, W / 2, H / 2 - 80)
        ctx.font = font(500, 28)
        ctx.fillStyle = '#c9cfdb'
        ctx.fillText(`Best ${save.data.best}`, W / 2, H / 2 - 10)
        overMenu.draw(ctx, font(600, 30))
      }
    }
  }
  ctx.restore()
  if (debug) drawDebug()
}

function drawTitle() {
  drawShip(W / 2, H / 2 - 190, -Math.PI / 2, 3)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#eef0f5'
  ctx.font = font(800, 88)
  ctx.fillText('Star Courier', W / 2, H / 2 - 10)
  ctx.font = font(500, 28)
  ctx.fillStyle = '#c9cfdb'
  ctx.fillText(`Grab parcels. Dodge rocks. ${TUNING.roundSeconds} seconds on the clock.${save.data.best ? ` Best: ${save.data.best}` : ''}`, W / 2, H / 2 + 55)
  titleMenu.draw(ctx, font(600, 30))
  drawPrompts(ctx, input, [['a', 'Boost'], ['menu', 'Pause']], { size: 24 * settings.data.textScale })
}

function drawPlay() {
  for (const p of state.parcels) {
    const y = p.y + Math.sin(p.bob) * 6
    ctx.fillStyle = '#ffb547'
    ctx.fillRect(p.x - 16, y - 14, 32, 28)
    ctx.fillStyle = '#7a4a10'
    ctx.fillRect(p.x - 3, y - 14, 6, 28)
  }
  for (const r of state.rocks) {
    ctx.save()
    ctx.translate(r.x, r.y)
    ctx.rotate(r.a)
    ctx.fillStyle = '#6d6a80'
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const rr = r.r * (i % 2 ? 0.82 : 1)
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    ctx.fill()
    ctx.restore()
  }
  if (state.hitFlash <= 0 || Math.floor(state.hitFlash * 20) % 2) drawShip(state.ship.x, state.ship.y, state.ship.angle)
  for (const s of state.sparks) {
    ctx.globalAlpha = Math.min(1, s.life * 2)
    ctx.fillStyle = s.color
    ctx.fillRect(s.x - 3, s.y - 3, 6, 6)
  }
  ctx.globalAlpha = 1

  ctx.fillStyle = '#eef0f5'
  ctx.font = font(700, 32)
  ctx.textAlign = 'left'
  ctx.fillText(`Parcels ${state.score}`, 32, 52)
  ctx.textAlign = 'right'
  ctx.fillStyle = state.time < 10 ? '#ff7a6b' : '#eef0f5'
  ctx.fillText(`${Math.ceil(state.time)}s`, W - 32, 52)
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
