// Sunset Drift: a pseudo-3D racer on a neon coast road. Three laps against five rivals; the road
// is a loop of thin segments projected to the screen every frame (no WebGL, no 3D library), with
// curves and hills baked into the segment data. Hard curves can't be taken flat out: hold drift
// through them to charge a boost, then let go to fire it. Points come from the finishing place,
// banked drifts and clean overtakes.
// Style: synthwave — an indigo-to-pink sky, a striped sun, wireframe mountains, a magenta grid
// floor, a cyan-edged road, black palms with pink rim light and chunky wedge cars from behind.
import { W, H, TAU, clamp, lerp, rand, approach, label, createFx } from '../common.js'

export const TUNING = {
  laps: 3,
  maxSpeed: 12000, // world units per second (a segment is 200 units)
  accel: 2600,
  brake: 9000,
  coast: 5000, // slowing back to the cap after a boost
  offRoadLimit: 3600,
  offRoadDecel: 9000,
  steer: 2.6, // road half-widths per second at full speed
  centrifugal: 0.6, // × curve × speed² — a hard curve (6) can't be held at full speed without drifting
  // drift: hold the button while steering above driftMinSpeed
  driftMinSpeed: 0.5,
  driftSteer: 1.5,
  driftCentrifugal: 0.55,
  driftPull: 0.45, // the slide keeps pushing you toward the drift side
  driftCap: 0.94, // speed cap while sliding
  driftTiers: [0.7, 1.6, 2.6], // seconds of charge for the blue, pink and gold sparks
  boostTime: [0.55, 1.0, 1.5],
  boostMult: 1.28,
  boostAccel: 16000,
  // score
  driftPoints: 40, // per second of charge
  tierBonus: [0, 40, 100, 200],
  passPoints: 25,
  placePoints: [2000, 1400, 1000, 700, 450, 250],
  // rivals: share of maxSpeed; they lift for hard curves and are rubber-banded a little
  rivalSkill: [0.975, 0.95, 0.92, 0.89, 0.85],
  rivalCurveLift: 0.035, // per unit of curve over 2
  rubber: 0.06,
  bumpKeep: 0.8,
  crashSpeed: 0.2,
  finishHold: 2.6
}

// ---- the road -----------------------------------------------------------------------------------
const SEG = 200 // segment length (world units)
const ROAD = 1200 // road half-width
const RUMBLE = 3 // segments per rumble stripe
const CAM_H = 1000
const DEPTH = 1 / Math.tan((100 / 2) * (Math.PI / 180)) // field of view 100°
const PLAYER_Z = CAM_H * DEPTH // the player sits this far ahead of the camera (at the screen's bottom)
const DRAW = 280 // segments drawn
const FOG = 5
const CAR_W = 360
const CAR_H = 208
const CAR_HALF = CAR_W / 2 / ROAD // in road half-widths
const CAR_LEN = 300
const GRID_BACK = 10 * SEG // the grid starts this far behind the line, so the gantry isn't on top of you
const HZ = H / 2

const C = {
  sky: ['#100628', '#2c0c56', '#7a1a7a', '#ff3d7f', '#ff9a52'],
  ground1: '#1f0838',
  ground2: '#1a0631',
  grid: '#ff4fd8',
  road1: '#2a1145',
  road2: '#2e1450',
  rumble1: '#39e8ff',
  rumble2: '#1b6f9e',
  lane: '#ff6ad5',
  fog: '#3a0f55',
  ink: '#0b0418',
  text: '#fff4fb',
  pink: '#ff3d7f',
  cyan: '#39e8ff',
  gold: '#ffd23f'
}
const TIER_COLORS = ['#e9e4ff', '#39e8ff', '#ff4fd8', '#ffd23f']
const PLACE = ['1st', '2nd', '3rd', '4th', '5th', '6th']

const easeIn = (a, b, t) => a + (b - a) * t * t
const easeInOut = (a, b, t) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5)
const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)

// Sprite kinds: world size in units, and how wide the solid part is (road half-widths).
const KINDS = {
  palm: { w: 760, h: 1390, hit: 0.1 },
  lampL: { w: 340, h: 1100, hit: 0.06 },
  lampR: { w: 340, h: 1100, hit: 0.06 },
  chevL: { w: 520, h: 560, hit: 0.2 },
  chevR: { w: 520, h: 560, hit: 0.2 },
  board: { w: 1500, h: 930, hit: 0.45 },
  gantry: { w: ROAD * 2.8, h: 1500, hit: 0, center: true }
}

/** The track: built once, the same every run. */
const TRACK = (() => {
  const segs = []
  const lastY = () => (segs.length ? segs[segs.length - 1].p2.world.y : 0)
  const point = (y, z) => ({ world: { y, z }, camera: { x: 0, y: 0, z: 0 }, screen: { x: 0, y: 0, w: 0, scale: 0 } })
  const add = (curve, y) => {
    const n = segs.length
    segs.push({ index: n, p1: point(lastY(), n * SEG), p2: point(y, (n + 1) * SEG), curve, sprites: [], clip: 0, fog: 0, vis: -1 })
  }
  const road = (enter, hold, leave, curve, hill) => {
    const y0 = lastY()
    const y1 = y0 + hill * SEG
    const total = enter + hold + leave
    for (let n = 0; n < enter; n++) add(easeIn(0, curve, n / enter), easeInOut(y0, y1, n / total))
    for (let n = 0; n < hold; n++) add(curve, easeInOut(y0, y1, (enter + n) / total))
    for (let n = 0; n < leave; n++) add(easeInOut(curve, 0, n / leave), easeInOut(y0, y1, (enter + hold + n) / total))
  }
  road(25, 25, 25, 0, 0) // start straight
  road(25, 50, 25, 2, 20) // easy right, climbing
  road(25, 25, 25, 0, -20)
  road(25, 25, 25, -4, 0) // S-bend
  road(25, 25, 25, 4, 0)
  road(25, 25, 25, 0, 40) // a blind crest
  road(25, 25, 25, 0, -40)
  road(50, 100, 50, -3, 10) // long left sweeper
  road(25, 25, 25, 0, -10)
  road(25, 75, 25, 6, -15) // the hairpin: drift it
  road(25, 25, 25, 0, 0)
  road(25, 50, 25, -6, 15) // hard left
  road(25, 25, 25, 0, 30) // rollers
  road(25, 25, 25, 0, -30)
  road(25, 25, 25, 0, 25)
  road(25, 50, 25, 4, 0) // medium right over the top
  road(50, 50, 50, 0, -lastY() / SEG) // home straight, back to sea level
  // scenery (seeded, so every run looks the same)
  const r = seeded(1986)
  const put = (n, kind, offset) => segs[n].sprites.push({ kind, offset, center: KINDS[kind].center ? offset : offset < 0 ? offset - KINDS[kind].w / ROAD / 2 : offset + KINDS[kind].w / ROAD / 2 })
  const boards = new Set([40, 310, 620, 980, 1180])
  for (let n = 0; n < segs.length; n++) {
    const c = segs[n].curve
    if (Math.abs(c) >= 3 && n % 6 === 0) put(n, c > 0 ? 'chevR' : 'chevL', c > 0 ? -1.25 : 1.25)
    else if (boards.has(n)) put(n, 'board', n % 2 ? 2.0 : -2.0)
    else if (n % 32 === 16) {
      put(n, 'lampL', -1.2)
      put(n, 'lampR', 1.2)
    } else if (n % 9 === 0) put(n, 'palm', (r() < 0.5 ? -1 : 1) * (1.5 + r() * 0.9))
    if (n % 23 === 5 && Math.abs(c) < 3) put(n, 'palm', (r() < 0.5 ? -1 : 1) * (2.6 + r() * 1.6))
  }
  const finish = Math.floor(PLAYER_Z / SEG) + 1
  segs[finish].finish = segs[finish + 1].finish = true
  segs[finish].sprites.push({ kind: 'gantry', offset: 0, center: 0 })
  return { segs, length: segs.length * SEG, finish }
})()
const SEGS = TRACK.segs
const N = SEGS.length
const segAt = (z) => SEGS[Math.floor(z / SEG) % N]
const wrap = (z) => ((z % TRACK.length) + TRACK.length) % TRACK.length

