// The library art's scene: the arcade hall with a fan of the six cabinets, each drawn with its
// own game's icon(), so the cover and banner always show the real games.
import starCourier from '../games/star-courier.js'
import hopGarden from '../games/hop-garden.js'
import mergeJars from '../games/merge-jars.js'
import tinyTactics from '../games/tiny-tactics.js'
import keyhole from '../games/keyhole.js'
import neonRing from '../games/neon-ring.js'

const GAMES = [starCourier, hopGarden, mergeJars, tinyTactics, keyhole, neonRing]

/** Draw into a canvas of w×h CSS px at 2×, cabinets fanned round (cx, cy) with card width cw. */
export function drawScene(canvas, w, h, { cx, cy, cw, spread = 1 }) {
  const ctx = canvas.getContext('2d')
  ctx.scale(2, 2)
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#22184d')
  g.addColorStop(1, '#140f2e')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  // the floor grid, as in the hall
  ctx.strokeStyle = 'rgba(255,92,138,0.18)'
  ctx.lineWidth = 2
  const horizon = h * 0.62
  for (let i = -14; i <= 14; i++) {
    ctx.beginPath()
    ctx.moveTo(cx + i * 24, horizon)
    ctx.lineTo(cx + i * 200, h)
    ctx.stroke()
  }
  for (let j = 0; j < 7; j++) {
    const y = horizon + (h - horizon) * (j / 7) ** 2
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  const ch = cw * 0.7
  GAMES.forEach((game, i) => {
    const k = (i - (GAMES.length - 1) / 2) * spread
    const x = cx + k * cw * 0.62
    const y = cy + Math.abs(k) * ch * 0.12
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(k * 0.09)
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.beginPath()
    ctx.roundRect(-cw / 2 + 8, -ch / 2 + 12, cw, ch, cw * 0.06)
    ctx.fill()
    ctx.fillStyle = game.style.bg
    ctx.beginPath()
    ctx.roundRect(-cw / 2, -ch / 2, cw, ch, cw * 0.06)
    ctx.fill()
    ctx.save()
    ctx.clip()
    game.icon(ctx, 0, 0, cw * 0.36, 0.8)
    ctx.restore()
    ctx.lineWidth = cw * 0.02
    ctx.strokeStyle = game.style.accent
    ctx.stroke()
    ctx.restore()
  })
}
