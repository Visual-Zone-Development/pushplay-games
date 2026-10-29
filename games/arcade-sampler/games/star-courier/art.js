// Star Courier's look, drawn in code. One light from the upper left, three tones per shape
// (base, shade, highlight), a dark ink edge for the silhouette and a cool rim from the nebula behind.
// game.js blits cached sprites baked at 2×; art/cover.html, art/hero.html and art/gallery.html call
// the same functions at any size, so the library art is always the game's own art.

export const TAU = Math.PI * 2

export const PAL = {
  space: '#0b1024',
  deep: '#05070f',
  ink: '#070a18',
  violet: '#4a2f8a',
  plum: '#7a2e6e',
  teal: '#16708f',
  ship: '#5cc8ff', // the hero colour: the most saturated thing on screen
  shipDark: '#1f6fb0',
  shipLight: '#d2f3ff',
  hull: '#eef2f8',
  hullDark: '#7d88a3',
  glass: '#141c38',
  amber: '#ffb547', // parcels and anything worth grabbing
  amberDark: '#b8661c',
  amberLight: '#ffe4a8',
  rock: '#6d6a80',
  danger: '#ff7a6b',
  text: '#eef0f5'
}

// ---- colour helpers --------------------------------------------------------------------------

export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const hex = (h) => {
  const n = parseInt(h.slice(1), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
export const rgba = (h, a) => `rgba(${hex(h).join(',')},${a})`
/** Mix two colours, t = 0 → a, 1 → b. */
export const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t))
/** amt < 0 darkens toward a cool ink (shadows lean blue), amt > 0 lightens toward a warm white. */
export const shade = (h, amt) => (amt < 0 ? mix(h, '#0a0c24', -amt) : mix(h, '#fff6e6', amt))
/** A small random nudge to a colour, so repeated things don't look stamped. */
export const vary = (h, amt, q = Math.random) => shade(h, (q() * 2 - 1) * amt)

// ---- sprites ---------------------------------------------------------------------------------

/** Draw once into an offscreen canvas at `scale`× (2 keeps it crisp at DPR 2), centred on the origin. */
export function bake(w, h, draw, scale = 2) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w * scale)
  canvas.height = Math.ceil(h * scale)
  const g = canvas.getContext('2d')
  g.scale(scale, scale)
  g.translate(w / 2, h / 2)
  draw(g)
  return { canvas, w, h }
}
export function blit(ctx, s, x, y, angle = 0, scale = 1) {
  ctx.save()
  ctx.translate(x, y)
  if (angle) ctx.rotate(angle)
  ctx.drawImage(s.canvas, (-s.w / 2) * scale, (-s.h / 2) * scale, s.w * scale, s.h * scale)
  ctx.restore()
}
const poly = (g, pts) => {
  g.beginPath()
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.closePath()
}

// ---- the courier ship (points along +x, about 66 × 50 units) -----------------------------------

const WING = [[6, -9], [-12, -25], [-25, -25], [-19, -8]]
const flipY = (pts) => pts.map(([x, y]) => [x, -y])

function hullPath(g) {
  g.beginPath()
  g.moveTo(34, 0)
  g.quadraticCurveTo(26, -11, 6, -11)
  g.lineTo(-24, -9)
  g.lineTo(-28, 0)
  g.lineTo(-24, 9)
  g.lineTo(6, 11)
  g.quadraticCurveTo(26, 11, 34, 0)
  g.closePath()
}

