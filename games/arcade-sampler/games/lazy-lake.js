// Lazy Lake: a cozy golden-hour fishing game. Hold to swing the power meter and cast, wait for the
// bobber to dip, hook it, then keep the line's tension inside the fish's moving sweet zone until
// it's landed. Four species with their own fight patterns; rarer fish swim farther out.
// Style: a soft painterly lake at golden hour that slowly turns to dusk over the 120 s outing.
import { W, H, TAU, clamp, lerp, rand, approach, label, createFx } from '../common.js'

const TUNING = {
  roundSeconds: 120,
  // cast
  chargePeriod: 1.6, // seconds for the meter to swing full and back
  minCast: 0.08, // distance (0..1) at zero power
  aimMin: -0.4,
  aimMax: 0.62,
  aimSpeed: 1.1, // aim per second from the stick
  dragAim: 420, // px of pointer drag for the full aim range
  flightTime: 0.75,
  // waiting
  approachDelay: [0.9, 2.4],
  scareDelay: [1.6, 2.6],
  missDelay: [1.0, 1.8],
  maxNibbles: 2,
  nibbleGap: [0.5, 1.1],
  biteWindow: 0.6,
  swimSpeed: 0.32, // how fast a curious fish closes in (water units / s)
  // reel
  reelUp: 1.05, // tension per second while holding
  reelDown: 0.95, // per second while easing off
  tensionResponse: 7,
  startTension: 0.3,
  grace: 0.8,
  snapTime: 1.0, // seconds too tight
  slackTime: 1.5, // seconds too slack
  recover: 0.9, // the outside timers drain this fast while inside the zone
  drain: 0.1, // catch meter lost per second outside the zone
  // scoring
  sizeBonus: 0.8, // extra multiplier for the biggest of a species
  distBonus: 0.4, // extra multiplier at the farthest cast
  // pacing (the clock pauses for the leap and the card)
  leapTime: 0.85,
  cardTime: 2.8,
  cardSkip: 0.45,
  lostTime: 1.3,
  retrieveTime: 0.45,
  maxRings: 24,
  maxFireflies: 24
}

// ---- species -----------------------------------------------------------------------------------
// zone: half-height of the sweet zone (0..1 of the bar). fill: catch meter per second inside it.
const SPECIES = [
  {
    id: 'carp',
    name: 'Mirror Carp',
    short: 'Carp',
    base: 40,
    size: [30, 64],
    zone: 0.15,
    fill: 0.34,
    pattern: 'calm',
    depth: 0.4,
    tail: 0.17,
    back: '#7d5a26',
    color: '#c39446',
    belly: '#f0dca2',
    fin: '#a2712f',
    edge: '#5a3c17',
    shadow: 64,
    weight: (d) => 1.1 - 0.75 * d
  },
  {
    id: 'trout',
    name: 'Rainbow Trout',
    short: 'Trout',
    base: 70,
    size: [24, 56],
    zone: 0.12,
    fill: 0.3,
    pattern: 'dart',
    depth: 0.27,
    tail: 0.14,
    back: '#4f6a4f',
    color: '#9db18a',
    belly: '#f5e6d2',
    fin: '#7c8f66',
    edge: '#34482f',
    shadow: 56,
    weight: (d) => 0.25 + 0.6 * d
  },
  {
    id: 'catfish',
    name: 'Whiskered Catfish',
    short: 'Catfish',
    base: 110,
    size: [45, 98],
    zone: 0.12,
    fill: 0.2,
    pattern: 'stubborn',
    depth: 0.28,
    tail: 0.13,
    back: '#3b342d',
    color: '#6b5f50',
    belly: '#c2b398',
    fin: '#4e453b',
    edge: '#221d18',
    shadow: 86,
    weight: (d) => 0.1 + 0.5 * d
  },
  {
    id: 'koi',
    name: 'Golden Koi',
    short: 'Koi',
    base: 260,
    size: [40, 78],
    zone: 0.09,
    fill: 0.26,
    pattern: 'koi',
    depth: 0.33,
    tail: 0.22,
    back: '#ea8a16',
    color: '#f8b93a',
    belly: '#fff2c4',
    fin: '#ffcf6a',
    edge: '#a0520c',
    shadow: 74,
    weight: (d) => Math.max(0, d - 0.55) * 0.65
  }
]
const BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]))

function pickSpecies(d, r = Math.random()) {
  const ws = SPECIES.map((s) => Math.max(0, s.weight(d)))
  let x = r * ws.reduce((a, b) => a + b, 0)
  for (let i = 0; i < ws.length; i++) if ((x -= ws[i]) <= 0) return SPECIES[i]
  return SPECIES[0]
}

/** Moves the sweet zone's centre f.z (0..1) for one species' struggle pattern. */
const PATTERNS = {
  calm(f) {
    f.z = 0.5 + 0.19 * Math.sin(f.t * 0.85 + f.ph) + 0.05 * Math.sin(f.t * 2.3 + f.ph * 2)
  },
  dart(f, dt) {
    if ((f.timer -= dt) <= 0) {
      let n
      do n = rand(0.2, 0.8)
      while (Math.abs(n - f.target) < 0.22)
      f.target = n
      f.timer = rand(0.75, 1.35)
      f.lunge = 1
    }
    f.z = approach(f.z, f.target, 7, dt) + 0.015 * Math.sin(f.t * 9)
  },
  stubborn(f, dt) {
    if ((f.timer -= dt) <= 0) {
      f.shaking = !f.shaking
      f.timer = f.shaking ? rand(0.7, 1.0) : rand(1.8, 2.8)
      if (f.shaking) f.lunge = 1
    }
    f.target = f.shaking ? 0.38 : 0.72 + 0.06 * Math.sin(f.t * 0.6)
    f.z = approach(f.z, f.target, f.shaking ? 5 : 1.6, dt)
  },
  koi(f, dt) {
    if ((f.timer -= dt) <= 0) {
      f.off = rand(-0.17, 0.17)
      f.timer = rand(0.8, 1.4)
      f.lunge = 1
    }
    f.target = 0.5 + 0.18 * Math.sin(f.t * 1.5 + f.ph) + f.off
    f.z = approach(f.z, f.target, 5, dt)
  }
}

// ---- the lake in screen space ------------------------------------------------------------------
// The water is a plane: u is sideways (-1..1), d is distance out (0 at the dock, 1 far).
const HOR = 336
const SY = (d) => 578 - d * 205
const SS = (d) => 1 - 0.5 * d
const SX = (u, d) => 720 + u * (400 - 170 * d)
const FISHER = { x: 522, y: 598 }
const PIVOT = { x: 566, y: 552 }
const ROD_LEN = 232
const BUCKET = { x: 446, y: 656 }
const PAUSE_ZONE = { x: W - 130, y: 0, w: 130, h: 100 }
const BAR = { x: 1062, y: 138, w: 136, h: 500, top: 196, bot: 584 }

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const mixc = (a, b, k, alpha = 1) => {
  const A = hex(a)
  const B = hex(b)
  return `rgba(${Math.round(lerp(A[0], B[0], k))},${Math.round(lerp(A[1], B[1], k))},${Math.round(lerp(A[2], B[2], k))},${alpha})`
}
const smooth = (a, b, x) => {
  const k = clamp((x - a) / (b - a), 0, 1)
  return k * k * (3 - 2 * k)
}
const easeOut = (k) => 1 - (1 - k) ** 3
const easeBack = (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2
const hash = (a, b = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return s - Math.floor(s)
}

// Golden hour → dusk palettes (k = 0 → 1 over the outing)
const SKY = [
  ['#e9a36f', '#4a4a86'],
  ['#f8c98a', '#b0697e'],
  ['#ffe7b4', '#f39a6a']
]
const WATER = [
  ['#f3cd92', '#d88a72'],
  ['#86a9ad', '#4d5a7e'],
  ['#3d6a78', '#22344f']
]

// ---- baked art (lazy: the module can load in node for the bot) ---------------------------------
function bake(w, h, fn, scale = 2) {
  const c = document.createElement('canvas')
  c.width = Math.ceil(w * scale)
  c.height = Math.ceil(h * scale)
  const g = c.getContext('2d')
  g.scale(scale, scale)
  fn(g)
  return c
}

function ridge(g, pts, base, color) {
  g.fillStyle = color
  g.beginPath()
  g.moveTo(0, base)
  for (const [x, y] of pts) g.lineTo(x, y)
  g.lineTo(W, base)
  g.closePath()
  g.fill()
}
function ridgePts(y0, amp, seed, step = 16, bumps = 0) {
  const pts = []
  for (let x = 0; x <= W; x += step) {
    let y = y0 - amp * (0.5 + 0.3 * Math.sin(x * 0.004 + seed) + 0.2 * Math.sin(x * 0.011 + seed * 2.3))
    if (bumps) y -= Math.abs(Math.sin(x * 0.09 + seed)) * bumps * hash(x, seed)
    pts.push([x, y])
  }
  return pts
}

function drawHills(g) {
  // far mauve hills, mid hills, a dark treeline on the shore
  ridge(g, ridgePts(300, 90, 1.3), HOR, '#c995a0')
  g.globalAlpha = 0.35
  ridge(g, ridgePts(302, 86, 1.3).map(([x, y]) => [x, y + 6]), HOR, '#e8b89a')
  g.globalAlpha = 1
  ridge(g, ridgePts(318, 52, 4.1), HOR, '#9a7088')
  ridge(g, ridgePts(334, 22, 2.2, 8, 16), HOR, '#5b4a62')
  // warm rim light on the sun side of the treeline
  g.globalAlpha = 0.5
  g.strokeStyle = '#f7b97a'
  g.lineWidth = 2
  g.beginPath()
  ridgePts(334, 22, 2.2, 8, 16).forEach(([x, y], i) => (i ? g.lineTo(x, y + 1) : g.moveTo(x, y + 1)))
  g.stroke()
  g.globalAlpha = 1
  // a tiny boathouse on the far shore
  g.fillStyle = '#4a3b50'
  g.fillRect(250, 316, 34, 18)
  g.beginPath()
  g.moveTo(244, 318)
  g.lineTo(267, 302)
  g.lineTo(290, 318)
  g.fill()
  g.fillStyle = '#ffd88a'
  g.fillRect(262, 322, 6, 6)
  // shore line
  g.fillStyle = '#ffe2a6'
  g.globalAlpha = 0.5
  g.fillRect(0, HOR - 2, W, 2)
  g.globalAlpha = 1
}

function drawCloud(g, w, h, seed) {
  const grad = g.createLinearGradient(0, -h, 0, h)
  grad.addColorStop(0, 'rgba(255,236,210,0.9)')
  grad.addColorStop(1, 'rgba(240,150,140,0.75)')
  g.fillStyle = grad
  for (let i = 0; i < 7; i++) {
    const x = (hash(i, seed) - 0.5) * w * 0.8
    const r = h * (0.4 + hash(i + 3, seed) * 0.5)
    g.beginPath()
    g.ellipse(x, -r * 0.3 + hash(i + 9, seed) * h * 0.3, r * 1.8, r, 0, 0, TAU)
    g.fill()
  }
  g.fillStyle = 'rgba(255,250,235,0.5)'
  g.beginPath()
  g.ellipse(-w * 0.1, -h * 0.35, w * 0.25, h * 0.18, 0, 0, TAU)
  g.fill()
}

function drawDock(g) {
  // dock in perspective: far end at y 598 (x 418..626), near edge off the bottom
  const endY = FISHER.y
  const L = (y) => lerp(418, 300, (y - endY) / (H - endY))
  const R = (y) => lerp(626, 744, (y - endY) / (H - endY))
  // posts in the water at the end
  for (const x of [424, 620]) {
    g.fillStyle = '#4a3322'
    g.fillRect(x - 8, endY + 10, 16, 52)
    g.fillStyle = 'rgba(30,50,60,0.35)'
    g.beginPath()
    g.ellipse(x, endY + 62, 22, 6, 0, 0, TAU)
    g.fill()
  }
  // end face
  g.fillStyle = '#6a4a2e'
  g.fillRect(414, endY, 216, 16)
  // deck
  g.fillStyle = '#9c6c40'
  g.beginPath()
  g.moveTo(L(endY), endY)
  g.lineTo(R(endY), endY)
  g.lineTo(R(H), H)
  g.lineTo(L(H), H)
  g.closePath()
  g.fill()
  // boards across, wider towards us
  const N = 11
  for (let i = 0; i < N; i++) {
    const y0 = endY + (H - endY) * (i / N) ** 1.15
    const y1 = endY + (H - endY) * ((i + 1) / N) ** 1.15
    const tone = ['#b27d4b', '#a87444', '#b9875a', '#a06c3e'][i % 4]
    g.fillStyle = tone
    g.beginPath()
    g.moveTo(L(y0), y0 + 1)
    g.lineTo(R(y0), y0 + 1)
    g.lineTo(R(y1), y1 - 2)
    g.lineTo(L(y1), y1 - 2)
    g.closePath()
    g.fill()
    // wood grain strokes
    g.strokeStyle = 'rgba(80,50,25,0.25)'
    g.lineWidth = 1.2
    for (let k = 0; k < 4; k++) {
      const yy = lerp(y0, y1, 0.25 + hash(i, k) * 0.5)
      const xa = lerp(L(yy), R(yy), hash(k, i) * 0.6)
      g.beginPath()
      g.moveTo(xa, yy)
      g.lineTo(xa + 40 + hash(i + k) * 80, yy + 0.5)
      g.stroke()
    }
    // sunlit top edge
    g.fillStyle = 'rgba(255,214,150,0.35)'
    g.fillRect(L(y0) + 4, y0 + 1, R(y0) - L(y0) - 8, 2)
    // nails
    g.fillStyle = 'rgba(50,30,15,0.6)'
    const ym = (y0 + y1) / 2
    for (const f of [0.06, 0.94]) {
      g.beginPath()
      g.arc(lerp(L(ym), R(ym), f), ym, 1.6 + i * 0.12, 0, TAU)
      g.fill()
    }
  }
  // side beams
  g.fillStyle = '#5e3f26'
  for (const side of [L, R]) {
    g.beginPath()
    const s = side === L ? -1 : 1
    g.moveTo(side(endY), endY)
    g.lineTo(side(endY) + s * 6, endY)
    g.lineTo(side(H) + s * 12, H)
    g.lineTo(side(H), H)
    g.fill()
  }
  // bollards at the end corners
  for (const x of [426, 618]) {
    g.fillStyle = '#5a3d25'
    g.fillRect(x - 9, endY - 34, 18, 40)
    g.fillStyle = '#7a5434'
    g.beginPath()
    g.ellipse(x, endY - 34, 9, 4, 0, 0, TAU)
    g.fill()
    g.fillStyle = 'rgba(255,200,130,0.4)'
    g.fillRect(x + 3, endY - 32, 3, 36)
  }
  // coil of rope
  g.strokeStyle = '#d8b67a'
  g.lineWidth = 4
  for (let i = 0; i < 3; i++) {
    g.beginPath()
    g.ellipse(640, 720, 26 - i * 7, 10 - i * 2.6, 0, 0, TAU)
    g.stroke()
  }
  // a calm, darker strip for the hub's prompt legend
  const fade = g.createLinearGradient(0, H - 70, 0, H)
  fade.addColorStop(0, 'rgba(20,16,30,0)')
  fade.addColorStop(1, 'rgba(20,16,30,0.45)')
  g.fillStyle = fade
  g.fillRect(0, H - 70, W, 70)
}

function drawGrain(g) {
  // painterly brush grain and a soft vignette, baked once
  for (let i = 0; i < 1600; i++) {
    const x = hash(i, 1) * W
    const y = hash(i, 2) * H
    g.strokeStyle = hash(i, 3) > 0.5 ? 'rgba(255,230,190,0.035)' : 'rgba(40,30,60,0.04)'
    g.lineWidth = 2 + hash(i, 4) * 4
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + 10 + hash(i, 5) * 30, y + (hash(i, 6) - 0.5) * 4)
    g.stroke()
  }
  const v = g.createRadialGradient(W / 2, H * 0.45, H * 0.4, W / 2, H * 0.45, H * 1.0)
  v.addColorStop(0, 'rgba(30,20,40,0)')
  v.addColorStop(1, 'rgba(30,20,40,0.35)')
  g.fillStyle = v
  g.fillRect(0, 0, W, H)
}

