// Star Courier: grab parcels, dodge asteroids, beat the clock.
// The sample game for this repo; it shows the conventions in AGENTS.md
// (title screen, menus for every input, pause three ways, input prompts, saved best score, 1280×800 space).
import { input } from './input.js'
import { createMenu } from './menu.js'

const canvas = document.getElementById('game')
const ctx = canvas.getContext('2d')
const W = 1280
const H = 800
const ROUND_SECONDS = 60

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
input.attach(canvas, W, H)

// Menus work with a controller, keyboard, mouse and touch (menu.js).
const titleMenu = createMenu([{ id: 'launch', label: 'Launch' }], { y: H / 2 + 140 })
const pauseMenu = createMenu(
  [
    { id: 'resume', label: 'Resume' },
    { id: 'restart', label: 'Restart' },
    { id: 'title', label: 'Quit to title' }
  ],
  { y: H / 2 + 20 }
)
const overMenu = createMenu(
  [
    { id: 'again', label: 'Play again' },
    { id: 'title', label: 'Title' }
  ],
  { y: H / 2 + 90 }
)
// Pause button for mouse and touch, top centre, clear of the score and clock.
const PAUSE_BUTTON = { x: W / 2 - 28, y: 24, w: 56, h: 56 }
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

const rand = (min, max) => min + Math.random() * (max - min)
const stars = Array.from({ length: 140 }, () => ({ x: rand(0, W), y: rand(0, H), z: rand(0.2, 1) }))

const state = {
  screen: 'title', // title | playing | paused | over
  ship: { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2 },
  parcels: [],
  rocks: [],
  sparks: [],
  score: 0,
  time: ROUND_SECONDS,
  hitFlash: 0,
  best: Number(localStorage.getItem('star-courier-best') ?? 0)
}

function reset() {
  Object.assign(state.ship, { x: W / 2, y: H / 2, vx: 0, vy: 0 })
  state.parcels = Array.from({ length: 3 }, spawnParcel)
  state.rocks = Array.from({ length: 5 }, spawnRock)
  state.sparks = []
  state.score = 0
  state.time = ROUND_SECONDS
  state.screen = 'playing'
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
  if (state.screen === 'title') {
    if (titleMenu.update(input, dt) === 'launch' || input.pressed('start')) reset()
    return
  }
  if (state.screen === 'over') {
    const choice = overMenu.update(input, dt)
    if (choice === 'again' || input.pressed('start')) reset()
    if (choice === 'title' || choice === 'back') state.screen = 'title'
    return
  }
  if (state.screen === 'paused') {
    const choice = pauseMenu.update(input, dt)
    if (choice === 'resume' || choice === 'back' || input.pressed('start')) state.screen = 'playing'
    if (choice === 'restart') reset()
    if (choice === 'title') state.screen = 'title'
    return
  }
  if (input.pressed('start') || input.pressed('b') || (input.pointer.pressed && inside(input.pointer, PAUSE_BUTTON))) {
    pauseMenu.select('resume')
    state.screen = 'paused'
    return
  }

  const ship = state.ship
  const thrust = input.held('a') || input.held('rt') ? 1500 : 900
  ship.vx = (ship.vx + input.x * thrust * dt) * Math.pow(0.12, dt)
  ship.vy = (ship.vy + input.y * thrust * dt) * Math.pow(0.12, dt)
  ship.x = Math.max(20, Math.min(W - 20, ship.x + ship.vx * dt))
  ship.y = Math.max(20, Math.min(H - 20, ship.y + ship.vy * dt))
  if (Math.hypot(ship.vx, ship.vy) > 30) ship.angle = Math.atan2(ship.vy, ship.vx)

  state.time -= dt
  if (state.time <= 0) {
    state.time = 0
    state.screen = 'over'
    overMenu.select('again')
    if (state.score > state.best) {
      state.best = state.score
      localStorage.setItem('star-courier-best', String(state.best))
    }
  }

  state.parcels = state.parcels.map((p) => {
    p.bob += dt * 3
    if (Math.hypot(p.x - ship.x, p.y - ship.y) < 40) {
      state.score += 1
      burst(p.x, p.y, '#ffb547')
      if (state.score % 4 === 0) state.rocks.push(spawnRock())
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
      state.time = Math.max(0, state.time - 5)
      state.hitFlash = 0.6
      burst(ship.x, ship.y, '#ff7a6b', 22)
      ship.vx = (ship.x - r.x) * 8
      ship.vy = (ship.y - r.y) * 8
    }
    return r
  })
  state.hitFlash = Math.max(0, state.hitFlash - dt)

  state.sparks = state.sparks.filter((s) => (s.life -= dt) > 0)
  for (const s of state.sparks) {
    s.x += s.vx * dt
    s.y += s.vy * dt
  }
}

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
  ctx.fillStyle = '#0b1024'
  ctx.fillRect(0, 0, W, H)
  for (const s of stars) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 + s.z * 0.6})`
    ctx.fillRect(s.x, s.y, s.z * 2.5, s.z * 2.5)
  }

  if (state.screen !== 'title') {
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
    ctx.font = '700 32px system-ui, sans-serif'
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
    }
  }

  ctx.textAlign = 'center'
  if (state.screen === 'title') {
    drawShip(W / 2, H / 2 - 150, -Math.PI / 2, 3)
    ctx.fillStyle = '#eef0f5'
    ctx.font = '800 88px system-ui, sans-serif'
    ctx.fillText('Star Courier', W / 2, H / 2 + 40)
    ctx.font = '500 28px system-ui, sans-serif'
    ctx.fillStyle = '#c9cfdb'
    ctx.fillText('Grab parcels. Dodge rocks. 60 seconds on the clock.', W / 2, H / 2 + 100)
    titleMenu.draw(ctx)
    ctx.font = '500 24px system-ui, sans-serif'
    ctx.fillStyle = '#9aa3b5'
    ctx.fillText(`Press ${input.label('a')} to launch${state.best ? ` · Best: ${state.best} parcels` : ''}`, W / 2, H / 2 + 250)
  } else if (state.screen === 'paused' || state.screen === 'over') {
    ctx.fillStyle = 'rgba(5,7,15,0.7)'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#eef0f5'
    ctx.font = '800 72px system-ui, sans-serif'
    if (state.screen === 'paused') {
      ctx.fillText('Paused', W / 2, H / 2 - 70)
      pauseMenu.draw(ctx)
    } else {
      ctx.fillText(`${state.score} parcels delivered`, W / 2, H / 2 - 70)
      ctx.font = '500 28px system-ui, sans-serif'
      ctx.fillStyle = '#c9cfdb'
      ctx.fillText(`Best ${state.best}`, W / 2, H / 2 + 10)
      overMenu.draw(ctx)
    }
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
