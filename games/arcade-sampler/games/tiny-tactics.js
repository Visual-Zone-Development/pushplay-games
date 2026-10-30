// Tiny Tactics: a turn-based duel on a 6×6 board against a CPU. Three battles in a row, each on a
// fresh layout mirrored for fairness. Style: a parchment board game (aged paper, ink outlines, a
// wooden frame, painted tokens). The rules at the top are pure (no drawing), so a node script can
// play CPU-vs-CPU matches with them: import { RULES } from './tiny-tactics.js'.
import { W, H, TAU, clamp, lerp, rand, label, createFx } from '../common.js'

const TUNING = {
  size: 6,
  battles: 3,
  turnLimit: 10, // full rounds; then the side with more HP left wins (ties go to you)
  units: {
    knight: { name: 'Knight', hp: 7, move: 2, min: 1, max: 1, atk: 3, role: 'Sturdy. Strikes a foe next to it.' },
    archer: { name: 'Archer', hp: 4, move: 2, min: 2, max: 3, atk: 2, role: 'Shoots 2–3 tiles. Not up close.' },
    healer: { name: 'Healer', hp: 4, move: 3, min: 1, max: 1, atk: 1, heal: 2, healMax: 2, role: 'Heals an ally 2 tiles away.' }
  },
  shrineBonus: 1,
  obstaclesPerHalf: [2, 3], // min, max (mirrored onto the other half)
  score: { kill: 40, win: 200, hp: 20, flawless: 60 },
  // CPU per battle: noise = random slack added to each move's score; danger = how much it avoids threatened tiles
  cpu: [
    { noise: 40, danger: 1 },
    { noise: 20, danger: 2 },
    { noise: 6, danger: 3.5 }
  ],
  pace: { think: 0.4, step: 0.13, melee: 0.34, arrow: 0.34, heal: 0.45, after: 0.28, banner: 1 }
}

// ---- rules (pure) ------------------------------------------------------------------------------

const N = TUNING.size
const FLOOR = 0
const ROCK = 1
const TREE = 2
const SHRINE = 3
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const KINDS = ['knight', 'archer', 'healer']
const VALUE = { knight: 1, archer: 1.25, healer: 1.35 }
const key = (x, y) => y * N + x
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
const S = (u) => TUNING.units[u.kind]
const other = (side) => (side === 'blue' ? 'red' : 'blue')
const alive = (b, side) => b.units.filter((u) => u.hp > 0 && (!side || u.side === side))
const unitAt = (b, x, y) => b.units.find((u) => u.hp > 0 && u.x === x && u.y === y)
const blocked = (b, x, y) => b.tiles[key(x, y)] === ROCK || b.tiles[key(x, y)] === TREE
const inBoard = (x, y) => x >= 0 && y >= 0 && x < N && y < N

/** A fresh battle: obstacles in rows 1–2 mirrored by a half-turn onto rows 4–3, one shrine per side. */
function newBattle(rng = Math.random) {
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1))
  for (let tries = 0; tries < 200; tries++) {
    const tiles = new Array(N * N).fill(FLOOR)
    const mirror = (x, y, t) => ((tiles[key(x, y)] = t), (tiles[key(N - 1 - x, N - 1 - y)] = t))
    // blue: knight a step ahead in row 4, archer and healer on the back row
    const kx = ri(1, 4)
    const back = [0, 1, 2, 3, 4, 5].filter((c) => Math.abs(c - kx) <= 3)
    const ax = back.splice(Math.floor(rng() * back.length), 1)[0]
    const hx = back[Math.floor(rng() * back.length)]
    const spots = [{ kind: 'knight', x: kx, y: 4 }, { kind: 'archer', x: ax, y: 5 }, { kind: 'healer', x: hx, y: 5 }]
    const reserved = new Set()
    for (const s of spots) (reserved.add(key(s.x, s.y)), reserved.add(key(N - 1 - s.x, N - 1 - s.y)))
    const count = ri(...TUNING.obstaclesPerHalf)
    let placed = 0
    for (let i = 0; i < 40 && placed < count; i++) {
      const x = ri(0, N - 1)
      const y = ri(1, 2)
      if (tiles[key(x, y)] !== FLOOR || reserved.has(key(x, y)) || reserved.has(key(N - 1 - x, N - 1 - y))) continue
      mirror(x, y, rng() < 0.5 ? ROCK : TREE)
      placed++
    }
    const free = [0, 1, 2, 3, 4, 5].filter((x) => tiles[key(x, 3)] === FLOOR && !reserved.has(key(x, 3)) && tiles[key(N - 1 - x, 2)] === FLOOR)
    if (!free.length) continue
    const sx = free[Math.floor(rng() * free.length)]
    mirror(sx, 3, SHRINE)
    // every open tile must be reachable from every other
    const open = tiles.map((t, i) => (t === ROCK || t === TREE ? -1 : i)).filter((i) => i >= 0)
    const seen = new Set([open[0]])
    const q = [open[0]]
    while (q.length) {
      const i = q.shift()
      for (const [dx, dy] of DIRS) {
        const x = (i % N) + dx
        const y = Math.floor(i / N) + dy
        if (!inBoard(x, y) || seen.has(key(x, y)) || tiles[key(x, y)] === ROCK || tiles[key(x, y)] === TREE) continue
        seen.add(key(x, y))
        q.push(key(x, y))
      }
    }
    if (seen.size !== open.length) continue
    const units = []
    let id = 0
    for (const s of spots) {
      units.push({ id: id++, side: 'blue', kind: s.kind, x: s.x, y: s.y, hp: TUNING.units[s.kind].hp, acted: false })
      units.push({ id: id++, side: 'red', kind: s.kind, x: N - 1 - s.x, y: N - 1 - s.y, hp: TUNING.units[s.kind].hp, acted: false })
    }
    return { tiles, units }
  }
  throw new Error('no layout')
}

/** Tiles a unit can end its move on: Map key → { x, y, d, prev }. Allies can be passed, foes block. */
function reach(b, u) {
  const start = { x: u.x, y: u.y, d: 0, prev: null }
  const seen = new Map([[key(u.x, u.y), start]])
  const q = [start]
  const move = S(u).move
  while (q.length) {
    const c = q.shift()
    if (c.d >= move) continue
    for (const [dx, dy] of DIRS) {
      const x = c.x + dx
      const y = c.y + dy
      if (!inBoard(x, y) || blocked(b, x, y) || seen.has(key(x, y))) continue
      const o = unitAt(b, x, y)
      if (o && o.side !== u.side) continue
      const n = { x, y, d: c.d + 1, prev: c }
      seen.set(key(x, y), n)
      q.push(n)
    }
  }
  for (const [k, n] of seen) {
    const o = unitAt(b, n.x, n.y)
    if (o && o !== u) seen.delete(k)
  }
  return seen
}
const pathOf = (node) => {
  const p = []
  for (let n = node; n; n = n.prev) p.unshift({ x: n.x, y: n.y })
  return p
}
const attackAt = (b, u, x, y) => S(u).atk + (b.tiles[key(x, y)] === SHRINE ? TUNING.shrineBonus : 0)

/** What a unit standing on (x, y) could do: attacks on foes in range, heals on hurt allies. */
function targetsFrom(b, u, x, y) {
  const s = S(u)
  const out = []
  for (const t of b.units) {
    if (t.hp <= 0 || t === u) continue
    const d = Math.abs(t.x - x) + Math.abs(t.y - y)
    if (t.side !== u.side) {
      if (d >= s.min && d <= s.max) {
        const raw = attackAt(b, u, x, y)
        out.push({ type: 'attack', t, raw, amt: Math.min(t.hp, raw), kill: raw >= t.hp })
      }
    } else if (s.heal && d >= 1 && d <= s.healMax && t.hp < S(t).hp) out.push({ type: 'heal', t, amt: Math.min(s.heal, S(t).hp - t.hp) })
  }
  return out
}

/** Apply an attack or heal. */
function resolve(act) {
  if (act.type === 'attack') act.t.hp = Math.max(0, act.t.hp - act.raw)
  if (act.type === 'heal') act.t.hp = Math.min(S(act.t).hp, act.t.hp + act.amt)
}

/** Damage the other side could deal to each tile next turn (for the side being threatened). */
function threatMap(b, side) {
  const m = new Float32Array(N * N)
  for (const e of alive(b, other(side))) {
    const s = S(e)
    const hit = new Set()
    for (const n of reach(b, e).values())
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const d = Math.abs(x - n.x) + Math.abs(y - n.y)
          if (d >= s.min && d <= s.max) hit.add(key(x, y))
        }
    for (const k of hit) m[k] += s.atk
  }
  return m
}

/** Walking distance (around rocks and trees) from one tile to every tile. */
function distField(b, from) {
  const d = new Array(N * N).fill(99)
  d[key(from.x, from.y)] = 0
  const q = [from]
  while (q.length) {
    const c = q.shift()
    for (const [dx, dy] of DIRS) {
      const x = c.x + dx
      const y = c.y + dy
      if (!inBoard(x, y) || blocked(b, x, y) || d[key(x, y)] < 99) continue
      d[key(x, y)] = d[key(c.x, c.y)] + 1
      q.push({ x, y })
    }
  }
  return d
}

function positionScore(b, u, threat, foes, ai, fields) {
  const danger = threat[key(u.x, u.y)]
  // the longer a battle runs, the bolder everyone gets (no endless stand-offs)
  const bold = Math.min(1, (b.turn ?? 1) / 8)
  const care = (u.kind === 'knight' ? 0.3 : 1) * (1 - bold * 0.7)
  let s = -danger * ai.danger * care
  if (danger >= u.hp) s -= ai.danger * 4 * VALUE[u.kind]
  let near = Infinity
  let goal = Infinity
  foes.forEach((f, i) => {
    near = Math.min(near, dist(u, f))
    goal = Math.min(goal, fields[i][key(u.x, u.y)] + f.hp * 0.35 - VALUE[f.kind]) // prefer weak, valuable foes
  })
  if (u.kind === 'archer') s -= Math.abs(near - 3) * 2 + (near <= 1 ? 5 : 0)
  else if (u.kind === 'healer') {
    const friends = alive(b, u.side).filter((a) => a !== u)
    let hurt = null
    for (const a of friends) if (!hurt || a.hp / S(a).hp < hurt.hp / S(hurt).hp) hurt = a
    if (hurt) s -= Math.max(0, dist(u, hurt) - 1) * 1.6
    s -= Math.abs(near - 3) * 0.8
  } else s -= goal * (3 + bold * 2)
  if (u.kind !== 'knight') s -= near * bold * 1.5
  if (b.tiles[key(u.x, u.y)] === SHRINE && u.kind !== 'healer') s += 2.5
  return s
}