function glowSprite(r, color) {
  return bake(r * 2, r * 2, (g) => {
    const gr = g.createRadialGradient(r, r, 0, r, r, r)
    gr.addColorStop(0, color)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, r * 2, r * 2)
  }, 1)
}

/** A fish facing right, centred on the origin. wig swings the tail. */
function drawFish(g, sp, len, wig = 0) {
  const h = len * sp.depth
  const nose = len * 0.5
  const tb = -len * 0.3
  g.save()
  g.lineJoin = 'round'
  // tail
  g.save()
  g.translate(tb + 3, 0)
  g.rotate(wig * 0.35)
  g.fillStyle = sp.fin
  g.beginPath()
  g.moveTo(4, 0)
  g.quadraticCurveTo(-len * 0.1, -len * 0.05, -len * 0.21, -len * sp.tail)
  g.quadraticCurveTo(-len * 0.13, 0, -len * 0.21, len * sp.tail)
  g.quadraticCurveTo(-len * 0.1, len * 0.05, 4, 0)
  g.fill()
  g.strokeStyle = sp.edge
  g.lineWidth = Math.max(1, len * 0.01)
  g.stroke()
  g.restore()
  // dorsal fin
  g.fillStyle = sp.fin
  g.beginPath()
  g.moveTo(len * 0.12, -h * 0.4)
  g.quadraticCurveTo(-len * 0.02, -h * (sp.id === 'koi' ? 1.05 : 0.9), -len * 0.17, -h * 0.55)
  g.lineTo(-len * 0.2, -h * 0.25)
  g.closePath()
  g.fill()
  // body
  const grad = g.createLinearGradient(0, -h / 2, 0, h / 2)
  grad.addColorStop(0, sp.back)
  grad.addColorStop(0.5, sp.color)
  grad.addColorStop(1, sp.belly)
  const body = new Path2D()
  const headY = sp.id === 'catfish' ? 0.72 : 0.62
  body.moveTo(nose, sp.id === 'catfish' ? h * 0.05 : 0)
  body.bezierCurveTo(nose - len * 0.06, -h * headY, tb + len * 0.25, -h * 0.62, tb, -h * 0.12)
  body.lineTo(tb, h * 0.12)
  body.bezierCurveTo(tb + len * 0.25, h * 0.6, nose - len * 0.06, h * 0.58, nose, sp.id === 'catfish' ? h * 0.05 : 0)
  g.fillStyle = grad
  g.fill(body)
  g.save()
  g.clip(body)
  if (sp.id === 'carp') {
    g.strokeStyle = 'rgba(255,240,190,0.45)'
    g.lineWidth = len * 0.012
    for (let i = 0; i < 4; i++)
      for (let j = -1; j <= 1; j++) {
        g.beginPath()
        g.arc(len * 0.18 - i * len * 0.11, j * h * 0.28, len * 0.05, -1.2, 1.2)
        g.stroke()
      }
  } else if (sp.id === 'trout') {
    g.fillStyle = 'rgba(232,120,140,0.75)'
    g.fillRect(-len * 0.4, -h * 0.06, len * 0.85, h * 0.2)
    g.fillStyle = 'rgba(40,40,30,0.55)'
    for (let i = 0; i < 16; i++) {
      g.beginPath()
      g.arc(-len * 0.3 + hash(i, 7) * len * 0.62, -h * 0.45 + hash(i, 8) * h * 0.4, len * 0.011, 0, TAU)
      g.fill()
    }
  } else if (sp.id === 'catfish') {
    g.fillStyle = 'rgba(20,15,10,0.25)'
    for (let i = 0; i < 6; i++) {
      g.beginPath()
      g.ellipse(-len * 0.25 + hash(i, 3) * len * 0.5, -h * 0.25 + hash(i, 4) * h * 0.3, len * 0.04, h * 0.08, 0, 0, TAU)
      g.fill()
    }
  } else {
    g.fillStyle = '#e2502a'
    for (let i = 0; i < 4; i++) {
      g.beginPath()
      g.ellipse(len * 0.22 - i * len * 0.15, -h * 0.18 + (i % 2) * h * 0.1, len * 0.07, h * 0.2, 0.3 * i, 0, TAU)
      g.fill()
    }
    g.fillStyle = 'rgba(255,255,240,0.6)'
    g.beginPath()
    g.ellipse(-len * 0.05, h * 0.15, len * 0.06, h * 0.12, 0, 0, TAU)
    g.fill()
  }
  // sheen
  g.fillStyle = 'rgba(255,255,255,0.22)'
  g.beginPath()
  g.ellipse(len * 0.05, -h * 0.22, len * 0.28, h * 0.07, -0.05, 0, TAU)
  g.fill()
  g.restore()
  g.strokeStyle = sp.edge
  g.lineWidth = Math.max(1.2, len * 0.012)
  g.stroke(body)
  // gill and pectoral fin
  g.beginPath()
  g.arc(len * 0.26, 0, h * 0.34, -1.0, 1.0)
  g.strokeStyle = 'rgba(0,0,0,0.25)'
  g.stroke()
  g.fillStyle = sp.fin
  g.beginPath()
  g.ellipse(len * 0.14, h * 0.24, len * 0.07, h * 0.1, 0.5, 0, TAU)
  g.fill()
  // whiskers
  if (sp.id === 'catfish') {
    g.strokeStyle = sp.edge
    g.lineWidth = Math.max(1, len * 0.009)
    for (const s of [-1, 1]) {
      g.beginPath()
      g.moveTo(nose - len * 0.03, h * 0.08)
      g.quadraticCurveTo(nose + len * 0.08, h * (0.2 + s * 0.1), nose + len * 0.05, h * (0.55 + s * 0.15))
      g.stroke()
    }
  }
  // eye
  g.fillStyle = '#fff8e8'
  g.beginPath()
  g.arc(len * 0.38, -h * 0.1, len * 0.035, 0, TAU)
  g.fill()
  g.fillStyle = '#1a1412'
  g.beginPath()
  g.arc(len * 0.39, -h * 0.1, len * 0.02, 0, TAU)
  g.fill()
  g.restore()
}

