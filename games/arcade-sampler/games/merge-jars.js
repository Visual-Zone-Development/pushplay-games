// Merge Jars: slide every jar on a 4×4 pantry shelf; two equal jars merge into the next fruit.
// Twist: a sticky honey pot lands now and then and blocks its cell for a few slides.
// Style: paper and pastel (cream paper grain, soft shadows, gingham lids, a wooden shelf).
// The board rules are pure functions (exported as LOGIC) so a headless bot can test the balance.
import { W, H, TAU, clamp, rand, label, createFx } from '../common.js'

const TUNING = {
  roundSeconds: 120,
  slideTime: 0.12, // s, jars gliding to their new spot
  popTime: 0.26, // s, squash-and-stretch on a merge
  spawnTime: 0.2, // s, a new jar growing in
  spawnCherryChance: 0.12, // a new jar is a cherry instead of a berry
  points: [0, 3, 6, 14, 32, 70, 150, 330], // for making each fruit
  shipBonus: 700, // two crown jars merge and get shipped off the shelf
  comboStep: 0.5, // ×1, ×1.5, ×2… for 1, 2, 3… merges in one slide
  honeyAfter: 8, // slides before the first honey pot may appear
  honeyChance: 0.1, // per slide, when no honey is on the shelf
  honeyMoves: 3, // slides a honey pot stays stuck
  swipe: 60, // px of drag that counts as a swipe
  undos: 1
}

const CHAIN = [
  { name: 'Berry', fruit: '#7f8fdc', jam: '#8d9be3', lid: '#cfd6f7' },
  { name: 'Cherry', fruit: '#e65f78', jam: '#ef8195', lid: '#f8cdd4' },
  { name: 'Plum', fruit: '#9a6cc4', jam: '#b48ad6', lid: '#e3d2f2' },
  { name: 'Peach', fruit: '#f49b7e', jam: '#f8b49b', lid: '#fde0d2' },
  { name: 'Orange', fruit: '#f39a3a', jam: '#f7b35f', lid: '#fde2b8' },
  { name: 'Melon', fruit: '#6dbb72', jam: '#93d193', lid: '#d4efcf' },
  { name: 'Golden', fruit: '#e9b730', jam: '#f3cd52', lid: '#fff0b0' },
  { name: 'Crown', fruit: '#e2557e', jam: '#f07ca0', lid: '#ffd6e4' }
]
const TOP = CHAIN.length - 1
const INK = '#6a4a3a'
const CREAM = '#f6ecd9'

// ---- board logic (pure) -------------------------------------------------------------------------

const N = 4
const DIRS = ['left', 'right', 'up', 'down']
let nextId = 1
const jar = (lv) => ({ k: 'jar', lv, id: nextId++ })
const honey = (n) => ({ k: 'honey', n, id: nextId++ })
const emptyGrid = () => Array.from({ length: N }, () => Array(N).fill(null))
const cloneGrid = (g) => g.map((row) => row.map((c) => (c ? { ...c } : null)))
const empties = (g) => {
  const out = []
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!g[r][c]) out.push([r, c])
  return out
}
/** The cells of line i, starting at the wall the jars slide toward. */
function lineCells(dir, i) {
  const out = []
  for (let j = 0; j < N; j++) {
    if (dir === 'left') out.push([i, j])
    else if (dir === 'right') out.push([i, N - 1 - j])
    else if (dir === 'up') out.push([j, i])
    else out.push([N - 1 - j, i])
  }
  return out
}
/**
 * Slide every jar toward dir. Honey pots don't move and act as walls. Each jar merges once per
 * slide. Returns the new grid, whether anything changed, the merges and every jar's path.
 */
function slide(grid, dir) {
  const g = emptyGrid()
  const merges = []
  const paths = []
  let moved = false
  for (let i = 0; i < N; i++) {
    const cells = lineCells(dir, i)
    let target = 0
    let last = null // { r, c, merged }
    for (let j = 0; j < N; j++) {
      const [r, c] = cells[j]
      const cell = grid[r][c]
      if (!cell) continue
      if (cell.k === 'honey') {
        g[r][c] = { ...cell }
        target = j + 1
        last = null
        continue
      }
      if (last && !last.merged && g[last.r][last.c].lv === cell.lv) {
        const lv = cell.lv + 1
        paths.push({ id: cell.id, lv: cell.lv, fr: r, fc: c, tr: last.r, tc: last.c, gone: true })
        g[last.r][last.c] = { k: 'jar', lv, id: nextId++ }
        last.merged = true
        merges.push({ r: last.r, c: last.c, lv })
        moved = true
        continue
      }
      const [tr, tc] = cells[target]
      g[tr][tc] = { ...cell }
      paths.push({ id: cell.id, lv: cell.lv, fr: r, fc: c, tr, tc, gone: false })
      if (tr !== r || tc !== c) moved = true
      last = { r: tr, c: tc, merged: false }
      target++
    }
  }
  // Two crown jars ship off the shelf.
  for (const m of merges) if (m.lv > TOP) g[m.r][m.c] = null
  return { grid: g, moved, merges, paths }
}
const canMove = (g) => DIRS.some((d) => slide(g, d).moved)
const honeyCells = (g) => {
  const out = []
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (g[r][c]?.k === 'honey') out.push([r, c])
  return out
}
function scoreMerges(merges, T) {
  if (!merges.length) return 0
  let pts = 0
  for (const m of merges) pts += m.lv > TOP ? T.shipBonus : T.points[m.lv]
  return Math.round(pts * (1 + T.comboStep * (merges.length - 1)))
}
/** After a slide: honey ticks down, a new jar lands, maybe a honey pot. Returns what spawned. */
function afterSlide(g, slides, T, rnd = Math.random) {
  for (const [r, c] of honeyCells(g)) if (--g[r][c].n <= 0) g[r][c] = null
  const spawned = []
  let e = empties(g)
  if (e.length) {
    const [r, c] = e[Math.floor(rnd() * e.length)]
    g[r][c] = jar(rnd() < T.spawnCherryChance ? 1 : 0)
    spawned.push([r, c])
  }
  e = empties(g)
  if (e.length > 2 && slides >= T.honeyAfter && !honeyCells(g).length && rnd() < T.honeyChance) {
    const [r, c] = e[Math.floor(rnd() * e.length)]
    g[r][c] = honey(T.honeyMoves)
    spawned.push([r, c])
  }
  return spawned
}
function newBoard(T, rnd = Math.random) {
  const g = emptyGrid()
  for (let i = 0; i < 2; i++) {
    const e = empties(g)
    const [r, c] = e[Math.floor(rnd() * e.length)]
    g[r][c] = jar(0)
  }
  return g
}
export const LOGIC = { N, DIRS, slide, canMove, scoreMerges, afterSlide, newBoard, cloneGrid, empties, honeyCells, CHAIN, TUNING }

