// Star Courier: grab parcels, dodge asteroids, beat the clock. The template's first sample game,
// now one cabinet in the sampler. Style: lit vector (star-courier/art.js draws and bakes it).
import { W, H, rand, label } from '../common.js'
import { PAL, bake, blit, bakeShip, bakeRocks, bakeParcel, bakeGlow, drawShip as drawShipArt, drawFlame, drawRock, drawBackdrop, drawVignette } from './star-courier/art.js'

const TUNING = { roundSeconds: 60, thrust: 900, boost: 1500, drag: 0.12, rockPenalty: 5, rocksEvery: 4 }

// Art: baked once at 2–3×, blitted every frame (the first time a run is made).
let ART = null
const art = () =>
  (ART ??= {
    ship: bakeShip(),
    rocks: bakeRocks(6),
    parcel: bakeParcel(),
    glowAmber: bakeGlow(PAL.amber, 40),
    glowRed: bakeGlow(PAL.danger, 24),
    backdrop: bake(W, H, (g) => (g.translate(-W / 2, -H / 2), drawBackdrop(g, W, H)), 2)
  })

export default {
  id: 'star-courier',
  name: 'Star Courier',
  blurb: 'Grab parcels, dodge rocks',
  scoreLabel: 'parcels delivered',
  style: { bg: '#141a3a', accent: PAL.amber },
  medals: [15, 25, 35],
  music: { bpm: 112, root: 45, chords: [0, 3, 5, 7], minor: true, lead: [0, null, 4, null, 2, 4, null, 7], wave: 'triangle', gain: 0.04 },
  TUNING,
  howTo: (input) => (input.mode === 'touch' || input.mode === 'mouse' ? 'Hold where to fly · grab parcels · dodge rocks' : `${input.stickLabel()} to fly · ${input.label('a')} to boost`),
  icon(ctx, x, y, size, t) {
    const a = art()
    ctx.drawImage(a.backdrop.canvas, x - size * 1.6, y - size, size * 3.2, size * 2)
    ctx.save()
    ctx.translate(x, y + Math.sin(t * 2) * 4)
    ctx.rotate(-0.5)
    ctx.scale(size / 90, size / 90)
    drawFlame(ctx, 0.8, t)
    drawShipArt(ctx)
    ctx.restore()
    blit(ctx, a.parcel, x + size * 0.75, y - size * 0.25, Math.sin(t) * 0.2, 1.2)
  },
  create(env) {
    const { input, audio, settings, font } = env
    const T = env.TUNING
    const A = art()
    const PAUSE_ZONE = { x: W - 130, y: 0, w: 130, h: 100 }
    const ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, burn: 0.3 }
    const stars = Array.from({ length: 60 }, () => ({ x: rand(0, W), y: rand(0, H), z: rand(0.3, 1) }))
    let sparks = []
    let trail = []
    let time = T.roundSeconds
    let hitFlash = 0
    let shake = 0
    let rocksHit = 0
    const spawnParcel = () => ({ x: rand(80, W - 80), y: rand(120, H - 80), bob: rand(0, Math.PI * 2) })
    const spawnRock = () => {
      const edge = Math.random() < 0.5
      return { x: edge ? -60 : rand(0, W), y: edge ? rand(0, H) : -60, vx: rand(60, 160) * (Math.random() < 0.5 ? 1 : -1), vy: rand(60, 160), r: rand(22, 44), spin: rand(-2, 2), a: 0, look: A.rocks[Math.floor(Math.random() * A.rocks.length)] }
    }
    let parcels = Array.from({ length: 3 }, spawnParcel)
    let rocks = Array.from({ length: 5 }, spawnRock)
    const burst = (x, y, color, n = 14) => {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2)
        const s = rand(80, 320)
        sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), color })
      }
    }
    const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

    const run = {
      score: 0,
      done: false,
      stats: () => [
        ['Parcels', run.score],
        ['Rocks hit', rocksHit]
      ],
      prompts: (inp) => (inp.mode === 'touch' || inp.mode === 'mouse' ? [] : [['a', 'Boost']]),
      update(dt) {
        for (const s of stars) {
          s.y += 30 * s.z * dt
          if (s.y > H) s.y -= H
        }
        // Stick / keys thrust; a mouse or finger drags the ship towards the pointer.
        let dx = input.x
        let dy = input.y
        const p = input.pointer
        if (p.down && (input.mode === 'mouse' || input.mode === 'touch') && !inside(p, PAUSE_ZONE)) {
          const ax = p.x - ship.x
          const ay = p.y - ship.y
          const d = Math.hypot(ax, ay)
          if (d > 12) ((dx = ax / d), (dy = ay / d))
        }
        const boosting = input.held('a') || input.held('rt')
        const thrust = boosting ? T.boost : T.thrust
        const burn = Math.min(1, Math.hypot(dx, dy)) * (boosting ? 1 : 0.55)
        ship.burn = 0.15 + burn * 0.85
        ship.vx = (ship.vx + dx * thrust * dt) * Math.pow(T.drag, dt)
        ship.vy = (ship.vy + dy * thrust * dt) * Math.pow(T.drag, dt)
        ship.x = Math.max(20, Math.min(W - 20, ship.x + ship.vx * dt))
        ship.y = Math.max(20, Math.min(H - 20, ship.y + ship.vy * dt))
        if (Math.hypot(ship.vx, ship.vy) > 30) ship.angle = Math.atan2(ship.vy, ship.vx)

        time -= dt
        if (time <= 0) {
          time = 0
          shake = 0
          run.done = true
          audio.tone({ freq: 330, dur: 0.5, type: 'triangle', slide: -200 })
          return
        }
        parcels = parcels.map((pc) => {
          pc.bob += dt * 3
          if (Math.hypot(pc.x - ship.x, pc.y - ship.y) < 40) {
            run.score += 1
            burst(pc.x, pc.y, '#ffb547')
            audio.tone({ freq: 660 + run.score * 15, dur: 0.12, slide: 400, gain: 0.15 })
            if (run.score % T.rocksEvery === 0) rocks.push(spawnRock())
            return spawnParcel()
          }
          return pc
        })
        rocks = rocks.map((r) => {
          r.x += r.vx * dt
          r.y += r.vy * dt
          r.a += r.spin * dt
          if (r.x < -100 || r.x > W + 100 || r.y > H + 100) return spawnRock()
          if (Math.hypot(r.x - ship.x, r.y - ship.y) < r.r + 16 && hitFlash <= 0) {
            time = Math.max(0, time - T.rockPenalty)
            hitFlash = 0.6
            rocksHit++
            shake = settings.data.reducedShake ? 0 : 0.35
            burst(ship.x, ship.y, '#ff7a6b', 22)
            audio.noise({ dur: 0.25, gain: 0.3 })
            ship.vx = (ship.x - r.x) * 8
            ship.vy = (ship.y - r.y) * 8
          }
          return r
        })
        hitFlash = Math.max(0, hitFlash - dt)
        shake = Math.max(0, shake - dt)
        sparks = sparks.filter((s) => (s.life -= dt) > 0)
        for (const s of sparks) {
          s.x += s.vx * dt
          s.y += s.vy * dt
        }
        if (burn > 0.1 && trail.length < 90) {
          const bx = ship.x - Math.cos(ship.angle) * 34
          const by = ship.y - Math.sin(ship.angle) * 34
          trail.push({ x: bx + rand(-3, 3), y: by + rand(-3, 3), life: 0.45 * burn + 0.1, max: 0.45 * burn + 0.1 })
        }
        trail = trail.filter((t) => (t.life -= dt) > 0)
      },
      draw(ctx) {
        ctx.save()
        if (shake > 0) ctx.translate((Math.random() - 0.5) * 16 * shake, (Math.random() - 0.5) * 16 * shake)
        ctx.fillStyle = PAL.space
        ctx.fillRect(-20, -20, W + 40, H + 40)
        ctx.drawImage(A.backdrop.canvas, 0, 0, W, H)
        for (const s of stars) {
          ctx.fillStyle = `rgba(220,236,255,${0.2 + s.z * 0.5})`
          ctx.fillRect(s.x, s.y, s.z * 2.2, s.z * 2.2)
        }
        ctx.globalCompositeOperation = 'lighter'
        for (const t of trail) {
          const k = t.life / t.max
          ctx.globalAlpha = k * 0.5
          blit(ctx, A.glowAmber, t.x, t.y, 0, 0.25 + (1 - k) * 0.35)
        }
        for (const pc of parcels) {
          ctx.globalAlpha = 0.55 + Math.sin(pc.bob * 1.3) * 0.2
          blit(ctx, A.glowAmber, pc.x, pc.y + Math.sin(pc.bob) * 6, 0, 1.1)
        }
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
        for (const pc of parcels) blit(ctx, A.parcel, pc.x, pc.y + Math.sin(pc.bob) * 6, Math.sin(pc.bob * 0.7) * 0.12)
        for (const r of rocks) drawRock(ctx, r.look, r.x, r.y, r.r, r.a)
        if (hitFlash <= 0 || Math.floor(hitFlash * 20) % 2) {
          ctx.save()
          ctx.translate(ship.x, ship.y)
          ctx.rotate(ship.angle)
          drawFlame(ctx, ship.burn, performance.now() / 1000)
          blit(ctx, A.ship, 0, 0)
          ctx.restore()
        }
        ctx.globalCompositeOperation = 'lighter'
        for (const s of sparks) {
          ctx.globalAlpha = Math.min(1, s.life * 2)
          blit(ctx, s.color === PAL.danger ? A.glowRed : A.glowAmber, s.x, s.y, 0, 0.35)
          ctx.fillStyle = '#fff3d6'
          ctx.fillRect(s.x - 2, s.y - 2, 4, 4)
        }
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
        drawVignette(ctx, W, H, 0.5)
        ctx.restore()
        label(ctx, `Parcels ${run.score}`, 32, 52, { font: font(700, 32), color: PAL.amber, edge: 6, edgeColor: PAL.ink, align: 'left' })
        label(ctx, `${Math.ceil(time)}s`, W - 140, 52, { font: font(700, 32), color: time < 10 ? PAL.danger : PAL.text, edge: 6, edgeColor: PAL.ink, align: 'right' })
      }
    }
    return run
  }
}
