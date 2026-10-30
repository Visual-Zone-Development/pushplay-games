// Shared look for Motion Lab: palette, text, rounded panels, medals, and the juice
// (particles, floating text, shake, flash, hit-stop) every station uses.
// The look is a glossy toy lab (STYLE.md): glossy plastic shapes lit from the upper left with
// three tones, a dark ink edge and a shine spot; moulded trays for panels; a lit blueprint
// backdrop; one vignette and grain pass over the finished frame (finish()).

export const W = 1280
export const H = 800

export const C = {
  bg: '#0f1630',
  grid: '#1a2550',
  gridHi: '#22306a',
  panel: '#18224a',
  panelHi: '#22306a',
  ink: '#eef2ff',
  quiet: '#9aa6d6',
  dark: '#0a0f22',
  orange: '#ff8a3d',
  teal: '#2ad1c9',
  pink: '#ff5c8a',
  lime: '#b6f04a',
  gold: '#ffd23f',
  violet: '#a98bff',
  red: '#ff4d5e',
  bronze: '#d98b4a',
  silver: '#c9d3ea'
}

export const MEDAL_COLORS = [null, C.bronze, C.silver, C.gold]
export const MEDAL_NAMES = ['No medal', 'Bronze', 'Silver', 'Gold']

// Bundled fonts (OFL, assets/CREDITS.md): Lilita One for display (weight 900 asks for it), Rubik
// for everything else. Text falls back to system-ui for the moment they take to load.
for (const [family, file, weight] of [['Lilita One', 'lilita-one', 400], ['Rubik', 'rubik-700', 700], ['Rubik', 'rubik-900', 900]]) {
  new FontFace(family, `url(${new URL(`./assets/fonts/${file}.woff2`, import.meta.url)})`, { weight: String(weight) }).load().then((f) => document.fonts.add(f), () => {})
}
let textScale = 1
export const setTextScale = (s) => (textScale = s || 1)
export const font = (weight, px) =>
  weight >= 900
    ? `400 ${Math.round(px * textScale * 1.04)}px "Lilita One", system-ui, sans-serif`
    : `${weight >= 800 ? 900 : 700} ${Math.round(px * textScale)}px Rubik, system-ui, sans-serif`

// ---- colour ----------------------------------------------------------------------------------

const hexRgb = (h) => {
  const n = parseInt(h.slice(1, 7), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}
const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)
export const rgba = (h, a) => `rgba(${hexRgb(h).join(',')},${a})`
export function mix(a, b, t) {
  const x = hexRgb(a)
  const y = hexRgb(b)
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')
}
/** amt < 0: shade toward a cool ink (shadows lean blue); amt > 0: light toward a warm white. */
export const shade = (h, amt) => (isHex(h) ? (amt < 0 ? mix(h, '#0b0f2e', -amt) : mix(h, '#fff7ea', amt)) : h)

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
export const lerp = (a, b, t) => a + (b - a) * t
export const rand = (a, b) => a + Math.random() * (b - a)
export const easeOut = (t) => 1 - (1 - t) ** 3
export const easeOutBack = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2

export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

const backdrops = new Map()
/** The lit blueprint under the grid: a soft pool of light up and to the left, baked once per colour. */
function backdrop(color) {
  if (backdrops.has(color)) return backdrops.get(color)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const base = isHex(color) ? color : C.bg
  const lin = g.createLinearGradient(0, 0, 0, H)
  lin.addColorStop(0, shade(base, 0.06))
  lin.addColorStop(1, shade(base, -0.35))
  g.fillStyle = lin
  g.fillRect(0, 0, W, H)
  const pool = g.createRadialGradient(W * 0.36, H * 0.18, 0, W * 0.36, H * 0.18, W * 0.75)
  pool.addColorStop(0, rgba(mix(base, '#5f7dff', 0.5), 0.28))
  pool.addColorStop(1, rgba(base, 0))
  g.fillStyle = pool
  g.fillRect(0, 0, W, H)
  backdrops.set(color, c)
  return c
}

