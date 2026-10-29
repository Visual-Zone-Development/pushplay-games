// Maraca Rhythm: shake on the beat. Notes slide into the ring; shake as each one lands. Gold
// star notes want a hard shake. The two-bar count-in measures how late your shakes arrive and
// corrects for it, so the phone's delay doesn't cost you.
import { C, H, W, clamp, gloss, glossFill, groundShadow, panel, rgba, shade, star, text } from '../gfx.js'
import { swingWord } from './common.js'

const RING = { x: 300, y: 440 }
// Patterns per section, one bar of eighths: x note, X big note, . rest.
const SECTIONS = [
  { from: 0, pats: ['x...x...', 'x...x...', 'x.......'] },
  { from: 6, pats: ['x.x.x.x.', 'x.x.X...', 'x...x.x.'] },
  { from: 12, pats: ['x.x.x.xx', 'x.xx..x.', 'X...x.x.', 'x.x.xx..'] },
  { from: 18, pats: ['x.xx.xx.', 'xx..x.X.', 'x.x.x.xx', '.x.x.x.X'] },
  { from: 24, pats: ['xx.xx.x.', 'x.xxx.X.', 'X.x.xx.x', 'x.x.X.X.'] }
]

export default {
  id: 'rhythm',
  name: 'Maraca Rhythm',
  blurb: 'Shake on the beat',
  phoneHint: 'Shake the phone like a maraca as each note hits the ring. Gold stars: shake hard!',
  // Shakes are smaller than flicks, and come fast.
  swing: { scale: 0.75, cd: 170, gyro: true },
  format: (v) => `${v}`,
  medalFor(score, run) {
    return this.medals.filter((m) => run.accuracy >= m).length
  },
  medalValue: (score, run) => run.accuracy,
  medalLabel: (v) => `${Math.round(v * 100)}% accuracy`,
  icon(ctx, x, y, s) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(0.5)
    ctx.fillStyle = C.dark
    ctx.fillRect(-s * 0.05, 0, s * 0.1, s * 0.48)
    ctx.strokeStyle = C.dark
    ctx.lineWidth = s * 0.06
    ctx.beginPath()
    ctx.ellipse(0, -s * 0.15, s * 0.24, s * 0.3, 0, 0, Math.PI * 2)
    ctx.stroke()
    glossFill(ctx, C.pink, -s * 0.24, -s * 0.45, s * 0.48, s * 0.6)
    ctx.strokeStyle = C.gold
    ctx.beginPath()
    ctx.moveTo(-s * 0.22, -s * 0.12)
    ctx.lineTo(s * 0.22, -s * 0.12)
    ctx.stroke()
    ctx.restore()
  },
  howTo: () => 'Shake as each note hits the ring',
  create(env) {
    const { motion, sfx, fx, seq, input, TUNING } = env
    const T = TUNING.rhythm
    const step = 60 / T.bpm / 2
    const notes = []
    let started = false
    let offset = 0 // TV clock minus song clock
    let calib = (motion.phoneLive ? motion.calib('rhythm') : null) ?? 0 // this player's last delay, until the count-in measures it again
    const calibSamples = []
    let calibrated = false
    let combo = 0
    let shakeAnim = 0
    let judge = null // { label, color, t }
    const countInSteps = T.countIn * 2

    // Build the chart.
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let bar = 2; bar < T.bars; bar++) {
      const sec = [...SECTIONS].reverse().find((s) => bar - 2 >= s.from)
      const pat = sec.pats[Math.floor(rnd() * sec.pats.length)]
      ;[...pat].forEach((c, i) => {
        if (c !== '.') notes.push({ t: (bar * 8 + i) * step, big: c === 'X', state: 'wait' })
      })
    }
    const total = notes.length
    const endTime = T.bars * 8 * step + 1.2

    const song = {
      bpm: T.bpm,
      steps: 8,
      step(i, delay) {
        const s = i % 8
        const bar = Math.floor(i / 8)
        const chord = [0, 0, 5, 7][bar % 4]
        if (i < countInSteps) {
          if (s % 2 === 0) sfx.note(s === 0 ? 96 : 89, { dur: 0.05, type: 'square', gain: 0.12, delay })
          return
        }
        if (bar >= T.bars) return
        if (s % 4 === 0) sfx.note(36, { dur: 0.18, type: 'sine', gain: 0.35, slide: -30, bus: 'music', delay })
        if (s % 4 === 2) sfx.note(45 + chord, { dur: 0.14, type: 'triangle', gain: 0.14, bus: 'music', delay })
        sfx.note([69, 72, 76, 72][s % 4] + chord, { dur: 0.07, type: 'square', gain: 0.035, bus: 'music', delay })
        // A soft woodblock on every note to shake to.
        if (notes.some((n) => Math.abs(n.t - i * step) < 0.001)) sfx.note(91, { dur: 0.03, type: 'triangle', gain: 0.07, delay })
      }
    }

    const run = {
      score: 0,
      done: false,
      perfect: 0,
      good: 0,
      miss: 0,
      bestCombo: 0,
      get accuracy() {
        return total ? (run.perfect + run.good * 0.5) / total : 0
      },
      update,
      draw,
      hudRight: () => {
        const judged = run.perfect + run.good + run.miss
        return judged ? `${Math.round(((run.perfect + run.good * 0.5) / judged) * 100)}%` : '-'
      },
      stats: () => [
        ['Perfect', run.perfect],
        ['Good', run.good],
        ['Missed', run.miss],
        ['Best combo', run.bestCombo],
        ['Timing correction', calibrated ? `${Math.round(calib * 1000)} ms` : 'none']
      ],
      prompts: () => [
        ['a', 'Shake'],
        ['menu', 'Pause']
      ]
    }

    function update(dt) {
      if (!started) {
        started = true
        seq.play(song, -0.3)
      }
      const now = seq.time
      offset = performance.now() / 1000 - now
      shakeAnim = Math.max(0, shakeAnim - dt * 6)
      if (judge) judge.t += dt

      for (const s of motion.swings) {
        const st = s.t - offset
        shakeAnim = 1
        sfx.shaker(s.power > T.bigPower)
        // Count-in: learn the delay from shakes near each beat.
        if (now < countInSteps * step + step) {
          const beat = Math.round(st / (step * 2)) * step * 2
          if (beat < countInSteps * step && Math.abs(st - beat) < step) calibSamples.push(st - beat)
          continue
        }
        const tt = st - calib
        let best = null
        for (const n of notes) {
          if (n.state !== 'wait') continue
          const e = Math.abs(tt - n.t)
          if (e <= T.good && (!best || e < Math.abs(tt - best.t))) best = n
        }
        if (best) hitNote(best, tt - best.t, s)
      }
      if (!calibrated && now >= countInSteps * step) {
        calibrated = true
        if (calibSamples.length >= 3) {
          const sorted = [...calibSamples].sort((a, b) => a - b)
          calib = clamp(sorted[Math.floor(sorted.length / 2)], -0.15, 0.4)
          if (motion.source === 'phone') motion.setCalib('rhythm', calib)
          fx.float(W / 2, 200, `Timing set: ${Math.round(calib * 1000)} ms`, C.teal, 30)
        }
      }
      for (const n of notes) {
        if (n.state === 'wait' && now - n.t > T.good + calib + motion.lag + 0.08) {
          n.state = 'miss'
          run.miss++
          if (combo >= 8) fx.float(RING.x, RING.y - 120, 'Combo lost', C.pink, 26)
          combo = 0
          judge = { label: 'Miss', color: C.pink, t: 0 }
        }
      }
      if (now > endTime) {
        run.done = true
        seq.stop()
      }
    }

    function hitNote(n, err, s) {
      // Keep learning the delay as you play, so steady lateness stops costing points.
      calib = clamp(calib + err * T.learn, -0.15, 0.4)
      calibrated = true
      if (s.src === 'phone') motion.setCalib('rhythm', calib)
      const weak = n.big && s.src === 'phone' && s.power < T.bigPower
      const perfect = Math.abs(err) <= T.perfect && !weak
      n.state = 'hit'
      combo++
      run.bestCombo = Math.max(run.bestCombo, combo)
      if (perfect) run.perfect++
      else run.good++
      const pts = (perfect ? 100 : 50) * (n.big ? 2 : 1)
      run.score += pts + Math.min(combo, 50) * 2
      const late = err > 0 ? 'late' : 'early'
      judge = { label: perfect ? 'Perfect!' : weak ? 'Harder!' : `Good (${late})`, color: perfect ? C.gold : C.teal, t: 0 }
      fx.burst(RING.x, RING.y, n.big ? C.gold : C.teal, n.big ? 26 : 12, n.big ? 520 : 320, { gravity: 200, life: 0.5 })
      if (n.big) fx.kick(6)
      motion.buzz(n.big ? 40 : 15)
    }

    function draw(ctx) {
      const now = seq.time
      const beat = now / (step * 2)
      const pulse = Math.max(0, 1 - (beat - Math.floor(beat)) * 4)
      // A little stage: a floor that catches the light, and spotlights that pulse on the beat.
      const floor = ctx.createLinearGradient(0, 560, 0, H)
      floor.addColorStop(0, 'rgba(90,40,90,0)')
      floor.addColorStop(1, 'rgba(90,40,90,0.45)')
      ctx.fillStyle = floor
      ctx.fillRect(0, 560, W, H - 560)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (const [x, col, k] of [[250, C.pink, 1], [640, C.violet, 0.6], [1030, C.teal, 1]]) {
        const beam = ctx.createLinearGradient(0, 0, 0, H)
        beam.addColorStop(0, rgba(col, 0.1 + pulse * 0.16 * k))
        beam.addColorStop(1, rgba(col, 0))
        ctx.fillStyle = beam
        ctx.beginPath()
        ctx.moveTo(x - 30, 0)
        ctx.lineTo(x + 30, 0)
        ctx.lineTo(x + 220, H)
        ctx.lineTo(x - 220, H)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
      // The lane: a moulded track with beat ticks.
      panel(ctx, -20, RING.y - 74, W + 40, 148, { fill: '#1b2350', r: 30, lw: 6 })
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.lineWidth = 4
      for (let b = Math.floor(beat); b < beat + 8; b++) {
        if (b % 4) continue
        const x = RING.x + (b * step * 2 - now) * T.speed
        ctx.beginPath()
        ctx.moveTo(x, RING.y - 60)
        ctx.lineTo(x, RING.y + 60)
        ctx.stroke()
      }
      // The ring: chrome with a bright lit top.
      const rr = 52 + pulse * 6
      ctx.lineWidth = 14
      ctx.strokeStyle = C.dark
      ctx.beginPath()
      ctx.arc(RING.x, RING.y, rr, 0, Math.PI * 2)
      ctx.stroke()
      const chrome = ctx.createLinearGradient(RING.x - rr, RING.y - rr, RING.x + rr * 0.4, RING.y + rr)
      chrome.addColorStop(0, '#ffffff')
      chrome.addColorStop(0.5, '#b9c4e8')
      chrome.addColorStop(1, '#6a77a8')
      ctx.lineWidth = 8
      ctx.strokeStyle = chrome
      ctx.stroke()
      for (const n of notes) {
        if (n.state === 'hit') continue
        const x = RING.x + (n.t - now) * T.speed
        if (x < -60 || x > W + 60) continue
        ctx.globalAlpha = n.state === 'miss' ? 0.3 : 1
        if (n.big) {
          star(ctx, x, RING.y, 50, 22, 5)
          ctx.lineWidth = 6
          ctx.lineJoin = 'round'
          ctx.strokeStyle = C.dark
          ctx.stroke()
          glossFill(ctx, C.gold, x - 50, RING.y - 50, 100, 100)
          ctx.fillStyle = 'rgba(255,255,255,0.7)'
          ctx.beginPath()
          ctx.ellipse(x - 12, RING.y - 18, 9, 5, -0.6, 0, Math.PI * 2)
          ctx.fill()
        } else gloss(ctx, x, RING.y, 34, C.teal, { edge: 6 })
        ctx.globalAlpha = 1
      }

      // The maraca, which shakes when you do: a glossy gourd on a wooden handle.
      groundShadow(ctx, 170, 770, 110, 22, 0.45)
      ctx.save()
      ctx.translate(150, 640)
      ctx.rotate(-0.4 + Math.sin(shakeAnim * 12) * shakeAnim * 0.5)
      ctx.lineWidth = 6
      ctx.strokeStyle = C.dark
      ctx.beginPath()
      ctx.roundRect(-11, 0, 22, 112, 8)
      ctx.stroke()
      glossFill(ctx, '#b0703c', -11, 0, 22, 112)
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.ellipse(0, -40, 58, 72, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
      // the gourd's light stays at the world's upper left as it shakes
      ctx.save()
      ctx.translate(150, 640)
      const tilt = -0.4 + Math.sin(shakeAnim * 12) * shakeAnim * 0.5
      ctx.rotate(tilt)
      ctx.beginPath()
      ctx.ellipse(0, -40, 58, 72, 0, 0, Math.PI * 2)
      ctx.clip()
      ctx.rotate(-tilt)
      const gourd = ctx.createRadialGradient(-30, -80, 8, 0, -40, 90)
      gourd.addColorStop(0, shade(C.pink, 0.35))
      gourd.addColorStop(0.55, C.pink)
      gourd.addColorStop(1, shade(C.pink, -0.45))
      ctx.fillStyle = gourd
      ctx.fillRect(-120, -160, 240, 240)
      ctx.rotate(tilt)
      ctx.strokeStyle = C.gold
      ctx.lineWidth = 9
      ctx.beginPath()
      ctx.moveTo(-60, -30)
      ctx.lineTo(60, -30)
      ctx.moveTo(-60, -60)
      ctx.lineTo(60, -60)
      ctx.stroke()
      ctx.strokeStyle = shade(C.gold, -0.4)
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(-60, -24)
      ctx.lineTo(60, -24)
      ctx.moveTo(-60, -54)
      ctx.lineTo(60, -54)
      ctx.stroke()
      ctx.rotate(-tilt)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.beginPath()
      ctx.ellipse(-28, -80, 16, 9, -0.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      if (now < countInSteps * step) {
        const n = Math.floor(Math.max(0, now) / (step * 2)) % 4
        text(ctx, now < 0 ? 'Get ready…' : `Shake along: ${n + 1}`, W / 2, 230, { size: 48, weight: 900, outline: 10 })
        text(ctx, 'Setting your timing', W / 2, 285, { size: 26, weight: 700, color: C.quiet, outline: 6 })
      }
      if (judge && judge.t < 0.6) text(ctx, judge.label, RING.x, RING.y - 110 - judge.t * 30, { size: 40, weight: 900, color: judge.color, outline: 10 })
      if (combo >= 4) text(ctx, `${combo} combo`, 640, 600, { size: 40, weight: 900, color: combo >= 20 ? C.gold : C.ink, outline: 10 })
      text(ctx, swingWord(motion, input, 'Shake'), 900, 680, { size: 26, weight: 700, color: C.quiet })
    }

    return run
  }
}