/** The ship in its own space: nose at +x, light from the upper left of the sprite. */
export function drawShip(g) {
  g.save()
  g.lineJoin = 'round'
  // ink silhouette first, so the ship separates from any background
  g.fillStyle = PAL.ink
  g.strokeStyle = PAL.ink
  g.lineWidth = 4
  for (const w of [WING, flipY(WING)]) {
    poly(g, w)
    g.fill()
    g.stroke()
  }
  hullPath(g)
  g.fill()
  g.stroke()
  // nozzles
  g.fillStyle = '#2a3150'
  g.fillRect(-31, -8, 7, 5)
  g.fillRect(-31, 3, 7, 5)
  g.fillStyle = '#4a5578'
  g.fillRect(-31, -8, 7, 1.5)
  g.fillRect(-31, 3, 7, 1.5)
  // wings: the upper one faces the light, the lower one is in shade
  const wing = (pts, base, edge) => {
    poly(g, pts)
    const gr = g.createLinearGradient(0, -25, 0, 25)
    gr.addColorStop(0, shade(base, 0.25))
    gr.addColorStop(1, shade(base, -0.25))
    g.fillStyle = gr
    g.fill()
    g.strokeStyle = edge
    g.lineWidth = 1.4
    g.beginPath()
    g.moveTo(pts[0][0], pts[0][1])
    g.lineTo(pts[1][0], pts[1][1])
    g.stroke()
  }
  wing(WING, PAL.ship, rgba(PAL.shipLight, 0.9))
  wing(flipY(WING), PAL.shipDark, rgba(PAL.ship, 0.5))
  // wingtip lights
  g.fillStyle = PAL.amberLight
  g.fillRect(-24, -26, 6, 2.5)
  g.fillStyle = PAL.danger
  g.fillRect(-24, 23.5, 6, 2.5)
  // hull: lit top, shaded belly
  hullPath(g)
  const hg = g.createLinearGradient(0, -11, 0, 11)
  hg.addColorStop(0, PAL.hull)
  hg.addColorStop(0.45, shade(PAL.hull, -0.12))
  hg.addColorStop(1, PAL.hullDark)
  g.fillStyle = hg
  g.fill()
  g.save()
  hullPath(g)
  g.clip()
  // cyan spine stripe so the hull reads as "ours" even at 30 px
  g.fillStyle = PAL.ship
  g.fillRect(-26, -3.2, 52, 3)
  g.fillStyle = shade(PAL.ship, -0.3)
  g.fillRect(-26, -0.2, 52, 1.2)
  // cool rim light along the belly, from the nebula behind
  g.strokeStyle = rgba('#7fe3ff', 0.55)
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(-24, 9.5)
  g.lineTo(6, 11.5)
  g.quadraticCurveTo(26, 11.5, 34, 0.5)
  g.stroke()
  g.restore()
  // top highlight edge
  g.strokeStyle = 'rgba(255,255,255,0.9)'
  g.lineWidth = 1.2
  g.beginPath()
  g.moveTo(31, -3)
  g.quadraticCurveTo(25, -10, 6, -10)
  g.lineTo(-20, -8.2)
  g.stroke()
  // cargo pod: the parcel colour, because this is a courier
  g.fillStyle = PAL.ink
  g.beginPath()
  g.roundRect(-21, -7.5, 21, 15, 3)
  g.fill()
  const cg = g.createLinearGradient(0, -6.5, 0, 6.5)
  cg.addColorStop(0, PAL.amberLight)
  cg.addColorStop(0.5, PAL.amber)
  cg.addColorStop(1, PAL.amberDark)
  g.fillStyle = cg
  g.beginPath()
  g.roundRect(-20, -6.5, 19, 13, 2.5)
  g.fill()
  g.fillStyle = rgba(PAL.amberDark, 0.9)
  g.fillRect(-12, -6.5, 3, 13)
  // cockpit: smoked glass with a specular glint toward the light
  g.fillStyle = PAL.ink
  g.beginPath()
  g.ellipse(16, -1, 10, 6, 0, 0, TAU)
  g.fill()
  const gg = g.createRadialGradient(13, -4, 1, 16, -1, 10)
  gg.addColorStop(0, '#3d5a9e')
  gg.addColorStop(1, PAL.glass)
  g.fillStyle = gg
  g.beginPath()
  g.ellipse(16, -1, 8.6, 4.8, 0, 0, TAU)
  g.fill()
  g.fillStyle = 'rgba(255,255,255,0.85)'
  g.beginPath()
  g.ellipse(13.5, -3.4, 3.4, 1.3, -0.25, 0, TAU)
  g.fill()
  g.restore()
}

