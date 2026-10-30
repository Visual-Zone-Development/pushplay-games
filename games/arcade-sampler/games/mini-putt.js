// Mini Putt: one-screen mini golf, six holes. Aim, swing (hold, a meter fills and falls, let go)
// or drag back like a slingshot. Each hole adds one idea: bank shot, corner, slope, windmill,
// water + sand, bumpers. Style: toy felt green, chunky bevelled wooden rails, baked once per hole.
import { W, H, TAU, clamp, rand, approach, label, createFx } from '../common.js'

const TUNING = {
  // ball and cup
  ballR: 10,
  cupR: 17,
  maxSpeed: 1450, // px/s at full power
  minSpeed: 50,
  powerCurve: 1.25, // speed = max * power^curve (finer short putts)
  rollDecel: 120, // rolling friction, px/s²
  drag: 0.45, // extra loss proportional to speed, per second
  sandDecel: 1100,
  sandDrag: 2.6,
  wallE: 0.72, // restitution off the rails
  wallSlide: 0.04, // tangent speed lost on a rail hit
  bumperE: 0.85,
  bumperKick: 170, // extra push out of a bumper
  captureSpeed: 330, // slower than this over the cup = in
  cupPull: 2600, // the cup's lip pulls a passing ball (lip-outs curve)
  cupDrag: 3.2, // rattle: a ball over the cup slows down
  stopSpeed: 8,
  settleTime: 0.2,
  substepPx: 3, // never move more than this per collision step (no tunnelling)
  // swing
  meterFill: 1.1, // seconds for the meter to fill (then it falls back)
  dragMax: 230, // slingshot pull for full power
  aimSpeed: 1.1, // rad/s, arrows / stick
  aimFast: 2.6, // after holding a while
  aimFine: 0.22, // up/down nudge
  // rules
  maxOverPar: 4, // picked up at par + 4
  waterPenalty: 1,
  points: 100, // per stroke under par + 3
  aceBonus: 300,
  sinkTime: 2.1,
  introTime: 2.4
}

// ---- holes ------------------------------------------------------------------------------------
const ellipse = (cx, cy, rx, ry, n = 28, wob = 0, seed = 1) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU
    const k = 1 + wob * Math.sin(a * 3 + seed) * Math.cos(a * 2 - seed)
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]
  })
const RECT = [
  [90, 150],
  [1190, 150],
  [1190, 710],
  [90, 710]
]
const HOLES = [
  {
    name: 'Bank Shot',
    tip: 'No straight line? Bank it off the rail',
    par: 2,
    tee: [200, 560],
    cup: [1060, 320],
    green: RECT,
    blocks: [
      [
        [600, 330],
        [640, 316],
        [680, 330],
        [680, 710],
        [600, 710]
      ]
    ]
  },
  {
    name: 'Dogleg',
    tip: 'Use the corner to turn uphill',
    deco: [460, 300, 120],
    par: 3,
    tee: [190, 615],
    cup: [1035, 270],
    aim: 0,
    green: [
      [90, 520],
      [880, 520],
      [880, 150],
      [1190, 150],
      [1190, 610],
      [1090, 710],
      [90, 710]
    ]
  },
  {
    name: 'The Ramp',
    tip: 'The slope pushes downhill: aim high',
    par: 3,
    tee: [190, 430],
    cup: [1060, 290],
    green: RECT,
    slopes: [{ x: 430, y: 150, w: 420, h: 560, fx: 0, fy: 420 }],
    blocks: [
      [
        [940, 450],
        [1190, 450],
        [1190, 480],
        [940, 480]
      ]
    ]
  },
  {
    name: 'Windmill',
    tip: 'Time it between the sails',
    deco: [640, 222, 46],
    par: 3,
    tee: [220, 430],
    cup: [1050, 600],
    green: [
      [90, 150],
      [470, 150],
      [470, 340],
      [810, 340],
      [810, 150],
      [1190, 150],
      [1190, 710],
      [810, 710],
      [810, 520],
      [470, 520],
      [470, 710],
      [90, 710]
    ],
    windmill: { x: 640, y: 430, len: 80, hubR: 24, half: 8, blades: 3, speed: 1.3 }
  },
  {
    name: 'The Pond',
    tip: 'Water costs a stroke. Sand slows you right down',
    par: 3,
    tee: [190, 430],
    cup: [1085, 430],
    green: RECT,
    water: [ellipse(620, 430, 215, 160, 32, 0.07, 2)],
    sand: [ellipse(950, 430, 52, 105, 24, 0.08, 4)]
  },
  {
    name: 'Bumper Bowl',
    tip: 'Bumpers kick back hard',
    par: 3,
    tee: [200, 430],
    cup: [1010, 430],
    green: [
      [260, 150],
      [1020, 150],
      [1190, 300],
      [1190, 560],
      [1020, 710],
      [260, 710],
      [90, 560],
      [90, 300]
    ],
    bumpers: [
      { x: 560, y: 320, r: 30 },
      { x: 560, y: 540, r: 30 },
      { x: 790, y: 430, r: 34 },
      { x: 930, y: 255, r: 24 }
    ],
    sand: [ellipse(930, 640, 95, 38, 24, 0.06, 1)]
  }
]

// ---- simulation (pure: the headless bot uses it too) -------------------------------------------
const STEP = 1 / 120

export function inPoly(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function closest(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1)
  return [ax + dx * t, ay + dy * t]
}

export function buildWorld(hole) {
  const segs = []
  const addPoly = (poly) => poly.forEach((p, i) => segs.push([...p, ...poly[(i + 1) % poly.length]]))
  addPoly(hole.green)
  for (const b of hole.blocks ?? []) addPoly(b)
  const circles = (hole.bumpers ?? []).map((b, i) => ({ ...b, bumper: i }))
  if (hole.windmill) circles.push({ x: hole.windmill.x, y: hole.windmill.y, r: hole.windmill.hubR, bumper: -1 })
  return { hole, segs, circles }
}
export function bladeAngle(wm, t, i) {
  return wm.speed * t + (i * TAU) / wm.blades
}

/** Push the ball out of a contact point and bounce. Returns the impact speed (0 = no contact). */
function contact(b, qx, qy, radius, e, slide, svx, svy) {
  let nx = b.x - qx
  let ny = b.y - qy
  const d = Math.hypot(nx, ny)
  if (d >= radius || d === 0) return 0
  nx /= d
  ny /= d
  b.x = qx + nx * radius
  b.y = qy + ny * radius
  let rx = b.vx - svx
  let ry = b.vy - svy
  const vn = rx * nx + ry * ny
  if (vn >= 0) return 0.001
  rx -= (1 + e) * vn * nx
  ry -= (1 + e) * vn * ny
  // lose a little of the sliding part
  const vt = -rx * ny + ry * nx
  rx += vt * slide * ny
  ry -= vt * slide * nx
  b.vx = rx + svx
  b.vy = ry + svy
  return -vn
}

function substep(w, b, h, t, T, ev) {
  const H = w.hole
  for (const z of H.slopes ?? []) {
    if (b.x > z.x && b.x < z.x + z.w && b.y > z.y && b.y < z.y + z.h) {
      b.vx += z.fx * h
      b.vy += z.fy * h
    }
  }
  b.sand = (H.sand ?? []).some((p) => inPoly(b.x, b.y, p))
  let s = Math.hypot(b.vx, b.vy)
  if (s > 0) {
    const ns = Math.max(0, s - ((b.sand ? T.sandDecel : T.rollDecel) + (b.sand ? T.sandDrag : T.drag) * s) * h)
    b.vx *= ns / s
    b.vy *= ns / s
    s = ns
  }
  const cx = H.cup[0] - b.x
  const cy = H.cup[1] - b.y
  const cd = Math.hypot(cx, cy)
  b.overCup = cd < T.cupR
  if (b.overCup) {
    if (s < T.captureSpeed) return 'sink'
    const pull = (T.cupPull * (1 - cd / T.cupR)) / (cd || 1)
    b.vx += cx * pull * h
    b.vy += cy * pull * h
    const k = Math.exp(-T.cupDrag * h)
    b.vx *= k
    b.vy *= k
  }
  b.x += b.vx * h
  b.y += b.vy * h
  for (const sg of w.segs) {
    const [qx, qy] = closest(b.x, b.y, sg[0], sg[1], sg[2], sg[3])
    const imp = contact(b, qx, qy, T.ballR, T.wallE, T.wallSlide, 0, 0)
    if (imp > 1 && ev) ev.push({ type: 'wall', speed: imp, x: qx, y: qy })
  }
  for (const c of w.circles) {
    const dx = b.x - c.x
    const dy = b.y - c.y
    const d = Math.hypot(dx, dy) || 1
    const qx = c.x + (dx / d) * c.r
    const qy = c.y + (dy / d) * c.r
    const isB = c.bumper >= 0
    const imp = contact(b, qx, qy, T.ballR, isB ? T.bumperE : T.wallE, T.wallSlide, 0, 0)
    if (imp > 1) {
      if (isB) {
        b.vx += (dx / d) * T.bumperKick
        b.vy += (dy / d) * T.bumperKick
      }
      if (ev) ev.push({ type: isB ? 'bumper' : 'wall', i: c.bumper, speed: imp, x: qx, y: qy })
    }
  }
  const wm = H.windmill
  if (wm) {
    for (let i = 0; i < wm.blades; i++) {
      const a = bladeAngle(wm, t, i)
      const ux = Math.cos(a)
      const uy = Math.sin(a)
      const [qx, qy] = closest(b.x, b.y, wm.x + ux * wm.hubR, wm.y + uy * wm.hubR, wm.x + ux * wm.len, wm.y + uy * wm.len)
      const imp = contact(b, qx, qy, T.ballR + wm.half, 0.6, 0.1, -wm.speed * (qy - wm.y), wm.speed * (qx - wm.x))
      if (imp > 1 && ev) ev.push({ type: 'blade', speed: imp, x: qx, y: qy })
    }
  }
  for (const p of H.water ?? []) if (inPoly(b.x, b.y, p)) return 'water'
  return null
}