let ART = null
const art = () => {
  if (ART) return ART
  ART = {
    hills: bake(W, HOR + 2, drawHills),
    hillsRefl: bake(W, 60, (g) => {
      g.save()
      g.translate(0, HOR + 60 - 60)
      g.scale(1, -0.55)
      g.translate(0, -HOR)
      g.globalAlpha = 0.32
      drawHills(g)
      g.restore()
    }),
    dock: bake(W, H - 560, (g) => (g.translate(0, -560), drawDock(g))),
    grain: bake(W, H, drawGrain, 1),
    sunGlow: glowSprite(260, 'rgba(255,214,140,0.75)'),
    firefly: glowSprite(18, 'rgba(230,255,140,0.95)'),
    lantern: glowSprite(90, 'rgba(255,190,100,0.6)'),
    clouds: [0, 1, 2, 3].map((i) => bake(440, 130, (g) => (g.translate(220, 74), drawCloud(g, 260 - i * 30, 44 - i * 5, i + 1)))),
    fish: SPECIES.map((sp) => bake(260, 150, (g) => (g.translate(130, 75), drawFish(g, sp, 200)))),
    silhouettes: SPECIES.map((sp) =>
      bake(260, 150, (g) => {
        g.translate(130, 75)
        drawFish(g, sp, 200)
        g.globalCompositeOperation = 'source-in'
        g.fillStyle = 'rgba(40,36,64,0.85)'
        g.fillRect(-130, -75, 260, 150)
      })
    )
  }
  return ART
}

// Decorative scatter (deterministic, no DOM)
const DASHES = Array.from({ length: 230 }, (_, i) => {
  const y = HOR + 6 + (hash(i, 11) ** 1.5) * (H - HOR - 6)
  const k = (y - HOR) / (H - HOR)
  return { x: hash(i, 12) * W, y, len: 8 + k * 52, ph: hash(i, 13) * TAU, sp: 0.6 + hash(i, 14) * 1.4 }
})
const GLINTS = Array.from({ length: 70 }, (_, i) => ({ k: hash(i, 21), off: hash(i, 22) - 0.5, ph: hash(i, 23) * TAU, sp: 1 + hash(i, 24) * 3 }))
const REEDS = [
  ...Array.from({ length: 22 }, (_, i) => ({ x: 10 + hash(i, 31) * 220, y: 640 + hash(i, 32) * 170, h: 120 + hash(i, 33) * 150, lean: 0.05 + hash(i, 34) * 0.2, ph: hash(i, 35) * TAU, w: 5 + hash(i, 36) * 4, tail: hash(i, 37) > 0.7 })),
  ...Array.from({ length: 16 }, (_, i) => ({ x: 1150 + hash(i, 41) * 130, y: 620 + hash(i, 42) * 190, h: 110 + hash(i, 43) * 140, lean: -0.05 - hash(i, 44) * 0.18, ph: hash(i, 45) * TAU, w: 5 + hash(i, 46) * 4, tail: hash(i, 47) > 0.7 }))
].sort((a, b) => a.y - b.y)
const FAR_REEDS = Array.from({ length: 26 }, (_, i) => ({ x: 40 + hash(i, 51) * 300, y: HOR + 6 + hash(i, 52) * 26, h: 18 + hash(i, 53) * 22, ph: hash(i, 54) * TAU }))
const PADS = [
  { x: 210, y: 520, r: 30, a: 0.4, flower: true },
  { x: 270, y: 560, r: 22, a: 2.1 },
  { x: 160, y: 590, r: 36, a: 4.0 },
  { x: 330, y: 470, r: 18, a: 1.2 },
  { x: 960, y: 640, r: 28, a: 5.2 },
  { x: 1010, y: 690, r: 20, a: 3.0, flower: true }
]

function drawReed(ctx, r, t, gust) {
  const sway = Math.sin(t * 1.2 + r.ph) * r.h * 0.035 + gust * r.h * 0.05
  const tx = r.x + r.lean * r.h + sway
  const ty = r.y - r.h
  ctx.fillStyle = '#3d4a2c'
  ctx.beginPath()
  ctx.moveTo(r.x - r.w / 2, r.y)
  ctx.quadraticCurveTo(r.x + r.lean * r.h * 0.3, r.y - r.h * 0.6, tx, ty)
  ctx.quadraticCurveTo(r.x + r.lean * r.h * 0.3 + r.w * 0.6, r.y - r.h * 0.6, r.x + r.w / 2, r.y)
  ctx.fill()
  ctx.strokeStyle = 'rgba(214,190,110,0.45)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(r.x + r.w * 0.3, r.y)
  ctx.quadraticCurveTo(r.x + r.lean * r.h * 0.3 + r.w * 0.5, r.y - r.h * 0.6, tx, ty)
  ctx.stroke()
  if (r.tail) {
    ctx.fillStyle = '#6b4226'
    ctx.save()
    ctx.translate(lerp(r.x, tx, 0.82), lerp(r.y, ty, 0.82))
    ctx.rotate(r.lean + sway / r.h)
    ctx.beginPath()
    ctx.roundRect(-4.5, -18, 9, 30, 4.5)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,190,120,0.4)'
    ctx.fillRect(1.5, -15, 2, 24)
    ctx.restore()
  }
}

