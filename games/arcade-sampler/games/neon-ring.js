// Neon Ring: twin-stick survival in a glowing circular arena, solo or 2-player co-op.
// Ten waves (chasers, splitters, dashers, orbiters, a boss on waves 5 and 10), three shared lives.
// The rules live in createSim() (pure, no DOM: tools can drive it headlessly with a bot); the
// default export wraps it with input, sound, juice and the neon drawing (glows baked once at 2×).
import { W, H, TAU, clamp, rand, label, createFx } from '../common.js'

const TUNING = {
  arena: { x: 640, y: 404, r: 316 },
  lives: 3,
  invuln: 2.0, // seconds of blinking safety after a hit
  hitClear: 220, // enemy bullets this close vanish when a player is hit
  player: { speed: 400, accel: 16, r: 13 },
  fireRate: 10, // shots per second while aiming
  bulletSpeed: 980,
  bulletLife: 0.75,
  aimDeadzone: 0.35,
  dash: { speed: 1200, time: 0.16, cooldown: 1.0 },
  waveCount: 10,
  breakTime: 2.2, // between waves
  firstBreak: 1.4,
  speedRamp: 0.06, // enemy speed +6% per wave
  spawnTell: 0.7, // seconds a spawn portal glows before the enemy steps out
  maxEnemies: 60,
  maxPBullets: 200,
  maxEBullets: 120,
  clearBonus: 50, // × wave number
  victoryBonus: 1000,
  lifeBonus: 300, // per life left at victory
  hitStop: 0.04, // on kills of big enemies
  bossHitStop: 0.16,
  enemy: {
    chaser: { r: 14, hp: 1, speed: 130, score: 10 },
    mini: { r: 10, hp: 1, speed: 185, score: 5 },
    splitter: { r: 22, hp: 4, speed: 82, score: 25 },
    dasher: { r: 16, hp: 2, speed: 95, charge: 760, tell: 0.65, chargeTime: 0.5, rest: 0.75, range: 340, score: 30 },
    orbiter: { r: 17, hp: 3, speed: 150, orbit: 230, spin: 0.45, fireEvery: 2.4, tell: 0.45, bulletSpeed: 230, score: 40 },
    boss: { r: 54, hp: 70, speed: 62, ringTell: 0.8, chargeTell: 0.9, charge: 600, chargeTime: 0.7, ringBullets: 14, score: 500 }
  },
  // What each wave sends; bosses (waves 5 and 10) also bring escorts.
  waves: [
    { chaser: 6 },
    { chaser: 8, splitter: 2 },
    { chaser: 8, splitter: 3, dasher: 2 },
    { chaser: 8, splitter: 3, dasher: 3, orbiter: 2 },
    { boss: 1, chaser: 8 },
    { chaser: 12, splitter: 4, dasher: 3, orbiter: 2 },
    { chaser: 12, splitter: 4, dasher: 4, orbiter: 3 },
    { chaser: 14, splitter: 5, dasher: 5, orbiter: 4 },
    { chaser: 16, splitter: 6, dasher: 6, orbiter: 5 },
    { boss: 1, chaser: 10, orbiter: 2, dasher: 2 }
  ],
  spawnEvery: [0.8, 0.05, 0.3], // start, minus per wave, floor
  aliveBase: 8, // at most aliveBase + 2 × wave on the field at once
  coopHp: 0.5 // boss hp +50% per extra player
}

const COLORS = {
  bg: '#05040f',
  grid: 'rgba(90,60,200,0.16)',
  ring: '#2af5ff',
  p: ['#2af5ff', '#ff3df0'],
  chaser: '#ff9a2a',
  mini: '#ffc35a',
  splitter: '#7dff4a',
  dasher: '#ffe94a',
  orbiter: '#b07bff',
  boss: '#ff3a6b',
  ebullet: '#ff4a8a',
  white: '#ffffff'
}

// ---- the rules (pure) ------------------------------------------------------------------------