// ---- art ----------------------------------------------------------------------------------------

function bake(w, h, draw, scale = 2) {
  const c = document.createElement('canvas')
  c.width = Math.ceil(w * scale)
  c.height = Math.ceil(h * scale)
  const g = c.getContext('2d')
  g.scale(scale, scale)
  draw(g)
  return { canvas: c, w, h }
}

/** A fruit doodle, centred, about r in radius. */
function drawFruit(g, lv, x, y, r) {
  const f = CHAIN[lv]
  g.save()
  g.translate(x, y)
  g.lineWidth = Math.max(1.5, r * 0.12)
  g.strokeStyle = INK
  g.lineJoin = 'round'
  const leaf = (lx, ly, a, s = 1) => {
    g.save()
    g.translate(lx, ly)
    g.rotate(a)
    g.beginPath()
    g.moveTo(0, 0)
    g.quadraticCurveTo(r * 0.45 * s, -r * 0.35 * s, r * 0.9 * s, 0)
    g.quadraticCurveTo(r * 0.45 * s, r * 0.35 * s, 0, 0)
    g.fillStyle = '#8fc77e'
    g.fill()
    g.stroke()
    g.restore()
  }
  const ball = (bx, by, br, col) => {
    g.beginPath()
    g.arc(bx, by, br, 0, TAU)
    g.fillStyle = col
    g.fill()
    g.stroke()
    g.beginPath()
    g.arc(bx - br * 0.35, by - br * 0.35, br * 0.25, 0, TAU)
    g.fillStyle = 'rgba(255,255,255,0.7)'
    g.fill()
  }
  if (lv === 0) {
    ball(-r * 0.42, r * 0.22, r * 0.46, f.fruit)
    ball(r * 0.42, r * 0.22, r * 0.46, f.fruit)
    ball(0, -r * 0.3, r * 0.46, f.fruit)
  } else if (lv === 1) {
    g.beginPath()
    g.moveTo(-r * 0.4, r * 0.1)
    g.quadraticCurveTo(-r * 0.2, -r * 0.6, r * 0.15, -r * 0.95)
    g.moveTo(r * 0.45, r * 0.1)
    g.quadraticCurveTo(r * 0.3, -r * 0.5, r * 0.15, -r * 0.95)
    g.stroke()
    leaf(r * 0.15, -r * 0.95, -0.3, 0.7)
    ball(-r * 0.42, r * 0.38, r * 0.48, f.fruit)
    ball(r * 0.45, r * 0.38, r * 0.48, f.fruit)
  } else if (lv === 2) {
    g.beginPath()
    g.ellipse(0, r * 0.1, r * 0.78, r * 0.9, 0.25, 0, TAU)
    g.fillStyle = f.fruit
    g.fill()
    g.stroke()
    g.beginPath()
    g.moveTo(-r * 0.05, -r * 0.6)
    g.quadraticCurveTo(r * 0.35, 0, r * 0.1, r * 0.8)
    g.strokeStyle = 'rgba(80,40,90,0.45)'
    g.stroke()
    g.strokeStyle = INK
    leaf(-r * 0.1, -r * 0.75, -2.3, 0.8)
  } else if (lv === 3) {
    g.beginPath()
    g.arc(0, r * 0.1, r * 0.88, 0, TAU)
    g.fillStyle = f.fruit
    g.fill()
    g.stroke()
    g.beginPath()
    g.moveTo(0, -r * 0.7)
    g.quadraticCurveTo(-r * 0.35, r * 0.1, 0, r * 0.95)
    g.strokeStyle = 'rgba(160,70,50,0.45)'
    g.stroke()
    g.strokeStyle = INK
    g.beginPath()
    g.arc(r * 0.3, -r * 0.1, r * 0.32, 0, TAU)
    g.fillStyle = 'rgba(255,240,210,0.55)'
    g.fill()
    leaf(0, -r * 0.75, -0.6, 0.8)
  } else if (lv === 4) {
    g.beginPath()
    g.arc(0, r * 0.08, r * 0.9, 0, TAU)
    g.fillStyle = f.fruit
    g.fill()
    g.stroke()
    g.fillStyle = 'rgba(160,80,10,0.35)'
    for (const [dx, dy] of [[-0.4, 0.2], [0.3, 0.4], [0.1, -0.2], [-0.1, 0.6], [0.5, -0.05], [-0.5, -0.25]]) {
      g.beginPath()
      g.arc(dx * r, dy * r, r * 0.06, 0, TAU)
      g.fill()
    }
    leaf(0, -r * 0.8, -0.5, 0.8)
  } else if (lv === 5) {
    g.beginPath()
    g.ellipse(0, r * 0.05, r, r * 0.78, 0, 0, TAU)
    g.fillStyle = f.fruit
    g.fill()
    g.save()
    g.clip()
    g.strokeStyle = '#3f8a4c'
    g.lineWidth = r * 0.16
    for (let k = -2; k <= 2; k++) {
      g.beginPath()
      g.moveTo(k * r * 0.4, -r)
      g.quadraticCurveTo(k * r * 0.62, 0, k * r * 0.4, r)
      g.stroke()
    }
    g.restore()
    g.lineWidth = Math.max(1.5, r * 0.12)
    g.strokeStyle = INK
    g.beginPath()
    g.ellipse(0, r * 0.05, r, r * 0.78, 0, 0, TAU)
    g.stroke()
  } else if (lv === 6) {
    // a golden apple with a sparkle
    g.beginPath()
    g.moveTo(0, -r * 0.55)
    g.bezierCurveTo(r * 0.6, -r * 1.0, r * 1.15, -r * 0.2, r * 0.7, r * 0.55)
    g.bezierCurveTo(r * 0.45, r * 1.0, r * 0.1, r * 0.85, 0, r * 0.75)
    g.bezierCurveTo(-r * 0.1, r * 0.85, -r * 0.45, r * 1.0, -r * 0.7, r * 0.55)
    g.bezierCurveTo(-r * 1.15, -r * 0.2, -r * 0.6, -r * 1.0, 0, -r * 0.55)
    g.fillStyle = f.fruit
    g.fill()
    g.stroke()
    leaf(0, -r * 0.55, -1.0, 0.75)
    star(g, -r * 0.3, -r * 0.05, r * 0.28, '#fffbe6')
  } else {
    // crown
    g.beginPath()
    g.moveTo(-r * 0.9, r * 0.6)
    g.lineTo(-r * 0.95, -r * 0.45)
    g.lineTo(-r * 0.45, r * 0.05)
    g.lineTo(0, -r * 0.75)
    g.lineTo(r * 0.45, r * 0.05)
    g.lineTo(r * 0.95, -r * 0.45)
    g.lineTo(r * 0.9, r * 0.6)
    g.closePath()
    g.fillStyle = '#f3cd52'
    g.fill()
    g.stroke()
    for (const [dx, dy] of [[-0.95, -0.45], [0, -0.75], [0.95, -0.45]]) {
      g.beginPath()
      g.arc(dx * r, dy * r, r * 0.14, 0, TAU)
      g.fillStyle = f.fruit
      g.fill()
      g.stroke()
    }
    g.beginPath()
    g.arc(0, r * 0.3, r * 0.17, 0, TAU)
    g.fillStyle = f.fruit
    g.fill()
  }
  g.restore()
}
function star(g, x, y, r, col) {
  g.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2
    const rr = i % 2 ? r * 0.3 : r
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  g.closePath()
  g.fillStyle = col
  g.fill()
}

