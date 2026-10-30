// Tiny Towers: a mini tower defense on one winding path. Five waves of toy critters march toward
// your castle; build Arrow, Cannon and Frost towers beside the path, upgrade them once, sell them
// for 70%. Style: a cozy toy diorama (green felt board, dirt path, wooden-block towers with
// coloured roofs, round critters). The rules at the top are pure (no drawing), so a node script
// can play whole games with bots: import { SIM } from './tiny-towers.js'.
import { W, H, TAU, clamp, lerp, rand, label, createFx } from '../common.js'

const TUNING = {
  cols: 15,
  rows: 9,
  tile: 64,
  startGold: 150,
  lives: 10,
  firstBuild: 25, // seconds before wave 1
  between: 14, // seconds between waves
  earlyGold: 1, // gold per second left on the clock when you call a wave early
  clearBonus: 25, // gold for clearing a wave
  sellRefund: 0.7,
  score: { life: 100, victory: 500 },
  towers: {
    arrow: {
      name: 'Arrow',
      cost: 50,
      role: 'Fast shots, one target',
      lv: [
        { range: 150, dmg: 9, rate: 0.45, speed: 820 },
        { cost: 60, range: 180, dmg: 14, rate: 0.32, speed: 900 }
      ]
    },
    cannon: {
      name: 'Cannon',
      cost: 80,
      role: 'Splash, cracks armor',
      lv: [
        { range: 140, dmg: 32, splash: 58, rate: 1.4, speed: 430 },
        { cost: 90, range: 165, dmg: 58, splash: 74, rate: 1.2, speed: 470 }
      ]
    },
    frost: {
      name: 'Frost',
      cost: 60,
      role: 'Slows all in range',
      lv: [
        { range: 120, dmg: 2, slow: 0.45, slowTime: 1.3, rate: 0.8 },
        { cost: 70, range: 150, dmg: 5, slow: 0.6, slowTime: 1.6, rate: 0.7 }
      ]
    }
  },
  enemies: {
    walker: { name: 'Walkers', hp: 42, speed: 56, armor: 0, gold: 6, value: 10, lives: 1, r: 15 },
    runner: { name: 'Runners', hp: 30, speed: 108, armor: 0, gold: 5, value: 12, lives: 1, r: 12 },
    tank: { name: 'Tanks', hp: 210, speed: 32, armor: 6, gold: 14, value: 30, lives: 2, r: 19 },
    boss: { name: 'Big Boss', hp: 1500, speed: 24, armor: 8, gold: 80, value: 300, lives: 4, r: 28, slowResist: 0.5 }
  },
  armorMin: 0.25, // a hit always does at least this share of its damage
  // groups: [type, count, gap seconds, start time]
  waves: [
    { tip: 'Walkers! Arrows pick them off.', hp: 1, groups: [['walker', 10, 1.3, 0]] },
    { tip: 'Fast runners! Frost slows them.', hp: 1.2, groups: [['walker', 8, 1.2, 0], ['runner', 8, 0.8, 5]] },
    { tip: 'Armored tanks! Cannons crack armor.', hp: 1.45, groups: [['walker', 10, 1.0, 0], ['tank', 4, 3.2, 4], ['runner', 6, 0.7, 12]] },
    { tip: 'A big push. Upgrade your towers!', hp: 1.75, groups: [['runner', 10, 0.6, 0], ['tank', 6, 2.6, 3], ['walker', 14, 0.8, 6]] },
    { tip: 'The Big Boss is coming!', hp: 2, groups: [['walker', 8, 0.9, 0], ['tank', 5, 2.4, 2], ['runner', 10, 0.6, 10], ['boss', 1, 1, 16]] }
  ],
  caps: { shots: 80, rings: 40, floaters: 40, particles: 260 }
}

// ---- board (pure) ------------------------------------------------------------------------------

const TS = TUNING.tile
const COLS = TUNING.cols
const ROWS = TUNING.rows
const BX = 24
const BY = 104
const GW = COLS * TS
const GH = ROWS * TS
const KINDS = ['arrow', 'cannon', 'frost']
const key = (x, y) => y * COLS + x
const tileCentre = (x, y) => [BX + x * TS + TS / 2, BY + y * TS + TS / 2]
const inGrid = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS

// waypoints in tile coordinates; the path enters from the left and ends at the castle
const WAYPOINTS = [[-1, 1], [3, 1], [3, 6], [7, 6], [7, 2], [11, 2], [11, 6], [14, 6]]
const CASTLE = { x: 14, y: 6 }
const BLOCKED = new Set() // path, castle and decorations: nothing can be built there
const PATH_TILES = new Set()
for (let i = 0; i < WAYPOINTS.length - 1; i++) {
  const [ax, ay] = WAYPOINTS[i]
  const [bx, by] = WAYPOINTS[i + 1]
  const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay))
  for (let k = 0; k <= n; k++) {
    const x = ax + Math.sign(bx - ax) * k
    const y = ay + Math.sign(by - ay) * k
    if (inGrid(x, y)) PATH_TILES.add(key(x, y))
  }
}
const CASTLE_TILES = [[14, 5], [14, 6], [14, 7], [13, 7]]
const DECOR = [
  { x: 0, y: 7, kind: 'tree' },
  { x: 1, y: 8, kind: 'rock' },
  { x: 5, y: 0, kind: 'tree' },
  { x: 9, y: 8, kind: 'tree' },
  { x: 13, y: 0, kind: 'tree' },
  { x: 14, y: 1, kind: 'rock' },
  { x: 14, y: 8, kind: 'tree' },
  { x: 0, y: 4, kind: 'rock' }
]
for (const k of PATH_TILES) BLOCKED.add(k)
for (const [x, y] of CASTLE_TILES) BLOCKED.add(key(x, y))
for (const d of DECOR) BLOCKED.add(key(d.x, d.y))

// the path as a polyline in pixels with cumulative lengths
const PATH = WAYPOINTS.map(([x, y]) => tileCentre(x, y))
PATH[0][0] = BX - 40
const SEGS = []
let PATH_LEN = 0
for (let i = 0; i < PATH.length - 1; i++) {
  const [ax, ay] = PATH[i]
  const [bx, by] = PATH[i + 1]
  const len = Math.hypot(bx - ax, by - ay)
  SEGS.push({ ax, ay, dx: (bx - ax) / len, dy: (by - ay) / len, len, at: PATH_LEN })
  PATH_LEN += len
}
function posAt(d, out = {}) {
  d = clamp(d, 0, PATH_LEN)
  let s = SEGS[SEGS.length - 1]
  for (const g of SEGS)
    if (d <= g.at + g.len) {
      s = g
      break
    }
  const u = d - s.at
  out.x = s.ax + s.dx * u
  out.y = s.ay + s.dy * u
  out.dx = s.dx
  out.dy = s.dy
  return out
}
// samples every 8 px (for bots and the coverage of a tower spot)
const SAMPLES = []
for (let d = 0; d <= PATH_LEN; d += 8) SAMPLES.push(posAt(d, {}))
/** How much of the path (in 8 px samples) a tower at this tile with this range would cover. */
function coverage(tx, ty, range) {
  const [cx, cy] = tileCentre(tx, ty)
  let n = 0
  for (const p of SAMPLES) if ((p.x - cx) ** 2 + (p.y - cy) ** 2 <= range * range) n++
  return n
}
const canBuildTile = (x, y) => inGrid(x, y) && !BLOCKED.has(key(x, y))

// ---- rules (pure) ------------------------------------------------------------------------------

