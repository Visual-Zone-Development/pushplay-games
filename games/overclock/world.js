// The fight: arena, Rivet, Talon, shots, particles. All units are native pixels (320×200 screen,
// 640×320 arena) and seconds. game.js owns screens, HUD and audio; this module owns the rules.
import { frame, anchorAt } from './art.js'

export const TS = 16
export const AW = 640
export const AH = 320

export const TUNING = {
  // Rivet
  hp: 16,
  run: 112, accel: 1500, airAccel: 1000, friction: 1800,
  gravity: 940, jumpV: 305, springJumpV: 380, jumpCut: 0.42, maxFall: 360,
  coyote: 0.09, jumpBuffer: 0.13,
  wallSlide: 72, wallJumpVX: 150, wallJumpVY: 295, wallJumpLock: 0.14,
  dashSpeed: 235, dashTime: 0.22, dashCooldown: 0.12, airDashes: 2,
  hoverFall: 42,
  shotSpeed: 320, shotCooldown: 0.13, rapidCooldown: 0.075, maxShots: 4,
  charge1: 0.45, charge2: 1.15, dmgPellet: 1, dmgCharge1: 3, dmgCharge2: 7,
  iframes: 1.0, knockback: 0.32, bubbleRecharge: 10,
  healAfterWin: 8, capsuleHeal: 3,
  // Talon
  bossHp: 56, bossHpPerLoop: 0.28, bossSpeedPerLoop: 0.08,
  idleMin: 0.55, idleMax: 1.0, tell: 0.5, pounceTime: 0.85, skid: 0.45,
  boltSpeed: 150, discSpeed: 150, diveSpeed: 430, diveStuck: 1.0, sweepTime: 0.4,
  wave: 150, contactDmg: 3, boltDmg: 2, discDmg: 2, diveDmg: 4, sweepDmg: 3, waveDmg: 2,
  lavaDmg: 2, loop1Dmg: 0.7
}

// ---- arenas (40×20 tiles): # steel, = girder (jump through), ~ molten, R/T spawns --------------
export const ARENAS = [
  { name: 'Foundry Floor', map: `
########################################
#......................................#
#......................................#
#......................................#
#......................................#
#.......=======..........=======.......#
#......................................#
#......................................#
#..................====................#
#......................................#
#..=======......................=======#
#......................................#
#......................................#
#..........======........======........#
#......................................#
#......................................#
#......................................#
#.......R................T.............#
########################################
########################################` },
  { name: 'Furnace Pit', map: `
########################################
#......................................#
#......................................#
#......................................#
#..=====....................=====......#
#......................................#
#......................................#
#............=====....=====............#
#......................................#
#......................................#
#===.......................#...........#
#..........======..........#....=====..#
#......................................#
#......................................#
#..=====.......................=====...#
#......................................#
#......................................#
#.......R................T.............#
##############~~~~~~~~~~~~##############
########################################` },
  { name: 'Crane Tower', map: `
########################################
#......................................#
#......................................#
#...............==========.............#
#......................................#
#......................................#
#.====................................=#
#..........#.................#.........#
#..........#.................#.........#
#..........#=====.......=====#.........#
#......................................#
#......=====..................=====....#
#......................................#
#......................................#
#.................======...............#
#......................................#
#......................................#
#.........R.....................T......#
############.................###########
########################################` }
]

export const PARTS = {
  spring: { slot: 'legs', name: 'Spring Boots', icon: 0, desc: 'Jump much higher.' },
  hover: { slot: 'legs', name: 'Hover Jets', icon: 1, desc: 'Hold jump while falling to glide.' },
  dashb: { slot: 'legs', name: 'Dash Boots', icon: 2, desc: 'Dash in the air, twice per jump.' },
  splitter: { slot: 'arm', name: 'Splitter', icon: 4, desc: 'Every shot fires a 3-way spread.' },
  rapid: { slot: 'arm', name: 'Rapid Coil', icon: 5, desc: 'Hold shoot to auto-fire fast pellets.' },
  pierce: { slot: 'arm', name: 'Pierce Lens', icon: 6, desc: 'Charge shots are bigger, hit harder and pass through.' },
  overclock: { slot: 'core', name: 'Overclock Core', icon: 8, desc: 'Charge twice as fast.' },
  bubble: { slot: 'core', name: 'Bubble Shield', icon: 9, desc: 'Blocks one hit. Recharges in 10 seconds.' },
  reboot: { slot: 'core', name: 'Reboot Cell', icon: 10, desc: 'Once per run, revive with half health.' },
  coolant: { slot: 'rig', name: 'Coolant Pack', icon: 7, desc: 'Dashing makes you invulnerable.' },
  scanner: { slot: 'rig', name: 'Scanner Dish', icon: 11, desc: "Hits on Talon's head deal double damage." },
  wrench: { slot: 'rig', name: 'Repair Kit', icon: 3, desc: 'Full repair after each win; capsules heal double.' }
}
export const SLOTS = ['legs', 'arm', 'core', 'rig']
export const SLOT_COLOR = { legs: '#5cf06a', arm: '#ffa040', core: '#ffd84a', rig: '#46e0ff' }

// Rivet's atlas frames
const RF = { idle: [0, 1], run: [2, 3, 4, 5, 6, 7], rise: 8, peak: 9, fall: 10, land: 11, wall: 12, kick: 13,
  dash: 14, airdash: 15, hurt: 16, shoot: 17, runShoot: [18, 19], airShoot: 20, charge: [21, 22], win: 23 }
