// {{NAME}}: starter game. Replace the gameplay in play()/drawPlay() and keep the screens:
// title (Play / Settings), pause (Resume / Restart / Settings / Quit to title), settings, game over.
// Everything works with a controller, a keyboard, a mouse and touch through the runtime modules.
import { input } from './input.js'
import { createMenu } from './menu.js'
import { fitCanvas } from './fit.js'
import { createAudio } from './audio.js'
import { createSave, createSettings } from './save.js'
import { createSettingsScreen } from './settings.js'
import { drawPrompts } from './prompts.js'

const ID = '{{ID}}'
const W = 1280
const H = 800
const canvas = document.getElementById('game')
const fit = fitCanvas(canvas, { w: W, h: H, letterbox: '#0d0f14' })
const ctx = fit.ctx
input.attach(canvas, W, H)

const settings = createSettings(ID) // <id>-settings-v1: volumes, reduced shake, text size
const audio = createAudio({ settings })
const save = createSave(ID, 1, { best: 0 }) // <id>-save-v1

/** Numbers worth tuning live here so they're easy to find (and to change from the ?debug console). */
const TUNING = { speed: 460, radius: 24, roundSeconds: 30, orbRadius: 18 }

const state = {
  screen: 'title', // title | playing | paused | settings | gameover
  from: 'title', // where Settings returns to
  player: { x: W / 2, y: H / 2 },
  orb: { x: W / 3, y: H / 3 },
  score: 0,
  time: TUNING.roundSeconds,
  shake: 0
}
// The check presses Start and expects state.screen 'paused', and taps titleMenu's first item.
window.__game = { state, TUNING, save, settings, get titleMenu() { return titleMenu } }
const debug = new URLSearchParams(location.search).has('debug')

const titleMenu = createMenu(
  [
    { id: 'play', label: 'Play' },
    { id: 'settings', label: 'Settings' }
  ],
  { y: H / 2 + 20 }
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
  { y: H / 2 + 40 }
)
const settingsScreen = createSettingsScreen({ settings, audio })

// On-screen pause button for mouse and touch players (a controller uses Start, a keyboard Esc).
const PAUSE_BUTTON = { x: W - 88, y: 32, w: 56, h: 56 }
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

// The launcher opened its overlay, the window lost focus, or every controller disconnected.
input.onPause(() => {
  if (state.screen === 'playing') pause()
})

function startRound() {
  Object.assign(state, { score: 0, time: TUNING.roundSeconds, shake: 0, screen: 'playing' })
  state.player = { x: W / 2, y: H / 2 }
  placeOrb()
}
function pause() {
  pauseMenu.select('resume')
  state.screen = 'paused'
}
function openSettings(from) {
  state.from = from
  state.screen = 'settings'
}
function placeOrb() {
  state.orb = { x: 80 + Math.random() * (W - 160), y: 80 + Math.random() * (H - 160) }
}
function endRound() {
  state.screen = 'gameover'
  overMenu.select('again')
  if (state.score > save.data.best) {
    save.data.best = state.score
    save.save()
  }
}

function update(dt) {
  switch (state.screen) {
    case 'title': {
      const choice = titleMenu.update(input, dt)
      if (choice === 'play') startRound()
      if (choice === 'settings') openSettings('title')
      return
    }
    case 'settings':
      if (settingsScreen.update(input, dt) === 'back') state.screen = state.from
      return
    case 'paused': {
      const choice = pauseMenu.update(input, dt)
      if (choice === 'resume' || choice === 'back') state.screen = 'playing'
      if (choice === 'restart') startRound()
      if (choice === 'settings') openSettings('paused')
      if (choice === 'title') state.screen = 'title'
      return
    }
    case 'gameover': {
      const choice = overMenu.update(input, dt)
      if (choice === 'again') startRound()
      if (choice === 'title' || choice === 'back') state.screen = 'title'
      return
    }
  }
  play(dt)
}

/** One frame of gameplay. */
function play(dt) {
  if (input.pointer.pressed && inside(input.pointer, PAUSE_BUTTON)) input.requestMenu()
  if (input.pressed('menu')) return pause()

  const p = state.player
  const speed = TUNING.speed * (input.held('a') ? 1.6 : 1)
  // Stick / keys move; a pointer (mouse or finger) drags the player towards it.
  let dx = input.x
  let dy = input.y
  if (input.pointer.down && (input.mode === 'mouse' || input.mode === 'touch')) {
    const ax = input.pointer.x - p.x
    const ay = input.pointer.y - p.y
    const d = Math.hypot(ax, ay)
    if (d > 8) (dx = ax / d), (dy = ay / d)
  }
  p.x = Math.max(TUNING.radius, Math.min(W - TUNING.radius, p.x + dx * speed * dt))
  p.y = Math.max(TUNING.radius, Math.min(H - TUNING.radius, p.y + dy * speed * dt))

  if (Math.hypot(state.orb.x - p.x, state.orb.y - p.y) < TUNING.radius + TUNING.orbRadius) {
    state.score++
    state.shake = settings.data.reducedShake ? 0 : 0.25
    audio.tone({ freq: 520 + state.score * 20, dur: 0.1, slide: 300 })
    placeOrb()
  }
  state.shake = Math.max(0, state.shake - dt)
  state.time -= dt
  if (state.time <= 0) {
    state.time = 0
    audio.tone({ freq: 220, dur: 0.4, type: 'triangle', slide: -120 })
    endRound()
  }
}

