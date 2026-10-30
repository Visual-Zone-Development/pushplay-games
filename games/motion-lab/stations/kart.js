// Kart Dash: hold the phone like a steering wheel and drive a toy kart round a top-down track.
// The gas is automatic; hold BRAKE (the phone's button) for the tight corners. 75 s: laps score
// 100, coins 10, and your best lap drives beside you as a ghost.
// Steering is motion.wheel (gravity across the phone's face), which is absolute and drift-free,
// so it suits a phone over the network far better than pointing does.
import { C, clamp, gloss, glossFill, groundShadow, rrect, shade, text } from '../gfx.js'

/** The track's centre line, as control points (a closed Catmull-Rom loop). */
const POINTS = [
  [250, 640], [180, 470], [230, 260], [410, 170], [600, 230], [700, 380], [860, 410], [960, 240],
  [1110, 200], [1185, 340], [1135, 500], [1150, 640], [970, 705], [720, 660], [520, 700], [380, 700]
]
const SAMPLES = 480

function buildTrack() {
  const pts = []
  const n = POINTS.length
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [POINTS[(i - 1 + n) % n], POINTS[i], POINTS[(i + 1) % n], POINTS[(i + 2) % n]]
    for (let k = 0; k < SAMPLES / n; k++) {
      const t = k / (SAMPLES / n)
      const t2 = t * t
      const t3 = t2 * t
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      pts.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) })
    }
  }
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length]
    const l = Math.hypot(q.x - p.x, q.y - p.y) || 1
    p.tx = (q.x - p.x) / l
    p.ty = (q.y - p.y) / l
  })
  return pts
}
const TRACK = buildTrack()