/** A whole game. emit(type, data) reports what happened (for sound and juice). */
function createSim(T = TUNING, emit = () => {}) {
  const s = {
    gold: T.startGold,
    lives: T.lives,
    wave: 0, // index of the wave running or coming next
    phase: 'build', // 'build' (countdown) | 'wave' | 'won' | 'lost'
    timer: T.firstBuild,
    waveT: 0,
    queue: [],
    towers: [],
    enemies: [],
    shots: [],
    kills: 0,
    killValue: 0,
    leaked: 0,
    time: 0,
    nextId: 1,
    spent: 0
  }
  const at = new Map()
  const lv = (tw) => T.towers[tw.kind].lv[tw.lvl]

  s.towerAt = (x, y) => at.get(key(x, y)) ?? null
  s.canBuild = (x, y) => canBuildTile(x, y) && !at.has(key(x, y))
  s.score = () => s.killValue + s.lives * T.score.life + (s.phase === 'won' ? T.score.victory : 0)
  s.upgradeCost = (tw) => (tw.lvl === 0 ? T.towers[tw.kind].lv[1].cost : null)
  s.refund = (tw) => Math.floor(tw.spent * T.sellRefund)
  s.stats = lv
  s.build = (kind, x, y) => {
    const cost = T.towers[kind].cost
    if (!s.canBuild(x, y) || s.gold < cost || s.phase === 'won' || s.phase === 'lost') return null
    const [cx, cy] = tileCentre(x, y)
    const tw = { id: s.nextId++, kind, lvl: 0, x, y, cx, cy, cool: 0.2, spent: cost, ang: -Math.PI / 2, kick: 0, pop: 0, flash: 0 }
    s.gold -= cost
    s.spent += cost
    s.towers.push(tw)
    at.set(key(x, y), tw)
    emit('build', tw)
    return tw
  }
  s.upgrade = (tw) => {
    const cost = s.upgradeCost(tw)
    if (cost === null || s.gold < cost) return false
    s.gold -= cost
    s.spent += cost
    tw.spent += cost
    tw.lvl = 1
    emit('upgrade', tw)
    return true
  }
  s.sell = (tw) => {
    const g = s.refund(tw)
    s.gold += g
    s.towers.splice(s.towers.indexOf(tw), 1)
    at.delete(key(tw.x, tw.y))
    emit('sell', { tw, gold: g })
    return g
  }
  /** Start the next wave now (from the countdown). Calling early pays a little gold. */
  s.callWave = () => {
    if (s.phase !== 'build') return false
    const bonus = Math.floor(s.timer) * T.earlyGold
    if (bonus > 0) s.gold += bonus
    startWave(bonus)
    return true
  }
  function startWave(bonus = 0) {
    const w = T.waves[s.wave]
    s.phase = 'wave'
    s.waveT = 0
    s.queue = []
    for (const [type, n, gap, start] of w.groups) for (let i = 0; i < n; i++) s.queue.push({ type, t: start + i * gap })
    s.queue.sort((a, b) => a.t - b.t)
    emit('wave', { n: s.wave + 1, tip: w.tip, bonus })
  }
  function spawn(type) {
    const e = T.enemies[type]
    const hp = Math.round(e.hp * (T.waves[s.wave].hp ?? 1))
    const en = { id: s.nextId++, type, hp, max: hp, d: 0, speed: e.speed, armor: e.armor, slow: 0, slowT: 0, r: e.r, alive: true, x: 0, y: 0, dx: 1, dy: 0, hurt: 0, bob: Math.random() * TAU }
    posAt(0, en)
    s.enemies.push(en)
  }
  function damage(en, dmg, by) {
    if (!en.alive) return
    const d = Math.max(dmg * T.armorMin, dmg - en.armor)
    en.hp -= d
    en.hurt = 0.12
    if (en.hp <= 0) {
      en.alive = false
      const e = T.enemies[en.type]
      s.gold += e.gold
      s.kills++
      s.killValue += e.value
      emit('kill', { en, gold: e.gold, by })
    }
  }
  const speedOf = (en) => en.speed * (1 - (en.slowT > 0 ? en.slow : 0))

  s.step = (dt) => {
    if (s.phase === 'won' || s.phase === 'lost') return
    s.time += dt
    if (s.phase === 'build') {
      s.timer -= dt
      if (s.timer <= 0) startWave()
    }
    if (s.phase === 'wave') {
      s.waveT += dt
      while (s.queue.length && s.queue[0].t <= s.waveT) spawn(s.queue.shift().type)
    }
    // critters walk
    for (const en of s.enemies) {
      if (!en.alive) continue
      if (en.slowT > 0) en.slowT -= dt
      en.hurt = Math.max(0, en.hurt - dt)
      en.d += speedOf(en) * dt
      en.bob += dt * (6 + en.speed * 0.06)
      posAt(en.d, en)
      if (en.d >= PATH_LEN) {
        en.alive = false
        const lost = T.enemies[en.type].lives
        s.lives = Math.max(0, s.lives - lost)
        s.leaked++
        emit('leak', { en, lost })
        if (s.lives <= 0) {
          s.phase = 'lost'
          emit('lose', {})
          return
        }
      }
    }
    // towers fire
    for (const tw of s.towers) {
      const st = lv(tw)
      tw.kick = Math.max(0, tw.kick - dt * 5)
      tw.pop = Math.min(1, tw.pop + dt * 4)
      tw.flash = Math.max(0, tw.flash - dt * 3)
      tw.cool -= dt
      const r2 = st.range * st.range
      if (tw.kind === 'frost') {
        if (tw.cool > 0) continue
        let any = false
        for (const en of s.enemies) {
          if (!en.alive || (en.x - tw.cx) ** 2 + (en.y - tw.cy) ** 2 > r2) continue
          any = true
          const resist = T.enemies[en.type].slowResist ?? 0
          en.slow = Math.max(en.slowT > 0 ? en.slow : 0, st.slow * (1 - resist))
          en.slowT = st.slowTime
          damage(en, st.dmg, tw)
        }
        if (any) {
          tw.cool = st.rate
          tw.kick = 1
          emit('frost', tw)
        }
        continue
      }
      // the critter furthest along the path in range
      let best = null
      for (const en of s.enemies) if (en.alive && (en.x - tw.cx) ** 2 + (en.y - tw.cy) ** 2 <= r2 && (!best || en.d > best.d)) best = en
      if (!best) continue
      tw.ang = Math.atan2(best.y - tw.cy, best.x - tw.cx)
      if (tw.cool > 0) continue
      tw.cool = st.rate
      tw.kick = 1
      if (s.shots.length >= T.caps.shots) continue
      const sy = tw.cy - (tw.kind === 'arrow' ? 40 + tw.lvl * 12 : 26)
      if (tw.kind === 'arrow') {
        s.shots.push({ kind: 'arrow', x: tw.cx, y: sy, target: best, tx: best.x, ty: best.y, dmg: st.dmg, speed: st.speed, tw, trail: [] })
      } else {
        // lob a shell where the critter will be when it lands
        const flight = Math.hypot(best.x - tw.cx, best.y - tw.cy) / st.speed + 0.12
        const p = posAt(best.d + speedOf(best) * flight, {})
        s.shots.push({ kind: 'shell', x0: tw.cx + Math.cos(tw.ang) * 20, y0: sy, x: tw.cx, y: sy, tx: p.x, ty: p.y, t: 0, dur: flight, dmg: st.dmg, splash: st.splash, tw, lvl: tw.lvl, h: 0 })
      }
      emit('shoot', tw)
    }
    // shots fly
    for (let i = s.shots.length - 1; i >= 0; i--) {
      const sh = s.shots[i]
      if (sh.kind === 'arrow') {
        if (sh.target.alive) ((sh.tx = sh.target.x), (sh.ty = sh.target.y - 6))
        const dx = sh.tx - sh.x
        const dy = sh.ty - sh.y
        const dist = Math.hypot(dx, dy)
        const step = sh.speed * dt
        sh.ang = Math.atan2(dy, dx)
        if (dist <= step + 6) {
          if (sh.target.alive) damage(sh.target, sh.dmg, sh.tw)
          emit('hit', sh)
          s.shots.splice(i, 1)
          continue
        }
        sh.x += (dx / dist) * step
        sh.y += (dy / dist) * step
      } else {
        sh.t += dt
        const u = Math.min(1, sh.t / sh.dur)
        sh.x = lerp(sh.x0, sh.tx, u)
        sh.y = lerp(sh.y0, sh.ty, u)
        sh.h = Math.sin(u * Math.PI) * (40 + sh.dur * 60)
        if (u >= 1) {
          for (const en of s.enemies) {
            if (!en.alive) continue
            const dd = Math.hypot(en.x - sh.tx, en.y - sh.ty)
            if (dd <= sh.splash + en.r * 0.5) damage(en, sh.dmg * (dd < sh.splash * 0.4 ? 1 : 0.7), sh.tw)
          }
          emit('splash', sh)
          s.shots.splice(i, 1)
        }
      }
    }
    for (let i = s.enemies.length - 1; i >= 0; i--) if (!s.enemies[i].alive) s.enemies.splice(i, 1)
    // wave over?
    if (s.phase === 'wave' && !s.queue.length && !s.enemies.length) {
      if (s.wave >= T.waves.length - 1) {
        s.phase = 'won'
        emit('win', {})
      } else {
        s.wave++
        s.gold += T.clearBonus
        s.phase = 'build'
        s.timer = T.between
        emit('clear', { n: s.wave, bonus: T.clearBonus })
      }
    }
  }
  return s
}

export const SIM = { TUNING, createSim, coverage, canBuildTile, tileCentre, PATH_TILES, COLS, ROWS, KINDS }

// ---- look --------------------------------------------------------------------------------------

const C = {
  table: '#7a4f30',
  tableDark: '#5e3a22',
  tableLine: 'rgba(40,20,8,0.35)',
  felt: '#5f9a4a',
  feltA: '#649f4e',
  feltB: '#5a9346',
  feltDark: '#3f6e30',
  dirt: '#c99a62',
  dirtDark: '#9b7044',
  dirtLight: '#ddb27a',
  wood: '#c08048',
  woodTop: '#dfa565',
  woodDark: '#8a5530',
  ink: '#2b1d12',
  cream: '#fbf0d9',
  paper: '#f4e4c1',
  paperDark: '#d9c39a',
  gold: '#ffcf3f',
  heart: '#e2475a',
  shadow: 'rgba(30,20,10,0.28)',
  roof: { arrow: '#4caf50', cannon: '#d9534f', frost: '#5bb8e8' },
  roofDark: { arrow: '#2f7d34', cannon: '#9e3330', frost: '#3685b3' },
  critter: { walker: '#e8853f', runner: '#f2c84b', tank: '#8a7bb0', boss: '#cf3f4f' },
  critterDark: { walker: '#b35a22', runner: '#c4972a', tank: '#5d4f84', boss: '#8e2433' }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
function shadow(ctx, x, y, rx, ry, a = 0.28) {
  ctx.fillStyle = `rgba(30,20,10,${a})`
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU)
  ctx.fill()
}