export function createSim(T = TUNING, { players = 1, emit = () => {}, random = Math.random } = {}) {
  const A = T.arena
  const R = (a, b) => a + random() * (b - a)
  const sim = {
    players: [],
    enemies: [],
    markers: [], // spawn portals { x, y, type, t }
    pBullets: [],
    eBullets: [],
    wave: 0,
    phase: 'break', // 'break' | 'fight'
    phaseT: T.firstBreak,
    queue: [],
    spawnT: 0,
    lives: T.lives,
    score: 0,
    kills: 0,
    killsBy: {},
    time: 0,
    hits: 0,
    done: false,
    victory: false,
    boss: null,
    addPlayer,
    update
  }

  function addPlayer() {
    const i = sim.players.length
    const p = { i, x: A.x + (i ? 40 : -40) * (sim.players.length ? 1 : 0), y: A.y + 40, vx: 0, vy: 0, ang: -Math.PI / 2, dashT: 0, dashCd: 0, inv: i ? 1.5 : 0, fireCd: 0, aiming: false, mx: 0, my: 0 }
    if (i === 1) {
      const p0 = sim.players[0]
      p.x = clamp(p0.x + 60, A.x - 200, A.x + 200)
      p.y = p0.y
    }
    sim.players.push(p)
    return p
  }
  for (let i = 0; i < players; i++) addPlayer()

  const nearestPlayer = (x, y) => {
    let best = sim.players[0]
    let bd = Infinity
    for (const p of sim.players) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2
      if (d < bd) ((bd = d), (best = p))
    }
    return best
  }

  function keepInside(o, r) {
    const dx = o.x - A.x
    const dy = o.y - A.y
    const d = Math.hypot(dx, dy)
    const max = A.r - r
    if (d > max) {
      const nx = dx / d
      const ny = dy / d
      o.x = A.x + nx * max
      o.y = A.y + ny * max
      const vn = o.vx * nx + o.vy * ny
      if (vn > 0) ((o.vx -= vn * nx), (o.vy -= vn * ny))
      return true
    }
    return false
  }

  function startWave() {
    sim.wave++
    if (sim.boss && !sim.enemies.includes(sim.boss)) sim.boss = null
    const plan = T.waves[sim.wave - 1] ?? T.waves[T.waves.length - 1]
    const q = []
    for (const [type, n] of Object.entries(plan)) if (type !== 'boss') for (let i = 0; i < n; i++) q.push(type)
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[q[i], q[j]] = [q[j], q[i]]
    }
    if (plan.boss) q.unshift('boss')
    sim.queue = q
    sim.phase = 'fight'
    sim.spawnT = 0.2
    emit('wave', sim.wave, Boolean(plan.boss))
  }

  function portalSpot(r) {
    // the edge point furthest from every player, out of a few tries
    let best = null
    let bestD = -1
    for (let k = 0; k < 5; k++) {
      const a = R(0, TAU)
      const x = A.x + Math.cos(a) * (A.r - r - 6)
      const y = A.y + Math.sin(a) * (A.r - r - 6)
      let d = Infinity
      for (const p of sim.players) d = Math.min(d, Math.hypot(p.x - x, p.y - y))
      if (d > bestD) ((bestD = d), (best = { x, y }))
    }
    return best
  }

  function addMarker(type, at) {
    const spec = T.enemy[type]
    const pos = at ?? portalSpot(spec.r)
    sim.markers.push({ x: pos.x, y: pos.y, type, t: type === 'boss' ? T.spawnTell * 2.2 : T.spawnTell, max: type === 'boss' ? T.spawnTell * 2.2 : T.spawnTell })
    if (type === 'boss') emit('bossWarn')
    else emit('portal', pos.x, pos.y)
  }

  function spawnEnemy(type, x, y, vx = 0, vy = 0) {
    if (sim.enemies.length >= T.maxEnemies) return null
    const s = T.enemy[type]
    let hp = s.hp
    if (type === 'boss') hp = Math.round(s.hp * (sim.wave / 5) * (1 + T.coopHp * (sim.players.length - 1)))
    const e = { type, x, y, vx, vy, r: s.r, hp, maxHp: hp, ang: Math.atan2(A.y - y, A.x - x), state: 'seek', t: R(0.4, 1.2), cd: R(1.0, s.fireEvery ?? 1), flash: 0, wob: R(0, TAU), orbitA: 0, orbitDir: random() < 0.5 ? -1 : 1, dirX: 0, dirY: 0, step: 0 }
    if (type === 'orbiter') e.orbitA = Math.atan2(y - A.y, x - A.x)
    if (type === 'boss') ((e.state = 'drift'), (e.t = 1.6), (sim.boss = e))
    sim.enemies.push(e)
    return e
  }

  function fireEnemyBullet(x, y, ang, speed) {
    if (sim.eBullets.length >= T.maxEBullets) return
    sim.eBullets.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: 5, r: 8 })
  }

  function killEnemy(e, idx) {
    const s = T.enemy[e.type]
    sim.score += s.score
    sim.kills++
    sim.killsBy[e.type] = (sim.killsBy[e.type] ?? 0) + 1
    sim.enemies.splice(idx, 1)
    if (e.type === 'splitter') {
      const a = R(0, TAU)
      for (let k = 0; k < 2; k++) {
        const aa = a + k * Math.PI
        spawnEnemy('mini', e.x + Math.cos(aa) * 10, e.y + Math.sin(aa) * 10, Math.cos(aa) * 260, Math.sin(aa) * 260)
      }
    }
    if (e === sim.boss) {
      sim.boss = null
      for (const b of sim.eBullets) b.life = 0
    }
    emit('kill', e)
  }

  function hurtPlayer(p) {
    if (p.inv > 0 || p.dashT > 0 || sim.done) return
    sim.lives--
    sim.hits++
    p.inv = T.invuln
    for (const b of sim.eBullets) if (Math.hypot(b.x - p.x, b.y - p.y) < T.hitClear) b.life = 0
    for (const e of sim.enemies) {
      const dx = e.x - p.x
      const dy = e.y - p.y
      const d = Math.hypot(dx, dy) || 1
      if (d < 180 && e.type !== 'boss') ((e.vx += (dx / d) * 520), (e.vy += (dy / d) * 520), e.state === 'charge' && ((e.state = 'rest'), (e.t = 0.6)))
    }
    emit('playerHit', p)
    if (sim.lives <= 0) {
      sim.lives = 0
      sim.done = true
      emit('gameOver')
    }
  }

  function updatePlayer(p, c, dt) {
    const speed = T.player.speed
    let mx = c?.mx ?? 0
    let my = c?.my ?? 0
    const ml = Math.hypot(mx, my)
    if (ml > 1) ((mx /= ml), (my /= ml))
    p.mx = mx
    p.my = my
    p.dashCd = Math.max(0, p.dashCd - dt)
    p.inv = Math.max(0, p.inv - dt)
    if (c?.dash && p.dashCd <= 0 && p.dashT <= 0) {
      let dx = mx
      let dy = my
      if (Math.hypot(dx, dy) < 0.2) ((dx = Math.cos(p.ang)), (dy = Math.sin(p.ang)))
      const l = Math.hypot(dx, dy) || 1
      p.vx = (dx / l) * T.dash.speed
      p.vy = (dy / l) * T.dash.speed
      p.dashT = T.dash.time
      p.dashCd = T.dash.cooldown
      emit('dash', p)
    }
    if (p.dashT > 0) {
      p.dashT -= dt
      if (p.dashT <= 0) ((p.vx *= 0.35), (p.vy *= 0.35))
    } else {
      const k = 1 - Math.exp(-T.player.accel * dt)
      p.vx += (mx * speed - p.vx) * k
      p.vy += (my * speed - p.vy) * k
    }
    p.x += p.vx * dt
    p.y += p.vy * dt
    keepInside(p, T.player.r)
    // aim and fire
    const ax = c?.ax ?? 0
    const ay = c?.ay ?? 0
    p.aiming = Boolean(c?.fire) && Math.hypot(ax, ay) > 0.01
    if (p.aiming) p.ang = Math.atan2(ay, ax)
    else if (ml > 0.2) p.ang = Math.atan2(my, mx)
    p.fireCd -= dt
    if (p.aiming && p.fireCd <= 0) {
      p.fireCd += 1 / T.fireRate
      if (p.fireCd < 0) p.fireCd = 0
      if (sim.pBullets.length < T.maxPBullets) {
        const a = p.ang + R(-0.035, 0.035)
        sim.pBullets.push({ x: p.x + Math.cos(a) * 18, y: p.y + Math.sin(a) * 18, vx: Math.cos(a) * T.bulletSpeed, vy: Math.sin(a) * T.bulletSpeed, ang: a, life: T.bulletLife, owner: p.i })
      }
      emit('shoot', p)
    }
    if (p.fireCd < 0) p.fireCd = 0
  }

  function updateEnemy(e, dt, mult) {
    const s = T.enemy[e.type]
    const tgt = nearestPlayer(e.x, e.y)
    const dx = tgt.x - e.x
    const dy = tgt.y - e.y
    const d = Math.hypot(dx, dy) || 1
    let wantX = 0
    let wantY = 0
    let rate = 3
    e.flash = Math.max(0, e.flash - dt)
    e.t -= dt
    switch (e.type) {
      case 'chaser':
      case 'mini':
      case 'splitter': {
        e.wob += dt * (e.type === 'mini' ? 5 : 2.5)
        const side = Math.sin(e.wob) * (e.type === 'splitter' ? 0.2 : 0.35)
        const ux = dx / d
        const uy = dy / d
        wantX = (ux - uy * side) * s.speed * mult
        wantY = (uy + ux * side) * s.speed * mult
        rate = e.type === 'mini' ? 4 : 2.6
        break
      }
      case 'dasher': {
        if (e.state === 'seek') {
          wantX = (dx / d) * s.speed * mult
          wantY = (dy / d) * s.speed * mult
          if (d < s.range && e.t <= 0) ((e.state = 'tell'), (e.t = s.tell), emit('dasherTell', e))
        } else if (e.state === 'tell') {
          e.dirX = dx / d
          e.dirY = dy / d
          rate = 8
          if (e.t <= 0) {
            e.state = 'charge'
            e.t = s.chargeTime
            e.vx = e.dirX * s.charge * mult
            e.vy = e.dirY * s.charge * mult
            emit('dasherGo', e)
          }
        } else if (e.state === 'charge') {
          wantX = e.dirX * s.charge * mult
          wantY = e.dirY * s.charge * mult
          rate = 20
          if (e.t <= 0) ((e.state = 'rest'), (e.t = s.rest))
        } else {
          rate = 4
          if (e.t <= 0) ((e.state = 'seek'), (e.t = 0.8))
        }
        break
      }
      case 'orbiter': {
        e.orbitA += e.orbitDir * s.spin * dt * mult
        // they tighten in when the field is nearly clear, so a last orbiter can't stall a wave
        const orbit = s.orbit * (0.6 + 0.4 * Math.min(1, sim.enemies.length / 6))
        const ox = tgt.x + Math.cos(e.orbitA) * orbit
        const oy = tgt.y + Math.sin(e.orbitA) * orbit
        const ddx = ox - e.x
        const ddy = oy - e.y
        const dd = Math.hypot(ddx, ddy) || 1
        const sp = Math.min(s.speed * mult, dd * 3)
        wantX = (ddx / dd) * sp
        wantY = (ddy / dd) * sp
        e.cd -= dt
        if (e.cd <= 0) {
          fireEnemyBullet(e.x, e.y, Math.atan2(dy, dx), s.bulletSpeed * (0.9 + 0.1 * mult))
          e.cd = s.fireEvery / Math.sqrt(mult)
          emit('enemyShoot', e)
        }
        break
      }
      case 'boss': {
        const late = sim.wave >= 10
        if (e.state === 'drift') {
          wantX = (dx / d) * s.speed
          wantY = (dy / d) * s.speed
          rate = 1.5
          if (e.t <= 0) {
            e.step++
            if (e.step % 2) ((e.state = 'ringTell'), (e.t = s.ringTell))
            else ((e.state = 'chargeTell'), (e.t = s.chargeTell))
            emit('bossTell', e)
          }
        } else if (e.state === 'ringTell') {
          rate = 6
          if (e.t <= 0) {
            const n = s.ringBullets + (late ? 6 : 0)
            const off = R(0, TAU)
            for (let k = 0; k < n; k++) fireEnemyBullet(e.x, e.y, off + (k / n) * TAU, 200)
            if (late) for (let k = 0; k < n; k++) fireEnemyBullet(e.x, e.y, off + ((k + 0.5) / n) * TAU, 140)
            if (e.hp < e.maxHp * 0.5) for (let k = 0; k < (late ? 3 : 2); k++) if (sim.enemies.length + sim.markers.length < T.maxEnemies) addMarker('chaser')
            emit('bossRing', e)
            e.state = 'drift'
            e.t = late ? 1.8 : 2.4
          }
        } else if (e.state === 'chargeTell') {
          e.dirX = dx / d
          e.dirY = dy / d
          rate = 6
          if (e.t <= 0) ((e.state = 'charge'), (e.t = s.chargeTime), emit('bossCharge', e))
        } else if (e.state === 'charge') {
          wantX = e.dirX * s.charge * (late ? 1.15 : 1)
          wantY = e.dirY * s.charge * (late ? 1.15 : 1)
          rate = 10
          if (e.t <= 0) ((e.state = 'drift'), (e.t = late ? 1.4 : 2.0))
        }
        e.ang += dt * (e.state === 'ringTell' ? 6 : 1)
        break
      }
    }
    const k = 1 - Math.exp(-rate * dt)
    e.vx += (wantX - e.vx) * k
    e.vy += (wantY - e.vy) * k
    e.x += e.vx * dt
    e.y += e.vy * dt
    if (e.type !== 'boss' && e.type !== 'orbiter' && Math.hypot(e.vx, e.vy) > 20) e.ang = Math.atan2(e.vy, e.vx)
    if (e.type === 'orbiter') e.ang += dt * 2
    if (keepInside(e, e.r) && e.state === 'charge') ((e.state = e.type === 'boss' ? 'drift' : 'rest'), (e.t = e.type === 'boss' ? 1.6 : T.enemy.dasher.rest), emit('slam', e))
  }

  function update(dt, controls = []) {
    if (sim.done) return
    sim.time += dt
    const mult = 1 + T.speedRamp * Math.max(0, sim.wave - 1)
    for (const p of sim.players) updatePlayer(p, controls[p.i], dt)

    // waves
    if (sim.phase === 'break') {
      sim.phaseT -= dt
      if (sim.phaseT <= 0) startWave()
    } else {
      sim.spawnT -= dt
      const maxAlive = T.aliveBase + 2 * sim.wave
      if (sim.queue.length && sim.spawnT <= 0 && sim.enemies.length + sim.markers.length < Math.min(maxAlive, T.maxEnemies)) {
        const type = sim.queue.shift()
        addMarker(type)
        const [s0, per, floor] = T.spawnEvery
        sim.spawnT = type === 'boss' ? 2.5 : Math.max(floor, s0 - per * sim.wave)
      }
      if (!sim.queue.length && !sim.enemies.length && !sim.markers.length) {
        sim.score += T.clearBonus * sim.wave
        for (const b of sim.eBullets) b.life = 0
        emit('clear', sim.wave)
        if (sim.wave >= T.waveCount) {
          sim.victory = true
          sim.score += T.victoryBonus + T.lifeBonus * sim.lives
          sim.done = true
          emit('victory')
          return
        }
        sim.phase = 'break'
        sim.phaseT = T.breakTime
      }
    }

    // portals open
    for (let i = sim.markers.length - 1; i >= 0; i--) {
      const m = sim.markers[i]
      m.t -= dt
      if (m.t <= 0) {
        sim.markers.splice(i, 1)
        const e = spawnEnemy(m.type, m.x, m.y)
        if (e) emit('spawn', e)
      }
    }

    // enemies
    const en = sim.enemies
    for (const e of en) updateEnemy(e, dt, mult)
    for (let i = 0; i < en.length; i++) {
      const a = en[i]
      for (let j = i + 1; j < en.length; j++) {
        const b = en[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const min = (a.r + b.r) * 1.05
        const d2 = dx * dx + dy * dy
        if (d2 >= min * min || d2 === 0) continue
        const d = Math.sqrt(d2)
        const push = (min - d) * 0.5
        const nx = dx / d
        const ny = dy / d
        const wa = a.type === 'boss' ? 0.1 : b.type === 'boss' ? 1.9 : 1
        a.x -= nx * push * wa
        a.y -= ny * push * wa
        b.x += nx * push * (2 - wa)
        b.y += ny * push * (2 - wa)
      }
    }

    // player bullets
    const pb = sim.pBullets
    for (let i = pb.length - 1; i >= 0; i--) {
      const b = pb[i]
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.life -= dt
      let gone = b.life <= 0
      if (!gone && (b.x - A.x) ** 2 + (b.y - A.y) ** 2 > (A.r - 2) ** 2) {
        gone = true
        emit('wallHit', b)
      }
      if (!gone) {
        for (let j = en.length - 1; j >= 0; j--) {
          const e = en[j]
          const rr = e.r + 5
          if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 > rr * rr) continue
          gone = true
          e.hp--
          e.flash = 0.08
          if (e.type !== 'boss') ((e.vx += b.vx * 0.08), (e.vy += b.vy * 0.08))
          if (e.hp <= 0) killEnemy(e, j)
          else emit('hit', e, b)
          break
        }
      }
      if (gone) pb.splice(i, 1)
    }

    // enemy bullets
    const eb = sim.eBullets
    for (let i = eb.length - 1; i >= 0; i--) {
      const b = eb[i]
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.life -= dt
      let gone = b.life <= 0 || (b.x - A.x) ** 2 + (b.y - A.y) ** 2 > (A.r - 4) ** 2
      if (!gone) {
        for (const p of sim.players) {
          const rr = b.r + T.player.r * 0.7
          if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < rr * rr && p.inv <= 0 && p.dashT <= 0) {
            gone = true
            hurtPlayer(p)
            break
          }
        }
      }
      if (gone) eb.splice(i, 1)
    }

    // bodies
    for (const p of sim.players) {
      if (p.inv > 0 || p.dashT > 0) continue
      for (const e of en) {
        const rr = e.r + T.player.r * 0.75
        if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 < rr * rr) {
          hurtPlayer(p)
          break
        }
      }
    }
  }

  return sim
}