function actionScore(threat, act) {
  if (act.type === 'attack') return act.kill ? 45 + 25 * VALUE[act.t.kind] : act.amt * 7 * VALUE[act.t.kind]
  if (act.type === 'heal') return act.amt * 8 * (threat[key(act.t.x, act.t.y)] > 0 ? 1.4 : 1)
  return 0
}

/** The CPU's (or a bot's) best next action for one of its unacted units, or null. */
function plan(b, side, ai = TUNING.cpu[1], rng = Math.random) {
  const foes = alive(b, other(side))
  if (!foes.length) return null
  const threat = threatMap(b, side)
  const fields = foes.map((f) => distField(b, f))
  let best = null
  for (const u of alive(b, side)) {
    if (u.acted) continue
    const ox = u.x
    const oy = u.y
    for (const n of reach(b, u).values()) {
      u.x = n.x
      u.y = n.y
      const pos = positionScore(b, u, threat, foes, ai, fields)
      for (const act of [{ type: 'wait' }, ...targetsFrom(b, u, n.x, n.y)]) {
        const s = pos + actionScore(threat, act) + rng() * ai.noise
        if (!best || s > best.s) best = { s, u, node: n, act }
      }
    }
    u.x = ox
    u.y = oy
  }
  return best
}

/** 'blue' | 'red' | null */
function winner(b) {
  if (!alive(b, 'red').length) return 'blue'
  if (!alive(b, 'blue').length) return 'red'
  return null
}
const hpOf = (b, side) => alive(b, side).reduce((a, u) => a + u.hp, 0)

function battlePoints(b, won) {
  const P = TUNING.score
  const kills = b.units.filter((u) => u.side === 'red' && u.hp <= 0).length
  const lost = b.units.filter((u) => u.side === 'blue' && u.hp <= 0).length
  const hp = hpOf(b, 'blue')
  const rows = [['Foes defeated', kills, kills * P.kill]]
  if (won) {
    rows.push(['Victory', '', P.win], ['HP left', hp, hp * P.hp])
    if (!lost) rows.push(['Flawless', '', P.flawless])
  }
  return { rows, total: rows.reduce((a, r) => a + r[2], 0), kills, lost }
}

export const RULES = { TUNING, newBattle, reach, pathOf, targetsFrom, resolve, plan, winner, hpOf, battlePoints, alive }

// ---- art ---------------------------------------------------------------------------------------

const C = {
  paper: '#e8d5ab',
  paperDark: '#d2b98a',
  ink: '#2b1d14',
  inkSoft: 'rgba(43,29,20,0.55)',
  wood: '#7a4a24',
  woodDark: '#4e2c14',
  woodLight: '#a26a38',
  blue: '#2f5f9e',
  blueLight: '#5d8fd0',
  red: '#b13a2c',
  redLight: '#df6a52',
  cream: '#f6ead0',
  gold: '#c99a2e',
  goldLight: '#f1cd62',
  green: '#4f7d32',
  greenLight: '#7fae4c',
  heal: '#3d9a55',
  rock: '#8d8676',
  rockDark: '#5f594d'
}
const TEAM = { blue: [C.blue, C.blueLight], red: [C.red, C.redLight] }

// Layout: the board on the left, the info panel on the right, the bottom 50 px a dark table edge.
const TS = 96
const BX = 92
const BY = 136
const PANEL = { x: 726, y: 136, w: 494, h: 576 }