function drawPad(ctx, p, t) {
  const bob = Math.sin(t * 0.9 + p.a) * 1.5
  ctx.save()
  ctx.translate(p.x, p.y + bob)
  ctx.scale(1, 0.42)
  ctx.fillStyle = 'rgba(20,40,40,0.25)'
  ctx.beginPath()
  ctx.arc(3, 6, p.r, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#5f8a4a'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.arc(0, 0, p.r, p.a + 0.3, p.a + TAU - 0.3)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(220,220,140,0.4)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
  if (p.flower) {
    ctx.save()
    ctx.translate(p.x - 4, p.y + bob - 4)
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#f7b6c8' : '#fbd3df'
      ctx.beginPath()
      ctx.ellipse(Math.cos((i / 6) * TAU) * 6, Math.sin((i / 6) * TAU) * 2.5 - 3, 6, 3.5, (i / 6) * TAU, 0, TAU)
      ctx.fill()
    }
    ctx.fillStyle = '#ffd86a'
    ctx.beginPath()
    ctx.arc(0, -4, 3, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
}

/** The fisher, seen from behind, sitting on the end of the dock. lean: -1..1, bob for breathing. */
function drawFisher(ctx, t, lean, reelArm) {
  const { x, y } = FISHER
  const breathe = Math.sin(t * 1.6) * 1.2
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(lean * 0.08)
  // shadow on the boards
  ctx.fillStyle = 'rgba(40,20,10,0.3)'
  ctx.beginPath()
  ctx.ellipse(-6, 6, 50, 9, 0, 0, TAU)
  ctx.fill()
  // back / jacket
  const jacket = ctx.createLinearGradient(-40, 0, 40, 0)
  jacket.addColorStop(0, '#2f5560')
  jacket.addColorStop(0.7, '#3f7280')
  jacket.addColorStop(1, '#7fa38f')
  ctx.fillStyle = jacket
  ctx.beginPath()
  ctx.moveTo(-44, 2)
  ctx.quadraticCurveTo(-46, -50 + breathe, -30, -78 + breathe)
  ctx.quadraticCurveTo(0, -92 + breathe, 30, -78 + breathe)
  ctx.quadraticCurveTo(46, -50 + breathe, 44, 2)
  ctx.closePath()
  ctx.fill()
  // folds
  ctx.strokeStyle = 'rgba(20,40,50,0.4)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-2, -82 + breathe)
  ctx.quadraticCurveTo(-6, -40, 0, -2)
  ctx.moveTo(-26, -40)
  ctx.quadraticCurveTo(-18, -24, -24, -6)
  ctx.stroke()
  // warm rim light on the right (the sun side)
  ctx.strokeStyle = 'rgba(255,205,130,0.85)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(30, -78 + breathe)
  ctx.quadraticCurveTo(46, -50 + breathe, 44, 0)
  ctx.stroke()
  // right arm out to the rod
  ctx.strokeStyle = '#3a6a77'
  ctx.lineWidth = 15
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(30, -70 + breathe)
  ctx.quadraticCurveTo(52, -58, PIVOT.x - x - 2, PIVOT.y - y + reelArm)
  ctx.stroke()
  ctx.fillStyle = '#e8b48a'
  ctx.beginPath()
  ctx.arc(PIVOT.x - x, PIVOT.y - y + reelArm, 7, 0, TAU)
  ctx.fill()
  // neck and head
  ctx.fillStyle = '#d99c74'
  ctx.fillRect(-9, -98 + breathe, 18, 14)
  ctx.fillStyle = '#4a2e22'
  ctx.beginPath()
  ctx.arc(0, -108 + breathe, 22, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#e0a47c'
  ctx.beginPath()
  ctx.ellipse(21, -106 + breathe, 4, 7, 0, 0, TAU)
  ctx.fill()
  // straw hat
  ctx.fillStyle = '#d9b06a'
  ctx.beginPath()
  ctx.ellipse(0, -116 + breathe, 50, 14, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#e8c37a'
  ctx.beginPath()
  ctx.ellipse(0, -128 + breathe, 25, 20, 0, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#c0504a'
  ctx.fillRect(-25, -126 + breathe, 50, 7)
  ctx.strokeStyle = 'rgba(255,230,170,0.8)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.ellipse(0, -116 + breathe, 50, 14, 0, -0.9, 0.5)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(130,90,40,0.35)'
  ctx.lineWidth = 1
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath()
    ctx.moveTo(i * 7, -146 + breathe)
    ctx.lineTo(i * 12, -118 + breathe)
    ctx.stroke()
  }
  ctx.restore()
}

function drawBucket(ctx, count, squash) {
  const { x, y } = BUCKET
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1 + squash * 0.12, 1 - squash * 0.12)
  ctx.fillStyle = 'rgba(40,20,10,0.3)'
  ctx.beginPath()
  ctx.ellipse(0, 22, 30, 7, 0, 0, TAU)
  ctx.fill()
  // fish tails poking out
  const tails = Math.min(3, count)
  for (let i = 0; i < tails; i++) {
    ctx.save()
    ctx.translate(-10 + i * 10, -18)
    ctx.rotate(-0.4 + i * 0.4)
    ctx.fillStyle = ['#c39446', '#9db18a', '#6b5f50'][i]
    ctx.beginPath()
    ctx.moveTo(0, 6)
    ctx.lineTo(-8, -12)
    ctx.lineTo(0, -6)
    ctx.lineTo(8, -12)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  ctx.fillStyle = '#7f8c93'
  ctx.beginPath()
  ctx.moveTo(-24, -16)
  ctx.lineTo(24, -16)
  ctx.lineTo(19, 22)
  ctx.lineTo(-19, 22)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#a9b6bb'
  ctx.fillRect(4, -14, 8, 34)
  ctx.fillStyle = '#5f6b72'
  ctx.beginPath()
  ctx.ellipse(0, -16, 24, 6, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#2b4a55'
  ctx.beginPath()
  ctx.ellipse(0, -16, 20, 4.5, 0, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = '#5f6b72'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, -16, 22, Math.PI * 1.05, Math.PI * 1.95)
  ctx.stroke()
  ctx.restore()
}

function drawBobber(ctx, x, y, s, under = 0) {
  // under: 0 floating, 1 fully dipped
  const r = 10.5 * s
  const sink = under * r * 1.6
  ctx.save()
  ctx.beginPath()
  ctx.rect(x - 30, y - 80, 60, 80 + 1)
  ctx.clip()
  ctx.translate(x, y + sink)
  ctx.fillStyle = '#fff6e8'
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI)
  ctx.fill()
  ctx.fillStyle = '#e2452f'
  ctx.beginPath()
  ctx.arc(0, 0, r, Math.PI, TAU)
  ctx.fill()
  ctx.fillStyle = '#2a1a14'
  ctx.fillRect(-1.2 * s, -r - 7 * s, 2.4 * s, 7 * s)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.beginPath()
  ctx.arc(-r * 0.35, -r * 0.45, r * 0.28, 0, TAU)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = 'rgba(255,240,210,0.65)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(x, y, r * 1.5, r * 0.45, 0, 0, TAU)
  ctx.stroke()
}

function drawShadow(ctx, sp, x, y, s, heading, t, alpha = 1) {
  const L = sp.shadow * s
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, 0.42)
  ctx.rotate(heading)
  ctx.globalAlpha = alpha
  ctx.fillStyle = sp.id === 'koi' ? 'rgba(240,160,50,0.42)' : 'rgba(18,36,46,0.3)'
  ctx.beginPath()
  ctx.ellipse(0, 0, L * 0.5, L * sp.depth * 0.5, 0, 0, TAU)
  ctx.fill()
  const w = Math.sin(t * 8) * 0.4
  ctx.beginPath()
  ctx.moveTo(-L * 0.42, 0)
  ctx.lineTo(-L * 0.72, -L * 0.16 + w * L * 0.1)
  ctx.lineTo(-L * 0.72, L * 0.16 + w * L * 0.1)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.globalAlpha = 1
}

function drawIcon(ctx, x, y, t) {
  const A = art()
  ctx.save()
  ctx.translate(x, y)
  ctx.beginPath()
  ctx.rect(-180, -90, 360, 230)
  ctx.clip()
  const sky = ctx.createLinearGradient(0, -90, 0, -10)
  sky.addColorStop(0, SKY[0][0])
  sky.addColorStop(0.6, SKY[1][0])
  sky.addColorStop(1, SKY[2][0])
  ctx.fillStyle = sky
  ctx.fillRect(-180, -90, 360, 82)
  ctx.drawImage(A.sunGlow, 90 - 110, -30 - 110, 220, 220)
  ctx.fillStyle = '#fff1c0'
  ctx.beginPath()
  ctx.arc(90, -28, 16, 0, TAU)
  ctx.fill()
  ctx.drawImage(A.hills, 260 * 2, 250 * 2, 720 * 2, (HOR + 2 - 250) * 2, -180, -50, 360, 43)
  const water = ctx.createLinearGradient(0, -8, 0, 140)
  water.addColorStop(0, WATER[0][0])
  water.addColorStop(0.35, WATER[1][0])
  water.addColorStop(1, WATER[2][0])
  ctx.fillStyle = water
  ctx.fillRect(-180, -8, 360, 150)
  for (let i = 0; i < 26; i++) {
    const k = hash(i, 61)
    const yy = -4 + k * 70
    ctx.fillStyle = `rgba(255,228,160,${0.35 + 0.45 * Math.sin(t * (1 + hash(i, 62) * 2) + i) ** 2})`
    ctx.fillRect(90 + (hash(i, 63) - 0.5) * (10 + k * 60) - 6, yy, 6 + k * 14, 2)
  }
  for (let i = 0; i < 26; i++) {
    const yy = -2 + hash(i, 64) * 140
    ctx.fillStyle = `rgba(255,240,210,${0.12 + 0.12 * Math.sin(t + i)})`
    ctx.fillRect(-180 + hash(i, 65) * 360 + Math.sin(t * 0.6 + i) * 4, yy, 10 + (yy / 140) * 26, 2)
  }
  // fish shadow circling under the bobber
  const bx = 40
  const by = 46
  const a = t * 0.9
  drawShadow(ctx, SPECIES[3], bx + Math.cos(a) * 46, by + 14 + Math.sin(a) * 12, 0.9, a + Math.PI / 2, t)
  // ripples
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.5 + i / 3) % 1
    ctx.strokeStyle = `rgba(255,240,210,${0.7 * (1 - k)})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(bx, by, 10 + k * 60, (10 + k * 60) * 0.3, 0, 0, TAU)
    ctx.stroke()
  }
  // dock corner and rod
  ctx.fillStyle = '#6a4a2e'
  ctx.fillRect(-180, 86, 170, 10)
  ctx.fillStyle = '#a87444'
  ctx.beginPath()
  ctx.moveTo(-180, 86)
  ctx.lineTo(-10, 86)
  ctx.lineTo(10, 150)
  ctx.lineTo(-180, 150)
  ctx.fill()
  ctx.fillStyle = '#b9875a'
  for (let i = 0; i < 3; i++) ctx.fillRect(-180, 96 + i * 18, 186 + i * 6, 8)
  ctx.strokeStyle = '#3a2416'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-90, 110)
  ctx.quadraticCurveTo(-60, 20, -20, -26)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,250,235,0.8)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(-20, -26)
  ctx.quadraticCurveTo(14, 20, bx, by - 8)
  ctx.stroke()
  drawBobber(ctx, bx, by + Math.sin(t * 2) * 1.5, 1.4, Math.max(0, Math.sin(t * 1.3)) ** 8 * 0.6)
  // reeds on the right
  for (let i = 0; i < 7; i++) drawReed(ctx, { x: 130 + i * 9, y: 150, h: 110 + hash(i, 66) * 60, lean: -0.1 - hash(i, 67) * 0.1, ph: i, w: 6, tail: i % 3 === 0 }, t, 0)
  ctx.restore()
}

// ---- the module --------------------------------------------------------------------------------
export default {
  id: 'lazy-lake',
  name: 'Lazy Lake',
  blurb: 'Cast, wait, reel in the koi',
  scoreLabel: 'points',
  style: { bg: '#4f6f8a', accent: '#ffd36e' },
  medals: [500, 950, 1450],
  music: { bpm: 70, root: 55, chords: [0, 5, 9, 7], lead: [4, null, 2, null, 0, null, 2, 4], wave: 'sine', gain: 0.026, hats: false },
  TUNING,
  howTo: (input) =>
    input.mode === 'touch' || input.mode === 'mouse'
      ? 'Press and hold to cast (drag to aim) · tap on the bite · hold to reel'
      : `Hold ${input.label('a')} to cast · ${input.label('a')} on the bite · hold to reel, ease off in the green`,
  icon(ctx, x, y, size, t) {
    drawIcon(ctx, x, y, t)
  },
  cursor: false,
  create(env) {
    const { input, audio, settings, font } = env
    const T = env.TUNING
    const fx = createFx(settings, { max: 160 })
    env.store.found ??= {}
    const found = env.store.found

    let time = T.roundSeconds
    let elapsed = 0
    let clock = 0
    let phase = 'aim' // aim charge flying wait bite reel leap card lost retrieve
    let phaseT = 0
    let aim = 0.12
    let power = 0
    let chargeT = 0
    let dragX0 = 0
    let aim0 = 0
    let pointerHold = false
    let prevHeld = true // ignore a press carried over from the hall until it's released
    let armed = false
    const bob = { u: 0, d: 0, x: 0, y: 0, dip: 0, fromX: 0, fromY: 0 }
    let biter = null
    let nextFish = 0
    let fight = null
    let catchInfo = null
    let leap = null
    let lostMsg = ''
    let rings = []
    let floaters = []
    let fireflies = []
    let rodA = -0.95
    let rodV = 0
    let bucketSquash = 0
    let castCount = 0
    let landed = 0
    let biggest = null
    const runCount = Object.fromEntries(SPECIES.map((s) => [s.id, 0]))
    let newBadge = {}
    let waterTimer = 0.5
    let cricketTimer = 3
    let clickTimer = 0
    let strainTimer = 0
    let idleRing = 0
    let reelsTaught = 0
    let overtime = false

    // Water-plane decoys that just wander (purely scenery)
    const decoys = Array.from({ length: 4 }, () => {
      const d = rand(0.1, 0.95)
      return { sp: pickSpecies(d), u: rand(-1, 1), d, a: rand(0, TAU), turn: 0, t: rand(0, 10) }
    })

    const setPhase = (p) => {
      phase = p
      phaseT = 0
    }
    const ring = (x, y, s, max = 50, life = 1.2) => {
      if (rings.length >= T.maxRings) rings.shift()
      rings.push({ x, y, s, max, t: 0, life })
    }
    const floater = (text, x, y, color = '#fff4d6', size = 34) => floaters.push({ text, x, y, t: 0, color, size })
    const tipPos = () => ({ x: PIVOT.x + Math.cos(rodA) * ROD_LEN, y: PIVOT.y + Math.sin(rodA) * ROD_LEN })

    const sfx = {
      plop: () => {
        audio.tone({ freq: 340, dur: 0.14, type: 'sine', slide: -200, gain: 0.16 })
        audio.noise({ dur: 0.12, gain: 0.05 })
      },
      whoosh: () => audio.noise({ dur: 0.28, gain: 0.05 }),
      nibble: () => audio.tone({ freq: 520 + rand(-30, 30), dur: 0.05, type: 'sine', gain: 0.07 }),
      bite: () => {
        audio.tone({ freq: 880, dur: 0.16, type: 'sine', slide: -300, gain: 0.16 })
        audio.tone({ freq: 1320, dur: 0.08, type: 'triangle', gain: 0.06, delay: 0.02 })
      },
      hook: () => audio.tone({ freq: 440, dur: 0.12, type: 'triangle', slide: 440, gain: 0.12 }),
      click: () => audio.tone({ freq: 1900 + rand(0, 300), dur: 0.012, type: 'square', gain: 0.03 }),
      strain: (k) => audio.tone({ freq: 300 + k * 700, dur: 0.09, type: 'triangle', gain: 0.035 + k * 0.03 }),
      snap: () => {
        audio.noise({ dur: 0.25, gain: 0.3 })
        audio.tone({ freq: 1400, dur: 0.18, type: 'square', slide: -1200, gain: 0.1 })
      },
      escape: () => audio.tone({ freq: 330, dur: 0.35, type: 'sine', slide: -160, gain: 0.1 }),
      splash: () => {
        audio.noise({ dur: 0.3, gain: 0.12 })
        audio.tone({ freq: 220, dur: 0.2, type: 'sine', slide: -100, gain: 0.1 })
      },
      fanfare: (rare) => {
        const notes = rare ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047]
        notes.forEach((f, i) => audio.tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.1, delay: i * 0.09 }))
        audio.tone({ freq: notes[notes.length - 1] / 2, dur: 0.6, type: 'sine', gain: 0.08, delay: notes.length * 0.09 })
      },
      lap: () => audio.noise({ dur: rand(0.4, 0.8), gain: rand(0.008, 0.016), bus: 'sfx' }),
      drip: () => audio.tone({ freq: rand(600, 900), dur: 0.07, type: 'sine', slide: -300, gain: 0.025 }),
      cricket: () => {
        for (let i = 0; i < 3; i++) audio.tone({ freq: 4300, dur: 0.018, type: 'sine', gain: 0.012, delay: i * 0.05 })
      },
      cardTick: () => audio.tone({ freq: 660, dur: 0.06, type: 'triangle', gain: 0.08 })
    }

    // ---- actions --------------------------------------------------------------------------------
    function cast() {
      const d = T.minCast + power * (1 - T.minCast)
      const tip = tipPos()
      bob.u = aim
      bob.d = d
      bob.fromX = tip.x
      bob.fromY = tip.y + 30
      bob.dip = 0
      castCount++
      rodV += 14
      sfx.whoosh()
      setPhase('flying')
    }
    function landed_() {
      bob.x = SX(bob.u, bob.d)
      bob.y = SY(bob.d)
      const s = SS(bob.d)
      ring(bob.x, bob.y, s, 70, 1.4)
      ring(bob.x, bob.y, s, 40, 0.9)
      fx.burst(bob.x, bob.y - 4, 'rgba(230,245,245,0.9)', 10, 180 * s, { size: 4 * s, life: 0.55, gravity: 700 })
      sfx.plop()
      biter = null
      nextFish = rand(...T.approachDelay)
      setPhase('wait')
    }
    function spawnBiter() {
      const sp = pickSpecies(bob.d)
      const side = Math.random() < 0.5 ? -1 : 1
      biter = { sp, u: bob.u + side * rand(0.25, 0.5), d: clamp(bob.d + rand(-0.15, 0.2), 0.02, 1), stage: 'approach', timer: 0, nibbles: Math.floor(rand(0, T.maxNibbles + 1)), a: 0, t: 0 }
    }
    function scare(text) {
      if (biter) {
        biter.stage = 'flee'
        biter.timer = 1.2
      }
      floater(text, bob.x, bob.y - 60, '#ffe0c0', 30)
      ring(bob.x, bob.y, SS(bob.d), 40, 0.6)
      nextFish = rand(...T.scareDelay)
    }
    function hook() {
      const sp = biter.sp
      const w = sp.zone
      fight = { sp, t: 0, ph: rand(0, TAU), z: sp.pattern === 'stubborn' ? 0.55 : 0.5, target: 0.5, timer: rand(0.6, 1.0), off: 0, shaking: false, lunge: 0, w, tension: T.startTension, tv: 0, catch: 0, tight: 0, slack: 0, u0: bob.u, d0: bob.d, u: bob.u, d: bob.d, grace: T.grace }
      biter = null
      sfx.hook()
      floater('Hooked!', bob.x, bob.y - 70, '#ffe27a', 40)
      fx.burst(bob.x, bob.y, 'rgba(230,245,245,0.9)', 12, 220 * SS(bob.d), { size: 4, life: 0.5, gravity: 700 })
      ring(bob.x, bob.y, SS(bob.d), 60, 1)
      setPhase('reel')
    }
    function land() {
      const f = fight
      const sp = f.sp
      const sizeK = Math.random() ** (1.3 - 0.6 * f.d0)
      const size = Math.round(lerp(sp.size[0], sp.size[1], sizeK))
      const pts = Math.round((sp.base * (1 + T.sizeBonus * sizeK) * (1 + T.distBonus * f.d0)) / 5) * 5
      const rec = found[sp.id]
      const isNew = !rec
      const isBig = rec && size > rec.best
      found[sp.id] = { n: (rec?.n ?? 0) + 1, best: Math.max(rec?.best ?? 0, size) }
      env.saveNow()
      if (isNew) newBadge[sp.id] = 4
      runCount[sp.id]++
      landed++
      if (!biggest || size > biggest.size) biggest = { size, sp }
      catchInfo = { sp, size, pts, isNew, isBig, wig: 0 }
      leap = { x0: SX(f.u, f.d), y0: SY(f.d), s0: SS(f.d), t: 0 }
      fx.burst(leap.x0, leap.y0, 'rgba(235,248,248,0.95)', 22, 340 * leap.s0, { size: 5, life: 0.7, gravity: 800 })
      ring(leap.x0, leap.y0, leap.s0, 90, 1.4)
      sfx.splash()
      fight = null
      setPhase('leap')
    }
    function lose(kind) {
      const f = fight
      const x = SX(f.u, f.d)
      const y = SY(f.d)
      if (kind === 'snap') {
        fx.shake(0.5)
        sfx.snap()
        const tip = tipPos()
        fx.burst(tip.x, tip.y, 'rgba(255,250,235,0.9)', 8, 160, { size: 2, life: 0.4, gravity: 400 })
        floater('Snap!', x, y - 60, '#ff8f7a', 44)
        lostMsg = 'The line snapped'
      } else {
        sfx.escape()
        floater('It got away…', x, y - 60, '#cfe6ff', 36)
        lostMsg = 'Too slack'
      }
      ring(x, y, SS(f.d), 70, 1.2)
      biter = { sp: f.sp, u: f.u, d: f.d, stage: 'flee', timer: 1.4, a: rand(0, TAU), t: 0 }
      fight = null
      setPhase('lost')
    }

    // ---- update ---------------------------------------------------------------------------------
    function update(dt) {
      clock += dt
      phaseT += dt
      const p = input.pointer
      if (p.pressed && !(p.x >= PAUSE_ZONE.x && p.y <= PAUSE_ZONE.y + PAUSE_ZONE.h)) {
        pointerHold = true
        dragX0 = p.x
        aim0 = aim
      }
      if (!p.down && !p.pressed) pointerHold = false
      const held = input.held('a') || pointerHold
      if (!armed && !held) armed = true
      const pressed = armed && held && !prevHeld
      const released = armed && !held && prevHeld
      prevHeld = held
      const back = input.pressed('b')

      const clockRuns = phase !== 'leap' && phase !== 'card'
      if (clockRuns && time > 0) {
        time = Math.max(0, time - dt)
        elapsed += dt
      }
      if (time <= 0) {
        if (['reel', 'leap', 'card', 'bite'].includes(phase)) overtime = true
        else if (phase !== 'lost' || phaseT > T.lostTime) {
          run.done = true
          return
        }
      }

      // aim with the stick in the aim and charge phases
      if (phase === 'aim' || phase === 'charge') {
        aim = clamp(aim + input.x * T.aimSpeed * dt, T.aimMin, T.aimMax)
        if (pointerHold && phase === 'charge') aim = clamp(aim0 + ((p.x - dragX0) / T.dragAim) * (T.aimMax - T.aimMin), T.aimMin, T.aimMax)
      }

      switch (phase) {
        case 'aim':
          if (pressed) {
            chargeT = 0
            setPhase('charge')
          }
          break
        case 'charge': {
          chargeT += dt
          const k = (chargeT / T.chargePeriod) % 1
          power = k < 0.5 ? k * 2 : 2 - k * 2
          if (!held) cast()
          break
        }
        case 'flying':
          if (phaseT >= T.flightTime) landed_()
          break
        case 'wait':
        case 'bite':
          updateWait(dt, pressed, back)
          break
        case 'reel':
          updateReel(dt, held)
          break
        case 'leap':
          leap.t += dt
          if (leap.t >= T.leapTime) {
            bucketSquash = 1
            sfx.fanfare(catchInfo.sp.id === 'koi' || catchInfo.isNew)
            fx.burst(BUCKET.x, BUCKET.y - 20, 'rgba(235,248,248,0.95)', 10, 160, { size: 3, life: 0.5, gravity: 700 })
            run.score += catchInfo.pts
            floater(`+${catchInfo.pts}`, BUCKET.x, BUCKET.y - 60, '#ffe27a', 40)
            setPhase('card')
          }
          break
        case 'card':
          catchInfo.wig += dt
          if ((phaseT > T.cardSkip && pressed) || phaseT > T.cardTime) {
            if (phaseT <= T.cardTime) sfx.cardTick()
            catchInfo = null
            if (overtime || time <= 0) {
              run.done = true
              return
            }
            setPhase('aim')
          }
          break
        case 'lost':
          if (phaseT > T.lostTime) {
            if (time <= 0) {
              run.done = true
              return
            }
            setPhase('aim')
          }
          break
        case 'retrieve':
          if (phaseT > T.retrieveTime) setPhase('aim')
          clickTimer -= dt * 30
          if (clickTimer <= 0) ((clickTimer = 1), sfx.click())
          break
      }

      // the rod: a spring towards a pose per phase
      let target = -0.95 + aim * 0.22
      if (phase === 'charge') target = -0.95 - power * 1.05
      else if (phase === 'flying') target = -0.5
      else if (phase === 'wait' || phase === 'bite') target = -0.9 + bob.u * 0.15
      else if (phase === 'reel') target = -1.05
      rodV += ((target - rodA) * 140 - rodV * 13) * dt
      rodA += rodV * dt

      bob.dip = approach(bob.dip, 0, 5, dt)
      bucketSquash = approach(bucketSquash, 0, 8, dt)
      if (phase !== 'card' && phase !== 'leap') for (const id in newBadge) if ((newBadge[id] -= dt) <= 0) delete newBadge[id]
      updateDecoys(dt)
      updateAmbient(dt)
      for (const r of rings) r.t += dt
      rings = rings.filter((r) => r.t < r.life)
      for (const f of floaters) f.t += dt
      floaters = floaters.filter((f) => f.t < 1.4)
      fx.update(dt)
    }

    function updateWait(dt, pressed, back) {
      bob.x = SX(bob.u, bob.d)
      bob.y = SY(bob.d)
      if ((idleRing -= dt) <= 0) {
        idleRing = rand(1.4, 2.2)
        ring(bob.x, bob.y, SS(bob.d), 26, 1.4)
      }
      if (back && phase === 'wait') {
        bob.fromX = bob.x
        bob.fromY = bob.y
        biter = null
        ring(bob.x, bob.y, SS(bob.d), 30, 0.8)
        setPhase('retrieve')
        return
      }
      if (!biter) {
        if ((nextFish -= dt) <= 0) spawnBiter()
      } else {
        const b = biter
        b.t += dt
        if (b.stage === 'approach') {
          const du = bob.u - b.u
          const dd = bob.d - b.d
          const dist = Math.hypot(du, dd)
          b.a = Math.atan2(-dd * 2, du)
          const step = T.swimSpeed * dt * (0.6 + 0.4 * Math.sin(b.t * 3) ** 2)
          if (dist < 0.05) {
            b.stage = 'circle'
            b.timer = rand(...T.nibbleGap)
          } else {
            b.u += (du / dist) * step
            b.d += (dd / dist) * step
          }
        } else if (b.stage === 'circle') {
          b.u = bob.u + Math.cos(b.t * 1.5) * 0.035
          b.d = bob.d + Math.sin(b.t * 1.5) * 0.02
          b.a = b.t * 1.5 + Math.PI / 2
          if ((b.timer -= dt) <= 0) {
            if (b.nibbles > 0) {
              b.nibbles--
              b.timer = rand(...T.nibbleGap)
              bob.dip = Math.max(bob.dip, 0.35)
              ring(bob.x, bob.y, SS(bob.d), 22, 0.6)
              sfx.nibble()
            } else {
              b.stage = 'bite'
              b.timer = T.biteWindow
              bob.dip = 1
              ring(bob.x, bob.y, SS(bob.d), 55, 0.9)
              ring(bob.x, bob.y, SS(bob.d), 30, 0.6)
              fx.burst(bob.x, bob.y, 'rgba(235,248,248,0.9)', 6, 120, { size: 3, life: 0.4, gravity: 600 })
              sfx.bite()
              setPhase('bite')
            }
          }
        } else if (b.stage === 'bite') {
          bob.dip = Math.max(bob.dip, 0.85)
          if ((b.timer -= dt) <= 0) {
            b.stage = 'flee'
            b.timer = 1.2
            floater('Missed it', bob.x, bob.y - 60, '#cfe6ff', 30)
            nextFish = rand(...T.missDelay)
            setPhase('wait')
          }
        } else if (b.stage === 'flee') {
          b.u += Math.cos(b.a) * dt * 0.9
          b.d -= Math.sin(b.a) * dt * 0.45
          if ((b.timer -= dt) <= 0) biter = null
        }
      }
      if (pressed) {
        if (phase === 'bite') hook()
        else if (biter && (biter.stage === 'circle' || (biter.stage === 'approach' && Math.hypot(bob.u - biter.u, bob.d - biter.d) < 0.18))) {
          biter.a = Math.atan2(biter.d - bob.d, biter.u - bob.u) * -1
          scare('Too early!')
        } else {
          bob.dip = 0.2
          ring(bob.x, bob.y, SS(bob.d), 20, 0.5)
          sfx.nibble()
        }
      }
    }

    function updateReel(dt, held) {
      const f = fight
      const sp = f.sp
      f.t += dt
      PATTERNS[sp.pattern](f, dt)
      f.z = clamp(f.z, f.w + 0.04, 1 - f.w - 0.04)
      f.tv = approach(f.tv, held ? T.reelUp : -T.reelDown, T.tensionResponse, dt)
      f.tension = clamp(f.tension + f.tv * dt, 0, 1)
      if (f.tension <= 0 || f.tension >= 1) f.tv = 0
      const lo = f.z - f.w
      const hi = f.z + f.w
      f.grace -= dt
      if (f.tension >= lo && f.tension <= hi) {
        f.catch = Math.min(1, f.catch + sp.fill * dt)
        f.tight = Math.max(0, f.tight - T.recover * dt)
        f.slack = Math.max(0, f.slack - T.recover * dt)
      } else if (f.grace <= 0) {
        f.catch = Math.max(0, f.catch - T.drain * dt)
        if (f.tension > hi) ((f.tight += dt), (f.slack = Math.max(0, f.slack - T.recover * dt)))
        else ((f.slack += dt), (f.tight = Math.max(0, f.tight - T.recover * dt)))
      }
      // the fish swims about and comes closer as the catch meter fills
      f.u = f.u0 + Math.sin(f.t * 1.3 + f.ph) * 0.22 * (1 - f.catch * 0.5) + (f.z - 0.5) * 0.3
      f.d = clamp(f.d0 * (1 - f.catch * 0.82) + f.slack * 0.05, 0.02, 1)
      bob.u = f.u
      bob.d = f.d
      bob.x = SX(f.u, f.d)
      bob.y = SY(f.d)
      if (f.lunge) {
        f.lunge = 0
        const s = SS(f.d)
        fx.burst(bob.x, bob.y, 'rgba(235,248,248,0.9)', 8, 200 * s, { size: 3.5 * s, life: 0.45, gravity: 700 })
        ring(bob.x, bob.y, s, 50, 0.8)
        audio.noise({ dur: 0.12, gain: 0.05 })
      }
      if ((idleRing -= dt) <= 0) {
        idleRing = 0.35
        ring(bob.x, bob.y, SS(f.d), 30, 0.8)
      }
      // sound: reel clicks by reeling speed, rising strain when too tight
      if (held) {
        clickTimer -= dt * (8 + Math.max(0, f.tv) * 16)
        if (clickTimer <= 0) ((clickTimer = 1), sfx.click())
      }
      if (f.tension > hi && f.grace <= 0) {
        if ((strainTimer -= dt) <= 0) ((strainTimer = 0.1), sfx.strain(clamp(f.tight / T.snapTime, 0, 1)))
      }
      if (f.catch >= 1) {
        reelsTaught++
        return land()
      }
      if (f.tight > T.snapTime) return lose('snap')
      if (f.slack > T.slackTime) return lose('slack')
    }

    function updateDecoys(dt) {
      for (const o of decoys) {
        o.t += dt
        if (Math.random() < dt * 0.4) o.turn = rand(-1.2, 1.2)
        o.a += o.turn * dt
        let du = Math.cos(o.a)
        let dd = -Math.sin(o.a) * 0.5
        // stay in the lake and keep away from the bobber so they don't look like bites
        if (o.u < -1.1) o.a = 0
        if (o.u > 1.1) o.a = Math.PI
        if (o.d < 0.08) o.a = -Math.PI / 2
        if (o.d > 0.98) o.a = Math.PI / 2
        if ((phase === 'wait' || phase === 'bite' || phase === 'reel') && Math.hypot(o.u - bob.u, o.d - bob.d) < 0.25) {
          o.a = Math.atan2(-(o.d - bob.d) * 2, o.u - bob.u)
        }
        const sp = 0.07 + 0.05 * Math.sin(o.t * 0.7) ** 2
        o.u += du * sp * dt
        o.d += dd * sp * dt
      }
    }

    function updateAmbient(dt) {
      if ((waterTimer -= dt) <= 0) {
        waterTimer = rand(0.7, 1.4)
        sfx.lap()
        if (Math.random() < 0.25) sfx.drip()
      }
      const dusk = smooth(0.15, 1, elapsed / T.roundSeconds)
      if (dusk > 0.4 && (cricketTimer -= dt) <= 0) {
        cricketTimer = rand(0.6, 2.2) / dusk
        sfx.cricket()
      }
      const want = Math.round(clamp((dusk - 0.45) / 0.55, 0, 1) * T.maxFireflies)
      if (fireflies.length < want && Math.random() < dt * 4) {
        const left = Math.random() < 0.6
        fireflies.push({ x: left ? rand(20, 360) : rand(1100, 1260), y: rand(380, 720), vx: rand(-20, 20), vy: rand(-12, 12), ph: rand(0, TAU), t: 0 })
      }
      for (const f of fireflies) {
        f.t += dt
        f.vx += rand(-40, 40) * dt
        f.vy += rand(-40, 40) * dt
        f.vx = clamp(f.vx, -26, 26)
        f.vy = clamp(f.vy, -18, 18)
        f.x += f.vx * dt
        f.y += f.vy * dt
        f.y = clamp(f.y, HOR + 20, 740)
      }
    }

    // ---- draw -----------------------------------------------------------------------------------
    function draw(ctx) {
      const A = art()
      const t = clock
      const k = clamp(elapsed / T.roundSeconds, 0, 1)
      const dusk = smooth(0.1, 1, k)
      ctx.save()
      const [ox, oy] = fx.offset()
      ctx.translate(ox, oy)

      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, HOR)
      sky.addColorStop(0, mixc(SKY[0][0], SKY[0][1], dusk))
      sky.addColorStop(0.6, mixc(SKY[1][0], SKY[1][1], dusk))
      sky.addColorStop(1, mixc(SKY[2][0], SKY[2][1], dusk))
      ctx.fillStyle = sky
      ctx.fillRect(-20, -20, W + 40, HOR + 22)
      // early stars at dusk
      if (dusk > 0.5) {
        ctx.fillStyle = '#fff6e0'
        for (let i = 0; i < 30; i++) {
          ctx.globalAlpha = (dusk - 0.5) * 2 * (0.4 + 0.6 * Math.sin(t * 2 + i * 3) ** 2) * (1 - hash(i, 71) * 0.5)
          ctx.fillRect(hash(i, 72) * W, hash(i, 73) * 170, 2, 2)
        }
        ctx.globalAlpha = 1
      }
      // sun, sinking behind the hills over the outing
      const sunX = 930
      const sunY = lerp(226, 352, k)
      ctx.globalAlpha = 1 - dusk * 0.5
      ctx.drawImage(A.sunGlow, sunX - 260, sunY - 260, 520, 520)
      ctx.globalAlpha = 1
      ctx.fillStyle = mixc('#fff3c8', '#ff9d5c', dusk)
      ctx.beginPath()
      ctx.arc(sunX, sunY, 34, 0, TAU)
      ctx.fill()
      // clouds drifting
      for (let i = 0; i < 4; i++) {
        const cx = ((i * 380 + t * (6 + i * 2)) % (W + 480)) - 240
        ctx.globalAlpha = 0.85 - i * 0.12
        ctx.drawImage(A.clouds[i], cx - 220, 60 + i * 48 - 74, 440, 130)
      }
      ctx.globalAlpha = 1
      ctx.drawImage(A.hills, 0, 0, W, HOR + 2)

      // water
      const water = ctx.createLinearGradient(0, HOR, 0, H)
      water.addColorStop(0, mixc(WATER[0][0], WATER[0][1], dusk))
      water.addColorStop(0.3, mixc(WATER[1][0], WATER[1][1], dusk))
      water.addColorStop(1, mixc(WATER[2][0], WATER[2][1], dusk))
      ctx.fillStyle = water
      ctx.fillRect(-20, HOR, W + 40, H - HOR + 20)
      ctx.drawImage(A.hillsRefl, 0, HOR, W, 60)
      // sun path on the water
      const glintA = 1 - dusk * 0.6
      for (const g of GLINTS) {
        const y = HOR + 4 + g.k ** 1.6 * 300
        const spread = 14 + (y - HOR) * 0.5
        const a = (0.25 + 0.75 * Math.sin(t * g.sp + g.ph) ** 2) * glintA * (1 - g.k * 0.6)
        ctx.fillStyle = `rgba(255,226,160,${a})`
        ctx.fillRect(sunX + g.off * spread * 2 + Math.sin(t + g.ph) * 4 - (6 + g.k * 20) / 2, y, 6 + g.k * 20, 2 + g.k * 1.5)
      }
      // gentle ripple dashes everywhere
      for (const r of DASHES) {
        const a = 0.08 + 0.14 * Math.sin(t * r.sp + r.ph) ** 2
        ctx.fillStyle = `rgba(255,240,215,${a})`
        ctx.fillRect(r.x + Math.sin(t * 0.5 + r.ph) * 8, r.y, r.len, 1.5 + (r.y - HOR) / 250)
      }
      // far reeds on the left shore
      ctx.fillStyle = 'rgba(70,60,70,0.8)'
      for (const r of FAR_REEDS) {
        const sw = Math.sin(t * 1.1 + r.ph) * 2
        ctx.beginPath()
        ctx.moveTo(r.x - 1.5, r.y)
        ctx.lineTo(r.x + sw, r.y - r.h)
        ctx.lineTo(r.x + 1.5, r.y)
        ctx.fill()
      }
      for (const p of PADS) drawPad(ctx, p, t)

      // fish shadows
      for (const o of decoys) drawShadow(ctx, o.sp, SX(o.u, o.d), SY(o.d) + 8, SS(o.d), o.a, t, 0.75)
      if (biter && (phase === 'wait' || phase === 'bite' || phase === 'lost')) {
        const fade = biter.stage === 'flee' ? clamp(biter.timer, 0, 1) : 1
        drawShadow(ctx, biter.sp, SX(biter.u, biter.d), SY(biter.d) + 10, SS(biter.d), biter.a, t * (biter.stage === 'flee' ? 2 : 1), fade)
      }
      if (fight) drawShadow(ctx, fight.sp, bob.x - Math.cos(fight.t * 6) * 6, bob.y + 14, SS(bob.d) * 1.05, Math.sin(fight.t * 5) * 0.6 + (fight.z > 0.5 ? 0.3 : -0.3), t * 2.5, 0.95)

      // ripple rings
      for (const r of rings) {
        const q = r.t / r.life
        const rad = (8 + r.max * easeOut(q)) * r.s
        ctx.strokeStyle = `rgba(255,244,222,${0.6 * (1 - q)})`
        ctx.lineWidth = 2 * r.s
        ctx.beginPath()
        ctx.ellipse(r.x, r.y, rad, rad * 0.32, 0, 0, TAU)
        ctx.stroke()
      }

      // dock, bucket, fisher, rod and line
      ctx.drawImage(A.dock, 0, 560, W, H - 560)
      drawBucket(ctx, landed, bucketSquash)
      const reelArm = phase === 'reel' && (input.held('a') || pointerHold) ? Math.sin(t * 22) * 3 : 0
      const lean = phase === 'reel' ? -0.3 - fight.tension * 0.4 : phase === 'charge' ? -power * 0.5 : phase === 'flying' ? 0.4 : 0
      drawFisher(ctx, t, lean, reelArm)
      drawRodAndLine(ctx, t)

      // leaping fish
      if (phase === 'leap' && leap && catchInfo) {
        const q = clamp(leap.t / T.leapTime, 0, 1)
        const x = lerp(leap.x0, BUCKET.x, q)
        const y = lerp(leap.y0, BUCKET.y - 30, q) - Math.sin(q * Math.PI) * 220
        const len = lerp(70 * leap.s0 + 20, 70, q)
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(-0.8 + q * 3.4)
        drawFish(ctx, catchInfo.sp, len, Math.sin(t * 30) * 0.8)
        ctx.restore()
      }
      fx.draw(ctx)

      // reeds in front
      const gust = Math.sin(t * 0.37) * 0.5 + Math.sin(t * 0.13) * 0.5
      for (const r of REEDS) drawReed(ctx, r, t, gust)

      // dusk falls over everything, then the night lights
      ctx.fillStyle = `rgba(30,22,70,${dusk * 0.32})`
      ctx.fillRect(-20, -20, W + 40, H + 40)
      ctx.drawImage(A.grain, 0, 0)
      // lantern on the left bollard lights up
      const lant = smooth(0.45, 0.75, k)
      if (lant > 0) {
        const flick = 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3)
        ctx.globalAlpha = lant * flick
        ctx.drawImage(A.lantern, 426 - 90, 548 - 90, 180, 180)
        ctx.globalAlpha = 1
      }
      ctx.fillStyle = '#3a2a20'
      ctx.fillRect(418, 552, 16, 14)
      ctx.fillStyle = lant > 0 ? mixc('#6a5a40', '#ffd27a', lant) : '#6a5a40'
      ctx.fillRect(420, 538, 12, 14)
      ctx.fillStyle = '#3a2a20'
      ctx.fillRect(417, 532, 18, 6)
      for (const f of fireflies) {
        const a = clamp(f.t / 1.5, 0, 1) * (0.3 + 0.7 * Math.max(0, Math.sin(t * 2.2 + f.ph)))
        ctx.globalAlpha = a
        ctx.drawImage(A.firefly, f.x - 18, f.y - 18, 36, 36)
        ctx.fillStyle = '#fbffd0'
        ctx.fillRect(f.x - 1.5, f.y - 1.5, 3, 3)
      }
      ctx.globalAlpha = 1
      ctx.restore()

      drawHud(ctx, t)
    }

    function drawRodAndLine(ctx, t) {
      // bend: the rod curves toward the line under tension
      let tension = 0.15
      if (phase === 'reel' && fight) tension = fight.tension
      else if (phase === 'bite') tension = 0.35
      const tip0 = tipPos()
      let bx
      let by
      if (phase === 'aim' || phase === 'charge') {
        const sw = Math.sin(t * 2.4) * 6 - rodV * 3
        bx = tip0.x + sw
        by = tip0.y + 46
      } else if (phase === 'flying') {
        const q = clamp(phaseT / T.flightTime, 0, 1)
        bx = lerp(bob.fromX, SX(bob.u, bob.d), q)
        by = lerp(bob.fromY, SY(bob.d), q) - Math.sin(q * Math.PI) * 200 * (0.4 + bob.d)
      } else if (phase === 'retrieve') {
        const q = easeOut(clamp(phaseT / T.retrieveTime, 0, 1))
        bx = lerp(bob.fromX, tip0.x, q)
        by = lerp(bob.fromY, tip0.y + 46, q) - Math.sin(q * Math.PI) * 30
      } else if (phase === 'leap' || phase === 'card' || phase === 'lost') {
        bx = tip0.x + Math.sin(t * 2.4) * 6
        by = tip0.y + 46
      } else {
        bx = bob.x
        by = bob.y
      }
      const ab = Math.atan2(by - PIVOT.y, bx - PIVOT.x)
      let diff = ab - rodA
      while (diff > Math.PI) diff -= TAU
      while (diff < -Math.PI) diff += TAU
      const bendK = phase === 'reel' ? 0.08 + tension * 0.35 : 0.04
      const ta = rodA + diff * bendK
      const tip = { x: PIVOT.x + Math.cos(ta) * ROD_LEN, y: PIVOT.y + Math.sin(ta) * ROD_LEN }
      const cp = { x: PIVOT.x + Math.cos(rodA) * ROD_LEN * 0.6, y: PIVOT.y + Math.sin(rodA) * ROD_LEN * 0.6 }
      const butt = { x: PIVOT.x - Math.cos(rodA) * 34, y: PIVOT.y - Math.sin(rodA) * 34 }
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#2e1d12'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(butt.x, butt.y)
      ctx.lineTo(PIVOT.x, PIVOT.y)
      ctx.stroke()
      ctx.strokeStyle = '#4a2e1a'
      ctx.lineWidth = 3.5
      ctx.beginPath()
      ctx.moveTo(PIVOT.x, PIVOT.y)
      ctx.quadraticCurveTo(cp.x, cp.y, tip.x, tip.y)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,210,150,0.6)'
      ctx.lineWidth = 1.2
      ctx.stroke()
      // reel
      ctx.fillStyle = '#9aa4a8'
      ctx.beginPath()
      ctx.arc(PIVOT.x + Math.cos(rodA) * 14 + 5, PIVOT.y + Math.sin(rodA) * 14 + 6, 6, 0, TAU)
      ctx.fill()
      if (phase === 'lost' && phaseT < 0.5 && lostMsg.includes('snapped')) return
      // line: sags when slack, straight when tight; reddens near snapping
      const sag = phase === 'reel' ? (1 - tension) * 70 : phase === 'flying' ? 10 : 30
      const danger = phase === 'reel' && fight ? clamp(fight.tight / T.snapTime, 0, 1) : 0
      ctx.strokeStyle = danger > 0.05 ? mixc('#fff8ea', '#ff6a50', danger, 0.9) : 'rgba(255,250,236,0.75)'
      ctx.lineWidth = phase === 'reel' ? 1.4 + tension : 1.2
      ctx.beginPath()
      ctx.moveTo(tip.x, tip.y)
      const wob = phase === 'reel' && fight && fight.slack > 0.2 ? Math.sin(t * 9) * 10 : 0
      ctx.quadraticCurveTo((tip.x + bx) / 2 + wob, (tip.y + by) / 2 + sag, bx, by - 6)
      ctx.stroke()
      if (phase === 'reel') {
        // the bobber is dragged under: show a wake instead
        const s = SS(bob.d)
        ctx.strokeStyle = 'rgba(255,244,222,0.7)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.ellipse(bx, by, 14 * s, 4 * s, 0, 0, TAU)
        ctx.stroke()
        drawBobber(ctx, bx, by, s, 0.75)
      } else if (phase === 'flying') {
        const q = clamp(phaseT / T.flightTime, 0, 1)
        drawFloatingBobber(ctx, bx, by, lerp(1, SS(bob.d), q))
      } else if (phase === 'aim' || phase === 'charge' || phase === 'retrieve' || phase === 'leap' || phase === 'card' || phase === 'lost') {
        drawFloatingBobber(ctx, bx, by, 1)
      } else {
        const s = SS(bob.d)
        drawBobber(ctx, bx, by + Math.sin(t * 2) * 1.5 * s, s, bob.dip)
      }
    }

    function drawFloatingBobber(ctx, x, y, s) {
      const r = 9 * s
      ctx.fillStyle = '#e2452f'
      ctx.beginPath()
      ctx.arc(x, y, r, Math.PI, TAU)
      ctx.fill()
      ctx.fillStyle = '#fff6e8'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.beginPath()
      ctx.arc(x - r * 0.35, y - r * 0.45, r * 0.28, 0, TAU)
      ctx.fill()
    }

    function panel(ctx, x, y, w, h, r = 18) {
      ctx.fillStyle = 'rgba(38,30,52,0.58)'
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, r)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,226,170,0.35)'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    function drawHud(ctx, t) {
      const A = art()
      const ink = 'rgba(30,20,40,0.8)'
      // score, clock and the catalogue
      panel(ctx, 28, 24, 344, 156)
      label(ctx, String(run.score), 50, 66, { font: font(400, 50, 'Lilita One'), color: '#fff1cf', edge: 6, edgeColor: ink, align: 'left' })
      ctx.font = font(400, 50, 'Lilita One')
      const sw = ctx.measureText(String(run.score)).width
      label(ctx, 'pts', 58 + sw, 76, { font: font(700, 22), color: 'rgba(255,240,210,0.8)', align: 'left' })
      const secs = Math.ceil(time)
      const tstr = overtime && time <= 0 ? 'Last fish!' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
      label(ctx, tstr, 350, 64, { font: font(400, overtime && time <= 0 ? 32 : 42, 'Lilita One'), color: time < 10 ? '#ffb38a' : '#fff1cf', edge: 6, edgeColor: ink, align: 'right' })
      SPECIES.forEach((sp, i) => {
        const cx = 72 + i * 80
        const cy = 128
        const known = !!found[sp.id]
        const spr = known ? A.fish[i] : A.silhouettes[i]
        ctx.globalAlpha = known ? 1 : 0.8
        ctx.drawImage(spr, cx - 34, cy - 20, 68, 39)
        ctx.globalAlpha = 1
        if (!known) label(ctx, '?', cx, cy, { font: font(400, 24, 'Lilita One'), color: 'rgba(255,240,210,0.7)' })
        if (runCount[sp.id]) label(ctx, `×${runCount[sp.id]}`, cx + 22, cy + 22, { font: font(900, 20), color: '#ffe27a', edge: 4, edgeColor: ink })
        if (newBadge[sp.id] && phase !== 'card') {
          const pop = easeBack(clamp((4 - newBadge[sp.id]) / 0.3, 0, 1))
          ctx.save()
          ctx.translate(cx, cy - 30)
          ctx.scale(pop, pop)
          ctx.fillStyle = '#ffd36e'
          ctx.beginPath()
          ctx.roundRect(-26, -11, 52, 22, 11)
          ctx.fill()
          label(ctx, 'NEW', 0, 1, { font: font(900, 17), color: '#3a2410' })
          ctx.restore()
        }
      })

      // power meter and landing marker
      if (phase === 'charge' || phase === 'aim') {
        const mx = 360
        const my0 = 380
        const mh = 200
        panel(ctx, mx - 8, my0 - 8, 42, mh + 16, 14)
        const grad = ctx.createLinearGradient(0, my0 + mh, 0, my0)
        grad.addColorStop(0, '#6fb8c4')
        grad.addColorStop(0.55, '#8cc37a')
        grad.addColorStop(0.78, '#e8d26a')
        grad.addColorStop(1, '#ffb43a')
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.fillRect(mx, my0, 26, mh)
        if (phase === 'charge') {
          ctx.fillStyle = grad
          ctx.fillRect(mx, my0 + mh * (1 - power), 26, mh * power)
          ctx.fillStyle = '#fff'
          ctx.fillRect(mx - 4, my0 + mh * (1 - power) - 2, 34, 4)
        }
        ctx.strokeStyle = 'rgba(255,226,140,0.8)'
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(mx, my0 + mh * (1 - 0.53))
        ctx.lineTo(mx + 26, my0 + mh * (1 - 0.53))
        ctx.stroke()
        ctx.setLineDash([])
        label(ctx, 'far', mx + 13, my0 - 22, { font: font(700, 20), color: '#ffe0a0', edge: 4, edgeColor: ink })
        // where it'll land
        const d = T.minCast + (phase === 'charge' ? power : 0.5) * (1 - T.minCast)
        const x = SX(aim, d)
        const y = SY(d)
        const s = SS(d)
        ctx.strokeStyle = phase === 'charge' ? 'rgba(255,246,220,0.9)' : 'rgba(255,246,220,0.35)'
        ctx.lineWidth = 2.5
        ctx.setLineDash([6, 6])
        ctx.beginPath()
        ctx.ellipse(x, y, 30 * s, 10 * s, 0, 0, TAU)
        ctx.stroke()
        ctx.setLineDash([])
        if (d > 0.62 && phase === 'charge') label(ctx, 'rare waters', x, y - 30 * s - 12, { font: font(700, 22), color: '#ffe27a', edge: 4, edgeColor: ink })
      }

      // the bite "!"
      if (phase === 'bite') {
        const pop = easeBack(clamp(phaseT / 0.15, 0, 1))
        ctx.save()
        ctx.translate(bob.x, bob.y - 60 * SS(bob.d) - 20)
        ctx.scale(pop, pop)
        label(ctx, '!', 0, 0, { font: font(400, 72, 'Lilita One'), color: '#ffe27a', edge: 10, edgeColor: '#5a2a10' })
        ctx.restore()
      }

      // tension bar
      if (phase === 'reel' && fight) {
        const f = fight
        ctx.fillStyle = 'rgba(38,30,52,0.55)'
        ctx.beginPath()
        ctx.roundRect(BAR.x, BAR.y, BAR.w, BAR.h, 22)
        ctx.fill()
        panel(ctx, BAR.x, BAR.y, BAR.w, BAR.h, 22)
        const tx = BAR.x + 24
        const tw = 48
        const top = BAR.top
        const bot = BAR.bot
        const Y = (v) => bot - v * (bot - top)
        label(ctx, 'TIGHT', tx + tw / 2 + 12, BAR.y + 28, { font: font(400, 24, 'Lilita One'), color: '#ffb6a0', edge: 4, edgeColor: ink })
        label(ctx, 'SLACK', tx + tw / 2 + 12, BAR.y + BAR.h - 26, { font: font(400, 24, 'Lilita One'), color: '#b8dcff', edge: 4, edgeColor: ink })
        ctx.fillStyle = 'rgba(10,10,30,0.45)'
        ctx.beginPath()
        ctx.roundRect(tx, top, tw, bot - top, 10)
        ctx.fill()
        // danger glows
        if (f.tight > 0) {
          ctx.fillStyle = `rgba(255,90,70,${0.6 * clamp(f.tight / T.snapTime, 0, 1)})`
          ctx.fillRect(tx, top, tw, 50)
        }
        if (f.slack > 0) {
          ctx.fillStyle = `rgba(120,180,255,${0.6 * clamp(f.slack / T.slackTime, 0, 1)})`
          ctx.fillRect(tx, bot - 50, tw, 50)
        }
        // sweet zone
        const zt = Y(f.z + f.w)
        const zb = Y(f.z - f.w)
        const inZone = f.tension >= f.z - f.w && f.tension <= f.z + f.w
        ctx.fillStyle = inZone ? 'rgba(140,230,130,0.85)' : 'rgba(140,230,130,0.55)'
        ctx.beginPath()
        ctx.roundRect(tx + 3, zt, tw - 6, zb - zt, 8)
        ctx.fill()
        ctx.strokeStyle = 'rgba(230,255,210,0.9)'
        ctx.lineWidth = 2
        ctx.stroke()
        // marker
        const my = Y(f.tension)
        const col = inZone ? '#ffffff' : f.tension > f.z ? '#ff8a6a' : '#8fc4ff'
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.roundRect(tx - 8, my - 6, tw + 16, 12, 6)
        ctx.fill()
        ctx.strokeStyle = ink
        ctx.lineWidth = 2.5
        ctx.stroke()
        // catch meter
        const cx = tx + tw + 14
        ctx.fillStyle = 'rgba(10,10,30,0.45)'
        ctx.beginPath()
        ctx.roundRect(cx, top, 24, bot - top, 10)
        ctx.fill()
        ctx.fillStyle = '#ffd36e'
        ctx.beginPath()
        ctx.roundRect(cx + 3, Y(f.catch), 18, (bot - top) * f.catch, 8)
        ctx.fill()
        // hints beside the bar
        if (f.grace <= 0 && !inZone) {
          const txt = f.tension > f.z ? 'Ease off!' : 'Reel in!'
          const pulse = 1 + Math.sin(t * 12) * 0.05
          ctx.save()
          ctx.translate(BAR.x - 14, my)
          ctx.scale(pulse, pulse)
          label(ctx, txt, 0, 0, { font: font(900, 28), color: col, edge: 6, edgeColor: ink, align: 'right' })
          ctx.restore()
        }
      }

      // floaters
      for (const f of floaters) {
        const q = f.t / 1.4
        ctx.globalAlpha = clamp(1.4 - q * 1.4, 0, 1) * clamp(f.t * 8, 0, 1)
        label(ctx, f.text, f.x, f.y - easeOut(q) * 40, { font: font(400, f.size, 'Lilita One'), color: f.color, edge: 7, edgeColor: 'rgba(40,20,30,0.85)' })
      }
      ctx.globalAlpha = 1

      // the catch card
      if (phase === 'card' && catchInfo) drawCard(ctx, t)

      // a contextual hint
      const touchy = input.mode === 'touch' || input.mode === 'mouse'
      let hint = ''
      if (phase === 'aim') hint = touchy ? 'Press and hold to cast · drag to aim' : `Hold ${input.label('a')} to cast · ${input.stickLabel()} to aim`
      else if (phase === 'charge') hint = 'Let go to cast!'
      else if (phase === 'wait') hint = castCount <= 2 ? 'Wait for the bobber to dip…' : ''
      else if (phase === 'bite') hint = touchy ? 'Tap now!' : `${input.label('a')} now!`
      else if (phase === 'reel' && reelsTaught < 2) hint = touchy ? 'Hold to reel · let go to ease off · stay in the green' : `Hold ${input.label('a')} to reel · let go to ease off · stay in the green`
      if (hint) label(ctx, hint, 640, 708, { font: font(700, 26), color: '#fff4dc', edge: 6, edgeColor: 'rgba(30,20,40,0.85)' })
    }

    function drawCard(ctx, t) {
      const c = catchInfo
      const pop = easeBack(clamp(phaseT / 0.3, 0, 1))
      ctx.save()
      ctx.translate(640, 400)
      ctx.scale(pop, pop)
      ctx.rotate(-0.015)
      ctx.fillStyle = 'rgba(30,20,30,0.35)'
      ctx.beginPath()
      ctx.roundRect(-280 + 8, -180 + 10, 560, 360, 26)
      ctx.fill()
      const paper = ctx.createLinearGradient(0, -180, 0, 180)
      paper.addColorStop(0, '#fff4dc')
      paper.addColorStop(1, '#f2dcb4')
      ctx.fillStyle = paper
      ctx.beginPath()
      ctx.roundRect(-280, -180, 560, 360, 26)
      ctx.fill()
      ctx.strokeStyle = '#c99b62'
      ctx.lineWidth = 4
      ctx.stroke()
      // little water band behind the fish
      ctx.fillStyle = 'rgba(110,160,175,0.25)'
      ctx.beginPath()
      ctx.ellipse(0, 6, 220, 64, 0, 0, TAU)
      ctx.fill()
      label(ctx, 'Caught!', 0, -132, { font: font(400, 60, 'Lilita One'), color: '#ffb83a', edge: 9, edgeColor: '#6a3814' })
      ctx.save()
      ctx.translate(0, 4 + Math.sin(t * 3) * 4)
      ctx.rotate(Math.sin(t * 2) * 0.05)
      drawFish(ctx, c.sp, 270, Math.sin(c.wig * 7) * 0.6)
      ctx.restore()
      label(ctx, c.sp.name, 0, 104, { font: font(400, 38, 'Lilita One'), color: '#3a2a1a' })
      label(ctx, `${c.size} cm`, -120, 148, { font: font(900, 30), color: '#5a4630' })
      label(ctx, `+${c.pts}`, 120, 148, { font: font(900, 34), color: '#d9771e' })
      if (c.isNew || c.isBig) {
        ctx.save()
        ctx.translate(200, -150)
        ctx.rotate(0.18)
        ctx.fillStyle = c.isNew ? '#e8637a' : '#4f8fb8'
        ctx.beginPath()
        ctx.roundRect(-78, -20, 156, 40, 12)
        ctx.fill()
        label(ctx, c.isNew ? 'New species!' : 'Biggest yet!', 0, 1, { font: font(900, 22), color: '#fff' })
        ctx.restore()
      }
      ctx.restore()
    }

    const run = {
      score: 0,
      done: false,
      update,
      draw,
      stats: () => [
        ['Fish landed', landed],
        ['Biggest', biggest ? `${biggest.size} cm ${biggest.sp.short}` : '—'],
        ['Species', `${SPECIES.filter((s) => runCount[s.id]).length}/${SPECIES.length}`]
      ],
      prompts: (inp) => {
        if (inp.mode === 'touch' || inp.mode === 'mouse') return []
        switch (phase) {
          case 'aim':
            return [['a', 'Hold to cast']]
          case 'charge':
            return [['a', 'Release to cast']]
          case 'wait':
            return [['a', 'Hook on the bite'], ['b', 'Reel in']]
          case 'bite':
            return [['a', 'Hook!']]
          case 'reel':
            return [['a', 'Hold to reel']]
          case 'card':
            return [['a', 'Continue']]
          default:
            return []
        }
      },
      /** For bots and debugging. */
      peek: () => ({ phase, phaseT, power, aim, time, bob: { ...bob }, biter: biter && { stage: biter.stage, sp: biter.sp.id }, fight: fight && { z: fight.z, w: fight.w, tension: fight.tension, catch: fight.catch, sp: fight.sp.id, grace: fight.grace } })
    }
    return run
  }
}