/** A jam jar centred on (0, 0): about 104 wide, from y −62 (lid top) to +56 (base). */
function drawJar(g, lv) {
  const f = CHAIN[lv]
  g.lineJoin = 'round'
  g.lineWidth = 3
  g.strokeStyle = INK
  // body
  const body = () => {
    g.beginPath()
    g.roundRect(-48, -36, 96, 92, [18, 18, 24, 24])
  }
  body()
  g.fillStyle = '#fbf5ea'
  g.fill()
  g.save()
  body()
  g.clip()
  g.fillStyle = f.jam
  g.beginPath()
  g.moveTo(-50, -18)
  for (let x = -50; x <= 50; x += 10) g.quadraticCurveTo(x + 5, -24 + (x % 20 ? 4 : -2), x + 10, -18)
  g.lineTo(50, 60)
  g.lineTo(-50, 60)
  g.closePath()
  g.fill()
  // a darker base and a glass highlight
  g.fillStyle = 'rgba(90,40,40,0.12)'
  g.fillRect(-50, 38, 100, 20)
  g.fillStyle = 'rgba(255,255,255,0.55)'
  g.beginPath()
  g.roundRect(-40, -28, 9, 70, 5)
  g.fill()
  g.restore()
  body()
  g.stroke()
  // neck
  g.beginPath()
  g.roundRect(-38, -46, 76, 14, 5)
  g.fillStyle = '#f4ecdc'
  g.fill()
  g.stroke()
  // gingham cloth lid with a scalloped hem
  g.save()
  const cloth = () => {
    g.beginPath()
    g.moveTo(-44, -60)
    g.quadraticCurveTo(0, -72, 44, -60)
    g.lineTo(52, -38)
    for (let i = 0; i < 6; i++) {
      const x0 = 52 - i * (104 / 6)
      g.quadraticCurveTo(x0 - 104 / 12, -28, x0 - 104 / 6, -38)
    }
    g.closePath()
  }
  cloth()
  g.fillStyle = f.lid
  g.fill()
  g.clip()
  g.fillStyle = f.jam
  g.globalAlpha = 0.45
  for (let x = -56; x < 56; x += 12) g.fillRect(x, -74, 6, 50)
  for (let y = -72; y < -26; y += 12) g.fillRect(-56, y, 112, 6)
  g.globalAlpha = 1
  g.restore()
  cloth()
  g.stroke()
  // string
  g.beginPath()
  g.moveTo(-44, -44)
  g.quadraticCurveTo(0, -38, 44, -44)
  g.lineWidth = 4
  g.strokeStyle = '#b5856a'
  g.stroke()
  g.lineWidth = 3
  g.strokeStyle = INK
  // paper label
  g.beginPath()
  g.roundRect(-33, -6, 66, 48, 8)
  g.fillStyle = '#fffaf0'
  g.fill()
  g.lineWidth = 2.5
  g.stroke()
  g.beginPath()
  g.roundRect(-28, -1, 56, 38, 5)
  g.setLineDash([3, 3])
  g.strokeStyle = 'rgba(106,74,58,0.4)'
  g.lineWidth = 1.5
  g.stroke()
  g.setLineDash([])
  drawFruit(g, lv, 0, 18, 15)
}

/** The honey pot: round, amber, dripping. Centred like a jar. */
function drawHoney(g) {
  g.lineJoin = 'round'
  g.lineWidth = 3
  g.strokeStyle = INK
  g.beginPath()
  g.moveTo(-34, -34)
  g.bezierCurveTo(-70, -20, -66, 56, -30, 56)
  g.lineTo(30, 56)
  g.bezierCurveTo(66, 56, 70, -20, 34, -34)
  g.closePath()
  g.fillStyle = '#f2b543'
  g.fill()
  g.save()
  g.clip()
  g.fillStyle = 'rgba(255,255,255,0.35)'
  g.beginPath()
  g.ellipse(-28, 4, 9, 26, 0.2, 0, TAU)
  g.fill()
  g.fillStyle = 'rgba(160,90,10,0.18)'
  g.fillRect(-70, 34, 140, 30)
  g.restore()
  g.stroke()
  // rim and drips
  g.beginPath()
  g.roundRect(-40, -46, 80, 16, 8)
  g.fillStyle = '#e09a2a'
  g.fill()
  g.stroke()
  g.beginPath()
  g.moveTo(-34, -32)
  g.lineTo(-34, -14)
  g.arc(-28, -14, 6, Math.PI, 0, true)
  g.lineTo(-22, -32)
  g.moveTo(8, -32)
  g.lineTo(8, -4)
  g.arc(14, -4, 6, Math.PI, 0, true)
  g.lineTo(20, -32)
  g.fillStyle = '#e09a2a'
  g.fill()
  // dipper
  g.save()
  g.rotate(0.35)
  g.fillStyle = '#c98f5e'
  g.beginPath()
  g.roundRect(-4, -84, 8, 46, 4)
  g.fill()
  g.stroke()
  g.beginPath()
  g.roundRect(-11, -92, 22, 16, 6)
  g.fill()
  g.stroke()
  g.restore()
  // honeycomb label
  g.fillStyle = '#fff4d6'
  g.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU
    g.lineTo(Math.cos(a) * 20, 18 + Math.sin(a) * 20)
  }
  g.closePath()
  g.fill()
  g.lineWidth = 2.5
  g.stroke()
}

