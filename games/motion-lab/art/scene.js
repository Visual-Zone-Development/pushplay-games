// The library art's scene, drawn with the game's own gfx.js and station icons (cover.html and
// hero.html), so the cover and banner always match the game.
import { C, drawGrid, finish, gloss, groundShadow, phoneGlyph } from '../gfx.js'
import maze from '../stations/maze.js'
import derby from '../stations/derby.js'
import slash from '../stations/slash.js'
import rhythm from '../stations/rhythm.js'
import kart from '../stations/kart.js'

/** Draw at 2× into a canvas of w×h CSS px, with the phone at (px, py) and scale k. */
export function drawScene(canvas, w, h, { px, py, k = 1, icons = true, skip = [] }) {
  const ctx = canvas.getContext('2d')
  ctx.scale((2 * w) / 1280, (2 * w) / 1280)
  const H = (1280 * h) / w
  // the backdrop and finish work in 1280-wide space
  ctx.save()
  ctx.scale(1, H / 800)
  drawGrid(ctx, 0)
  ctx.restore()
  const x = (px * 1280) / w
  const y = (py * 1280) / w
  const s = (k * 1280) / w
  // motion arcs behind the phone
  ctx.lineCap = 'round'
  for (let i = 0; i < 3; i++) {
    ctx.lineWidth = 22 * s
    ctx.strokeStyle = C.dark
    ctx.beginPath()
    ctx.arc(x, y + 40 * s, (190 + i * 46) * s, -Math.PI / 2 - 0.75, -Math.PI / 2 + 0.75)
    ctx.stroke()
    ctx.lineWidth = 13 * s
    ctx.strokeStyle = [C.teal, C.pink, C.lime][i]
    ctx.stroke()
  }
  groundShadow(ctx, x + 30 * s, y + 200 * s, 150 * s, 30 * s, 0.5)
  phoneGlyph(ctx, x, y, 150 * s, 270 * s, { rot: -0.28, screen: C.orange })
  gloss(ctx, x + 6 * s, y - 10 * s, 34 * s, C.gold, { edge: 7 * s })
  if (icons) {
    const ring = [
      [maze, -300, -40, 120],
      [derby, 280, -110, 120],
      [slash, 300, 120, 130],
      [rhythm, -280, 150, 120],
      [kart, 0, -250, 110]
    ]
    for (const [st, dx, dy, size] of ring.filter(([st]) => !skip.includes(st.id))) {
      const ix = x + dx * s
      const iy = y + dy * s
      groundShadow(ctx, ix + 10 * s, iy + 60 * s, size * 0.55 * s, size * 0.14 * s, 0.4)
      st.icon(ctx, ix, iy, size * s)
    }
  }
  ctx.save()
  ctx.scale(1, H / 800)
  finish(ctx)
  ctx.restore()
}