const font = (weight, px) => `${weight} ${Math.round(px * settings.data.textScale)}px system-ui, sans-serif`

function draw() {
  ctx.save()
  if (state.shake > 0) ctx.translate((Math.random() - 0.5) * 12 * state.shake, (Math.random() - 0.5) * 12 * state.shake)
  ctx.fillStyle = '#141a2a'
  ctx.fillRect(-20, -20, W + 40, H + 40)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (state.screen === 'title') {
    ctx.fillStyle = '#eef0f5'
    ctx.font = font(800, 84)
    ctx.fillText('{{NAME}}', W / 2, H / 2 - 150)
    ctx.font = font(500, 26)
    ctx.fillStyle = '#9aa3b5'
    ctx.fillText(`Collect orbs for ${TUNING.roundSeconds} seconds${save.data.best ? ` · Best ${save.data.best}` : ''}`, W / 2, H / 2 - 70)
    titleMenu.draw(ctx, font(600, 30))
    drawPrompts(ctx, input, [['a', 'Choose'], ['menu', 'Pause in game']], { size: 24 * settings.data.textScale })
  } else if (state.screen === 'settings') {
    settingsScreen.draw(ctx, { font: font(600, 28) })
    drawPrompts(ctx, input, [['left', 'Change'], ['b', 'Back']], { size: 24 * settings.data.textScale })
  } else {
    drawPlay()
    if (state.screen === 'paused' || state.screen === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#eef0f5'
      ctx.font = font(700, 60)
      if (state.screen === 'paused') {
        ctx.fillText('Paused', W / 2, H / 2 - 150)
        pauseMenu.draw(ctx, font(600, 30))
      } else {
        ctx.fillText(`${state.score} orbs`, W / 2, H / 2 - 80)
        ctx.font = font(500, 28)
        ctx.fillStyle = '#c9cfdb'
        ctx.fillText(`Best ${save.data.best}`, W / 2, H / 2 - 20)
        overMenu.draw(ctx, font(600, 30))
      }
    }
  }
  ctx.restore()
  if (debug) drawDebug()
}

function drawPlay() {
  ctx.fillStyle = '#5cc8ff'
  ctx.beginPath()
  ctx.arc(state.orb.x, state.orb.y, TUNING.orbRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffb547'
  ctx.beginPath()
  ctx.arc(state.player.x, state.player.y, TUNING.radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#eef0f5'
  ctx.font = font(700, 32)
  ctx.textAlign = 'left'
  ctx.fillText(`Orbs ${state.score}`, 32, 56)
  ctx.textAlign = 'right'
  ctx.fillStyle = state.time < 5 ? '#ff7a6b' : '#eef0f5'
  ctx.fillText(`${Math.ceil(state.time)}s`, W - 120, 56)
  if (state.screen === 'playing') {
    // Pause button: two bars, top-right, clear of the outermost 32px.
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath()
    ctx.roundRect(PAUSE_BUTTON.x, PAUSE_BUTTON.y, PAUSE_BUTTON.w, PAUSE_BUTTON.h, 12)
    ctx.fill()
    ctx.fillStyle = '#eef0f5'
    ctx.fillRect(PAUSE_BUTTON.x + 18, PAUSE_BUTTON.y + 16, 7, 24)
    ctx.fillRect(PAUSE_BUTTON.x + 31, PAUSE_BUTTON.y + 16, 7, 24)
    drawPrompts(ctx, input, [['a', 'Boost'], ['menu', 'Pause']], { size: 22 * settings.data.textScale })
  }
}

/** ?debug: live state in the corner. Add whatever helps while tuning. */
function drawDebug() {
  ctx.save()
  ctx.font = '500 16px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(8, 8, 320, 76)
  ctx.fillStyle = '#9fe'
  ctx.fillText(`screen ${state.screen}  mode ${input.mode}${input.gamingMode ? ' (gaming mode)' : ''}`, 16, 16)
  ctx.fillText(`fps ${fps.toFixed(0)}  scale ${fit.scale.toFixed(2)}  dpr ${fit.dpr}`, 16, 36)
  ctx.fillText(`pointer ${input.pointer.x.toFixed(0)},${input.pointer.y.toFixed(0)}  pads ${input.pads.filter((p) => p.connected).length}`, 16, 56)
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