export default {
  id: 'kart',
  name: 'Kart Dash',
  blurb: 'Steer like a wheel',
  phoneHint: 'Hold the phone sideways like a steering wheel, screen facing you, and turn it to steer. The gas is automatic; hold BRAKE for tight corners.',
  centerOnReady: 'Hold the phone like a wheel, straight ahead',
  btn: 'BRAKE',
  music: { bpm: 128, root: 50, gain: 0.045, chords: [0, 7, 5, 3] },
  icon(ctx, x, y, s) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-0.35)
    ctx.fillStyle = C.dark
    for (const [wx, wy] of [[-0.3, -0.26], [0.22, -0.26], [-0.3, 0.26], [0.22, 0.26]]) {
      rrect(ctx, (wx - 0.08) * s, (wy - 0.07) * s, 0.2 * s, 0.14 * s, 0.04 * s)
      ctx.fill()
    }
    rrect(ctx, -0.36 * s, -0.2 * s, 0.72 * s, 0.4 * s, 0.14 * s)
    ctx.lineWidth = s * 0.06
    ctx.strokeStyle = C.dark
    ctx.stroke()
    glossFill(ctx, C.orange, -0.36 * s, -0.2 * s, 0.72 * s, 0.4 * s)
    ctx.restore()
  },
  howTo: (input) => (input.mode === 'touch' || input.mode === 'mouse' ? 'Hold the pointer left or right to steer' : `${input.stickLabel()} to steer · ${input.label('a')} to brake`),
  create(env) {
    const { motion, sfx, fx, input, save, TUNING } = env
    const T = TUNING.kart
    const start = TRACK[0]
    const kart = { x: start.x, y: start.y, h: Math.atan2(start.ty, start.tx), v: 0, vx: 0, vy: 0, steer: 0, grass: false }
    let idx = 0 // nearest track sample
    let passedHalf = false
    let lapStart = 0
    let clock = 0
    let rumble = 0
    let engine = 0
    let coins = []
    let ghost = null // best lap: [{ x, y, h }] at 1/15 s
    let rec = []
    let recAt = 0
    const trail = []
    const run = {
      score: 0,
      done: false,
      timeLeft: T.time,
      laps: 0,
      coins: 0,
      bestLap: save.data.kartBestLap ?? null,
      update,
      draw,
      stats: () => [
        ['Laps', run.laps],
        ['Coins', run.coins],
        ['Best lap', run.bestLap ? `${run.bestLap.toFixed(2)} s` : '-']
      ],
      prompts: () => [
        ['a', 'Brake'],
        ['y', 'Re-center'],
        ['menu', 'Pause']
      ],
      hudRight: () => `Lap ${run.laps + 1} · ${Math.ceil(Math.max(0, run.timeLeft))}s`,
      kart, // for ?debug and playtest bots
      track: TRACK
    }
    placeCoins()

    /** Coins in short lines across the track, so taking them means choosing a line. */
    function placeCoins() {
      coins = []
      for (let g = 0; g < T.coinGroups; g++) {
        const at = Math.floor(((g + 0.5) / T.coinGroups) * TRACK.length)
        const side = ((g * 7) % 5) / 2 - 1 // -1..1, spread round the lap
        for (let k = 0; k < 3; k++) {
          const p = TRACK[(at + k * 6) % TRACK.length]
          const off = side * T.width * 0.32
          coins.push({ x: p.x - p.ty * off, y: p.y + p.tx * off, taken: false, spin: Math.random() * 6 })
        }
      }
    }

    /** The nearest centre-line sample, searched near the last one (the kart can't jump far). */
    function nearest() {
      let best = idx
      let bd = Infinity
      for (let k = -24; k <= 24; k++) {
        const i = (idx + k + TRACK.length) % TRACK.length
        const p = TRACK[i]
        const d = (p.x - kart.x) ** 2 + (p.y - kart.y) ** 2
        if (d < bd) {
          bd = d
          best = i
        }
      }
      // Far off the track (cut across the grass): look along the whole lap instead.
      if (Math.sqrt(bd) > T.width * 1.5)
        TRACK.forEach((p, i) => {
          const d = (p.x - kart.x) ** 2 + (p.y - kart.y) ** 2
          if (d < bd) {
            bd = d
            best = i
          }
        })
      return { i: best, d: Math.sqrt(bd) }
    }

    function steering() {
      const p = input.pointer
      if (motion.source === 'phone' && motion.wheel !== null) return motion.wheel
      if (p.down && motion.source !== 'phone') {
        // Mouse / touch: steer toward where you hold the pointer.
        let d = Math.atan2(p.y - kart.y, p.x - kart.x) - kart.h
        d = Math.atan2(Math.sin(d), Math.cos(d))
        return clamp(d / 0.7, -1, 1)
      }
      return motion.tilt.x
    }

    function update(dt) {
      run.timeLeft -= dt
      clock += dt
      if (run.timeLeft <= 0) {
        run.done = true
        return
      }
      // Steering eases toward the wheel a little (a real kart's steering has some weight).
      kart.steer += (steering() - kart.steer) * (1 - Math.exp(-T.steerEase * dt))
      const braking = motion.fireHeld
      const top = kart.grass ? T.maxSpeed * T.grassSpeed : T.maxSpeed
      if (braking) kart.v = Math.max(T.minSpeed, kart.v - T.brake * dt)
      else if (kart.v < top) kart.v = Math.min(top, kart.v + T.accel * dt)
      else kart.v += (top - kart.v) * (1 - Math.exp(-T.grassDrag * dt))
      // Turn rate grows with speed up to a point; braking tightens it.
      const turn = T.turn * Math.min(1, kart.v / T.turnFull) * (braking ? T.brakeTurn : 1)
      kart.h += kart.steer * turn * dt
      // Velocity swings toward the heading by the grip: a little slide on track, a lot on grass.
      const fx0 = Math.cos(kart.h) * kart.v
      const fy0 = Math.sin(kart.h) * kart.v
      const grip = 1 - Math.exp(-(kart.grass ? T.gripGrass : T.grip) * dt)
      kart.vx += (fx0 - kart.vx) * grip
      kart.vy += (fy0 - kart.vy) * grip
      kart.x = clamp(kart.x + kart.vx * dt, 20, 1260)
      kart.y = clamp(kart.y + kart.vy * dt, 110, 780)

      const near = nearest()
      const prev = idx
      idx = near.i
      const wasGrass = kart.grass
      kart.grass = near.d > T.width / 2
      if (kart.grass && !wasGrass) motion.buzz(20)
      if (kart.grass && (rumble -= dt) <= 0) {
        rumble = 0.12
        sfx.roll(kart.v * 2)
        motion.buzz(12)
      }
      if ((engine -= dt) <= 0) {
        engine = 0.09
        sfx.note(36 + Math.round((kart.v / T.maxSpeed) * 12), { dur: 0.08, type: 'sawtooth', gain: 0.03 })
      }
      // Laps: the start line crossed going forwards, after passing halfway (no shortcuts).
      if (idx > TRACK.length * 0.4 && idx < TRACK.length * 0.6) passedHalf = true
      if (passedHalf && prev > TRACK.length * 0.9 && idx < TRACK.length * 0.1) lap()

      for (const c of coins) {
        c.spin += dt * 5
        if (!c.taken && Math.hypot(c.x - kart.x, c.y - kart.y) < T.coinRadius) {
          c.taken = true
          run.coins++
          run.score += T.coinScore
          sfx.gem()
          motion.buzz(10)
          fx.burst(c.x, c.y, C.gold, 8, 200, { size: 5, life: 0.4, gravity: 0 })
        }
      }
      if ((recAt -= dt) <= 0) {
        recAt = 1 / 15
        rec.push({ x: kart.x, y: kart.y, h: kart.h })
        trail.push({ x: kart.x, y: kart.y })
        if (trail.length > 24) trail.shift()
      }
    }

    function lap() {
      passedHalf = false
      const time = clock - lapStart
      lapStart = clock
      run.laps++
      run.score += T.lapScore
      const best = !run.bestLap || time < run.bestLap
      if (best) {
        run.bestLap = time
        save.data.kartBestLap = Math.round(time * 100) / 100
        ghost = rec
        fx.float(640, 300, `Best lap ${time.toFixed(2)} s!`, C.lime, 40)
        sfx.cheer()
      } else {
        fx.float(640, 300, `Lap ${time.toFixed(2)} s`, C.ink, 34)
        sfx.goal()
      }
      rec = []
      motion.buzz(40)
      placeCoins()
    }

    // The track is baked once: grass, kerbs, asphalt, a dashed centre line, the start line, trees.
    let baked = null
    function bake() {
      const c = document.createElement('canvas')
      c.width = 1280 * 2
      c.height = 800 * 2
      const g = c.getContext('2d')
      g.scale(2, 2)
      g.fillStyle = '#1f6f5c'
      g.fillRect(0, 0, 1280, 800)
      g.fillStyle = 'rgba(255,255,255,0.04)'
      for (let x = -800; x < 1280; x += 48) {
        g.beginPath()
        g.moveTo(x, 800)
        g.lineTo(x + 24, 800)
        g.lineTo(x + 824, 0)
        g.lineTo(x + 800, 0)
        g.fill()
      }
      const path = () => {
        g.beginPath()
        TRACK.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
        g.closePath()
      }
      g.lineJoin = 'round'
      g.lineCap = 'round'
      // shadow, kerbs (red and white), asphalt, centre line
      g.save()
      g.translate(5, 8)
      path()
      g.strokeStyle = 'rgba(3,5,18,0.4)'
      g.lineWidth = T.width + 18
      g.stroke()
      g.restore()
      path()
      g.strokeStyle = '#fff7ea'
      g.lineWidth = T.width + 16
      g.stroke()
      path()
      g.strokeStyle = C.red
      g.setLineDash([22, 22])
      g.stroke()
      g.setLineDash([])
      path()
      g.strokeStyle = '#2b3a78'
      g.lineWidth = T.width
      g.stroke()
      path()
      g.strokeStyle = 'rgba(255,255,255,0.25)'
      g.lineWidth = 4
      g.setLineDash([18, 22])
      g.stroke()
      g.setLineDash([])
      // start line: a checkered band across the track
      const s = TRACK[0]
      g.save()
      g.translate(s.x, s.y)
      g.rotate(Math.atan2(s.ty, s.tx))
      for (let k = 0; k < 8; k++)
        for (let j = 0; j < 2; j++) {
          g.fillStyle = (k + j) % 2 ? C.dark : '#fff7ea'
          g.fillRect(-12 + j * 12, -T.width / 2 + (k * T.width) / 8, 12, T.width / 8)
        }
      g.restore()
      // trees in the infield and round the edge, kept off the track
      const trees = [[420, 420], [520, 520], [640, 460], [860, 560], [980, 430], [340, 560], [760, 300], [1030, 330], [90, 300], [90, 640], [1230, 120], [1230, 760], [430, 280]]
      for (const [x, y] of trees) {
        groundShadow(g, x + 8, y + 12, 30, 14, 0.45)
        gloss(g, x, y, 26, shade(C.lime, -0.25), { edge: 4 })
      }
      baked = c
    }

    function drawKart(ctx, x, y, h, color, alpha = 1) {
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(x, y)
      if (alpha === 1) groundShadow(ctx, 4, 7, 26, 15, 0.45)
      ctx.rotate(h)
      ctx.fillStyle = C.dark
      for (const [wx, wy] of [[-13, -12], [9, -12], [-13, 12], [9, 12]]) {
        rrect(ctx, wx - 5, wy - 4, 11, 8, 2)
        ctx.fill()
      }
      rrect(ctx, -17, -10, 34, 20, 7)
      ctx.lineWidth = 3
      ctx.strokeStyle = C.dark
      ctx.stroke()
      glossFill(ctx, color, -17, -10, 34, 20)
      // driver's helmet
      gloss(ctx, -3, 0, 6, '#fff7ea', { edge: 2 })
      ctx.restore()
    }

    function draw(ctx) {
      if (!baked) bake()
      ctx.drawImage(baked, 0, 0, 1280, 800)
      for (const c of coins) {
        if (c.taken) continue
        const w = Math.abs(Math.cos(c.spin)) * 11 + 2
        groundShadow(ctx, c.x + 3, c.y + 9, 10, 4, 0.4)
        ctx.beginPath()
        ctx.ellipse(c.x, c.y, w, 12, 0, 0, Math.PI * 2)
        ctx.lineWidth = 3
        ctx.strokeStyle = C.dark
        ctx.stroke()
        ctx.fillStyle = C.gold
        ctx.fill()
      }
      // the ghost of your best lap, driving the same moment of its lap
      if (ghost?.length) {
        const g = ghost[Math.min(ghost.length - 1, Math.floor((clock - lapStart) * 15))]
        drawKart(ctx, g.x, g.y, g.h, C.violet, 0.4)
      }
      // tyre marks while sliding
      ctx.strokeStyle = 'rgba(10,15,34,0.25)'
      ctx.lineWidth = 6
      ctx.beginPath()
      trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.stroke()
      drawKart(ctx, kart.x, kart.y, kart.h, C.orange)
      // the wheel: how far you're turning (so the input is visible)
      const wx = 1180
      const wy = 700
      ctx.save()
      ctx.translate(wx, wy)
      ctx.rotate(kart.steer * 1.2)
      ctx.lineWidth = 10
      ctx.strokeStyle = C.dark
      ctx.beginPath()
      ctx.arc(0, 0, 40, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = 6
      ctx.strokeStyle = C.ink
      ctx.stroke()
      ctx.fillStyle = C.ink
      ctx.fillRect(-4, -40, 8, 40)
      ctx.restore()
      if (run.bestLap) text(ctx, `Best ${run.bestLap.toFixed(2)} s`, 40, 128, { size: 22, weight: 800, align: 'left', outline: 6 })
      text(ctx, `This lap ${(clock - lapStart).toFixed(1)} s`, 40, 158, { size: 22, weight: 700, align: 'left', outline: 6 })
    }

    return run
  }
}