// ---- art (baked once at 2×, blitted every frame) -----------------------------------------------

function bake(w, h, draw, scale = 2) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w * scale)
  canvas.height = Math.ceil(h * scale)
  const g = canvas.getContext('2d')
  g.scale(scale, scale)
  g.translate(w / 2, h / 2)
  draw(g)
  return { canvas, w, h }
}
function blit(ctx, s, x, y, rot = 0, scale = 1) {
  if (!rot && scale === 1) return ctx.drawImage(s.canvas, x - s.w / 2, y - s.h / 2, s.w, s.h)
  ctx.save()
  ctx.translate(x, y)
  if (rot) ctx.rotate(rot)
  ctx.drawImage(s.canvas, (-s.w / 2) * scale, (-s.h / 2) * scale, s.w * scale, s.h * scale)
  ctx.restore()
}
function poly(g, pts) {
  g.beginPath()
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.closePath()
}
const ngon = (n, r, rot = 0) => Array.from({ length: n }, (_, i) => [Math.cos(rot + (i / n) * TAU) * r, Math.sin(rot + (i / n) * TAU) * r])

/** A neon stroke: a wide blurred pass in colour, a narrower one, then a white-hot core. */
function neon(g, path, color, width = 3, fillAlpha = 0.14) {
  g.save()
  g.lineJoin = 'round'
  g.lineCap = 'round'
  path()
  if (fillAlpha) {
    g.globalAlpha = fillAlpha
    g.fillStyle = color
    g.fill()
    g.globalAlpha = 1
  }
  g.shadowColor = color
  g.shadowBlur = 16
  g.strokeStyle = color
  g.lineWidth = width * 1.6
  g.stroke()
  g.shadowBlur = 6
  g.lineWidth = width
  g.stroke()
  g.shadowBlur = 0
  g.strokeStyle = 'rgba(255,255,255,0.9)'
  g.lineWidth = Math.max(1, width * 0.4)
  g.stroke()
  g.restore()
}