/** Engine flame behind the nozzles, additive. `k` 0..1 is thrust, `t` is time for the flicker. */
export function drawFlame(g, k, t = 0) {
  if (k <= 0) return
  g.save()
  g.globalCompositeOperation = 'lighter'
  const flick = 0.85 + 0.15 * Math.sin(t * 61) + 0.08 * Math.sin(t * 37)
  const len = (14 + 26 * k) * flick
  for (const y of [-5.5, 5.5]) {
    const glow = g.createRadialGradient(-30, y, 0, -30, y, len * 0.9)
    glow.addColorStop(0, rgba(PAL.amber, 0.55))
    glow.addColorStop(1, rgba(PAL.amber, 0))
    g.fillStyle = glow
    g.fillRect(-30 - len, y - len, len * 2, len * 2)
    g.fillStyle = rgba(PAL.amberLight, 0.9)
    g.beginPath()
    g.moveTo(-30, y - 3)
    g.quadraticCurveTo(-30 - len * 0.6, y - 1.2, -30 - len, y)
    g.quadraticCurveTo(-30 - len * 0.6, y + 1.2, -30, y + 3)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,0.9)'
    g.beginPath()
    g.moveTo(-30, y - 1.4)
    g.lineTo(-30 - len * 0.45, y)
    g.lineTo(-30, y + 1.4)
    g.fill()
  }
  g.restore()
}

export const SHIP_W = 72
export const SHIP_H = 56
export const bakeShip = () => bake(SHIP_W, SHIP_H, drawShip, 3)

// ---- asteroids -------------------------------------------------------------------------------

/** A rock shape at unit radius: an irregular polygon plus craters, both from a seed. */
export function rockShape(seed) {
  const q = rng(seed)
  const n = 10 + Math.floor(q() * 4)
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (q() - 0.5) * 0.35
    const r = 0.78 + q() * 0.22
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  const craters = Array.from({ length: 3 + Math.floor(q() * 3) }, () => {
    const a = q() * TAU
    const d = q() * 0.55
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.09 + q() * 0.16 }
  })
  return { pts, craters, base: vary(PAL.rock, 0.12, q), seed }
}

/** The rock's surface (it turns with the rock): faceted greys, craters, an ink edge. */
function drawRockAlbedo(g, shape, r) {
  const q = rng(shape.seed * 7 + 1)
  const pts = shape.pts.map(([x, y]) => [x * r, y * r])
  g.lineJoin = 'round'
  poly(g, pts)
  g.fillStyle = PAL.ink
  g.strokeStyle = PAL.ink
  g.lineWidth = Math.max(2, r * 0.09)
  g.fill()
  g.stroke()
  // facets: a fan of triangles, each a slightly different grey
  const cx = (q() - 0.5) * r * 0.3
  const cy = (q() - 0.5) * r * 0.3
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(a[0], a[1])
    g.lineTo(b[0], b[1])
    g.closePath()
    g.fillStyle = vary(shape.base, 0.09, q)
    g.fill()
  }
  for (const c of shape.craters) {
    const x = c.x * r
    const y = c.y * r
    const cr = c.r * r
    g.fillStyle = shade(shape.base, -0.3)
    g.beginPath()
    g.ellipse(x, y, cr, cr * 0.85, 0, 0, TAU)
    g.fill()
    g.strokeStyle = rgba('#ffffff', 0.16)
    g.lineWidth = Math.max(1, cr * 0.22)
    g.beginPath()
    g.ellipse(x + cr * 0.12, y + cr * 0.12, cr * 0.95, cr * 0.8, 0, 0.2, Math.PI - 0.2)
    g.stroke()
  }
}

export const ROCK_R = 44
/** Bake `n` rock variants at the largest rock radius; smaller rocks are drawn scaled down. */
export function bakeRocks(n = 6, seed = 11) {
  return Array.from({ length: n }, (_, i) => {
    const shape = rockShape(seed + i * 101)
    const s = bake(ROCK_R * 2 + 8, ROCK_R * 2 + 8, (g) => drawRockAlbedo(g, shape, ROCK_R), 2)
    return { ...s, shape }
  })
}