/** Cream paper with grain and fibres, baked once. */
function paper(g, w, h, density = 1) {
  g.fillStyle = CREAM
  g.fillRect(0, 0, w, h)
  const grad = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.7)
  grad.addColorStop(0, 'rgba(255,250,240,0.5)')
  grad.addColorStop(1, 'rgba(180,140,100,0.18)')
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
  const n = Math.floor(w * h * 0.03 * density)
  for (let i = 0; i < n; i++) {
    const dark = Math.random() < 0.55
    g.fillStyle = dark ? `rgba(120,90,60,${rand(0.03, 0.09)})` : `rgba(255,255,255,${rand(0.08, 0.25)})`
    const s = Math.random() < 0.9 ? 1 : 2
    g.fillRect(Math.random() * w, Math.random() * h, s, s)
  }
  g.strokeStyle = 'rgba(140,100,70,0.06)'
  g.lineWidth = 1
  for (let i = 0; i < n / 60; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const a = rand(0, TAU)
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + Math.cos(a) * 6 + rand(-3, 3), y + Math.sin(a) * 6 + rand(-3, 3), x + Math.cos(a) * 12, y + Math.sin(a) * 12)
    g.stroke()
  }
}

// Board geometry
const CELL = 128
const GAP = 16
const SPAN = N * CELL + (N - 1) * GAP // 560
const BX = W / 2 - SPAN / 2 // 360
const BY = 132
const cellX = (c) => BX + c * (CELL + GAP) + CELL / 2
const rowTop = (r) => BY + r * (CELL + GAP)
const jarY = (r) => rowTop(r) + CELL - 60 // the jar's centre so its base sits on the plank
const FRAME = { x: BX - 34, y: BY - 34, w: SPAN + 68, h: SPAN + 64 }
const LEFT = { x: 40, w: 250 }
const RIGHT = { x: W - 40 - 250, w: 250 }
const UNDO_BTN = { x: RIGHT.x, y: 560, w: RIGHT.w, h: 84 }

function woodPlank(g, x, y, w, h, base = '#d9a272') {
  g.fillStyle = base
  g.beginPath()
  g.roundRect(x, y, w, h, Math.min(6, h / 2))
  g.fill()
  g.strokeStyle = 'rgba(110,60,30,0.18)'
  g.lineWidth = 1.5
  for (let i = 0; i < Math.max(2, h / 7); i++) {
    const yy = y + 3 + Math.random() * (h - 6)
    g.beginPath()
    g.moveTo(x + 4, yy)
    for (let xx = x + 4; xx < x + w - 4; xx += 40) g.quadraticCurveTo(xx + 20, yy + rand(-2, 2), xx + 40, yy + rand(-1, 1))
    g.stroke()
  }
  g.fillStyle = 'rgba(255,240,215,0.35)'
  g.fillRect(x + 3, y + 1, w - 6, 3)
}

function paperCard(g, x, y, w, h, tilt = 0) {
  g.save()
  g.translate(x + w / 2, y + h / 2)
  g.rotate(tilt)
  g.shadowColor = 'rgba(90,60,40,0.25)'
  g.shadowBlur = 14
  g.shadowOffsetY = 6
  g.fillStyle = '#fffaf1'
  g.beginPath()
  g.roundRect(-w / 2, -h / 2, w, h, 14)
  g.fill()
  g.shadowColor = 'transparent'
  g.strokeStyle = 'rgba(106,74,58,0.25)'
  g.lineWidth = 2
  g.stroke()
  // tape
  g.fillStyle = 'rgba(240,200,150,0.55)'
  g.save()
  g.translate(0, -h / 2)
  g.rotate(-0.06)
  g.fillRect(-34, -10, 68, 20)
  g.restore()
  g.restore()
}

function drawBackdrop(g) {
  paper(g, W, H)
  // soft pastel gingham border along the top
  g.fillStyle = 'rgba(232,99,122,0.08)'
  for (let x = 0; x < W; x += 40) g.fillRect(x, 0, 20, 28)
  // cabinet shadow, frame and back panel
  g.save()
  g.shadowColor = 'rgba(90,55,30,0.35)'
  g.shadowBlur = 28
  g.shadowOffsetY = 14
  g.fillStyle = '#b97e4f'
  g.beginPath()
  g.roundRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h, 22)
  g.fill()
  g.restore()
  woodPlank(g, FRAME.x, FRAME.y, FRAME.w, FRAME.h, '#c48a58')
  g.fillStyle = '#efdcbf'
  g.beginPath()
  g.roundRect(BX - 16, BY - 16, SPAN + 32, SPAN + 22, 10)
  g.fill()
  // wallpaper stripes inside the cabinet
  g.save()
  g.clip()
  g.fillStyle = 'rgba(255,255,255,0.28)'
  for (let x = BX - 16; x < BX + SPAN + 16; x += 36) g.fillRect(x, BY - 16, 14, SPAN + 30)
  g.fillStyle = 'rgba(232,150,120,0.12)'
  for (let x = BX + 2; x < BX + SPAN + 16; x += 36)
    for (let y = BY + 10; y < BY + SPAN; y += 44) {
      g.beginPath()
      g.arc(x, y, 3, 0, TAU)
      g.fill()
    }
  // inner shadow under the top of the frame
  const sh = g.createLinearGradient(0, BY - 16, 0, BY + 20)
  sh.addColorStop(0, 'rgba(90,50,20,0.25)')
  sh.addColorStop(1, 'rgba(90,50,20,0)')
  g.fillStyle = sh
  g.fillRect(BX - 16, BY - 16, SPAN + 32, 36)
  g.restore()
  // shelves
  for (let r = 0; r < N; r++) {
    const y = rowTop(r) + CELL - 4
    g.fillStyle = 'rgba(90,50,20,0.18)'
    g.fillRect(BX - 16, y + 14, SPAN + 32, 8)
    woodPlank(g, BX - 22, y - 2, SPAN + 44, 16, '#d9a272')
    g.fillStyle = 'rgba(120,70,30,0.35)'
    g.fillRect(BX - 22, y + 11, SPAN + 44, 3)
  }
  // side cards
  paperCard(g, LEFT.x, 132, LEFT.w, 150, -0.02)
  paperCard(g, LEFT.x, 306, LEFT.w, 420, 0.012)
  paperCard(g, RIGHT.x, 132, RIGHT.w, 150, 0.02)
  paperCard(g, RIGHT.x, 306, RIGHT.w, 230, -0.015)
  // calm strip for the prompt legend
  g.fillStyle = 'rgba(106,74,58,0.82)'
  g.fillRect(0, H - 50, W, 50)
  g.fillStyle = 'rgba(255,255,255,0.08)'
  for (let x = 0; x < W; x += 24) g.fillRect(x, H - 50, 12, 50)
}