function glowSprite(color, r) {
  return bake(r * 2, r * 2, (g) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r)
    gr.addColorStop(0, color)
    gr.addColorStop(0.25, color + 'aa')
    gr.addColorStop(1, color + '00')
    g.fillStyle = gr
    g.fillRect(-r, -r, r * 2, r * 2)
  })
}

const SHAPES = {
  ship: (g, r) => poly(g, [[r * 1.35, 0], [-r * 0.9, r * 0.9], [-r * 0.4, 0], [-r * 0.9, -r * 0.9]]),
  chaser: (g, r) => poly(g, [[r, 0], [0, r * 0.72], [-r, 0], [0, -r * 0.72]]),
  mini: (g, r) => poly(g, [[r, 0], [0, r * 0.75], [-r, 0], [0, -r * 0.75]]),
  splitter: (g, r) => {
    poly(g, ngon(6, r, Math.PI / 6))
    const inner = ngon(6, r * 0.45, Math.PI / 6)
    g.moveTo(...inner[0])
    for (const p of inner.slice(1)) g.lineTo(...p)
    g.closePath()
  },
  dasher: (g, r) => poly(g, [[r * 1.3, 0], [-r * 0.8, r * 0.85], [-r * 0.3, 0], [-r * 0.8, -r * 0.85]]),
  orbiter: (g, r) => {
    g.beginPath()
    g.arc(0, 0, r * 0.8, 0, TAU)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU
      g.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8)
      g.lineTo(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25)
    }
    g.moveTo(r * 0.28, 0)
    g.arc(0, 0, r * 0.28, 0, TAU)
  },
  boss: (g, r) => {
    poly(g, ngon(8, r, Math.PI / 8))
    const star = []
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? r * 0.3 : r * 0.68
      const a = (k / 10) * TAU - Math.PI / 2
      star.push([Math.cos(a) * rr, Math.sin(a) * rr])
    }
    g.moveTo(...star[0])
    for (const p of star.slice(1)) g.lineTo(...p)
    g.closePath()
  }
}

function shapeSprite(kind, color, r, width = 3) {
  const pad = 26
  const size = r * 2.7 + pad * 2
  return bake(size, size, (g) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, size / 2)
    gr.addColorStop(0, color + '30')
    gr.addColorStop(1, color + '00')
    g.fillStyle = gr
    g.fillRect(-size / 2, -size / 2, size, size)
    neon(g, () => SHAPES[kind](g, r), color, width)
  })
}

function arenaBackdrop() {
  const A = TUNING.arena
  return bake(W, H, (g) => {
    g.translate(-W / 2, -H / 2)
    g.fillStyle = COLORS.bg
    g.fillRect(0, 0, W, H)
    // floor glow inside the ring
    const fl = g.createRadialGradient(A.x, A.y, 0, A.x, A.y, A.r)
    fl.addColorStop(0, 'rgba(40,20,110,0.55)')
    fl.addColorStop(0.75, 'rgba(18,10,60,0.5)')
    fl.addColorStop(0.93, 'rgba(20,12,70,0.5)')
    fl.addColorStop(1, 'rgba(42,245,255,0.16)')
    g.fillStyle = fl
    g.beginPath()
    g.arc(A.x, A.y, A.r, 0, TAU)
    g.fill()
    // grid (brighter inside the ring)
    g.lineWidth = 1
    for (const inside of [false, true]) {
      g.save()
      if (inside) {
        g.beginPath()
        g.arc(A.x, A.y, A.r, 0, TAU)
        g.clip()
      }
      g.strokeStyle = inside ? 'rgba(110,80,255,0.22)' : COLORS.grid
      g.beginPath()
      for (let x = (A.x % 40) - 40; x <= W; x += 40) ((g.moveTo(x + 0.5, 0), g.lineTo(x + 0.5, H)))
      for (let y = (A.y % 40) - 40; y <= H; y += 40) ((g.moveTo(0, y + 0.5), g.lineTo(W, y + 0.5)))
      g.stroke()
      g.restore()
    }
    // horizon fade: the grid dims toward the corners
    const vg = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 820)
    vg.addColorStop(0, 'rgba(5,4,15,0)')
    vg.addColorStop(1, 'rgba(5,4,15,0.92)')
    g.fillStyle = vg
    g.fillRect(0, 0, W, H)
    // concentric guide rings and the main ring
    g.strokeStyle = 'rgba(42,245,255,0.10)'
    g.lineWidth = 2
    for (const k of [0.33, 0.66]) {
      g.beginPath()
      g.arc(A.x, A.y, A.r * k, 0, TAU)
      g.stroke()
    }
    neon(g, () => (g.beginPath(), g.arc(A.x, A.y, A.r, 0, TAU)), COLORS.ring, 4, 0)
    neon(g, () => (g.beginPath(), g.arc(A.x, A.y, A.r + 14, 0, TAU)), '#ff3df0', 1.5, 0)
    // tick marks on the outer ring
    g.strokeStyle = 'rgba(255,61,240,0.5)'
    g.lineWidth = 2
    g.beginPath()
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * TAU
      g.moveTo(A.x + Math.cos(a) * (A.r + 20), A.y + Math.sin(a) * (A.r + 20))
      g.lineTo(A.x + Math.cos(a) * (A.r + (k % 4 ? 26 : 34)), A.y + Math.sin(a) * (A.r + (k % 4 ? 26 : 34)))
    }
    g.stroke()
  })
}

