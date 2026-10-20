// Bumper Ring: online sumo. The host's copy runs the physics and rules (hostUpdate) and writes
// net.state; every copy sends its controls and draws net.view, with local sound and sparks.
import { input } from './input.js'
import { createLobby } from './lobby.js'
import { createNet } from './net.js'

const TUNING = {
  radius: 30,
  accel: 1500,
  maxSpeed: 360,
  friction: 2.4, // velocity decay per second
  dashSpeed: 920,
  dashTime: 0.2,
  dashCooldown: 1.1,
  dashMass: 2.2, // a dashing puck hits this much harder
  restitution: 0.95,
  bumpLoud: 500, // relative speed of a big hit
  ringStart: 290,
  ringMin: 130,
  shrinkDelay: 15,
  shrinkRate: 9,
  spawnRadius: 160,
  countdown: 3,
  roundOverTime: 2.6,
  pointsToWin: 3,
  maxSparks: 240
}
const COLORS = ['#ffb547', '#5ad1ff', '#ff6b8a', '#7dff8a']
const CENTER = { x: 640, y: 412 }
const SAVE_KEY = 'bumper-ring-save-v1'

const canvas = document.getElementById('game')
const ctx = canvas.getContext('2d')
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

// --- Saves and settings ---
const save = (() => {
  try {
    return { sound: true, shake: true, wins: 0, ...JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}') }
  } catch {
    return { sound: true, shake: true, wins: 0 }
  }
})()
const persist = () => localStorage.setItem(SAVE_KEY, JSON.stringify(save))

// --- Audio (generated) ---
let audio = null
function tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0 } = {}) {
  if (!save.sound) return
  audio ??= new AudioContext()
  if (audio.state === 'suspended') void audio.resume()
  const t = audio.currentTime + delay
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur)
  gain.gain.setValueAtTime(vol, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
  osc.connect(gain).connect(audio.destination)
  osc.start(t)
  osc.stop(t + dur)
}
const sfx = {
  move: () => tone(520, 0.05, { type: 'square', vol: 0.05 }),
  dash: () => tone(300, 0.18, { type: 'sawtooth', vol: 0.08, slide: 500 }),
  bump: (power) => {
    tone(90 + power * 60, 0.18, { type: 'triangle', vol: 0.15 + power * 0.25, slide: -60 })
    tone(1400, 0.04, { type: 'square', vol: 0.03 + power * 0.05 })
  },
  fall: () => tone(700, 0.6, { type: 'sine', vol: 0.15, slide: -600 }),
  count: (n) => tone(n > 0 ? 440 : 880, n > 0 ? 0.12 : 0.3, { type: 'square', vol: 0.08 }),
  round: () => [523, 659, 784].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.12, delay: i * 0.1 })),
  match: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'square', vol: 0.08, delay: i * 0.13 }))
}
const BASS = [110, 110, 165, 147, 110, 110, 131, 147]
let beat = 0
let nextBeat = 0
function music(now) {
  if (screen !== 'playing' && screen !== 'menu') return
  if (now < nextBeat) return
  nextBeat = now + 220
  tone(BASS[beat++ % BASS.length], 0.18, { type: 'triangle', vol: 0.05 })
}

// --- Juice (local to each copy) ---
const sparks = []
let shake = 0
function burst(x, y, color, count, speed) {
  for (let i = 0; i < count && sparks.length < TUNING.maxSparks; i++) {
    const a = Math.random() * Math.PI * 2
    const s = speed * (0.3 + Math.random() * 0.7)
    sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, color })
  }
}
function rumble(strength, ms) {
  for (const pad of navigator.getGamepads?.() ?? []) {
    pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength })?.catch?.(() => {})
  }
}

// --- Online ---
const net = createNet({ minPlayers: 2, maxPlayers: 4 })
const lobby = createLobby(net, input, { title: 'Bumper Ring', accent: '#ffb547' })
let screen = 'title' // title | lobby | playing | menu
let myDashAt = -1e9