function seeded(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** Paper, table edge and the wooden board frame, baked once at 2× (they never change). */
function bakeBackground() {
  const c = document.createElement('canvas')
  c.width = W * 2
  c.height = H * 2
  const g = c.getContext('2d')
  g.scale(2, 2)
  const r = seeded(7)
  g.fillStyle = C.paper
  g.fillRect(0, 0, W, H)
  // stains and blotches
  for (let i = 0; i < 46; i++) {
    const x = r() * W
    const y = r() * H
    const rad = 40 + r() * 180
    const gr = g.createRadialGradient(x, y, 0, x, y, rad)
    const a = 0.03 + r() * 0.06
    gr.addColorStop(0, r() < 0.5 ? `rgba(150,105,50,${a})` : `rgba(255,248,225,${a * 1.4})`)
    gr.addColorStop(1, 'rgba(150,105,50,0)')
    g.fillStyle = gr
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  // fibres and speckles
  g.lineCap = 'round'
  for (let i = 0; i < 700; i++) {
    const x = r() * W
    const y = r() * H
    const a = r() * TAU
    const l = 4 + r() * 16
    g.strokeStyle = `rgba(110,75,35,${0.04 + r() * 0.07})`
    g.lineWidth = 0.6 + r() * 0.8
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + r() * 3, y + Math.sin(a) * l * 0.5 + r() * 3, x + Math.cos(a) * l, y + Math.sin(a) * l)
    g.stroke()
  }
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = `rgba(90,60,30,${0.05 + r() * 0.14})`
    g.fillRect(r() * W, r() * H, 0.6 + r() * 1.4, 0.6 + r() * 1.4)
  }
  // burnt edges
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95)
  v.addColorStop(0, 'rgba(120,70,25,0)')
  v.addColorStop(1, 'rgba(110,60,20,0.42)')
  g.fillStyle = v
  g.fillRect(0, 0, W, H)
  // table edge along the bottom, under the prompt legend
  const te = g.createLinearGradient(0, H - 52, 0, H)
  te.addColorStop(0, '#3b2210')
  te.addColorStop(1, '#24140a')
  g.fillStyle = te
  g.fillRect(0, H - 52, W, 52)
  g.fillStyle = 'rgba(255,220,170,0.18)'
  g.fillRect(0, H - 52, W, 2)
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(0,0,0,${0.12 + r() * 0.15})`
    g.lineWidth = 1
    const y = H - 48 + r() * 46
    g.beginPath()
    g.moveTo(0, y)
    g.bezierCurveTo(W * 0.3, y + r() * 4 - 2, W * 0.7, y + r() * 4 - 2, W, y + r() * 2)
    g.stroke()
  }
  // the board's wooden frame
  const fx = BX - 22
  const fy = BY - 22
  const fw = N * TS + 44
  g.fillStyle = 'rgba(60,30,10,0.35)'
  g.beginPath()
  g.roundRect(fx + 6, fy + 10, fw, fw, 14)
  g.fill()
  const wg = g.createLinearGradient(fx, fy, fx + fw, fy + fw)
  wg.addColorStop(0, C.woodLight)
  wg.addColorStop(0.5, C.wood)
  wg.addColorStop(1, C.woodDark)
  g.fillStyle = wg
  g.beginPath()
  g.roundRect(fx, fy, fw, fw, 14)
  g.fill()
  g.save()
  g.beginPath()
  g.roundRect(fx, fy, fw, fw, 14)
  g.clip()
  for (let i = 0; i < 70; i++) {
    const y = fy + r() * fw
    g.strokeStyle = `rgba(40,18,5,${0.15 + r() * 0.2})`
    g.lineWidth = 0.8 + r()
    g.beginPath()
    g.moveTo(fx, y)
    g.bezierCurveTo(fx + fw * 0.3, y + (r() - 0.5) * 10, fx + fw * 0.6, y + (r() - 0.5) * 10, fx + fw, y + (r() - 0.5) * 6)
    g.stroke()
  }
  g.restore()
  g.strokeStyle = C.ink
  g.lineWidth = 3
  g.beginPath()
  g.roundRect(fx, fy, fw, fw, 14)
  g.stroke()
  g.strokeStyle = 'rgba(255,220,170,0.3)'
  g.lineWidth = 2
  g.beginPath()
  g.roundRect(fx + 4, fy + 4, fw - 8, fw - 8, 11)
  g.stroke()
  // inner well (paper shows through the tiles)
  g.fillStyle = '#ead8b0'
  g.fillRect(BX - 3, BY - 3, N * TS + 6, N * TS + 6)
  g.strokeStyle = C.ink
  g.lineWidth = 3
  g.strokeRect(BX - 3, BY - 3, N * TS + 6, N * TS + 6)
  // the paper again on the tiles, so they look printed
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(90,60,30,${0.05 + r() * 0.12})`
    g.fillRect(BX + r() * N * TS, BY + r() * N * TS, 0.6 + r() * 1.2, 0.6 + r() * 1.2)
  }
  // panel card
  const p = PANEL
  g.fillStyle = 'rgba(60,30,10,0.25)'
  g.beginPath()
  g.roundRect(p.x + 5, p.y + 8, p.w, p.h, 16)
  g.fill()
  g.fillStyle = '#f1e3c2'
  g.beginPath()
  g.roundRect(p.x, p.y, p.w, p.h, 16)
  g.fill()
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(90,60,30,${0.04 + r() * 0.1})`
    g.fillRect(p.x + r() * p.w, p.y + r() * p.h, 0.6 + r() * 1.2, 0.6 + r() * 1.2)
  }
  g.strokeStyle = C.ink
  g.lineWidth = 3
  g.beginPath()
  g.roundRect(p.x, p.y, p.w, p.h, 16)
  g.stroke()
  g.strokeStyle = C.inkSoft
  g.lineWidth = 1.5
  g.beginPath()
  g.roundRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16, 10)
  g.stroke()
  return c
}

/** A wobbly inked circle path (hand-drawn look). */
function wobble(ctx, x, y, r, seed = 1, pts = 14, amt = 0.06) {
  ctx.beginPath()
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * TAU
    const rr = r * (1 + Math.sin(a * 3 + seed) * amt + Math.cos(a * 5 + seed * 2) * amt * 0.6)
    const px = x + Math.cos(a) * rr
    const py = y + Math.sin(a) * rr
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
  }
  ctx.closePath()
}

function drawRock(ctx, cx, cy, seed) {
  ctx.fillStyle = 'rgba(60,35,15,0.25)'
  ctx.beginPath()
  ctx.ellipse(cx + 4, cy + 26, 34, 10, 0, 0, TAU)
  ctx.fill()
  wobble(ctx, cx, cy + 4, 32, seed, 9, 0.12)
  ctx.fillStyle = C.rock
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = C.ink
  ctx.stroke()
  ctx.fillStyle = C.rockDark
  ctx.beginPath()
  ctx.moveTo(cx - 28, cy + 12)
  ctx.quadraticCurveTo(cx, cy + 34, cx + 28, cy + 12)
  ctx.quadraticCurveTo(cx, cy + 26, cx - 28, cy + 12)
  ctx.fill()
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx - 6, cy - 22)
  ctx.lineTo(cx + 2, cy - 6)
  ctx.lineTo(cx - 4, cy + 6)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,250,235,0.35)'
  ctx.beginPath()
  ctx.ellipse(cx - 12, cy - 12, 9, 5, -0.5, 0, TAU)
  ctx.fill()
}

function drawTree(ctx, cx, cy, seed) {
  ctx.fillStyle = 'rgba(60,35,15,0.25)'
  ctx.beginPath()
  ctx.ellipse(cx + 4, cy + 30, 30, 9, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#6b4321'
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.rect(cx - 6, cy + 4, 12, 26)
  ctx.fill()
  ctx.stroke()
  const blobs = [[0, -14, 22], [-15, -2, 16], [15, -2, 16], [0, 4, 16]]
  for (const [dx, dy, r] of blobs) {
    wobble(ctx, cx + dx, cy + dy, r, seed + dx, 10, 0.08)
    ctx.fillStyle = C.green
    ctx.fill()
    ctx.stroke()
  }
  ctx.fillStyle = C.greenLight
  for (const [dx, dy, r] of blobs) {
    ctx.beginPath()
    ctx.arc(cx + dx - r * 0.3, cy + dy - r * 0.3, r * 0.4, 0, TAU)
    ctx.fill()
  }
}

function drawShrine(ctx, cx, cy, t) {
  const glow = 0.55 + Math.sin(t * 2.4) * 0.15
  ctx.fillStyle = `rgba(241,205,98,${0.35 * glow})`
  ctx.beginPath()
  ctx.arc(cx, cy, 40, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 2
  ctx.setLineDash([5, 5])
  ctx.beginPath()
  ctx.arc(cx, cy, 34, 0, TAU)
  ctx.stroke()
  ctx.setLineDash([])
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3
    const x = cx + Math.cos(a) * 34
    const y = cy + Math.sin(a) * 34
    ctx.fillStyle = C.rock
    ctx.beginPath()
    ctx.ellipse(x, y, 6, 5, a, 0, TAU)
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  // a little star
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2
    const r = i % 2 ? 7 : 16
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = C.goldLight
  ctx.fill()
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 2
  ctx.stroke()
}

/** The role symbol, drawn in cream with an ink edge, centred on 0,0 at radius r. */
function drawSymbol(ctx, kind, r) {
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const s = r / 30
  ctx.save()
  ctx.scale(s, s)
  ctx.fillStyle = C.cream
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 2.5
  if (kind === 'knight') {
    ctx.save()
    ctx.rotate(-0.6)
    ctx.beginPath()
    ctx.moveTo(-3.5, 6)
    ctx.lineTo(-3.5, -14)
    ctx.lineTo(0, -20)
    ctx.lineTo(3.5, -14)
    ctx.lineTo(3.5, 6)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.roundRect(-11, 5, 22, 5, 2)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.rect(-2.5, 10, 5, 7)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 19, 3.2, 0, TAU)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  } else if (kind === 'archer') {
    ctx.beginPath()
    ctx.arc(-6, 0, 17, -1.2, 1.2)
    ctx.lineWidth = 7
    ctx.strokeStyle = C.ink
    ctx.stroke()
    ctx.lineWidth = 3.5
    ctx.strokeStyle = C.cream
    ctx.stroke()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = C.ink
    ctx.beginPath()
    ctx.moveTo(-6 + Math.cos(-1.2) * 17, Math.sin(-1.2) * 17)
    ctx.lineTo(-6 + Math.cos(1.2) * 17, Math.sin(1.2) * 17)
    ctx.stroke()
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(-8, 0)
    ctx.lineTo(16, 0)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(19, 0)
    ctx.lineTo(12, -5)
    ctx.lineTo(12, 5)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else {
    ctx.beginPath()
    const a = 5
    const b = 15
    ctx.moveTo(-a, -b)
    ctx.lineTo(a, -b)
    ctx.lineTo(a, -a)
    ctx.lineTo(b, -a)
    ctx.lineTo(b, a)
    ctx.lineTo(a, a)
    ctx.lineTo(a, b)
    ctx.lineTo(-a, b)
    ctx.lineTo(-a, a)
    ctx.lineTo(-b, a)
    ctx.lineTo(-b, -a)
    ctx.lineTo(-a, -a)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

/** A painted wooden token: a thick disc in the team colour with the role symbol on top. */
function drawToken(ctx, x, y, r, side, kind, { lift = 0, flash = 0, dim = false, ring = false } = {}) {
  const [base, light] = TEAM[side]
  ctx.fillStyle = 'rgba(50,28,10,0.3)'
  ctx.beginPath()
  ctx.ellipse(x + 2, y + r * 0.62, r * (1 - lift * 0.01), r * 0.36, 0, 0, TAU)
  ctx.fill()
  y -= lift
  const th = r * 0.24
  ctx.fillStyle = side === 'blue' ? '#1d3b66' : '#6e2017'
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(x, y + th, r, r * 0.86, 0, 0, TAU)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.86, 0, 0, TAU)
  ctx.fillStyle = base
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.fillStyle = light
  ctx.globalAlpha = 0.55
  ctx.beginPath()
  ctx.ellipse(x - r * 0.35, y - r * 0.35, r * 0.8, r * 0.6, -0.4, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.restore()
  ctx.lineWidth = 3
  ctx.strokeStyle = C.ink
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.86, 0, 0, TAU)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(246,234,208,0.6)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(x, y, r * 0.8, r * 0.68, 0, 0, TAU)
  ctx.stroke()
  ctx.save()
  ctx.translate(x, y)
  drawSymbol(ctx, kind, r * 0.82)
  ctx.restore()
  if (flash > 0) {
    ctx.globalAlpha = Math.min(1, flash)
    ctx.fillStyle = '#fff6e0'
    ctx.beginPath()
    ctx.ellipse(x, y + th / 2, r + 2, r * 0.86 + th / 2 + 2, 0, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = 1
  }
  if (dim) {
    ctx.fillStyle = 'rgba(70,55,40,0.42)'
    ctx.beginPath()
    ctx.ellipse(x, y + th / 2, r + 2, r * 0.86 + th / 2 + 2, 0, 0, TAU)
    ctx.fill()
  }
  if (ring) {
    ctx.strokeStyle = C.goldLight
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.ellipse(x, y + th / 2, r + 7, r * 0.86 + th / 2 + 7, 0, 0, TAU)
    ctx.stroke()
  }
}

function drawPips(ctx, x, y, hp, max, side) {
  const w = 9
  const gap = 3
  const total = max * w + (max - 1) * gap
  let px = x - total / 2
  for (let i = 0; i < max; i++) {
    ctx.beginPath()
    ctx.roundRect(px, y, w, 10, 2)
    ctx.fillStyle = i < hp ? (side === 'blue' ? C.blueLight : C.redLight) : 'rgba(246,234,208,0.85)'
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = C.ink
    ctx.stroke()
    px += w + gap
  }
}

function drawArrow(ctx, x, y, a) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(a)
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(-18, 0)
  ctx.lineTo(12, 0)
  ctx.stroke()
  ctx.fillStyle = C.ink
  ctx.beginPath()
  ctx.moveTo(18, 0)
  ctx.lineTo(9, -5)
  ctx.lineTo(9, 5)
  ctx.fill()
  ctx.fillStyle = C.cream
  ctx.beginPath()
  ctx.moveTo(-18, 0)
  ctx.lineTo(-24, -5)
  ctx.lineTo(-14, 0)
  ctx.lineTo(-24, 5)
  ctx.closePath()
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

let BG = null
const MCTX = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null

// ---- the module --------------------------------------------------------------------------------

export default {
  id: 'tiny-tactics',
  name: 'Tiny Tactics',
  blurb: 'Outwit the CPU in 3 board battles',
  scoreLabel: 'points',
  style: { bg: '#e9d8b4', accent: '#9b3b2e' },
  medals: [400, 900, 1400],
  // calm, a little medieval: D minor, i – VII – VI – V
  music: { bpm: 84, root: 50, chords: [0, -2, -4, -5], minor: true, lead: [0, 2, 3, null, 4, 3, 2, null], wave: 'triangle', gain: 0.032, hats: false },
  TUNING,
  cursor: true,
  howTo: (input) =>
    input.mode === 'touch' || input.mode === 'mouse'
      ? `${input.label('a')} a unit, then a tile, then a target · defeat all red units`
      : `${input.dpadLabel()} to aim · ${input.label('a')} select · ${input.label('b')} back · ${input.label('y')} end turn`,
  icon(ctx, x, y, size, t) {
    // a board corner with a blue knight facing a red archer
    const ts = size * 0.33
    const cols = 6
    const rows = 3
    const ox = x - (cols * ts) / 2
    const oy = y - (rows * ts) / 2 - 2
    ctx.save()
    ctx.fillStyle = C.wood
    ctx.beginPath()
    ctx.roundRect(ox - 12, oy - 12, cols * ts + 24, rows * ts + 24, 10)
    ctx.fill()
    ctx.strokeStyle = C.ink
    ctx.lineWidth = 3
    ctx.stroke()
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        ctx.fillStyle = (i + j) % 2 ? '#e4cf9f' : '#efdfb9'
        ctx.fillRect(ox + i * ts, oy + j * ts, ts, ts)
      }
    ctx.strokeStyle = C.inkSoft
    ctx.lineWidth = 1.5
    for (let i = 0; i <= cols; i++) (ctx.beginPath(), ctx.moveTo(ox + i * ts, oy), ctx.lineTo(ox + i * ts, oy + rows * ts), ctx.stroke())
    for (let j = 0; j <= rows; j++) (ctx.beginPath(), ctx.moveTo(ox, oy + j * ts), ctx.lineTo(ox + cols * ts, oy + j * ts), ctx.stroke())
    ctx.strokeStyle = C.ink
    ctx.lineWidth = 2.5
    ctx.strokeRect(ox, oy, cols * ts, rows * ts)
    ctx.save()
    ctx.translate(ox + 3.5 * ts, oy + 0.5 * ts)
    ctx.scale(ts / 96, ts / 96)
    drawTree(ctx, 0, -4, 3)
    ctx.restore()
    ctx.fillStyle = 'rgba(84,150,240,0.4)'
    ctx.fillRect(ox + ts, oy + 2 * ts, ts, ts)
    ctx.fillStyle = 'rgba(177,58,44,0.28)'
    ctx.fillRect(ox + 4 * ts, oy + ts, ts, ts)
    ctx.fillStyle = 'rgba(84,150,240,0.4)'
    ctx.fillRect(ox + 2 * ts, oy + ts, ts, ts)
    const bob = (p) => Math.max(0, Math.sin(t * 3 + p)) * 6
    drawToken(ctx, ox + 1.5 * ts, oy + 1.45 * ts, ts * 0.43, 'blue', 'knight', { lift: bob(0) })
    drawToken(ctx, ox + 4.5 * ts, oy + 1.45 * ts, ts * 0.43, 'red', 'archer', { lift: bob(Math.PI) })
    drawToken(ctx, ox + 0.5 * ts, oy + 2.45 * ts, ts * 0.38, 'blue', 'healer')
    drawToken(ctx, ox + 5.5 * ts, oy + 0.45 * ts, ts * 0.38, 'red', 'knight')
    ctx.restore()
  },
  create(env) {
    const { input, audio, settings, font } = env
    const T = env.TUNING
    BG ??= bakeBackground()
    const fx = createFx(settings, { max: 220 })
    const gfont = (px) => font(600, px, 'EB Garamond')
    const nfont = (px) => font(700, px)

    let b = null // the current battle
    let battle = 0 // 0-based
    let turn = 1
    let phase = 'intro' // intro | player | cpu | result
    let sel = null // { u, step: 'move' | 'moving' | 'menu' | 'target', from, reach, targets, menu, list, ti }
    let inspect = null // an enemy whose threat range is shown
    let cpuSel = null
    let result = null
    let won = 0
    let totalKills = 0
    let totalLost = 0
    let time = 0
    const cur = { x: 2, y: 4, dx: 2, dy: 4 }
    const seq = []
    const floaters = []
    let banner = null // { text, color, t, dur }
    let arrow = null
    let lastPointer = { x: -1, y: -1 }

    const tileCentre = (x, y) => [BX + x * TS + TS / 2, BY + y * TS + TS / 2]
    const tileAt = (p) => {
      const x = Math.floor((p.x - BX) / TS)
      const y = Math.floor((p.y - BY) / TS)
      return inBoard(x, y) ? { x, y } : null
    }
    const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
    const padMode = () => input.mode === 'gamepad' || input.mode === 'keyboard'
    const push = (dur, tick, end, start) => seq.push({ t: 0, dur, tick, end, start, started: false })
    const blueReady = () => alive(b, 'blue').filter((u) => !u.acted)

    // ---- sound ----
    const sfx = {
      cursor: () => audio.tone({ freq: 520, dur: 0.03, type: 'triangle', gain: 0.05 }),
      select: () => (audio.tone({ freq: 660, dur: 0.07, type: 'triangle', gain: 0.14 }), audio.tone({ freq: 990, dur: 0.08, type: 'triangle', gain: 0.1, delay: 0.05 })),
      back: () => audio.tone({ freq: 440, dur: 0.08, type: 'triangle', gain: 0.1, slide: -160 }),
      nope: () => audio.tone({ freq: 160, dur: 0.08, type: 'square', gain: 0.06 }),
      step: () => (audio.noise({ dur: 0.03, gain: 0.12 }), audio.tone({ freq: 210 + Math.random() * 40, dur: 0.05, type: 'triangle', gain: 0.14 })),
      swing: () => audio.noise({ dur: 0.09, gain: 0.1 }),
      hit: (big) => (audio.noise({ dur: big ? 0.22 : 0.14, gain: 0.3 }), audio.tone({ freq: big ? 120 : 160, dur: 0.18, type: 'square', gain: 0.14, slide: -80 })),
      bow: () => audio.tone({ freq: 900, dur: 0.14, type: 'sine', gain: 0.12, slide: -500 }),
      heal: () => [784, 988, 1175].forEach((f, i) => audio.tone({ freq: f, dur: 0.2, type: 'sine', gain: 0.12, delay: i * 0.07 })),
      defeat: () => (audio.tone({ freq: 240, dur: 0.5, type: 'triangle', gain: 0.18, slide: -170 }), audio.noise({ dur: 0.3, gain: 0.15, delay: 0.05 })),
      yourTurn: () => [587, 784].forEach((f, i) => audio.tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.14, delay: i * 0.1 })),
      enemyTurn: () => [294, 277].forEach((f, i) => audio.tone({ freq: f, dur: 0.2, type: 'square', gain: 0.07, delay: i * 0.12 })),
      victory: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => audio.tone({ freq: f, dur: i === 5 ? 0.5 : 0.14, type: 'triangle', gain: 0.16, delay: i * 0.11 })),
      lose: () => [392, 330, 294, 220].forEach((f, i) => audio.tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.15, delay: i * 0.18 }))
    }

    // ---- flow ----
    function startBattle() {
      b = newBattle()
      for (const u of b.units) Object.assign(u, { dx: u.x, dy: u.y, hop: 0, lx: 0, ly: 0, flash: 0, shake: 0, fade: 1 })
      turn = 1
      sel = null
      inspect = null
      cpuSel = null
      result = null
      fx.clear()
      floaters.length = 0
      phase = 'intro'
      const k = alive(b, 'blue').find((u) => u.kind === 'knight')
      Object.assign(cur, { x: k.x, y: k.y, dx: k.x, dy: k.y })
      showBanner(`Battle ${battle + 1} of ${T.battles}`, C.ink, 1.3)
      push(1.3, null, () => startPlayerTurn())
    }
    function showBanner(text, color, dur = T.pace.banner) {
      banner = { text, color, t: 0, dur }
    }
    function startPlayerTurn() {
      if (turn > T.turnLimit) return endBattle(hpOf(b, 'blue') >= hpOf(b, 'red'), true)
      phase = 'player'
      b.turn = turn
      for (const u of b.units) u.acted = false
      sel = null
      cpuSel = null
      showBanner('Your turn', C.blue)
      push(T.pace.banner * 0.8, null, null)
      sfx.yourTurn()
      focusNext()
    }
    function focusNext() {
      const next = blueReady()[0]
      if (next && padMode()) ((cur.x = next.x), (cur.y = next.y))
    }
    function endPlayerTurn() {
      if (phase !== 'player') return
      if (sel && sel.step !== 'move') sel.u.acted = true
      sel = null
      inspect = null
      phase = 'cpu'
      for (const u of b.units) if (u.side === 'red') u.acted = false
      showBanner('Enemy turn', C.red)
      sfx.enemyTurn()
      push(T.pace.banner, null, null)
    }
    function cpuStep() {
      const p = plan(b, 'red', T.cpu[Math.min(battle, T.cpu.length - 1)])
      if (!p) {
        cpuSel = null
        turn++
        return startPlayerTurn()
      }
      const u = p.u
      cpuSel = { u, reach: reach(b, u) }
      push(T.pace.think, null, () => (cpuSel = { u, reach: null }))
      const path = pathOf(p.node)
      u.x = p.node.x
      u.y = p.node.y
      animMove(u, path)
      performAction(u, p.act, () => (cpuSel = null))
    }
    function animMove(u, path) {
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]
        const c = path[i]
        push(
          T.pace.step,
          (k) => ((u.dx = lerp(a.x, c.x, k)), (u.dy = lerp(a.y, c.y, k)), (u.hop = Math.sin(Math.PI * k) * 14)),
          () => ((u.dx = c.x), (u.dy = c.y), (u.hop = 0), sfx.step())
        )
      }
    }
    /** Queue the attack / heal / wait animation; the rules change at the moment of impact. */
    function performAction(u, act, then) {
      const finish = () => {
        u.acted = true
        then?.()
        const w = winner(b)
        if (w) return endBattle(w === 'blue')
        if (phase === 'player') {
          if (!blueReady().length) push(0.35, null, () => endPlayerTurn())
          else focusNext()
        }
      }
      if (act.type === 'wait') {
        push(0.12, null, finish)
        return
      }
      const t = act.t
      const [ux, uy] = tileCentre(u.x, u.y)
      const [tx, ty] = tileCentre(t.x, t.y)
      const ang = Math.atan2(ty - uy, tx - ux)
      const impact = () => {
        const before = t.hp
        resolve(act)
        if (act.type === 'attack') {
          const dmg = before - t.hp
          t.flash = 1
          t.shake = 1
          floaters.push({ x: tx, y: ty - 36, text: `−${dmg}`, color: C.red, t: 0 })
          fx.burst(tx, ty, '#3a2517', 10, 260, { size: 4, life: 0.5, gravity: 500 })
          fx.burst(tx, ty, TEAM[t.side][1], 8, 200, { size: 5, life: 0.45, gravity: 400, square: true })
          fx.shake(t.hp <= 0 ? 0.45 : 0.25)
          sfx.hit(t.hp <= 0)
          if (t.hp <= 0) {
            sfx.defeat()
            fx.burst(tx, ty, TEAM[t.side][0], 22, 380, { size: 6, life: 0.8, gravity: 700, square: true })
            floaters.push({ x: tx, y: ty + 26, text: 'Defeated!', color: C.ink, t: 0, small: true })
            if (t.side === 'red') {
              totalKills++
              run.score += T.score.kill
            } else totalLost++
          }
        } else {
          floaters.push({ x: tx, y: ty - 36, text: `+${act.amt}`, color: C.heal, t: 0 })
          fx.burst(tx, ty, '#8fe0a0', 14, 160, { size: 4, life: 0.8, gravity: -160 })
          t.flash = 0.6
          sfx.heal()
        }
      }
      if (act.type === 'heal') {
        push(T.pace.heal, (k) => (u.hop = Math.sin(Math.PI * k) * 10), () => ((u.hop = 0), impact()), () => audio.tone({ freq: 660, dur: 0.15, type: 'sine', gain: 0.07 }))
      } else if (S(u).max > 1 && dist(u, t) > 1) {
        push(0.14, (k) => ((u.lx = -Math.cos(ang) * 6 * k), (u.ly = -Math.sin(ang) * 6 * k)), () => sfx.bow())
        push(
          T.pace.arrow,
          (k) => {
            u.lx = u.ly = 0
            const d = Math.hypot(tx - ux, ty - uy)
            const h = Math.sin(Math.PI * k) * d * 0.25
            const x = lerp(ux, tx, k)
            const y = lerp(uy, ty, k) - h
            const dy = (ty - uy) / d - Math.cos(Math.PI * k) * Math.PI * 0.25
            arrow = { x, y, a: Math.atan2(dy, (tx - ux) / d) }
          },
          () => ((arrow = null), impact())
        )
      } else {
        let hit = false
        push(
          T.pace.melee,
          (k) => {
            const l = Math.sin(Math.PI * k) * 30
            u.lx = Math.cos(ang) * l
            u.ly = Math.sin(ang) * l
            if (k >= 0.5 && !hit) ((hit = true), impact())
          },
          () => ((u.lx = u.ly = 0), hit || impact()),
          () => sfx.swing()
        )
      }
      push(T.pace.after, null, finish)
    }
    function endBattle(victory, timeUp = false) {
      seq.length = 0
      sel = null
      cpuSel = null
      phase = 'result'
      const pts = battlePoints(b, victory)
      // kills were already counted live
      const extra = pts.total - pts.kills * T.score.kill
      run.score += extra
      if (victory) won++
      const last = !victory || battle + 1 >= T.battles
      result = { victory, pts, t: 0, last, timeUp }
      if (victory) {
        sfx.victory()
        for (const u of alive(b, 'blue')) {
          const [x, y] = tileCentre(u.x, u.y)
          fx.burst(x, y, C.goldLight, 16, 320, { size: 5, life: 0.9, gravity: 500, square: true })
        }
      } else sfx.lose()
    }
    function continueFromResult() {
      if (!result || result.t < 0.9) return
      if (result.last) {
        run.done = true
        return
      }
      battle++
      startBattle()
    }

    // ---- player commands ----
    // Each unit's orders take three steps: ① choose a unit, ② move it, ③ act from its action menu.
    const hints = { choose: 0, move: 0, menu: 0, target: 0 } // battle 1's tips fade once a step is done twice
    const pointerMode = () => input.mode === 'touch' || input.mode === 'mouse'
    const inPause = (p) => p.x > W - 140 && p.y < 110
    const stepNo = () => (phase !== 'player' ? 0 : !sel ? 1 : sel.step === 'move' || sel.step === 'moving' ? 2 : 3)
    function select(u) {
      sel = { u, step: 'move', from: { x: u.x, y: u.y }, reach: reach(b, u) }
      inspect = null
      hints.choose++
      sfx.select()
    }
    function openMenu() {
      const u = sel.u
      sel.step = 'menu'
      sel.targets = targetsFrom(b, u, u.x, u.y)
      const items = []
      const atk = sel.targets.filter((a) => a.type === 'attack').length
      const heal = sel.targets.filter((a) => a.type === 'heal').length
      if (atk) items.push({ id: 'attack', text: 'Attack', n: atk })
      if (heal) items.push({ id: 'heal', text: 'Heal', n: heal })
      items.push({ id: 'wait', text: 'Wait' }, { id: 'undo', text: 'Undo move' })
      sel.menu = { items, i: 0 }
      cur.x = u.x
      cur.y = u.y
    }
    function chooseItem(id) {
      if (id === 'attack' || id === 'heal') {
        hints.menu++
        sel.step = 'target'
        sel.kind = id
        sel.list = sel.targets.filter((a) => a.type === id)
        sel.ti = 0
        cur.x = sel.list[0].t.x
        cur.y = sel.list[0].t.y
        return sfx.select()
      }
      if (id === 'wait') {
        hints.menu++
        const u = sel.u
        sel = null
        performAction(u, { type: 'wait' })
        return sfx.back()
      }
      if (id === 'undo') return back()
    }
    function commitTarget(act) {
      hints.target++
      const u = sel.u
      sel = null
      performAction(u, act)
    }
    /** a, a click or a tap on a board tile. */
    function confirmTile(x, y) {
      const here = unitAt(b, x, y)
      if (!sel) {
        if (here?.side === 'blue' && !here.acted) return select(here)
        if (here?.side === 'red') return ((inspect = inspect === here ? null : here), sfx.cursor())
        return sfx.nope()
      }
      const u = sel.u
      if (sel.step === 'move') {
        const node = sel.reach.get(key(x, y))
        if (node) {
          hints.move++
          const path = pathOf(node)
          u.x = x
          u.y = y
          animMove(u, path)
          sel.step = 'moving'
          push(0.01, null, () => sel && openMenu())
          return sfx.select()
        }
        if (here?.side === 'blue' && !here.acted) return select(here)
        cur.x = u.x
        cur.y = u.y
        sel = null
        return sfx.back()
      }
      if (sel.step === 'target') {
        const act = sel.list.find((a) => a.t.x === x && a.t.y === y)
        return act ? commitTarget(act) : sfx.nope()
      }
      sfx.nope() // in the menu step only the menu answers
    }
    function back() {
      if (!sel) return inspect && ((inspect = null), sfx.back())
      const u = sel.u
      if (sel.step === 'target') {
        sel.step = 'menu'
        cur.x = u.x
        cur.y = u.y
        return sfx.back()
      }
      if (sel.step === 'menu') {
        // undo the move
        u.x = u.dx = sel.from.x
        u.y = u.dy = sel.from.y
        sel = { u, step: 'move', from: sel.from, reach: reach(b, u) }
        cur.x = u.x
        cur.y = u.y
        return sfx.back()
      }
      cur.x = u.x
      cur.y = u.y
      sel = null
      sfx.back()
    }
    /** The action menu, next to the unit (on whichever side has room). */
    function menuRect() {
      const u = sel.u
      const w = 230
      const ih = 58
      const h = sel.menu.items.length * ih + 16
      const x = u.x >= 3 ? BX + u.x * TS - w - 12 : BX + (u.x + 1) * TS + 12
      const y = clamp(BY + u.y * TS + TS / 2 - h / 2, BY + 6, BY + N * TS - h - 6)
      return { x, y, w, h, items: sel.menu.items.map((it, i) => ({ ...it, i, x: x + 8, y: y + 8 + i * ih, w: w - 16, h: ih - 4 })) }
    }
    /** On-screen buttons for the current step (they work with mouse and touch; the keys do the same). */
    const measure = (str, f) => ((MCTX.font = f), MCTX.measureText(str).width)
    function buttons() {
      if (phase !== 'player' || seq.length) return []
      const y = PANEL.y + PANEL.h - 92
      const list = []
      if (sel?.step === 'move') list.push({ id: 'cancel', text: 'Back', key: 'b' })
      if (sel?.step === 'target') list.push({ id: 'cancel', text: 'Back to menu', key: 'b' })
      if (!sel || sel.step === 'move') list.push({ id: 'end', text: 'End turn', key: 'y' })
      const showKey = input.mode === 'gamepad' || input.mode === 'keyboard'
      for (const bt of list) {
        bt.tw = measure(bt.text, gfont(30))
        bt.kw = showKey ? Math.max(30, measure(input.label(bt.key), nfont(18)) + 16) : 0
        bt.w = Math.max(130, bt.tw + bt.kw + (showKey ? 52 : 40))
        bt.h = 68
        bt.y = y
      }
      // End turn sits on the right, the others from the left
      let lx = PANEL.x + 24
      for (const bt of list) {
        if (bt.id === 'end') bt.x = PANEL.x + PANEL.w - 24 - bt.w
        else ((bt.x = lx), (lx += bt.w + 14))
      }
      return list
    }
    function pressButton(id) {
      if (id === 'cancel') back()
      if (id === 'end') endPlayerTurn()
    }

    function playerInput() {
      const p = input.pointer
      const moved = p.active && (p.x !== lastPointer.x || p.y !== lastPointer.y)
      if (moved) lastPointer = { x: p.x, y: p.y }
      const tapped = p.pressed && !inPause(p)
      const btn = tapped ? buttons().find((bt) => inside(p, bt)) : null
      if (btn) return pressButton(btn.id)

      if (sel?.step === 'menu') {
        const m = menuRect()
        const n = m.items.length
        if (input.navY) ((sel.menu.i = (sel.menu.i + input.navY + n) % n), sfx.cursor())
        const hit = m.items.find((it) => inside(p, it))
        if (moved && hit && hit.i !== sel.menu.i) ((sel.menu.i = hit.i), sfx.cursor())
        if (tapped) return hit ? chooseItem(hit.id) : sfx.nope()
        if (input.pressed('a')) return chooseItem(m.items[sel.menu.i].id)
        if (input.pressed('b')) return back()
        if (input.pressed('x')) return chooseItem('wait')
        return
      }
      if (sel?.step === 'target') {
        const n = sel.list.length
        const step = input.navX || input.navY
        if (step) {
          sel.ti = (sel.ti + (step > 0 ? 1 : -1) + n) % n
          cur.x = sel.list[sel.ti].t.x
          cur.y = sel.list[sel.ti].t.y
          sfx.cursor()
        }
        const t = moved || tapped ? tileAt(p) : null
        const i = t ? sel.list.findIndex((a) => a.t.x === t.x && a.t.y === t.y) : -1
        if (i >= 0 && i !== sel.ti) ((sel.ti = i), (cur.x = t.x), (cur.y = t.y))
        if (tapped) return i >= 0 ? commitTarget(sel.list[i]) : sfx.nope()
        if (input.pressed('a')) return commitTarget(sel.list[sel.ti])
        if (input.pressed('b')) return back()
        return
      }
      // ① choose a unit / ② move: a free cursor
      if (input.navX || input.navY) {
        const nx = clamp(cur.x + input.navX, 0, N - 1)
        const ny = clamp(cur.y + input.navY, 0, N - 1)
        if (nx !== cur.x || ny !== cur.y) ((cur.x = nx), (cur.y = ny), sfx.cursor())
      }
      if (moved) {
        const t = tileAt(p)
        if (t) ((cur.x = t.x), (cur.y = t.y))
      }
      if (tapped) {
        const t = tileAt(p)
        if (t) {
          cur.x = t.x
          cur.y = t.y
          return confirmTile(t.x, t.y)
        }
      }
      if (input.pressed('a')) return confirmTile(cur.x, cur.y)
      if (input.pressed('b')) return back()
      if (input.pressed('y')) return endPlayerTurn()
    }

    // ---- words for the panel ----
    /** One line that always says what to do next, and with which button. */
    function instruction() {
      const A = input.label('a')
      const B = input.label('b')
      const pm = pointerMode()
      const a = A.toLowerCase()
      if (phase === 'intro') return 'Get ready…'
      if (phase === 'cpu') return 'Watch where red moves…'
      if (phase === 'result') return result.last ? `${A} to see your results` : `${A} for the next battle`
      if (seq.length && !sel) return blueReady().length === alive(b, 'blue').length ? 'Your turn is starting…' : 'Wait for it…'
      if (!sel) return blueReady().length ? (pm ? `${A} a blue unit to give it orders` : `Pick a blue unit (${A})`) : 'All done: the enemy moves next.'
      if (sel.step === 'move' || sel.step === 'moving') return pm ? `Move: ${a} a blue tile, or ${a} the unit to stay` : `Move: pick a blue tile (${A}), or ${A} on the unit to stay`
      if (sel.step === 'menu') return pm ? `Act: ${a} an action in the menu` : `Act: choose an action (${A}), ${B} undoes the move`
      const what = sel.kind === 'heal' ? 'a green ally to heal' : 'a red target'
      return pm ? `${A} ${what}` : `Pick ${what} (${A}), ${B} goes back`
    }
    function describe(u, act) {
      const nm = S(u).name
      if (act.type === 'attack') return [`${nm} ${S(u).max > 1 ? 'shoots' : 'hits'} ${S(act.t).name} for ${act.raw}`, act.kill ? 'and defeats it!' : `${act.t.hp - act.amt} HP left.`, act.kill]
      return [`${nm} heals ${S(act.t).name} for ${act.amt}`, `${act.t.hp + act.amt} of ${S(act.t).hp} HP.`]
    }
    /** What the highlighted choice will do. */
    function preview() {
      const here = unitAt(b, cur.x, cur.y)
      if (phase === 'cpu') return cpuSel ? [`The red ${S(cpuSel.u).name} acts…`, ''] : ['The enemy is thinking…', '']
      if (phase !== 'player') return ['', '']
      if (!sel) {
        if (here?.side === 'blue') return here.acted ? [`This ${S(here).name} has acted.`, 'It can go again next turn.'] : [`Your ${S(here).name} is ready.`, '']
        if (here?.side === 'red') return [`Red ${S(here).name}`, inspect === here ? 'Its danger zone is shown.' : 'Red tiles: where it can strike.']
        return b.tiles[key(cur.x, cur.y)] === SHRINE ? ['Shrine', `+${T.shrineBonus} attack when standing here.`] : ['', '']
      }
      const u = sel.u
      const nm = S(u).name
      if (sel.step === 'move') {
        if (sel.reach.has(key(cur.x, cur.y))) {
          const ts = targetsFrom(b, u, cur.x, cur.y).filter((a) => a.type === 'attack')
          const stay = cur.x === u.x && cur.y === u.y
          return [stay ? `${nm} stays here.` : `Move ${nm} here.`, ts.length ? `Then it can hit ${ts.map((a) => S(a.t).name).join(', ')}.` : b.tiles[key(cur.x, cur.y)] === SHRINE ? `Shrine: +${T.shrineBonus} attack.` : 'Nobody in range from here.']
        }
        return ["It can't reach that tile.", '']
      }
      if (sel.step === 'menu') {
        const it = sel.menu.items[sel.menu.i]
        const list = sel.targets.filter((a) => a.type === it.id)
        if (list.length === 1) return describe(u, list[0])
        if (list.length) return [`${list.length} ${it.id === 'heal' ? 'allies' : 'foes'} in range.`, 'Pick one next.']
        if (it.id === 'wait') return [`${nm} holds this spot.`, 'Its go is over.']
        if (it.id === 'undo') return [`${nm} goes back to the start.`, 'Then move it again.']
      }
      if (sel.step === 'target') return describe(u, sel.list[sel.ti])
      return ['', '']
    }

    const run = {
      score: 0,
      done: false,
      /** For test scripts: the live board and phase. */
      get debug() {
        return { b, phase, sel, seq: seq.length, endBattle, step: stepNo(), menu: sel?.menu && menuRect() }
      },
      stats: () => [
        ['Battles won', `${won} / ${T.battles}`],
        ['Foes defeated', totalKills],
        ['Units lost', totalLost]
      ],
      prompts: (inp) => {
        if (inp.mode === 'touch' || inp.mode === 'mouse') return []
        if (phase === 'result') return [['a', 'Continue']]
        if (phase !== 'player' || seq.length) return []
        if (!sel) return [['a', 'Select'], ['y', 'End turn']]
        if (sel.step === 'move') return [['a', 'Move here'], ['b', 'Back']]
        if (sel.step === 'menu') return [['up', 'Choose'], ['a', 'Confirm'], ['b', 'Undo move']]
        if (sel.step === 'target') return [['a', sel.kind === 'heal' ? 'Heal' : 'Attack'], ['b', 'Back']]
        return []
      },
      update(dt) {
        time += dt
        if (seq.length) {
          const s = seq[0]
          if (!s.started) ((s.started = true), s.start?.())
          s.t += dt
          s.tick?.(Math.min(1, s.t / s.dur))
          if (s.t >= s.dur) {
            seq.shift()
            s.end?.()
          }
        } else if (phase === 'player') playerInput()
        else if (phase === 'cpu') cpuStep()
        if (phase === 'result') {
          result.t += dt
          if (input.pressed('a') || input.pointer.pressed || result.t > 6) continueFromResult()
        }
        if (banner && (banner.t += dt) > banner.dur) banner = null
        cur.dx += (cur.x - cur.dx) * Math.min(1, dt * 18)
        cur.dy += (cur.y - cur.dy) * Math.min(1, dt * 18)
        for (const u of b.units) {
          u.flash = Math.max(0, u.flash - dt * 3)
          u.shake = Math.max(0, u.shake - dt * 3)
          if (u.hp <= 0) u.fade = Math.max(0, u.fade - dt * 1.6)
        }
        for (let i = floaters.length - 1; i >= 0; i--) if ((floaters[i].t += dt) > 1.1) floaters.splice(i, 1)
        fx.update(dt)
      },
      draw(ctx) {
        ctx.drawImage(BG, 0, 0, W, H)
        ctx.save()
        ctx.translate(...fx.offset())
        drawBoard(ctx)
        ctx.restore()
        drawHeader(ctx)
        drawPanel(ctx)
        if (banner) drawBanner(ctx)
        if (phase === 'result') drawResult(ctx)
      }
    }

    // ---- drawing ----
    function washTile(ctx, x, y, fill, stroke) {
      const px = BX + x * TS
      const py = BY + y * TS
      ctx.fillStyle = fill
      ctx.fillRect(px + 3, py + 3, TS - 6, TS - 6)
      if (stroke) {
        ctx.strokeStyle = stroke
        ctx.lineWidth = 2.5
        ctx.strokeRect(px + 5, py + 5, TS - 10, TS - 10)
      }
    }
    function dotTile(ctx, x, y, color) {
      const [cx, cy] = tileCentre(x, y)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(cx, cy, 7, 0, TAU)
      ctx.fill()
    }
    function drawBoard(ctx) {
      // tiles
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          ctx.fillStyle = (x + y) % 2 ? 'rgba(196,160,100,0.32)' : 'rgba(255,248,228,0.28)'
          ctx.fillRect(BX + x * TS, BY + y * TS, TS, TS)
        }
      // home rows, faintly tinted
      ctx.fillStyle = 'rgba(47,95,158,0.07)'
      ctx.fillRect(BX, BY + 4 * TS, N * TS, 2 * TS)
      ctx.fillStyle = 'rgba(177,58,44,0.07)'
      ctx.fillRect(BX, BY, N * TS, 2 * TS)
      ctx.strokeStyle = C.inkSoft
      ctx.lineWidth = 1.5
      for (let i = 1; i < N; i++) {
        ctx.beginPath()
        ctx.moveTo(BX + i * TS, BY)
        ctx.lineTo(BX + i * TS, BY + N * TS)
        ctx.moveTo(BX, BY + i * TS)
        ctx.lineTo(BX + N * TS, BY + i * TS)
        ctx.stroke()
      }
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) if (b.tiles[key(x, y)] === SHRINE) drawShrine(ctx, ...tileCentre(x, y), time)

      // highlights
      const zone = inspect ?? (phase === 'player' && !sel ? unitAt(b, cur.x, cur.y) : null)
      if (zone?.side === 'red' && zone.hp > 0) {
        const m = new Set()
        const s = S(zone)
        for (const n of reach(b, zone).values())
          for (let y = 0; y < N; y++)
            for (let x = 0; x < N; x++) {
              const d = Math.abs(x - n.x) + Math.abs(y - n.y)
              if (d >= s.min && d <= s.max) m.add(key(x, y))
            }
        for (const k of m) washTile(ctx, k % N, Math.floor(k / N), inspect ? 'rgba(177,58,44,0.22)' : 'rgba(177,58,44,0.12)')
        for (const n of reach(b, zone).values()) dotTile(ctx, n.x, n.y, 'rgba(177,58,44,0.45)')
      }
      if (cpuSel?.reach) for (const n of cpuSel.reach.values()) washTile(ctx, n.x, n.y, 'rgba(177,58,44,0.2)')
      if (sel?.step === 'move' && !seq.length) {
        for (const n of sel.reach.values()) {
          washTile(ctx, n.x, n.y, 'rgba(250,242,222,0.55)')
          washTile(ctx, n.x, n.y, 'rgba(84,150,240,0.36)', 'rgba(30,72,130,0.75)')
        }
        if (sel.reach.has(key(cur.x, cur.y))) {
          const s = S(sel.u)
          for (let y = 0; y < N; y++)
            for (let x = 0; x < N; x++) {
              const d = Math.abs(x - cur.x) + Math.abs(y - cur.y)
              if (d >= s.min && d <= s.max && !blocked(b, x, y)) dotTile(ctx, x, y, 'rgba(177,58,44,0.5)')
            }
          // the path, inked
          const path = pathOf(sel.reach.get(key(cur.x, cur.y)))
          if (path.length > 1) {
            ctx.strokeStyle = 'rgba(29,59,102,0.8)'
            ctx.lineWidth = 5
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.setLineDash([2, 10])
            ctx.beginPath()
            path.forEach((p, i) => (i ? ctx.lineTo(...tileCentre(p.x, p.y)) : ctx.moveTo(...tileCentre(p.x, p.y))))
            ctx.stroke()
            ctx.setLineDash([])
          }
        }
      }
      if ((sel?.step === 'menu' || sel?.step === 'target') && !seq.length) {
        washTile(ctx, sel.u.x, sel.u.y, 'rgba(201,154,46,0.22)', 'rgba(150,110,30,0.7)')
        const kind = sel.step === 'target' ? sel.kind : sel.menu.items[sel.menu.i].id
        for (const a of sel.targets) {
          const on = a.type === kind
          const fill = a.type === 'attack' ? `rgba(177,58,44,${on ? 0.38 : 0.12})` : `rgba(61,154,85,${on ? 0.38 : 0.12})`
          washTile(ctx, a.t.x, a.t.y, fill, on ? (a.type === 'attack' ? C.red : C.heal) : null)
        }
        if (sel.step === 'target') {
          // an inked aiming line to the chosen target
          const t = sel.list[sel.ti].t
          const [ax, ay] = tileCentre(sel.u.x, sel.u.y)
          const [tx, ty] = tileCentre(t.x, t.y)
          ctx.strokeStyle = sel.kind === 'heal' ? 'rgba(40,110,60,0.85)' : 'rgba(140,35,25,0.85)'
          ctx.lineWidth = 5
          ctx.lineCap = 'round'
          ctx.setLineDash([3, 11])
          ctx.lineDashOffset = -time * 30
          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.lineTo(tx, ty)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.lineDashOffset = 0
        }
      }

      // obstacles and units, back to front
      const things = []
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const t = b.tiles[key(x, y)]
          if (t === ROCK || t === TREE) things.push({ y, draw: () => (t === ROCK ? drawRock : drawTree)(ctx, ...tileCentre(x, y), x * 7 + y * 3) })
        }
      for (const u of b.units) {
        if (u.hp <= 0 && u.fade <= 0) continue
        things.push({ y: u.dy, draw: () => drawUnit(ctx, u) })
      }
      things.sort((a, c) => a.y - c.y)
      for (const t of things) t.draw()

      if (arrow) drawArrow(ctx, arrow.x, arrow.y, arrow.a)
      fx.draw(ctx)
      for (const f of floaters) {
        const k = f.t / 1.1
        ctx.globalAlpha = clamp(1.6 - k * 1.6, 0, 1)
        label(ctx, f.text, f.x, f.y - k * 40, { font: f.small ? gfont(28) : nfont(40), color: f.color, edge: 6, edgeColor: C.cream })
      }
      ctx.globalAlpha = 1

      // cursor: inked corner brackets (not while the action menu is open: the menu has the focus)
      if (phase === 'player' && sel?.step !== 'menu' && sel?.step !== 'moving') {
        const x = BX + cur.dx * TS
        const y = BY + cur.dy * TS
        const pulse = 2 + Math.sin(time * 6) * 2
        const l = 22
        ctx.strokeStyle = C.ink
        ctx.lineWidth = 8
        ctx.lineCap = 'round'
        const o = -pulse
        const e = TS + pulse
        ctx.beginPath()
        for (const [cx, cy, sx, sy] of [[o, o, 1, 1], [e, o, -1, 1], [o, e, 1, -1], [e, e, -1, -1]]) {
          ctx.moveTo(x + cx, y + cy + sy * l)
          ctx.lineTo(x + cx, y + cy)
          ctx.lineTo(x + cx + sx * l, y + cy)
        }
        ctx.stroke()
        ctx.strokeStyle = C.goldLight
        ctx.lineWidth = 3.5
        ctx.stroke()
      }
      if (sel?.step === 'menu' && !seq.length) drawActionMenu(ctx)
      drawHint(ctx)
    }
    function drawUnit(ctx, u) {
      const [cx, cy] = [BX + u.dx * TS + TS / 2 + u.lx, BY + u.dy * TS + TS / 2 + u.ly]
      const sh = u.shake > 0 ? Math.sin(time * 70) * 5 * u.shake : 0
      ctx.globalAlpha = u.hp > 0 ? 1 : u.fade
      const selected = sel?.u === u || cpuSel?.u === u
      const lift = u.hop + (selected && !seq.length ? 6 + Math.sin(time * 5) * 3 : 0) + (u.hp <= 0 ? (1 - u.fade) * -10 : 0)
      const dim = phase === 'player' && u.side === 'blue' && u.acted && u.hp > 0
      if (selected && u.hp > 0) {
        // a pulsing gold ring on the ground under the chosen unit
        const pr = 40 + Math.sin(time * 6) * 4
        ctx.fillStyle = 'rgba(241,205,98,0.3)'
        ctx.beginPath()
        ctx.ellipse(cx, cy + 10, pr, pr * 0.55, 0, 0, TAU)
        ctx.fill()
        ctx.strokeStyle = C.gold
        ctx.lineWidth = 3
        ctx.stroke()
      }
      drawToken(ctx, cx + sh, cy - 4, 30, u.side, u.kind, { lift, flash: u.flash, dim, ring: selected })
      if (u.hp > 0) drawPips(ctx, cx, cy + 32, u.hp, S(u).hp, u.side)
      if (dim) drawTick(ctx, cx + 24, cy - 26)
      ctx.globalAlpha = 1
    }
    function drawTick(ctx, x, y, r = 13) {
      ctx.fillStyle = C.cream
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
      ctx.stroke()
      ctx.strokeStyle = C.heal
      ctx.lineWidth = 3.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(x - r * 0.45, y + r * 0.02)
      ctx.lineTo(x - r * 0.1, y + r * 0.4)
      ctx.lineTo(x + r * 0.5, y - r * 0.4)
      ctx.stroke()
    }
    function wrap(text, f, maxW) {
      const words = text.split(' ')
      const lines = []
      let line = ''
      for (const w of words) {
        const t = line ? `${line} ${w}` : w
        if (line && measure(t, f) > maxW) ((lines.push(line)), (line = w))
        else line = t
      }
      if (line) lines.push(line)
      return lines
    }
    function drawActionMenu(ctx) {
      const m = menuRect()
      ctx.fillStyle = 'rgba(50,28,10,0.3)'
      ctx.beginPath()
      ctx.roundRect(m.x + 4, m.y + 7, m.w, m.h, 12)
      ctx.fill()
      ctx.fillStyle = '#f6ead0'
      ctx.beginPath()
      ctx.roundRect(m.x, m.y, m.w, m.h, 12)
      ctx.fill()
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 3
      ctx.stroke()
      for (const it of m.items) {
        const on = it.i === sel.menu.i
        if (on) {
          ctx.fillStyle = C.blue
          ctx.beginPath()
          ctx.roundRect(it.x, it.y, it.w, it.h, 8)
          ctx.fill()
        }
        const col = on ? C.cream : C.ink
        const dot = it.id === 'attack' ? C.red : it.id === 'heal' ? C.heal : null
        if (dot) {
          ctx.fillStyle = dot
          ctx.beginPath()
          ctx.arc(it.x + 22, it.y + it.h / 2, 8, 0, TAU)
          ctx.fill()
          ctx.strokeStyle = on ? C.cream : C.ink
          ctx.lineWidth = 2
          ctx.stroke()
        }
        label(ctx, it.text, it.x + 42, it.y + it.h / 2 + 1, { font: gfont(30), color: col, align: 'left' })
        if (it.n) label(ctx, `${it.n}`, it.x + it.w - 16, it.y + it.h / 2 + 1, { font: nfont(24), color: on ? C.cream : C.inkSoft, align: 'right' })
        if (on && !dot) label(ctx, '▶', it.x + 16, it.y + it.h / 2 + 1, { font: nfont(18), color: C.cream, align: 'left' })
      }
    }
    const HINTS = {
      choose: 'Tip: blue units are yours. Each acts once a turn.',
      move: 'Tip: red dots show what it could hit from there.',
      menu: 'Tip: Attack and Heal appear when someone is in range.',
      target: 'Tip: the panel shows the result before you commit.'
    }
    function drawHint(ctx) {
      if (battle !== 0 || phase !== 'player' || seq.length) return
      const id = !sel ? 'choose' : sel.step === 'move' ? 'move' : sel.step === 'menu' ? 'menu' : sel.step === 'target' ? 'target' : null
      if (!id || hints[id] >= 2 || (id === 'choose' && !blueReady().length)) return
      const rowY = sel?.step === 'menu' ? sel.u.y : cur.y
      const top = rowY >= 3
      // straddles the board's frame, so it hides as little of the board as possible
      const h = 44
      const maxW = N * TS + 20
      let px = 25
      while (px > 20 && measure(HINTS[id], gfont(px)) + 40 > maxW) px--
      const f = gfont(px)
      const w = Math.min(maxW, measure(HINTS[id], f) + 40)
      const x = BX + (N * TS - w) / 2
      const y = top ? BY - h / 2 - 4 : BY + N * TS - h / 2 + 4
      ctx.fillStyle = 'rgba(43,29,20,0.86)'
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, 12)
      ctx.fill()
      ctx.strokeStyle = C.goldLight
      ctx.lineWidth = 2
      ctx.stroke()
      label(ctx, HINTS[id], x + w / 2, y + h / 2 + 1, { font: f, color: C.cream })
    }
    function drawHeader(ctx) {
      label(ctx, `Battle ${battle + 1} of ${T.battles}`, BX - 20, 66, { font: gfont(44), color: C.ink, align: 'left' })
      // battle pips
      for (let i = 0; i < T.battles; i++) {
        const x = BX + 290 + i * 34
        ctx.beginPath()
        ctx.arc(x, 66, 11, 0, TAU)
        ctx.fillStyle = i < won ? C.gold : i === battle ? 'rgba(246,234,208,0.9)' : 'rgba(43,29,20,0.12)'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = C.ink
        ctx.stroke()
      }
      label(ctx, `Turn ${Math.min(turn, T.turnLimit)} / ${T.turnLimit}`, BX + 410, 68, { font: nfont(26), color: C.inkSoft, align: 'left' })
      label(ctx, `${run.score}`, 1118, 64, { font: nfont(44), color: C.ink, align: 'right' })
      label(ctx, 'points', 1118, 98, { font: gfont(24), color: C.inkSoft, align: 'right' })
    }
    function drawPanel(ctx) {
      const p = PANEL
      const x = p.x + 28
      // whose turn, and how many units can still act
      const heading = phase === 'player' ? 'Your turn' : phase === 'cpu' ? 'Enemy turn' : phase === 'result' ? (result.victory ? 'Victory' : 'Defeat') : 'Prepare'
      const hcol = phase === 'cpu' || (phase === 'result' && !result.victory) ? C.red : phase === 'player' || phase === 'result' ? C.blue : C.ink
      label(ctx, heading, x, p.y + 38, { font: gfont(38), color: hcol, align: 'left' })
      if (phase === 'player') label(ctx, `${blueReady().length} of ${alive(b, 'blue').length} ready`, p.x + p.w - 28, p.y + 40, { font: nfont(26), color: C.ink, align: 'right' })

      // ① Unit → ② Move → ③ Act
      const cur3 = stepNo()
      const steps = ['① Unit', '② Move', '③ Act']
      const sf = nfont(24)
      const gap = 30
      const widths = steps.map((t) => measure(t, sf) + 26)
      let sx = x
      steps.forEach((t, i) => {
        const on = cur3 === i + 1
        ctx.beginPath()
        ctx.roundRect(sx, p.y + 70, widths[i], 40, 20)
        ctx.fillStyle = on ? C.blue : 'rgba(43,29,20,0.07)'
        ctx.fill()
        ctx.strokeStyle = on ? C.ink : 'rgba(43,29,20,0.25)'
        ctx.lineWidth = on ? 2.5 : 1.5
        ctx.stroke()
        label(ctx, t, sx + widths[i] / 2, p.y + 91, { font: sf, color: on ? C.cream : 'rgba(43,29,20,0.4)' })
        sx += widths[i]
        if (i < 2) label(ctx, '→', sx + gap / 2, p.y + 90, { font: nfont(22), color: 'rgba(43,29,20,0.4)' })
        sx += gap
      })

      // what to do next, in words, with the button
      const lines = wrap(instruction(), nfont(28), p.w - 56).slice(0, 2)
      lines.forEach((l, i) => label(ctx, l, x, p.y + 140 + i * 34, { font: nfont(28), color: C.ink, align: 'left' }))
      ctx.strokeStyle = C.inkSoft
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x, p.y + 200)
      ctx.lineTo(p.x + p.w - 28, p.y + 200)
      ctx.stroke()

      // unit card: hovered unit, else the selected one
      const u = (sel?.step === 'menu' || sel?.step === 'target' ? sel.u : null) ?? (phase === 'player' || phase === 'intro' ? unitAt(b, cur.x, cur.y) : null) ?? sel?.u ?? cpuSel?.u
      const cy = p.y + 248
      if (phase === 'result') {
        label(ctx, result.victory ? `Battle ${battle + 1} won!` : `Battle ${battle + 1} lost`, x, cy - 14, { font: gfont(34), color: result.victory ? C.blue : C.red, align: 'left' })
        label(ctx, result.last ? (result.victory ? 'Every battle won. Well fought!' : 'Your campaign ends here.') : 'A fresh field awaits.', x, cy + 24, { font: gfont(26), color: C.inkSoft, align: 'left' })
      } else if (u) {
        const s = S(u)
        drawToken(ctx, x + 32, cy, 30, u.side, u.kind, { dim: u.side === 'blue' && u.acted && phase === 'player' })
        if (u.side === 'blue' && u.acted && phase === 'player') drawTick(ctx, x + 56, cy - 20, 11)
        label(ctx, `${u.side === 'blue' ? 'Your' : 'Red'} ${s.name}`, x + 80, cy - 16, { font: gfont(32), color: u.side === 'blue' ? C.blue : C.red, align: 'left' })
        drawPips(ctx, x + 80 + (s.hp * 12) / 2, cy + 8, u.hp, s.hp, u.side)
        label(ctx, `${u.hp} / ${s.hp} HP`, x + 90 + s.hp * 12, cy + 14, { font: nfont(24), color: C.ink, align: 'left' })
        const atk = attackAt(b, u, u.x, u.y)
        const range = s.min === s.max ? `${s.max}` : `${s.min}–${s.max}`
        label(ctx, `Move ${s.move}   Range ${range}   Attack ${atk}${atk > s.atk ? '★' : ''}`, x, cy + 54, { font: nfont(24), color: C.ink, align: 'left' })
        label(ctx, s.role, x, cy + 86, { font: gfont(24), color: C.inkSoft, align: 'left' })
      } else {
        const t = b.tiles[key(cur.x, cur.y)]
        const what = t === ROCK ? ['Rock', 'Blocks movement. Arrows fly over.'] : t === TREE ? ['Tree', 'Blocks movement. Arrows fly over.'] : t === SHRINE ? ['Shrine', `Stand here for +${T.shrineBonus} attack.`] : ['Open ground', 'Defeat every red unit to win.']
        label(ctx, what[0], x, cy - 14, { font: gfont(34), color: C.ink, align: 'left' })
        label(ctx, what[1], x, cy + 24, { font: gfont(26), color: C.inkSoft, align: 'left' })
      }

      // what the highlighted choice will do
      const [l1, l2, danger] = phase === 'result' ? [''] : preview()
      const by = p.y + 382
      if (l1) {
        ctx.fillStyle = 'rgba(201,154,46,0.14)'
        ctx.beginPath()
        ctx.roundRect(x - 8, by - 26, p.w - 40, l2 ? 84 : 52, 10)
        ctx.fill()
        ctx.strokeStyle = 'rgba(150,110,30,0.5)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        label(ctx, l1, x + 6, by, { font: nfont(26), color: C.ink, align: 'left' })
        if (l2) label(ctx, l2, x + 6, by + 34, { font: nfont(24), color: danger ? C.red : C.inkSoft, align: 'left' })
      }

      // roster: every unit's health at a glance
      const ry = p.y + 462
      let rx = x + 18
      for (const side of ['blue', 'red']) {
        for (const kind of KINDS) {
          const v = b.units.find((q) => q.side === side && q.kind === kind)
          ctx.globalAlpha = v.hp > 0 ? 1 : 0.35
          drawToken(ctx, rx, ry, 15, side, kind, { dim: v.hp > 0 && phase === 'player' && side === 'blue' && v.acted })
          label(ctx, v.hp > 0 ? `${v.hp}` : '✕', rx + 24, ry + 2, { font: nfont(24), color: v.hp > 0 ? C.ink : C.red, align: 'left' })
          ctx.globalAlpha = 1
          rx += 66
        }
        rx += 34
      }

      // buttons
      for (const bt of buttons()) {
        const hot = input.pointer.active && inside(input.pointer, bt) && (input.mode === 'mouse')
        ctx.fillStyle = 'rgba(50,28,10,0.25)'
        ctx.beginPath()
        ctx.roundRect(bt.x + 3, bt.y + 5, bt.w, bt.h, 12)
        ctx.fill()
        ctx.fillStyle = bt.id === 'end' ? (hot ? '#8a5530' : C.wood) : hot ? '#fff3d8' : '#efdcb4'
        ctx.beginPath()
        ctx.roundRect(bt.x, bt.y, bt.w, bt.h, 12)
        ctx.fill()
        ctx.strokeStyle = C.ink
        ctx.lineWidth = 3
        ctx.stroke()
        const showKey = bt.kw > 0
        const tx = bt.x + (bt.w - bt.kw - (showKey ? 10 : 0)) / 2
        label(ctx, bt.text, tx, bt.y + bt.h / 2 + 1, { font: gfont(30), color: bt.id === 'end' ? C.cream : C.ink })
        if (showKey) {
          const k = input.label(bt.key)
          const kw = bt.kw
          const kx = bt.x + bt.w - kw - 14
          ctx.fillStyle = bt.id === 'end' ? 'rgba(246,234,208,0.25)' : 'rgba(43,29,20,0.12)'
          ctx.beginPath()
          ctx.roundRect(kx, bt.y + bt.h / 2 - 14, kw, 28, 8)
          ctx.fill()
          label(ctx, k, kx + kw / 2, bt.y + bt.h / 2 + 1, { font: nfont(18), color: bt.id === 'end' ? C.cream : C.ink })
        }
      }
    }
    /** A full-width ribbon that sweeps across the screen: in from the left, out to the right. */
    function drawBanner(ctx) {
      const k = banner.t / banner.dur
      const ease = (v) => 1 - (1 - v) ** 3
      const sx = k < 0.22 ? -W * (1 - ease(k / 0.22)) : k > 0.8 ? W * ease((k - 0.8) / 0.2) : 0
      const cy = BY + (N * TS) / 2
      const h = 120
      ctx.save()
      ctx.translate(sx, 0)
      ctx.fillStyle = 'rgba(40,22,8,0.3)'
      ctx.fillRect(0, cy - h / 2 + 8, W, h)
      ctx.fillStyle = '#f3e4c4'
      ctx.fillRect(0, cy - h / 2, W, h)
      ctx.fillStyle = banner.color
      ctx.fillRect(0, cy - h / 2, W, 12)
      ctx.fillRect(0, cy + h / 2 - 12, W, 12)
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(0, cy - h / 2)
      ctx.lineTo(W, cy - h / 2)
      ctx.moveTo(0, cy + h / 2)
      ctx.lineTo(W, cy + h / 2)
      ctx.stroke()
      // the text trails the ribbon a little, for a sweep
      const tx = W / 2 + (k < 0.3 ? -120 * (1 - ease(k / 0.3)) : 0)
      label(ctx, banner.text, tx, cy + 2, { font: gfont(64), color: banner.color })
      ctx.restore()
    }
    function drawResult(ctx) {
      const k = Math.min(1, result.t / 0.35)
      const cx = BX + (N * TS) / 2
      const w = 480
      const h = 360 + (result.timeUp ? 24 : 0) + result.pts.rows.length * 12
      const y0 = BY + (N * TS - h) / 2 + (1 - k) * 30
      ctx.globalAlpha = k
      ctx.fillStyle = 'rgba(40,22,8,0.3)'
      ctx.fillRect(BX, BY, N * TS, N * TS)
      ctx.fillStyle = 'rgba(50,28,10,0.35)'
      ctx.beginPath()
      ctx.roundRect(cx - w / 2 + 6, y0 + 10, w, h, 16)
      ctx.fill()
      ctx.fillStyle = '#f4e6c8'
      ctx.beginPath()
      ctx.roundRect(cx - w / 2, y0, w, h, 16)
      ctx.fill()
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 3
      ctx.stroke()
      label(ctx, result.victory ? 'Victory!' : 'Defeat', cx, y0 + 62, { font: gfont(64), color: result.victory ? C.blue : C.red })
      let y = y0 + 128
      if (result.timeUp) {
        label(ctx, `Turn ${T.turnLimit} is over: ${result.victory ? 'you' : 'they'} kept more HP.`, cx, y0 + 108, { font: gfont(24), color: C.inkSoft })
        y += 16
      }
      for (const [name, n, pts] of result.pts.rows) {
        label(ctx, n !== '' ? `${name} × ${n}` : name, cx - w / 2 + 40, y, { font: gfont(28), color: C.ink, align: 'left' })
        label(ctx, `+${pts}`, cx + w / 2 - 40, y, { font: nfont(28), color: C.ink, align: 'right' })
        y += 40
      }
      ctx.strokeStyle = C.inkSoft
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(cx - w / 2 + 40, y - 14)
      ctx.lineTo(cx + w / 2 - 40, y - 14)
      ctx.stroke()
      label(ctx, `+${result.pts.total}`, cx + w / 2 - 40, y + 14, { font: nfont(34), color: '#8a6414', align: 'right' })
      if (result.t > 0.9) {
        const next = result.last ? 'to see your results' : `for Battle ${battle + 2}`
        label(ctx, `${input.label('a')} ${next}`, cx, y0 + h - 34, { font: gfont(28), color: C.inkSoft })
      }
      ctx.globalAlpha = 1
    }

    startBattle()
    return run
  }
}