let ART = null
const art = () =>
  (ART ??= {
    backdrop: arenaBackdrop(),
    ring: bake(200, 200, (g) => {
      neon(g, () => (g.beginPath(), g.arc(0, 0, 80, 0, TAU)), COLORS.ring, 3, 0.05)
      neon(g, () => (g.beginPath(), g.arc(0, 0, 88, 0, TAU)), '#ff3df0', 1.2, 0)
    }),
    ship: COLORS.p.map((c) => shapeSprite('ship', c, TUNING.player.r, 3)),
    enemy: Object.fromEntries(['chaser', 'mini', 'splitter', 'dasher', 'orbiter', 'boss'].map((k) => [k, shapeSprite(k, COLORS[k], TUNING.enemy[k].r, k === 'boss' ? 4 : 3)])),
    bullet: COLORS.p.map((c) =>
      bake(40, 20, (g) => {
        g.lineCap = 'round'
        g.shadowColor = c
        g.shadowBlur = 8
        g.strokeStyle = c
        g.lineWidth = 5
        g.beginPath()
        g.moveTo(-12, 0)
        g.lineTo(8, 0)
        g.stroke()
        g.shadowBlur = 0
        g.strokeStyle = '#fff'
        g.lineWidth = 2
        g.stroke()
      })
    ),
    ebullet: bake(40, 40, (g) => {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 18)
      gr.addColorStop(0, '#ffffff')
      gr.addColorStop(0.3, COLORS.ebullet)
      gr.addColorStop(1, COLORS.ebullet + '00')
      g.fillStyle = gr
      g.fillRect(-20, -20, 40, 40)
      g.strokeStyle = '#ffd0e4'
      g.lineWidth = 2
      g.beginPath()
      g.arc(0, 0, 7, 0, TAU)
      g.stroke()
    }),
    glow: Object.fromEntries(Object.entries({ ...COLORS, p0: COLORS.p[0], p1: COLORS.p[1] }).filter(([, v]) => v[0] === '#').map(([k, v]) => [k, glowSprite(v, 40)])),
    portal: Object.fromEntries(['chaser', 'splitter', 'dasher', 'orbiter', 'boss'].map((k) => [k, bake(80, 80, (g) => neon(g, () => (g.beginPath(), g.arc(0, 0, 26, 0, TAU)), COLORS[k], 2, 0.08))]))
  })

// ---- own keyboard tracking (WASD moves, arrows aim) -------------------------------------------
// The kit merges WASD and arrows into one stick; a twin-stick game needs them apart.
const keysDown = new Set()
const keysTapped = new Set()
if (typeof addEventListener === 'function') {
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (!e.repeat) keysTapped.add(e.code)
    keysDown.add(e.code)
  })
  addEventListener('keyup', (e) => keysDown.delete(e.code))
  addEventListener('blur', () => keysDown.clear())
}
const key = (c) => keysDown.has(c)

// ---- the module ----------------------------------------------------------------------------

const PAUSE_ZONE = { x: W - 130, y: 0, w: 130, h: 100 }
const DASH_BTN = { x: W - 110, y: H - 150, r: 62 }
const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
const ENEMY_NAMES = { chaser: 'Chasers', mini: 'Shards', splitter: 'Splitters', dasher: 'Dashers', orbiter: 'Orbiters', boss: 'Bosses' }
const PITCH = { mini: 1.5, chaser: 1.25, dasher: 1, orbiter: 0.85, splitter: 0.7, boss: 0.35 }

