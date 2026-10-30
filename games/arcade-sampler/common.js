// Small helpers every game in the sampler can use. Each game keeps its own look; these are just
// the plumbing (maths, text with an edge, particles, medals).

export const W = 1280
export const H = 800
export const TAU = Math.PI * 2
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
export const lerp = (a, b, t) => a + (b - a) * t
export const rand = (a, b) => a + Math.random() * (b - a)
export const pick = (list) => list[Math.floor(Math.random() * list.length)]
/** Frame-rate independent smoothing toward a target: rate per second. */
export const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt))

/** Medal 0–3 for a score against [bronze, silver, gold]. */
export const medalFor = (thresholds, score) => thresholds.filter((t) => score >= t).length
export const MEDAL_COLORS = [null, '#d98b4a', '#c9d3ea', '#ffd23f']
export const MEDAL_NAMES = ['No medal', 'Bronze', 'Silver', 'Gold']

/** Text with an outline, centred by default. font is a CSS font string. */
export function label(ctx, str, x, y, { font, color = '#fff', edge = 0, edgeColor = '#000', align = 'center', base = 'middle' } = {}) {
  ctx.font = font
  ctx.textAlign = align
  ctx.textBaseline = base
  if (edge) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = edge
    ctx.strokeStyle = edgeColor
    ctx.strokeText(str, x, y)
  }
  ctx.fillStyle = color
  ctx.fillText(str, x, y)
}

/** A medal disc (level 0 draws an empty ring). */
export function drawMedal(ctx, x, y, r, level) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fillStyle = level ? MEDAL_COLORS[level] : 'rgba(255,255,255,0.08)'
  ctx.fill()
  ctx.lineWidth = Math.max(2, r * 0.2)
  ctx.strokeStyle = level ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.25)'
  ctx.stroke()
  if (level) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.28, 0, TAU)
    ctx.fill()
  }
}

/**
 * Particles and screen shake for one game. shake honours Reduced shake / flash.
 *   const fx = createFx(settings); fx.burst(x, y, color); fx.update(dt); fx.draw(ctx)
 *   ctx.translate(...fx.offset()) before drawing the world
 */
export function createFx(settings, { max = 240 } = {}) {
  const parts = []
  let shake = 0
  return {
    burst(x, y, color, n = 14, speed = 320, { size = 5, life = 0.6, gravity = 600, square = false } = {}) {
      for (let i = 0; i < n && parts.length < max; i++) {
        const a = rand(0, TAU)
        const s = rand(speed * 0.3, speed)
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(life * 0.6, life), max: life, color, size: rand(size * 0.6, size), gravity, square })
      }
    },
    shake(amount) {
      if (!settings.data.reducedShake) shake = Math.max(shake, amount)
    },
    offset: () => (shake > 0 ? [(Math.random() - 0.5) * 18 * shake, (Math.random() - 0.5) * 18 * shake] : [0, 0]),
    update(dt) {
      shake = Math.max(0, shake - dt * 2.5)
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        p.life -= dt
        if (p.life <= 0) {
          parts.splice(i, 1)
          continue
        }
        p.vy += p.gravity * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
      }
    },
    draw(ctx) {
      for (const p of parts) {
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1)
        ctx.fillStyle = p.color
        if (p.square) ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
        else {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, TAU)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    },
    clear() {
      parts.length = 0
      shake = 0
    }
  }
}