/** One fixed 1/120 s step, substepped so the ball never moves more than substepPx at a time. */
export function simFrame(w, b, t, T, ev) {
  const n = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * STEP) / T.substepPx))
  const h = STEP / n
  for (let i = 0; i < n; i++) {
    const r = substep(w, b, h, t + i * h, T, ev)
    if (r) return r
  }
  return null
}
export const shotSpeed = (power, T) => T.minSpeed + (T.maxSpeed - T.minSpeed) * Math.pow(clamp(power, 0, 1), T.powerCurve)
export const MINI_PUTT_SIM = { HOLES, TUNING, STEP, buildWorld, simFrame, shotSpeed, inPoly }

/** Where the aim line meets something: the first leg and a short reflected second leg. */
function previewPath(w, x, y, ang, T) {
  const pts = [[x, y]]
  let dx = Math.cos(ang)
  let dy = Math.sin(ang)
  let px = x
  let py = y
  let legMax = 1500
  const r = T.ballR
  for (let leg = 0; leg < 2; leg++) {
    let hit = null
    let dist = 0
    while (dist < legMax) {
      const nx = px + dx * 4
      const ny = py + dy * 4
      for (const sg of w.segs) {
        const [qx, qy] = closest(nx, ny, sg[0], sg[1], sg[2], sg[3])
        if (Math.hypot(nx - qx, ny - qy) < r) {
          hit = [qx, qy]
          break
        }
      }
      if (!hit)
        for (const c of w.circles) {
          const d = Math.hypot(nx - c.x, ny - c.y)
          if (d < r + c.r) {
            hit = [c.x + ((nx - c.x) / d) * c.r, c.y + ((ny - c.y) / d) * c.r]
            break
          }
        }
      if (hit) break
      px = nx
      py = ny
      dist += 4
    }
    pts.push([px, py])
    if (!hit) break
    let nx = px - hit[0]
    let ny = py - hit[1]
    const nd = Math.hypot(nx, ny) || 1
    nx /= nd
    ny /= nd
    const dot = dx * nx + dy * ny
    dx -= 2 * dot * nx
    dy -= 2 * dot * ny
    legMax = 150
  }
  return pts
}

// ---- palette and art ---------------------------------------------------------------------------
const C = {
  floor: '#1f5560',
  floorDot: '#2a6773',
  felt: '#4cc25a',
  feltDark: '#3fae4e',
  feltLight: '#62d46d',
  wood: '#cd8d4c',
  woodDark: '#7a4a22',
  woodLight: '#f2bd7c',
  woodEdge: '#5a3416',
  sand: '#f1d389',
  sandDark: '#d9b462',
  water: '#2f9fd8',
  waterDeep: '#1f78b8',
  waterLight: '#a8e6ff',
  cup: '#0f2a14',
  flag: '#ff4f5e',
  ball: '#ffffff',
  ink: '#173238',
  paper: '#fff6e0',
  paperLine: '#e7d6ae',
  gold: '#ffd84a',
  red: '#e5484d',
  bumper: '#ff4f5e'
}

const mkCanvas = (w, h) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
const polyPath = (poly) => {
  const p = new Path2D()
  poly.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)))
  p.closePath()
  return p
}

