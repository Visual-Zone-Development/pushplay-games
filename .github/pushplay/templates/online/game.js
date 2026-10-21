// {{NAME}}: online starter. The host's copy runs the game; every player sends inputs and draws
// net.view. Replace hostUpdate() and drawPlay() with the real game and keep the screens:
// title (Play online / Settings), lobby (lobby.js), pause (Resume / Settings / Quit to title), settings.
// Everything works with a controller, a keyboard, a mouse and touch through the runtime modules.
import { input } from './input.js'
import { createMenu } from './menu.js'
import { fitCanvas } from './fit.js'
import { createAudio } from './audio.js'
import { createSettings } from './save.js'
import { createSettingsScreen } from './settings.js'
import { drawPrompts } from './prompts.js'
import { createLobby } from './lobby.js'
import { createNet } from './net.js'

const ID = '{{ID}}'
const W = 1280
const H = 800
const canvas = document.getElementById('game')
const fit = fitCanvas(canvas, { w: W, h: H, letterbox: '#0d0f14' })
const ctx = fit.ctx
input.attach(canvas, W, H)

const settings = createSettings(ID) // <id>-settings-v1: volumes, reduced shake, text size
const audio = createAudio({ settings })

/** Numbers worth tuning live here so they're easy to find (and to change from the ?debug console). */
const TUNING = { speed: 420, radius: 24 }
const COLORS = ['#ffb547', '#5ad1ff', '#ff6b8a', '#7dff8a', '#c18cff', '#ffe066', '#ff9f43', '#9aa3b5']

const net = createNet({ minPlayers: {{MIN_PLAYERS}}, maxPlayers: {{MAX_PLAYERS}} })
const lobby = createLobby(net, input, { title: '{{NAME}}' })

const state = {
  screen: 'title', // title | lobby | playing | paused | settings
  from: 'title', // where Settings returns to
  resumeTo: 'lobby' // where Resume returns to (the pause menu opens from the lobby too)
}
// The check presses Start and expects state.screen 'paused', and taps titleMenu's first item.
window.__game = { state, TUNING, net, settings, get titleMenu() { return titleMenu } }
const debug = new URLSearchParams(location.search).has('debug')

const titleMenu = createMenu(
  [
    { id: 'play', label: 'Play online' },
    { id: 'settings', label: 'Settings' }
  ],
  { y: H / 2 + 20 }
)
// No Restart: the match belongs to everyone in the room. Quitting leaves it.
const pauseMenu = createMenu(
  [
    { id: 'resume', label: 'Resume' },
    { id: 'settings', label: 'Settings' },
    { id: 'title', label: 'Quit to title' }
  ],
  { y: H / 2 - 40 }
)
const settingsScreen = createSettingsScreen({ settings, audio })

// On-screen pause button for mouse and touch players (a controller uses Start, a keyboard Esc).
const PAUSE_BUTTON = { x: W - 88, y: 32, w: 56, h: 56 }
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

// The launcher opened its overlay, the window lost focus, or every controller disconnected.
input.onPause(() => {
  if (state.screen === 'playing' || state.screen === 'lobby') pause()
})

// The host left or the connection dropped: back to the lobby, which shows why.
function backToLobby() {
  if (state.screen === 'playing') state.screen = 'lobby'
  if (state.resumeTo === 'playing') state.resumeTo = 'lobby'
}
net.on('end', backToLobby)
net.on('disconnect', backToLobby)
net.on('join', () => audio.tone({ freq: 660, dur: 0.08, slide: 200 }))
net.on('start', () => audio.tone({ freq: 440, dur: 0.15, slide: 400 }))