// ---- art: baked once, the first time it's drawn -------------------------------------------------
function bake(w, h, draw, k = 2) {
  const cv = document.createElement('canvas')
  cv.width = Math.ceil(w * k)
  cv.height = Math.ceil(h * k)
  const g = cv.getContext('2d')
  g.scale(k, k)
  draw(g)
  return cv
}

const CAR_COLORS = { player: '#ff2e6e', rivals: ['#39e8ff', '#ffd23f', '#e9e4ff', '#ff8a3d', '#6dff9e'] }

/** A wedge sports car from behind, in a 260×150 box (bottom of the tyres at 140). lean −1..1 slides the cabin. */
function drawCar(g, body, lean = 0) {
  const dark = shade(body, -0.55)
  const mid = shade(body, -0.25)
  g.fillStyle = 'rgba(0,0,0,0.45)'
  g.beginPath()
  g.ellipse(130, 140, 124, 11, 0, 0, TAU)
  g.fill()
  // tyres
  g.fillStyle = '#0c0614'
  g.beginPath()
  g.roundRect(16, 100, 44, 40, 7)
  g.roundRect(200, 100, 44, 40, 7)
  g.fill()
  g.fillStyle = '#2a2238'
  g.fillRect(22, 104, 6, 32)
  g.fillRect(232, 104, 6, 32)
  // the body: a wide low wedge
  const bg = g.createLinearGradient(0, 64, 0, 124)
  bg.addColorStop(0, shade(body, 0.25))
  bg.addColorStop(0.45, body)
  bg.addColorStop(1, mid)
  g.fillStyle = bg
  g.beginPath()
  g.moveTo(8, 120)
  g.lineTo(8, 84)
  g.quadraticCurveTo(10, 68, 26, 66)
  g.lineTo(234, 66)
  g.quadraticCurveTo(250, 68, 252, 84)
  g.lineTo(252, 120)
  g.quadraticCurveTo(252, 126, 244, 126)
  g.lineTo(16, 126)
  g.quadraticCurveTo(8, 126, 8, 120)
  g.fill()
  // cabin and the slatted rear window
  const cx = lean * 10
  g.fillStyle = dark
  g.beginPath()
  g.moveTo(46 + cx * 0.4, 67)
  g.lineTo(76 + cx, 26)
  g.lineTo(184 + cx, 26)
  g.lineTo(214 + cx * 0.4, 67)
  g.fill()
  const glass = g.createLinearGradient(0, 30, 0, 64)
  glass.addColorStop(0, '#2a3a8a')
  glass.addColorStop(1, '#7ad9ff')
  g.fillStyle = glass
  g.beginPath()
  g.moveTo(58 + cx * 0.5, 63)
  g.lineTo(82 + cx, 32)
  g.lineTo(178 + cx, 32)
  g.lineTo(202 + cx * 0.5, 63)
  g.fill()
  g.strokeStyle = dark
  g.lineWidth = 3
  for (let i = 1; i < 5; i++) {
    const y = 32 + i * 6.2
    const t = (y - 32) / 31
    g.beginPath()
    g.moveTo(lerp(82, 58, t) + cx * lerp(1, 0.5, t), y)
    g.lineTo(lerp(178, 202, t) + cx * lerp(1, 0.5, t), y)
    g.stroke()
  }
  // roof highlight and spoiler
  g.fillStyle = shade(body, 0.35)
  g.fillRect(80 + cx, 24, 100, 4)
  g.fillStyle = '#120a1e'
  g.fillRect(14, 58, 232, 7)
  g.fillRect(40, 62, 8, 8)
  g.fillRect(212, 62, 8, 8)
  // the full-width tail light bar, with a soft glow (shadowBlur is fine here: it's baked once)
  g.save()
  g.shadowColor = '#ff2a6a'
  g.shadowBlur = 14
  const tl = g.createLinearGradient(18, 0, 242, 0)
  tl.addColorStop(0, '#ff2a4a')
  tl.addColorStop(0.5, '#ff5ab0')
  tl.addColorStop(1, '#ff2a4a')
  g.fillStyle = tl
  g.fillRect(20, 78, 220, 15)
  g.restore()
  g.fillStyle = 'rgba(40,0,20,0.5)'
  for (let x = 28; x < 236; x += 9) g.fillRect(x, 78, 2, 15)
  g.fillStyle = 'rgba(255,255,255,0.65)'
  g.fillRect(22, 80, 216, 3)
  // plate, diffuser, exhausts
  g.fillStyle = '#e8e0ff'
  g.fillRect(108, 98, 44, 13)
  g.fillStyle = '#5a4a7a'
  g.fillRect(114, 103, 32, 3)
  g.fillStyle = '#120a1e'
  g.fillRect(36, 114, 188, 12)
  g.fillStyle = '#3a3448'
  for (const x of [64, 196]) {
    g.beginPath()
    g.arc(x, 119, 6, 0, TAU)
    g.fill()
  }
  g.fillStyle = '#0b0418'
  for (const x of [64, 196]) {
    g.beginPath()
    g.arc(x, 119, 3, 0, TAU)
    g.fill()
  }
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`
}

function drawPalm(g) {
  // 240×440, trunk base at the bottom centre; black silhouette with a pink rim on the right
  g.lineCap = 'round'
  const trunk = (color, dx, w) => {
    g.strokeStyle = color
    for (let i = 0; i < 12; i++) {
      const t0 = i / 12
      const t1 = (i + 1) / 12
      const x = (t) => 120 + dx + Math.sin(t * 2.2) * 34 * t
      g.lineWidth = lerp(w, w * 0.55, t0)
      g.beginPath()
      g.moveTo(x(t0), 440 - t0 * 330)
      g.lineTo(x(t1), 440 - t1 * 330)
      g.stroke()
    }
  }
  trunk('#ff4fd8', 3, 22)
  trunk('#12051f', 0, 20)
  const top = { x: 120 + Math.sin(2.2) * 34, y: 110 }
  const frond = (a, len, droop, color, w) => {
    g.fillStyle = color
    g.beginPath()
    const ex = top.x + Math.cos(a) * len
    const ey = top.y + Math.sin(a) * len + droop
    const mx = top.x + Math.cos(a) * len * 0.5
    const my = top.y + Math.sin(a) * len * 0.5 - 18
    const nx = -Math.sin(a) * w
    const ny = Math.cos(a) * w
    g.moveTo(top.x, top.y)
    g.quadraticCurveTo(mx + nx, my + ny, ex, ey)
    g.quadraticCurveTo(mx - nx * 0.2, my - ny * 0.2, top.x, top.y)
    g.fill()
  }
  const leaves = [
    [-2.9, 112, 60],
    [-2.4, 100, 30],
    [-1.9, 80, 10],
    [-1.3, 84, 12],
    [-0.75, 104, 34],
    [-0.25, 116, 64],
    [0.35, 92, 70],
    [2.75, 96, 72]
  ]
  for (const [a, len, droop] of leaves) frond(a, len, droop, '#ff4fd8', 15)
  for (const [a, len, droop] of leaves) frond(a + 0.03, len - 4, droop + 2, '#12051f', 14)
  g.fillStyle = '#12051f'
  g.beginPath()
  g.arc(top.x, top.y + 4, 10, 0, TAU)
  g.fill()
}

function drawLamp(g, side) {
  // 160×520: a pole with its arm reaching over the road (side 1 = arm points right)
  const px = 80
  g.fillStyle = '#12051f'
  g.fillRect(px - 5, 60, 10, 460)
  g.fillRect(px - 9, 500, 18, 20)
  g.strokeStyle = '#12051f'
  g.lineWidth = 8
  g.beginPath()
  g.moveTo(px, 64)
  g.quadraticCurveTo(px, 30, px + side * 60, 34)
  g.stroke()
  g.save()
  g.shadowColor = '#ff6ad5'
  g.shadowBlur = 22
  g.fillStyle = '#ffd6f4'
  g.beginPath()
  g.roundRect(px + side * 60 - 16, 32, 32, 9, 4)
  g.fill()
  g.restore()
  g.fillStyle = '#ff4fd8'
  g.fillRect(px + 3, 60, 2, 440)
}

function drawChevron(g, dir) {
  // 200×216: a black board on two posts with three neon chevrons pointing along the curve
  g.fillStyle = '#12051f'
  g.fillRect(40, 120, 12, 96)
  g.fillRect(148, 120, 12, 96)
  g.fillStyle = '#0b0418'
  g.beginPath()
  g.roundRect(8, 16, 184, 116, 10)
  g.fill()
  g.strokeStyle = '#39e8ff'
  g.lineWidth = 4
  g.stroke()
  g.save()
  g.shadowColor = '#ffd23f'
  g.shadowBlur = 10
  g.fillStyle = '#ffd23f'
  for (let i = 0; i < 3; i++) {
    const x = 100 + (i - 1) * 50
    g.beginPath()
    g.moveTo(x - dir * 18, 36)
    g.lineTo(x + dir * 14, 74)
    g.lineTo(x - dir * 18, 112)
    g.lineTo(x - dir * 4, 112)
    g.lineTo(x + dir * 28, 74)
    g.lineTo(x - dir * 4, 36)
    g.fill()
  }
  g.restore()
}

function drawBoard(g, text, sub, color) {
  // 420×260: a neon billboard on stilts
  g.fillStyle = '#12051f'
  g.fillRect(70, 150, 14, 110)
  g.fillRect(336, 150, 14, 110)
  g.fillRect(64, 196, 292, 8)
  g.fillStyle = '#0b0418'
  g.beginPath()
  g.roundRect(8, 8, 404, 160, 14)
  g.fill()
  const sky = g.createLinearGradient(0, 16, 0, 160)
  sky.addColorStop(0, '#2c0c56')
  sky.addColorStop(1, '#ff3d7f')
  g.fillStyle = sky
  g.beginPath()
  g.roundRect(18, 18, 384, 140, 8)
  g.fill()
  g.fillStyle = '#ffd23f'
  g.beginPath()
  g.arc(330, 128, 44, Math.PI, TAU)
  g.fill()
  g.fillStyle = '#ff3d7f'
  for (let i = 0; i < 4; i++) g.fillRect(280, 100 + i * 8, 100, 2 + i)
  g.save()
  g.shadowColor = color
  g.shadowBlur = 16
  g.strokeStyle = color
  g.lineWidth = 5
  g.beginPath()
  g.roundRect(14, 14, 392, 148, 10)
  g.stroke()
  g.font = 'italic 52px Bungee, "Lilita One", sans-serif'
  g.textBaseline = 'middle'
  g.fillStyle = '#fff'
  g.fillText(text, 36, 70)
  g.restore()
  g.font = '700 24px Rubik, sans-serif'
  g.fillStyle = color
  g.fillText(sub, 40, 124)
}

function drawGantry(g) {
  // 600×324 (posts at the edges), checkered banner across the road
  g.fillStyle = '#12051f'
  g.fillRect(0, 40, 16, 284)
  g.fillRect(584, 40, 16, 284)
  g.fillRect(0, 36, 600, 66)
  for (let i = 0; i < 30; i++)
    for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#fff4fb' : '#1a0631'
      g.fillRect(20 + i * 18.6, 76 + j * 11, 18.6, 11)
    }
  g.save()
  g.shadowColor = '#39e8ff'
  g.shadowBlur = 12
  g.fillStyle = '#39e8ff'
  g.fillRect(16, 38, 568, 4)
  g.fillRect(16, 100, 568, 3)
  g.font = '28px Bungee, "Lilita One", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#fff4fb'
  g.fillText('NEON COAST', 300, 58)
  g.restore()
}

function drawSun(g, r) {
  // the striped synthwave sun, 2r × r (its top half; the horizon hides the rest)
  const grad = g.createLinearGradient(0, 0, 0, r)
  grad.addColorStop(0, '#fff07a')
  grad.addColorStop(0.55, '#ffab45')
  grad.addColorStop(1, '#ff3d7f')
  g.fillStyle = grad
  g.beginPath()
  g.arc(r, r, r, Math.PI, TAU)
  g.fill()
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 7; i++) {
    const y = r * 0.42 + i * r * 0.085
    g.fillRect(0, y, r * 2, 2 + i * 1.6)
  }
  g.globalCompositeOperation = 'source-over'
}

let ART = null
const art = () => {
  if (ART) return ART
  const sky = bake(W, HZ + 2, (g) => {
    const s = g.createLinearGradient(0, 0, 0, HZ)
    C.sky.forEach((c, i) => s.addColorStop([0, 0.35, 0.65, 0.9, 1][i], c))
    g.fillStyle = s
    g.fillRect(0, 0, W, HZ + 2)
    const r = seeded(7)
    for (let i = 0; i < 90; i++) {
      const y = r() * HZ * 0.6
      g.fillStyle = `rgba(255,240,255,${0.25 + r() * 0.6 * (1 - y / (HZ * 0.6))})`
      g.fillRect(r() * W, y, r() < 0.15 ? 3 : 2, r() < 0.15 ? 3 : 2)
    }
  }, 1)
  // mountain ridges as periodic polylines (drawn as vectors each frame, so they stay crisp)
  const ridge = (seed, period, step, lo, hi) => {
    const r = seeded(seed)
    const pts = []
    for (let x = 0; x < period; x += step * (0.6 + r() * 0.8)) pts.push([x, lo + r() * (hi - lo)])
    pts.push([period, pts[0][1]])
    return { pts, period }
  }
  ART = {
    sky,
    sun: bake(360, 180, (g) => drawSun(g, 180)),
    far: ridge(11, 1600, 90, 40, 150),
    near: ridge(23, 1100, 70, 14, 56),
    player: [-1, -0.5, 0, 0.5, 1].map((lean) => bake(260, 150, (g) => drawCar(g, CAR_COLORS.player, lean))),
    rivals: CAR_COLORS.rivals.map((c) => bake(260, 150, (g) => drawCar(g, c))),
    palm: bake(240, 440, drawPalm),
    lampL: bake(160, 520, (g) => drawLamp(g, 1)),
    lampR: bake(160, 520, (g) => drawLamp(g, -1)),
    chevL: bake(200, 216, (g) => drawChevron(g, -1)),
    chevR: bake(200, 216, (g) => drawChevron(g, 1)),
    boards: null,
    gantry: null
  }
  return ART
}
// Billboards and the gantry use Bungee: bake them once the font has loaded.
const lettered = () => {
  const A = art()
  const ready = document.fonts?.check?.('28px Bungee') ?? true
  if (!A.boards || (!A.fontOk && ready)) {
    A.fontOk = ready
    A.boards = [
      ['DRIFT', 'hold it · let go · boost', '#39e8ff'],
      ['1986', 'the coast road', '#ffd23f'],
      ['NEON', 'next exit: forever', '#ff4fd8']
    ].map(([t, s, c]) => bake(420, 260, (g) => drawBoard(g, t, s, c)))
    A.gantry = bake(600, 324, drawGantry)
  }
  return A
}

function drawRidge(ctx, ridge, off, base, fill, edge, wire) {
  const P = ridge.period
  const x0 = -(((off % P) + P) % P)
  ctx.beginPath()
  ctx.moveTo(x0, base)
  for (let k = 0; x0 + k * P < W; k++) for (const [x, h] of ridge.pts) ctx.lineTo(x0 + k * P + x, base - h)
  ctx.lineTo(W + P, base)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (wire) {
    ctx.strokeStyle = wire
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let k = 0; x0 + k * P < W; k++)
      for (const [x, h] of ridge.pts) {
        const sx = x0 + k * P + x
        if (sx < -40 || sx > W + 40) continue
        ctx.moveTo(sx, base - h)
        ctx.lineTo(sx + h * 0.5, base)
        ctx.moveTo(sx, base - h)
        ctx.lineTo(sx - h * 0.5, base)
      }
    ctx.stroke()
  }
  ctx.strokeStyle = edge
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let k = 0; x0 + k * P < W; k++) for (const [x, h] of ridge.pts) ctx.lineTo(x0 + k * P + x, base - h)
  ctx.stroke()
}

function quad(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.lineTo(x4, y4)
  ctx.closePath()
  ctx.fill()
}

function project(p, camX, camY, camZ) {
  p.camera.x = -camX
  p.camera.y = p.world.y - camY
  p.camera.z = p.world.z - camZ
  const s = (p.screen.scale = DEPTH / p.camera.z)
  p.screen.x = W / 2 + s * p.camera.x * (W / 2)
  p.screen.y = HZ - s * p.camera.y * (H / 2)
  p.screen.w = s * ROAD * (W / 2)
}

const GRID_X = [1.6, 3, 4.4, 5.8, 7.2, 8.6]

export default {
  id: 'sunset-drift',
  name: 'Sunset Drift',
  blurb: 'Drift the neon coast road',
  scoreLabel: 'points',
  style: { bg: '#2c0c56', accent: '#ff4fd8' },
  // headless bots: no drifting (brakes for hairpins) ≈ 1075 and 3rd; drifts the hard curves ≈ 2970 and 1st; drifts every curve ≈ 3350
  medals: [1000, 2400, 3300],
  music: { bpm: 116, root: 45, chords: [0, -4, -7, -2], minor: true, lead: [0, 2, 4, 7, 4, 2, 0, null], wave: 'sawtooth', gain: 0.026 },
  TUNING,
  howTo: (input) =>
    input.mode === 'touch'
      ? 'Drag to steer · hold DRIFT through turns · let go to boost'
      : input.mode === 'mouse'
        ? 'Point to steer · hold the button through turns to drift · let go to boost'
        : `${input.stickLabel()} to steer · hold ${input.label('a')} through turns to drift · let go to boost`,
  icon(ctx, x, y, size, t) {
    // drawn for size 130 (visible ≈ ±180 × −80…+60) and scaled; only Path2D fills, so the
    // caller's current path (the cover strokes its card outline after this) is left alone
    const A = art()
    const hz = -6
    const tri = (pts) => {
      const p = new Path2D()
      pts.forEach(([px, py]) => p.lineTo(px, py))
      return p
    }
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(size / 130, size / 130)
    ctx.drawImage(A.sky, 0, HZ * 0.3, W, HZ * 0.7, -200, -110, 400, hz + 110)
    ctx.drawImage(A.sun, -70, hz - 70, 140, 70)
    ctx.fillStyle = C.ground1
    ctx.fillRect(-200, hz, 400, 200)
    const grid = new Path2D()
    for (let i = -8; i <= 8; i++) {
      grid.moveTo(i * 10, hz)
      grid.lineTo(i * 90, hz + 160)
    }
    const k = (t * 1.5) % 1
    for (let j = 0; j < 6; j++) {
      const yy = hz + 160 * ((j + k) / 6) ** 2
      grid.moveTo(-200, yy)
      grid.lineTo(200, yy)
    }
    ctx.strokeStyle = 'rgba(255,79,216,0.6)'
    ctx.lineWidth = 1.5
    ctx.stroke(grid)
    // the road, swaying
    const bend = Math.sin(t * 0.8) * 16
    ctx.fillStyle = C.rumble1
    ctx.fill(tri([[bend - 5, hz], [bend + 5, hz], [150, hz + 140], [-150, hz + 140]]))
    ctx.fillStyle = C.road2
    ctx.fill(tri([[bend - 3, hz], [bend + 3, hz], [132, hz + 140], [-132, hz + 140]]))
    ctx.drawImage(A.palm, -176, -92, 64, 118)
    ctx.drawImage(A.palm, 120, -70, 50, 92)
    ctx.drawImage(A.rivals[0], 10 + bend * 0.6, hz + 6, 34, 20)
    ctx.translate(0, 44)
    ctx.rotate(Math.sin(t * 2) * 0.05)
    ctx.drawImage(A.player[1 + Math.round(Math.sin(t * 2) + 1)], -60, -42, 120, 69)
    ctx.restore()
  },
  create(env) {
    const { input, audio, settings, font } = env
    const T = env.TUNING
    const fx = createFx(settings, { max: 180 })
    const MAX = T.maxSpeed
    const L = TRACK.length
    // the player: position is the camera's z; the car sits PLAYER_Z ahead of it
    const me = { x: 0, speed: 0, dist: 0, lap: 1, steer: 0, crash: 0, bump: 0, boost: 0, boostTier: 0 }
    let position = wrap(-GRID_BACK)
    me.dist = -GRID_BACK
    const drift = { on: false, dir: 0, charge: 0, tier: 0 }
    // five rivals on a staggered grid ahead of you
    const rivals = T.rivalSkill.map((skill, i) => ({
      i,
      skill,
      dist: PLAYER_Z - GRID_BACK + SEG * 2 + (4 - i) * SEG * 2.5,
      x: i % 2 ? 0.45 : -0.45,
      speed: 0,
      ahead: true,
      passedLap: 0
    }))
    let raceTime = 0
    let lapStart = 0
    let bestLap = env.store.bestLap ?? 0
    let lastLap = 0
    let place = 6
    let finished = false
    let finishT = 0
    let finalPlace = 6
    let skyOffset = 0
    let engineT = 0
    let screechT = 0
    let banner = null // { text, sub, color, t }
    const pops = [] // floating score popups
    let driftPts = 0
    let passPts = 0
    let passes = 0
    let bestDrift = 0
    let frame = 0
    const DRIFT_BTN = { x: W - 150, y: H - 200, r: 84 }

    const say = (text, sub = '', color = C.text, t = 1.6) => (banner = { text, sub, color, t, max: t })
    const pop = (text, color) => pops.push({ text, color, t: 1.1 })

    function controls() {
      // returns { steer −1..1, drift, brake }
      let steer = Math.abs(input.x) > 0.12 ? input.x : 0
      let driftHeld = input.held('a') || input.held('x') || input.held('rt')
      let brake = input.held('b') || input.held('lt') || input.y > 0.6
      if (input.mode === 'mouse' && input.pointer.active) {
        steer = clamp((input.pointer.x - W / 2) / 320, -1, 1)
        if (Math.abs(steer) < 0.08) steer = 0
        driftHeld = driftHeld || input.pointer.down
      } else if (input.mode === 'touch') {
        for (const p of input.pointers.values()) {
          if (!p.down) continue
          if (Math.hypot(p.x - DRIFT_BTN.x, p.y - DRIFT_BTN.y) < DRIFT_BTN.r + 20) driftHeld = true
          else if (!(p.x > W - 130 && p.y < 100)) steer = clamp((p.x - W / 2) / 300, -1, 1)
        }
      }
      return { steer, drift: driftHeld, brake }
    }

    function endDrift(bank) {
      if (!drift.on) return
      if (bank && drift.charge > 0.25) {
        const pts = Math.round(drift.charge * T.driftPoints + T.tierBonus[drift.tier])
        run.score += pts
        driftPts += pts
        bestDrift = Math.max(bestDrift, pts)
        pop(`+${pts} DRIFT`, TIER_COLORS[drift.tier])
        if (drift.tier > 0) {
          me.boost = T.boostTime[drift.tier - 1]
          me.boostTier = drift.tier
          audio.noise({ dur: 0.35, gain: 0.18 })
          audio.tone({ freq: 220, dur: 0.4, slide: 660, type: 'sawtooth', gain: 0.1 })
          fx.shake(0.15)
        }
      } else if (!bank && drift.charge > 0.4) pop('drift lost', '#a79fd0')
      drift.on = false
      drift.charge = 0
      drift.tier = 0
    }

    function updatePlayer(dt) {
      const sp = me.speed / MAX
      const ctl = finished ? { steer: clamp(-me.x * 2, -1, 1), drift: false, brake: false } : controls()
      me.steer = approach(me.steer, ctl.steer, 14, dt)
      const pSeg = segAt(position + PLAYER_Z)
      const offRoad = Math.abs(me.x) > 1
      // drift: starts when you hold the button while steering fast enough, ends when you let go
      if (!drift.on && ctl.drift && Math.abs(ctl.steer) > 0.3 && sp > T.driftMinSpeed && !offRoad && me.crash <= 0) {
        drift.on = true
        drift.dir = Math.sign(ctl.steer)
        drift.charge = 0
        drift.tier = 0
        audio.tone({ freq: 180, dur: 0.12, type: 'square', gain: 0.06 })
      }
      if (drift.on) {
        if (!ctl.drift) endDrift(true)
        else if (offRoad || sp < T.driftMinSpeed * 0.8) endDrift(false)
      }
      if (drift.on) {
        const into = ctl.steer * drift.dir > 0.2 ? 1 : 0.35
        drift.charge += dt * sp * into
        const tier = T.driftTiers.filter((s) => drift.charge >= s).length
        if (tier > drift.tier) {
          drift.tier = tier
          audio.tone({ freq: 440 * 2 ** (tier * 4 / 12), dur: 0.12, type: 'triangle', gain: 0.12 })
        }
      }
      // steering, the slide, and the curve pushing you outward
      const steer = T.steer * (drift.on ? T.driftSteer : 1)
      me.x += me.steer * steer * sp * dt
      if (drift.on) me.x += drift.dir * T.driftPull * sp * dt
      me.x -= pSeg.curve * T.centrifugal * sp * sp * (drift.on ? T.driftCentrifugal : 1) * dt
      me.x = clamp(me.x, -3, 3)
      // speed
      const boosting = me.boost > 0
      me.boost = Math.max(0, me.boost - dt)
      let cap = MAX * (boosting ? T.boostMult : 1)
      if (drift.on) cap = Math.min(cap, MAX * T.driftCap)
      if (finished) cap = MAX * 0.7
      if (ctl.brake) me.speed -= T.brake * dt
      else if (boosting && me.speed < cap) me.speed += T.boostAccel * dt
      else if (me.speed < cap) me.speed = Math.min(cap, me.speed + T.accel * dt * (1 - (me.speed / MAX) * 0.5))
      if (me.speed > cap) me.speed = Math.max(cap, me.speed - T.coast * dt)
      if (Math.abs(me.x) > 1 && me.speed > T.offRoadLimit) me.speed = Math.max(T.offRoadLimit, me.speed - T.offRoadDecel * dt)
      me.speed = Math.max(0, me.speed)
      // scenery is solid off the road
      me.crash = Math.max(0, me.crash - dt)
      me.bump = Math.max(0, me.bump - dt)
      if (Math.abs(me.x) > 1 && me.crash <= 0) {
        for (const s of pSeg.sprites) {
          const k = KINDS[s.kind]
          if (!k.hit || Math.abs(me.x - s.center) > k.hit + CAR_HALF) continue
          me.speed = Math.min(me.speed, MAX * T.crashSpeed)
          me.crash = 0.6
          me.boost = 0
          endDrift(false)
          fx.shake(0.5)
          audio.noise({ dur: 0.3, gain: 0.32 })
          audio.tone({ freq: 90, dur: 0.3, slide: -40, type: 'square', gain: 0.14 })
          break
        }
      }
      position = wrap(position + me.speed * dt)
      me.dist += me.speed * dt
      skyOffset += pSeg.curve * sp * dt * 120
    }

    function updateRivals(dt) {
      for (const r of rivals) {
        const z = wrap(r.dist)
        const seg = segAt(z)
        const ahead = SEGS[(seg.index + 12) % N]
        const curve = Math.max(Math.abs(seg.curve), Math.abs(ahead.curve))
        let target = MAX * r.skill * (1 - Math.max(0, curve - 2) * T.rivalCurveLift)
        const gap = (r.dist - me.dist) / L
        if (gap > 0.12) target *= 1 - T.rubber
        else if (gap < -0.08) target *= 1 + T.rubber
        // don't drive through the car in front: slow down or steer round it
        let line = clamp(ahead.curve * 0.1, -0.6, 0.6)
        const others = [...rivals.filter((o) => o !== r).map((o) => ({ d: o.dist - r.dist, x: o.x, speed: o.speed })), { d: me.dist + PLAYER_Z - r.dist, x: me.x, speed: me.speed }]
        for (const o of others) {
          const d = ((o.d % L) + L * 1.5) % L - L / 2
          if (d > 0 && d < SEG * 8 && Math.abs(o.x - r.x) < CAR_HALF * 2.4 && o.speed < r.speed) {
            line = o.x > 0 ? o.x - 0.65 : o.x + 0.65
            if (d < CAR_LEN * 1.4) target = Math.min(target, o.speed * 0.98)
          }
        }
        r.x = approach(r.x, clamp(line, -0.8, 0.8), 1.4, dt)
        r.speed = approach(r.speed, target, 1.2, dt)
        r.dist += r.speed * dt
      }
    }

    function collide() {
      if (me.bump > 0) return
      const myZ = me.dist + PLAYER_Z
      for (const r of rivals) {
        const d = ((((r.dist - myZ) % L) + L * 1.5) % L) - L / 2
        if (d < -CAR_LEN * 0.5 || d > CAR_LEN || Math.abs(r.x - me.x) > CAR_HALF * 1.8) continue
        if (d > 0 && me.speed > r.speed) {
          me.speed = r.speed * T.bumpKeep
          me.x += Math.sign(me.x - r.x || 1) * 0.1
          me.bump = 0.35
          endDrift(false)
          fx.shake(0.3)
          audio.noise({ dur: 0.15, gain: 0.25 })
          audio.tone({ freq: 140, dur: 0.15, type: 'square', gain: 0.1 })
          return
        }
      }
    }

    function standings() {
      const myZ = me.dist + PLAYER_Z
      place = 1
      for (const r of rivals) {
        const ahead = r.dist > myZ
        if (ahead) place++
        // a clean pass, once per car per lap
        if (r.ahead && !ahead && !finished && r.passedLap < me.lap && raceTime > 1) {
          r.passedLap = me.lap
          run.score += T.passPoints
          passPts += T.passPoints
          passes++
          pop(`+${T.passPoints} PASS`, C.cyan)
          audio.tone({ freq: 880, dur: 0.08, type: 'triangle', gain: 0.1 })
          audio.tone({ freq: 1320, dur: 0.1, type: 'triangle', gain: 0.1, delay: 0.07 })
        }
        r.ahead = ahead
      }
    }

    function laps() {
      const lap = Math.floor(me.dist / L) + 1
      if (lap <= me.lap || finished) return
      lastLap = raceTime - lapStart
      lapStart = raceTime
      if (!bestLap || lastLap < bestLap) {
        bestLap = lastLap
        env.store.bestLap = Math.round(bestLap * 100) / 100
        env.saveNow()
      }
      if (lap > T.laps) {
        finished = true
        finalPlace = place
        const pts = T.placePoints[place - 1]
        run.score += pts
        say(`${PLACE[place - 1]} PLACE`, `+${pts} for the finish`, place === 1 ? C.gold : C.text, T.finishHold)
        endDrift(true)
        ;[0, 4, 7, 12].forEach((s, i) => audio.tone({ freq: 523 * 2 ** (s / 12), dur: 0.2, type: 'square', gain: 0.1, delay: i * 0.1 }))
        return
      }
      me.lap = lap
      say(lap === T.laps ? 'FINAL LAP' : `LAP ${lap}`, `lap time ${fmt(lastLap)}`, lap === T.laps ? C.gold : C.cyan)
      audio.tone({ freq: 660, dur: 0.12, type: 'triangle', gain: 0.12 })
      audio.tone({ freq: 990, dur: 0.18, type: 'triangle', gain: 0.12, delay: 0.1 })
    }

    function sounds(dt) {
      const sp = me.speed / MAX
      engineT -= dt
      if (engineT <= 0) {
        engineT = 0.055
        audio.tone({ freq: 48 + sp * 110 + (me.boost > 0 ? 30 : 0), dur: 0.08, type: 'sawtooth', gain: 0.035 + sp * 0.025 })
      }
      screechT -= dt
      if ((drift.on || (Math.abs(me.x) > 1 && sp > 0.2)) && screechT <= 0) {
        screechT = 0.09
        audio.noise({ dur: 0.08, gain: drift.on ? 0.05 : 0.08 })
      }
    }

    function particles(dt) {
      const sp = me.speed / MAX
      const ox = drift.on ? drift.dir * -16 : 0
      if (drift.on && frame % 2 === 0) {
        const c = TIER_COLORS[drift.tier]
        for (const side of [-1, 1]) fx.burst(W / 2 + ox + side * 92, H - 44, c, drift.tier ? 2 : 1, 240, { size: drift.tier ? 4 : 7, life: 0.35, gravity: -60 })
      }
      if (Math.abs(me.x) > 1 && sp > 0.15 && frame % 3 === 0) fx.burst(W / 2 + rand(-90, 90), H - 40, '#7a3a9a', 1, 180, { size: 6, life: 0.4, gravity: 300 })
      fx.update(dt)
      for (let i = pops.length - 1; i >= 0; i--) if ((pops[i].t -= dt) <= 0) pops.splice(i, 1)
      if (banner && (banner.t -= dt) <= 0) banner = null
    }

    const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

    // ---- drawing -------------------------------------------------------------------------------
    const carsBySeg = new Map()
    function drawWorld(ctx) {
      const A = lettered()
      frame++
      const base = segAt(position)
      const basePct = (position % SEG) / SEG
      const pSeg = segAt(position + PLAYER_Z)
      const pPct = ((position + PLAYER_Z) % SEG) / SEG
      const playerY = lerp(pSeg.p1.world.y, pSeg.p2.world.y, pPct)
      // sky, sun and two ridges of mountains
      ctx.drawImage(A.sky, 0, 0, W, HZ + 2)
      const sunX = W / 2 + Math.sin(-skyOffset / 1400) * 320
      ctx.drawImage(A.sun, sunX - 180, HZ - 180, 360, 180)
      drawRidge(ctx, A.far, skyOffset * 0.35, HZ + 1, '#2b0f52', '#ff4fd8', 'rgba(255,79,216,0.22)')
      drawRidge(ctx, A.near, skyOffset * 0.7, HZ + 1, '#160828', '#39e8ff', null)
      ctx.fillStyle = C.ground2
      ctx.fillRect(0, HZ, W, H - HZ)
      // the road, front to back; each segment is clipped by the nearer ones (hills)
      let maxy = H
      let x = 0
      let dx = -(base.curve * basePct)
      const grid = [new Path2D(), new Path2D(), new Path2D()]
      for (let n = 0; n < DRAW; n++) {
        const seg = SEGS[(base.index + n) % N]
        const camZ = position - (seg.index < base.index ? L : 0)
        seg.fog = 1 - Math.exp(-((n / DRAW) ** 2) * FOG)
        seg.clip = maxy
        project(seg.p1, me.x * ROAD - x, playerY + CAM_H, camZ)
        project(seg.p2, me.x * ROAD - x - dx, playerY + CAM_H, camZ)
        x += dx
        dx += seg.curve
        if (seg.p1.camera.z <= DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue
        seg.vis = frame
        drawSegment(ctx, seg, grid[n < 50 ? 0 : n < 130 ? 1 : 2])
        maxy = seg.p2.screen.y
      }
      ctx.lineWidth = 2
      ;[0.75, 0.45, 0.2].forEach((a, i) => {
        ctx.strokeStyle = `rgba(255,79,216,${a})`
        ctx.stroke(grid[i])
      })
      // a bright horizon line
      ctx.fillStyle = 'rgba(255,120,200,0.5)'
      ctx.fillRect(0, HZ - 1, W, 2)
      // scenery and rivals, back to front
      carsBySeg.clear()
      for (const r of rivals) {
        const z = wrap(r.dist)
        const i = Math.floor(z / SEG) % N
        if (!carsBySeg.has(i)) carsBySeg.set(i, [])
        carsBySeg.get(i).push({ r, pct: (z % SEG) / SEG })
      }
      for (let n = DRAW - 1; n > 0; n--) {
        const seg = SEGS[(base.index + n) % N]
        if (seg.vis !== frame) continue
        for (const s of seg.sprites) drawSprite(ctx, A, seg, s)
        const cars = carsBySeg.get(seg.index)
        if (cars) for (const c of cars) drawRival(ctx, A, seg, c)
      }
    }

    function drawSegment(ctx, seg, grid) {
      const p1 = seg.p1.screen
      const p2 = seg.p2.screen
      const light = Math.floor(seg.index / RUMBLE) % 2 === 0
      ctx.fillStyle = light ? C.ground1 : C.ground2
      ctx.fillRect(0, p2.y, W, p1.y - p2.y + 1)
      const r1 = p1.w / 7
      const r2 = p2.w / 7
      quad(ctx, p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, light ? C.rumble1 : C.rumble2)
      quad(ctx, p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, light ? C.rumble1 : C.rumble2)
      quad(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, light ? C.road1 : C.road2)
      if (seg.finish) {
        // a checkered band across the road
        const cells = 10
        for (let i = 0; i < cells; i++) {
          const a = i / cells
          const b = (i + 1) / cells
          const xa1 = p1.x - p1.w + 2 * p1.w * a
          const xb1 = p1.x - p1.w + 2 * p1.w * b
          const xa2 = p2.x - p2.w + 2 * p2.w * a
          const xb2 = p2.x - p2.w + 2 * p2.w * b
          quad(ctx, xa1, p1.y, xb1, p1.y, xb2, p2.y, xa2, p2.y, (i + seg.index) % 2 ? '#fff4fb' : '#1a0631')
        }
      } else if (light) {
        const l1 = p1.w / 36
        const l2 = p2.w / 36
        for (const k of [-1 / 3, 1 / 3]) {
          const x1 = p1.x + k * p1.w
          const x2 = p2.x + k * p2.w
          quad(ctx, x1 - l1, p1.y, x1 + l1, p1.y, x2 + l2, p2.y, x2 - l2, p2.y, C.lane)
        }
      }
      if (seg.fog > 0.02) {
        ctx.globalAlpha = seg.fog
        ctx.fillStyle = C.fog
        ctx.fillRect(0, p2.y, W, p1.y - p2.y + 1)
        ctx.globalAlpha = 1
      }
      // the magenta grid on the ground (never over the road)
      for (const k of GRID_X) {
        grid.moveTo(p1.x - k * p1.w, p1.y)
        grid.lineTo(p2.x - k * p2.w, p2.y)
        grid.moveTo(p1.x + k * p1.w, p1.y)
        grid.lineTo(p2.x + k * p2.w, p2.y)
      }
      if (seg.index % 4 === 0) {
        grid.moveTo(0, p1.y)
        grid.lineTo(p1.x - p1.w - r1, p1.y)
        grid.moveTo(p1.x + p1.w + r1, p1.y)
        grid.lineTo(W, p1.y)
      }
    }

    function blitClipped(ctx, img, x, y, w, h, clip) {
      // y is the bottom; anything below clip is hidden by a nearer hill
      const hidden = Math.max(0, y - clip)
      if (hidden >= h || w < 1.5) return
      const k = 1 - hidden / h
      ctx.drawImage(img, 0, 0, img.width, img.height * k, x, y - h, w, h * k)
    }

    function drawSprite(ctx, A, seg, s) {
      const p = seg.p1.screen
      const kind = KINDS[s.kind]
      const k = p.scale * (W / 2)
      const w = kind.w * k
      const h = kind.h * k
      const cx = p.x + s.center * ROAD * k
      const img = s.kind === 'board' ? A.boards[seg.index % 3] : A[s.kind]
      ctx.globalAlpha = 1 - seg.fog * 0.85
      blitClipped(ctx, img, cx - w / 2, p.y, w, h, seg.clip)
      ctx.globalAlpha = 1
    }

    function drawRival(ctx, A, seg, { r, pct }) {
      const p1 = seg.p1.screen
      const p2 = seg.p2.screen
      const scale = lerp(p1.scale, p2.scale, pct)
      const k = scale * (W / 2)
      const x = lerp(p1.x, p2.x, pct) + r.x * ROAD * k
      const y = lerp(p1.y, p2.y, pct)
      const w = CAR_W * k
      const h = CAR_H * k
      if (y > H + h) return
      ctx.globalAlpha = 1 - seg.fog * 0.85
      blitClipped(ctx, A.rivals[r.i], x - w / 2, y + h * 0.05, w, h, seg.clip)
      ctx.globalAlpha = 1
    }

    function drawPlayer(ctx, A) {
      const sp = me.speed / MAX
      const lean = clamp(me.steer + (drift.on ? drift.dir * 0.6 : 0), -1, 1)
      const img = A.player[Math.round((lean + 1) * 2)]
      const rough = Math.abs(me.x) > 1 ? rand(-3, 3) * sp : 0
      const bounce = Math.sin(raceTime * 30) * 1.2 * sp + rough
      ctx.save()
      ctx.translate(W / 2 + (drift.on ? drift.dir * -16 : 0), H - 28 + bounce)
      ctx.rotate(drift.on ? drift.dir * 0.07 : me.steer * 0.02)
      if (me.crash > 0 && Math.floor(me.crash * 16) % 2) ctx.globalAlpha = 0.5
      ctx.drawImage(img, -125, -144, 250, 144)
      // boost flames from the exhausts
      if (me.boost > 0) {
        const c = TIER_COLORS[me.boostTier]
        for (const ex of [-63, 63]) {
          const f = 14 + Math.random() * 10
          ctx.fillStyle = c
          ctx.beginPath()
          ctx.ellipse(ex, -20, f * 0.6, f * 0.45, 0, 0, TAU)
          ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.beginPath()
          ctx.ellipse(ex, -20, f * 0.25, f * 0.2, 0, 0, TAU)
          ctx.fill()
        }
      }
      ctx.restore()
    }

    function drawSpeedLines(ctx) {
      if (me.boost <= 0) return
      ctx.strokeStyle = 'rgba(255,244,251,0.35)'
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i < 18; i++) {
        const a = rand(0, TAU)
        const r0 = rand(380, 520)
        const r1 = r0 + rand(80, 200)
        ctx.moveTo(W / 2 + Math.cos(a) * r0, HZ + Math.sin(a) * r0 * 0.7)
        ctx.lineTo(W / 2 + Math.cos(a) * r1, HZ + Math.sin(a) * r1 * 0.7)
      }
      ctx.stroke()
    }

    function drawHud(ctx) {
      const edge = { edge: 7, edgeColor: C.ink }
      // place and lap, top left
      label(ctx, PLACE[(finished ? finalPlace : place) - 1], 36, 62, { font: font(400, 64, 'Bungee'), color: place === 1 ? C.gold : C.text, align: 'left', ...edge })
      label(ctx, `LAP ${Math.min(me.lap, T.laps)}/${T.laps}`, 40, 116, { font: font(400, 28, 'Lilita One'), color: C.cyan, align: 'left', ...edge })
      // race time, top centre
      label(ctx, fmt(raceTime - lapStart), W / 2, 50, { font: font(400, 34, 'Bungee'), color: C.text, ...edge })
      if (bestLap) label(ctx, `best lap ${fmt(bestLap)}`, W / 2, 88, { font: font(700, 22), color: '#e0b8ff', ...edge })
      // score under the time, right of centre
      label(ctx, `${Math.round(run.score)}`, W - 150, 52, { font: font(400, 36, 'Lilita One'), color: C.gold, align: 'right', ...edge })
      // speed, bottom right (moves left of the drift button on touch)
      const kmh = Math.round((me.speed / MAX) * 260)
      const sx = input.mode === 'touch' ? W - 280 : W - 40
      label(ctx, `${kmh}`, sx, H - 112, { font: font(400, 52, 'Bungee'), color: me.boost > 0 ? TIER_COLORS[me.boostTier] : C.text, align: 'right', ...edge })
      label(ctx, 'km/h', sx, H - 74, { font: font(700, 22), color: '#e0b8ff', align: 'right', ...edge })
      // the drift charge meter, bottom left
      if (drift.on) {
        const x = 40
        const y = H - 120
        const max = T.driftTiers[2]
        ctx.fillStyle = 'rgba(11,4,24,0.7)'
        ctx.beginPath()
        ctx.roundRect(x, y, 260, 22, 11)
        ctx.fill()
        ctx.fillStyle = TIER_COLORS[drift.tier]
        ctx.beginPath()
        ctx.roundRect(x + 3, y + 3, 254 * Math.min(1, drift.charge / max), 16, 8)
        ctx.fill()
        ctx.fillStyle = C.ink
        for (const s of T.driftTiers.slice(0, 2)) ctx.fillRect(x + 3 + (254 * s) / max, y + 2, 3, 18)
        label(ctx, `DRIFT ${Math.round(drift.charge * T.driftPoints + T.tierBonus[drift.tier])}`, x, y - 22, { font: font(400, 30, 'Lilita One'), color: TIER_COLORS[drift.tier], align: 'left', ...edge })
      }
      // popups and banners
      pops.forEach((p, i) => {
        ctx.globalAlpha = Math.min(1, p.t * 3)
        label(ctx, p.text, W / 2, 470 - i * 40 - (1.1 - p.t) * 50, { font: font(400, 34, 'Lilita One'), color: p.color, ...edge })
      })
      ctx.globalAlpha = 1
      if (banner) {
        const a = Math.min(1, banner.t * 3, (banner.max - banner.t) * 8)
        ctx.globalAlpha = a
        label(ctx, banner.text, W / 2, 250, { font: font(400, 80, 'Bungee'), color: banner.color, edge: 12, edgeColor: C.ink })
        if (banner.sub) label(ctx, banner.sub, W / 2, 316, { font: font(700, 28), color: C.text, ...edge })
        ctx.globalAlpha = 1
      }
      // touch: a big drift button
      if (input.mode === 'touch') {
        const b = DRIFT_BTN
        ctx.fillStyle = drift.on ? 'rgba(255,79,216,0.55)' : 'rgba(11,4,24,0.5)'
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.r, 0, TAU)
        ctx.fill()
        ctx.lineWidth = 4
        ctx.strokeStyle = C.grid
        ctx.stroke()
        label(ctx, 'DRIFT', b.x, b.y, { font: font(400, 30, 'Lilita One'), color: C.text })
      }
    }

    const run = {
      score: 0,
      done: false,
      stats: () => [
        ['Place', PLACE[finalPlace - 1]],
        ['Best lap', bestLap ? fmt(bestLap) : '-'],
        ['Drift points', driftPts]
      ],
      prompts: (inp) => (inp.mode === 'touch' || raceTime > 8 ? [] : [['a', 'Drift'], ['b', 'Brake']]), // then out of the car's way
      update(dt) {
        raceTime += dt
        updatePlayer(dt)
        updateRivals(dt)
        collide()
        standings()
        laps()
        sounds(dt)
        particles(dt)
        if (finished && (finishT += dt) >= T.finishHold) run.done = true
      },
      draw(ctx) {
        const A = art()
        ctx.save()
        ctx.translate(...fx.offset())
        drawWorld(ctx)
        drawSpeedLines(ctx)
        fx.draw(ctx)
        drawPlayer(ctx, A)
        ctx.restore()
        drawHud(ctx)
      },
      // for the headless bot test
      _dbg: () => ({ me, drift, position, place, finished, raceTime, rivals, driftPts, passPts, passes, seg: segAt(position + PLAYER_Z), segAhead: (n) => SEGS[(segAt(position + PLAYER_Z).index + n) % N], bestLap })
    }
    return run
  }
}