net.on('end', () => (screen = 'lobby'))
net.on('disconnect', () => {
  if (screen !== 'title') screen = 'lobby'
})
net.on('event', ({ name, data }) => {
  if (name === 'bump') {
    sfx.bump(data.p)
    burst(data.x, data.y, '#ffffff', Math.round(8 + data.p * 22), 200 + data.p * 300)
    if (save.shake) shake = Math.max(shake, 4 + data.p * 12)
    if (data.ids.includes(net.me)) rumble(0.3 + data.p * 0.7, 120)
  } else if (name === 'fall') {
    sfx.fall()
    burst(data.x, data.y, COLORS[data.slot % COLORS.length], 30, 260)
    if (data.id === net.me) rumble(1, 300)
  } else if (name === 'count') sfx.count(data.n)
  else if (name === 'round') sfx.round()
  else if (name === 'match') {
    sfx.match()
    if (data.winner === net.me) {
      save.wins++
      persist()
    }
  }
})

// --- Host: the rules ---
const sim = { pucks: {}, t: 0, ring: TUNING.ringStart, fightTime: 0, dashWas: {} }

function spawnRound() {
  const s = net.state
  const ids = net.players
  s.pucks = {}
  sim.pucks = {}
  ids.forEach((id, i) => {
    const a = -Math.PI / 2 + (i / ids.length) * Math.PI * 2
    s.pucks[id] = { x: CENTER.x + Math.cos(a) * TUNING.spawnRadius, y: CENTER.y + Math.sin(a) * TUNING.spawnRadius, slot: net.slot(id), alive: true, dash: false }
    sim.pucks[id] = { vx: 0, vy: 0, dashT: 0, cool: 0 }
  })
  sim.ring = TUNING.ringStart
  sim.fightTime = 0
  sim.t = TUNING.countdown
  s.ring = sim.ring
  s.phase = 'countdown'
  s.count = TUNING.countdown
  s.roundWinner = null
  net.event('count', { n: s.count })
}

function newMatch() {
  const s = net.state
  s.scores = Object.fromEntries(net.players.map((id) => [id, 0]))
  s.winner = null
  s.first = true
  spawnRound()
}

function hostUpdate(dt) {
  const s = net.state
  if (!s.phase) newMatch()

  // Players who left drop out of the match.
  for (const id of Object.keys(s.pucks)) if (!net.players.includes(id)) delete s.pucks[id]
  for (const id of Object.keys(s.scores)) if (!net.players.includes(id)) delete s.scores[id]
  if (net.players.length < 2 && s.phase !== 'match') {
    s.phase = 'match'
    s.winner = null
    s.alone = true
  }

  if (s.phase === 'countdown') {
    sim.t -= dt
    const n = Math.max(0, Math.ceil(sim.t))
    if (n !== s.count) {
      s.count = n
      net.event('count', { n })
    }
    if (sim.t <= 0) s.phase = 'fight'
  } else if (s.phase === 'fight') {
    physics(dt)
    sim.fightTime += dt
    if (sim.fightTime > TUNING.shrinkDelay) sim.ring = Math.max(TUNING.ringMin, sim.ring - TUNING.shrinkRate * dt)
    s.ring = Math.round(sim.ring)
    const alive = Object.entries(s.pucks).filter(([, p]) => p.alive)
    if (alive.length <= 1) {
      const winner = alive[0]?.[0] ?? null
      if (winner) s.scores[winner] = (s.scores[winner] ?? 0) + 1
      s.roundWinner = winner
      s.first = false
      if (winner && s.scores[winner] >= TUNING.pointsToWin) {
        s.phase = 'match'
        s.winner = winner
        net.event('match', { winner })
      } else {
        s.phase = 'round'
        sim.t = TUNING.roundOverTime
        net.event('round', { winner })
      }
    }
  } else if (s.phase === 'round') {
    physics(dt)
    sim.t -= dt
    if (sim.t <= 0) spawnRound()
  } else if (s.phase === 'match') {
    if (input.pressed('a') && screen === 'playing' && net.players.length >= 2) {
      s.alone = false
      newMatch()
    }
  }
}