/**
 * Draw a rock at radius `r` turned by `angle`. Its surface turns, but the light doesn't: the
 * shading and the warm upper-left rim are drawn unrotated, clipped to the rock's outline.
 */
export function drawRock(ctx, rock, x, y, r, angle) {
  const k = r / ROCK_R
  ctx.save()
  ctx.translate(x, y)
  ctx.save()
  ctx.rotate(angle)
  ctx.drawImage(rock.canvas, (-rock.w / 2) * k, (-rock.h / 2) * k, rock.w * k, rock.h * k)
  ctx.beginPath()
  rock.shape.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px * r, py * r) : ctx.moveTo(px * r, py * r)))
  ctx.closePath()
  ctx.restore() // back to unrotated; the path stays where it was built
  ctx.save()
  ctx.clip()
  ctx.scale(r, r)
  ctx.fillStyle = rockLight(ctx)
  ctx.fillRect(-1.1, -1.1, 2.2, 2.2)
  ctx.restore()
  ctx.lineWidth = Math.max(2, r * 0.1)
  ctx.strokeStyle = rockRim(ctx, r)
  ctx.save()
  ctx.clip()
  ctx.stroke()
  ctx.restore()
  ctx.restore()
}
const lightGrads = new WeakMap() // one per context: gradients belong to the context that made them
function rockLight(c) {
  if (lightGrads.has(c)) return lightGrads.get(c)
  const g = c.createRadialGradient(-0.45, -0.5, 0, -0.2, -0.2, 1.35)
  g.addColorStop(0, 'rgba(255,238,214,0.38)')
  g.addColorStop(0.35, 'rgba(255,238,214,0)')
  g.addColorStop(0.7, 'rgba(8,8,32,0.4)')
  g.addColorStop(1, 'rgba(4,4,20,0.78)')
  lightGrads.set(c, g)
  return g
}
function rockRim(ctx, r) {
  const g = ctx.createLinearGradient(-r, -r, r * 0.2, r * 0.2)
  g.addColorStop(0, 'rgba(255,236,205,0.75)')
  g.addColorStop(1, 'rgba(255,236,205,0)')
  return g
}

// ---- parcels ---------------------------------------------------------------------------------

/** A crate seen from slightly above: lit top, front face, shaded side, a strap and a cyan tag. */
export function drawParcel(g) {
  g.save()
  g.lineJoin = 'round'
  const top = [[-15, -8], [-7, -16], [17, -16], [9, -8]]
  const front = [[-15, -8], [9, -8], [9, 14], [-15, 14]]
  const side = [[9, -8], [17, -16], [17, 6], [9, 14]]
  g.fillStyle = PAL.ink
  g.strokeStyle = PAL.ink
  g.lineWidth = 3.5
  poly(g, [[-15, -8], [-7, -16], [17, -16], [17, 6], [9, 14], [-15, 14]])
  g.fill()
  g.stroke()
  poly(g, top)
  g.fillStyle = PAL.amberLight
  g.fill()
  poly(g, front)
  const fg = g.createLinearGradient(0, -8, 0, 14)
  fg.addColorStop(0, PAL.amber)
  fg.addColorStop(1, shade(PAL.amber, -0.18))
  g.fillStyle = fg
  g.fill()
  poly(g, side)
  g.fillStyle = PAL.amberDark
  g.fill()
  // strap over all three faces
  g.fillStyle = rgba('#7a4a10', 0.85)
  poly(g, [[-5, -8], [1, -8], [1, 14], [-5, 14]])
  g.fill()
  poly(g, [[-5, -8], [3, -16], [9, -16], [1, -8]])
  g.fillStyle = rgba('#7a4a10', 0.6)
  g.fill()
  // courier tag
  g.fillStyle = PAL.ship
  g.fillRect(-13, 5, 6, 6)
  g.fillStyle = 'rgba(255,255,255,0.8)'
  g.fillRect(-13, 5, 6, 1.5)
  // highlight edge on the lit top
  g.strokeStyle = 'rgba(255,255,255,0.9)'
  g.lineWidth = 1.2
  g.beginPath()
  g.moveTo(-15, -8)
  g.lineTo(-7, -16)
  g.lineTo(17, -16)
  g.stroke()
  g.restore()
}
export const bakeParcel = () => bake(40, 38, drawParcel, 3)