/** A wooden-block tower. s scales it (1 on the board), lvl 0/1, ang = aim, kick = recoil 0..1. */
function drawTower(ctx, kind, lvl, x, y, { s = 1, ang = -Math.PI / 2, kick = 0, t = 0, pop = 1, alpha = 1 } = {}) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  const sq = pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.25 : 1
  ctx.scale(s / sq, s * sq * (0.6 + 0.4 * Math.min(1, pop * 1.4)))
  shadow(ctx, 2, 18, 28, 10)
  // base block (front face + lighter top)
  const block = (bx, by, bw, bh, front, top, dark) => {
    ctx.fillStyle = front
    roundRect(ctx, bx, by, bw, bh, 4)
    ctx.fill()
    ctx.fillStyle = top
    roundRect(ctx, bx, by, bw, 8, [4, 4, 0, 0])
    ctx.fill()
    ctx.strokeStyle = dark
    ctx.lineWidth = 2
    roundRect(ctx, bx, by, bw, bh, 4)
    ctx.stroke()
  }
  block(-24, -6, 48, 26, C.wood, C.woodTop, C.woodDark)
  // wood grain
  ctx.strokeStyle = 'rgba(90,50,20,0.35)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-18, 8)
  ctx.lineTo(-4, 8)
  ctx.moveTo(4, 13)
  ctx.lineTo(18, 13)
  ctx.stroke()
  const roof = C.roof[kind]
  const roofD = C.roofDark[kind]
  if (kind === 'arrow') {
    const top = lvl ? -52 : -38
    block(-16, top, 32, -6 - top, '#e7c08a', '#f4d6a6', C.woodDark)
    if (lvl) block(-16, -38, 32, 2, '#d7ac72', '#d7ac72', C.woodDark)
    // window slit
    ctx.fillStyle = C.ink
    roundRect(ctx, -3, top + 12, 6, 12, 3)
    ctx.fill()
    // pointed roof
    ctx.fillStyle = roof
    ctx.beginPath()
    ctx.moveTo(-22, top + 2)
    ctx.lineTo(0, top - 30)
    ctx.lineTo(22, top + 2)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = roofD
    ctx.lineWidth = 2.5
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.beginPath()
    ctx.moveTo(-16, top)
    ctx.lineTo(0, top - 24)
    ctx.lineTo(-4, top)
    ctx.closePath()
    ctx.fill()
    // a little bow on the front, aimed
    ctx.save()
    ctx.translate(0, top + 8)
    ctx.rotate(ang + Math.PI / 2)
    ctx.translate(0, kick * 3)
    ctx.strokeStyle = '#6b3d1c'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(0, -4, 10, Math.PI * 1.15, Math.PI * 1.85)
    ctx.stroke()
    ctx.restore()
    if (lvl) flag(ctx, 0, top - 30, t, C.gold)
  } else if (kind === 'cannon') {
    block(-20, -24, 40, 20, '#9aa0a8', '#b9bec5', '#5d636b')
    // stone lines
    ctx.strokeStyle = 'rgba(60,64,70,0.5)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(-20, -12)
    ctx.lineTo(20, -12)
    ctx.moveTo(-4, -24)
    ctx.lineTo(-4, -12)
    ctx.moveTo(8, -12)
    ctx.lineTo(8, -4)
    ctx.stroke()
    // dome cap
    ctx.fillStyle = roof
    ctx.beginPath()
    ctx.ellipse(0, -26, lvl ? 19 : 16, lvl ? 15 : 12, 0, Math.PI, 0)
    ctx.fill()
    ctx.strokeStyle = roofD
    ctx.lineWidth = 2.5
    ctx.stroke()
    // barrel
    ctx.save()
    ctx.translate(0, -28)
    ctx.rotate(ang)
    ctx.translate(-kick * 6, 0)
    const bl = lvl ? 30 : 25
    const bw = lvl ? 15 : 12
    ctx.fillStyle = '#2d2f34'
    roundRect(ctx, 0, -bw / 2, bl, bw, 4)
    ctx.fill()
    ctx.fillStyle = '#4a4d54'
    roundRect(ctx, bl - 6, -bw / 2 - 2, 7, bw + 4, 3)
    ctx.fill()
    if (lvl) {
      ctx.fillStyle = C.gold
      ctx.fillRect(10, -bw / 2, 4, bw)
    }
    ctx.restore()
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.beginPath()
    ctx.ellipse(-6, -32, 5, 3, -0.4, 0, TAU)
    ctx.fill()
  } else {
    const top = lvl ? -46 : -34
    block(-17, top, 34, -6 - top, '#e9e3d4', '#ffffff', '#9aa3ad')
    ctx.fillStyle = roof
    ctx.beginPath()
    ctx.moveTo(-21, top + 2)
    ctx.quadraticCurveTo(0, top - 14, 21, top + 2)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = roofD
    ctx.lineWidth = 2.5
    ctx.stroke()
    if (lvl) {
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.ellipse(0, top - 4, 12, 4, 0, 0, TAU)
      ctx.fill()
    }
    // floating crystal
    const fy = top - 22 - Math.sin(t * 3) * 3 - kick * 4
    const cs = lvl ? 13 : 10
    ctx.fillStyle = 'rgba(160,220,255,0.35)'
    ctx.beginPath()
    ctx.arc(0, fy, cs + 6 + kick * 6, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#bfe9ff'
    ctx.beginPath()
    ctx.moveTo(0, fy - cs * 1.3)
    ctx.lineTo(cs * 0.8, fy)
    ctx.lineTo(0, fy + cs * 1.3)
    ctx.lineTo(-cs * 0.8, fy)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#3685b3'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.moveTo(0, fy - cs * 1.1)
    ctx.lineTo(cs * 0.35, fy - cs * 0.2)
    ctx.lineTo(0, fy)
    ctx.closePath()
    ctx.fill()
  }
  // upgrade star on the base
  if (lvl) {
    star(ctx, 0, 8, 8, C.gold, '#9a6a10')
  }
  ctx.restore()
}
function flag(ctx, x, y, t, color) {
  ctx.strokeStyle = '#5a3a1e'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x, y - 16)
  ctx.stroke()
  const w = Math.sin(t * 6) * 2
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y - 16)
  ctx.quadraticCurveTo(x + 7, y - 15 + w, x + 13, y - 13 + w)
  ctx.lineTo(x, y - 9)
  ctx.closePath()
  ctx.fill()
}
function star(ctx, x, y, r, fill, edge) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.45 : r
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = edge
  ctx.lineWidth = 1.5
  ctx.stroke()
}