/** Blueprint background: a lit navy sheet with a fine grid, brighter major lines and corner ticks. */
export function drawGrid(ctx, t = 0, color = C.bg) {
  ctx.drawImage(backdrop(color), 0, 0, W, H)
  const off = (t * 12) % 40
  const lines = (step, start, style, width) => {
    ctx.strokeStyle = style
    ctx.lineWidth = width
    ctx.beginPath()
    for (let x = start; x < W; x += step) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
    }
    for (let y = start; y < H; y += step) {
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
    }
    ctx.stroke()
  }
  lines(40, -off, 'rgba(120,150,255,0.09)', 1.5)
  lines(160, -off - (Math.floor(t * 12 / 40) % 4) * 40 + 160, 'rgba(140,170,255,0.16)', 2)
}

let grain = null
let vignetteGrad = null
/** The finishing pass over the whole frame: a vignette and fine grain glue every layer together. */
export function finish(ctx) {
  if (!vignetteGrad) {
    vignetteGrad = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.5, W / 2, H / 2, Math.hypot(W, H) * 0.6)
    vignetteGrad.addColorStop(0, 'rgba(4,6,20,0)')
    vignetteGrad.addColorStop(1, 'rgba(4,6,20,0.26)')
  }
  ctx.fillStyle = vignetteGrad
  ctx.fillRect(0, 0, W, H)
  if (!grain) {
    const c = document.createElement('canvas')
    c.width = c.height = 192
    const g = c.getContext('2d')
    const img = g.createImageData(192, 192)
    let a = 7
    for (let i = 0; i < img.data.length; i += 4) {
      a = (a * 16807) % 2147483647
      const v = 128 + ((a / 2147483647) - 0.5) * 70
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    g.putImageData(img, 0, 0)
    grain = ctx.createPattern(c, 'repeat')
  }
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = 0.12
  ctx.fillStyle = grain
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
}

/**
 * A glossy plastic ball lit from the upper left: three tones, an ink edge and a shine spot. The
 * workhorse for marbles, fruit, notes, dots and buttons.
 */
export function gloss(ctx, x, y, r, color, { edge = Math.max(2, r * 0.14), shine = 1 } = {}) {
  ctx.beginPath()
  ctx.arc(x, y, r + edge / 2, 0, Math.PI * 2)
  ctx.fillStyle = C.dark
  ctx.fill()
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r)
  g.addColorStop(0, shade(color, 0.35))
  g.addColorStop(0.55, color)
  g.addColorStop(1, shade(color, -0.4))
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
  if (shine) {
    ctx.fillStyle = `rgba(255,255,255,${0.75 * shine})`
    ctx.beginPath()
    ctx.ellipse(x - r * 0.38, y - r * 0.42, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Fill the current path as glossy plastic: a lit-to-shaded gradient over its bounding box. */
export function glossFill(ctx, color, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h)
  g.addColorStop(0, shade(color, 0.3))
  g.addColorStop(0.5, color)
  g.addColorStop(1, shade(color, -0.35))
  ctx.fillStyle = g
  ctx.fill()
}

/** A soft dark shadow under something standing on a surface. */
export function groundShadow(ctx, x, y, rx, ry, a = 0.35) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx)
  g.addColorStop(0, `rgba(4,6,20,${a})`)
  g.addColorStop(1, 'rgba(4,6,20,0)')
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, ry / rx)
  ctx.translate(-x, -y)
  ctx.fillStyle = g
  ctx.fillRect(x - rx, y - rx, rx * 2, rx * 2)
  ctx.restore()
}

/**
 * A moulded plastic tray: a soft drop shadow, the ink edge, a body lit from the top, a bright lip
 * along the top edge and a darker one along the bottom. `flat` keeps the old single fill.
 */
