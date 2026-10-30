// Sensor Bench: no score, just the signal. A phone that mirrors the real one's tilt, a bubble
// level, scrolling graphs, every swing as it's read, the sample rate and the delay to the phone.
import { C, arrow, clamp, panel, phoneGlyph, text } from '../gfx.js'

const HISTORY = 240 // frames of graph (~4 s)

export default {
  id: 'bench',
  name: 'Sensor Bench',
  blurb: 'See what the phone sends',
  phoneHint: 'Tilt, swing and shake: watch the screen. Re-center sets "level".',
  noScore: true,
  medals: [],
  icon(ctx, x, y, s) {
    ctx.save()
    ctx.lineWidth = s * 0.08
    ctx.lineJoin = 'round'
    ctx.strokeStyle = C.teal
    ctx.beginPath()
    const pts = [-0.5, 0.1, -0.3, 0.1, -0.18, -0.35, 0, 0.35, 0.15, -0.15, 0.25, 0.1, 0.5, 0.1]
    for (let i = 0; i < pts.length; i += 2) ctx.lineTo(x + pts[i] * s, y + pts[i + 1] * s)
    ctx.stroke()
    ctx.restore()
  },
  howTo: () => '',
  create({ motion, input, settings, TUNING }) {
    const tx = new Float32Array(HISTORY)
    const ty = new Float32Array(HISTORY)
    const am = new Float32Array(HISTORY)
    let head = 0
    let t = 0
    let flash = 0
    return {
      score: 0,
      done: false,
      update(dt) {
        t += dt
        tx[head] = motion.tilt.x
        ty[head] = motion.tilt.y
        const sw = motion.swings.length ? Math.max(...motion.swings.map((s) => s.m || s.power * 30)) : 0
        am[head] = Math.max(motion.source === 'phone' ? motion.raw.m : 0, sw)
        head = (head + 1) % HISTORY
        if (motion.swings.length) flash = 1
        flash = Math.max(0, flash - dt * 3)
      },
      stats: () => [],
      prompts: () => [
        ['y', 'Re-center'],
        ['b', 'Stations'],
        ['menu', 'Pause']
      ],
      draw(ctx) {
        // Left: the phone, mirrored, and the bubble level.
        panel(ctx, 32, 110, 380, 600)
        text(ctx, 'Tilt', 222, 145, { size: 28, weight: 800 })
        const live = motion.source === 'phone'
        const g = live ? motion.raw.g - motion.neutral.g : motion.tilt.x * 25
        const b = live ? motion.raw.b - motion.neutral.b : motion.tilt.y * 25
        ctx.save()
        ctx.translate(222, 290)
        ctx.scale(1, clamp(Math.cos((b * Math.PI) / 180) * 0.9 + 0.1, 0.2, 1))
        phoneGlyph(ctx, 0, 0, 120, 210, { rot: (g * Math.PI) / 180, screen: flash > 0 ? C.gold : C.teal })
        ctx.restore()
        const lx = 222
        const ly = 560
        ctx.lineWidth = 5
        ctx.strokeStyle = C.dark
        ctx.fillStyle = C.bg
        ctx.beginPath()
        ctx.arc(lx, ly, 110, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.strokeStyle = C.teal
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(lx, ly, 26, 0, Math.PI * 2)
        ctx.moveTo(lx - 100, ly)
        ctx.lineTo(lx + 100, ly)
        ctx.moveTo(lx, ly - 100)
        ctx.lineTo(lx, ly + 100)
        ctx.stroke()
        ctx.fillStyle = C.orange
        ctx.beginPath()
        ctx.arc(lx + motion.tilt.x * 84, ly + motion.tilt.y * 84, 20, 0, Math.PI * 2)
        ctx.fill()
        ctx.lineWidth = 4
        ctx.strokeStyle = C.dark
        ctx.stroke()
        text(ctx, `x ${motion.tilt.x.toFixed(2)}   y ${motion.tilt.y.toFixed(2)}`, lx, 690, { size: 22, weight: 700, color: C.quiet })

        // Middle: graphs.
        panel(ctx, 432, 110, 520, 380)
        text(ctx, 'Signal (last 4 s)', 692, 145, { size: 26, weight: 800 })
        graph(ctx, 452, 175, 480, 130, [
          [tx, C.orange, -1, 1],
          [ty, C.teal, -1, 1]
        ], head)
        text(ctx, 'tilt x', 470, 322, { size: 18, weight: 700, color: C.orange, align: 'left' })
        text(ctx, 'tilt y', 540, 322, { size: 18, weight: 700, color: C.teal, align: 'left' })
        const thr = TUNING.motion.swingThresholds[settings.data.swingThreshold ?? 1]
        graph(ctx, 452, 340, 480, 120, [[am, C.pink, 0, 40]], head, thr / 40)
        text(ctx, `movement m/s² (dashed: swing threshold ${thr})`, 470, 474, { size: 18, weight: 700, color: C.pink, align: 'left' })

        // Swing log.
        panel(ctx, 432, 510, 520, 200)
        text(ctx, 'Swings as read', 692, 542, { size: 26, weight: 800 })
        const now = performance.now() / 1000
        motion.log.slice(0, 6).forEach((s, i) => {
          const x = 482 + (i % 3) * 160
          const y = 600 + Math.floor(i / 3) * 70
          ctx.globalAlpha = clamp(1.4 - (now - s.at) / 8, 0.35, 1)
          if (s.dir) arrow(ctx, x, y, 40, s.dir, C.gold)
          else {
            ctx.fillStyle = C.gold
            ctx.beginPath()
            ctx.arc(x, y, 15, 0, Math.PI * 2)
            ctx.fill()
          }
          text(ctx, `${Math.round(s.power * 100)}%`, x + 30, y - 10, { size: 20, weight: 800, align: 'left' })
          text(ctx, s.src === 'phone' ? `${s.m} m/s²` : s.src, x + 30, y + 14, { size: 16, weight: 600, align: 'left', color: C.quiet })
          ctx.globalAlpha = 1
        })
        if (!motion.log.length) text(ctx, 'Flick or shake to see swings here', 692, 610, { size: 22, weight: 600, color: C.quiet })

        // Right: numbers.
        panel(ctx, 972, 110, 276, 600)
        text(ctx, 'Readout', 1110, 145, { size: 26, weight: 800 })
        const p = motion.phone
        const rows = [
          ['Phone', p ? p.name : 'none'],
          ['Sensors', p ? motion.phoneState : '-'],
          ['Source', motion.source === 'phone' ? 'phone' : input.mode],
          ['Updates', live ? `${motion.hz.toFixed(0)} /s` : '-'],
          // How often the phone's sensors fire: every one is used for swings.
          ['Sensor rate', live && motion.stats?.hz ? `${motion.stats.hz} /s` : '-'],
          ['Round trip', motion.rtt ? `${Math.round(motion.rtt * 1000)} ms` : '-'],
          // Clock check: on (swing times line up to the ms) and how much the trips vary.
          ['Clock sync', motion.clockOff !== null ? `±${Math.round(motion.jitter * 500)} ms` : 'not yet'],
          ['Gyro drift', live && motion.stats ? `${motion.stats.bias}°/s` : '-'],
          ['Screen turn', live && motion.stats ? `${motion.stats.o ?? 0}°` : '-'],
          ['Beta (fwd)', live ? `${motion.raw.b.toFixed(1)}°` : '-'],
          ['Gamma (side)', live ? `${motion.raw.g.toFixed(1)}°` : '-'],
          ['Level at', `${motion.neutral.b.toFixed(0)}° / ${motion.neutral.g.toFixed(0)}°`],
          ['Movement', live ? `${motion.raw.m.toFixed(1)}` : '-'],
          // Is the handheld's own screen or mouse doing anything? (Helps when motion seems stuck.)
          ['Screen input', `${input.mode}${input.pointer.down ? ', held' : ''}`]
        ]
        rows.forEach(([k, v], i) => {
          const y = 196 + i * 37
          text(ctx, k, 992, y, { size: 19, weight: 600, align: 'left', color: C.quiet })
          text(ctx, String(v), 1228, y, { size: 21, weight: 800, align: 'right' })
        })
      }
    }
  }
}

/** Line graph of ring buffers; series = [[buffer, color, min, max]]. */
function graph(ctx, x, y, w, h, series, head, mark) {
  ctx.fillStyle = C.bg
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = C.grid
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, y + h / 2)
  ctx.lineTo(x + w, y + h / 2)
  ctx.stroke()
  if (mark !== undefined) {
    ctx.setLineDash([8, 8])
    ctx.strokeStyle = C.ink
    ctx.beginPath()
    ctx.moveTo(x, y + h - mark * h)
    ctx.lineTo(x + w, y + h - mark * h)
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.lineWidth = 3
  for (const [buf, color, lo, hi] of series) {
    ctx.strokeStyle = color
    ctx.beginPath()
    const n = buf.length
    for (let i = 0; i < n; i++) {
      // Oldest on the left: the buffer's write head is one past the newest sample.
      const v = buf[(head + i) % n]
      ctx.lineTo(x + (i / (n - 1)) * w, y + h - clamp((v - lo) / (hi - lo), 0, 1) * h)
    }
    ctx.stroke()
  }
}