export default {
  id: 'neon-ring',
  name: 'Neon Ring',
  blurb: 'Twin-stick survival, 1–2 players',
  scoreLabel: 'points',
  style: { bg: '#0a0620', accent: '#2af5ff' },
  medals: [1500, 4000, 7000],
  music: { bpm: 132, root: 45, chords: [0, -4, 3, -2], minor: true, lead: [0, 2, 4, 7, 4, 2, 4, null], wave: 'sawtooth', gain: 0.03 },
  TUNING,
  cursor: true, // the mouse aims, so keep the pointer visible as a crosshair cue
  howTo: (input) => {
    if (input.mode === 'touch') return 'Left side moves · right side aims and fires'
    if (input.mode === 'mouse') return `WASD to move · aim with the mouse · ${input.label('a')} to dash`
    if (input.mode === 'keyboard') return `WASD to move · ${input.dpadLabel()} to aim and fire · ${input.label('a')} to dash`
    return `${input.stickLabel()} moves · right stick fires · ${input.label('a')} dashes`
  },
  icon(ctx, x, y, size, t) {
    const a = art()
    const r = size * 0.55
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.8
    blit(ctx, a.glow.p0, x, y, 0, r / 30)
    ctx.globalAlpha = 1
    blit(ctx, a.ring, x, y, 0, r / 80)
    // a ship in the middle, spinning to fire at enemies around it
    const targets = [
      ['chaser', -1.9, 0.82],
      ['splitter', -0.4, 0.86],
      ['dasher', 1.2, 0.78],
      ['orbiter', 2.6, 0.84]
    ]
    const aim = targets[Math.floor(t * 0.8) % targets.length]
    const sa = aim[1] + Math.sin(t * 3) * 0.05
    for (let k = 0; k < 3; k++) {
      const d = ((t * 2.4 + k / 3) % 1) * r * aim[2]
      blit(ctx, a.bullet[0], x + Math.cos(sa) * d, y + Math.sin(sa) * d, sa, 0.9)
    }
    for (const [k, ang, rr] of targets) {
      const wob = Math.sin(t * 2 + ang) * 0.06
      blit(ctx, a.enemy[k], x + Math.cos(ang + wob) * r * rr, y + Math.sin(ang + wob) * r * rr, t * (k === 'orbiter' ? 2 : 0) + ang + Math.PI, 0.75)
    }
    blit(ctx, a.ship[0], x - 10, y + 4, sa, 1.1)
    blit(ctx, a.ship[1], x + 22, y + 14, sa + 0.4, 0.8)
    ctx.restore()
  },
  create(env) {
    const { input, audio, settings, font } = env
    const T = env.TUNING
    const A = art()
    const fx = createFx(settings, { max: 260 })
    let stop = 0 // hit-stop
    let hurtFlash = 0
    let banner = { text: '', sub: '', t: 0, color: COLORS.ring }
    let lastHitSfx = 0
    let clock = 0
    const floats = [] // floating score text, capped
    const trails = [] // dash afterimages, capped
    let p2Pad = -1
    let p1Pad = -1
    const touches = new Map() // id → { role, ox, oy, x, y }
    let touchDash = false

    const sfx = {
      shoot: (p) => audio.tone({ freq: (p.i ? 760 : 980) + rand(-40, 40), dur: 0.045, type: 'square', gain: 0.025, slide: -380 }),
      hit: (e) => {
        if (clock - lastHitSfx < 0.03) return
        lastHitSfx = clock
        audio.tone({ freq: 520 * PITCH[e.type], dur: 0.05, type: 'triangle', gain: 0.06, slide: -120 })
      },
      kill: (e) => {
        const p = PITCH[e.type]
        audio.tone({ freq: 700 * p, dur: 0.16, type: 'sawtooth', gain: 0.09, slide: -500 * p })
        audio.noise({ dur: e.type === 'boss' ? 0.9 : e.r > 15 ? 0.22 : 0.1, gain: e.type === 'boss' ? 0.35 : 0.12 })
      },
      dash: () => (audio.noise({ dur: 0.18, gain: 0.12 }), audio.tone({ freq: 240, dur: 0.18, type: 'sine', gain: 0.08, slide: 500 })),
      playerHit: () => (audio.tone({ freq: 220, dur: 0.4, type: 'sawtooth', gain: 0.18, slide: -160 }), audio.noise({ dur: 0.35, gain: 0.25 })),
      wave: () => [0, 4, 7, 12].forEach((s, i) => audio.tone({ freq: 440 * 2 ** (s / 12), dur: 0.14, type: 'square', gain: 0.06, delay: i * 0.07 })),
      bossWarn: () => [0, 0.35, 0.7].forEach((d) => audio.tone({ freq: 150, dur: 0.28, type: 'sawtooth', gain: 0.16, slide: -60, delay: d })),
      join: () => [0, 7, 12, 19].forEach((s, i) => audio.tone({ freq: 523 * 2 ** (s / 12), dur: 0.12, type: 'triangle', gain: 0.1, delay: i * 0.06 })),
      tell: () => audio.tone({ freq: 300, dur: 0.3, type: 'square', gain: 0.04, slide: 400 }),
      enemyShoot: () => audio.tone({ freq: 330, dur: 0.12, type: 'sine', gain: 0.06, slide: -150 }),
      clear: () => [0, 4, 7, 11, 14].forEach((s, i) => audio.tone({ freq: 523 * 2 ** (s / 12), dur: 0.2, type: 'triangle', gain: 0.08, delay: i * 0.06 })),
      portal: () => audio.tone({ freq: 180, dur: 0.2, type: 'sine', gain: 0.03, slide: 260 })
    }

    const pop = (x, y, text, color) => {
      if (floats.length >= 24) floats.shift()
      floats.push({ x, y, text, color, t: 0.8 })
    }

    const emit = (ev, a, b) => {
      switch (ev) {
        case 'shoot':
          sfx.shoot(a)
          break
        case 'hit':
          sfx.hit(a)
          fx.burst(b.x, b.y, COLORS[a.type], 3, 180, { size: 2.5, life: 0.25, gravity: 0 })
          break
        case 'kill': {
          sfx.kill(a)
          const big = a.type === 'boss' ? 3 : a.r > 15 ? 1.5 : 1
          fx.burst(a.x, a.y, COLORS[a.type], Math.round(12 * big), 300 * Math.sqrt(big), { size: 3.5, life: 0.55 * Math.sqrt(big), gravity: 0 })
          fx.burst(a.x, a.y, '#ffffff', Math.round(5 * big), 160, { size: 2.5, life: 0.3, gravity: 0 })
          pop(a.x, a.y - a.r, `+${T.enemy[a.type].score}`, COLORS[a.type])
          if (a.type === 'boss') {
            stop = T.bossHitStop
            fx.shake(1)
            fx.burst(a.x, a.y, COLORS.ring, 40, 520, { size: 4, life: 1.1, gravity: 0 })
          } else if (a.type !== 'chaser' && a.type !== 'mini') {
            stop = Math.max(stop, T.hitStop)
            fx.shake(0.22)
          } else fx.shake(0.08)
          break
        }
        case 'dash':
          sfx.dash()
          break
        case 'playerHit':
          sfx.playerHit()
          fx.shake(0.7)
          stop = 0.12
          hurtFlash = settings.data.reducedShake ? 0 : 0.35
          fx.burst(a.x, a.y, COLORS.p[a.i], 26, 420, { size: 3.5, life: 0.7, gravity: 0 })
          pop(a.x, a.y - 30, sim.lives ? `${sim.lives} left` : 'Down!', '#ff6b8a')
          break
        case 'wave':
          sfx.wave()
          banner = { text: `WAVE ${a}`, sub: b ? 'BOSS INCOMING' : a === T.waveCount ? 'FINAL WAVE' : '', t: 2, color: b ? COLORS.boss : COLORS.ring }
          break
        case 'bossWarn':
          sfx.bossWarn()
          fx.shake(0.3)
          break
        case 'bossTell':
        case 'dasherTell':
          sfx.tell()
          break
        case 'bossRing':
          fx.shake(0.25)
          sfx.enemyShoot()
          break
        case 'dasherGo':
        case 'bossCharge':
          audio.noise({ dur: 0.15, gain: 0.06 })
          break
        case 'slam':
          if (a.type === 'boss') fx.shake(0.4)
          break
        case 'enemyShoot':
          sfx.enemyShoot()
          break
        case 'wallHit':
          if (fx) fx.burst(a.x, a.y, COLORS.ring, 2, 120, { size: 2, life: 0.18, gravity: 0 })
          break
        case 'portal':
          sfx.portal()
          break
        case 'clear':
          sfx.clear()
          pop(T.arena.x, T.arena.y - 40, `WAVE CLEAR +${T.clearBonus * a}`, COLORS.ring)
          break
        case 'victory':
          banner = { text: 'VICTORY', sub: `+${T.victoryBonus + T.lifeBonus * sim.lives}`, t: 3, color: '#ffe94a' }
          break
      }
    }

    const sim = createSim(T, { players: 1, emit })
    let aimSource = 'other' // 'mouse' once the mouse moves: then the ship fires at the pointer
    const lastPtr = { x: input.pointer.x, y: input.pointer.y }
    keysTapped.clear()

    // --- input → controls -------------------------------------------------------------------
    function readTouches() {
      touchDash = false
      const seen = new Set()
      for (const p of input.pointers.values()) {
        if (p.type !== 'touch' && p.type !== 'pen') continue
        if (!p.down) continue
        seen.add(p.id)
        let t = touches.get(p.id)
        if (!t) {
          let role = p.x < W / 2 ? 'move' : 'aim'
          if (Math.hypot(p.x - DASH_BTN.x, p.y - DASH_BTN.y) < DASH_BTN.r + 18) role = 'dash'
          else if (inRect(p, PAUSE_ZONE)) role = 'none'
          for (const o of touches.values()) if (o.role === role && role !== 'dash') role = 'none'
          t = { role, ox: p.x, oy: p.y, x: p.x, y: p.y }
          touches.set(p.id, t)
          if (role === 'dash') touchDash = true
        }
        t.x = p.x
        t.y = p.y
        if (t.role === 'move') {
          // floating stick: the base follows when you drag past its rim
          const dx = t.x - t.ox
          const dy = t.y - t.oy
          const d = Math.hypot(dx, dy)
          if (d > 80) ((t.ox = t.x - (dx / d) * 80), (t.oy = t.y - (dy / d) * 80))
        }
      }
      for (const id of [...touches.keys()]) if (!seen.has(id)) touches.delete(id)
    }

    function nearestEnemyDir(p) {
      let best = null
      let bd = Infinity
      for (const e of sim.enemies) {
        const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
        if (d < bd) ((bd = d), (best = e))
      }
      return best ? [best.x - p.x, best.y - p.y] : null
    }

    const c1 = { mx: 0, my: 0, ax: 0, ay: 0, fire: false, dash: false }
    const c2 = { mx: 0, my: 0, ax: 0, ay: 0, fire: false, dash: false }
    const controls = [c1, c2]
    const padDash = (pad) => pad.pressed('a') || pad.pressed('rb') || pad.pressed('lb') || pad.pressed('rt')

    function readControls() {
      const pads = input.pads
      // first connected pad that isn't player 2's
      p1Pad = pads.findIndex((pd) => pd.connected && pd.index !== p2Pad)
      // join: a second connected pad presses A
      if (sim.players.length < 2) {
        for (const pad of pads) {
          if (!pad.connected || pad.index === p1Pad) continue
          if (['a', 'b', 'x', 'y'].some((b) => pad.pressed(b))) {
            p2Pad = pad.index
            sim.addPlayer()
            sfx.join()
            pop(sim.players[1].x, sim.players[1].y - 30, 'P2 JOINED', COLORS.p[1])
            p1Pad = pads.findIndex((pd) => pd.connected && pd.index !== p2Pad)
            break
          }
        }
      }
      readTouches()
      const p1 = sim.players[0]
      // player 1: their pad + keyboard + mouse + touch
      const pad = p1Pad >= 0 ? pads[p1Pad] : null
      let mx = (pad?.x ?? 0) + (key('KeyD') ? 1 : 0) - (key('KeyA') ? 1 : 0)
      let my = (pad?.y ?? 0) + (key('KeyS') ? 1 : 0) - (key('KeyW') ? 1 : 0)
      let ax = 0
      let ay = 0
      let fire = false
      const kax = (key('ArrowRight') ? 1 : 0) - (key('ArrowLeft') ? 1 : 0)
      const kay = (key('ArrowDown') ? 1 : 0) - (key('ArrowUp') ? 1 : 0)
      if (pad && Math.hypot(pad.aimX, pad.aimY) > T.aimDeadzone) ((ax = pad.aimX), (ay = pad.aimY), (fire = true))
      else if (kax || kay) ((ax = kax), (ay = kay), (fire = true))
      let dash = (pad && padDash(pad)) || keysTapped.has('Space') || keysTapped.has('Enter') || keysTapped.has('NumpadEnter') || keysTapped.has('ShiftLeft')
      const ptr = input.pointer
      if (ptr.type === 'mouse' && ptr.active && (ptr.x !== lastPtr.x || ptr.y !== lastPtr.y || ptr.pressed)) aimSource = 'mouse'
      lastPtr.x = ptr.x
      lastPtr.y = ptr.y
      if (kax || kay || (pad && Math.hypot(pad.aimX, pad.aimY) > T.aimDeadzone) || input.mode === 'touch') aimSource = 'other'
      if (!fire && aimSource === 'mouse' && ptr.active) {
        ax = input.pointer.x - p1.x
        ay = input.pointer.y - p1.y
        fire = Math.hypot(ax, ay) > 4
        if (input.pressed('b') || (input.pointer.pressed && !inRect(input.pointer, PAUSE_ZONE))) dash = true
      }
      if (input.mode === 'touch') {
        for (const t of touches.values()) {
          if (t.role === 'move') ((mx += (t.x - t.ox) / 80), (my += (t.y - t.oy) / 80))
          if (t.role === 'aim' && !fire) {
            const dx = t.x - t.ox
            const dy = t.y - t.oy
            if (Math.hypot(dx, dy) > 16) ((ax = dx), (ay = dy))
            else {
              const n = nearestEnemyDir(p1)
              if (n) [ax, ay] = n
              else ((ax = Math.cos(p1.ang)), (ay = Math.sin(p1.ang)))
            }
            fire = true
          }
        }
        if (touchDash) dash = true
      }
      Object.assign(c1, { mx, my, ax, ay, fire, dash })
      keysTapped.clear()
      // player 2: their own pad only
      if (sim.players.length > 1) {
        const pd = pads[p2Pad]
        if (pd?.connected) {
          const aim = Math.hypot(pd.aimX, pd.aimY) > T.aimDeadzone
          Object.assign(c2, { mx: pd.x, my: pd.y, ax: pd.aimX, ay: pd.aimY, fire: aim, dash: padDash(pd) })
        } else Object.assign(c2, { mx: 0, my: 0, ax: 0, ay: 0, fire: false, dash: false })
      }
    }

    const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
    const canJoin = () => sim.players.length < 2 && input.pads.filter((p) => p.connected).length >= 2

    const run = {
      sim, // for tools and tests
      score: 0,
      done: false,
      stats: () => [
        ['Wave', sim.victory ? 'All 10!' : `${sim.wave} of ${T.waveCount}`],
        ['Kills', sim.kills],
        ['Time', fmtTime(sim.time)]
      ],
      prompts: (inp) => (inp.mode === 'touch' ? [] : [['a', 'Dash']]),
      update(dt) {
        clock += dt
        readControls()
        fx.update(dt)
        hurtFlash = Math.max(0, hurtFlash - dt)
        banner.t = Math.max(0, banner.t - dt)
        for (let i = floats.length - 1; i >= 0; i--) {
          const f = floats[i]
          f.t -= dt
          f.y -= 40 * dt
          if (f.t <= 0) floats.splice(i, 1)
        }
        for (let i = trails.length - 1; i >= 0; i--) if ((trails[i].t -= dt) <= 0) trails.splice(i, 1)
        if (stop > 0) {
          stop -= dt
          return
        }
        sim.update(dt, controls)
        for (const p of sim.players) if (p.dashT > 0 && trails.length < 30) trails.push({ x: p.x, y: p.y, ang: p.ang, i: p.i, t: 0.25 })
        run.score = sim.score
        if (sim.done) {
          if (sim.victory && banner.t > 1.2) return // let the victory banner breathe a moment
          if (!sim.victory && stop > 0) return
          run.done = true
        }
      },
      draw(ctx) {
        const t = clock
        ctx.save()
        const [sx, sy] = fx.offset()
        ctx.translate(sx, sy)
        ctx.fillStyle = COLORS.bg
        ctx.fillRect(-30, -30, W + 60, H + 60)
        ctx.drawImage(A.backdrop.canvas, 0, 0, W, H)
        const Ar = T.arena
        ctx.globalCompositeOperation = 'lighter'
        // ring pulse on the beat (132 bpm)
        const beat = 1 - ((t * 132) / 60) % 1
        ctx.globalAlpha = 0.18 + beat * 0.25 + hurtFlash
        ctx.strokeStyle = hurtFlash > 0 ? '#ff3a6b' : COLORS.ring
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(Ar.x, Ar.y, Ar.r - 2 - beat * 4, 0, TAU)
        ctx.stroke()
        ctx.globalAlpha = 1

        // spawn portals
        for (const m of sim.markers) {
          const k = 1 - m.t / m.max
          const s = A.portal[m.type] ?? A.portal.chaser
          ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 14))
          blit(ctx, s, m.x, m.y, t * 3, (m.type === 'boss' ? 2.6 : 0.9) * (1.4 - k * 0.6))
          ctx.globalAlpha = k * 0.8
          blit(ctx, A.glow[m.type] ?? A.glow.chaser, m.x, m.y, 0, m.type === 'boss' ? 2 : 0.8)
        }
        ctx.globalAlpha = 1

        // telegraphs: dasher and boss charge lanes (clipped to the ring), boss wind-up
        ctx.save()
        ctx.beginPath()
        ctx.arc(Ar.x, Ar.y, Ar.r, 0, TAU)
        ctx.clip()
        for (const e of sim.enemies) {
          if (e.state === 'tell' || e.state === 'chargeTell') {
            const len = e.type === 'boss' ? 520 : 360
            ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(t * 20))
            ctx.strokeStyle = COLORS[e.type]
            ctx.lineWidth = e.r * 1.4
            ctx.lineCap = 'round'
            ctx.beginPath()
            ctx.moveTo(e.x, e.y)
            ctx.lineTo(e.x + e.dirX * len, e.y + e.dirY * len)
            ctx.stroke()
            ctx.globalAlpha = 0.8
            ctx.lineWidth = 2
            ctx.stroke()
          } else if (e.state === 'ringTell') {
            ctx.globalAlpha = 0.6
            blit(ctx, A.glow.boss, e.x, e.y, 0, 2.5 + Math.sin(t * 30) * 0.3)
          }
        }
        ctx.restore()
        ctx.globalAlpha = 1
        ctx.lineCap = 'butt'

        // dash afterimages
        for (const tr of trails) {
          ctx.globalAlpha = tr.t * 2.4
          blit(ctx, A.ship[tr.i], tr.x, tr.y, tr.ang)
        }
        ctx.globalAlpha = 1

        // enemies
        for (const e of sim.enemies) {
          let rot = e.ang
          let sc = 1
          if (e.type === 'splitter') rot = t * 1.2 + e.wob
          if (e.type === 'dasher' && e.state === 'tell') ((rot = Math.atan2(e.dirY, e.dirX)), (sc = 1 + Math.sin(t * 40) * 0.08))
          if (e.type === 'orbiter' && e.cd < T.enemy.orbiter.tell) {
            ctx.globalAlpha = 0.9
            blit(ctx, A.glow.ebullet, e.x, e.y, 0, 0.6 + (1 - e.cd / T.enemy.orbiter.tell) * 0.6)
            ctx.globalAlpha = 1
          }
          blit(ctx, A.enemy[e.type], e.x, e.y, rot, sc)
          if (e.flash > 0) {
            ctx.globalAlpha = 0.9
            blit(ctx, A.glow.white, e.x, e.y, 0, e.r / 22)
            ctx.globalAlpha = 1
          }
        }

        // bullets
        for (const b of sim.eBullets) blit(ctx, A.ebullet, b.x, b.y, 0, 0.9 + Math.sin(t * 18 + b.x) * 0.1)
        for (const b of sim.pBullets) blit(ctx, A.bullet[b.owner], b.x, b.y, b.ang)

        // players
        for (const p of sim.players) {
          if (p.inv > 0 && Math.floor(p.inv * 14) % 2 === 0) continue
          ctx.globalAlpha = 0.5
          blit(ctx, A.glow[`p${p.i}`], p.x, p.y, 0, 0.9)
          ctx.globalAlpha = 1
          blit(ctx, A.ship[p.i], p.x, p.y, p.ang, p.dashT > 0 ? 1.15 : 1)
          // dash cooldown ring
          const ready = p.dashCd <= 0
          ctx.strokeStyle = COLORS.p[p.i]
          ctx.globalAlpha = ready ? 0.35 + 0.15 * Math.sin(t * 6) : 0.7
          ctx.lineWidth = ready ? 2 : 3
          ctx.beginPath()
          ctx.arc(p.x, p.y, 26, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.dashCd / T.dash.cooldown))
          ctx.stroke()
          ctx.globalAlpha = 1
        }

        fx.draw(ctx)
        ctx.globalCompositeOperation = 'source-over'

        // floating scores
        for (const f of floats) {
          ctx.globalAlpha = clamp(f.t * 2, 0, 1)
          label(ctx, f.text, f.x, f.y, { font: font(400, 20, 'Bungee'), color: f.color, edge: 4, edgeColor: COLORS.bg })
        }
        ctx.globalAlpha = 1
        ctx.restore()

        // hurt vignette
        if (hurtFlash > 0) {
          ctx.fillStyle = `rgba(255,40,90,${hurtFlash * 0.35})`
          ctx.fillRect(0, 0, W, H)
        }

        // HUD
        label(ctx, String(sim.score), 40, 58, { font: font(400, 44, 'Bungee'), color: COLORS.p[0], edge: 6, edgeColor: COLORS.bg, align: 'left' })
        label(ctx, `WAVE ${Math.max(1, sim.wave)}/${T.waveCount}`, 40, 108, { font: font(400, 26, 'Bungee'), color: '#d8ccff', edge: 5, edgeColor: COLORS.bg, align: 'left' })
        // shared lives as little ships
        for (let i = 0; i < T.lives; i++) {
          ctx.globalAlpha = i < sim.lives ? 1 : 0.18
          blit(ctx, A.ship[0], 58 + i * 40, 156, -Math.PI / 2, 0.8)
        }
        ctx.globalAlpha = 1
        if (sim.players.length > 1) label(ctx, 'CO-OP', 40, 200, { font: font(400, 20, 'Bungee'), color: COLORS.p[1], align: 'left' })

        // boss health
        let topY = 48
        if (sim.boss) {
          const b = sim.boss
          const bw = 460
          const bx = W / 2 - bw / 2
          label(ctx, 'OVERSEER', W / 2, 34, { font: font(400, 22, 'Bungee'), color: COLORS.boss, edge: 4, edgeColor: COLORS.bg })
          ctx.fillStyle = 'rgba(255,58,107,0.18)'
          ctx.fillRect(bx, 50, bw, 14)
          ctx.fillStyle = COLORS.boss
          ctx.fillRect(bx, 50, bw * (b.hp / b.maxHp), 14)
          ctx.strokeStyle = '#ffb0c4'
          ctx.lineWidth = 2
          ctx.strokeRect(bx, 50, bw, 14)
          topY = 94
        }
        if (canJoin()) {
          const pulse = 0.8 + 0.2 * Math.sin(t * 5)
          ctx.globalAlpha = pulse
          label(ctx, input.mode === 'gamepad' ? `P2: ${input.label('a')} to join` : 'P2: any button on pad 2 to join', W / 2, topY, { font: font(400, 24, 'Bungee'), color: COLORS.p[1], edge: 5, edgeColor: COLORS.bg })
          ctx.globalAlpha = 1
        }

        // wave banner
        if (banner.t > 0) {
          const k = Math.min(1, banner.t * 2, (2.2 - Math.min(2.2, banner.t)) * 4)
          ctx.globalAlpha = clamp(k, 0, 1)
          const s = 1 + (1 - clamp(k, 0, 1)) * 0.2
          label(ctx, banner.text, W / 2, T.arena.y - 20, { font: font(400, Math.round(72 * s), 'Bungee'), color: banner.color, edge: 10, edgeColor: COLORS.bg })
          if (banner.sub) label(ctx, banner.sub, W / 2, T.arena.y + 44, { font: font(400, 30, 'Bungee'), color: banner.sub.startsWith('BOSS') && Math.floor(t * 4) % 2 ? '#ffffff' : banner.color, edge: 6, edgeColor: COLORS.bg })
          ctx.globalAlpha = 1
        } else if (sim.phase === 'break' && sim.wave === 0) {
          label(ctx, 'SURVIVE 10 WAVES', W / 2, T.arena.y, { font: font(400, 40, 'Bungee'), color: COLORS.ring, edge: 8, edgeColor: COLORS.bg })
        }

        // touch controls
        if (input.mode === 'touch') {
          ctx.save()
          ctx.globalCompositeOperation = 'lighter'
          const ready = sim.players[0].dashCd <= 0
          ctx.globalAlpha = ready ? 0.9 : 0.4
          ctx.strokeStyle = COLORS.p[0]
          ctx.lineWidth = 4
          ctx.beginPath()
          ctx.arc(DASH_BTN.x, DASH_BTN.y, DASH_BTN.r, 0, TAU)
          ctx.stroke()
          ctx.fillStyle = 'rgba(42,245,255,0.12)'
          ctx.fill()
          ctx.globalCompositeOperation = 'source-over'
          label(ctx, 'DASH', DASH_BTN.x, DASH_BTN.y, { font: font(400, 24, 'Bungee'), color: COLORS.p[0] })
          for (const tc of touches.values()) {
            if (tc.role !== 'move' && tc.role !== 'aim') continue
            ctx.globalAlpha = 0.35
            ctx.strokeStyle = tc.role === 'move' ? '#d8ccff' : '#ff9ad8'
            ctx.lineWidth = 3
            ctx.beginPath()
            ctx.arc(tc.ox, tc.oy, 80, 0, TAU)
            ctx.stroke()
            ctx.globalAlpha = 0.6
            ctx.fillStyle = ctx.strokeStyle
            ctx.beginPath()
            const dx = tc.x - tc.ox
            const dy = tc.y - tc.oy
            const d = Math.min(80, Math.hypot(dx, dy)) / (Math.hypot(dx, dy) || 1)
            ctx.arc(tc.ox + dx * d, tc.oy + dy * d, 30, 0, TAU)
            ctx.fill()
          }
          ctx.restore()
        }
      }
    }
    return run
  }
}