function physics(dt) {
  const s = net.state
  const ids = Object.keys(s.pucks).filter((id) => s.pucks[id].alive)
  for (const id of ids) {
    const p = s.pucks[id]
    const m = sim.pucks[id]
    const i = s.phase === 'fight' ? net.inputs[id] ?? {} : {}
    const ix = Number(i.x) || 0
    const iy = Number(i.y) || 0
    m.cool = Math.max(0, m.cool - dt)
    m.dashT = Math.max(0, m.dashT - dt)
    // Dash on the press, not the hold.
    if (i.dash && !sim.dashWas[id] && m.cool <= 0) {
      const len = Math.hypot(ix, iy)
      const vl = Math.hypot(m.vx, m.vy)
      const [dx, dy] = len > 0.2 ? [ix / len, iy / len] : vl > 1 ? [m.vx / vl, m.vy / vl] : [0, -1]
      m.vx = dx * TUNING.dashSpeed
      m.vy = dy * TUNING.dashSpeed
      m.dashT = TUNING.dashTime
      m.cool = TUNING.dashCooldown
    }
    sim.dashWas[id] = Boolean(i.dash)
    m.vx += ix * TUNING.accel * dt
    m.vy += iy * TUNING.accel * dt
    const speed = Math.hypot(m.vx, m.vy)
    if (m.dashT <= 0 && speed > TUNING.maxSpeed) {
      m.vx *= TUNING.maxSpeed / speed
      m.vy *= TUNING.maxSpeed / speed
    }
    const decay = Math.exp(-TUNING.friction * dt)
    m.vx *= decay
    m.vy *= decay
    p.x += m.vx * dt
    p.y += m.vy * dt
    p.dash = m.dashT > 0
  }

  // Puck-to-puck: push apart and bounce, dashing pucks heavier.
  for (let a = 0; a < ids.length; a++) {
    for (let b = a + 1; b < ids.length; b++) {
      const pa = s.pucks[ids[a]]
      const pb = s.pucks[ids[b]]
      const ma = sim.pucks[ids[a]]
      const mb = sim.pucks[ids[b]]
      const dx = pb.x - pa.x
      const dy = pb.y - pa.y
      const dist = Math.hypot(dx, dy) || 0.01
      const overlap = TUNING.radius * 2 - dist
      if (overlap <= 0) continue
      const nx = dx / dist
      const ny = dy / dist
      const wa = ma.dashT > 0 ? TUNING.dashMass : 1
      const wb = mb.dashT > 0 ? TUNING.dashMass : 1
      pa.x -= nx * overlap * (wb / (wa + wb))
      pa.y -= ny * overlap * (wb / (wa + wb))
      pb.x += nx * overlap * (wa / (wa + wb))
      pb.y += ny * overlap * (wa / (wa + wb))
      const rel = (ma.vx - mb.vx) * nx + (ma.vy - mb.vy) * ny
      if (rel <= 0) continue
      const j = ((1 + TUNING.restitution) * rel) / (1 / wa + 1 / wb)
      ma.vx -= (j / wa) * nx
      ma.vy -= (j / wa) * ny
      mb.vx += (j / wb) * nx
      mb.vy += (j / wb) * ny
      if (rel > 60) net.event('bump', { x: Math.round(pa.x + nx * TUNING.radius), y: Math.round(pa.y + ny * TUNING.radius), p: Math.min(1, rel / TUNING.bumpLoud), ids: [ids[a], ids[b]] })
    }
  }

  // Off the edge: the puck's centre leaves the ring. Once a round is decided, nobody falls.
  if (s.phase !== 'fight') return
  for (const id of ids) {
    const p = s.pucks[id]
    if (Math.hypot(p.x - CENTER.x, p.y - CENTER.y) > sim.ring + TUNING.radius * 0.35) {
      p.alive = false
      p.dash = false
      net.event('fall', { id, slot: p.slot, x: Math.round(p.x), y: Math.round(p.y) })
    }
  }
}

