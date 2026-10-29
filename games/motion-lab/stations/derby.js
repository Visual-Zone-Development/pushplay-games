// Home Run Derby: ten pitches. Swing the phone like a bat as the ball reaches the plate:
// timing sets the direction (early pulls left, late goes right), swing strength sets the
// distance. Every swing shows how early or late it was read, after the measured phone delay.
import { C, H, W, clamp, easeOut, font, gloss, glossFill, groundShadow, lerp, panel, rand, shade, text } from '../gfx.js'

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
import { swingWord } from './common.js'

const RELEASE = { x: 640, y: 318 }
const PLATE = { x: 640, y: 655 }
/** Where the ball is as it crosses the plate (middle of the strike zone). */
const ZONE = { x: 640, y: 630 }
const SWING_TIME = 0.32 // seconds for the whole swing animation
const CONTACT_AT = 0.45 // fraction of it where the bat is level over the plate
const MAP = { x: 1060, y: 520, r: 210 }

export default {
  id: 'derby',
  name: 'Home Run Derby',
  blurb: 'Swing for the fences',
  phoneHint: 'Hold the phone like a bat. Swing hard as the ball reaches the plate.',
  // One swing per pitch: a long gap stops the follow-through counting as a second swing.
  // Timed at the moment the phone moves fastest (where a bat meets the ball), not at the
  // push's peak, which comes ~0.1 s earlier and made every swing need to start late.
  swing: { scale: 1, cd: 600, at: 'flip', gyro: true },
  music: { bpm: 120, root: 52, gain: 0.05, chords: [0, 5, 7, 5] },
  format: (v) => `${v} m`,
  medalLabel: (v) => `${v} m`,
  icon(ctx, x, y, s) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-0.7)
    ctx.strokeStyle = C.dark
    ctx.lineWidth = s * 0.06
    ctx.beginPath()
    ctx.roundRect(-s * 0.08, -s * 0.5, s * 0.16, s * 0.8, s * 0.08)
    ctx.stroke()
    glossFill(ctx, C.orange, -s * 0.08, -s * 0.5, s * 0.16, s * 0.8)
    ctx.restore()
    gloss(ctx, x + s * 0.24, y - s * 0.22, s * 0.15, '#f4f6fb', { edge: s * 0.05 })
  },
  howTo: () => 'Swing as the ball arrives: early pulls left, late goes right',
  create(env) {
    const { motion, sfx, fx, input, TUNING } = env
    const T = TUNING.derby
    // The station's own clock stops while paused; swings arrive on the TV clock, so convert.
    let clock = 0
    let offset = performance.now() / 1000
    const now = () => clock
    let pitch = 0
    let phase = 'wait'
    let timer = T.waitTime
    let flight = 1
    let curve = 0
    let releasedAt = 0 // TV clock
    let pt = 0 // 0..1 along the pitch
    let swingAt = -99 // station clock time the last swing peaked (when the bat is over the plate)
    let lastErr = null // the last swing's timing error, for the meter
    // Learned from your swings: how late your swings read, so steady bias stops costing hits. Kept per
    // player with a phone (every phone and hand is different), or for the controller.
    let calib = (motion.phoneLive ? motion.calib('derby') : null) ?? env.save?.data.derbyCalib ?? 0
    let hit = null // { dist, angle, t, homer, foul }
    let lastRead = '' // how the last swing was read
    const errors = []
    const run = {
      score: 0,
      done: false,
      hits: 0,
      homers: 0,
      longest: 0,
      update,
      draw,
      hudRight: () => `Pitch ${Math.min(pitch + 1, T.pitches)}/${T.pitches}`,
      stats: () => [
        ['Hits', `${run.hits} / ${T.pitches}`],
        ['Home runs', run.homers],
        ['Longest', `${run.longest} m`],
        ['Average timing', errors.length ? `${Math.round((errors.reduce((a, b) => a + Math.abs(b), 0) / errors.length) * 1000)} ms off` : '-']
      ],
      prompts: () => [
        ['a', 'Swing'],
        ['menu', 'Pause']
      ]
    }

    function nextPitch() {
      pitch++
      hit = null
      if (pitch >= T.pitches) {
        run.done = true
        return
      }
      phase = 'wait'
      timer = T.waitTime
    }

    function update(dt) {
      clock += dt
      offset = performance.now() / 1000 - clock
      if (hit) hit.t += dt
      timer -= dt
      const swing = motion.swings[0]
      if (swing) {
        swingAt = Math.min(clock, swing.t - offset - calib)
        sfx.whoosh(swing.power)
      }

      if (phase === 'wait' || phase === 'windup') {
        if (swing) {
          fx.float(640, 520, `Practice swing ${Math.round(swing.power * 100)}%`, C.quiet, 26)
          lastRead = ''
        }
        if (timer <= 0 && phase === 'wait') {
          phase = 'windup'
          timer = T.windup
        } else if (timer <= 0) {
          phase = 'pitch'
          const k = pitch / (T.pitches - 1)
          flight = lerp(T.flightStart, T.flightEnd, k) * rand(0.92, 1.08)
          if (pitch >= 4 && pitch % 3 === 1) flight *= 1.3 // changeup
          curve = pitch >= 2 ? rand(-1, 1) * Math.min(1, k + 0.3) : 0
          releasedAt = now()
          pt = 0
          sfx.click()
        }
        return
      }

      if (phase === 'pitch') {
        pt = (now() - releasedAt) / flight
        const arrive = releasedAt + flight
        if (swing) {
          const raw = swing.t - offset - arrive
          const err = raw - calib
          // Learn a steady bias slowly; a single early or late swing still pulls or goes the other way.
          if (Math.abs(raw) < 0.5) {
            calib = clamp(calib + err * T.learn, -T.learnMax, T.learnMax)
            if (swing.src === 'phone') motion.setCalib('derby', calib)
            else if (env.save) env.save.data.derbyCalib = calib // kept for the next round
          }
          errors.push(err)
          lastErr = err
          lastRead = err < 0 ? `${Math.round(-err * 1000)} ms early` : `${Math.round(err * 1000)} ms late`
          if (Math.abs(err) <= T.window) contact(err, swing.power)
          else {
            strike(err < 0 ? 'Too early!' : 'Too late!')
          }
          return
        }
        // Wait for a late phone message a little past the plate, then call it.
        if (now() > arrive + calib + T.window + motion.lag + 0.15) {
          lastRead = 'no swing'
          strike('Strike!')
        }
        return
      }

      if (phase === 'result' && timer <= 0) nextPitch()
    }

    function contact(err, power) {
      // Timing decides where it goes: early pulls to left field, on time goes up the middle,
      // late goes the other way. Only the very edges of the window go foul. Within the sweet
      // spot timing costs no distance.
      const off = Math.max(0, Math.abs(err) - T.sweet) / (T.window - T.sweet)
      const q = 1 - off
      const dist = Math.round(T.minDist + (T.maxDist - T.minDist) * power ** 0.8 * (0.4 + 0.6 * q))
      const side = clamp(err / T.window, -1, 1)
      const angle = (side / T.foulAt) * T.foulAngle
      const foul = Math.abs(side) > T.foulAt
      const where = foul ? '' : side < -0.3 ? 'Pulled to left field' : side > 0.3 ? 'Opposite field' : 'Up the middle'
      hit = { dist: foul ? 0 : dist, full: dist, angle, t: 0, homer: !foul && dist >= T.fence, foul, where }
      phase = 'result'
      timer = 2.4
      sfx.crack(power)
      motion.buzz(hit.homer ? 120 : 50)
      fx.hitstop(0.09)
      fx.kick(hit.homer ? 14 : 8)
      fx.blink(0.3)
      fx.burst(PLATE.x, PLATE.y - 20, C.ink, 18, 500, { life: 0.4, gravity: 0 })
      if (!foul) {
        run.hits++
        run.score += dist
        run.longest = Math.max(run.longest, dist)
        if (hit.homer) {
          run.homers++
          setTimeout(() => sfx.cheer(), 450)
        }
      } else sfx.miss()
    }
    function strike(label) {
      phase = 'result'
      timer = 1.4
      hit = null
      sfx.miss()
      sfx.thud()
      fx.float(640, 470, label, C.pink, 56)
      motion.buzz(30)
    }

    // The ballpark is baked once: a sky with a warm glow low on the horizon, stands with a
    // crowd, a padded fence, mown grass that converges toward the mound, and a dirt path.
    let field = null
    function bakeField() {
      const c = document.createElement('canvas')
      c.width = W * 2
      c.height = H * 2
      const g = c.getContext('2d')
      g.scale(2, 2)
      const sky = g.createLinearGradient(0, 0, 0, 290)
      sky.addColorStop(0, '#3a8cf0')
      sky.addColorStop(0.7, '#7cc8ff')
      sky.addColorStop(1, '#c8ecff')
      g.fillStyle = sky
      g.fillRect(0, 0, W, 300)
      const sun = g.createRadialGradient(300, 230, 0, 300, 230, 420)
      sun.addColorStop(0, 'rgba(255,240,200,0.55)')
      sun.addColorStop(1, 'rgba(255,240,200,0)')
      g.fillStyle = sun
      g.fillRect(0, 0, W, 300)
      // soft clouds, lit from above
      for (const [cx, cy, s] of [[180, 110, 1], [930, 80, 1.3], [1160, 160, 0.8]]) {
        for (const [dx, dy, r] of [[-40, 8, 32], [0, -6, 42], [42, 6, 34], [10, 14, 34]]) {
          const cg = g.createLinearGradient(0, cy + (dy - r) * s, 0, cy + (dy + r) * s)
          cg.addColorStop(0, 'rgba(255,255,255,0.95)')
          cg.addColorStop(1, 'rgba(205,225,250,0.9)')
          g.fillStyle = cg
          g.beginPath()
          g.arc(cx + dx * s, cy + dy * s, r * s, 0, Math.PI * 2)
          g.fill()
        }
      }
      // stands: a dark band with a speckled crowd, hazed by distance
      g.fillStyle = '#3c4a7a'
      g.fillRect(0, 214, W, 70)
      g.fillStyle = '#2c385f'
      g.fillRect(0, 214, W, 6)
      let q = 11
      const rnd = () => ((q = (q * 16807) % 2147483647) / 2147483647)
      const crowd = ['#ff8a3d', '#2ad1c9', '#ffd23f', '#eef2ff', '#ff5c8a', '#a98bff']
      for (let i = 0; i < 900; i++) {
        g.fillStyle = crowd[Math.floor(rnd() * crowd.length)]
        g.globalAlpha = 0.55
        g.fillRect(rnd() * W, 224 + rnd() * 54, 3, 3)
      }
      g.globalAlpha = 1
      const haze = g.createLinearGradient(0, 214, 0, 284)
      haze.addColorStop(0, 'rgba(180,215,255,0.35)')
      haze.addColorStop(1, 'rgba(180,215,255,0)')
      g.fillStyle = haze
      g.fillRect(0, 214, W, 70)
      // grass, darker toward the camera, with mowing stripes converging on the mound
      const grass = g.createLinearGradient(0, 290, 0, H)
      grass.addColorStop(0, '#3fb36a')
      grass.addColorStop(1, '#1f7a43')
      g.fillStyle = grass
      g.fillRect(0, 290, W, H - 290)
      g.save()
      g.beginPath()
      g.rect(0, 290, W, H - 290)
      g.clip()
      g.fillStyle = 'rgba(0,40,10,0.14)'
      for (let i = -12; i < 12; i += 2) {
        g.beginPath()
        g.moveTo(RELEASE.x + i * 60, 290)
        g.lineTo(RELEASE.x + (i + 1) * 60, 290)
        g.lineTo(RELEASE.x + (i + 1) * 260, H)
        g.lineTo(RELEASE.x + i * 260, H)
        g.fill()
      }
      g.restore()
      // the fence: green padding with a yellow top line and a soft shadow on the grass
      g.fillStyle = 'rgba(0,30,10,0.35)'
      g.fillRect(0, 300, W, 10)
      const pad = g.createLinearGradient(0, 278, 0, 302)
      pad.addColorStop(0, '#2b8a52')
      pad.addColorStop(1, '#155c33')
      g.fillStyle = pad
      g.fillRect(0, 280, W, 22)
      g.fillStyle = C.gold
      g.fillRect(0, 278, W, 4)
      g.fillStyle = C.dark
      g.fillRect(0, 302, W, 2)
      // the dirt path, lit toward the far end, with speckles
      g.beginPath()
      g.moveTo(PLATE.x - 520, H)
      g.lineTo(RELEASE.x - 70, 330)
      g.lineTo(RELEASE.x + 70, 330)
      g.lineTo(PLATE.x + 520, H)
      g.closePath()
      const dirt = g.createLinearGradient(0, 330, 0, H)
      dirt.addColorStop(0, '#e0a56a')
      dirt.addColorStop(1, '#b47640')
      g.fillStyle = dirt
      g.fill()
      g.save()
      g.clip()
      for (let i = 0; i < 1400; i++) {
        const y = 330 + rnd() ** 0.7 * (H - 330)
        g.fillStyle = rnd() < 0.5 ? 'rgba(90,50,20,0.25)' : 'rgba(255,230,190,0.25)'
        const sz = 1 + ((y - 330) / (H - 330)) * 3
        g.fillRect(rnd() * W, y, sz, sz * 0.6)
      }
      g.restore()
      // chalk foul lines
      g.strokeStyle = 'rgba(255,255,255,0.75)'
      g.lineWidth = 3
      for (const side of [-1, 1]) {
        g.beginPath()
        g.moveTo(PLATE.x + side * 40, PLATE.y + 60)
        g.lineTo(PLATE.x + side * 900, PLATE.y - 300)
        g.stroke()
      }
      // the mound
      const mound = g.createRadialGradient(RELEASE.x - 20, 338, 4, RELEASE.x, 345, 75)
      mound.addColorStop(0, '#f0b87e')
      mound.addColorStop(1, '#c3854c')
      g.fillStyle = mound
      g.beginPath()
      g.ellipse(RELEASE.x, 345, 70, 16, 0, 0, Math.PI * 2)
      g.fill()
      // home plate with a lit top
      g.beginPath()
      g.moveTo(PLATE.x - 40, PLATE.y + 50)
      g.lineTo(PLATE.x + 40, PLATE.y + 50)
      g.lineTo(PLATE.x + 40, PLATE.y + 64)
      g.lineTo(PLATE.x, PLATE.y + 80)
      g.lineTo(PLATE.x - 40, PLATE.y + 64)
      g.closePath()
      g.lineWidth = 4
      g.strokeStyle = 'rgba(60,30,10,0.6)'
      g.stroke()
      glossFill(g, '#f4f6fb', PLATE.x - 40, PLATE.y + 50, 80, 30)
      field = c
    }

    function draw(ctx) {
      if (!field) bakeField()
      ctx.drawImage(field, 0, 0, W, H)
      // Strike zone.
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.lineWidth = 4
      ctx.setLineDash([10, 8])
      ctx.strokeRect(PLATE.x - 70, PLATE.y - 90, 140, 130)
      ctx.setLineDash([])

      drawPitcher(ctx)
      // The ball passes the batter, so it's drawn over them once it's at the plate.
      const late = phase === 'pitch' && pt > 0.85
      if (phase === 'pitch' && !late) drawBall(ctx)
      drawBatter(ctx)
      if (late) drawBall(ctx)
      if (hit) drawHit(ctx)

      if (lastRead) {
        text(ctx, `Last swing: ${lastRead}`, 40, 130, { size: 24, weight: 800, align: 'left', outline: 6 })
        drawMeter(ctx, 40, 160)
        if (Math.abs(calib) >= 0.02) text(ctx, `Timing auto-adjust ${calib > 0 ? '+' : ''}${Math.round(calib * 1000)} ms`, 40, 222, { size: 18, weight: 700, align: 'left', color: C.ink, outline: 5 })
      }
      if (phase === 'wait' && !hit) text(ctx, swingWord(motion, input), 640, 470, { size: 30, weight: 800, outline: 8 })
    }

    function drawPitcher(ctx) {
      const wind = phase === 'windup' ? 1 - timer / T.windup : 0
      const x = RELEASE.x
      const y = 300
      groundShadow(ctx, x + 6, y + 36, 30, 8, 0.4)
      ctx.strokeStyle = C.dark
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.roundRect(x - 16, y - 10, 32, 44, 10)
      ctx.stroke()
      glossFill(ctx, '#eef1f8', x - 16, y - 10, 32, 44)
      gloss(ctx, x, y - 24, 14, '#f4d3b8', { edge: 4, shine: 0.6 })
      ctx.fillStyle = C.pink
      ctx.fillRect(x - 15, y - 38, 30, 9)
      ctx.fillStyle = shade(C.pink, -0.35)
      ctx.fillRect(x - 15, y - 31, 30, 2)
      // Throwing arm winds back, then snaps forward.
      const a = phase === 'windup' ? -Math.PI / 2 - wind * 2.2 : phase === 'pitch' && pt < 0.2 ? 0.8 : 0.4
      ctx.lineWidth = 9
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x + 14, y)
      ctx.lineTo(x + 14 + Math.cos(a) * 30, y + Math.sin(a) * 30)
      ctx.stroke()
    }

    /** 0 at the pitcher, 1 over the plate: true perspective, so it grows fast at the end. */
    function depth(t) {
      const z = (u) => 1 / (T.camera + T.distance * (1 - u))
      return (z(t) - z(0)) / (z(1) - z(0))
    }

    function drawBall(ctx) {
      const t = clamp(pt, 0, 1.25)
      const k = depth(t)
      const x = lerp(RELEASE.x, ZONE.x, k) + Math.sin(Math.PI * Math.min(t, 1)) * curve * 70
      const y = lerp(RELEASE.y, ZONE.y, k)
      const r = lerp(5, 24, k)
      // Its shadow runs down the dirt and sits on the plate as the ball crosses it.
      groundShadow(ctx, x, lerp(345, PLATE.y + 62, k), r * 1.3, r * 0.45, 0.4)
      gloss(ctx, x, y, r, '#f6f7fb', { edge: Math.max(2, r * 0.15), shine: 0.9 })
      ctx.strokeStyle = C.red
      ctx.lineWidth = Math.max(1.5, r * 0.1)
      ctx.beginPath()
      ctx.arc(x - r * 0.9, y, r * 0.7, -0.9, 0.9)
      ctx.stroke()
    }

    /**
     * A right-handed batter, seen from behind the catcher: stands left of the plate, bat up
     * over the right shoulder, and sweeps it across the plate. The swing is drawn from the
     * moment it peaked, so the bat is level over the plate at the instant it counted.
     */
    function drawBatter(ctx) {
      const bx = 470
      const by = 772
      const p = (clock - swingAt) / SWING_TIME + CONTACT_AT
      const swinging = p < 1
      const turn = swinging ? clamp((p - 0.2) / 0.6, 0, 1) : 0
      ctx.save()
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.strokeStyle = C.dark
      ctx.lineWidth = 6
      // Legs.
      groundShadow(ctx, bx + 30, by + 4, 150, 30, 0.45)
      for (const [lx, w] of [[-46, 34], [14, 34]]) {
        ctx.beginPath()
        ctx.roundRect(bx + lx, by - 150, w, 150, 12)
        ctx.stroke()
        glossFill(ctx, '#e9edf7', bx + lx, by - 150, w, 150)
      }
      // Torso turns toward the pitcher as the swing comes through.
      ctx.beginPath()
      ctx.roundRect(bx - 58 + turn * 10, by - 300, 104 - turn * 18, 168, 30)
      ctx.stroke()
      glossFill(ctx, C.teal, bx - 58 + turn * 10, by - 300, 104 - turn * 18, 168)
      // the lit rim of the jersey and a darker side away from the light
      ctx.save()
      ctx.clip()
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.fillRect(bx - 58 + turn * 10, by - 300, 14, 168)
      ctx.fillStyle = 'rgba(8,10,40,0.18)'
      ctx.fillRect(bx + 46 - turn * 8 - 18, by - 300, 18, 168)
      ctx.restore()
      ctx.fillStyle = C.ink
      ctx.font = font(900, 40)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      if (turn < 0.5) ctx.fillText('7', bx - 6, by - 220)
      // Helmet with its brim toward the plate.
      ctx.beginPath()
      ctx.ellipse(bx + 40, by - 326, 24, 9, 0.2, 0, Math.PI * 2)
      ctx.fillStyle = shade(C.pink, -0.25)
      ctx.fill()
      ctx.stroke()
      gloss(ctx, bx + 4, by - 334, 40, C.pink, { edge: 6 })

      // Hands and bat. Angle 0 points straight up; the swing turns it clockwise, level over
      // the plate (pointing right) at contact, then on into the follow-through.
      const hx = bx + 40 + turn * 30
      const hy = by - 190 + turn * 15
      // The barrel comes down from over the back shoulder, level across the plate at contact,
      // then wraps up and away over the front shoulder (shorter: it's swinging into the scene).
      let a = -0.45
      let len = 1
      const finish = { a: 0.55, len: 0.62 }
      if (swinging && p < CONTACT_AT) a = lerp(-0.45, Math.PI / 2, easeInOut(clamp(p / CONTACT_AT, 0, 1)))
      else if (swinging) {
        const e = easeOut((p - CONTACT_AT) / (1 - CONTACT_AT))
        a = lerp(Math.PI / 2, finish.a, e)
        len = lerp(1, finish.len, e)
      } else if (clock - swingAt < 0.8) ({ a, len } = finish) // holding the follow-through
      ctx.translate(hx, hy)
      ctx.rotate(a)
      ctx.scale(1, len)
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(-8, 10)
      ctx.lineTo(8, 10)
      ctx.lineTo(17, -230)
      ctx.arc(0, -230, 17, 0, Math.PI, true)
      ctx.closePath()
      ctx.stroke()
      const bat = ctx.createLinearGradient(-17, 0, 17, 0)
      bat.addColorStop(0, shade(C.orange, 0.3))
      bat.addColorStop(0.55, C.orange)
      bat.addColorStop(1, shade(C.orange, -0.35))
      ctx.fillStyle = bat
      ctx.fill()
      ctx.fillStyle = C.dark
      ctx.fillRect(-10, -14, 20, 26) // gloves
      ctx.restore()
    }

    /** Where the last swing landed: early pulls left, late goes right. */
    function drawMeter(ctx, x, y) {
      const w = 300
      panel(ctx, x, y, w, 40, { fill: 'rgba(10,15,34,0.75)', r: 12, lw: 3 })
      const sweet = (T.sweet / T.window) * (w / 2)
      ctx.fillStyle = 'rgba(182,240,74,0.45)'
      ctx.fillRect(x + w / 2 - sweet, y + 4, sweet * 2, 32)
      text(ctx, 'early', x + 12, y + 20, { size: 16, weight: 800, align: 'left', color: C.quiet })
      text(ctx, 'late', x + w - 12, y + 20, { size: 16, weight: 800, align: 'right', color: C.quiet })
      if (lastErr === null) return
      const mx = x + w / 2 + clamp(lastErr / T.window, -1.1, 1.1) * (w / 2 - 8)
      ctx.fillStyle = Math.abs(lastErr) <= T.window ? C.gold : C.pink
      ctx.fillRect(mx - 4, y - 4, 8, 48)
    }

    function drawHit(ctx) {
      const k = clamp(hit.t / 1.5, 0, 1)
      // The ball climbs and shrinks into the sky in its direction.
      const bx = PLATE.x + Math.sin(hit.angle) * 700 * easeOut(k)
      const by = PLATE.y - 60 - Math.sin(Math.PI * k * 0.8) * 520 - k * 80
      const r = lerp(22, 4, easeOut(k))
      gloss(ctx, bx, by, r, '#f6f7fb', { edge: 3 })

      // Field map with the landing spot.
      panel(ctx, MAP.x - MAP.r - 20, MAP.y - MAP.r - 30, MAP.r * 2 + 40, MAP.r + 70, { fill: 'rgba(10,15,34,0.8)', r: 18, lw: 4 })
      ctx.fillStyle = '#2f9e5a'
      ctx.beginPath()
      ctx.moveTo(MAP.x, MAP.y)
      ctx.arc(MAP.x, MAP.y, MAP.r, -Math.PI / 2 - T.foulAngle, -Math.PI / 2 + T.foulAngle)
      ctx.closePath()
      ctx.fill()
      const fr = (T.fence / T.maxDist) * MAP.r
      ctx.strokeStyle = C.gold
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(MAP.x, MAP.y, fr, -Math.PI / 2 - T.foulAngle, -Math.PI / 2 + T.foulAngle)
      ctx.stroke()
      const d = (hit.full / T.maxDist) * MAP.r * easeOut(k)
      const lx = MAP.x + Math.sin(hit.angle) * d
      const ly = MAP.y - Math.cos(hit.angle) * d
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.moveTo(MAP.x, MAP.y)
      ctx.lineTo(lx, ly)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(lx, ly, 8, 0, Math.PI * 2)
      ctx.fill()
      const shown = Math.round(hit.full * easeOut(k))
      const label = hit.foul ? 'FOUL' : k >= 1 && hit.homer ? 'HOME RUN!' : `${shown} m`
      text(ctx, label, 640, 200, { size: hit.homer && k >= 1 ? 90 : 72, weight: 900, color: hit.foul ? C.pink : hit.homer && k >= 1 ? C.gold : C.ink, outline: 14 })
      if (hit.where) text(ctx, hit.where, 640, 262, { size: 30, weight: 800, outline: 8 })
      if (k >= 1 && hit.homer && !hit.burst) {
        hit.burst = true
        fx.burst(640, 200, C.gold, 40, 600)
        fx.burst(640, 200, C.pink, 30, 500)
      }
    }

    return run
  }
}