/** A soft additive halo; tinted, it serves parcels, sparks and engine glow. */
export function bakeGlow(color, r = 32) {
  return bake(r * 2, r * 2, (g) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r)
    gr.addColorStop(0, rgba(color, 0.7))
    gr.addColorStop(0.35, rgba(color, 0.25))
    gr.addColorStop(1, rgba(color, 0))
    g.fillStyle = gr
    g.fillRect(-r, -r, r * 2, r * 2)
  }, 1)
}

// ---- the planet and the backdrop -------------------------------------------------------------

/** A ringed planet lit from the upper left, with an atmosphere rim. `haze` mixes it into space. */
export function drawPlanet(g, x, y, r, { haze = 0, ring = true } = {}) {
  const tone = (c) => mix(c, PAL.space, haze)
  g.save()
  g.translate(x, y)
  const ringPath = (front) => {
    g.beginPath()
    g.ellipse(0, 0, r * 1.9, r * 0.42, -0.32, front ? 0 : Math.PI, front ? Math.PI : TAU)
  }
  if (ring) {
    g.strokeStyle = rgba(tone('#9fb6ff'), 0.45)
    g.lineWidth = r * 0.16
    ringPath(false)
    g.stroke()
  }
  const body = g.createRadialGradient(-r * 0.45, -r * 0.5, r * 0.1, 0, 0, r * 1.05)
  body.addColorStop(0, tone('#6f8dff'))
  body.addColorStop(0.45, tone('#2e4fd6'))
  body.addColorStop(1, tone('#0f1a5a'))
  g.fillStyle = body
  g.beginPath()
  g.arc(0, 0, r, 0, TAU)
  g.fill()
  // cloud bands
  g.save()
  g.beginPath()
  g.arc(0, 0, r, 0, TAU)
  g.clip()
  g.globalAlpha = 0.1
  g.fillStyle = tone('#cfe0ff')
  for (const [by, bh] of [[-0.5, 0.06], [-0.18, 0.1], [0.3, 0.05], [0.55, 0.08]]) {
    g.beginPath()
    g.ellipse(0, by * r, r * 1.2, bh * r, 0.12, 0, TAU)
    g.fill()
  }
  g.globalAlpha = 1
  // night side
  const night = g.createLinearGradient(-r, -r, r, r)
  night.addColorStop(0.45, 'rgba(5,7,24,0)')
  night.addColorStop(1, 'rgba(5,7,24,0.75)')
  g.fillStyle = night
  g.fillRect(-r, -r, r * 2, r * 2)
  g.restore()
  // atmosphere rim on the lit edge
  g.strokeStyle = rgba(tone('#8fe6ff'), 0.7)
  g.lineWidth = Math.max(1.5, r * 0.05)
  g.beginPath()
  g.arc(0, 0, r - g.lineWidth / 2, Math.PI * 0.85, Math.PI * 1.75)
  g.stroke()
  if (ring) {
    g.strokeStyle = rgba(tone('#c4d2ff'), 0.6)
    g.lineWidth = r * 0.16
    ringPath(true)
    g.stroke()
  }
  g.restore()
}