// --- Frame ---
function update(dt, now) {
  if (screen === 'title') {
    if (input.pressed('a') || input.pressed('start')) {
      sfx.move()
      lobby.open()
      screen = 'lobby'
    }
    if (input.pressed('y')) {
      save.sound = !save.sound
      persist()
      sfx.move()
    }
    if (input.pressed('x')) {
      save.shake = !save.shake
      persist()
      sfx.move()
    }
  } else if (screen === 'lobby') {
    if (input.pressed('up') || input.pressed('down')) sfx.move()
    const result = lobby.update()
    if (result === 'start') {
      screen = 'playing'
      sparks.length = 0
    }
    if (result === 'back') screen = 'title'
  } else if (screen === 'playing') {
    const dash = input.held('a')
    net.setInput({ x: input.x, y: input.y, dash })
    // Your own dash sounds the moment you press, before the host confirms it.
    const v = net.view
    if (input.pressed('a') && v.phase === 'fight' && v.pucks?.[net.me]?.alive && now - myDashAt > TUNING.dashCooldown * 1000) {
      myDashAt = now
      sfx.dash()
    }
    if (input.pressed('start')) screen = 'menu'
    if (v.phase === 'match' && input.pressed('b')) {
      net.leave()
      lobby.open()
      screen = 'lobby'
    }
  } else if (screen === 'menu') {
    net.setInput({})
    if (input.pressed('start') || input.pressed('a')) screen = 'playing'
    if (input.pressed('b')) {
      net.leave()
      lobby.open()
      screen = 'lobby'
    }
  }
  if (net.isHost && (screen === 'playing' || screen === 'menu')) hostUpdate(dt)
  net.update(now)

  for (const s of sparks) {
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.vx *= 0.92
    s.vy *= 0.92
    s.life -= dt
  }
  for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1)
  shake = Math.max(0, shake - dt * 40)
}

// --- Drawing ---
function text(s, x, y, size, color = '#eef0f5', weight = 700, align = 'center') {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.fillText(s, x, y)
}