let ART = null
const art = () =>
  (ART ??= {
    jars: CHAIN.map((_, lv) => bake(130, 150, (g) => (g.translate(65, 82), drawJar(g, lv)))),
    honey: bake(150, 170, (g) => (g.translate(75, 102), drawHoney(g))),
    backdrop: bake(W, H, drawBackdrop, 1.5),
    iconBg: bake(360, 170, (g) => {
      paper(g, 360, 170, 2)
      woodPlank(g, 20, 128, 320, 18)
      g.fillStyle = 'rgba(120,70,30,0.35)'
      g.fillRect(20, 143, 320, 3)
    })
  })
/** Blit a baked sprite with its anchor at (x, y), scaled sx × sy from its base (y + 56·s). */
function blitJar(ctx, sprite, x, y, s, sx = 1, sy = 1, anchorY = 82) {
  const w = sprite.w * s * sx
  const h = sprite.h * s * sy
  const baseY = y + 56 * s
  ctx.drawImage(sprite.canvas, x - w / 2, baseY - (anchorY + 56) * s * sy, w, h)
}
const easeOut = (k) => 1 - (1 - k) ** 3
const easeBack = (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2

// ---- the module ---------------------------------------------------------------------------------

export default {
  id: 'merge-jars',
  name: 'Merge Jars',
  blurb: 'Slide the shelf, merge the jam',
  scoreLabel: 'points',
  style: { bg: '#f3e3c8', accent: '#e8637a' },
  medals: [800, 2000, 3500],
  music: { bpm: 84, root: 53, chords: [0, 9, 5, 7], lead: [4, null, 2, null, 0, 2, 4, null], wave: 'sine', gain: 0.03, hats: false },
  TUNING,
  howTo: (input) =>
    input.mode === 'touch' || input.mode === 'mouse'
      ? 'Swipe the shelf to slide every jar · matching jars merge'
      : `${input.dpadLabel()} to slide · matching jars merge · ${input.label('b')} to undo`,
  icon(ctx, x, y, size, t) {
    const A = art()
    ctx.drawImage(A.iconBg.canvas, x - 180, y - 85, 360, 170)
    const s = size / 210
    const base = y + 85 - 42 - 56 * s
    const bob = (k) => Math.max(0, Math.sin(t * 2.2 + k)) * 0.06
    ctx.fillStyle = 'rgba(90,50,20,0.2)'
    for (const dx of [-95, 0, 95]) {
      ctx.beginPath()
      ctx.ellipse(x + dx, base + 56 * s + 2, 38, 6, 0, 0, TAU)
      ctx.fill()
    }
    blitJar(ctx, A.jars[1], x - 95, base, s, 1 + bob(0), 1 - bob(0))
    blitJar(ctx, A.jars[5], x, base, s * 1.12, 1 + bob(1.5) * 0.5, 1 - bob(1.5) * 0.5)
    blitJar(ctx, A.jars[3], x + 95, base, s, 1 + bob(3), 1 - bob(3))
  },
  create(env) {
    const { input, audio, settings, font } = env
    const T = env.TUNING
    const A = art()
    const fx = createFx(settings, { max: 220 })
    env.store.bestLv ??= 0

    let grid = newBoard(T)
    let time = T.roundSeconds
    let slides = 0
    let merges = 0
    let bestLv = 0
    let bestCombo = 0
    let shipped = 0
    let undosLeft = T.undos
    let snapshot = null
    let anim = null // { t, paths, after }
    let queued = null
    let pop = {} // "r,c" → { t, kind: 'merge' | 'spawn' }
    let floaters = []
    let banner = null // { text, t, color }
    let nudge = { x: 0, y: 0 }
    let wiggle = 0
    let ending = 0
    let endReason = ''
    let honeyTip = 0
    let seenHoney = false
    let lastTick = Math.ceil(time)
    let swipe = null
    const PAUSE_ZONE = { x: W - 130, y: 0, w: 130, h: 100 }
    const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
    let started = false

    const sfx = {
      whoosh: () => audio.noise({ dur: 0.09, gain: 0.05 }),
      slideTone: () => audio.tone({ freq: 240, dur: 0.08, type: 'triangle', slide: 90, gain: 0.06 }),
      pop: (lv, i) => {
        const f = 330 * 2 ** ((lv * 2 + i * 2) / 12)
        audio.tone({ freq: f, dur: 0.12, type: 'sine', slide: f * 0.6, gain: 0.16, delay: i * 0.05 })
        audio.tone({ freq: f * 2, dur: 0.06, type: 'triangle', gain: 0.05, delay: i * 0.05 })
      },
      chime: (n) => {
        ;[0, 4, 7, 12, 16].slice(0, Math.min(5, n + 1)).forEach((st, i) => audio.tone({ freq: 784 * 2 ** (st / 12), dur: 0.18, type: 'sine', gain: 0.09, delay: 0.1 + i * 0.06 }))
      },
      thud: () => {
        audio.tone({ freq: 110, dur: 0.12, type: 'triangle', slide: -50, gain: 0.2 })
        audio.noise({ dur: 0.05, gain: 0.06 })
      },
      squelch: () => {
        audio.tone({ freq: 180, dur: 0.18, type: 'sine', slide: 220, gain: 0.14 })
        audio.tone({ freq: 140, dur: 0.12, type: 'triangle', slide: -60, gain: 0.08, delay: 0.1 })
      },
      undo: () => audio.tone({ freq: 660, dur: 0.16, type: 'sine', slide: -330, gain: 0.12 }),
      tick: () => audio.tone({ freq: 990, dur: 0.04, type: 'sine', gain: 0.06 }),
      ship: () => [0, 4, 7, 12].forEach((st, i) => audio.tone({ freq: 523 * 2 ** (st / 12), dur: 0.3, type: 'triangle', gain: 0.1, delay: i * 0.08 })),
      end: () => audio.tone({ freq: 392, dur: 0.6, type: 'sine', slide: -150, gain: 0.14 })
    }

    function finish(reason) {
      if (ending) return
      const rescue = reason === 'Shelf full!' && undosLeft > 0 && snapshot
      ending = rescue ? 2.4 : 1.1
      endReason = reason
      queued = null
      sfx.end()
      if (bestLv > env.store.bestLv) {
        env.store.bestLv = bestLv
        env.saveNow()
      }
    }

    function tryMove(dir) {
      if (ending) return
      if (anim) {
        queued = dir
        return
      }
      const res = slide(grid, dir)
      if (!res.moved) {
        sfx.thud()
        wiggle = 0.25
        return
      }
      snapshot = { grid: cloneGrid(grid), score: run.score, merges, bestLv, shipped, slides, bestCombo }
      const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir]
      nudge = { x: d[0] * 7, y: d[1] * 7 }
      sfx.whoosh()
      sfx.slideTone()
      anim = {
        t: 0,
        dir: d,
        paths: res.paths,
        after: () => {
          grid = res.grid
          slides++
          const pts = scoreMerges(res.merges, T)
          run.score += pts
          merges += res.merges.length
          bestCombo = Math.max(bestCombo, res.merges.length)
          res.merges.forEach((m, i) => {
            const x = cellX(m.c)
            const y = jarY(m.r)
            if (m.lv > TOP) {
              shipped++
              fx.burst(x, y, CHAIN[TOP].jam, 30, 520, { size: 8, life: 0.9 })
              fx.burst(x, y, '#f3cd52', 20, 400, { size: 6, life: 0.9, square: true })
              fx.shake(0.6)
              sfx.ship()
              banner = { text: 'Shipped! Crown jars sold', t: 1.6, color: CHAIN[TOP].fruit }
              floaters.push({ x, y: y - 50, text: `+${T.shipBonus}`, t: 1.1, color: CHAIN[TOP].fruit })
              return
            }
            pop[`${m.r},${m.c}`] = { t: T.popTime, kind: 'merge' }
            bestLv = Math.max(bestLv, m.lv)
            const col = CHAIN[m.lv].jam
            fx.burst(x, y + 10, col, 10 + m.lv * 2, 260 + m.lv * 30, { size: 6, life: 0.55, gravity: 900 })
            fx.burst(x, y - 30, '#ffffff', 4, 160, { size: 3, life: 0.4, gravity: 200 })
            if (m.lv >= 4) fx.shake(0.12 + m.lv * 0.03)
            sfx.pop(m.lv, i)
            floaters.push({ x, y: y - 54, text: `+${T.points[m.lv]}`, t: 0.75, color: CHAIN[m.lv].fruit })
          })
          if (res.merges.length >= 2) {
            const mult = 1 + T.comboStep * (res.merges.length - 1)
            banner = { text: `${res.merges.length} merges · ×${mult}`, t: 1.2, color: '#e8637a' }
            sfx.chime(res.merges.length)
            if (res.merges.length >= 3) fx.shake(0.25)
          }
          const hadHoney = honeyCells(grid).length
          const spawned = afterSlide(grid, slides, T)
          if (hadHoney && !honeyCells(grid).length) honeyMelted()
          for (const [r, c] of spawned) {
            pop[`${r},${c}`] = { t: T.spawnTime, kind: 'spawn' }
            if (grid[r][c].k === 'honey') {
              audio.tone({ freq: 200, dur: 0.2, type: 'sine', slide: -80, gain: 0.14 })
              fx.burst(cellX(c), jarY(r) + 40, '#f2b543', 10, 180, { size: 6, life: 0.6 })
              if (!seenHoney) ((seenHoney = true), (honeyTip = 4))
            }
          }
          checkStuck()
        }
      }
    }
    function honeyMelted() {
      sfx.squelch()
    }
    function checkStuck() {
      if (canMove(grid)) return
      const hc = honeyCells(grid)
      if (hc.length) {
        // A stuck shelf melts the honey so the round can go on.
        for (const [r, c] of hc) {
          grid[r][c] = null
          fx.burst(cellX(c), jarY(r) + 20, '#f2b543', 16, 260, { size: 7, life: 0.7 })
        }
        sfx.squelch()
        banner = { text: 'The honey melted', t: 1.2, color: '#d08a1a' }
        if (canMove(grid)) return
      }
      finish('Shelf full!')
    }
    function undo() {
      const rescue = ending && endReason === 'Shelf full!'
      if ((ending && !rescue) || anim || !snapshot || undosLeft <= 0) {
        if (!anim && !ending) sfx.thud()
        return
      }
      ending = 0
      ;({ grid, merges, bestLv, shipped, slides, bestCombo } = snapshot)
      grid = cloneGrid(grid)
      run.score = snapshot.score
      snapshot = null
      undosLeft--
      queued = null
      floaters = []
      fx.clear()
      pop = {}
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c]) pop[`${r},${c}`] = { t: T.spawnTime * 0.6, kind: 'spawn' }
      banner = { text: 'Undone!', t: 0.9, color: '#7f8fdc' }
      sfx.undo()
    }

    const run = {
      score: 0,
      done: false,
      get ending() {
        return ending > 0 ? endReason : ''
      },
      stats: () => [
        ['Best fruit', CHAIN[bestLv].name],
        ['Merges', merges],
        ['Best combo', bestCombo > 1 ? `×${1 + T.comboStep * (bestCombo - 1)}` : '–']
      ],
      prompts: (inp) => (inp.mode === 'touch' || inp.mode === 'mouse' ? [] : undosLeft > 0 && snapshot ? [['b', 'Undo']] : []),
      update(dt) {
        if (!started) {
          // the first two jars drop in once the countdown ends
          started = true
          for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c]) pop[`${r},${c}`] = { t: T.spawnTime, kind: 'spawn' }
          audio.tone({ freq: 520, dur: 0.1, type: 'sine', slide: 200, gain: 0.1 })
        }
        // input
        if (input.navX || input.navY) {
          const dir = input.navX < 0 ? 'left' : input.navX > 0 ? 'right' : input.navY < 0 ? 'up' : 'down'
          tryMove(dir)
        }
        if (input.pressed('b')) undo()
        const p = input.pointer
        if (p.pressed && !inside(p, PAUSE_ZONE)) {
          if (inside(p, UNDO_BTN)) undo()
          else swipe = { x: p.x, y: p.y, used: false }
        }
        if (swipe && !swipe.used && (p.down || p.released)) {
          const dx = p.x - swipe.x
          const dy = p.y - swipe.y
          if (Math.max(Math.abs(dx), Math.abs(dy)) >= T.swipe) {
            swipe.used = true
            tryMove(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down')
          }
        }
        if (p.released || !p.down) swipe = p.down ? swipe : null

        // animation
        if (anim) {
          anim.t += dt
          if (anim.t >= T.slideTime) {
            const a = anim
            anim = null
            a.after()
            if (queued) {
              const q = queued
              queued = null
              tryMove(q)
            }
          }
        }
        for (const k in pop) if ((pop[k].t -= dt) <= 0) delete pop[k]
        floaters = floaters.filter((f) => (f.t -= dt) > 0)
        if (banner && (banner.t -= dt) <= 0) banner = null
        honeyTip = Math.max(0, honeyTip - dt)
        nudge.x *= Math.exp(-14 * dt)
        nudge.y *= Math.exp(-14 * dt)
        wiggle = Math.max(0, wiggle - dt)
        fx.update(dt)

        // clock
        if (ending) {
          if ((ending -= dt) <= 0) run.done = true
          return
        }
        time -= dt
        const sec = Math.ceil(time)
        if (sec !== lastTick) {
          lastTick = sec
          if (sec <= 10 && sec > 0) sfx.tick()
        }
        if (time <= 0) {
          time = 0
          finish("Time's up!")
        }
      },
      draw(ctx) {
        const now = performance.now() / 1000
        ctx.drawImage(A.backdrop.canvas, 0, 0, W, H)
        ctx.save()
        const [ox, oy] = fx.offset()
        const wx = wiggle > 0 && !settings.data.reducedShake ? Math.sin(wiggle * 60) * wiggle * 16 : 0
        ctx.translate(ox + nudge.x + wx, oy + nudge.y)

        // empty slots: a faint ring on the shelf
        for (let r = 0; r < N; r++)
          for (let c = 0; c < N; c++) {
            ctx.fillStyle = 'rgba(150,100,60,0.08)'
            ctx.beginPath()
            ctx.ellipse(cellX(c), rowTop(r) + CELL - 6, 44, 7, 0, 0, TAU)
            ctx.fill()
          }

        const s = 0.95
        const drawShadow = (x, r, k = 1) => {
          ctx.fillStyle = `rgba(90,50,20,${0.22 * k})`
          ctx.beginPath()
          ctx.ellipse(x, rowTop(r) + CELL - 6, 46 * k, 7, 0, 0, TAU)
          ctx.fill()
        }
        const drawCellJar = (cell, r, c, x, y) => {
          const pp = pop[`${r},${c}`]
          let sx = 1
          let sy = 1
          if (pp?.kind === 'merge') {
            const k = 1 - pp.t / T.popTime
            const w = Math.sin(k * Math.PI * 2) * (1 - k)
            sx = 1 + w * 0.28
            sy = 1 - w * 0.24
          } else if (pp?.kind === 'spawn') {
            const k = clamp(1 - pp.t / T.spawnTime, 0, 1)
            sx = sy = Math.max(0.01, easeBack(k))
          }
          if (cell.k === 'honey') {
            drawShadow(x, r, sx)
            const jig = Math.sin(now * 3 + c) * 0.02
            blitJar(ctx, A.honey, x, y, s * 0.95, sx * (1 + jig), sy * (1 - jig), 102)
            // countdown badge
            ctx.fillStyle = '#fffaf0'
            ctx.strokeStyle = INK
            ctx.lineWidth = 3
            ctx.beginPath()
            ctx.arc(x + 40, y - 40, 20, 0, TAU)
            ctx.fill()
            ctx.stroke()
            label(ctx, String(cell.n), x + 40, y - 38, { font: font(400, 26, 'Lilita One'), color: '#c47a10' })
          } else {
            drawShadow(x, r, sx)
            blitJar(ctx, A.jars[cell.lv], x, y, s, sx, sy)
          }
        }

        if (anim) {
          const k = easeOut(clamp(anim.t / T.slideTime, 0, 1))
          // honey stays put
          for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c]?.k === 'honey') drawCellJar(grid[r][c], r, c, cellX(c), jarY(r))
          // jars that merge away are drawn first, under their target
          const paths = [...anim.paths].sort((a, b) => b.gone - a.gone)
          for (const pth of paths) {
            const x = cellX(pth.fc) + (cellX(pth.tc) - cellX(pth.fc)) * k
            const rr = pth.fr + (pth.tr - pth.fr) * k
            const y = jarY(pth.fr) + (jarY(pth.tr) - jarY(pth.fr)) * k
            const moving = pth.fr !== pth.tr || pth.fc !== pth.tc
            const st = moving ? Math.sin(k * Math.PI) * 0.12 : 0
            const sx = 1 + st * Math.abs(anim.dir[0]) - st * 0.5 * Math.abs(anim.dir[1])
            const sy = 1 + st * Math.abs(anim.dir[1]) - st * 0.5 * Math.abs(anim.dir[0])
            ctx.fillStyle = 'rgba(90,50,20,0.2)'
            ctx.beginPath()
            ctx.ellipse(x, rowTop(0) + (rr * (CELL + GAP)) + CELL - 6, 46, 7, 0, 0, TAU)
            ctx.fill()
            blitJar(ctx, A.jars[pth.lv], x, y, s, sx, sy)
          }
        } else {
          for (let r = 0; r < N; r++)
            for (let c = 0; c < N; c++) {
              const cell = grid[r][c]
              if (cell) drawCellJar(cell, r, c, cellX(c), jarY(r))
            }
        }
        fx.draw(ctx)
        for (const f of floaters) {
          const k = f.t
          ctx.globalAlpha = clamp(k * 2, 0, 1)
          label(ctx, f.text, f.x, f.y - (1 - k) * 50, { font: font(400, 32, 'Lilita One'), color: f.color, edge: 6, edgeColor: '#fffaf0' })
        }
        ctx.globalAlpha = 1
        ctx.restore()

        // --- HUD on the paper cards
        label(ctx, 'Score', LEFT.x + LEFT.w / 2, 170, { font: font(700, 24), color: '#a07a62' })
        label(ctx, String(run.score), LEFT.x + LEFT.w / 2, 230, { font: font(400, 60, 'Lilita One'), color: '#e8637a', edge: 0 })
        label(ctx, 'Recipe', LEFT.x + LEFT.w / 2, 344, { font: font(700, 24), color: '#a07a62' })
        CHAIN.forEach((f, lv) => {
          const yy = 392 + lv * 42
          const known = lv <= Math.max(bestLv, env.store.bestLv, 1)
          ctx.globalAlpha = known ? 1 : 0.28
          blitJar(ctx, A.jars[lv], LEFT.x + 52, yy - 4, 0.3)
          label(ctx, known ? f.name : '?', LEFT.x + 84, yy, { font: font(700, 24), color: lv <= bestLv ? INK : '#a07a62', align: 'left' })
          if (known && lv > 0) label(ctx, `${T.points[lv]}`, LEFT.x + LEFT.w - 22, yy, { font: font(700, 20), color: '#b9967d', align: 'right' })
          ctx.globalAlpha = 1
        })

        const low = time <= 15
        const pulse = low && !settings.data.reducedShake ? 1 + Math.max(0, Math.sin(now * 8)) * 0.06 : 1
        label(ctx, 'Time', RIGHT.x + RIGHT.w / 2, 170, { font: font(700, 24), color: '#a07a62' })
        const secs = Math.ceil(time)
        label(ctx, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, RIGHT.x + RIGHT.w / 2, 230, { font: font(400, 60 * pulse, 'Lilita One'), color: low ? '#e0505f' : INK })
        label(ctx, 'Best fruit', RIGHT.x + RIGHT.w / 2, 344, { font: font(700, 24), color: '#a07a62' })
        const bob = Math.sin(now * 2) * 3
        blitJar(ctx, A.jars[bestLv], RIGHT.x + RIGHT.w / 2, 420 + bob, 0.82)
        label(ctx, CHAIN[bestLv].name, RIGHT.x + RIGHT.w / 2, 506, { font: font(400, 32, 'Lilita One'), color: CHAIN[bestLv].fruit, edge: 5, edgeColor: '#fffaf0' })

        // undo button (tap/click), shown as a paper tag
        const canUndo = undosLeft > 0 && snapshot && !anim
        ctx.globalAlpha = undosLeft > 0 ? (canUndo ? 1 : 0.55) : 0.35
        ctx.fillStyle = '#fffaf1'
        ctx.strokeStyle = INK
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.roundRect(UNDO_BTN.x, UNDO_BTN.y, UNDO_BTN.w, UNDO_BTN.h, 18)
        ctx.fill()
        ctx.stroke()
        // a curved arrow
        const ax = UNDO_BTN.x + 40
        const ay = UNDO_BTN.y + UNDO_BTN.h / 2
        ctx.beginPath()
        ctx.arc(ax, ay, 15, Math.PI * 1.15, Math.PI * 0.6, false)
        ctx.lineWidth = 5
        ctx.strokeStyle = '#7f8fdc'
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(ax - 22, ay - 14)
        ctx.lineTo(ax - 8, ay - 16)
        ctx.lineTo(ax - 18, ay - 2)
        ctx.closePath()
        ctx.fillStyle = '#7f8fdc'
        ctx.fill()
        label(ctx, undosLeft > 0 ? 'Undo' : 'Used', UNDO_BTN.x + 72, ay - 12, { font: font(400, 30, 'Lilita One'), color: INK, align: 'left' })
        const key = input.mode === 'touch' ? 'Tap here' : input.mode === 'mouse' ? 'Click here' : input.label('b')
        label(ctx, undosLeft > 0 ? `${key} · 1 left` : 'once a round', UNDO_BTN.x + 72, ay + 18, { font: font(700, 18), color: '#a07a62', align: 'left' })
        ctx.globalAlpha = 1

        // tips and banners above the shelf
        if (honeyTip > 0) {
          ctx.globalAlpha = clamp(honeyTip, 0, 1)
          label(ctx, `Sticky honey! It blocks its spot for ${T.honeyMoves} slides`, W / 2, 84, { font: font(700, 26), color: '#c47a10', edge: 6, edgeColor: '#fffaf0' })
          ctx.globalAlpha = 1
        } else if (slides === 0 && !ending) {
          const how = input.mode === 'touch' || input.mode === 'mouse' ? 'Swipe the shelf' : `${input.dpadLabel()} to slide every jar`
          label(ctx, `${how} · two matching jars make the next fruit`, W / 2, 84, { font: font(700, 26), color: INK, edge: 6, edgeColor: '#fffaf0' })
        }
        if (banner) {
          const k = banner.t
          const sc = 1 + Math.max(0, k - 0.9) * 0.6
          ctx.globalAlpha = clamp(k * 3, 0, 1)
          label(ctx, banner.text, W / 2, 56, { font: font(400, 40 * sc, 'Lilita One'), color: banner.color, edge: 8, edgeColor: '#fffaf0' })
          ctx.globalAlpha = 1
        }
        if (ending) {
          ctx.fillStyle = 'rgba(246,236,217,0.55)'
          ctx.fillRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h)
          label(ctx, endReason, W / 2, BY + SPAN / 2, { font: font(400, 72, 'Lilita One'), color: '#e8637a', edge: 12, edgeColor: '#fffaf0' })
          if (endReason === 'Shelf full!' && undosLeft > 0 && snapshot) {
            const key = input.mode === 'touch' ? 'Tap Undo' : input.mode === 'mouse' ? 'Click Undo' : `${input.label('b')} to undo`
            label(ctx, `${key} and keep going!`, W / 2, BY + SPAN / 2 + 70, { font: font(700, 30), color: INK, edge: 6, edgeColor: '#fffaf0' })
          }
        }
      }
    }
    return run
  }
}