// Talon's atlas frames
export const TF = { idle: [0, 1], crouch: 2, leap: 3, cling: [4, 5], spit: 6, dive: 7, sweep: 8, toss: 9, hurt: 10, dead: 11 }

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d))
const rnd = (a, b) => a + Math.random() * (b - a)
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

export function createWorld(hooks) {
  const W = {
    arena: null, grid: [], loop: 1, t: 0,
    players: [], boss: null, shots: [], enemyShots: [], parts: [], fx: [], waves: [], capsules: [],
    shake: 0, hitstop: 0, phase: 'intro', phaseT: 0, cam: { x: 0, y: 0 }, aim: null
  }
  const emit = (ev, data) => hooks.on?.(ev, data)

  // ---- map --------------------------------------------------------------------------------
  W.load = (loop) => {
    W.loop = loop
    W.arena = ARENAS[(loop - 1) % ARENAS.length]
    const rows = W.arena.map.trim().split('\n')
    W.grid = rows.map((r) => [...r])
    W.shots = []; W.enemyShots = []; W.fx = []; W.waves = []; W.capsules = []
    let rs, tsp
    rows.forEach((r, y) => [...r].forEach((c, x) => {
      if (c === 'R') rs = { x: x * TS + 8, y: (y + 1) * TS }
      if (c === 'T') tsp = { x: x * TS + 8, y: (y + 1) * TS }
    }))
    W.spawnR = rs
    W.spawnT = tsp
  }
  const cell = (tx, ty) => (W.grid[ty] && W.grid[ty][tx]) || '#'
  const solidAt = (px, py) => cell(Math.floor(px / TS), Math.floor(py / TS)) === '#'
  const girderAt = (px, py) => cell(Math.floor(px / TS), Math.floor(py / TS)) === '='
  const lavaAt = (px, py) => cell(Math.floor(px / TS), Math.floor(py / TS)) === '~'
  W.cell = cell
  W.solidAt = solidAt

  /** Move a box (x = centre, y = feet) through the grid. One-way girders when oneWay. */
  function moveBody(b, dt, oneWay = true) {
    b.onGround = false
    b.hitWall = 0
    // horizontal
    let nx = b.x + b.vx * dt
    const top = b.y - b.h + 1
    const sideX = b.vx > 0 ? nx + b.w / 2 : nx - b.w / 2
    if (b.vx !== 0) {
      for (let yy = top; yy < b.y; yy += 8) if (solidAt(sideX, yy) || solidAt(sideX, b.y - 1)) {
        const tx = Math.floor(sideX / TS)
        nx = b.vx > 0 ? tx * TS - b.w / 2 - 0.01 : (tx + 1) * TS + b.w / 2 + 0.01
        b.hitWall = Math.sign(b.vx)
        b.vx = 0
        break
      }
    }
    b.x = nx
    // vertical
    let ny = b.y + b.vy * dt
    if (b.vy > 0) {
      for (const xx of [b.x - b.w / 2 + 1, b.x, b.x + b.w / 2 - 1]) {
        const ty = Math.floor(ny / TS)
        const wasAbove = b.y <= ty * TS + 0.5
        if (solidAt(xx, ny) || (oneWay && !b.dropThrough && girderAt(xx, ny) && wasAbove)) {
          ny = ty * TS
          b.vy = 0
          b.onGround = true
          break
        }
      }
    } else if (b.vy < 0) {
      for (const xx of [b.x - b.w / 2 + 1, b.x + b.w / 2 - 1]) if (solidAt(xx, ny - b.h)) {
        ny = (Math.floor((ny - b.h) / TS) + 1) * TS + b.h
        b.vy = 0
        break
      }
    }
    b.y = ny
  }
  const touchingWall = (b, dir) => {
    const sx = b.x + dir * (b.w / 2 + 1)
    return solidAt(sx, b.y - b.h * 0.3) && solidAt(sx, b.y - b.h * 0.8)
  }

  // ---- particles --------------------------------------------------------------------------
  const fx = (o) => { if (W.fx.length < 220) W.fx.push({ t: 0, ...o }) }
  W.burst = (x, y, n, color, speed = 80, life = 0.4) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const s = speed * rnd(0.3, 1)
      fx({ kind: 'px', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: life * rnd(0.6, 1.2), color, g: 300 })
    }
  }
  W.explode = (x, y, big = false) => {
    fx({ kind: 'anim', x, y, frames: big ? [11] : [6, 7, 8], fps: big ? 6 : 16, life: big ? 0.5 : 0.19 })
    W.burst(x, y, big ? 14 : 5, '#ffb040', big ? 140 : 90, 0.5)
  }
  const shake = (s) => { W.shake = Math.max(W.shake, s) }

  // ---- players ------------------------------------------------------------------------------
  W.spawnPlayer = (run, slot = 0) => {
    const p = {
      slot, x: W.spawnR.x + slot * 24, y: W.spawnR.y, vx: 0, vy: 0, w: 12, h: 31, dir: 1,
      hp: run.hp, maxHp: TUNING.hp, parts: run.parts, run,
      onGround: true, coyote: 0, buffer: 0, wallDir: 0, wallLock: 0, kick: 0, land: 0,
      dash: 0, dashCd: 0, airDashes: 0, dashJump: false, hovering: false,
      charge: 0, shotCd: 0, pose: 0, iframes: 1.2, hurt: 0, bubble: run.parts.core === 'bubble' ? 1 : 0, bubbleT: 0,
      anim: 0, frame: 0, dead: false, win: false
    }
    W.players[slot] = p
    return p
  }
  const has = (p, id) => Object.values(p.parts).includes(id)

  function updatePlayer(p, inp, dt) {
    if (p.dead) return
    p.anim += dt
    p.iframes = Math.max(0, p.iframes - dt)
    p.hurt = Math.max(0, p.hurt - dt)
    p.kick = Math.max(0, p.kick - dt)
    p.land = Math.max(0, p.land - dt)
    p.pose = Math.max(0, p.pose - dt)
    p.shotCd = Math.max(0, p.shotCd - dt)
    p.dashCd = Math.max(0, p.dashCd - dt)
    p.wallLock = Math.max(0, p.wallLock - dt)
    if (p.parts.core === 'bubble' && !p.bubble) {
      p.bubbleT += dt
      if (p.bubbleT >= TUNING.bubbleRecharge) { p.bubble = 1; p.bubbleT = 0; emit('bubbleUp', p) }
    }
    const control = W.phase === 'fight' && !p.win
    const mx = control && p.hurt <= 0 ? (Math.abs(inp.x) > 0.3 ? Math.sign(inp.x) : 0) : 0

    // dash
    const dashPressed = control && (inp.pressed('b') || inp.pressed('rt'))
    if (dashPressed && p.dash <= 0 && (p.dashCd <= 0 || has(p, 'coolant')) && p.hurt <= 0) {
      const canAir = has(p, 'dashb') && p.airDashes > 0
      if (p.onGround || canAir) {
        if (!p.onGround) p.airDashes--
        p.dash = TUNING.dashTime
        if (mx) p.dir = mx
        p.vy = p.onGround ? p.vy : 0
        emit('dash', p)
        W.burst(p.x - p.dir * 6, p.y - 2, 4, has(p, 'dashb') ? '#5cf06a' : '#c9c9d9', 60, 0.3)
      }
    }
    if (p.dash > 0) {
      p.dash -= dt
      p.vx = p.dir * TUNING.dashSpeed
      if (!p.onGround) p.vy = 0
      if (p.dash <= 0) p.dashCd = TUNING.dashCooldown
      if (Math.random() < 0.6) fx({ kind: 'ghost', x: p.x, y: p.y, dir: p.dir, f: p.frame, life: 0.15 })
    } else {
      const speed = p.dashJump ? TUNING.dashSpeed * 0.92 : TUNING.run
      const acc = p.onGround ? TUNING.accel : TUNING.airAccel
      if (p.wallLock > 0) { /* keep wall-jump push */ } else if (mx) {
        p.vx = approach(p.vx, mx * speed, acc * dt)
        p.dir = mx
      } else p.vx = approach(p.vx, 0, (p.onGround ? TUNING.friction : TUNING.airAccel * 0.7) * dt)
    }

    // jump
    if (control && inp.pressed('a')) p.buffer = TUNING.jumpBuffer
    else p.buffer = Math.max(0, p.buffer - dt)
    p.coyote = p.onGround ? TUNING.coyote : Math.max(0, p.coyote - dt)
    const jumpV = has(p, 'spring') ? TUNING.springJumpV : TUNING.jumpV
    p.wallDir = 0
    if (!p.onGround && p.vy > -40) {
      if (touchingWall(p, 1) && mx > 0) p.wallDir = 1
      else if (touchingWall(p, -1) && mx < 0) p.wallDir = -1
    }
    // down + jump on a girder drops through it
    p.dropThrough = Math.max(0, (p.dropThrough || 0) - dt)
    if (p.buffer > 0 && p.onGround && inp.y > 0.6 && girderAt(p.x, p.y + 1)) {
      p.dropThrough = 0.25
      p.buffer = 0
      p.coyote = 0
      p.y += 2
      p.onGround = false
    }
    if (p.buffer > 0) {
      if (p.coyote > 0) {
        p.vy = -jumpV
        p.dashJump = p.dash > 0
        p.dash = 0
        p.buffer = 0; p.coyote = 0
        emit('jump', p)
        if (has(p, 'spring')) W.burst(p.x, p.y, 5, '#5cf06a', 70, 0.3)
      } else if (p.wallDir || touchingWall(p, 1) || touchingWall(p, -1)) {
        const wd = p.wallDir || (touchingWall(p, 1) ? 1 : -1)
        p.vy = -TUNING.wallJumpVY
        p.dashJump = inp.held('b') || inp.held('rt')
        p.vx = -wd * (p.dashJump ? TUNING.dashSpeed * 0.9 : TUNING.wallJumpVX)
        p.dir = -wd
        p.wallLock = TUNING.wallJumpLock
        p.kick = 0.16
        p.buffer = 0
        p.airDashes = TUNING.airDashes
        emit('walljump', p)
        W.burst(p.x + wd * 7, p.y - 8, 5, '#ffe0a0', 60, 0.25)
      }
    }
    if (!inp.held('a') && p.vy < 0 && !p.kick) p.vy *= Math.pow(TUNING.jumpCut, dt * 20)
    p.hovering = false
    if (p.dash <= 0) {
      p.vy = Math.min(p.vy + TUNING.gravity * dt, TUNING.maxFall)
      if (p.wallDir && p.vy > TUNING.wallSlide) {
        p.vy = TUNING.wallSlide
        if (Math.random() < 0.3) fx({ kind: 'px', x: p.x + p.wallDir * 7, y: p.y - 4, vx: -p.wallDir * 20, vy: -20, life: 0.25, color: '#ffd27a', g: 200 })
      }
      if (has(p, 'hover') && control && inp.held('a') && p.vy > 0 && !p.wallDir) {
        p.vy = Math.min(p.vy, TUNING.hoverFall)
        p.hovering = true
      }
    }
    const wasGround = p.onGround
    moveBody(p, dt)
    p.x = clamp(p.x, 8, AW - 8)
    if (p.onGround) {
      p.airDashes = TUNING.airDashes
      if (!wasGround) { p.land = 0.08; p.dashJump = false; emit('land', p); fx({ kind: 'anim', x: p.x, y: p.y, frames: [13], fps: 1, life: 0.18, scale: 0.4 }) }
    }
    // molten metal
    if (lavaAt(p.x, p.y + 1) || lavaAt(p.x, p.y - 2)) {
      hurtPlayer(p, TUNING.lavaDmg, p.x - 1, true)
      p.vy = -320
    }

    // shooting / charging
    const shootHeld = control && (inp.held('x') || inp.held('y'))
    const shootPressed = control && (inp.pressed('x') || inp.pressed('y'))
    const rate = has(p, 'overclock') ? 2 : 1
    if (shootPressed) fire(p, 0)
    if (shootHeld) {
      p.charge += dt * rate
      if (has(p, 'rapid') && p.shotCd <= 0 && p.charge > 0.18) fire(p, 0, true)
      const lvl = chargeLevel(p)
      if (lvl !== p.lastLvl) { if (lvl) emit('charged', lvl); p.lastLvl = lvl }
    } else {
      if (p.charge > 0) {
        const lvl = chargeLevel(p)
        if (lvl > 0 && !(has(p, 'rapid'))) fire(p, lvl)
        else if (lvl > 0 && has(p, 'rapid') && p.charge > TUNING.charge2 * 1.6) fire(p, lvl)
      }
      p.charge = 0
      p.lastLvl = 0
    }

    // capsules
    for (const c of W.capsules) if (!c.taken && Math.abs(c.x - p.x) < 10 + (has(p, 'wrench') ? 6 : 0) && Math.abs(c.y - (p.y - 12)) < 18) {
      c.taken = true
      p.hp = Math.min(p.maxHp, p.hp + TUNING.capsuleHeal * (has(p, 'wrench') ? 2 : 1))
      emit('heal', p)
    }

    // animation frame
    p.frame = pickFrame(p)
  }
  const chargeLevel = (p) => (p.charge >= TUNING.charge2 ? 2 : p.charge >= TUNING.charge1 ? 1 : 0)
  W.chargeLevel = chargeLevel

  function pickFrame(p) {
    const cyc = (arr, fps) => arr[Math.floor(p.anim * fps) % arr.length]
    if (p.dead) return RF.hurt
    if (p.win) return RF.win
    if (p.hurt > 0) return RF.hurt
    if (p.dash > 0) return p.onGround ? RF.dash : RF.airdash
    if (!p.onGround) {
      if (p.kick > 0) return RF.kick
      if (p.wallDir) return RF.wall
      if (p.pose > 0) return RF.airShoot
      return p.vy < -110 ? RF.rise : p.vy < 110 ? RF.peak : RF.fall
    }
    if (p.land > 0) return RF.land
    const moving = Math.abs(p.vx) > 20
    if (p.pose > 0) return moving ? cyc(RF.runShoot, 10) : RF.shoot
    if (moving) return cyc(RF.run, 13)
    if (p.charge > TUNING.charge1 * 0.6) return cyc(RF.charge, 8)
    return cyc(RF.idle, 2.5)
  }

  function fire(p, lvl, rapid = false) {
    if (lvl === 0 && (p.shotCd > 0 || W.shots.filter((s) => s.lvl === 0 && s.owner === p).length >= TUNING.maxShots * (has(p, 'splitter') ? 3 : 1))) return
    p.shotCd = rapid ? TUNING.rapidCooldown : TUNING.shotCooldown
    // shooting while wall-sliding fires away from the wall
    if (p.wallDir && !p.onGround) p.dir = -p.wallDir
    p.pose = 0.28
    const fr = !p.onGround ? RF.airShoot : Math.abs(p.vx) > 20 ? RF.runShoot[0] : RF.shoot
    const f = frame('rivet', fr)
    const mz = f.muzzle ? anchorAt('rivet', fr, f.muzzle[0], f.muzzle[1], p.x, p.y, p.dir) : { x: p.x + p.dir * 16, y: p.y - 20 }
    const pierce = has(p, 'pierce')
    const dmg = [TUNING.dmgPellet, TUNING.dmgCharge1, TUNING.dmgCharge2][lvl] * (pierce && lvl ? 1.5 : 1)
    const angles = has(p, 'splitter') ? [-0.2, 0, 0.2] : [0]
    for (const a of angles) {
      W.shots.push({
        owner: p, lvl, x: mz.x, y: mz.y, vx: Math.cos(a) * p.dir * TUNING.shotSpeed * (rapid ? 1.15 : 1), vy: Math.sin(a) * TUNING.shotSpeed,
        dmg: a === 0 ? dmg : dmg * (lvl ? 0.6 : 1), r: [3, 6, pierce ? 13 : 10][lvl], pierce: lvl === 2 || (pierce && lvl > 0), hitSet: new Set(), life: 1.6
      })
    }
    fx({ kind: 'anim', x: mz.x + p.dir * 3, y: mz.y, frames: [3], fps: 1, life: 0.06, dir: p.dir, scale: lvl ? 0.8 : 0.45 })
    emit('shoot', lvl)
    if (lvl) { p.vx -= p.dir * 40; shake(lvl * 1.2) }
  }

  function hurtPlayer(p, dmg, fromX, lava = false) {
    if (p.dead || p.win || p.iframes > 0 || (p.dash > 0 && has(p, 'coolant'))) return false
    if (p.bubble) {
      p.bubble = 0; p.bubbleT = 0; p.iframes = 0.6
      emit('bubblePop', p)
      W.burst(p.x, p.y - 16, 12, '#46e0ff', 120, 0.4)
      return false
    }
    // the first loop is the tutorial: Talon hits softer
    p.hp -= Math.max(1, Math.round(dmg * (W.loop === 1 ? TUNING.loop1Dmg : 1)))
    p.iframes = TUNING.iframes
    p.hurt = TUNING.knockback
    p.dash = 0
    p.charge = 0
    p.vx = (p.x < fromX ? -1 : 1) * 90
    p.vy = lava ? p.vy : -140
    shake(3)
    W.hitstop = Math.max(W.hitstop, 0.06)
    emit('hurt', p)
    W.burst(p.x, p.y - 16, 8, '#ffffff', 110, 0.3)
    if (p.hp <= 0) {
      if (p.parts.core === 'reboot' && !p.run.rebootUsed) {
        p.run.rebootUsed = true
        p.hp = Math.ceil(p.maxHp / 2)
        p.iframes = 2
        emit('reboot', p)
        W.burst(p.x, p.y - 16, 20, '#46e0ff', 150, 0.6)
      } else {
        p.hp = 0
        p.dead = true
        emit('playerDead', p)
        for (let i = 0; i < 6; i++) setTimeoutWorld(i * 0.12, () => W.explode(p.x + rnd(-10, 10), p.y - rnd(4, 30)))
      }
    }
    return true
  }
  W.hurtPlayer = hurtPlayer

  // world-time timers (pause-safe: they only advance in W.update)
  const timers = []
  function setTimeoutWorld(t, fn) { timers.push({ t, fn }) }

  // ---- boss ---------------------------------------------------------------------------------
  W.spawnBoss = () => {
    const speedMul = 1 + TUNING.bossSpeedPerLoop * (W.loop - 1)
    const hp = Math.round(TUNING.bossHp * (1 + TUNING.bossHpPerLoop * (W.loop - 1)))
    W.boss = {
      x: W.spawnT.x, y: 24, vx: 0, vy: 0, w: 40, h: 34, dir: -1, hp, maxHp: hp, speedMul,
      state: 'drop', t: 0, flash: 0, frame: TF.leap, anim: 0, phase2: false, onGround: false,
      wall: 0, aim: null, volley: 0, lastAttack: '', dropped: 0, dead: false
    }
    return W.boss
  }
  const target = () => {
    const live = W.players.filter((p) => p && !p.dead)
    if (!live.length) return W.players[0]
    return live.reduce((a, b) => (Math.abs(b.x - W.boss.x) < Math.abs(a.x - W.boss.x) ? b : a))
  }
  const attacks = () => {
    const a = ['pounce', 'pounce', 'wall']
    if (W.loop >= 2) a.push('dive', 'sweep')
    if (W.loop >= 3) a.push('discs')
    if (W.loop >= 4) a.push('dive', 'discs')
    return a
  }
  const bossBox = (b) => ({ x: b.x - b.w / 2, y: b.y - b.h, w: b.w, h: b.h })
  W.bossBox = bossBox
  /** Head box: the front-top of the body (the scanner weak point). */
  W.headBox = (b) => {
    if (b.state === 'cling' || b.state === 'spit') return { x: b.x - 9, y: b.y - b.h - 18, w: 18, h: 16 }
    return { x: b.dir > 0 ? b.x + b.w / 2 - 6 : b.x - b.w / 2 - 12, y: b.y - b.h - 8, w: 18, h: 16 }
  }
  const setState = (b, s) => { b.state = s; b.t = 0 }
  const clingX = (b) => (b.wall > 0 ? AW - TS - b.w / 2 + 6 : TS + b.w / 2 - 6)

  function updateBoss(b, dt) {
    if (!b) return
    b.t += dt
    b.anim += dt
    b.flash = Math.max(0, b.flash - dt)
    const sp = b.speedMul * (b.phase2 ? 1.18 : 1)
    const p = target()
    const tellT = TUNING.tell / sp
    const floorY = () => { let y = b.y; while (y < AH && !solidAt(b.x, y + 1)) y += 4; return Math.floor((y + 1) / TS) * TS }

    if (b.dead) {
      b.frame = TF.dead
      b.vy = Math.min(b.vy + TUNING.gravity * dt, 300)
      moveBody(b, dt, false)
      if (b.t < 1.8 && Math.random() < dt * 14) W.explode(b.x + rnd(-24, 24), b.y - rnd(4, 44), Math.random() < 0.2)
      return
    }
    const physics = (oneWay = false) => { b.vy = Math.min(b.vy + TUNING.gravity * dt, 400); moveBody(b, dt, oneWay) }

    switch (b.state) {
      case 'drop':
        b.frame = TF.leap
        physics()
        if (b.onGround) { setState(b, 'roar'); shake(4); emit('bossLand'); W.burst(b.x, b.y, 12, '#c9c9d9', 120, 0.5) }
        break
      case 'roar':
        b.frame = TF.crouch
        b.vx = 0
        if (b.t > 0.2 && b.t < 0.25) emit('roar')
        if (b.t > 1.1) setState(b, 'idle')
        break
      case 'idle': {
        b.frame = TF.idle[Math.floor(b.anim * 3) % 2]
        b.vx = approach(b.vx, 0, 600 * dt)
        physics()
        b.dir = p.x > b.x ? 1 : -1
        const wait = rnd(TUNING.idleMin, TUNING.idleMax) / sp
        if (b.t > (b.wait ??= wait)) {
          b.wait = null
          const list = attacks().filter((a) => a !== b.lastAttack || Math.random() < 0.25)
          const pick = list[Math.floor(Math.random() * list.length)]
          b.lastAttack = pick
          // a player up on a girder invites the aerial attacks
          if (p.y < b.y - 40 && Math.random() < 0.6) setState(b, Math.random() < 0.5 || W.loop < 2 ? 'wallLeap' : 'diveLeap')
          else setState(b, pick === 'wall' ? 'wallLeap' : pick === 'dive' ? 'diveLeap' : pick)
          b.volley = 0
          emit('tell')
        }
        break
      }
      case 'pounce':
        if (b.t < tellT) { b.frame = TF.crouch; b.dir = p.x > b.x ? 1 : -1; b.vx = 0; physics(); break }
        if (!b.leapt) {
          b.leapt = true
          const T = TUNING.pounceTime / Math.sqrt(sp)
          const tx = clamp(p.x + p.vx * 0.25, 40, AW - 40)
          b.vx = (tx - b.x) / T
          b.vy = -TUNING.gravity * T * 0.5
          b.onGround = false
          emit('pounce')
        }
        b.frame = TF.leap
        physics()
        if (b.onGround && b.t > tellT + 0.1) {
          b.leapt = false
          b.vx *= 0.3
          shake(3)
          emit('bossLand')
          W.burst(b.x, b.y, 10, '#c9c9d9', 110, 0.4)
          if (b.phase2) shockwaves(b)
          setState(b, 'skid')
        }
        break
      case 'skid':
        b.frame = TF.idle[0]
        b.vx = approach(b.vx, 0, 500 * dt)
        physics()
        if (b.t > TUNING.skid / sp) setState(b, 'idle')
        break
      case 'wallLeap': {
        // jump to the wall farther from the player, cling there
        if (!b.leapt) {
          b.wall = p.x > AW / 2 ? -1 : 1
          if (b.wallTarget == null) b.wallTarget = rnd(90, 180)
          const wx = clingX(b)
          const T = 0.75 / Math.sqrt(sp)
          b.vx = (wx - b.x) / T
          b.vy = -(b.y - (AH - TS * 2 - b.wallTarget)) / T - TUNING.gravity * T * 0.5
          b.leapt = true
          b.frame = TF.leap
          emit('pounce')
        }
        b.vy += TUNING.gravity * dt
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.dir = b.vx > 0 ? 1 : -1
        b.frame = TF.leap
        const wx = clingX(b)
        if ((b.wall > 0 && b.x >= wx - 0.5) || (b.wall < 0 && b.x <= wx + 0.5) || b.t > 1.2) {
          b.x = wx
          b.vx = b.vy = 0
          b.leapt = false
          b.wallTarget = null
          setState(b, 'cling')
          emit('cling')
        }
        break
      }
      case 'cling':
        b.frame = TF.cling[Math.floor(b.anim * 4) % 2]
        b.dir = b.wall
        if (b.t > tellT * 0.9) setState(b, 'spit')
        break
      case 'spit': {
        b.frame = TF.spit
        b.dir = b.wall
        const n = W.loop >= 2 || b.phase2 ? 2 : 1
        if (b.t > 0.12 && !b.fired) {
          b.fired = true
          const mouth = { x: b.x - b.wall * 6, y: b.y - b.h - 8 }
          const base = Math.atan2(p.y - 16 - mouth.y, p.x - mouth.x)
          for (const da of [-0.28, 0, 0.28]) {
            const a = base + da
            W.enemyShots.push({ kind: 'bolt', x: mouth.x, y: mouth.y, vx: Math.cos(a) * TUNING.boltSpeed * sp, vy: Math.sin(a) * TUNING.boltSpeed * sp, r: 4, dmg: TUNING.boltDmg, life: 4 })
          }
          emit('spit')
        }
        if (b.t > 0.55) {
          b.fired = false
          b.volley++
          if (b.volley < n) setState(b, 'cling')
          else if (W.loop >= 2 && Math.random() < 0.5) setState(b, 'diveAim')
          else { setState(b, 'fall'); b.vx = -b.wall * 60; b.vy = -60 }
        }
        break
      }
      case 'fall':
        b.frame = TF.leap
        b.dir = p.x > b.x ? 1 : -1
        physics()
        if (b.onGround) { shake(2); emit('bossLand'); setState(b, 'skid') }
        break
      case 'diveLeap':
        // up to the ceiling-ish point above the arena, then dive
        if (!b.leapt) {
          b.leapt = true
          const tx = clamp(p.x + (p.x > AW / 2 ? -140 : 140), 60, AW - 60)
          const T = 0.7 / Math.sqrt(sp)
          b.vx = (tx - b.x) / T
          b.vy = -(b.y - 56) / T - TUNING.gravity * T * 0.5
          emit('pounce')
        }
        b.frame = TF.leap
        b.vy += TUNING.gravity * dt
        b.x += b.vx * dt
        b.y += b.vy * dt
        if (b.vy >= 0 || b.t > 0.9) { b.leapt = false; b.vx = b.vy = 0; b.wall = 0; setState(b, 'diveAim') }
        break
      case 'diveAim': {
        b.frame = b.wall ? TF.cling[0] : TF.leap
        const aimT = 0.62 / sp
        if (b.t < aimT * 0.7 || !W.aim) W.aim = { x0: b.x, y0: b.y - b.h / 2, x1: p.x, y1: p.y - 6 }
        W.aim.t = b.t / aimT
        if (b.t > aimT) {
          const dx = W.aim.x1 - W.aim.x0, dy = W.aim.y1 - W.aim.y0, d = Math.hypot(dx, dy) || 1
          b.vx = (dx / d) * TUNING.diveSpeed * Math.sqrt(sp)
          b.vy = Math.max(60, (dy / d) * TUNING.diveSpeed * Math.sqrt(sp))
          b.dir = b.vx > 0 ? 1 : -1
          W.aim = null
          emit('dive')
          setState(b, 'dive')
        }
        break
      }
      case 'dive':
        b.frame = TF.dive
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.x = clamp(b.x, TS + b.w / 2, AW - TS - b.w / 2)
        if (solidAt(b.x, b.y) || b.y > AH - TS) {
          b.y = Math.floor(b.y / TS) * TS
          b.vx = b.vy = 0
          shake(5)
          emit('slam')
          W.burst(b.x, b.y, 18, '#ffb040', 150, 0.5)
          if (b.phase2 || W.loop >= 3) shockwaves(b)
          setState(b, 'stuck')
        }
        break
      case 'stuck':
        b.frame = TF.dive
        if (b.t > TUNING.diveStuck / Math.sqrt(sp)) { b.y = floorY(); setState(b, 'idle') }
        break
      case 'sweep':
        if (b.t < tellT) { b.frame = TF.crouch; b.dir = p.x > b.x ? 1 : -1; physics(); break }
        b.frame = TF.sweep
        b.vx = b.dir * 170 * sp
        physics()
        if (b.t > tellT + TUNING.sweepTime) { b.vx = 0; setState(b, 'idle') }
        break
      case 'discs':
        if (b.t < tellT) { b.frame = TF.crouch; b.dir = p.x > b.x ? 1 : -1; physics(); break }
        b.frame = TF.toss
        if (!b.fired) {
          b.fired = true
          for (const vy of [-120, -10]) W.enemyShots.push({ kind: 'disc', x: b.x + b.dir * 30, y: b.y - 30, vx: b.dir * TUNING.discSpeed * sp, vy, r: 6, dmg: TUNING.discDmg, life: 4, bounce: true })
          emit('toss')
        }
        if (b.t > tellT + 0.5) { b.fired = false; setState(b, 'idle') }
        break
    }
    b.x = clamp(b.x, TS + b.w / 2 - 6, AW - TS - b.w / 2 + 6)
    if (b.y > AH - TS) { b.y = AH - TS; if (b.vy > 0) b.vy = 0 }

    // phase 2
    if (!b.phase2 && b.hp <= b.maxHp / 2) {
      b.phase2 = true
      W.hitstop = 0.12
      shake(5)
      emit('phase2')
      W.burst(b.x, b.y - 30, 20, '#ff3050', 140, 0.6)
    }
    // contact damage
    for (const pl of W.players) if (pl && !pl.dead) {
      const pb = { x: pl.x - pl.w / 2, y: pl.y - pl.h, w: pl.w, h: pl.h }
      if (overlap(pb, shrink(bossBox(b), 6))) hurtPlayer(pl, b.state === 'dive' ? TUNING.diveDmg : TUNING.contactDmg, b.x)
      if (b.state === 'sweep' && b.t > tellT) {
        const tail = { x: b.dir > 0 ? b.x - b.w / 2 - 34 : b.x + b.w / 2, y: b.y - 14, w: 34 + b.w, h: 14 }
        if (overlap(pb, tail)) hurtPlayer(pl, TUNING.sweepDmg, b.x)
      }
    }
  }
  const shrink = (r, d) => ({ x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - d })
  function shockwaves(b) {
    for (const d of [-1, 1]) W.waves.push({ x: b.x + d * 20, y: b.y, dir: d, life: 2.4 })
    emit('wave')
  }

  function damageBoss(b, s, x, y) {
    if (!b || b.dead || b.state === 'drop') return false
    let dmg = s.dmg
    const head = W.headBox(b)
    const crit = s.owner && has(s.owner, 'scanner') && overlap({ x: x - s.r, y: y - s.r, w: s.r * 2, h: s.r * 2 }, head)
    if (crit) dmg *= 2
    b.hp -= dmg
    b.flash = 0.07
    emit('bossHit', { lvl: s.lvl, crit })
    fx({ kind: 'anim', x, y, frames: [12], fps: 1, life: 0.08, scale: s.lvl ? 1 : 0.5 })
    if (crit) W.burst(x, y, 6, '#ffd84a', 90, 0.3)
    if (s.lvl) { W.hitstop = Math.max(W.hitstop, 0.04 + 0.03 * s.lvl); shake(1 + s.lvl) }
    // a health capsule every quarter of the bar
    const q = Math.floor((b.maxHp - b.hp) / (b.maxHp / 4))
    if (q > b.dropped && b.hp > 0) { b.dropped = q; W.capsules.push({ x: b.x, y: b.y - 30, vy: -120, taken: false, life: 9 }) }
    if (b.hp <= 0) {
      b.hp = 0
      b.dead = true
      b.t = 0
      W.hitstop = 0.3
      W.enemyShots = []
      W.waves = []
      W.aim = null
      emit('bossDead')
    }
    return true
  }

  // ---- shots & hazards ----------------------------------------------------------------------
  function updateShots(dt) {
    const b = W.boss
    for (const s of W.shots) {
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.life -= dt
      if (solidAt(s.x, s.y)) { s.life = 0; fx({ kind: 'anim', x: s.x, y: s.y, frames: [12], fps: 1, life: 0.06, scale: 0.4 }) }
      if (s.x < -20 || s.x > AW + 20) s.life = 0
      if (b && !b.dead && !s.hitSet.has(b) && overlap({ x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 }, bossBox(b))) {
        if (damageBoss(b, s, s.x, s.y)) {
          s.hitSet.add(b)
          if (!s.pierce) s.life = 0
        }
      }
    }
    W.shots = W.shots.filter((s) => s.life > 0)
    for (const e of W.enemyShots) {
      e.x += e.vx * dt
      e.y += e.vy * dt
      e.life -= dt
      e.spin = (e.spin || 0) + dt * 20
      if (e.bounce) {
        e.vy += 260 * dt
        if (solidAt(e.x + Math.sign(e.vx) * e.r, e.y)) e.vx *= -1
        if (solidAt(e.x, e.y + e.r) && e.vy > 0) e.vy = -Math.max(140, Math.abs(e.vy) * 0.8)
      } else if (solidAt(e.x, e.y)) { e.life = 0; W.burst(e.x, e.y, 4, '#ff5050', 60, 0.25) }
      for (const p of W.players) if (p && !p.dead && e.life > 0) {
        if (overlap({ x: e.x - e.r, y: e.y - e.r, w: e.r * 2, h: e.r * 2 }, { x: p.x - p.w / 2 + 2, y: p.y - p.h + 4, w: p.w - 4, h: p.h - 4 })) {
          if (hurtPlayer(p, e.dmg, e.x) || p.bubble === 0) if (e.kind === 'bolt') e.life = 0
        }
      }
    }
    W.enemyShots = W.enemyShots.filter((e) => e.life > 0)
    for (const wv of W.waves) {
      wv.x += wv.dir * TUNING.wave * dt
      wv.life -= dt
      if (solidAt(wv.x + wv.dir * 4, wv.y - 4) || !solidAt(wv.x, wv.y + 2)) wv.life = 0
      for (const p of W.players) if (p && !p.dead && Math.abs(p.x - wv.x) < 8 && p.y > wv.y - 12) hurtPlayer(p, TUNING.waveDmg, wv.x - wv.dir * 10)
    }
    W.waves = W.waves.filter((w) => w.life > 0)
    for (const c of W.capsules) {
      c.vy = Math.min(c.vy + 600 * dt, 260)
      c.y += c.vy * dt
      if (solidAt(c.x, c.y + 5) || girderAt(c.x, c.y + 5)) { c.y = Math.floor((c.y + 5) / TS) * TS - 5; c.vy = 0 }
      c.life -= dt
      // the Repair Kit / Magnet pull
      for (const p of W.players) if (p && has(p, 'wrench') && Math.hypot(p.x - c.x, p.y - 12 - c.y) < 80) { c.x += Math.sign(p.x - c.x) * 90 * dt; c.y += Math.sign(p.y - 12 - c.y) * 90 * dt }
    }
    W.capsules = W.capsules.filter((c) => !c.taken && c.life > 0)
  }

  function updateFx(dt) {
    for (const f of W.fx) {
      f.t += dt
      if (f.kind === 'px') { f.vy += (f.g || 0) * dt; f.x += f.vx * dt; f.y += f.vy * dt }
    }
    W.fx = W.fx.filter((f) => f.t < f.life)
  }

  // ---- camera: follow the players, lean toward the boss -------------------------------------
  W.updateCamera = (dt, snap = false) => {
    const live = W.players.filter(Boolean)
    if (!live.length) return
    const px = live.reduce((s, p) => s + p.x, 0) / live.length
    const py = live.reduce((s, p) => s + p.y, 0) / live.length
    const p0 = live[0]
    let tx = px + p0.dir * 24
    let ty = py - 40
    const b = W.boss
    // intro: frame Talon's drop and the player together
    if (W.phase === 'intro' && b) { tx = (px + b.x) / 2; ty = py - 60 }
    // lean toward the boss, but keep the players well inside the screen
    else if (b && !b.dead) { tx += clamp((b.x - px) * 0.3, -70, 70); ty += clamp((b.y - 30 - py) * 0.15, -30, 30) }
    tx = clamp(tx - 160, 0, AW - 320)
    ty = clamp(ty - 100, 0, AH - 200)
    const k = snap ? 1 : 1 - Math.exp(-dt * 6)
    W.cam.x += (tx - W.cam.x) * k
    W.cam.y += (ty - W.cam.y) * k
  }

  // ---- main update --------------------------------------------------------------------------
  W.update = (dt, inputs) => {
    for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { timers[i].fn(); timers.splice(i, 1) } }
    W.shake = Math.max(0, W.shake - dt * 12)
    if (W.hitstop > 0) { W.hitstop -= dt; return }
    W.t += dt
    W.phaseT += dt
    W.players.forEach((p, i) => p && updatePlayer(p, inputs[i], dt))
    updateBoss(W.boss, dt)
    updateShots(dt)
    updateFx(dt)
    W.updateCamera(dt)
  }
  return W
}