function openLobby() {
  lobby.open()
  state.screen = 'lobby'
}
function pause() {
  // Online games can't pause the world; the menu just stops your controls.
  net.setInput({})
  state.resumeTo = state.screen === 'playing' ? 'playing' : 'lobby'
  pauseMenu.select('resume')
  state.screen = 'paused'
}
function resume() {
  state.screen = net.status === 'playing' && state.resumeTo === 'playing' ? 'playing' : 'lobby'
}
function openSettings(from) {
  state.from = from
  state.screen = 'settings'
}
function quitToTitle() {
  net.disconnect() // leaves the room (the others carry on) and hangs up
  state.screen = 'title'
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/** Host only: the game rules. Read net.inputs, write net.state; net.js sends the changes. */
function hostUpdate(dt) {
  const s = net.state
  s.players ??= {}
  for (const id of net.players) {
    const slot = net.slot(id)
    const p = (s.players[id] ??= { x: W / 2 + (slot - (net.players.length - 1) / 2) * 120, y: H / 2, slot })
    const i = net.inputs[id] ?? {}
    p.x = clamp(p.x + (i.x ?? 0) * TUNING.speed * dt, TUNING.radius, W - TUNING.radius)
    p.y = clamp(p.y + (i.y ?? 0) * TUNING.speed * dt, TUNING.radius, H - TUNING.radius)
  }
  for (const id of Object.keys(s.players)) if (!net.players.includes(id)) delete s.players[id]
}

function update(dt) {
  switch (state.screen) {
    case 'title': {
      const choice = titleMenu.update(input, dt)
      if (choice === 'play') openLobby()
      if (choice === 'settings') openSettings('title')
      break
    }
    case 'settings':
      if (settingsScreen.update(input, dt) === 'back') state.screen = state.from
      break
    case 'lobby': {
      if (input.pressed('menu')) {
        pause()
        break
      }
      const result = lobby.update()
      if (result === 'start') state.screen = 'playing'
      if (result === 'back') state.screen = 'title'
      break
    }
    case 'paused': {
      const choice = pauseMenu.update(input, dt)
      if (choice === 'resume' || choice === 'back') resume()
      if (choice === 'settings') openSettings('paused')
      if (choice === 'title') quitToTitle()
      break
    }
    case 'playing':
      play(dt)
      break
  }
  // The host keeps the match running for everyone, whatever screen it's on itself.
  if (net.isHost && net.status === 'playing') hostUpdate(dt)
  net.update()
}

/** One frame of gameplay: send this player's controls (the host applies them in hostUpdate). */
function play(dt) {
  if (input.pointer.pressed && inside(input.pointer, PAUSE_BUTTON)) input.requestMenu()
  if (input.pressed('menu')) return pause()

  // Stick / keys move; a pointer (mouse or finger) drags your player towards it.
  let dx = input.x
  let dy = input.y
  const me = net.view.players?.[net.me]
  if (me && input.pointer.down && (input.mode === 'mouse' || input.mode === 'touch')) {
    const ax = input.pointer.x - me.x
    const ay = input.pointer.y - me.y
    const d = Math.hypot(ax, ay)
    if (d > 8) (dx = ax / d), (dy = ay / d)
  }
  net.setInput({ x: dx, y: dy })
}

const font = (weight, px) => `${weight} ${Math.round(px * settings.data.textScale)}px system-ui, sans-serif`

function draw() {
  ctx.save()
  ctx.fillStyle = '#141a2a'
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (state.screen === 'title') {
    ctx.fillStyle = '#eef0f5'
    ctx.font = font(800, 84)
    ctx.fillText('{{NAME}}', W / 2, H / 2 - 150)
    ctx.font = font(500, 26)
    ctx.fillStyle = '#9aa3b5'
    ctx.fillText(`Play with ${net.maxPlayers > 2 ? `up to ${net.maxPlayers} players` : 'a friend'} online`, W / 2, H / 2 - 70)
    titleMenu.draw(ctx, font(600, 30))
    drawPrompts(ctx, input, [['a', 'Choose'], ['menu', 'Pause in game']], { size: 24 * settings.data.textScale })
  } else if (state.screen === 'settings') {
    settingsScreen.draw(ctx, { font: font(600, 28) })
    drawPrompts(ctx, input, [['left', 'Change'], ['b', 'Back']], { size: 24 * settings.data.textScale })
  } else {
    drawPlay()
    if (state.screen === 'lobby') lobby.draw(ctx, W, H)
    if (state.screen === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#eef0f5'
      ctx.font = font(700, 60)
      ctx.fillText('Paused', W / 2, H / 2 - 150)
      if (net.status === 'playing') {
        ctx.font = font(500, 24)
        ctx.fillStyle = '#9aa3b5'
        ctx.fillText('The match goes on without you until you resume', W / 2, H / 2 - 95)
      }
      pauseMenu.draw(ctx, font(600, 30))
    }
  }
  ctx.restore()
  if (debug) drawDebug()
}

/** Everyone draws net.view: the host's world, smoothed between updates. */
function drawPlay() {
  for (const [id, p] of Object.entries(net.view.players ?? {})) {
    ctx.fillStyle = COLORS[p.slot % COLORS.length]
    ctx.beginPath()
    ctx.arc(p.x, p.y, TUNING.radius, 0, Math.PI * 2)
    ctx.fill()
    if (id === net.me) {
      ctx.fillStyle = '#eef0f5'
      ctx.font = font(600, 24)
      ctx.textAlign = 'center'
      ctx.fillText('You', p.x, p.y - TUNING.radius - 18)
    }
  }
  if (state.screen === 'playing') {
    ctx.fillStyle = '#eef0f5'
    ctx.font = font(700, 32)
    ctx.textAlign = 'left'
    ctx.fillText(`${net.players.length} player${net.players.length === 1 ? '' : 's'}`, 32, 56)
    // Pause button: two bars, top-right, clear of the outermost 32px.
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath()
    ctx.roundRect(PAUSE_BUTTON.x, PAUSE_BUTTON.y, PAUSE_BUTTON.w, PAUSE_BUTTON.h, 12)
    ctx.fill()
    ctx.fillStyle = '#eef0f5'
    ctx.fillRect(PAUSE_BUTTON.x + 18, PAUSE_BUTTON.y + 16, 7, 24)
    ctx.fillRect(PAUSE_BUTTON.x + 31, PAUSE_BUTTON.y + 16, 7, 24)
    drawPrompts(ctx, input, [['menu', 'Pause']], { size: 22 * settings.data.textScale })
  }
}

/** ?debug: live state in the corner. Add whatever helps while tuning. */
function drawDebug() {
  ctx.save()
  ctx.font = '500 16px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(8, 8, 360, 96)
  ctx.fillStyle = '#9fe'
  ctx.fillText(`screen ${state.screen}  mode ${input.mode}${input.gamingMode ? ' (gaming mode)' : ''}`, 16, 16)
  ctx.fillText(`fps ${fps.toFixed(0)}  scale ${fit.scale.toFixed(2)}  dpr ${fit.dpr}`, 16, 36)
  ctx.fillText(`net ${net.status}${net.room ? ` room ${net.room}` : ''}${net.isHost ? ' (host)' : ''}  players ${net.players.length}`, 16, 56)
  ctx.fillText(`sent ${(net.stats.sentBytes / 1024).toFixed(1)} KB  received ${(net.stats.receivedBytes / 1024).toFixed(1)} KB`, 16, 76)
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