/** Nebula, dust and far stars: drawn once, the darkest and least saturated layer. */
export function drawBackdrop(g, w, h, { seed = 7, planet = true } = {}) {
  const q = rng(seed)
  const base = g.createLinearGradient(0, 0, 0, h)
  base.addColorStop(0, '#0e1533')
  base.addColorStop(1, '#060917')
  g.fillStyle = base
  g.fillRect(0, 0, w, h)
  const s = Math.max(w, h) / 1280
  const cloud = (x, y, r, col, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, rgba(col, a))
    gr.addColorStop(1, rgba(col, 0))
    g.fillStyle = gr
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  cloud(w * 0.22, h * 0.25, 620 * s, PAL.violet, 0.42)
  cloud(w * 0.85, h * 0.8, 560 * s, PAL.teal, 0.32)
  cloud(w * 0.7, h * 0.12, 380 * s, PAL.plum, 0.22)
  // wisps along two lazy curves, then dark dust lanes through them
  const river = (x0, y0, x1, y1, bend, col, n) => {
    for (let i = 0; i < n; i++) {
      const t = q()
      const x = x0 + (x1 - x0) * t + (q() - 0.5) * 160 * s
      const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * bend + (q() - 0.5) * 120 * s
      cloud(x, y, (30 + q() * 90) * s, col, 0.04 + q() * 0.07)
    }
  }
  river(-0.1 * w, 0.75 * h, 1.1 * w, 0.2 * h, -0.15 * h, '#7f6bd6', 90)
  river(0.1 * w, 0.95 * h, 1.1 * w, 0.55 * h, 0.1 * h, '#3aa6c4', 70)
  for (let i = 0; i < 40; i++) cloud(q() * w, q() * h, (40 + q() * 120) * s, PAL.deep, 0.12 + q() * 0.12)
  // far stars, a few with a soft glint
  for (let i = 0; i < 260 * (w * h) / (1280 * 800); i++) {
    const x = q() * w
    const y = q() * h
    const m = q()
    g.fillStyle = rgba(m > 0.8 ? '#ffe9c4' : m > 0.6 ? '#bfe6ff' : '#ffffff', 0.25 + m * 0.5)
    g.fillRect(x, y, 0.8 + m * 1.2, 0.8 + m * 1.2)
    if (m > 0.97) {
      g.strokeStyle = rgba('#ffffff', 0.35)
      g.lineWidth = 0.8
      g.beginPath()
      g.moveTo(x - 6, y + 0.5)
      g.lineTo(x + 7, y + 0.5)
      g.moveTo(x + 0.5, y - 6)
      g.lineTo(x + 0.5, y + 7)
      g.stroke()
    }
  }
  if (planet) drawPlanet(g, w * 0.88, h * 0.84, 78 * s, { haze: 0.35 })
}

/** Darken the corners, so the eye stays on the middle of the screen. */
export function drawVignette(g, w, h, a = 0.55) {
  const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.hypot(w, h) * 0.6)
  gr.addColorStop(0, 'rgba(3,4,12,0)')
  gr.addColorStop(1, `rgba(3,4,12,${a})`)
  g.fillStyle = gr
  g.fillRect(0, 0, w, h)
}

// ---- for the art pages ------------------------------------------------------------------------

/** The ship at any size with its flame and a fading exhaust trail behind it. */
export function drawShipScene(g, x, y, angle, scale, { burn = 0.8, trail = 1, t = 0.3 } = {}) {
  g.save()
  g.translate(x, y)
  g.rotate(angle)
  g.scale(scale, scale)
  g.save()
  g.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 16; i++) {
    const k = i / 16
    const px = -36 - k * 150 * trail
    const r = 7 + k * 16
    const gr = g.createRadialGradient(px, 0, 0, px, 0, r)
    gr.addColorStop(0, rgba(PAL.amber, 0.32 * (1 - k)))
    gr.addColorStop(1, rgba(PAL.amber, 0))
    g.fillStyle = gr
    g.fillRect(px - r, -r, r * 2, r * 2)
  }
  g.restore()
  drawFlame(g, burn, t)
  drawShip(g)
  g.restore()
}

/** A parcel at any size with its halo. */
export function drawParcelScene(g, x, y, scale, angle = 0) {
  g.save()
  g.translate(x, y)
  g.save()
  g.globalCompositeOperation = 'lighter'
  const r = 46 * scale
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, r)
  gr.addColorStop(0, rgba(PAL.amber, 0.5))
  gr.addColorStop(0.4, rgba(PAL.amber, 0.18))
  gr.addColorStop(1, rgba(PAL.amber, 0))
  g.fillStyle = gr
  g.fillRect(-r, -r, r * 2, r * 2)
  g.restore()
  g.rotate(angle)
  g.scale(scale, scale)
  drawParcel(g)
  g.restore()
}