function drawArena(ring) {
  ctx.fillStyle = '#1b2442'
  ctx.beginPath()
  ctx.arc(CENTER.x, CENTER.y, ring, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90, 209, 255, 0.12)'
  ctx.lineWidth = 2
  for (let r = 60; r < ring; r += 60) {
    ctx.beginPath()
    ctx.arc(CENTER.x, CENTER.y, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  const danger = ring < TUNING.ringStart - 1
  ctx.strokeStyle = danger ? '#ff6b8a' : '#5ad1ff'
  ctx.shadowColor = ctx.strokeStyle
  ctx.shadowBlur = 18
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(CENTER.x, CENTER.y, ring, 0, Math.PI * 2)
  ctx.stroke()
  ctx.shadowBlur = 0
}

function drawPuck(id, p, now) {
  const color = COLORS[p.slot % COLORS.length]
  const r = TUNING.radius
  if (p.dash) {
    ctx.fillStyle = color + '55'
    ctx.beginPath()
    ctx.arc(p.x, p.y, r * 1.35, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#0d1222'
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.arc(p.x, p.y, r - 4, 0, Math.PI * 2)
  ctx.stroke()
  text(String(p.slot + 1), p.x, p.y + 10, 28, color, 800)
  if (id === net.me) {
    text('You', p.x, p.y - r - 14, 24, '#eef0f5', 700)
    // Dash cooldown: an arc that fills back up.
    const ready = Math.min(1, (now - myDashAt) / (TUNING.dashCooldown * 1000))
    if (ready < 1) {
      ctx.strokeStyle = '#eef0f5'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(p.x, p.y, r + 8, -Math.PI / 2, -Math.PI / 2 + ready * Math.PI * 2)
      ctx.stroke()
    }
  }
}

const label = (id) => (id === net.me ? 'You' : `Player ${net.slot(id) + 1}`)

function drawHud(v) {
  // Scores along the top, inside the safe margin.
  const ids = Object.keys(v.scores ?? {})
  const step = 230
  ids.forEach((id, i) => {
    const x = W / 2 - ((ids.length - 1) * step) / 2 + i * step
    const slot = net.slot(id)
    const color = COLORS[Math.max(0, slot) % COLORS.length]
    text(`${label(id)}`, x, 64, 24, color, 700)
    for (let k = 0; k < TUNING.pointsToWin; k++) {
      ctx.fillStyle = k < v.scores[id] ? color : 'rgba(238,240,245,0.18)'
      ctx.beginPath()
      ctx.arc(x - 30 + k * 30, 90, 9, 0, Math.PI * 2)
      ctx.fill()
    }
  })

  if (v.phase === 'countdown') {
    text(v.count > 0 ? String(v.count) : 'GO!', CENTER.x, CENTER.y + 30, 96, '#eef0f5', 900)
    if (v.first) text(`Stick steer · ${input.label('a')} dash · knock them off the ring`, W / 2, H - 38, 26, '#9aa3b5', 600)
  } else if (v.phase === 'round') {
    const w = v.roundWinner
    text(w ? `${label(w)} ${w === net.me ? 'take' : 'takes'} the round!` : 'Nobody survived!', W / 2, H - 38, 34, w ? COLORS[net.slot(w) % COLORS.length] : '#eef0f5', 800)
  } else if (v.phase === 'match') {
    ctx.fillStyle = 'rgba(13,18,34,0.75)'
    ctx.fillRect(0, 0, W, H)
    if (v.alone) text('Everyone else left', W / 2, H / 2 - 20, 56, '#eef0f5', 900)
    else {
      const w = v.winner
      text(w === net.me ? 'You win the match!' : `${label(w)} wins the match!`, W / 2, H / 2 - 20, 64, COLORS[net.slot(w) % COLORS.length], 900)
    }
    text(`Your match wins: ${save.wins}`, W / 2, H / 2 + 40, 28, '#9aa3b5', 600)
    const hint = net.isHost && !v.alone ? `${input.label('a')} rematch · ${input.label('b')} leave` : v.alone ? `${input.label('b')} back to the lobby` : `Waiting for the host to rematch · ${input.label('b')} leave`
    text(hint, W / 2, H - 72, 26, '#eef0f5', 600)
  } else if (v.phase === 'fight' && v.ring < TUNING.ringStart - 1 && v.ring > TUNING.ringMin) {
    text('The ring is shrinking!', W / 2, H - 38, 26, '#ff6b8a', 700)
  }
  const me = v.pucks?.[net.me]
  if (v.phase === 'fight' && me && !me.alive) text("You're out. Watch the rest!", W / 2, H - 38, 26, '#9aa3b5', 600)
}

function drawTitle(now) {
  drawArena(TUNING.ringStart)
  // Two pucks orbiting and bumping, for the attract screen.
  const t = now / 1000
  const a = { x: CENTER.x + Math.cos(t) * 150, y: CENTER.y + Math.sin(t * 2) * 60, slot: 0 }
  const b = { x: CENTER.x - Math.cos(t) * 150, y: CENTER.y - Math.sin(t * 2) * 60, slot: 1 }
  drawPuck('a', a, now)
  drawPuck('b', b, now)
  ctx.fillStyle = 'rgba(13,18,34,0.55)'
  ctx.fillRect(0, 0, W, H)
  text('BUMPER RING', W / 2, 250, 104, '#ffb547', 900)
  text('Online sumo for 2–4 players', W / 2, 310, 30, '#eef0f5', 600)
  text(`Press ${input.label('a')} to play online`, W / 2, 520, 34, '#eef0f5', 700)
  text(`${input.label('y')} sound: ${save.sound ? 'on' : 'off'} · ${input.label('x')} shake: ${save.shake ? 'on' : 'off'}`, W / 2, 680, 24, '#9aa3b5', 500)
  text(`Match wins: ${save.wins}`, W / 2, 720, 24, '#9aa3b5', 500)
}

function draw(now) {
  ctx.fillStyle = '#0d1222'
  ctx.fillRect(0, 0, W, H)
  if (screen === 'title') return drawTitle(now)

  const v = net.view
  ctx.save()
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake)
  drawArena(v.ring ?? TUNING.ringStart)
  for (const [id, p] of Object.entries(v.pucks ?? {})) if (p.alive) drawPuck(id, p, now)
  for (const s of sparks) {
    ctx.globalAlpha = Math.max(0, Math.min(1, s.life * 2))
    ctx.fillStyle = s.color
    ctx.fillRect(s.x - 3, s.y - 3, 6, 6)
  }
  ctx.globalAlpha = 1
  ctx.restore()

  if (screen === 'lobby') return lobby.draw(ctx, W, H)
  drawHud(v)
  if (screen === 'menu') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, W, H)
    text('Menu', W / 2, H / 2, 56, '#eef0f5', 800)
    text(`${input.label('start')} resume · ${input.label('b')} leave the game`, W / 2, H / 2 + 60, 26, '#eef0f5', 600)
    text("The match keeps going while you're here.", W / 2, H / 2 + 110, 24, '#9aa3b5', 500)
  }
}

let last = performance.now()
function frame(now) {
  const dt = Math.min(1 / 20, (now - last) / 1000)
  last = now
  input.update()
  update(dt, now)
  music(now)
  draw(now)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