/** A round toy critter. dir = facing x sign, bob = walk phase, slowed tints it icy. */
function drawCritter(ctx, type, x, y, r, { bob = 0, dirX = 1, slowed = false, hurt = 0, s = 1 } = {}) {
  const hop = Math.abs(Math.sin(bob)) * r * 0.28
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  shadow(ctx, 0, r * 0.75, r * (1 - hop / r / 3), r * 0.32, 0.3)
  ctx.translate(0, -hop)
  const body = C.critter[type]
  const dark = C.critterDark[type]
  // feet
  ctx.fillStyle = dark
  const f = Math.sin(bob) * r * 0.25
  ctx.beginPath()
  ctx.ellipse(-r * 0.4 + f, r * 0.72, r * 0.28, r * 0.18, 0, 0, TAU)
  ctx.ellipse(r * 0.4 - f, r * 0.72, r * 0.28, r * 0.18, 0, 0, TAU)
  ctx.fill()
  // ears
  ctx.fillStyle = body
  ctx.strokeStyle = dark
  ctx.lineWidth = Math.max(2, r * 0.12)
  if (type === 'runner') {
    for (const sx of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(sx * r * 0.35, -r * 1.05, r * 0.2, r * 0.55, sx * 0.25, 0, TAU)
      ctx.fill()
      ctx.stroke()
    }
  } else if (type === 'walker') {
    for (const sx of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(sx * r * 0.62, -r * 0.62, r * 0.32, 0, TAU)
      ctx.fill()
      ctx.stroke()
    }
  }
  // body
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, TAU)
  ctx.fill()
  ctx.stroke()
  // belly highlight
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.beginPath()
  ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.35, r * 0.22, -0.5, 0, TAU)
  ctx.fill()
  if (type === 'tank' || type === 'boss') {
    // a riveted helmet
    ctx.fillStyle = type === 'boss' ? '#6d2730' : '#7f8792'
    ctx.beginPath()
    ctx.arc(0, -r * 0.1, r * 1.02, Math.PI * 1.08, Math.PI * 1.92)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = type === 'boss' ? '#3d1218' : '#4b525c'
    ctx.stroke()
    ctx.fillStyle = '#d7dbe0'
    for (const a of [-0.75, -0.5, -0.25]) {
      ctx.beginPath()
      ctx.arc(Math.cos(a * Math.PI) * r * 0.82, -r * 0.1 + Math.sin(a * Math.PI) * r * 0.82, r * 0.07, 0, TAU)
      ctx.fill()
    }
  }
  if (type === 'boss') {
    // crown
    ctx.fillStyle = C.gold
    ctx.strokeStyle = '#9a6a10'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(-r * 0.5, -r * 0.9)
    ctx.lineTo(-r * 0.55, -r * 1.45)
    ctx.lineTo(-r * 0.25, -r * 1.15)
    ctx.lineTo(0, -r * 1.55)
    ctx.lineTo(r * 0.25, -r * 1.15)
    ctx.lineTo(r * 0.55, -r * 1.45)
    ctx.lineTo(r * 0.5, -r * 0.9)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  // eyes looking the way it walks
  const ex = dirX * r * 0.22
  ctx.fillStyle = '#fff'
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(ex + sx * r * 0.3, r * 0.02, r * 0.22, 0, TAU)
    ctx.fill()
  }
  ctx.fillStyle = C.ink
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(ex + sx * r * 0.3 + dirX * r * 0.07, r * 0.05, r * 0.11, 0, TAU)
    ctx.fill()
  }
  if (type === 'boss') {
    ctx.strokeStyle = C.ink
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(ex - r * 0.55, -r * 0.3)
    ctx.lineTo(ex - r * 0.12, -r * 0.17)
    ctx.moveTo(ex + r * 0.55, -r * 0.3)
    ctx.lineTo(ex + r * 0.12, -r * 0.17)
    ctx.stroke()
  }
  // cheeks
  ctx.fillStyle = 'rgba(255,110,120,0.45)'
  ctx.beginPath()
  ctx.arc(ex - r * 0.55, r * 0.35, r * 0.14, 0, TAU)
  ctx.arc(ex + r * 0.55, r * 0.35, r * 0.14, 0, TAU)
  ctx.fill()
  if (hurt > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, hurt) * 0.6})`
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, TAU)
    ctx.fill()
  }
  if (slowed) {
    ctx.fillStyle = 'rgba(150,215,255,0.42)'
    ctx.beginPath()
    ctx.arc(0, 0, r * 1.05, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#e8f7ff'
    for (const [a, d] of [[-0.6, 0.85], [2.2, 0.9], [3.6, 0.8]]) {
      ctx.save()
      ctx.translate(Math.cos(a) * r * d, Math.sin(a) * r * d)
      ctx.rotate(a)
      ctx.fillRect(-r * 0.12, -r * 0.12, r * 0.24, r * 0.24)
      ctx.restore()
    }
  }
  ctx.restore()
}

function drawCastle(ctx, x, y, t, hit) {
  ctx.save()
  ctx.translate(x, y)
  if (hit > 0) ctx.translate(Math.sin(t * 80) * hit * 3, 0)
  shadow(ctx, 6, 44, 62, 16, 0.32)
  const stone = hit > 0.3 ? '#f2d0d0' : '#cfc6b8'
  const stoneTop = '#e6dfd3'
  const stoneDark = '#7d7468'
  const wall = (wx, wy, ww, wh) => {
    ctx.fillStyle = stone
    roundRect(ctx, wx, wy, ww, wh, 4)
    ctx.fill()
    ctx.strokeStyle = stoneDark
    ctx.lineWidth = 2.5
    ctx.stroke()
    // battlements
    ctx.fillStyle = stoneTop
    for (let bx = wx; bx < wx + ww - 4; bx += 14) {
      roundRect(ctx, bx, wy - 9, 9, 10, 2)
      ctx.fill()
      ctx.stroke()
    }
  }
  wall(-44, -40, 88, 84)
  // towers
  for (const sx of [-1, 1]) {
    wall(sx * 46 - 17, -78, 34, 122)
    ctx.fillStyle = '#c94a4a'
    ctx.beginPath()
    ctx.moveTo(sx * 46 - 21, -86)
    ctx.lineTo(sx * 46, -118)
    ctx.lineTo(sx * 46 + 21, -86)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#8c2e2e'
    ctx.lineWidth = 2.5
    ctx.stroke()
    flag(ctx, sx * 46, -118, t + sx, '#4c8fe0')
    ctx.fillStyle = C.ink
    roundRect(ctx, sx * 46 - 4, -56, 8, 14, 4)
    ctx.fill()
  }
  // stone lines
  ctx.strokeStyle = 'rgba(100,90,80,0.35)'
  ctx.lineWidth = 1.5
  for (let ly = -24; ly < 40; ly += 14) {
    ctx.beginPath()
    ctx.moveTo(-28, ly)
    ctx.lineTo(28, ly)
    ctx.stroke()
  }
  // gate
  ctx.fillStyle = '#6a4224'
  ctx.beginPath()
  ctx.moveTo(-18, 44)
  ctx.lineTo(-18, 8)
  ctx.arc(0, 8, 18, Math.PI, 0)
  ctx.lineTo(18, 44)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#3a2412'
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.strokeStyle = 'rgba(30,15,5,0.55)'
  for (const gx of [-8, 0, 8]) {
    ctx.beginPath()
    ctx.moveTo(gx, 0)
    ctx.lineTo(gx, 44)
    ctx.stroke()
  }
  ctx.restore()
}

function drawTree(ctx, x, y, s = 1) {
  shadow(ctx, x + 3, y + 18 * s, 22 * s, 8 * s)
  ctx.fillStyle = '#7a4a26'
  roundRect(ctx, x - 4 * s, y, 8 * s, 18 * s, 3)
  ctx.fill()
  for (const [dx, dy, r, c] of [[0, -6, 20, '#2f7a3a'], [-8, -14, 13, '#3c9447'], [7, -18, 11, '#4aa955']]) {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, TAU)
    ctx.fill()
  }
  ctx.strokeStyle = '#1f5427'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y - 6 * s, 20 * s, 0, TAU)
  ctx.stroke()
}
function drawRock(ctx, x, y) {
  shadow(ctx, x + 2, y + 12, 22, 7)
  ctx.fillStyle = '#9b9a93'
  ctx.beginPath()
  ctx.ellipse(x - 5, y + 2, 16, 12, 0, 0, TAU)
  ctx.ellipse(x + 9, y + 6, 11, 8, 0, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = '#5f5e58'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.beginPath()
  ctx.ellipse(-9 + x, y - 3, 6, 3, -0.3, 0, TAU)
  ctx.fill()
}
function coin(ctx, x, y, r) {
  ctx.fillStyle = '#c8901a'
  ctx.beginPath()
  ctx.arc(x, y + r * 0.15, r, 0, TAU)
  ctx.fill()
  ctx.fillStyle = C.gold
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = '#9a6a10'
  ctx.lineWidth = Math.max(1.5, r * 0.15)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.28, 0, TAU)
  ctx.fill()
}
function heart(ctx, x, y, r) {
  ctx.fillStyle = C.heart
  ctx.beginPath()
  ctx.moveTo(x, y + r * 0.9)
  ctx.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.45)
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.5, y - r * 0.1, x, y + r * 0.9)
  ctx.fill()
  ctx.strokeStyle = '#8e2433'
  ctx.lineWidth = 2
  ctx.stroke()
}

/** The table, the felt board and the dirt path (everything that never moves). */
function paintBoard(ctx) {
  // wooden tabletop
  ctx.fillStyle = C.table
  ctx.fillRect(0, 0, W, H)
  for (let y = 0; y < H; y += 46) {
    ctx.fillStyle = (y / 46) % 2 ? 'rgba(255,220,170,0.04)' : 'rgba(0,0,0,0.05)'
    ctx.fillRect(0, y, W, 46)
    ctx.strokeStyle = C.tableLine
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  ctx.strokeStyle = 'rgba(40,20,8,0.16)'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W
    const y = Math.floor(rnd() * 18) * 46 + 10 + rnd() * 26
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(x + 30, y - 3, x + 60, y + 3, x + 90 + rnd() * 80, y)
    ctx.stroke()
  }
  // board slab with a soft shadow
  ctx.fillStyle = 'rgba(20,10,4,0.35)'
  roundRect(ctx, BX - 10, BY - 4, GW + 26, GH + 24, 18)
  ctx.fill()
  ctx.fillStyle = '#2f5a24'
  roundRect(ctx, BX - 12, BY - 12, GW + 24, GH + 26, 16)
  ctx.fill()
  ctx.fillStyle = C.felt
  roundRect(ctx, BX - 12, BY - 12, GW + 24, GH + 20, 16)
  ctx.fill()
  // tiles: a gentle check so the grid reads
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = (x + y) % 2 ? C.feltA : C.feltB
      ctx.fillRect(BX + x * TS, BY + y * TS, TS, TS)
    }
  // felt fuzz
  for (let i = 0; i < 2600; i++) {
    const x = BX - 8 + rnd() * (GW + 16)
    const y = BY - 8 + rnd() * (GH + 12)
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,220,0.07)' : 'rgba(10,40,10,0.09)'
    ctx.fillRect(x, y, 2, 2)
  }
  // grass tufts
  for (let i = 0; i < 70; i++) {
    const tx = Math.floor(rnd() * COLS)
    const ty = Math.floor(rnd() * ROWS)
    if (BLOCKED.has(key(tx, ty))) continue
    const x = BX + tx * TS + 10 + rnd() * 44
    const y = BY + ty * TS + 14 + rnd() * 40
    ctx.strokeStyle = 'rgba(40,90,30,0.6)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 4, y)
    ctx.lineTo(x - 6, y - 7)
    ctx.moveTo(x, y)
    ctx.lineTo(x, y - 9)
    ctx.moveTo(x + 4, y)
    ctx.lineTo(x + 6, y - 7)
    ctx.stroke()
  }
  // dirt path: dark rim, fill, lighter centre
  const trace = () => {
    ctx.beginPath()
    ctx.moveTo(BX - 12, PATH[0][1])
    for (const [x, y] of PATH.slice(1)) ctx.lineTo(x, y)
  }
  ctx.lineJoin = 'round'
  ctx.lineCap = 'butt'
  ctx.save()
  ctx.beginPath()
  ctx.rect(BX - 12, BY - 12, GW + 24, GH + 24)
  ctx.clip()
  trace()
  ctx.strokeStyle = 'rgba(30,50,20,0.35)'
  ctx.lineWidth = 62
  ctx.stroke()
  trace()
  ctx.strokeStyle = C.dirtDark
  ctx.lineWidth = 56
  ctx.stroke()
  trace()
  ctx.strokeStyle = C.dirt
  ctx.lineWidth = 48
  ctx.stroke()
  trace()
  ctx.strokeStyle = C.dirtLight
  ctx.lineWidth = 18
  ctx.globalAlpha = 0.35
  ctx.stroke()
  ctx.globalAlpha = 1
  // pebbles
  for (let i = 0; i < 120; i++) {
    const p = SAMPLES[Math.floor(rnd() * SAMPLES.length)]
    const ox = (rnd() - 0.5) * 40
    const oy = (rnd() - 0.5) * 40
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(120,80,45,0.55)' : 'rgba(240,210,160,0.5)'
    ctx.beginPath()
    ctx.arc(p.x + ox, p.y + oy, 1.5 + rnd() * 2, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
  // entrance arrow
  ctx.fillStyle = 'rgba(255,240,200,0.75)'
  const ey = PATH[0][1]
  ctx.beginPath()
  ctx.moveTo(BX + 6, ey - 12)
  ctx.lineTo(BX + 26, ey)
  ctx.lineTo(BX + 6, ey + 12)
  ctx.closePath()
  ctx.fill()
  // stitched felt edge
  ctx.setLineDash([8, 7])
  ctx.strokeStyle = 'rgba(230,240,200,0.35)'
  ctx.lineWidth = 2
  roundRect(ctx, BX - 6, BY - 6, GW + 12, GH + 10, 12)
  ctx.stroke()
  ctx.setLineDash([])
  for (const d of DECOR) {
    const [x, y] = tileCentre(d.x, d.y)
    if (d.kind === 'tree') drawTree(ctx, x, y + 4)
    else drawRock(ctx, x, y)
  }
}
let BOARD = null
function boardCanvas() {
  if (BOARD) return BOARD
  BOARD = document.createElement('canvas')
  BOARD.width = W * 2
  BOARD.height = H * 2
  const c = BOARD.getContext('2d')
  c.scale(2, 2)
  paintBoard(c)
  return BOARD
}

// ---- the module --------------------------------------------------------------------------------

const ROLE_ICON_Y = 18

export default {
  id: 'tiny-towers',
  name: 'Tiny Towers',
  blurb: 'Build towers, hold 5 waves',
  scoreLabel: 'points',
  style: { bg: '#4f7f3a', accent: '#ffcf3f' },
  medals: [800, 2200, 3000],
  // a light toy march in G major
  music: { bpm: 112, root: 55, chords: [0, 5, 7, 0], lead: [0, 0, 2, 4, 4, 2, 4, null], wave: 'square', gain: 0.026 },
  TUNING,
  cursor: true,
  howTo: (input) =>
    input.mode === 'touch' || input.mode === 'mouse'
      ? `${input.label('a')} the grass to build · stop the critters`
      : `${input.dpadLabel()} move · ${input.label('a')} build / upgrade · ${input.label('y')} next wave`,
  icon(ctx, x, y, size, t = 0) {
    // a bit of path with two towers firing at a critter
    ctx.save()
    ctx.translate(x, y)
    const k = size / 170
    ctx.scale(k, k)
    ctx.fillStyle = C.felt
    roundRect(ctx, -190, -100, 380, 200, 18)
    ctx.fill()
    ctx.translate(0, -14)
    ctx.fillStyle = 'rgba(10,40,10,0.12)'
    for (let i = -176; i < 190; i += 32) ctx.fillRect(i, -86, 16, 200)
    ctx.strokeStyle = C.dirtDark
    ctx.lineWidth = 48
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(-190, 40)
    ctx.lineTo(-40, 40)
    ctx.lineTo(-40, -30)
    ctx.lineTo(190, -30)
    ctx.stroke()
    ctx.strokeStyle = C.dirt
    ctx.lineWidth = 40
    ctx.stroke()
    const cx = 50 + Math.sin(t * 1.2) * 30
    drawTower(ctx, 'arrow', 1, -110, -6, { s: 0.95, ang: Math.atan2(-34 - -66, cx + 110), t })
    drawTower(ctx, 'cannon', 0, 120, 18, { s: 1.1, ang: Math.atan2(-34 - -12, cx - 120), t })
    drawCritter(ctx, 'walker', cx, -36, 22, { bob: t * 9, dirX: 1 })
    // arrow in flight + a splash ring
    const u = (t * 1.6) % 1
    const ax = lerp(-104, cx - 10, u)
    const ay = lerp(-66, -40, u)
    ctx.strokeStyle = '#6b3d1c'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(ax - 14, ay - 3)
    ctx.lineTo(ax, ay)
    ctx.stroke()
    ctx.strokeStyle = `rgba(255,240,200,${1 - u})`
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(cx + 34, -28, 10 + u * 24, 0, TAU)
    ctx.stroke()
    ctx.restore()
  },
  create(env) {
    const { input, audio, settings } = env
    const T = env.TUNING
    const fx = createFx(settings, { max: T.caps.particles })
    const rings = [] // { x, y, r, max, t, dur, color, w }
    const floaters = [] // { x, y, text, color, t, coin }
    let banner = null // { title, sub, t, dur, color }
    let time = 0
    let fast = false
    let castleHit = 0
    let lastTwang = 0
    let lastPointer = { x: -1, y: -1 }
    const cur = { x: 2, y: 3, dx: 2, dy: 3 }
    let menu = null // { kind: 'build' | 'tower', tx, ty, i, tower? }
    let hint = null // { text, t }
    let endT = 0
    let builtOnce = false
    let skippedOnce = false

    // ---- sound ----
    const tone = (o) => audio.tone(o)
    const sfx = {
      cursor: () => tone({ freq: 520, dur: 0.03, type: 'triangle', gain: 0.04 }),
      open: () => tone({ freq: 640, dur: 0.06, type: 'triangle', gain: 0.07, slide: 200 }),
      close: () => tone({ freq: 520, dur: 0.06, type: 'triangle', gain: 0.05, slide: -160 }),
      nope: () => tone({ freq: 180, dur: 0.12, type: 'square', gain: 0.05, slide: -40 }),
      build: () => (tone({ freq: 150, dur: 0.14, type: 'triangle', gain: 0.22, slide: -70 }), audio.noise({ dur: 0.06, gain: 0.08 }), tone({ freq: 300, dur: 0.06, type: 'square', gain: 0.04, delay: 0.05 })),
      upgrade: () => [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.1, type: 'triangle', gain: 0.08, delay: i * 0.06 })),
      sell: () => [1046, 880, 1046, 1318].forEach((f, i) => tone({ freq: f, dur: 0.06, type: 'square', gain: 0.035, delay: i * 0.05 })),
      twang: () => {
        if (time - lastTwang < 0.07) return
        lastTwang = time
        tone({ freq: rand(820, 980), dur: 0.07, type: 'triangle', gain: 0.045, slide: -500 })
      },
      boom: () => (audio.noise({ dur: 0.22, gain: 0.12 }), tone({ freq: 95, dur: 0.24, type: 'sine', gain: 0.25, slide: -55 })),
      thump: () => tone({ freq: 70, dur: 0.12, type: 'sine', gain: 0.15, slide: -30 }),
      chime: () => (tone({ freq: 1568, dur: 0.22, type: 'sine', gain: 0.035 }), tone({ freq: 2093, dur: 0.25, type: 'sine', gain: 0.025, delay: 0.05 })),
      pop: () => tone({ freq: rand(560, 680), dur: 0.07, type: 'square', gain: 0.05, slide: 420 }),
      coin: () => (tone({ freq: 1318, dur: 0.05, type: 'square', gain: 0.03, delay: 0.04 }), tone({ freq: 1760, dur: 0.08, type: 'square', gain: 0.03, delay: 0.09 })),
      castle: () => (tone({ freq: 170, dur: 0.32, type: 'sawtooth', gain: 0.12, slide: -90 }), audio.noise({ dur: 0.18, gain: 0.1 })),
      horn: () => (tone({ freq: 196, dur: 0.45, type: 'sawtooth', gain: 0.06 }), tone({ freq: 294, dur: 0.6, type: 'sawtooth', gain: 0.06, delay: 0.28 }), tone({ freq: 392, dur: 0.5, type: 'triangle', gain: 0.05, delay: 0.28 })),
      cleared: () => [784, 988, 1175].forEach((f, i) => tone({ freq: f, dur: 0.12, type: 'triangle', gain: 0.07, delay: i * 0.08 })),
      victory: () => [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, dur: i === 6 ? 0.5 : 0.14, type: 'square', gain: 0.06, delay: i * 0.11 })),
      lose: () => [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.25, type: 'triangle', gain: 0.09, delay: i * 0.18 }))
    }

    // ---- juice from sim events ----
    const ring = (x, y, max, color, dur = 0.4, w = 4) => rings.length < T.caps.rings && rings.push({ x, y, max, color, t: 0, dur, w })
    const floater = (x, y, text, color, isCoin = false) => floaters.length < T.caps.floaters && floaters.push({ x, y, text, color, t: 0, coin: isCoin })
    function onEvent(type, d) {
      if (type === 'build') {
        sfx.build()
        fx.burst(d.cx, d.cy + 14, '#d9b98a', 10, 160, { size: 4, life: 0.4, gravity: 300 })
        fx.shake(0.12)
      } else if (type === 'upgrade') {
        sfx.upgrade()
        fx.burst(d.cx, d.cy - 20, C.gold, 16, 220, { size: 4, life: 0.6, gravity: 200, square: true })
        ring(d.cx, d.cy, 60, C.gold, 0.5)
        d.flash = 1
      } else if (type === 'sell') {
        sfx.sell()
        fx.burst(d.tw.cx, d.tw.cy, '#c08048', 14, 220, { size: 5, life: 0.5, square: true })
        floater(d.tw.cx, d.tw.cy - 30, `+${d.gold}`, C.gold, true)
      } else if (type === 'shoot') {
        if (d.kind === 'arrow') sfx.twang()
        else {
          sfx.thump()
          fx.burst(d.cx + Math.cos(d.ang) * 30, d.cy - 28 + Math.sin(d.ang) * 30, 'rgba(230,230,230,0.8)', 4, 60, { size: 5, life: 0.35, gravity: -60 })
        }
      } else if (type === 'splash') {
        sfx.boom()
        ring(d.tx, d.ty, d.splash, 'rgba(255,230,170,0.95)', 0.35, 6)
        fx.burst(d.tx, d.ty, '#a3784a', 10, 200, { size: 4, life: 0.4 })
        fx.burst(d.tx, d.ty, '#ffd27a', 6, 140, { size: 5, life: 0.25, gravity: 0 })
        fx.shake(0.08)
      } else if (type === 'hit') {
        fx.burst(d.tx, d.ty, '#f6e7c8', 3, 90, { size: 2.5, life: 0.2, gravity: 0 })
      } else if (type === 'frost') {
        sfx.chime()
        const r = sim.stats(d).range
        ring(d.cx, d.cy, r, 'rgba(190,235,255,0.9)', 0.55, 5)
        for (let i = 0; i < 6; i++) {
          const a = rand(0, TAU)
          const rr = rand(10, r)
          fx.burst(d.cx + Math.cos(a) * rr, d.cy + Math.sin(a) * rr, '#e8f7ff', 1, 30, { size: 3, life: 0.6, gravity: 20, square: true })
        }
      } else if (type === 'kill') {
        sfx.pop()
        sfx.coin()
        const en = d.en
        fx.burst(en.x, en.y, C.critter[en.type], en.type === 'boss' ? 40 : 12, en.type === 'boss' ? 380 : 240, { size: en.type === 'boss' ? 7 : 5, life: 0.5 })
        fx.burst(en.x, en.y, '#fff', 4, 120, { size: 3, life: 0.3, gravity: 0 })
        floater(en.x, en.y - en.r - 6, `+${d.gold}`, C.gold, true)
        if (en.type === 'boss') (fx.shake(0.6), ring(en.x, en.y, 120, C.gold, 0.7, 8))
      } else if (type === 'leak') {
        sfx.castle()
        castleHit = 1
        fx.shake(0.45)
        const [cx, cy] = tileCentre(CASTLE.x, CASTLE.y)
        fx.burst(cx, cy - 20, '#cfc6b8', 14, 260, { size: 5, life: 0.6, square: true })
        floater(cx - 20, cy - 110, `-${d.lost} ♥`, C.heart)
      } else if (type === 'wave') {
        sfx.horn()
        banner = { title: `Wave ${d.n}`, sub: T.waves[d.n - 1].tip, t: 0, dur: 2.3, color: d.n === T.waves.length ? '#ff8a6a' : C.cream, extra: d.bonus ? `+${d.bonus} gold for calling it early` : '' }
      } else if (type === 'clear') {
        sfx.cleared()
        banner = { title: `Wave ${d.n} cleared!`, sub: `+${d.bonus} gold`, t: 0, dur: 2, color: C.gold, small: true }
      } else if (type === 'win') {
        sfx.victory()
        banner = { title: 'Victory!', sub: `The castle stands with ${sim.lives} ${sim.lives === 1 ? 'life' : 'lives'} left`, t: 0, dur: 99, color: C.gold }
        const [cx, cy] = tileCentre(CASTLE.x, CASTLE.y)
        for (let i = 0; i < 4; i++) fx.burst(cx + rand(-60, 60), cy - 60 + rand(-30, 30), [C.gold, '#4c8fe0', '#e2475a', '#fff'][i], 16, 300, { size: 5, life: 1, square: true })
        menu = null
      } else if (type === 'lose') {
        sfx.lose()
        banner = { title: 'The castle fell!', sub: `You held out to wave ${sim.wave + 1}`, t: 0, dur: 99, color: '#ff8a6a' }
        menu = null
      }
    }
    const sim = createSim(T, onEvent)

    // ---- layout ----
    const PX = BX + GW + 24
    const PY = 116
    const PW = W - 24 - PX
    const PH = BY + GH - PY
    const tileAt = (p) => {
      const x = Math.floor((p.x - BX) / TS)
      const y = Math.floor((p.y - BY) / TS)
      return inGrid(x, y) ? { x, y } : null
    }
    const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
    const inPause = (p) => p.x > W - 140 && p.y < 110
    const pointerMode = () => input.mode === 'touch' || input.mode === 'mouse'
    const over = () => sim.phase === 'won' || sim.phase === 'lost'

    function buttons() {
      const list = []
      if (sim.phase === 'build') list.push({ id: 'next', x: PX + 12, y: PY + PH - 164, w: PW - 24, h: 70, key: 'y' })
      list.push({ id: 'speed', x: PX + 12, y: PY + PH - 84, w: PW - 24, h: 70, key: 'x' })
      return list
    }

    const MW = 340
    const IH = 76
    function menuItems() {
      if (!menu) return []
      if (menu.kind === 'build')
        return KINDS.map((k) => {
          const cost = T.towers[k].cost
          return { id: k, kind: k, name: T.towers[k].name, cost, line: T.towers[k].role, disabled: sim.gold < cost }
        })
      const tw = menu.tower
      const up = sim.upgradeCost(tw)
      return [
        up === null
          ? { id: 'upgrade', name: 'Upgrade', cost: null, line: 'Already at max level', disabled: true }
          : { id: 'upgrade', name: 'Upgrade', cost: up, line: upgradeLine(tw.kind), disabled: sim.gold < up },
        { id: 'sell', name: 'Sell', cost: null, refund: sim.refund(tw), line: `Get back ${sim.refund(tw)} gold`, disabled: false }
      ]
    }
    function upgradeLine(kind) {
      if (kind === 'arrow') return 'More range and damage'
      if (kind === 'cannon') return 'Bigger blast, more range'
      return 'Stronger slow, more range'
    }
    function menuRect() {
      const items = menuItems()
      const h = 52 + items.length * IH + 10
      const [cx, cy] = tileCentre(menu.tx, menu.ty)
      let x = cx + TS / 2 + 12
      if (x + MW > BX + GW + 4) x = cx - TS / 2 - 12 - MW
      const y = clamp(cy - h / 2, BY - 4, BY + GH - h + 4)
      return { x, y, w: MW, h, close: { x: x + MW - 50, y: y + 6, w: 44, h: 40 }, items: items.map((it, i) => ({ ...it, i, x: x + 8, y: y + 52 + i * IH, w: MW - 16, h: IH - 6 })) }
    }

    function say(text) {
      hint = { text, t: 2.2 }
    }
    function openTile(x, y) {
      if (over()) return
      const tw = sim.towerAt(x, y)
      if (tw) {
        menu = { kind: 'tower', tx: x, ty: y, i: 0, tower: tw }
        return sfx.open()
      }
      if (!sim.canBuild(x, y)) {
        sfx.nope()
        return say(PATH_TILES.has(key(x, y)) ? 'Critters walk here. Build on the grass.' : x === CASTLE.x || (x === 13 && y === 7) ? 'That is your castle!' : 'Something is in the way. Build on open grass.')
      }
      const items = KINDS.map((k) => sim.gold >= T.towers[k].cost)
      menu = { kind: 'build', tx: x, ty: y, i: Math.max(0, items.indexOf(true)) }
      sfx.open()
    }
    function closeMenu() {
      menu = null
      sfx.close()
    }
    function choose(it) {
      if (!it) return
      if (it.disabled) {
        sfx.nope()
        if (it.cost !== null && it.cost !== undefined) say(`Not enough gold: need ${it.cost - sim.gold} more.`)
        return
      }
      if (menu.kind === 'build') {
        if (sim.build(it.kind, menu.tx, menu.ty)) builtOnce = true
        menu = null
      } else if (it.id === 'upgrade') {
        sim.upgrade(menu.tower)
        menu = null
      } else if (it.id === 'sell') {
        sim.sell(menu.tower)
        menu = null
      }
    }
    function pressButton(id) {
      if (id === 'next') return callWave()
      if (id === 'speed') {
        fast = !fast
        tone({ freq: fast ? 880 : 660, dur: 0.06, type: 'triangle', gain: 0.06, slide: fast ? 300 : -200 })
      }
    }
    function callWave() {
      if (sim.phase !== 'build') return sfx.nope()
      skippedOnce = true
      sim.callWave()
    }

    function handleInput() {
      const p = input.pointer
      const moved = p.active && (p.x !== lastPointer.x || p.y !== lastPointer.y)
      if (moved) lastPointer = { x: p.x, y: p.y }
      const tapped = p.pressed && !inPause(p)
      if (over()) return
      const btn = tapped ? buttons().find((bt) => inside(p, bt)) : null
      if (btn) return pressButton(btn.id)
      if (input.pressed('x')) pressButton('speed')
      if (input.pressed('y')) callWave()

      if (menu) {
        // a tower sold elsewhere can't stay selected
        if (menu.kind === 'tower' && !sim.towers.includes(menu.tower)) menu = null
      }
      if (menu) {
        const m = menuRect()
        const n = m.items.length
        if (input.navY) ((menu.i = (menu.i + input.navY + n) % n), sfx.cursor())
        const hit = m.items.find((it) => inside(p, it))
        if (moved && hit && hit.i !== menu.i) ((menu.i = hit.i), sfx.cursor())
        if (tapped) {
          if (inside(p, m.close)) return closeMenu()
          if (hit) return ((menu.i = hit.i), choose(hit))
          if (inside(p, m)) return
          // a tap outside: another tile opens its own menu, anywhere else closes
          const t = tileAt(p)
          if (t && !(t.x === menu.tx && t.y === menu.ty)) {
            menu = null
            cur.x = t.x
            cur.y = t.y
            return openTile(t.x, t.y)
          }
          return closeMenu()
        }
        if (input.pressed('a')) return choose(m.items[menu.i])
        if (input.pressed('b')) return closeMenu()
        if (input.navX) {
          // stepping sideways leaves the menu and moves the cursor on
          menu = null
          cur.x = clamp(cur.x + input.navX, 0, COLS - 1)
          sfx.cursor()
        }
        return
      }
      if (input.navX || input.navY) {
        const nx = clamp(cur.x + input.navX, 0, COLS - 1)
        const ny = clamp(cur.y + input.navY, 0, ROWS - 1)
        if (nx !== cur.x || ny !== cur.y) ((cur.x = nx), (cur.y = ny), sfx.cursor())
      }
      if (moved) {
        const t = tileAt(p)
        if (t) ((cur.x = t.x), (cur.y = t.y))
      }
      if (tapped) {
        const t = tileAt(p)
        if (t) {
          cur.x = t.x
          cur.y = t.y
          return openTile(t.x, t.y)
        }
      }
      if (input.pressed('a')) return openTile(cur.x, cur.y)
    }

    // ---- words ----
    function hintText() {
      if (hint) return hint.text
      const pm = pointerMode()
      const A = input.label('a')
      const B = input.label('b')
      if (menu?.kind === 'build') return pm ? `${A} a tower to build it here` : `${input.dpadLabel()} to choose · ${A} to build · ${B} to close`
      if (menu?.kind === 'tower') return pm ? `${A} Upgrade or Sell` : `${input.dpadLabel()} to choose · ${A} to confirm · ${B} to close`
      const tw = sim.towerAt(cur.x, cur.y)
      if (tw) return `${T.towers[tw.kind].name} tower${tw.lvl ? ' ★' : ''}: ${A} to upgrade or sell`
      if (!builtOnce) return pm ? `${A} a grass tile beside the path to build a tower` : `Move the cursor to grass beside the path, ${A} to build`
      if (sim.phase === 'build' && !skippedOnce) return pm ? `Ready? ${A} "Next wave" to start early for bonus gold` : `Ready? ${input.label('y')} starts the next wave early for bonus gold`
      if (sim.canBuild(cur.x, cur.y)) return `${A} to build here`
      return pm ? `${A} grass to build, a tower to upgrade` : `${A} on grass to build, on a tower to upgrade`
    }

    const run = {
      score: 0,
      done: false,
      /** For test scripts. */
      get debug() {
        return { sim, cur, menu, fast, menuRect: menu && menuRect(), buttons: buttons() }
      },
      stats: () => [
        ['Waves held', `${sim.phase === 'won' ? T.waves.length : sim.wave} / ${T.waves.length}`],
        ['Critters popped', sim.kills],
        ['Lives left', sim.lives]
      ],
      prompts: (inp) => {
        if (inp.mode === 'touch' || inp.mode === 'mouse' || over()) return []
        if (menu) return [['up', 'Choose'], ['a', menu.kind === 'build' ? 'Build' : 'Confirm'], ['b', 'Close']]
        const list = [['a', sim.towerAt(cur.x, cur.y) ? 'Upgrade / Sell' : 'Build']]
        if (sim.phase === 'build') list.push(['y', 'Next wave'])
        list.push(['x', fast ? 'Normal speed' : 'Speed ×2'])
        return list
      },
      update(dt) {
        time += dt
        handleInput()
        const steps = fast && !over() ? 2 : 1
        for (let i = 0; i < steps; i++) sim.step(dt)
        const gdt = dt * steps
        run.score = sim.score()
        fx.update(gdt)
        for (let i = rings.length - 1; i >= 0; i--) if ((rings[i].t += gdt) > rings[i].dur) rings.splice(i, 1)
        for (let i = floaters.length - 1; i >= 0; i--) if ((floaters[i].t += dt) > 1) floaters.splice(i, 1)
        for (const sh of sim.shots)
          if (sh.kind === 'arrow') {
            sh.trail.push(sh.x, sh.y)
            if (sh.trail.length > 10) sh.trail.splice(0, 2)
          }
        castleHit = Math.max(0, castleHit - dt * 2)
        if (banner) banner.t += dt
        if (banner && banner.t > banner.dur) banner = null
        if (hint && (hint.t -= dt) <= 0) hint = null
        cur.dx = lerp(cur.dx, cur.x, Math.min(1, dt * 20))
        cur.dy = lerp(cur.dy, cur.y, Math.min(1, dt * 20))
        if (over() && (endT += dt) > 3.2) run.done = true
      },
      draw(ctx) {
        ctx.drawImage(boardCanvas(), 0, 0, W, H)
        ctx.save()
        const [ox, oy] = fx.offset()
        ctx.translate(ox, oy)
        drawWorld(ctx)
        ctx.restore()
        drawHud(ctx)
        drawPanel(ctx)
        if (menu) drawMenu(ctx)
        drawBanner(ctx)
      }
    }

    // ---- drawing ----
    function rangeCircle(ctx, x, y, r, color, dashed = false) {
      ctx.fillStyle = color.replace('A', '0.13')
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = color.replace('A', '0.85')
      ctx.lineWidth = 3
      if (dashed) ctx.setLineDash([10, 8])
      ctx.stroke()
      ctx.setLineDash([])
    }

    function drawWorld(ctx) {
      // range circles under everything
      const focus = menu ? { x: menu.tx, y: menu.ty } : cur
      const ftw = sim.towerAt(focus.x, focus.y)
      if (ftw && !over()) {
        const st = sim.stats(ftw)
        rangeCircle(ctx, ftw.cx, ftw.cy, st.range, 'rgba(255,250,220,A)')
        if (menu?.kind === 'tower' && menu.i === 0 && ftw.lvl === 0) rangeCircle(ctx, ftw.cx, ftw.cy, T.towers[ftw.kind].lv[1].range, 'rgba(255,210,80,A)', true)
      }
      let ghost = null
      if (menu?.kind === 'build') {
        const kind = KINDS[menu.i]
        const [gx, gy] = tileCentre(menu.tx, menu.ty)
        const ok = sim.gold >= T.towers[kind].cost
        rangeCircle(ctx, gx, gy, T.towers[kind].lv[0].range, ok ? 'rgba(255,250,220,A)' : 'rgba(255,120,110,A)')
        ghost = { kind, gx, gy }
      }
      // cursor tile
      if (!over()) {
        const cx = BX + (menu ? menu.tx : cur.dx) * TS
        const cy = BY + (menu ? menu.ty : cur.dy) * TS
        const tx = menu ? menu.tx : cur.x
        const ty = menu ? menu.ty : cur.y
        const ok = sim.canBuild(tx, ty) || sim.towerAt(tx, ty)
        ctx.fillStyle = ok ? 'rgba(255,255,230,0.22)' : 'rgba(255,90,80,0.2)'
        ctx.fillRect(cx + 2, cy + 2, TS - 4, TS - 4)
        const pulse = menu ? 0 : Math.sin(time * 6) * 2
        ctx.strokeStyle = ok ? '#fff7d6' : '#ff8a80'
        ctx.lineWidth = 4
        ctx.lineCap = 'round'
        const L = 16
        const a = 2 - pulse
        const b = TS - 2 + pulse
        ctx.beginPath()
        for (const [px, py, sx, sy] of [[a, a, 1, 1], [b, a, -1, 1], [a, b, 1, -1], [b, b, -1, -1]]) {
          ctx.moveTo(cx + px, cy + py + sy * L)
          ctx.lineTo(cx + px, cy + py)
          ctx.lineTo(cx + px + sx * L, cy + py)
        }
        ctx.stroke()
        ctx.lineCap = 'butt'
      }
      // things on the board, sorted by y so they overlap like a diorama
      const things = []
      for (const tw of sim.towers) things.push({ y: tw.cy + 10, draw: () => drawTowerOn(ctx, tw) })
      for (const en of sim.enemies) things.push({ y: en.y, draw: () => drawEnemy(ctx, en) })
      const [kx, ky] = tileCentre(CASTLE.x, CASTLE.y)
      things.push({ y: ky + 30, draw: () => (ctx.save(), ctx.translate(kx - 10, ky - 2), ctx.scale(0.86, 0.86), drawCastle(ctx, 0, 0, time, castleHit), ctx.restore()) })
      if (ghost) things.push({ y: ghost.gy + 10, draw: () => drawTower(ctx, ghost.kind, 0, ghost.gx, ghost.gy, { alpha: 0.6, t: time }) })
      things.sort((p, q) => p.y - q.y)
      for (const th of things) th.draw()
      // shots
      for (const sh of sim.shots) {
        if (sh.kind === 'arrow') {
          const tr = sh.trail
          for (let i = 2; i < tr.length; i += 2) {
            ctx.strokeStyle = `rgba(255,250,225,${(i / tr.length) * 0.6})`
            ctx.lineWidth = 3
            ctx.beginPath()
            ctx.moveTo(tr[i - 2], tr[i - 1])
            ctx.lineTo(tr[i], tr[i + 1])
            ctx.stroke()
          }
          ctx.save()
          ctx.translate(sh.x, sh.y)
          ctx.rotate(sh.ang ?? 0)
          ctx.strokeStyle = '#6b3d1c'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.moveTo(-14, 0)
          ctx.lineTo(4, 0)
          ctx.stroke()
          ctx.fillStyle = '#d8d8d8'
          ctx.beginPath()
          ctx.moveTo(8, 0)
          ctx.lineTo(2, -4)
          ctx.lineTo(2, 4)
          ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.fillRect(-15, -3, 5, 6)
          ctx.restore()
        } else {
          shadow(ctx, sh.x, sh.y + 4, 8, 3, 0.3)
          const r = sh.lvl ? 9 : 7
          ctx.fillStyle = 'rgba(255,240,200,0.35)'
          ctx.beginPath()
          ctx.arc(sh.x, sh.y - sh.h + 4, r * 0.8, 0, TAU)
          ctx.fill()
          ctx.fillStyle = '#26282d'
          ctx.beginPath()
          ctx.arc(sh.x, sh.y - sh.h, r, 0, TAU)
          ctx.fill()
          ctx.fillStyle = 'rgba(255,255,255,0.4)'
          ctx.beginPath()
          ctx.arc(sh.x - 2, sh.y - sh.h - 2, r * 0.35, 0, TAU)
          ctx.fill()
        }
      }
      for (const r of rings) {
        const u = r.t / r.dur
        ctx.strokeStyle = r.color
        ctx.globalAlpha = 1 - u
        ctx.lineWidth = r.w * (1 - u) + 1
        ctx.beginPath()
        ctx.arc(r.x, r.y, r.max * (0.3 + 0.7 * Math.sqrt(u)), 0, TAU)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      fx.draw(ctx)
      for (const f of floaters) {
        const y = f.y - f.t * 46
        ctx.globalAlpha = clamp((1 - f.t) * 2, 0, 1)
        if (f.coin) coin(ctx, f.x - 22, y, 10)
        label(ctx, f.text, f.x + (f.coin ? 6 : 0), y, { font: env.font(400, 26, 'Lilita One'), color: f.color, edge: 5, edgeColor: C.ink })
      }
      ctx.globalAlpha = 1
    }
    function drawTowerOn(ctx, tw) {
      drawTower(ctx, tw.kind, tw.lvl, tw.cx, tw.cy, { ang: tw.ang, kick: tw.kick, t: time + tw.id, pop: tw.pop })
      if (tw.flash > 0) {
        ctx.globalAlpha = tw.flash * 0.6
        ctx.fillStyle = '#fff6c0'
        ctx.beginPath()
        ctx.arc(tw.cx, tw.cy - 16, 34, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }
    function drawEnemy(ctx, en) {
      drawCritter(ctx, en.type, en.x, en.y, en.r, { bob: en.bob, dirX: en.dx < -0.1 ? -1 : 1, slowed: en.slowT > 0, hurt: en.hurt / 0.12 })
      if (en.hp < en.max) {
        const w = en.type === 'boss' ? 64 : 34
        const y = en.y - en.r * (en.type === 'boss' ? 1.9 : 1.55) - 10
        ctx.fillStyle = 'rgba(30,20,10,0.7)'
        roundRect(ctx, en.x - w / 2 - 2, y - 2, w + 4, 9, 4)
        ctx.fill()
        ctx.fillStyle = en.hp / en.max > 0.4 ? '#7ee06a' : '#ffb03f'
        roundRect(ctx, en.x - w / 2, y, Math.max(2, (w * en.hp) / en.max), 5, 3)
        ctx.fill()
      }
    }

    function plaque(ctx, x, y, w, h) {
      ctx.fillStyle = 'rgba(20,10,4,0.35)'
      roundRect(ctx, x + 2, y + 5, w, h, 14)
      ctx.fill()
      ctx.fillStyle = C.paper
      roundRect(ctx, x, y, w, h, 14)
      ctx.fill()
      ctx.strokeStyle = C.woodDark
      ctx.lineWidth = 3
      ctx.stroke()
    }
    function drawHud(ctx) {
      const y = 22
      const h = 62
      const f = env.font(400, 36, 'Lilita One')
      plaque(ctx, 24, y, 190, h)
      coin(ctx, 58, y + h / 2, 17)
      label(ctx, `${sim.gold}`, 86, y + h / 2 + 2, { font: f, color: C.ink, align: 'left' })
      plaque(ctx, 226, y, 170, h)
      heart(ctx, 258, y + h / 2, 16)
      label(ctx, `${sim.lives}`, 286, y + h / 2 + 2, { font: f, color: sim.lives <= 3 ? '#c22a3d' : C.ink, align: 'left' })
      plaque(ctx, 408, y, 250, h)
      const wn = Math.min(T.waves.length, sim.wave + 1)
      label(ctx, `Wave ${wn}/${T.waves.length}`, 533, y + h / 2 + 2, { font: f, color: C.ink })
      plaque(ctx, 670, y, 314, h)
      label(ctx, 'Points', 690, y + h / 2 + 3, { font: env.font(700, 24), color: '#7a5a3a', align: 'left' })
      label(ctx, `${sim.killValue}`, 966, y + h / 2 + 2, { font: f, color: C.ink, align: 'right' })
      // hint line under the board
      label(ctx, hintText(), BX + GW / 2, BY + GH + 40, { font: env.font(700, 25), color: hint ? '#ffe08a' : C.cream, edge: 6, edgeColor: 'rgba(40,20,8,0.85)' })
    }

    function drawPanel(ctx) {
      const x = PX
      const y = PY
      plaque(ctx, x, y, PW, PH)
      const pad = 16
      // the next wave (or what's left of this one)
      const live = sim.phase === 'wave'
      const wi = Math.min(sim.wave, T.waves.length - 1)
      const title = over() ? (sim.phase === 'won' ? 'All waves held!' : 'Game over') : live ? `Wave ${sim.wave + 1} incoming` : `Next: wave ${sim.wave + 1}`
      label(ctx, title, x + PW / 2, y + 30, { font: env.font(400, 28, 'Lilita One'), color: C.ink })
      if (!over()) {
        const counts = {}
        if (live) for (const q of [...sim.queue, ...sim.enemies]) counts[q.type] = (counts[q.type] ?? 0) + 1
        else for (const [type, n] of T.waves[wi].groups) counts[type] = (counts[type] ?? 0) + n
        let ry = y + 78
        const order = ['walker', 'runner', 'tank', 'boss']
        const shown = order.filter((k) => counts[k])
        if (!shown.length) label(ctx, 'Clear the board!', x + PW / 2, ry, { font: env.font(700, 24), color: '#7a5a3a' })
        for (const k of shown) {
          drawCritter(ctx, k, x + pad + 24, ry, k === 'boss' ? 17 : 14, { bob: time * 6 + ry })
          label(ctx, `${counts[k]} × ${T.enemies[k].name}`, x + pad + 54, ry + 2, { font: env.font(700, 24), color: C.ink, align: 'left' })
          ry += 46
        }
        // tower guide: what each one is for
        ry = Math.max(ry + 8, y + 262)
        ctx.strokeStyle = C.paperDark
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x + pad, ry - 22)
        ctx.lineTo(x + PW - pad, ry - 22)
        ctx.stroke()
      }
      // countdown + buttons
      for (const bt of buttons()) {
        const hot = (input.mode === 'mouse' && input.pointer.active && inside(input.pointer, bt)) || (bt.id === 'speed' && fast)
        const isNext = bt.id === 'next'
        ctx.fillStyle = 'rgba(40,20,8,0.3)'
        roundRect(ctx, bt.x, bt.y + 4, bt.w, bt.h, 14)
        ctx.fill()
        ctx.fillStyle = isNext ? (hot ? '#7fd06a' : '#62b84e') : hot ? '#f0c36a' : '#e2ad52'
        roundRect(ctx, bt.x, bt.y, bt.w, bt.h, 14)
        ctx.fill()
        ctx.strokeStyle = isNext ? '#2f6e24' : '#8a5a1c'
        ctx.lineWidth = 3
        ctx.stroke()
        const keyed = !pointerMode()
        let tx = bt.x + bt.w / 2
        let align = 'center'
        if (keyed) {
          const kl = input.label(bt.key)
          const kf = env.font(900, 18)
          ctx.font = kf
          const kw = Math.max(34, ctx.measureText(kl).width + 14)
          ctx.fillStyle = C.cream
          roundRect(ctx, bt.x + 10, bt.y + bt.h / 2 - 17, kw, 34, 10)
          ctx.fill()
          label(ctx, kl, bt.x + 10 + kw / 2, bt.y + bt.h / 2 + 1, { font: kf, color: C.ink })
          tx = bt.x + 22 + kw
          align = 'left'
        }
        if (isNext) {
          label(ctx, 'Next wave', tx, bt.y + 26, { font: env.font(400, 28, 'Lilita One'), color: '#fff', edge: 5, edgeColor: '#2f6e24', align })
          label(ctx, `in ${Math.ceil(sim.timer)}s  ·  +${Math.floor(sim.timer) * T.earlyGold} gold`, tx, bt.y + 52, { font: env.font(700, 19), color: '#173d10', align })
        } else {
          label(ctx, fast ? 'Speed ×2' : 'Speed ×1', tx, bt.y + bt.h / 2 + 1, { font: env.font(400, 26, 'Lilita One'), color: '#fff', edge: 5, edgeColor: '#8a5a1c', align })
        }
      }
      if (sim.phase === 'wave') label(ctx, 'Wave in progress…', x + PW / 2, PY + PH - 130, { font: env.font(700, 22), color: '#7a5a3a' })
      // focused tile info
      if (!over()) {
        const tw = sim.towerAt(menu ? menu.tx : cur.x, menu ? menu.ty : cur.y)
        const iy = y + 262
        if (tw) {
          const st = sim.stats(tw)
          label(ctx, `${T.towers[tw.kind].name} tower${tw.lvl ? ' ★' : ''}`, x + PW / 2, iy, { font: env.font(400, 26, 'Lilita One'), color: C.roofDark[tw.kind] })
          const lines =
            tw.kind === 'frost'
              ? [`Slows ${Math.round(st.slow * 100)}%`, `Range ${Math.round((st.range / TS) * 10) / 10} tiles`]
              : [`Damage ${st.dmg}${tw.kind === 'cannon' ? ' splash' : ''}`, `${(1 / st.rate).toFixed(1)} shots a second`, `Range ${Math.round((st.range / TS) * 10) / 10} tiles`]
          lines.forEach((l, i) => label(ctx, l, x + PW / 2, iy + 36 + i * 30, { font: env.font(700, 22), color: C.ink }))
        } else {
          // a small key of the towers
          KINDS.forEach((k, i) => {
            const ty = iy - 4 + i * 44
            drawTower(ctx, k, 0, x + pad + 12, ty + ROLE_ICON_Y - 4, { s: 0.5, t: time })
            label(ctx, T.towers[k].name, x + pad + 36, ty + 2, { font: env.font(400, 22, 'Lilita One'), color: C.roofDark[k], align: 'left' })
            label(ctx, T.towers[k].role, x + pad + 36, ty + 22, { font: env.font(700, 16), color: '#5a4028', align: 'left' })
          })
        }
      }
    }

    function drawMenu(ctx) {
      const m = menuRect()
      ctx.fillStyle = 'rgba(20,10,4,0.4)'
      roundRect(ctx, m.x + 3, m.y + 7, m.w, m.h, 16)
      ctx.fill()
      ctx.fillStyle = C.cream
      roundRect(ctx, m.x, m.y, m.w, m.h, 16)
      ctx.fill()
      ctx.strokeStyle = C.woodDark
      ctx.lineWidth = 3
      ctx.stroke()
      // little pointer toward the tile
      const [tcx, tcy] = tileCentre(menu.tx, menu.ty)
      const left = m.x > tcx
      const py = clamp(tcy, m.y + 24, m.y + m.h - 24)
      ctx.fillStyle = C.cream
      ctx.beginPath()
      ctx.moveTo(left ? m.x + 1 : m.x + m.w - 1, py - 12)
      ctx.lineTo(left ? m.x - 12 : m.x + m.w + 12, py)
      ctx.lineTo(left ? m.x + 1 : m.x + m.w - 1, py + 12)
      ctx.fill()
      ctx.strokeStyle = C.woodDark
      ctx.beginPath()
      ctx.moveTo(left ? m.x : m.x + m.w, py - 12)
      ctx.lineTo(left ? m.x - 12 : m.x + m.w + 12, py)
      ctx.lineTo(left ? m.x : m.x + m.w, py + 12)
      ctx.stroke()
      const head = menu.kind === 'build' ? 'Build a tower' : `${T.towers[menu.tower.kind].name} tower${menu.tower.lvl ? ' ★' : ''}`
      label(ctx, head, m.x + 18, m.y + 29, { font: env.font(400, 28, 'Lilita One'), color: C.ink, align: 'left' })
      // close ✕
      const c = m.close
      ctx.fillStyle = C.paperDark
      roundRect(ctx, c.x + 4, c.y + 4, c.w - 8, c.h - 8, 10)
      ctx.fill()
      label(ctx, '✕', c.x + c.w / 2, c.y + c.h / 2 + 1, { font: env.font(900, 22), color: C.ink })
      for (const it of m.items) {
        const on = it.i === menu.i
        ctx.fillStyle = on ? (it.disabled ? '#eadfcf' : '#ffe9a8') : 'rgba(0,0,0,0)'
        roundRect(ctx, it.x, it.y, it.w, it.h, 12)
        ctx.fill()
        if (on) {
          ctx.strokeStyle = it.disabled ? '#b8a68a' : '#d39a2a'
          ctx.lineWidth = 3
          ctx.stroke()
        }
        ctx.globalAlpha = it.disabled ? 0.45 : 1
        const ix = it.x + 40
        const iy = it.y + it.h / 2
        if (menu.kind === 'build') drawTower(ctx, it.kind, 0, ix, iy + 8, { s: 0.62, t: time })
        else if (it.id === 'upgrade') drawTower(ctx, menu.tower.kind, 1, ix, iy + 8, { s: 0.62, t: time })
        else {
          coin(ctx, ix - 6, iy + 4, 13)
          coin(ctx, ix + 6, iy - 4, 13)
        }
        const nameCol = menu.kind === 'build' ? C.roofDark[it.kind] : it.id === 'sell' ? '#8a5530' : '#9a6a10'
        label(ctx, it.name, it.x + 78, it.y + 24, { font: env.font(400, 28, 'Lilita One'), color: nameCol, align: 'left' })
        label(ctx, it.line, it.x + 78, it.y + 52, { font: env.font(700, 18), color: '#4a3420', align: 'left' })
        ctx.globalAlpha = 1
        if (it.cost !== null && it.cost !== undefined) {
          const poor = sim.gold < it.cost
          coin(ctx, it.x + it.w - 70, it.y + 24, 11)
          label(ctx, `${it.cost}`, it.x + it.w - 12, it.y + 25, { font: env.font(400, 28, 'Lilita One'), color: poor ? '#c22a3d' : C.ink, align: 'right' })
        } else if (it.refund !== undefined) {
          label(ctx, `+${it.refund}`, it.x + it.w - 12, it.y + 25, { font: env.font(400, 28, 'Lilita One'), color: '#3d8a2a', align: 'right' })
        }
      }
    }

    function drawBanner(ctx) {
      if (!banner) return
      const b = banner
      const inT = clamp(b.t / 0.25, 0, 1)
      const outT = b.dur > 50 ? 1 : clamp((b.dur - b.t) / 0.35, 0, 1)
      const a = Math.min(inT, outT)
      const cy = BY + GH / 2 - 20
      const s = 0.7 + 0.3 * (1 - (1 - inT) ** 3)
      ctx.save()
      ctx.globalAlpha = a
      ctx.translate(BX + GW / 2, cy)
      ctx.scale(s, s)
      const h = b.small ? 120 : 168
      ctx.fillStyle = 'rgba(40,20,8,0.72)'
      roundRect(ctx, -400, -h / 2, 800, h, 24)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,240,200,0.5)'
      ctx.lineWidth = 3
      ctx.stroke()
      label(ctx, b.title, 0, b.small ? -18 : -30, { font: env.font(400, b.small ? 54 : 84, 'Lilita One'), color: b.color, edge: 10, edgeColor: C.ink })
      label(ctx, b.sub, 0, b.small ? 34 : 42, { font: env.font(700, 28), color: C.cream })
      if (b.extra) label(ctx, b.extra, 0, 72, { font: env.font(700, 22), color: C.gold })
      ctx.restore()
    }

    return run
  }
}