let FELT = null
function feltTile() {
  if (FELT) return FELT
  const c = mkCanvas(256, 256)
  const g = c.getContext('2d')
  let s = 7
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * 256
    const y = rnd() * 256
    g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.05 + rnd() * 0.06})` : `rgba(0,40,10,${0.06 + rnd() * 0.08})`
    const a = rnd() * TAU
    g.save()
    g.translate(x, y)
    g.rotate(a)
    g.fillRect(-1.5, -0.5, 3, 1)
    g.restore()
  }
  return (FELT = c)
}

let SPRITES = null
function sprites() {
  if (SPRITES) return SPRITES
  const K = 4
  const r = TUNING.ballR
  const ball = mkCanvas(r * 2 * K + 4, r * 2 * K + 4)
  let g = ball.getContext('2d')
  g.scale(K, K)
  g.translate(r + 0.5, r + 0.5)
  let gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r)
  gr.addColorStop(0, '#ffffff')
  gr.addColorStop(0.6, '#f1f4f2')
  gr.addColorStop(1, '#b9c6c0')
  g.fillStyle = gr
  g.beginPath()
  g.arc(0, 0, r, 0, TAU)
  g.fill()
  g.fillStyle = 'rgba(120,140,130,0.25)'
  for (const [x, y] of [[3, 2], [-2, 4], [5, -2], [0, -1], [-4, 0], [2, 6], [6, 3], [-1, 7]]) {
    g.beginPath()
    g.arc(x, y, 0.8, 0, TAU)
    g.fill()
  }
  g.fillStyle = 'rgba(255,255,255,0.95)'
  g.beginPath()
  g.ellipse(-3.5, -4, 2.6, 1.8, -0.6, 0, TAU)
  g.fill()
  g.lineWidth = 0.7
  g.strokeStyle = 'rgba(40,70,60,0.5)'
  g.beginPath()
  g.arc(0, 0, r - 0.3, 0, TAU)
  g.stroke()
  // soft shadow (a gradient, no shadowBlur)
  const sh = mkCanvas(64, 64)
  g = sh.getContext('2d')
  gr = g.createRadialGradient(32, 32, 2, 32, 32, 30)
  gr.addColorStop(0, 'rgba(0,30,10,0.55)')
  gr.addColorStop(0.5, 'rgba(0,30,10,0.25)')
  gr.addColorStop(1, 'rgba(0,30,10,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  return (SPRITES = { ball, shadow: sh, K })
}

function drawRails(g, poly, rw) {
  const P = polyPath(poly)
  g.lineJoin = 'round'
  g.save()
  g.translate(6, 9)
  g.strokeStyle = 'rgba(0,15,25,0.35)'
  g.lineWidth = rw * 2 + 6
  g.stroke(P)
  g.restore()
  g.strokeStyle = C.woodDark
  g.lineWidth = rw * 2 + 4
  g.stroke(P)
  g.save()
  g.translate(-1.5, -2.5)
  g.strokeStyle = C.wood
  g.lineWidth = rw * 2 - 1
  g.stroke(P)
  g.strokeStyle = C.woodLight
  g.globalAlpha = 0.75
  g.lineWidth = rw * 2 * 0.74
  g.stroke(P)
  g.globalAlpha = 1
  g.strokeStyle = C.wood
  g.lineWidth = rw * 2 * 0.46
  g.stroke(P)
  // plank seams
  g.setLineDash([2.5, 64])
  g.strokeStyle = 'rgba(90,50,20,0.45)'
  g.lineWidth = rw * 2 - 2
  g.stroke(P)
  g.setLineDash([])
  g.restore()
}

function drawBlock(g, poly, clipTo) {
  const P = polyPath(poly)
  g.save()
  if (clipTo) g.clip(clipTo)
  g.translate(7, 10)
  g.fillStyle = 'rgba(0,25,10,0.35)'
  g.fill(P)
  g.restore()
  g.fillStyle = C.woodDark
  g.fill(P)
  g.save()
  g.clip(P)
  g.translate(-2.5, -3.5)
  g.fillStyle = C.wood
  g.fill(P)
  // grain along the long side
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  const tall = Math.max(...ys) - Math.min(...ys) > Math.max(...xs) - Math.min(...xs)
  g.strokeStyle = 'rgba(120,70,30,0.22)'
  g.lineWidth = 1.5
  for (let k = 0; k < 40; k++) {
    const o = (k * 7.3) % (tall ? Math.max(...xs) - Math.min(...xs) : Math.max(...ys) - Math.min(...ys))
    g.beginPath()
    if (tall) {
      const x = Math.min(...xs) + o
      g.moveTo(x, Math.min(...ys))
      g.bezierCurveTo(x + 3, Math.min(...ys) + 120, x - 3, Math.max(...ys) - 120, x + 1, Math.max(...ys))
    } else {
      const y = Math.min(...ys) + o
      g.moveTo(Math.min(...xs), y)
      g.bezierCurveTo(Math.min(...xs) + 80, y + 2, Math.max(...xs) - 80, y - 2, Math.max(...xs), y)
    }
    if (k % 3 === 0) g.stroke()
  }
  g.strokeStyle = C.woodLight
  g.globalAlpha = 0.8
  g.lineWidth = 8
  g.stroke(P)
  g.globalAlpha = 1
  g.restore()
  g.lineWidth = 2
  g.strokeStyle = C.woodEdge
  g.stroke(P)
}

/** The whole static hole at 2×: floor, rails, felt, hazards, tee mat and cup. */
function bakeHole(hole) {
  const S = 2
  const c = mkCanvas(W * S, H * S)
  const g = c.getContext('2d')
  g.scale(S, S)
  // playroom floor
  g.fillStyle = C.floor
  g.fillRect(0, 0, W, H)
  g.fillStyle = C.floorDot
  for (let y = 0; y < H; y += 28) for (let x = (y / 28) % 2 ? 14 : 0; x < W; x += 28) g.fillRect(x, y, 3, 3)
  const vg = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 820)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,10,20,0.45)')
  g.fillStyle = vg
  g.fillRect(0, 0, W, H)

  if (hole.deco) {
    const [dx, dy, ds] = hole.deco
    g.save()
    g.translate(dx, dy)
    g.rotate(-0.12)
    g.fillStyle = 'rgba(255,255,255,0.06)'
    g.font = `400 ${ds}px "Lilita One", system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('MINI PUTT', 0, 0)
    g.font = `900 ${ds * 0.32}px "Rubik", system-ui, sans-serif`
    g.fillText(`HOLE ${HOLES.indexOf(hole) + 1} · PAR ${hole.par}`, 0, ds * 0.72)
    g.restore()
  }
  const green = polyPath(hole.green)
  drawRails(g, hole.green, 22)
  // felt
  const fg = g.createLinearGradient(0, 150, 0, 710)
  fg.addColorStop(0, C.feltLight)
  fg.addColorStop(1, C.felt)
  g.fillStyle = fg
  g.fill(green)
  g.save()
  g.clip(green)
  // mowing stripes
  g.fillStyle = 'rgba(0,60,20,0.06)'
  for (let x = -400; x < W + 400; x += 120) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x + 60, 0)
    g.lineTo(x + 60 - 260, H)
    g.lineTo(x - 260, H)
    g.fill()
  }
  const pat = g.createPattern(feltTile(), 'repeat')
  pat.setTransform(new DOMMatrix().scale(1 / S))
  g.fillStyle = pat
  g.fillRect(0, 0, W, H)
  // slopes: shaded by the push direction
  for (const z of hole.slopes ?? []) {
    const m = Math.hypot(z.fx, z.fy) || 1
    const cx = z.x + z.w / 2
    const cy = z.y + z.h / 2
    const L = Math.max(z.w, z.h) / 2
    const lg = g.createLinearGradient(cx - (z.fx / m) * L, cy - (z.fy / m) * L, cx + (z.fx / m) * L, cy + (z.fy / m) * L)
    lg.addColorStop(0, 'rgba(255,255,210,0.16)')
    lg.addColorStop(1, 'rgba(0,50,20,0.22)')
    g.fillStyle = lg
    g.fillRect(z.x, z.y, z.w, z.h)
    g.strokeStyle = 'rgba(255,255,255,0.18)'
    g.setLineDash([10, 10])
    g.lineWidth = 3
    g.strokeRect(z.x, z.y, z.w, z.h)
    g.setLineDash([])
  }
  // sand
  for (const sp of hole.sand ?? []) {
    const P = polyPath(sp)
    g.save()
    g.translate(0, 3)
    g.strokeStyle = 'rgba(0,50,20,0.3)'
    g.lineWidth = 8
    g.stroke(P)
    g.restore()
    g.fillStyle = C.sand
    g.fill(P)
    g.save()
    g.clip(P)
    let s = 3
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 700; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(170,120,40,0.35)' : 'rgba(255,250,220,0.6)'
      g.fillRect(rnd() * W, 150 + rnd() * 560, 1.5, 1.5)
    }
    // raked lines
    g.strokeStyle = 'rgba(190,140,60,0.3)'
    g.lineWidth = 2
    for (let y = 100; y < 760; y += 11) {
      g.beginPath()
      for (let x = 0; x <= W; x += 20) g.lineTo(x, y + Math.sin(x * 0.03 + y * 0.1) * 3)
      g.stroke()
    }
    g.restore()
    g.strokeStyle = C.sandDark
    g.lineWidth = 3
    g.stroke(P)
  }
  // water
  for (const wp of hole.water ?? []) {
    const P = polyPath(wp)
    g.strokeStyle = '#8f9a8f'
    g.lineWidth = 16
    g.lineJoin = 'round'
    g.stroke(P)
    g.fillStyle = C.water
    g.fill(P)
    g.save()
    g.clip(P)
    const xs = wp.map((p) => p[0])
    const ys = wp.map((p) => p[1])
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2
    const my = (Math.min(...ys) + Math.max(...ys)) / 2
    const rg = g.createRadialGradient(mx, my, 20, mx, my, 220)
    rg.addColorStop(0, C.waterDeep)
    rg.addColorStop(1, 'rgba(47,159,216,0)')
    g.fillStyle = rg
    g.fillRect(0, 0, W, H)
    g.strokeStyle = 'rgba(0,30,60,0.35)'
    g.lineWidth = 14
    g.translate(4, 6)
    g.stroke(P)
    g.restore()
    // pebble rim
    let s = 9
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < wp.length; i++) {
      const [ax, ay] = wp[i]
      const [bx, by] = wp[(i + 1) % wp.length]
      for (let k = 0; k < 3; k++) {
        const t = (k + rnd() * 0.6) / 3
        const x = ax + (bx - ax) * t
        const y = ay + (by - ay) * t
        const pr = 5 + rnd() * 4
        g.fillStyle = 'rgba(0,30,20,0.3)'
        g.beginPath()
        g.ellipse(x + 2, y + 3, pr, pr * 0.8, 0, 0, TAU)
        g.fill()
        g.fillStyle = rnd() < 0.5 ? '#c9cfc4' : '#aeb7ac'
        g.beginPath()
        g.ellipse(x, y, pr, pr * 0.8, rnd(), 0, TAU)
        g.fill()
        g.fillStyle = 'rgba(255,255,255,0.4)'
        g.beginPath()
        g.ellipse(x - pr * 0.3, y - pr * 0.3, pr * 0.4, pr * 0.25, 0, 0, TAU)
        g.fill()
      }
    }
  }
  // tee mat
  const [tx, ty] = hole.tee
  g.fillStyle = 'rgba(0,40,10,0.25)'
  g.beginPath()
  g.roundRect(tx - 34, ty - 30, 68, 64, 10)
  g.fill()
  g.fillStyle = '#2f8a3f'
  g.beginPath()
  g.roundRect(tx - 36, ty - 34, 68, 64, 10)
  g.fill()
  g.strokeStyle = 'rgba(255,255,255,0.35)'
  g.lineWidth = 2
  g.setLineDash([6, 5])
  g.beginPath()
  g.roundRect(tx - 30, ty - 28, 56, 52, 7)
  g.stroke()
  g.setLineDash([])
  for (const [dx, col] of [
    [-26, '#4f8cff'],
    [22, '#ff5f6b']
  ]) {
    g.fillStyle = 'rgba(0,30,10,0.35)'
    g.beginPath()
    g.arc(tx + dx + 2, ty - 38 + 3, 6, 0, TAU)
    g.fill()
    g.fillStyle = col
    g.beginPath()
    g.arc(tx + dx, ty - 38, 6, 0, TAU)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,0.6)'
    g.beginPath()
    g.arc(tx + dx - 2, ty - 40, 2, 0, TAU)
    g.fill()
  }
  // cup
  const [cx, cy] = hole.cup
  const R = TUNING.cupR
  g.fillStyle = 'rgba(255,255,255,0.12)'
  g.beginPath()
  g.arc(cx, cy, R + 7, 0, TAU)
  g.fill()
  g.fillStyle = C.cup
  g.beginPath()
  g.arc(cx, cy, R, 0, TAU)
  g.fill()
  const cg = g.createRadialGradient(cx - 4, cy - 6, 2, cx, cy, R)
  cg.addColorStop(0, '#000')
  cg.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = cg
  g.fill()
  g.strokeStyle = '#e8efe9'
  g.lineWidth = 3
  g.beginPath()
  g.arc(cx, cy, R - 1.5, Math.PI * 0.15, Math.PI * 1.05)
  g.stroke()
  g.strokeStyle = 'rgba(255,255,255,0.35)'
  g.beginPath()
  g.arc(cx, cy, R - 1.5, Math.PI * 1.05, Math.PI * 2.15)
  g.stroke()
  // inner shadow of the rails on the felt
  g.lineJoin = 'round'
  g.translate(4, 6)
  g.strokeStyle = 'rgba(0,30,10,0.16)'
  g.lineWidth = 26
  g.stroke(green)
  g.strokeStyle = 'rgba(0,30,10,0.18)'
  g.lineWidth = 10
  g.stroke(green)
  g.restore()
  g.strokeStyle = C.woodEdge
  g.lineWidth = 3
  g.stroke(green)
  for (const b of hole.blocks ?? []) drawBlock(g, b, green)
  return c
}