export function panel(ctx, x, y, w, h, { fill = C.panel, stroke = C.dark, r = 22, lw = 5, flat = false, shadow = true } = {}) {
  if (flat || !isHex(fill)) {
    rrect(ctx, x, y, w, h, r)
    ctx.fillStyle = fill
    ctx.fill()
    if (lw) {
      ctx.lineWidth = lw
      ctx.strokeStyle = stroke
      ctx.stroke()
    }
    return
  }
  if (shadow) {
    rrect(ctx, x + 2, y + 8, w, h, r)
    ctx.fillStyle = 'rgba(3,5,18,0.38)'
    ctx.fill()
  }
  rrect(ctx, x, y, w, h, r)
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, shade(fill, 0.1))
  g.addColorStop(0.35, fill)
  g.addColorStop(1, shade(fill, -0.22))
  ctx.fillStyle = g
  ctx.fill()
  if (lw) {
    ctx.lineWidth = lw
    ctx.strokeStyle = stroke
    ctx.stroke()
  }
  const inset = Math.max(2, lw / 2) + 1.5
  ctx.save()
  rrect(ctx, x, y, w, h, r)
  ctx.clip()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  rrect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2 + 6, Math.max(2, r - inset))
  ctx.stroke()
  ctx.strokeStyle = 'rgba(3,5,18,0.25)'
  rrect(ctx, x + inset, y + inset - 6, w - inset * 2, h - inset * 2 + 6, Math.max(2, r - inset))
  ctx.stroke()
  ctx.restore()
}

export function text(ctx, str, x, y, { size = 28, weight = 700, color = C.ink, align = 'center', base = 'middle', outline = 0, outlineColor = C.dark } = {}) {
  ctx.font = font(weight, size)
  ctx.textAlign = align
  ctx.textBaseline = base
  if (outline) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = outline
    ctx.strokeStyle = outlineColor
    ctx.strokeText(str, x, y)
  }
  ctx.fillStyle = color
  ctx.fillText(str, x, y)
}

