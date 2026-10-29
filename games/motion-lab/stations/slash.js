// Fruit Slash: fruit flies up, each with an arrow. Flick the phone in that direction to slice
// it; the fruit that has waited longest goes first. Two-arrow fruit need two flicks, golden fruit
// take any direction. Wrong flicks and dropped fruit break the combo.
import { C, H, W, arrow, clamp, gloss, glossFill, groundShadow, lerp, panel, rand, shade, text } from '../gfx.js'

const DIRS = ['left', 'right', 'up', 'down']
const KINDS = [
  { color: C.red, leaf: true, r: 44 },
  { color: C.orange, leaf: true, r: 46 },
  { color: C.lime, leaf: false, r: 54, stripes: true },
  { color: C.violet, leaf: true, r: 40 }
]
const VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }

export default {
  id: 'slash',
  name: 'Fruit Slash',
  blurb: 'Flick in the arrow’s direction',
  phoneHint: 'Flick the phone left, right, up or down to match each fruit’s arrow.',
  // A flick ends in a stop the other way; the gap keeps that from reading as a second flick.
  swing: { scale: 1, cd: 320 },
  music: { bpm: 128, root: 57, gain: 0.05, chords: [0, 7, 5, 3] },
  icon(ctx, x, y, s) {
    ctx.strokeStyle = C.dark
    ctx.lineWidth = s * 0.06
    for (const [dx, dy, a0, a1] of [[-0.08, 0.06, 0.6, Math.PI + 0.6], [0.1, -0.06, Math.PI + 0.6, 0.6]]) {
      ctx.beginPath()
      ctx.arc(x + s * dx, y + s * dy, s * 0.3, a0, a1)
      ctx.closePath()
      ctx.stroke()
      glossFill(ctx, C.red, x + s * dx - s * 0.3, y + s * dy - s * 0.3, s * 0.6, s * 0.6)
    }
    ctx.strokeStyle = C.ink
    ctx.lineWidth = s * 0.07
    ctx.beginPath()
    ctx.moveTo(x - s * 0.45, y + s * 0.4)
    ctx.lineTo(x + s * 0.45, y - s * 0.4)
    ctx.stroke()
  },
  howTo: (input) => `Flick in the arrow's direction (${input.dpadLabel()} without a phone)`,
  create(env) {
    const { motion, sfx, fx, TUNING } = env
    const T = TUNING.slash
    const fruits = []
    const halves = []
    const streaks = []
    let t = 0
    let spawn = 0.6
    let combo = 0
    const run = {
      score: 0,
      done: false,
      timeLeft: T.time,
      sliced: 0,
      missed: 0,
      wrong: 0,
      bestCombo: 0,
      update,
      draw,
      hudRight: () => `${Math.ceil(Math.max(0, run.timeLeft))}s`,
      stats: () => [
        ['Fruit sliced', run.sliced],
        ['Best combo', run.bestCombo],
        ['Wrong flicks', run.wrong],
        ['Dropped', run.missed]
      ],
      prompts: () => [
        ['left', 'Slash'],
        ['menu', 'Pause']
      ]
    }

    function launch() {
      const k = clamp(t / T.time, 0, 1)
      const gold = Math.random() < T.goldChance && t > 8
      const double = !gold && t > T.doubleAfter && Math.random() < 0.3 + k * 0.2
      const kind = KINDS[Math.floor(Math.random() * KINDS.length)]
      const x = rand(220, W - 220)
      const dirs = gold ? ['any'] : double ? [pick(), pick()] : [pick()]
      fruits.push({ x, y: H + 60, vx: (W / 2 - x) * rand(0.1, 0.3), vy: -rand(760, 870), rot: 0, vr: rand(-2, 2), kind, gold, dirs, age: 0, hit: 0 })
    }
    const pick = () => DIRS[Math.floor(Math.random() * 4)]

    function update(dt) {
      t += dt
      run.timeLeft -= dt
      if (run.timeLeft <= 0 && !fruits.length) {
        run.done = true
        return
      }
      if (run.timeLeft > 0) {
        spawn -= dt
        if (spawn <= 0) {
          const k = clamp(t / T.time, 0, 1)
          spawn = lerp(T.spawnStart, T.spawnEnd, k) * rand(0.8, 1.2)
          launch()
          if (t > 35 && Math.random() < 0.25) launch()
        }
      }
      for (let i = fruits.length - 1; i >= 0; i--) {
        const f = fruits[i]
        f.age += dt
        f.hit = Math.max(0, f.hit - dt * 5)
        f.vy += T.gravity * dt
        f.x += f.vx * dt
        f.y += f.vy * dt
        f.rot += f.vr * dt
        if (f.vy > 0 && f.y > H + 70) {
          fruits.splice(i, 1)
          run.missed++
          breakCombo()
          sfx.miss()
          fx.float(clamp(f.x, 80, W - 80), H - 70, 'Dropped', C.pink, 28)
        }
      }
      for (const h of halves) {
        h.vy += T.gravity * 1.4 * dt
        h.x += h.vx * dt
        h.y += h.vy * dt
        h.rot += h.vr * dt
      }
      for (let i = halves.length - 1; i >= 0; i--) if (halves[i].y > H + 120) halves.splice(i, 1)
      for (let i = streaks.length - 1; i >= 0; i--) if ((streaks[i].life -= dt * 3) <= 0) streaks.splice(i, 1)

      for (const s of motion.swings) {
        if (!s.dir) {
          if (s.src === 'phone') fx.float(640, 200, 'Flick left, right, up or down', C.quiet, 26)
          continue
        }
        slash(s)
      }
    }

    function slash(s) {
      const visible = fruits.filter((f) => f.y < H - 10 && (f.dirs[0] === s.dir || f.gold))
      if (!visible.length) {
        run.wrong++
        breakCombo()
        sfx.whoosh(0.3)
        streaks.push({ x: 640, y: 420, dir: s.dir, life: 0.6, color: 'rgba(255,255,255,0.4)' })
        fx.float(640, 420, `${s.dir}? no fruit`, C.quiet, 24)
        return
      }
      const f = visible.reduce((a, b) => (b.age > a.age ? b : a))
      streaks.push({ x: f.x, y: f.y, dir: s.dir, life: 1, color: C.ink })
      if (f.dirs.length > 1) {
        f.dirs.shift()
        f.hit = 1
        f.vy = Math.min(f.vy, -200)
        sfx.slice(combo)
        fx.burst(f.x, f.y, f.kind.color, 8, 260)
        motion.buzz(15)
        return
      }
      fruits.splice(fruits.indexOf(f), 1)
      combo++
      run.bestCombo = Math.max(run.bestCombo, combo)
      run.sliced++
      const mult = 1 + Math.floor(combo / T.comboStep)
      const pts = (f.gold ? 50 : T.points) * mult
      run.score += pts
      sfx.slice(combo)
      sfx.splat()
      motion.buzz(f.gold ? 60 : 25)
      fx.hitstop(0.035)
      fx.kick(f.gold ? 10 : 4)
      const color = f.gold ? C.gold : f.kind.color
      fx.burst(f.x, f.y, color, 22, 480, { size: 9 })
      fx.burst(f.x, f.y, '#fff8', 6, 300, { size: 5, life: 0.4 })
      fx.float(f.x, f.y - 50, mult > 1 ? `+${pts} x${mult}` : `+${pts}`, f.gold ? C.gold : C.ink, 32)
      const [vx, vy] = VEC[s.dir]
      // Two halves fly apart across the slash.
      for (const side of [-1, 1]) halves.push({ x: f.x, y: f.y, vx: -vy * side * 220 + vx * 160, vy: vx * side * 220 + vy * 160 - 150, rot: f.rot, vr: side * 5, side, kind: f.kind, gold: f.gold, ang: Math.atan2(vy, vx) })
    }

    function breakCombo() {
      if (combo >= 5) fx.float(640, 160, 'Combo lost', C.pink, 30)
      combo = 0
    }

    let mat = null
    function bakeMat() {
      const c = document.createElement('canvas')
      c.width = W * 2
      c.height = H * 2
      const g = c.getContext('2d')
      g.scale(2, 2)
      const x = 60
      const y = 104
      const w = W - 120
      const h = H - 170
      panel(g, x, y, w, h, { fill: '#2f6f5a', r: 26, lw: 6 })
      g.save()
      g.beginPath()
      g.roundRect(x + 14, y + 14, w - 28, h - 28, 16)
      g.clip()
      const light = g.createRadialGradient(x + w * 0.3, y + h * 0.2, 20, x + w * 0.5, y + h * 0.5, w * 0.8)
      light.addColorStop(0, '#3f8f73')
      light.addColorStop(1, '#1f4d3e')
      g.fillStyle = light
      g.fillRect(x, y, w, h)
      g.strokeStyle = 'rgba(220,255,240,0.12)'
      g.lineWidth = 1
      for (let gx = x + 14; gx < x + w; gx += 30) {
        g.beginPath()
        g.moveTo(gx, y)
        g.lineTo(gx, y + h)
        g.stroke()
      }
      for (let gy = y + 14; gy < y + h; gy += 30) {
        g.beginPath()
        g.moveTo(x, gy)
        g.lineTo(x + w, gy)
        g.stroke()
      }
      g.strokeStyle = 'rgba(220,255,240,0.25)'
      g.lineWidth = 2
      for (let gx = x + 14; gx < x + w; gx += 150) {
        g.beginPath()
        g.moveTo(gx, y)
        g.lineTo(gx, y + h)
        g.stroke()
      }
      // ruler ticks along the top edge, and an angle guide in the corner
      g.fillStyle = 'rgba(220,255,240,0.35)'
      for (let gx = x + 14; gx < x + w; gx += 15) g.fillRect(gx, y + 14, 2, (gx - x - 14) % 150 === 0 ? 18 : 9)
      g.strokeStyle = 'rgba(220,255,240,0.18)'
      g.lineWidth = 2
      for (const r of [120, 200, 280]) {
        g.beginPath()
        g.arc(x + w - 14, y + h - 14, r, Math.PI, Math.PI * 1.5)
        g.stroke()
      }
      g.restore()
      return c
    }

    function draw(ctx) {
      // A lab cutting mat on the blueprint: baked once.
      if (!mat) mat = bakeMat()
      ctx.drawImage(mat, 0, 0, W, H)
      for (const h of halves) drawHalf(ctx, h)
      for (const f of fruits) drawFruit(ctx, f)
      for (const s of streaks) {
        const [vx, vy] = VEC[s.dir]
        ctx.globalAlpha = s.life
        ctx.strokeStyle = s.color
        ctx.lineWidth = 12 * s.life
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(s.x - vx * 160 + vy * 10, s.y - vy * 160 - vx * 10)
        ctx.lineTo(s.x + vx * 160 - vy * 10, s.y + vy * 160 + vx * 10)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      if (combo >= 2) text(ctx, `Combo ${combo}`, 40, 130, { size: 30, weight: 900, align: 'left', color: combo >= T.comboStep ? C.gold : C.ink, outline: 8 })
    }

    function drawFruit(ctx, f) {
      const r = f.kind.r * (1 + f.hit * 0.15)
      groundShadow(ctx, f.x + 12, f.y + 18, r * 1.15, r * 0.8, 0.4)
      // The body is lit from the world's upper left whatever its spin; stripes and the leaf turn.
      gloss(ctx, f.x, f.y, r, f.gold ? C.gold : f.kind.color, { edge: 6, shine: 0 })
      ctx.save()
      ctx.translate(f.x, f.y)
      ctx.rotate(f.rot)
      ctx.lineWidth = 6
      ctx.strokeStyle = C.dark
      if (f.kind.stripes && !f.gold) {
        ctx.strokeStyle = 'rgba(10,15,34,0.25)'
        ctx.lineWidth = 6
        for (const k of [-0.5, 0, 0.5]) {
          ctx.beginPath()
          ctx.ellipse(k * r, 0, r * 0.15, r * 0.9, 0, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      if (f.kind.leaf) {
        ctx.beginPath()
        ctx.ellipse(r * 0.25, -r * 0.95, r * 0.3, r * 0.14, -0.5, 0, Math.PI * 2)
        ctx.lineWidth = 3
        ctx.stroke()
        glossFill(ctx, '#3cbf6a', r * -0.05, -r * 1.1, r * 0.6, r * 0.3)
      }
      ctx.restore()
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.beginPath()
      ctx.ellipse(f.x - r * 0.4, f.y - r * 0.45, r * 0.26, r * 0.15, -0.6, 0, Math.PI * 2)
      ctx.fill()
      // The arrow doesn't spin, so it's always readable.
      if (f.gold) {
        text(ctx, 'ANY', f.x, f.y + 2, { size: 26, weight: 900, color: C.dark })
      } else {
        arrow(ctx, f.x, f.y, r * 1.15, f.dirs[0], '#fff')
        if (f.dirs.length > 1) arrow(ctx, f.x + r * 0.75, f.y - r * 0.75, r * 0.6, f.dirs[1], C.ink)
      }
    }

    function drawHalf(ctx, h) {
      ctx.save()
      ctx.translate(h.x, h.y)
      ctx.rotate(h.rot)
      const r = h.kind.r
      const skin = h.gold ? C.gold : h.kind.color
      ctx.strokeStyle = C.dark
      ctx.lineWidth = 5
      ctx.beginPath()
      const a = h.ang + (h.side > 0 ? 0 : Math.PI)
      ctx.arc(0, 0, r, a, a + Math.PI)
      ctx.closePath()
      ctx.stroke()
      glossFill(ctx, skin, -r, -r, r * 2, r * 2)
      // juicy flesh, brighter toward its middle, with a few seeds
      const flesh = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.75)
      flesh.addColorStop(0, '#fffbe6')
      flesh.addColorStop(1, h.gold ? '#ffe07a' : shade(skin, 0.55))
      ctx.fillStyle = flesh
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.75, a, a + Math.PI)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(40,20,20,0.6)'
      for (const k of [0.3, 0.5, 0.7]) {
        const sa = a + Math.PI * k
        ctx.beginPath()
        ctx.ellipse(Math.cos(sa) * r * 0.45, Math.sin(sa) * r * 0.45, 3.5, 2, sa, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    return run
  }
}