function drawBumper(ctx, b, squish) {
  const k = 1 + squish * 0.22
  ctx.fillStyle = 'rgba(0,30,10,0.35)'
  ctx.beginPath()
  ctx.arc(b.x + 6, b.y + 9, b.r, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#a92a36'
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.r * k, 0, TAU)
  ctx.fill()
  ctx.fillStyle = squish > 0.3 ? '#ffd0d4' : C.bumper
  ctx.beginPath()
  ctx.arc(b.x - 1.5, b.y - 2.5, b.r * k - 3, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#fff6e0'
  ctx.beginPath()
  ctx.arc(b.x - 1.5, b.y - 2.5, b.r * 0.6, 0, TAU)
  ctx.fill()
  ctx.fillStyle = C.bumper
  ctx.beginPath()
  ctx.arc(b.x - 1.5, b.y - 2.5, b.r * 0.28, 0, TAU)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.ellipse(b.x - b.r * 0.45, b.y - b.r * 0.55, b.r * 0.25, b.r * 0.14, -0.6, 0, TAU)
  ctx.fill()
}

function drawWindmill(ctx, wm, t) {
  const blade = (a) => {
    ctx.save()
    ctx.rotate(a)
    ctx.fillStyle = '#6b3f1c'
    ctx.fillRect(wm.hubR - 6, -3, wm.len - wm.hubR + 6, 6)
    ctx.fillStyle = '#fff3d6'
    ctx.fillRect(wm.hubR + 8, -wm.half, wm.len - wm.hubR - 8, wm.half * 2)
    ctx.strokeStyle = '#b98a5a'
    ctx.lineWidth = 1.5
    for (let x = wm.hubR + 8; x <= wm.len; x += 12) {
      ctx.beginPath()
      ctx.moveTo(x, -wm.half)
      ctx.lineTo(x, wm.half)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(wm.hubR + 8, 0)
    ctx.lineTo(wm.len, 0)
    ctx.stroke()
    ctx.strokeStyle = '#6b3f1c'
    ctx.lineWidth = 2
    ctx.strokeRect(wm.hubR + 8, -wm.half, wm.len - wm.hubR - 8, wm.half * 2)
    ctx.restore()
  }
  ctx.save()
  ctx.translate(wm.x + 8, wm.y + 12)
  ctx.globalAlpha = 0.28
  ctx.fillStyle = '#002010'
  for (let i = 0; i < wm.blades; i++) {
    ctx.save()
    ctx.rotate(bladeAngle(wm, t, i))
    ctx.fillRect(wm.hubR, -wm.half, wm.len - wm.hubR, wm.half * 2)
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(0, 0, wm.hubR + 2, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.restore()
  ctx.save()
  ctx.translate(wm.x, wm.y)
  for (let i = 0; i < wm.blades; i++) blade(bladeAngle(wm, t, i))
  // the little roof (octagon, seen from above)
  ctx.fillStyle = '#7d2a2f'
  ctx.beginPath()
  for (let i = 0; i < 8; i++) ctx.lineTo(Math.cos((i / 8) * TAU + 0.39) * (wm.hubR + 2), Math.sin((i / 8) * TAU + 0.39) * (wm.hubR + 2))
  ctx.fill()
  ctx.fillStyle = '#d9474f'
  ctx.beginPath()
  for (let i = 0; i < 8; i++) ctx.lineTo(Math.cos((i / 8) * TAU + 0.39) * wm.hubR - 1.5, Math.sin((i / 8) * TAU + 0.39) * wm.hubR - 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(80,20,20,0.6)'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 8; i++) {
    ctx.beginPath()
    ctx.moveTo(-1.5, -2)
    ctx.lineTo(Math.cos((i / 8) * TAU + 0.39) * wm.hubR - 1.5, Math.sin((i / 8) * TAU + 0.39) * wm.hubR - 2)
    ctx.stroke()
  }
  ctx.fillStyle = '#ffd84a'
  ctx.beginPath()
  ctx.arc(-1.5, -2, 6, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = '#6b3f1c'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

function drawFlag(ctx, x, y, t, num, pop = 0, lift = 0) {
  const top = y - 76 - lift
  ctx.save()
  // pole shadow on the felt
  ctx.strokeStyle = 'rgba(0,30,10,0.3)'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + 40, y + 22)
  ctx.stroke()
  ctx.fillStyle = 'rgba(0,30,10,0.22)'
  ctx.beginPath()
  ctx.moveTo(x + 40, y + 22)
  ctx.lineTo(x + 66, y + 30)
  ctx.lineTo(x + 52, y + 42)
  ctx.fill()
  ctx.translate(x, top)
  if (pop) ctx.rotate(Math.sin(pop * 22) * 0.25 * pop)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, 76 + lift)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(1.5, 2)
  ctx.lineTo(1.5, 76 + lift)
  ctx.stroke()
  // fluttering cloth
  const n = 8
  const len = 46
  ctx.beginPath()
  ctx.moveTo(0, 2)
  for (let i = 1; i <= n; i++) {
    const u = i / n
    ctx.lineTo(u * len, 2 + u * 14 + Math.sin(t * 7 - u * 4) * 3.5 * u)
  }
  for (let i = n; i >= 0; i--) {
    const u = i / n
    ctx.lineTo(u * len, 30 - u * 14 + Math.sin(t * 7 - u * 4) * 3.5 * u)
  }
  ctx.closePath()
  ctx.fillStyle = C.flag
  ctx.fill()
  ctx.strokeStyle = '#b8323d'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = '900 15px "Rubik", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(num), 15, 16 + Math.sin(t * 7 - 1.3) * 1.2)
  ctx.fillStyle = '#ffd84a'
  ctx.beginPath()
  ctx.arc(0, -2, 4, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function drawBall(ctx, x, y, scale = 1, shadow = true) {
  const S = sprites()
  const r = TUNING.ballR
  if (shadow) ctx.drawImage(S.shadow, x - 16 + 3, y - 16 + 6, 32, 32)
  const sz = (S.ball.width / S.K) * scale
  ctx.drawImage(S.ball, x - sz / 2 + (0.5 / S.K) * scale, y - sz / 2 + (0.5 / S.K) * scale, sz, sz)
  return r
}

const resultName = (strokes, par, picked) => {
  if (picked) return 'Picked up'
  if (strokes === 1) return 'Hole in one!'
  const d = strokes - par
  return d <= -3 ? 'Albatross!' : d === -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : 'Triple bogey'
}
export const holePoints = (strokes, par, T = TUNING) => Math.max(0, par + 3 - strokes) * T.points + (strokes === 1 ? T.aceBonus : 0)

// ---- the module --------------------------------------------------------------------------------
export default {
  id: 'mini-putt',
  name: 'Mini Putt',
  blurb: 'Six holes of toy mini golf',
  scoreLabel: 'points',
  style: { bg: '#2f8a46', accent: '#fff27a' },
  medals: [1000, 1600, 2200],
  music: { bpm: 92, root: 55, chords: [0, 5, 2, 7], lead: [4, null, 2, 0, null, 2, 4, 7], wave: 'triangle', gain: 0.032 },
  TUNING,
  cursor: true,
  howTo: (input) =>
    input.mode === 'touch' || input.mode === 'mouse'
      ? 'Drag back from the ball and let go to putt'
      : `${input.stickLabel()} to aim · hold ${input.label('a')} to swing, let go to putt`,
  icon(ctx, x, y, size, t) {
    const s = size / 130
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    const poly = [
      [-150, -58],
      [150, -58],
      [150, 58],
      [-150, 58]
    ]
    const P = polyPath(poly)
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 30
    ctx.save()
    ctx.translate(5, 7)
    ctx.stroke(P)
    ctx.restore()
    ctx.strokeStyle = C.woodDark
    ctx.lineWidth = 30
    ctx.stroke(P)
    ctx.strokeStyle = C.wood
    ctx.lineWidth = 25
    ctx.save()
    ctx.translate(-1, -2)
    ctx.stroke(P)
    ctx.strokeStyle = C.woodLight
    ctx.lineWidth = 18
    ctx.stroke(P)
    ctx.strokeStyle = C.wood
    ctx.lineWidth = 11
    ctx.stroke(P)
    ctx.restore()
    ctx.fillStyle = C.felt
    ctx.fill(P)
    ctx.strokeStyle = C.woodEdge
    ctx.lineWidth = 3
    ctx.stroke(P)
    ctx.fillStyle = 'rgba(0,40,10,0.15)'
    ctx.fillRect(-150, -58, 300, 10)
    // dotted aim line, ball, cup, flag
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    for (let i = 0; i < 7; i++) {
      ctx.beginPath()
      ctx.arc(-82 + i * 22, 18 - i * 5.5, 3, 0, TAU)
      ctx.fill()
    }
    ctx.fillStyle = C.cup
    ctx.beginPath()
    ctx.arc(92, -16, 13, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#e8efe9'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(92, -16, 12, 0.4, 3.3)
    ctx.stroke()
    const roll = (t * 0.6) % 1
    ctx.fillStyle = 'rgba(0,30,10,0.35)'
    ctx.beginPath()
    ctx.ellipse(-104 + 3, 26 + 5, 12, 10, 0, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(-104, 26 - Math.abs(Math.sin(roll * Math.PI)) * 4, 12, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#c9d4ce'
    ctx.beginPath()
    ctx.arc(-101, 29 - Math.abs(Math.sin(roll * Math.PI)) * 4, 6, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(-106, 23 - Math.abs(Math.sin(roll * Math.PI)) * 4, 7, 0, TAU)
    ctx.fill()
    ctx.restore()
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s * 0.9, s * 0.9)
    drawFlag(ctx, 102, -18, t, 1)
    ctx.restore()
  },

  create(env) {
    const { input, audio, settings, font } = env
    const T = env.TUNING
    const fx = createFx(settings, { max: 180 })
    const PAUSE_ZONE = { x: W - 130, y: 0, w: 130, h: 100 }
    const pointerMode = () => input.mode === 'touch' || input.mode === 'mouse'

    let holeIdx = 0
    let world = null
    let bake = null
    let simT = 0
    let acc = 0
    let t = 0
    const ball = { x: 0, y: 0, vx: 0, vy: 0, sand: false, overCup: false }
    let last = { x: 0, y: 0 }
    let aim = 0
    let aimHeld = 0
    let power = 0
    let meterT = 0
    let drag = null // { sx, sy, px, py }
    let phase = 'aim'
    let phaseT = 0
    let strokes = 0
    let settle = 0
    let rollT = 0
    let card = []
    let aces = 0
    let banner = null // { text, sub, t, color }
    let intro = 0
    let fade = 0
    let ripples = []
    let trail = []
    let squish = []
    let flagPop = 0
    let clackCool = 0
    let wasSand = false
    let wasOverCup = false
    let preview = null
    let previewKey = ''
    let hintShown = false

    const hole = () => HOLES[holeIdx]
    const cap = () => hole().par + T.maxOverPar
    const aimAtCup = () => Math.atan2(hole().cup[1] - ball.y, hole().cup[0] - ball.x)

    function loadHole(i) {
      holeIdx = i
      const h = HOLES[i]
      world = buildWorld(h)
      bake = bakeHole(h)
      ball.x = h.tee[0]
      ball.y = h.tee[1]
      ball.vx = ball.vy = 0
      last = { x: ball.x, y: ball.y }
      aim = h.aim ?? aimAtCup()
      strokes = 0
      phase = 'aim'
      phaseT = 0
      intro = T.introTime
      ripples = []
      trail = []
      squish = (h.bumpers ?? []).map(() => 0)
      flagPop = 0
      fx.clear()
      preview = null
      previewKey = ''
    }
    loadHole(0)

    // ---- sound --------------------------------------------------------------------------------
    const sfx = {
      putt(p) {
        audio.tone({ freq: 1500, dur: 0.035, type: 'square', gain: 0.08 + p * 0.07 })
        audio.tone({ freq: 380 + p * 120, dur: 0.09, type: 'triangle', gain: 0.18, slide: -120 })
        audio.noise({ dur: 0.03, gain: 0.08 + p * 0.08 })
      },
      clack(speed) {
        if (clackCool > 0) return
        clackCool = 0.05
        const k = clamp(speed / 900, 0.1, 1)
        audio.tone({ freq: rand(480, 620) + k * 200, dur: 0.05, type: 'square', gain: 0.05 + k * 0.14 })
        audio.tone({ freq: 190, dur: 0.06, type: 'triangle', gain: 0.06 + k * 0.1 })
      },
      bumper() {
        audio.tone({ freq: 620, dur: 0.16, type: 'triangle', gain: 0.2, slide: 520 })
        audio.tone({ freq: 310, dur: 0.12, type: 'sine', gain: 0.16, slide: 200 })
      },
      blade() {
        audio.tone({ freq: 240, dur: 0.08, type: 'square', gain: 0.12, slide: -60 })
        audio.noise({ dur: 0.05, gain: 0.1 })
      },
      rattle() {
        for (let i = 0; i < 3; i++) audio.tone({ freq: 900 - i * 140, dur: 0.03, type: 'square', gain: 0.07, delay: i * 0.045 })
      },
      drop() {
        for (let i = 0; i < 3; i++) audio.tone({ freq: 1100 - i * 180, dur: 0.03, type: 'square', gain: 0.08, delay: i * 0.05 })
        audio.tone({ freq: 320, dur: 0.22, type: 'sine', gain: 0.25, slide: -170, delay: 0.16 })
        audio.noise({ dur: 0.05, gain: 0.15, delay: 0.17 })
      },
      applause(n) {
        for (let i = 0; i < n; i++) audio.noise({ dur: 0.025 + Math.random() * 0.02, gain: 0.03 + Math.random() * 0.04, delay: 0.3 + Math.random() * 1.3 })
      },
      chime() {
        ;[0, 4, 7, 12].forEach((s, i) => audio.tone({ freq: 523 * 2 ** (s / 12), dur: 0.2, type: 'triangle', gain: 0.12, delay: 0.25 + i * 0.08 }))
      },
      splash() {
        audio.noise({ dur: 0.5, gain: 0.28 })
        audio.tone({ freq: 240, dur: 0.3, type: 'sine', gain: 0.18, slide: -150 })
        audio.tone({ freq: 140, dur: 0.4, type: 'sine', gain: 0.12, slide: -60, delay: 0.1 })
      },
      sand() {
        audio.noise({ dur: 0.12, gain: 0.12 })
        audio.tone({ freq: 90, dur: 0.12, type: 'sine', gain: 0.2 })
      },
      meter(p) {
        audio.tone({ freq: 300 + p * 500, dur: 0.03, type: 'sine', gain: 0.05 })
      },
      pop() {
        audio.tone({ freq: 500, dur: 0.1, type: 'sine', gain: 0.14, slide: 300 })
      }
    }

    // ---- flow ---------------------------------------------------------------------------------
    function shoot(p) {
      strokes++
      last = { x: ball.x, y: ball.y }
      const sp = shotSpeed(p, T)
      ball.vx = Math.cos(aim) * sp
      ball.vy = Math.sin(aim) * sp
      phase = 'roll'
      settle = 0
      rollT = 0
      intro = Math.min(intro, 0.3)
      sfx.putt(p)
      fx.burst(ball.x - Math.cos(aim) * 10, ball.y - Math.sin(aim) * 10, 'rgba(230,255,220,0.9)', 5, 120, { size: 2.5, life: 0.3, gravity: 0 })
    }
    function finishHole(picked) {
      const h = hole()
      const s = picked ? cap() : strokes
      card[holeIdx] = s
      if (s === 1) aces++
      const pts = holePoints(s, h.par, T)
      run.score += pts
      const d = s - h.par
      banner = { text: resultName(s, h.par, picked), sub: pts ? `+${pts} points` : 'No points', t: 0, color: s === 1 || d < 0 ? C.gold : d === 0 ? '#ffffff' : '#ffb3a8' }
      if (!picked) {
        if (d < 0 || s === 1) {
          sfx.chime()
          sfx.applause(s === 1 ? 46 : 30)
          for (let i = 0; i < (s === 1 ? 3 : 2); i++) fx.burst(h.cup[0] + rand(-20, 20), h.cup[1] - 40, i % 2 ? C.gold : '#ffffff', 16, 360, { size: 4, life: 0.9, gravity: 500, square: true })
          if (s === 1) fx.burst(h.cup[0], h.cup[1] - 40, C.flag, 20, 420, { size: 5, life: 1.1, gravity: 600, square: true })
        } else sfx.applause(d === 0 ? 16 : 6)
      }
    }
    function nextHole() {
      if (holeIdx + 1 >= HOLES.length) {
        phase = 'final'
        phaseT = 0
        const total = card.reduce((a, b) => a + (b ?? 0), 0)
        if (!env.store.bestStrokes || total < env.store.bestStrokes) {
          env.store.bestStrokes = total
          env.saveNow()
        }
        return
      }
      phase = 'fade'
      phaseT = 0
    }

    const ripple = (x, y, max, color, life = 0.7) => ripples.length < 14 && ripples.push({ x, y, max, color, life, t: 0 })

    function handleEvents(ev) {
      for (const e of ev) {
        if (e.type === 'wall') {
          if (e.speed > 25) sfx.clack(e.speed)
          if (e.speed > 380) {
            fx.burst(e.x, e.y, 'rgba(255,236,200,0.9)', 4, 140, { size: 2.5, life: 0.3, gravity: 0 })
            if (e.speed > 900) fx.shake(0.12)
          }
        } else if (e.type === 'bumper') {
          sfx.bumper()
          squish[e.i] = 1
          ripple(e.x, e.y, 46, 'rgba(255,220,220,0.9)', 0.35)
          fx.burst(e.x, e.y, '#ffd0d4', 6, 220, { size: 3, life: 0.35, gravity: 0 })
          fx.shake(0.15)
        } else if (e.type === 'blade') {
          sfx.blade()
          fx.burst(e.x, e.y, '#fff3d6', 5, 160, { size: 2.5, life: 0.3, gravity: 0 })
        }
      }
    }

    function updateAim(dt) {
      const ax = input.aimX ?? 0
      const ay = input.aimY ?? 0
      if (Math.hypot(ax, ay) > 0.6) aim = Math.atan2(ay, ax)
      const turn = input.x
      if (Math.abs(turn) > 0.15) {
        aimHeld += dt
        aim += turn * (aimHeld > 0.45 ? T.aimFast : T.aimSpeed) * dt
      } else aimHeld = 0
      if (Math.abs(input.y) > 0.15 && Math.abs(turn) <= 0.15) aim += input.y * T.aimFine * dt
    }

    const run = {
      score: 0,
      done: false,
      stats: () => {
        const total = card.reduce((a, b) => a + (b ?? 0), 0)
        const par = HOLES.reduce((a, h, i) => a + (card[i] === undefined ? 0 : h.par), 0)
        const d = total - par
        return [
          ['Strokes', String(total)],
          ['To par', d === 0 ? 'Even' : d > 0 ? `+${d}` : String(d)],
          ['Holes in one', aces]
        ]
      },
      prompts: (inp) => {
        if (inp.mode === 'touch' || inp.mode === 'mouse') return phase === 'drag' ? [['b', 'Cancel']] : []
        if (phase === 'aim') return [['a', 'Hold to swing']]
        if (phase === 'charge') return [['a', 'Let go to putt'], ['b', 'Cancel']]
        return []
      },
      update(dt) {
        t += dt
        phaseT += dt
        clackCool -= dt
        intro = Math.max(0, intro - dt)
        flagPop = Math.max(0, flagPop - dt * 1.2)
        for (let i = 0; i < squish.length; i++) squish[i] = Math.max(0, squish[i] - dt * 5)
        if (banner) banner.t += dt
        fx.update(dt)
        ripples = ripples.filter((r) => (r.t += dt) < r.life)

        // world clock (windmill) and ball physics, fixed step
        acc = Math.min(acc + dt, STEP * 10)
        while (acc >= STEP) {
          acc -= STEP
          if (phase === 'roll') {
            const ev = []
            const r = simFrame(world, ball, simT, T, ev)
            handleEvents(ev)
            if (ball.sand && !wasSand) sfx.sand()
            wasSand = ball.sand
            if (ball.overCup && !wasOverCup) sfx.rattle()
            wasOverCup = ball.overCup
            rollT += STEP
            if (r === 'sink') {
              phase = 'sink'
              phaseT = 0
              ball.sx = ball.x
              ball.sy = ball.y
              sfx.drop()
              finishHole(false)
            } else if (r === 'water') {
              phase = 'splash'
              phaseT = 0
              strokes += T.waterPenalty
              sfx.splash()
              ripple(ball.x, ball.y, 50, 'rgba(220,250,255,0.9)', 0.9)
              ripple(ball.x, ball.y, 30, 'rgba(220,250,255,0.9)', 0.6)
              fx.burst(ball.x, ball.y, '#c8f0ff', 18, 260, { size: 4, life: 0.6, gravity: 700 })
            } else {
              const sp = Math.hypot(ball.vx, ball.vy)
              settle = sp < T.stopSpeed ? settle + STEP : 0
              const outside = !inPoly(ball.x, ball.y, hole().green) || (hole().blocks ?? []).some((b) => inPoly(ball.x, ball.y, b))
              if (outside) {
                ball.x = last.x
                ball.y = last.y
                settle = 1
              }
              if (settle >= T.settleTime || rollT > 25) {
                ball.vx = ball.vy = 0
                if (strokes >= cap()) {
                  phase = 'pickup'
                  phaseT = 0
                  finishHole(true)
                } else {
                  phase = 'aim'
                  aim = aimAtCup()
                }
              }
            }
          }
          simT += STEP
        }

        if (phase === 'roll') {
          if (Math.hypot(ball.vx, ball.vy) > 420) trail.push({ x: ball.x, y: ball.y, life: 0.18 })
        }
        trail = trail.filter((p) => (p.life -= dt) > 0).slice(-12)

        const p = input.pointer
        const inPause = p.x >= PAUSE_ZONE.x && p.y <= PAUSE_ZONE.h
        if (phase === 'aim') {
          updateAim(dt)
          if (input.pressed('a')) {
            intro = Math.min(intro, 0.4)
            phase = 'charge'
            meterT = 0
            power = 0
          } else if (p.pressed && !inPause) {
            phase = 'drag'
            drag = { sx: p.x, sy: p.y }
            power = 0
          }
        } else if (phase === 'charge') {
          const before = power
          meterT += dt
          const u = (meterT / T.meterFill) % 2
          power = u < 1 ? u : 2 - u
          if (Math.floor(before * 10) !== Math.floor(power * 10)) sfx.meter(power)
          if (input.pressed('b')) phase = 'aim'
          else if (!input.held('a')) shoot(Math.max(0.02, power))
        } else if (phase === 'drag') {
          const dx = drag.sx - p.x
          const dy = drag.sy - p.y
          const d = Math.hypot(dx, dy)
          if (d > 8) aim = Math.atan2(dy, dx)
          const before = power
          power = clamp((d - 12) / T.dragMax, 0, 1)
          if (Math.floor(before * 10) !== Math.floor(power * 10)) sfx.meter(power)
          if (input.pressed('b')) ((phase = 'aim'), (drag = null))
          else if (!p.down) {
            drag = null
            if (power > 0.01) shoot(power)
            else phase = 'aim'
          }
        } else if (phase === 'sink') {
          if (phaseT > 0.22 && !ball.dropped) {
            ball.dropped = true
            ripple(hole().cup[0], hole().cup[1], 60, 'rgba(255,255,255,0.9)', 0.7)
            ripple(hole().cup[0], hole().cup[1], 36, 'rgba(255,255,255,0.8)', 0.5)
            flagPop = 1
            sfx.pop()
          }
          if (phaseT > T.sinkTime) ((ball.dropped = false), nextHole())
        } else if (phase === 'splash') {
          if (phaseT > 1.0) {
            ball.x = last.x
            ball.y = last.y
            ball.vx = ball.vy = 0
            ripple(ball.x, ball.y, 26, 'rgba(255,255,255,0.8)', 0.35)
            sfx.pop()
            if (strokes >= cap()) {
              phase = 'pickup'
              phaseT = 0
              finishHole(true)
            } else {
              phase = 'aim'
              aim = aimAtCup()
            }
          }
        } else if (phase === 'pickup') {
          if (phaseT > 1.8) nextHole()
        } else if (phase === 'fade') {
          if (phaseT >= 0.35 && phaseT - dt < 0.35) {
            banner = null
            loadHole(holeIdx + 1)
            phase = 'fade'
            phaseT = 0.35
          }
          if (phaseT > 0.7) phase = 'aim'
        } else if (phase === 'final') {
          if (phaseT > 3.2) run.done = true
        }
      },

      draw(ctx) {
        ctx.save()
        const [ox, oy] = fx.offset()
        ctx.translate(ox, oy)
        ctx.drawImage(bake, 0, 0, W, H)
        const h = hole()
        // slope chevrons drift downhill
        for (const z of h.slopes ?? []) {
          ctx.save()
          ctx.beginPath()
          ctx.rect(z.x, z.y, z.w, z.h)
          ctx.clip()
          const a = Math.atan2(z.fy, z.fx)
          ctx.translate(z.x + z.w / 2, z.y + z.h / 2)
          ctx.rotate(a)
          const off = (t * 40) % 80
          ctx.strokeStyle = 'rgba(255,255,255,0.2)'
          ctx.lineWidth = 6
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          for (let u = -440; u < 440; u += 80)
            for (let v = -280; v < 300; v += 110) {
              const cx = u + off
              const cy = v + ((u / 80) % 2 ? 55 : 0)
              ctx.beginPath()
              ctx.moveTo(cx - 12, cy - 18)
              ctx.lineTo(cx + 6, cy)
              ctx.lineTo(cx - 12, cy + 18)
              ctx.stroke()
            }
          ctx.restore()
        }
        // water shimmer
        for (const wp of h.water ?? []) {
          ctx.save()
          ctx.clip(polyPath(wp))
          ctx.strokeStyle = 'rgba(200,240,255,0.35)'
          ctx.lineWidth = 3
          ctx.lineCap = 'round'
          for (let i = 0; i < 9; i++) {
            const x = 470 + ((i * 97 + t * 18) % 320)
            const y = 310 + ((i * 53) % 250)
            const k = 0.5 + 0.5 * Math.sin(t * 1.8 + i)
            ctx.globalAlpha = k
            ctx.beginPath()
            ctx.moveTo(x - 14, y)
            ctx.quadraticCurveTo(x, y - 5, x + 14, y)
            ctx.stroke()
          }
          ctx.globalAlpha = 1
          ctx.restore()
        }
        for (const [i, b] of (h.bumpers ?? []).entries()) drawBumper(ctx, b, squish[i] ?? 0)

        // aim preview
        const aiming = phase === 'aim' || phase === 'charge' || phase === 'drag'
        if (aiming) {
          const key = `${ball.x.toFixed(1)},${ball.y.toFixed(1)},${aim.toFixed(4)}`
          if (key !== previewKey) ((preview = previewPath(world, ball.x, ball.y, aim, T)), (previewKey = key))
          let along = 0
          for (let l = 0; l < preview.length - 1; l++) {
            const [ax, ay] = preview[l]
            const [bx, by] = preview[l + 1]
            const len = Math.hypot(bx - ax, by - ay)
            for (let d = l === 0 ? 26 : (16 - (along % 16)) % 16; d < len; d += 16) {
              const fade2 = l === 0 ? 1 : 1 - d / 150
              ctx.fillStyle = `rgba(255,255,255,${0.85 * fade2})`
              ctx.beginPath()
              ctx.arc(ax + ((bx - ax) * d) / len, ay + ((by - ay) * d) / len, l === 0 ? 3.2 : 2.6, 0, TAU)
              ctx.fill()
            }
            along += len
            if (l === 0 && preview.length > 2) {
              ctx.strokeStyle = 'rgba(255,255,255,0.75)'
              ctx.lineWidth = 2.5
              ctx.beginPath()
              ctx.arc(bx, by, T.ballR, 0, TAU)
              ctx.stroke()
            }
          }
          // arrow head
          ctx.save()
          ctx.translate(ball.x, ball.y)
          ctx.rotate(aim)
          ctx.fillStyle = '#ffffff'
          ctx.strokeStyle = C.ink
          ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.moveTo(34 + power * 18, 0)
          ctx.lineTo(20 + power * 18, -9)
          ctx.lineTo(20 + power * 18, 9)
          ctx.closePath()
          ctx.stroke()
          ctx.fill()
          ctx.restore()
          if (phase === 'drag' && drag) {
            // rubber band from the ball, backwards
            const bx = ball.x - Math.cos(aim) * (16 + power * 90)
            const by = ball.y - Math.sin(aim) * (16 + power * 90)
            ctx.strokeStyle = 'rgba(255,255,255,0.6)'
            ctx.lineWidth = 4
            ctx.setLineDash([6, 6])
            ctx.beginPath()
            ctx.moveTo(ball.x, ball.y)
            ctx.lineTo(bx, by)
            ctx.stroke()
            ctx.setLineDash([])
            ctx.fillStyle = 'rgba(255,255,255,0.75)'
            ctx.beginPath()
            ctx.arc(bx, by, 7, 0, TAU)
            ctx.fill()
          }
        }

        // flag (behind a rolling ball? it stands in the cup, ball passes in front)
        const [cx, cy] = h.cup
        const ballInCup = phase === 'sink' || (phase === 'fade' && phaseT < 0.35) || phase === 'final'
        drawFlag(ctx, cx, cy, t, holeIdx + 1, flagPop, flagPop > 0 ? Math.sin(flagPop * Math.PI) * 26 : 0)

        // ripples
        for (const r of ripples) {
          const k = r.t / r.life
          ctx.globalAlpha = 1 - k
          ctx.strokeStyle = r.color
          ctx.lineWidth = 4 * (1 - k) + 1
          ctx.beginPath()
          ctx.ellipse(r.x, r.y, 6 + r.max * k, (6 + r.max * k) * 0.85, 0, 0, TAU)
          ctx.stroke()
        }
        ctx.globalAlpha = 1

        // ball
        for (const p of trail) {
          ctx.globalAlpha = p.life * 2.5
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(p.x, p.y, T.ballR * 0.6, 0, TAU)
          ctx.fill()
        }
        ctx.globalAlpha = 1
        if (phase === 'sink') {
          const k = clamp(phaseT / 0.22, 0, 1)
          if (k < 1) {
            const e = k * k
            const x = ball.sx + (cx - ball.sx) * e
            const y = ball.sy + (cy - ball.sy) * e + e * 4
            ctx.save()
            ctx.beginPath()
            ctx.arc(cx, cy, T.cupR + T.ballR * (1 - e), 0, TAU)
            ctx.clip()
            drawBall(ctx, x, y, 1 - e * 0.35, k < 0.5)
            ctx.fillStyle = `rgba(0,20,10,${e * 0.7})`
            ctx.beginPath()
            ctx.arc(x, y, T.ballR, 0, TAU)
            ctx.fill()
            ctx.restore()
          }
        } else if (phase === 'splash') {
          // gone under
        } else if (!ballInCup && phase !== 'pickup') {
          const pop = phase === 'aim' && ripples.length ? 1 + Math.max(0, 0.3 - ripples[ripples.length - 1].t) : 1
          drawBall(ctx, ball.x, ball.y, pop)
        }
        if (h.windmill) drawWindmill(ctx, h.windmill, simT)
        fx.draw(ctx)

        // power meter
        if (phase === 'charge' || (phase === 'drag' && power > 0)) {
          const right = ball.x < W - 120
          const mx = ball.x + (right ? 40 : -58)
          const my = clamp(ball.y - 70, 120, H - 200)
          ctx.fillStyle = 'rgba(10,30,30,0.7)'
          ctx.beginPath()
          ctx.roundRect(mx - 4, my - 4, 26, 148, 9)
          ctx.fill()
          const fill = 140 * power
          const mg = ctx.createLinearGradient(0, my + 140, 0, my)
          mg.addColorStop(0, '#6be675')
          mg.addColorStop(0.6, '#ffd84a')
          mg.addColorStop(1, '#ff5a4f')
          ctx.fillStyle = mg
          ctx.beginPath()
          ctx.roundRect(mx, my + 140 - fill, 18, fill, 6)
          ctx.fill()
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'
          ctx.lineWidth = 2
          for (let i = 1; i < 4; i++) {
            ctx.beginPath()
            ctx.moveTo(mx, my + i * 35)
            ctx.lineTo(mx + 18, my + i * 35)
            ctx.stroke()
          }
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.roundRect(mx - 4, my - 4, 26, 148, 9)
          ctx.stroke()
        }
        ctx.restore()

        // ---- HUD --------------------------------------------------------------------------
        label(ctx, `Hole ${holeIdx + 1}`, 32, 44, { font: font(400, 40, 'Lilita One'), color: '#fff', edge: 8, edgeColor: C.ink, align: 'left' })
        label(ctx, `Par ${h.par} · ${h.name}`, 32, 86, { font: font(700, 24), color: '#d8f5dc', edge: 6, edgeColor: C.ink, align: 'left' })
        // scorecard
        const sx = 330
        const cw = 74
        ctx.fillStyle = 'rgba(0,20,25,0.35)'
        ctx.beginPath()
        ctx.roundRect(sx + 4, 22, cw * 7 + 16, 70, 12)
        ctx.fill()
        ctx.fillStyle = C.paper
        ctx.beginPath()
        ctx.roundRect(sx, 16, cw * 7 + 16, 70, 12)
        ctx.fill()
        for (let i = 0; i < 7; i++) {
          const x = sx + 8 + i * cw
          if (i === holeIdx && phase !== 'final') {
            ctx.fillStyle = '#ffe9a6'
            ctx.beginPath()
            ctx.roundRect(x + 2, 21, cw - 4, 60, 8)
            ctx.fill()
          }
          if (i > 0) {
            ctx.fillStyle = C.paperLine
            ctx.fillRect(x, 24, 2, 54)
          }
          const total = i === 6
          label(ctx, total ? 'Total' : `${i + 1}`, x + cw / 2, 33, { font: font(700, 15), color: '#8a7a5a' })
          let val = ''
          let col = C.ink
          if (total) {
            const n = card.reduce((a, b) => a + (b ?? 0), 0) + (phase === 'aim' || phase === 'charge' || phase === 'drag' || phase === 'roll' || phase === 'splash' ? strokes : 0)
            val = n ? String(n) : '–'
          } else if (card[i] !== undefined) {
            val = String(card[i])
            const d = card[i] - HOLES[i].par
            col = card[i] === 1 || d < 0 ? '#c0392b' : d === 0 ? C.ink : '#5b6b8a'
          } else if (i === holeIdx) val = strokes ? String(strokes) : '·'
          else val = '·'
          label(ctx, val, x + cw / 2, 62, { font: font(400, 32, 'Lilita One'), color: col })
          if (card[i] !== undefined && !total && (card[i] === 1 || card[i] < HOLES[i].par)) {
            ctx.strokeStyle = '#c0392b'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.arc(x + cw / 2, 61, 17, 0, TAU)
            ctx.stroke()
          }
        }
        // stroke counter
        label(ctx, 'Stroke', 1000, 34, { font: font(700, 22), color: '#d8f5dc', edge: 5, edgeColor: C.ink, align: 'left' })
        label(ctx, `${strokes}`, 1000, 72, { font: font(400, 44, 'Lilita One'), color: strokes >= cap() - 1 ? '#ffb3a8' : '#fff', edge: 8, edgeColor: C.ink, align: 'left' })
        label(ctx, `/ ${cap()}`, 1000 + ctx.measureText(`${strokes}`).width + 10, 76, { font: font(700, 22), color: 'rgba(255,255,255,0.6)', edge: 5, edgeColor: C.ink, align: 'left' })

        // hole intro card
        if (intro > 0 && phase !== 'fade') {
          const a = clamp(intro / 0.4, 0, 1) * clamp((T.introTime - intro) / 0.25, 0, 1)
          ctx.globalAlpha = a
          const y = 430 + (1 - a) * 12
          ctx.fillStyle = 'rgba(15,40,40,0.78)'
          ctx.beginPath()
          ctx.roundRect(W / 2 - 300, y - 62, 600, 124, 22)
          ctx.fill()
          label(ctx, `Hole ${holeIdx + 1}: ${h.name}`, W / 2, y - 22, { font: font(400, 44, 'Lilita One'), color: C.gold })
          label(ctx, h.tip, W / 2, y + 28, { font: font(700, 24), color: '#fff' })
          ctx.globalAlpha = 1
        }
        // pointer hint on the very first shot
        if (pointerMode() && phase === 'aim' && holeIdx === 0 && strokes === 0 && intro <= 0 && !hintShown) {
          label(ctx, 'Drag back, let go to putt', ball.x, ball.y + 56, { font: font(700, 24), color: '#fff', edge: 6, edgeColor: C.ink })
        }
        if (phase === 'roll' && holeIdx === 0) hintShown = true

        // result banner
        if (banner && (phase === 'sink' || phase === 'pickup')) {
          const k = clamp(banner.t / 0.3, 0, 1)
          const bounce = 1 + Math.sin(k * Math.PI) * 0.18
          ctx.save()
          ctx.translate(W / 2, 400)
          ctx.scale(bounce * k, bounce * k)
          label(ctx, banner.text, 0, 0, { font: font(400, 76, 'Lilita One'), color: banner.color, edge: 12, edgeColor: C.ink })
          ctx.restore()
          if (banner.t > 0.35) label(ctx, banner.sub, W / 2, 462, { font: font(700, 30), color: '#fff', edge: 7, edgeColor: C.ink })
        }
        if (phase === 'splash') {
          label(ctx, `Splash! +${T.waterPenalty} stroke`, W / 2, 400, { font: font(400, 56, 'Lilita One'), color: '#bfeeff', edge: 10, edgeColor: C.ink })
        }

        // final scorecard
        if (phase === 'final') {
          const a = clamp(phaseT / 0.4, 0, 1)
          ctx.fillStyle = `rgba(10,30,30,${0.55 * a})`
          ctx.fillRect(0, 0, W, H)
          const total = card.reduce((x, y) => x + (y ?? 0), 0)
          const d = total - HOLES.reduce((a, hh, i) => a + (card[i] === undefined ? 0 : hh.par), 0)
          ctx.globalAlpha = a
          ctx.fillStyle = C.paper
          ctx.beginPath()
          ctx.roundRect(W / 2 - 330, 250, 660, 300, 24)
          ctx.fill()
          label(ctx, 'Final card', W / 2, 300, { font: font(400, 48, 'Lilita One'), color: C.ink })
          for (let i = 0; i < 6; i++) {
            const x = W / 2 - 250 + i * 100
            label(ctx, `${i + 1}`, x, 356, { font: font(700, 20), color: '#8a7a5a' })
            label(ctx, card[i] === undefined ? '–' : String(card[i]), x, 396, { font: font(400, 40, 'Lilita One'), color: card[i] < HOLES[i].par ? '#c0392b' : C.ink })
          }
          label(ctx, `${total} strokes · ${d === 0 ? 'even par' : d > 0 ? `${d} over par` : `${-d} under par`}`, W / 2, 456, { font: font(700, 28), color: C.ink })
          label(ctx, `${run.score} points`, W / 2, 506, { font: font(400, 40, 'Lilita One'), color: '#2f8a46' })
          ctx.globalAlpha = 1
        }
        if (phase === 'fade') {
          const k = phaseT < 0.35 ? phaseT / 0.35 : 1 - (phaseT - 0.35) / 0.35
          ctx.fillStyle = `rgba(20,60,60,${clamp(k, 0, 1)})`
          ctx.fillRect(0, 0, W, H)
        }
      }
    }
    // test hook (headless screenshots): jump to a hole, or read where the ball is
    run.debug = { hole: (i) => loadHole(i), get: () => ({ phase, holeIdx, strokes, x: ball.x, y: ball.y, aim, card: [...card] }), setAim: (a) => (aim = a) }
    return run
  }
}