/** A medal disc; level 0 draws an empty slot. */
export function drawMedal(ctx, x, y, r, level) {
  if (r <= 0) return
  ctx.save()
  if (level) gloss(ctx, x, y, r, MEDAL_COLORS[level], { edge: Math.max(2, r * 0.18), shine: 0.8 })
  else {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(3,5,18,0.35)'
    ctx.fill()
    ctx.lineWidth = Math.max(2, r * 0.14)
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.stroke()
  }
  if (level) {
    // A star, and pips for the level so it isn't colour alone.
    star(ctx, x, y - r * 0.08, r * 0.5, r * 0.22, 5)
    ctx.fillStyle = 'rgba(10,15,34,0.55)'
    ctx.fill()
    for (let i = 0; i < level; i++) {
      ctx.beginPath()
      ctx.arc(x + (i - (level - 1) / 2) * r * 0.32, y + r * 0.62, r * 0.1, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

export function star(ctx, x, y, r1, r2, n) {
  ctx.beginPath()
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 ? r2 : r1
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  ctx.closePath()
}

/** A fat arrow pointing dir ('left' | 'right' | 'up' | 'down'), centred on x, y. */
export function arrow(ctx, x, y, s, dir, fill = C.ink, stroke = C.dark) {
  const a = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir] ?? 0
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(a)
  ctx.beginPath()
  ctx.moveTo(s * 0.55, 0)
  ctx.lineTo(0, -s * 0.5)
  ctx.lineTo(0, -s * 0.2)
  ctx.lineTo(-s * 0.5, -s * 0.2)
  ctx.lineTo(-s * 0.5, s * 0.2)
  ctx.lineTo(0, s * 0.2)
  ctx.lineTo(0, s * 0.5)
  ctx.closePath()
  ctx.lineJoin = 'round'
  ctx.lineWidth = s * 0.16
  ctx.strokeStyle = stroke
  ctx.stroke()
  ctx.rotate(-a) // light the fill from the world's upper left, whichever way it points
  glossFill(ctx, isHex(fill) ? fill : C.ink, -s * 0.5, -s * 0.5, s, s)
  ctx.restore()
}

/** A chunky phone glyph, used for icons and the bench. */
export function phoneGlyph(ctx, x, y, w, h, { body = C.ink, screen = C.teal, rot = 0 } = {}) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  rrect(ctx, -w / 2, -h / 2, w, h, w * 0.18)
  ctx.lineWidth = Math.max(3, w * 0.07)
  ctx.strokeStyle = C.dark
  ctx.stroke()
  glossFill(ctx, isHex(body) ? body : C.ink, -w / 2, -h / 2, w, h)
  // a lit rim along the left edge, like moulded plastic
  ctx.save()
  ctx.clip()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(-w / 2, -h / 2, w * 0.06, h)
  ctx.restore()
  const sx = -w / 2 + w * 0.12
  const sy = -h / 2 + h * 0.1
  const sw = w * 0.76
  const sh = h * 0.76
  rrect(ctx, sx, sy, sw, sh, w * 0.08)
  const sg = ctx.createLinearGradient(0, sy, 0, sy + sh)
  sg.addColorStop(0, isHex(screen) ? shade(screen, 0.2) : screen)
  sg.addColorStop(1, isHex(screen) ? shade(screen, -0.3) : screen)
  ctx.fillStyle = sg
  ctx.fill()
  // glass glare across the screen
  ctx.save()
  ctx.clip()
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.beginPath()
  ctx.moveTo(sx, sy + sh * 0.35)
  ctx.lineTo(sx + sw, sy)
  ctx.lineTo(sx + sw, sy + sh * 0.18)
  ctx.lineTo(sx, sy + sh * 0.55)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.restore()
}

const MAX_PARTICLES = 300

/** Particles, floating text, shake, flash and hit-stop; everything honours reduced shake. */
export function createFx(settings) {
  const fx = {
    parts: [],
    texts: [],
    shake: 0,
    flash: 0,
    flashColor: '#fff',
    stop: 0,
    reset() {
      fx.parts.length = 0
      fx.texts.length = 0
      fx.shake = fx.flash = fx.stop = 0
    },
    burst(x, y, color, n = 16, speed = 360, { size = 7, life = 0.7, gravity = 900, spread = Math.PI * 2, angle = 0, shape = 'square' } = {}) {
      for (let i = 0; i < n && fx.parts.length < MAX_PARTICLES; i++) {
        const a = angle + (Math.random() - 0.5) * spread
        const v = speed * (0.35 + Math.random() * 0.65)
        fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: size * (0.6 + Math.random() * 0.8), color, gravity, rot: Math.random() * 6, vr: rand(-8, 8), shape })
      }
    },
    float(x, y, str, color = C.ink, size = 36) {
      fx.texts.push({ x, y, str, color, size, life: 0.9, max: 0.9 })
    },
    kick(amount) {
      if (!settings.data.reducedShake) fx.shake = Math.max(fx.shake, amount)
    },
    blink(amount = 0.35, color = '#fff') {
      if (settings.data.reducedShake) return
      fx.flash = Math.max(fx.flash, amount)
      fx.flashColor = color
    },
    hitstop(s) {
      fx.stop = Math.max(fx.stop, s)
    },
    update(dt) {
      fx.shake = Math.max(0, fx.shake - dt * 60)
      fx.flash = Math.max(0, fx.flash - dt * 2.5)
      for (let i = fx.parts.length - 1; i >= 0; i--) {
        const p = fx.parts[i]
        p.life -= dt
        if (p.life <= 0) {
          fx.parts.splice(i, 1)
          continue
        }
        p.vy += p.gravity * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.rot += p.vr * dt
      }
      for (let i = fx.texts.length - 1; i >= 0; i--) {
        const t = fx.texts[i]
        t.life -= dt
        t.y -= 70 * dt
        if (t.life <= 0) fx.texts.splice(i, 1)
      }
    },
    /** Call after ctx.save(): offsets the frame by the current shake. */
    applyShake(ctx) {
      if (fx.shake > 0) ctx.translate(rand(-fx.shake, fx.shake), rand(-fx.shake, fx.shake))
    },
    draw(ctx) {
      for (const p of fx.parts) {
        ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.5)
        ctx.fillStyle = p.color
        if (p.shape === 'circle') {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = 'rgba(255,255,255,0.45)'
          ctx.beginPath()
          ctx.arc(p.x - p.size * 0.15, p.y - p.size * 0.15, p.size * 0.16, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot)
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * (p.shape === 'feather' ? 0.45 : 1))
          ctx.restore()
        }
      }
      ctx.globalAlpha = 1
      for (const t of fx.texts) {
        ctx.globalAlpha = Math.min(1, (t.life / t.max) * 2)
        const pop = 1 + Math.max(0, t.life - t.max + 0.15) * 3
        text(ctx, t.str, t.x, t.y, { size: t.size * pop, weight: 900, color: t.color, outline: 8 })
      }
      ctx.globalAlpha = 1
    },
    drawFlash(ctx) {
      if (fx.flash <= 0) return
      ctx.globalAlpha = fx.flash
      ctx.fillStyle = fx.flashColor
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
    }
  }
  return fx
}
