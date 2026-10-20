// {{NAME}}: online starter. The host's copy runs the game; every player sends inputs and draws
// net.view. Replace hostUpdate() and draw() with the real game; keep the screen flow.
import { input } from './input.js'
import { createLobby } from './lobby.js'
import { createNet } from './net.js'

const TUNING = {
  speed: 420,
  radius: 24
}
const COLORS = ['#ffb547', '#5ad1ff', '#ff6b8a', '#7dff8a', '#c18cff', '#ffe066', '#ff9f43', '#9aa3b5']

const canvas = document.getElementById('game')
const ctx = canvas.getContext('2d')

// Draw in a fixed 1280×800 space (the Steam Deck screen) and scale to fit any window.
const W = 1280
const H = 800
function resize() {
  const scale = Math.min(innerWidth / W, innerHeight / H)
  canvas.width = Math.round(W * scale * devicePixelRatio)
  canvas.height = Math.round(H * scale * devicePixelRatio)
  canvas.style.width = `${W * scale}px`
  canvas.style.height = `${H * scale}px`
  canvas.style.margin = `${(innerHeight - H * scale) / 2}px auto`
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0)
}
addEventListener('resize', resize)
resize()

const net = createNet({ minPlayers: {{MIN_PLAYERS}}, maxPlayers: {{MAX_PLAYERS}} })
const lobby = createLobby(net, input, { title: '{{NAME}}' })
let screen = 'title' // title | lobby | playing | menu

// The host left or the connection dropped: back to the lobby, which shows why.
net.on('end', () => (screen = 'lobby'))
net.on('disconnect', () => {
  if (screen !== 'title') screen = 'lobby'
})

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
  if (screen === 'title') {
    if (input.pressed('a') || input.pressed('start')) {
      lobby.open()
      screen = 'lobby'
    }
  } else if (screen === 'lobby') {
    const result = lobby.update()
    if (result === 'start') screen = 'playing'
    if (result === 'back') screen = 'title'
  } else if (screen === 'playing') {
    net.setInput({ x: input.x, y: input.y })
    if (input.pressed('start')) screen = 'menu'
  } else if (screen === 'menu') {
    // Online games can't pause the world; the menu just stops your controls.
    net.setInput({})
    if (input.pressed('start') || input.pressed('a')) screen = 'playing'
    if (input.pressed('b')) {
      net.leave()
      lobby.open()
      screen = 'lobby'
    }
  }
  if (net.isHost && (screen === 'playing' || screen === 'menu')) hostUpdate(dt)
  net.update()
}

function draw() {
  ctx.fillStyle = '#141a2a'
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'

  if (screen === 'title') {
    ctx.fillStyle = '#eef0f5'
    ctx.font = '700 72px system-ui, sans-serif'
    ctx.fillText('{{NAME}}', W / 2, H / 2 - 80)
    ctx.font = '500 28px system-ui, sans-serif'
    ctx.fillText(`Press ${input.label('a')} to play online`, W / 2, H / 2 + 120)
    return
  }

  for (const [id, p] of Object.entries(net.view.players ?? {})) {
    ctx.fillStyle = COLORS[p.slot % COLORS.length]
    ctx.beginPath()
    ctx.arc(p.x, p.y, TUNING.radius, 0, Math.PI * 2)
    ctx.fill()
    if (id === net.me) {
      ctx.fillStyle = '#eef0f5'
      ctx.font = '600 24px system-ui, sans-serif'
      ctx.fillText('You', p.x, p.y - TUNING.radius - 12)
    }
  }

  if (screen === 'lobby') lobby.draw(ctx, W, H)
  if (screen === 'menu') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#eef0f5'
    ctx.font = '700 56px system-ui, sans-serif'
    ctx.fillText('Menu', W / 2, H / 2)
    ctx.font = '500 24px system-ui, sans-serif'
    ctx.fillText(`${input.label('start')} resume · ${input.label('b')} leave the game`, W / 2, H / 2 + 60)
  }
}

let last = performance.now()
function frame(now) {
  const dt = Math.min(1 / 20, (now - last) / 1000)
  last = now
  input.update()
  update(dt)
  draw()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
