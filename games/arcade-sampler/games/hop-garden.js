// Hop Garden: a one-screen platformer. Run, hop (hold for higher), grab seeds, dodge beetles and
// reach the flower. Four hand-made stages, then they loop with more (and faster) beetles.
// Style: flat bold vector — solid shapes, chunky dark outlines, a bright garden palette.
import { W, H, TAU, clamp, rand, approach, label, createFx } from '../common.js'

const TUNING = {
  roundSeconds: 90,
  tile: 40,
  // hero
  runSpeed: 380,
  accel: 3400, // ground, towards the stick
  friction: 3800, // ground, stick released
  airAccel: 2300,
  turnBoost: 1.6, // extra accel when reversing
  gravity: 2600,
  fallMult: 1.55, // heavier on the way down
  apexMult: 0.55, // floatier near the top while jump is held
  apexBand: 140, // |vy| below this counts as "the top"
  jumpSpeed: 900, // ≈ 156 px (3.9 tiles) full hop
  jumpCut: 0.45, // vy kept when jump is released early
  maxFall: 1100,
  coyote: 0.1,
  jumpBuffer: 0.12,
  springSpeed: 1600, // ≈ 490 px
  // hazards
  beetleSpeed: 80,
  lapBeetleSpeed: 1.3, // speed multiplier per extra lap
  hitPenalty: 1, // seconds lost
  hurtTime: 0.45, // knocked-back tumble before the respawn
  invulnTime: 1.1,
  safeSpawn: 110, // beetles turn back this close to the start point
  hitStop: 0.08,
  // scoring
  seedPoints: 10,
  stagePoints: 100,
  parSeconds: 20, // time bonus: bonusPerSecond for every second under par
  bonusPerSecond: 4,
  streakWindow: 1.2, // seconds between seeds to keep the pitch rising
  clearTime: 1.4 // celebration before the next stage (round clock frozen)
}

// ---- stages ------------------------------------------------------------------------------------
// 32×20 tiles of 40 px. # dirt, - jump-through plank, o seed, b beetle, B beetle from lap 2,
// ^ spring, P start, F flower. Rows 0–2 stay empty for the HUD and the pause button.
const STAGES = [
  {
    name: 'First Hops',
    rows: [
      '................................',
      '................................',
      '................................',
      '................................',
      '................................',
      '.........................F......',
      '......................######....',
      '......................######....',
      '.............o.oBo..............',
      '............-------.............',
      '................................',
      '.....o.o........................',
      '....------......................',
      '................................',
      '..........o.o..............o....',
      '.........------...........---...',
      '................................',
      '.P.................b......o.o...',
      '################################',
      '################################'
    ],
    movers: []
  },
  {
    name: 'Spring Hill',
    rows: [
      '................................',
      '................................',
      '................................',
      '................................',
      '................................',
      '..........................F.....',
      '.........................####...',
      '.............bo.o.o.............',
      '.............######.............',
      '.............######.---.........',
      '.............######.............',
      '.....o.o.....######.............',
      '....-----....######......oBo....',
      '.............######.....-----...',
      '..o.o........######.............',
      '.-----.......######.............',
      '.............######.............',
      '.P......b.^..######.^......b....',
      '################################',
      '################################'
    ],
    movers: []
  },
  {
    name: 'Drifting Planks',
    rows: [
      '................................',
      '................................',
      '................................',
      '................................',
      '................................',
      '................................',
      '................................',
      '................................',
      '................................',
      '..........o.o..............F....',
      '.........................####...',
      '...........B.............####...',
      '.........-----..................',
      '................................',
      '..o.o...........................',
      '.-----....o.o.o.................',
      '................................',
      '.P.........................bo.o.',
      '#######..................#######',
      '#######..................#######'
    ],
    // tile units: left x, top row, width; travel dx, dy; seconds for a round trip; phase 0..1
    movers: [
      { x: 7, y: 16, w: 3, dx: 8, dy: 0, period: 5 },
      // half a cycle out, so it's at the bottom just as the first plank arrives
      { x: 21, y: 17, w: 3, dx: 0, dy: -7, period: 5, phase: 0.5 }
    ]
  },
  {
    name: 'Beetle Bridge',
    rows: [
      '................................',
      '................................',
      '................................',
      '................................',
      '................................',
      '..F.............................',
      '.###............................',
      '....---.........................',
      '...........o.o.o.o.o............',
      '........b.......B...b...........',
      '.......###############......----',
      '................................',
      '................................',
      '................................',
      '................................',
      '................................',
      '................................',
      '.P....o.o.b...B..o.o....b.....^.',
      '################################',
      '################################'
    ],
    movers: [{ x: 22, y: 10, w: 3, dx: 3, dy: 0, period: 3.2 }]
  }
]

// ---- palette and drawing -----------------------------------------------------------------------
const C = {
  ink: '#2b1d14',
  skyTop: '#6cc6f2',
  skyBot: '#d4f3ff',
  cloud: '#ffffff',
  hillFar: '#a9de86',
  hillMid: '#82cc5c',
  hillNear: '#5fb544',
  dirt: '#c8693c',
  dirtDark: '#a8522c',
  dirtLight: '#de8656',
  grass: '#66c93b',
  grassLight: '#92e35c',
  grassDark: '#3f8f2b',
  plank: '#b8743a',
  plankDark: '#8a5226',
  mover: '#e9b949',
  moverDark: '#b98a25',
  hero: '#ffb627',
  heroShade: '#f08a1c',
  leaf: '#4fb53a',
  blush: '#ff7b6b',
  beetle: '#5b3a8c',
  beetleLight: '#8d6bc7',
  seed: '#ffe36e',
  seedShade: '#e9b43c',
  petal: '#ff5fa2',
  petalDark: '#e23c86',
  centre: '#ffd23f',
  stem: '#3f9a35',
  spring: '#e8413c',
  cream: '#fff6dc'
}

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
const hash = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** The hero, feet at (0,0). sx/sy squash, face ±1, run is a 0..1 walk phase, t seconds. */
function drawHero(ctx, { sx = 1, sy = 1, face = 1, run = 0, moving = 0, t = 0, air = false, spin = 0 } = {}) {
  ctx.save()
  ctx.scale(sx, sy)
  if (spin) {
    ctx.translate(0, -18)
    ctx.rotate(spin)
    ctx.translate(0, 18)
  }
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // feet
  const step = Math.sin(run * TAU) * 5 * moving
  ctx.fillStyle = C.heroShade
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 3.5
  for (const [fx, off] of [
    [-8, step],
    [8, -step]
  ]) {
    ctx.beginPath()
    ctx.ellipse(fx + off * face, air ? -3 : -2, 7, 4.5, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()
  }
  // sprout
  const sway = Math.sin(t * 4) * 0.15 - moving * face * 0.35
  ctx.save()
  ctx.translate(0, -36)
  ctx.rotate(sway)
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(0, 2)
  ctx.lineTo(0, -10)
  ctx.stroke()
  ctx.strokeStyle = C.leaf
  ctx.lineWidth = 3
  ctx.stroke()
  for (const d of [-1, 1]) {
    ctx.save()
    ctx.translate(0, -9)
    ctx.rotate(d * 0.7)
    ctx.beginPath()
    ctx.ellipse(d * 8, 0, 9, 5, 0, 0, TAU)
    ctx.fillStyle = C.leaf
    ctx.fill()
    ctx.strokeStyle = C.ink
    ctx.lineWidth = 3.5
    ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
  // body
  ctx.beginPath()
  ctx.arc(0, -19, 18, 0, TAU)
  ctx.fillStyle = C.hero
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.fillStyle = C.heroShade
  ctx.beginPath()
  ctx.arc(-5, -12, 20, 0, TAU)
  ctx.arc(0, -19, 26, 0, TAU, true)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(6, -2, 16, 0, TAU)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.ellipse(-7, -28, 5, 3.5, -0.5, 0, TAU)
  ctx.fill()
  ctx.restore()
  ctx.beginPath()
  ctx.arc(0, -19, 18, 0, TAU)
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 4.5
  ctx.stroke()
  // face
  const ex = face * 5
  ctx.fillStyle = C.ink
  for (const d of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(ex + d * 6, -21, 2.8, 4.2, 0, 0, TAU)
    ctx.fill()
  }
  ctx.fillStyle = '#fff'
  for (const d of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(ex + d * 6 + 0.8, -22.5, 1.2, 0, TAU)
    ctx.fill()
  }
  ctx.fillStyle = C.blush
  ctx.globalAlpha = 0.7
  for (const d of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(ex + d * 11, -15, 3.5, 2.2, 0, 0, TAU)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 2.2
  ctx.beginPath()
  if (air) ctx.ellipse(ex, -13.5, 2.6, 2.6, 0, 0, TAU)
  else ctx.arc(ex, -16, 3.2, 0.2, Math.PI - 0.2)
  ctx.stroke()
  ctx.restore()
}

/** A beetle, feet at (0,0), facing dir, walk phase w. */
function drawBeetle(ctx, dir, w) {
  ctx.save()
  ctx.scale(dir * 1.2, 1.2)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // legs
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 3
  for (let i = 0; i < 3; i++) {
    const k = Math.sin(w * TAU + i * 2.1) * 3
    const lx = -10 + i * 10
    ctx.beginPath()
    ctx.moveTo(lx, -6)
    ctx.lineTo(lx + k - 2, 0)
    ctx.stroke()
  }
  // head + antennae
  ctx.beginPath()
  ctx.moveTo(19, -17)
  ctx.quadraticCurveTo(26, -28, 31, -25)
  ctx.moveTo(16, -18)
  ctx.quadraticCurveTo(20, -31, 25, -31)
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(16, -10, 8, 0, TAU)
  ctx.fillStyle = '#3a2558'
  ctx.fill()
  ctx.lineWidth = 3.5
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(18.5, -11.5, 3.2, 0, TAU)
  ctx.fill()
  ctx.fillStyle = C.ink
  ctx.beginPath()
  ctx.arc(19.5, -11.5, 1.6, 0, TAU)
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(14.5, -16.5)
  ctx.lineTo(22, -14)
  ctx.stroke()
  // shell
  ctx.beginPath()
  ctx.moveTo(-19, -4)
  ctx.bezierCurveTo(-21, -34, 17, -34, 15, -4)
  ctx.closePath()
  ctx.fillStyle = C.beetle
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.fillStyle = C.beetleLight
  ctx.beginPath()
  ctx.ellipse(-6, -21, 10, 4, -0.2, 0, TAU)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(-2, -24)
  ctx.lineTo(-2, -6)
  ctx.stroke()
  ctx.restore()
}

/** A seed, centred. */
function drawSeed(ctx, x, y, s = 1, rot = 0) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.scale(s, s)
  ctx.beginPath()
  ctx.moveTo(0, -13)
  ctx.bezierCurveTo(10, -6, 10, 10, 0, 12)
  ctx.bezierCurveTo(-10, 10, -10, -6, 0, -13)
  ctx.fillStyle = C.seed
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.fillStyle = C.seedShade
  ctx.beginPath()
  ctx.ellipse(5, 6, 8, 10, 0, 0, TAU)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 3.5
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(0, -13)
  ctx.bezierCurveTo(10, -6, 10, 10, 0, 12)
  ctx.bezierCurveTo(-10, 10, -10, -6, 0, -13)
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.ellipse(-3, -3, 2, 4, 0.3, 0, TAU)
  ctx.fill()
  ctx.restore()
}

/** The goal flower, base at (0,0). bloom 0..1 extra opening, t seconds. */
function drawFlower(ctx, t, bloom = 0) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const sway = Math.sin(t * 2) * 0.08
  ctx.rotate(sway)
  // stem
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 9
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(-4, -26, 0, -50)
  ctx.stroke()
  ctx.strokeStyle = C.stem
  ctx.lineWidth = 4.5
  ctx.stroke()
  for (const d of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(d * 10, -18 - (d > 0 ? 8 : 0), 10, 5, d * -0.5, 0, TAU)
    ctx.fillStyle = C.leaf
    ctx.fill()
    ctx.strokeStyle = C.ink
    ctx.lineWidth = 3.5
    ctx.stroke()
  }
  ctx.translate(0, -56)
  const s = 1 + bloom * 0.35 + Math.sin(t * 3) * 0.03
  ctx.scale(s, s)
  ctx.rotate(t * 0.4 + bloom * 2)
  for (let i = 0; i < 6; i++) {
    ctx.save()
    ctx.rotate((i / 6) * TAU)
    ctx.beginPath()
    ctx.ellipse(0, -13, 8.5, 12, 0, 0, TAU)
    ctx.fillStyle = i % 2 ? C.petal : C.petalDark
    ctx.fill()
    ctx.strokeStyle = C.ink
    ctx.lineWidth = 3.5
    ctx.stroke()
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(0, 0, 9, 0, TAU)
  ctx.fillStyle = C.centre
  ctx.fill()
  ctx.lineWidth = 3.5
  ctx.stroke()
  ctx.fillStyle = 'rgba(160,90,20,0.45)'
  for (let i = 0; i < 5; i++) {
    ctx.beginPath()
    ctx.arc(Math.cos(i * 1.3) * 4, Math.sin(i * 1.3) * 4, 1.4, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

/** A spring sitting on a surface at (0,0); squish 0..1. */
function drawSpring(ctx, squish = 0) {
  const h = 18 - squish * 9
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // coil
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(-10, -2)
  for (let i = 1; i <= 4; i++) ctx.lineTo(i % 2 ? 10 : -10, -2 - (h - 4) * (i / 4))
  ctx.stroke()
  ctx.strokeStyle = '#d7dde6'
  ctx.lineWidth = 3
  ctx.stroke()
  // base and pad
  roundRect(ctx, -15, -5, 30, 7, 3)
  ctx.fillStyle = '#7a4a2a'
  ctx.fill()
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 3.5
  ctx.stroke()
  roundRect(ctx, -17, -h - 6, 34, 9, 4)
  ctx.fillStyle = C.spring
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillRect(-12, -h - 4, 12, 2.5)
  ctx.restore()
}

/** A plank from x to x+w with its top at y. */
function drawPlank(ctx, x, y, w, fill = C.plank, dark = C.plankDark, grass = true) {
  ctx.lineJoin = 'round'
  roundRect(ctx, x + 2, y, w - 4, 18, 7)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.fillStyle = dark
  ctx.fillRect(x, y + 12, w, 8)
  if (grass) {
    ctx.fillStyle = C.grass
    ctx.fillRect(x, y, w, 6)
    for (let i = x + 8; i < x + w - 4; i += 14) {
      ctx.beginPath()
      ctx.arc(i, y + 6, 4, 0, Math.PI)
      ctx.fill()
    }
  }
  ctx.restore()
  roundRect(ctx, x + 2, y, w - 4, 18, 7)
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.strokeStyle = 'rgba(43,29,20,0.35)'
  ctx.lineWidth = 2
  for (let i = x + 40; i < x + w - 10; i += 40) {
    ctx.beginPath()
    ctx.moveTo(i, y + 8)
    ctx.lineTo(i, y + 15)
    ctx.stroke()
  }
}

function drawCloud(ctx, x, y, s) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath()
  ctx.arc(-34, 8, 20, 0, TAU)
  ctx.arc(-8, -6, 28, 0, TAU)
  ctx.arc(24, 0, 23, 0, TAU)
  ctx.arc(46, 12, 16, 0, TAU)
  ctx.roundRect(-54, 8, 116, 20, 10)
  ctx.fill()
  ctx.restore()
}

const hillPath = (ctx, base, amp, f, ph, w, h) => {
  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let x = 0; x <= w; x += 16) ctx.lineTo(x, base - Math.abs(Math.sin(x * f + ph)) * amp - Math.sin(x * f * 0.37 + ph) * amp * 0.3)
  ctx.lineTo(w, h)
  ctx.closePath()
}

/** Sky, sun and hills (no clouds: those drift live). */
function drawBackdrop(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, C.skyTop)
  g.addColorStop(0.75, C.skyBot)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255,240,170,0.35)'
  ctx.beginPath()
  ctx.arc(w * 0.73, h * 0.2, 90, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#fff2a8'
  ctx.beginPath()
  ctx.arc(w * 0.73, h * 0.2, 54, 0, TAU)
  ctx.fill()
  ctx.fillStyle = C.hillFar
  hillPath(ctx, h * 0.62, h * 0.12, 0.0042, 0.6, w, h)
  ctx.fill()
  ctx.fillStyle = C.hillMid
  hillPath(ctx, h * 0.74, h * 0.1, 0.0061, 2.1, w, h)
  ctx.fill()
  // a few round bushes on the near hill
  ctx.fillStyle = C.hillNear
  hillPath(ctx, h * 0.84, h * 0.07, 0.008, 4.0, w, h)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  for (let i = 0; i < 26; i++) {
    const x = hash(i, 3) * w
    const y = h * (0.7 + hash(i, 7) * 0.12)
    ctx.beginPath()
    ctx.arc(x, y, 2.5, 0, TAU)
    ctx.fill()
  }
}

/** Bake the stage's static tiles (dirt blocks and planks) once into an offscreen canvas at 2×. */
function bakeTiles(grid) {
  const T = TUNING.tile
  const cv = document.createElement('canvas')
  cv.width = W * 2
  cv.height = H * 2
  const ctx = cv.getContext('2d')
  ctx.scale(2, 2)
  const at = (c, r) => (r < 0 || r >= grid.length || c < 0 || c >= 32 ? (r >= grid.length ? '#' : '.') : grid[r][c])
  const solid = (c, r) => (c < 0 || c >= 32 ? true : at(c, r) === '#')
  // drop shadow under blocks
  ctx.fillStyle = 'rgba(30,60,40,0.18)'
  for (let r = 0; r < grid.length; r++) for (let c = 0; c < 32; c++) if (grid[r][c] === '#' && !solid(c, r + 1) && r < 18) ctx.fillRect(c * T + 6, (r + 1) * T, T, 8)
  // dirt
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < 32; c++) {
      if (grid[r][c] !== '#') continue
      const x = c * T
      const y = r * T
      ctx.fillStyle = C.dirt
      ctx.fillRect(x, y, T, T)
      ctx.fillStyle = (r + c) % 2 ? C.dirtDark : C.dirtLight
      ctx.globalAlpha = 0.25
      ctx.fillRect(x, y + T * 0.5, T, T * 0.5)
      ctx.globalAlpha = 1
      ctx.fillStyle = C.dirtDark
      for (let k = 0; k < 3; k++) {
        const px = x + 6 + hash(c * 3 + k, r) * (T - 12)
        const py = y + 8 + hash(r * 5 + k, c) * (T - 14)
        ctx.beginPath()
        ctx.ellipse(px, py, 4, 2.5, 0, 0, TAU)
        ctx.fill()
      }
      if (hash(c, r * 9) > 0.7) {
        ctx.fillStyle = C.dirtLight
        ctx.beginPath()
        ctx.arc(x + 10 + hash(r, c) * 20, y + 14 + hash(c, r) * 16, 3, 0, TAU)
        ctx.fill()
      }
    }
  // outlines on exposed edges
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < 32; c++) {
      if (grid[r][c] !== '#') continue
      const x = c * T
      const y = r * T
      if (!solid(c, r - 1) && r > 0) (ctx.moveTo(x, y), ctx.lineTo(x + T, y))
      if (!solid(c, r + 1) && r < grid.length - 1) (ctx.moveTo(x, y + T), ctx.lineTo(x + T, y + T))
      if (!solid(c - 1, r)) (ctx.moveTo(x, y), ctx.lineTo(x, y + T))
      if (!solid(c + 1, r)) (ctx.moveTo(x + T, y), ctx.lineTo(x + T, y + T))
    }
  ctx.stroke()
  // grass caps on tops
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < 32; c++) {
      if (grid[r][c] !== '#' || solid(c, r - 1)) continue
      const x = c * T
      const y = r * T
      const l = solid(c - 1, r) && !solid(c - 1, r - 1)
      const rt = solid(c + 1, r) && !solid(c + 1, r - 1)
      const x0 = l ? x : x - 3
      const x1 = rt ? x + T : x + T + 3
      ctx.fillStyle = C.grass
      ctx.beginPath()
      ctx.moveTo(x0, y - 3)
      ctx.lineTo(x1, y - 3)
      ctx.lineTo(x1, y + 9)
      for (let i = 3; i >= 0; i--) {
        const cx = x + (i + 0.5) * (T / 4)
        ctx.arc(cx, y + 9, T / 8, 0, Math.PI)
      }
      ctx.lineTo(x0, y + 9)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = C.grassDark
      ctx.lineWidth = 2.5
      ctx.beginPath()
      for (let i = 0; i < 4; i++) {
        const cx = x + (i + 0.5) * (T / 4)
        ctx.moveTo(cx + T / 8, y + 9)
        ctx.arc(cx, y + 9, T / 8, 0, Math.PI)
      }
      ctx.stroke()
      ctx.fillStyle = C.grassLight
      ctx.fillRect(x0 + 2, y - 1, x1 - x0 - 4, 3)
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(x0, y - 3)
      ctx.lineTo(x1, y - 3)
      if (!l) (ctx.moveTo(x0, y - 3), ctx.lineTo(x0, y + 9))
      if (!rt) (ctx.moveTo(x1, y - 3), ctx.lineTo(x1, y + 9))
      ctx.stroke()
      // little tufts and flowers
      if (hash(c, r) > 0.6) {
        ctx.strokeStyle = C.grassDark
        ctx.lineWidth = 2.5
        const tx = x + 8 + hash(r, c * 2) * 24
        ctx.beginPath()
        ctx.moveTo(tx, y - 3)
        ctx.lineTo(tx - 3, y - 10)
        ctx.moveTo(tx, y - 3)
        ctx.lineTo(tx + 2, y - 11)
        ctx.moveTo(tx, y - 3)
        ctx.lineTo(tx + 6, y - 8)
        ctx.stroke()
      } else if (hash(c * 7, r) > 0.75) {
        const tx = x + 10 + hash(r * 3, c) * 20
        ctx.fillStyle = hash(c, r * 2) > 0.5 ? '#fff' : C.centre
        ctx.beginPath()
        ctx.arc(tx, y - 8, 3.2, 0, TAU)
        ctx.fill()
        ctx.strokeStyle = C.ink
        ctx.lineWidth = 1.8
        ctx.stroke()
      }
    }
  // planks: one per run of '-'
  for (let r = 0; r < grid.length; r++) {
    let c = 0
    while (c < 32) {
      if (grid[r][c] !== '-') {
        c++
        continue
      }
      const c0 = c
      while (c < 32 && grid[r][c] === '-') c++
      drawPlank(ctx, c0 * T, r * T, (c - c0) * T)
    }
  }
  return cv
}

// Backdrop baked once (shared by every run and the hub icon).
let BACK = null
const backdrop = () => {
  if (BACK) return BACK
  BACK = document.createElement('canvas')
  BACK.width = W * 2
  BACK.height = H * 2
  const g = BACK.getContext('2d')
  g.scale(2, 2)
  drawBackdrop(g, W, H)
  return BACK
}

// ---- the module --------------------------------------------------------------------------------
export default {
  id: 'hop-garden',
  name: 'Hop Garden',
  blurb: 'Hop, grab seeds, reach the flower',
  scoreLabel: 'points',
  style: { bg: '#3d9a4f', accent: '#ffd23f' },
  medals: [300, 700, 1200],
  music: { bpm: 128, root: 55, chords: [0, 7, 9, 5], lead: [0, 2, 4, 7, 4, 2, 4, null], wave: 'square', gain: 0.032 },
  TUNING,
  howTo: (input) =>
    input.mode === 'touch' || input.mode === 'mouse'
      ? 'Use ◀ ▶ to run and JUMP to hop · grab seeds · reach the flower'
      : `${input.stickLabel()} to run · hold ${input.label('a')} to jump higher · reach the flower`,
  icon(ctx, x, y, size, t) {
    const k = size / 130
    ctx.drawImage(backdrop(), 0, 300 * 2, W * 2, 400 * 2, x - 200 * k, y - 100 * k, 400 * k, 200 * k)
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(k, k)
    drawCloud(ctx, -110 + Math.sin(t * 0.3) * 10, -55, 0.6)
    // a grassy block
    ctx.fillStyle = C.dirt
    ctx.fillRect(-200, 40, 400, 80)
    ctx.fillStyle = C.dirtDark
    for (let i = 0; i < 9; i++) {
      ctx.beginPath()
      ctx.ellipse(-180 + i * 45, 66 + (i % 2) * 14, 4, 2.5, 0, 0, TAU)
      ctx.fill()
    }
    ctx.fillStyle = C.grass
    ctx.fillRect(-200, 36, 400, 12)
    ctx.strokeStyle = C.ink
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(-200, 36)
    ctx.lineTo(200, 36)
    ctx.stroke()
    drawPlank(ctx, 40, -10, 120)
    ctx.save()
    ctx.translate(110, -10)
    drawFlower(ctx, t, 0)
    ctx.restore()
    const ph = (t * 0.9) % 1
    const hop = Math.sin(ph * Math.PI)
    const hx = -90 + ph * 80
    ctx.save()
    ctx.translate(hx, 36 - hop * 70)
    const st = 1 + (hop > 0.95 ? 0 : 0.12) * (1 - hop)
    drawHero(ctx, { sx: 1.25 / st, sy: 1.25 * st, face: 1, air: hop > 0.1, t, moving: 1, run: t })
    ctx.restore()
    drawSeed(ctx, -8, -50 + Math.sin(t * 3) * 5, 1.1, Math.sin(t * 2) * 0.2)
    ctx.restore()
  },
  cursor: false,
  create(env) {
    const { input, audio, settings, font } = env
    const T = env.TUNING
    const TILE = T.tile
    const PW = 28
    const PH = 34
    const fx = createFx(settings, { max: 200 })
    const BACK_CV = backdrop()
    const PAUSE_ZONE = { x: W - 130, y: 0, w: 130, h: 100 }
    const BTN = {
      left: { x: 36, y: 628, w: 112, h: 112 },
      right: { x: 164, y: 628, w: 112, h: 112 },
      jump: { x: W - 176, y: 616, w: 136, h: 124 }
    }
    const inside = (p, r, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad

    let time = T.roundSeconds
    let stageIndex = 0
    let lap = 0
    let stagesCleared = 0
    let seedsTotal = 0
    let hits = 0
    let stageTime = 0
    let clearTimer = 0
    let clearBonus = 0
    let hitStop = 0
    let streak = 0
    let streakTimer = 0
    let clock = 0
    let touchJumpWas = false
    let flash = 0
    let timeShake = 0

    // level state
    let grid = []
    let tiles = null
    let seeds = []
    let beetles = []
    let springs = []
    let movers = []
    let flower = null
    let start = { x: 100, y: 720 }
    const dust = []
    const floaters = []
    const clouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 240 + rand(0, 120), y: rand(130, 330), s: rand(0.7, 1.2), v: rand(8, 18) }))

    const hero = { x: 0, y: 0, vx: 0, vy: 0, grounded: false, coyote: 0, buffer: 0, jumping: false, face: 1, sx: 1, sy: 1, run: 0, ride: null, hurt: 0, invuln: 0, spin: 0, wasGrounded: false }

    const at = (c, r) => (r < 0 || r >= 20 ? '.' : c < 0 || c >= 32 ? '#' : grid[r][c])
    const solid = (c, r) => at(c, r) === '#'
    const oneway = (c, r) => at(c, r) === '-'

    function loadStage(i) {
      const S = STAGES[i]
      grid = S.rows.map((row) => row.padEnd(32, '.').slice(0, 32).split(''))
      seeds = []
      beetles = []
      springs = []
      const speed = T.beetleSpeed * Math.pow(T.lapBeetleSpeed, lap)
      for (let r = 0; r < 20; r++)
        for (let c = 0; c < 32; c++) {
          const ch = grid[r][c]
          const cx = c * TILE + TILE / 2
          const by = (r + 1) * TILE
          if (ch === 'o') seeds.push({ x: cx, y: r * TILE + TILE / 2, ph: rand(0, TAU), got: false })
          else if (ch === 'b' || (ch === 'B' && lap > 0)) beetles.push({ x: cx, y: by, dir: (c + r) % 2 ? 1 : -1, speed: speed * rand(0.9, 1.1), w: rand(0, 1) })
          else if (ch === '^') springs.push({ x: cx, y: by, squish: 0 })
          else if (ch === 'P') start = { x: cx, y: by }
          else if (ch === 'F') flower = { x: cx, y: by, bloom: 0 }
          if ('oBbPF^'.includes(ch)) grid[r][c] = '.'
        }
      movers = S.movers.map((m) => {
        const ph = (m.phase ?? 0) * TAU
        const k = 0.5 - 0.5 * Math.cos(ph)
        return { x0: m.x * TILE, y0: m.y * TILE, dx: m.dx * TILE, dy: m.dy * TILE, w: m.w * TILE, period: m.period, ph, x: (m.x + m.dx * k) * TILE, y: (m.y + m.dy * k) * TILE, mvx: 0, mvy: 0 }
      })
      for (const b of beetles) if (Math.abs(b.y - start.y) < 4) b.dir = Math.sign(b.x - start.x) || 1
      tiles = bakeTiles(grid)
      stageTime = 0
      spawnHero()
    }
    function spawnHero() {
      Object.assign(hero, { x: start.x, y: start.y, vx: 0, vy: 0, grounded: true, coyote: 0, buffer: 0, jumping: false, face: 1, ride: null, hurt: 0, spin: 0, sx: 1.3, sy: 0.7 })
    }

    // ---- sound ---------------------------------------------------------------------------------
    const sfx = {
      jump: () => audio.tone({ freq: 380, dur: 0.12, type: 'square', slide: 380, gain: 0.09 }),
      spring: () => (audio.tone({ freq: 300, dur: 0.28, type: 'triangle', slide: 900, gain: 0.18 }), audio.tone({ freq: 600, dur: 0.18, type: 'square', slide: 600, gain: 0.05, delay: 0.03 })),
      land: (k) => audio.noise({ dur: 0.05 + k * 0.04, gain: 0.05 + k * 0.1 }),
      seed: (n) => {
        const f = 660 * Math.pow(2, Math.min(n, 14) / 12)
        audio.tone({ freq: f, dur: 0.08, type: 'square', gain: 0.08 })
        audio.tone({ freq: f * 1.5, dur: 0.12, type: 'triangle', gain: 0.1, delay: 0.05 })
      },
      hit: () => (audio.noise({ dur: 0.22, gain: 0.3 }), audio.tone({ freq: 320, dur: 0.35, type: 'sawtooth', slide: -240, gain: 0.12 })),
      fall: () => audio.tone({ freq: 500, dur: 0.4, type: 'triangle', slide: -380, gain: 0.14 }),
      clear: () => {
        const notes = [523, 659, 784, 1047, 784, 1047]
        notes.forEach((f, i) => audio.tone({ freq: f, dur: i === 5 ? 0.4 : 0.11, type: i % 2 ? 'triangle' : 'square', gain: 0.1, delay: i * 0.09 }))
      },
      end: () => audio.tone({ freq: 440, dur: 0.6, type: 'triangle', slide: -220, gain: 0.15 })
    }

    // ---- effects -------------------------------------------------------------------------------
    const puff = (x, y, n, spread = 1) => {
      for (let i = 0; i < n && dust.length < 60; i++) {
        const d = i % 2 ? 1 : -1
        dust.push({ x: x + d * rand(2, 10), y: y - rand(2, 6), vx: d * rand(40, 140) * spread, vy: -rand(10, 60), r: rand(5, 9), life: rand(0.3, 0.5), max: 0.5 })
      }
    }
    const float = (text, x, y, color = C.cream, size = 30) => floaters.push({ text, x, y, color, size, life: 1, max: 1 })

    function hurtHero(fromX) {
      if (hero.hurt > 0 || hero.invuln > 0 || clearTimer > 0) return
      hits++
      time = Math.max(0, time - T.hitPenalty)
      timeShake = 0.5
      hero.hurt = T.hurtTime
      hero.vx = (hero.x < fromX ? -1 : 1) * 320
      hero.vy = -620
      hero.ride = null
      hitStop = T.hitStop
      streak = 0
      fx.burst(hero.x, hero.y - 18, '#ffffff', 10, 280, { size: 6, life: 0.4, gravity: 300 })
      fx.burst(hero.x, hero.y - 18, C.hero, 10, 300, { size: 5, life: 0.5 })
      fx.shake(0.45)
      if (!settings.data.reducedShake) flash = 0.12
      float(`-${T.hitPenalty}s`, W / 2, 120, '#ff6b5b', 34)
      sfx.hit()
    }
    function fellOff() {
      hits++
      time = Math.max(0, time - T.hitPenalty)
      timeShake = 0.5
      streak = 0
      float(`-${T.hitPenalty}s`, W / 2, 120, '#ff6b5b', 34)
      sfx.fall()
      respawn()
    }
    function respawn() {
      spawnHero()
      hero.invuln = T.invulnTime
      puff(start.x, start.y, 10, 1.4)
      fx.burst(start.x, start.y - 18, C.cream, 12, 220, { size: 5, life: 0.4, gravity: 0 })
    }

    function clearStage() {
      stagesCleared++
      clearBonus = Math.ceil(Math.max(0, T.parSeconds - stageTime)) * T.bonusPerSecond
      run.score += T.stagePoints + clearBonus
      clearTimer = T.clearTime
      hero.vx = 0
      flower.bloom = 1
      for (let i = 0; i < 4; i++) fx.burst(flower.x, flower.y - 56, [C.petal, C.centre, '#ffffff', C.grassLight][i], 10, 420, { size: 6, life: 0.9, gravity: 500, square: true })
      fx.shake(0.2)
      sfx.clear()
    }
    function nextStage() {
      stageIndex++
      if (stageIndex >= STAGES.length) {
        stageIndex = 0
        lap++
      }
      dust.length = 0
      fx.clear()
      loadStage(stageIndex)
    }

    // ---- input ---------------------------------------------------------------------------------
    const touchMode = () => input.mode === 'touch' || input.mode === 'mouse'
    function readTouch() {
      let left = false
      let right = false
      let jump = false
      if (touchMode())
        for (const p of input.pointers.values()) {
          if (!p.down || inside(p, PAUSE_ZONE)) continue
          if (inside(p, BTN.left, 10)) left = true
          else if (inside(p, BTN.right, 10)) right = true
          else if (inside(p, BTN.jump, 16)) jump = true
        }
      return { left, right, jump }
    }

    // ---- physics -------------------------------------------------------------------------------
    function moveX(dx) {
      hero.x += dx
      const top = Math.floor((hero.y - PH + 1) / TILE)
      const bot = Math.floor((hero.y - 1) / TILE)
      if (dx > 0) {
        const c = Math.floor((hero.x + PW / 2) / TILE)
        for (let r = top; r <= bot; r++)
          if (solid(c, r)) {
            hero.x = c * TILE - PW / 2 - 0.01
            hero.vx = 0
            break
          }
      } else if (dx < 0) {
        const c = Math.floor((hero.x - PW / 2) / TILE)
        for (let r = top; r <= bot; r++)
          if (solid(c, r)) {
            hero.x = (c + 1) * TILE + PW / 2 + 0.01
            hero.vx = 0
            break
          }
      }
    }
    function moveY(dy) {
      const prev = hero.y
      hero.y += dy
      const c0 = Math.floor((hero.x - PW / 2 + 1) / TILE)
      const c1 = Math.floor((hero.x + PW / 2 - 1) / TILE)
      if (dy > 0) {
        const r = Math.floor(hero.y / TILE)
        for (let c = c0; c <= c1; c++)
          if (solid(c, r) || (oneway(c, r) && prev <= r * TILE + 0.5)) {
            hero.y = r * TILE
            land()
            return
          }
        for (const m of movers)
          if (hero.x + PW / 2 > m.x + 2 && hero.x - PW / 2 < m.x + m.w - 2 && prev <= m.y + 10 && hero.y >= m.y) {
            hero.y = m.y
            hero.ride = m
            land()
            return
          }
      } else if (dy < 0) {
        const r = Math.floor((hero.y - PH) / TILE)
        for (let c = c0; c <= c1; c++)
          if (solid(c, r)) {
            hero.y = (r + 1) * TILE + PH
            hero.vy = 0
            return
          }
      }
    }
    function land() {
      if (!hero.grounded && !hero.wasGrounded) {
        const k = clamp(hero.vy / 1100, 0, 1)
        if (k > 0.25) {
          hero.sx = 1 + 0.45 * k
          hero.sy = 1 - 0.38 * k
          puff(hero.x, hero.y, 4 + Math.round(k * 6))
          sfx.land(k)
        }
      }
      hero.vy = 0
      hero.grounded = true
    }

    function updateHero(dt, held) {
      const tp = readTouch()
      let dirX = clamp(input.x, -1, 1)
      if (tp.left) dirX = -1
      if (tp.right) dirX = 1
      if (Math.abs(dirX) < 0.15) dirX = 0
      const jumpPressed = input.pressed('a') || (tp.jump && !touchJumpWas)
      const jumpHeld = held || input.held('a') || tp.jump
      touchJumpWas = tp.jump

      if (jumpPressed) hero.buffer = T.jumpBuffer
      else hero.buffer -= dt
      hero.coyote = hero.grounded ? T.coyote : hero.coyote - dt

      // horizontal
      const target = dirX * T.runSpeed
      let acc = hero.grounded ? (dirX ? T.accel : T.friction) : T.airAccel
      if (dirX && Math.sign(dirX) !== Math.sign(hero.vx) && hero.vx !== 0) acc *= T.turnBoost
      const dv = target - hero.vx
      hero.vx += clamp(dv, -acc * dt, acc * dt)
      if (dirX) hero.face = Math.sign(dirX)

      // jump
      if (hero.buffer > 0 && hero.coyote > 0) {
        hero.vy = -T.jumpSpeed
        hero.grounded = false
        hero.ride = null
        hero.coyote = 0
        hero.buffer = 0
        hero.jumping = true
        hero.sx = 0.72
        hero.sy = 1.32
        puff(hero.x, hero.y, 6, 0.8)
        sfx.jump()
      }
      if (hero.jumping && !jumpHeld && hero.vy < 0) {
        hero.vy *= T.jumpCut
        hero.jumping = false
      }
      if (hero.vy >= 0) hero.jumping = false

      // carried by a moving plank
      if (hero.ride) {
        moveX(hero.ride.mvx)
        hero.y = hero.ride.y
      }

      let g = T.gravity
      if (hero.vy > 0) g *= T.fallMult
      else if (jumpHeld && Math.abs(hero.vy) < T.apexBand) g *= T.apexMult
      hero.wasGrounded = hero.grounded
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
      const h = dt / steps
      for (let s = 0; s < steps; s++) {
        hero.vy = Math.min(T.maxFall, hero.vy + g * h)
        hero.grounded = false
        hero.ride = null
        moveX(hero.vx * h)
        moveY(hero.vy * h)
        hero.wasGrounded = hero.grounded
        // springs
        for (const sp of springs)
          if (hero.vy >= 0 && Math.abs(hero.x - sp.x) < 20 && hero.y >= sp.y - 20 && hero.y <= sp.y + 1 && hero.y - PH < sp.y) {
            hero.y = sp.y - 20
            hero.vy = -T.springSpeed
            hero.grounded = false
            hero.jumping = false
            hero.coyote = 0
            hero.sx = 0.6
            hero.sy = 1.5
            sp.squish = 1
            puff(sp.x, sp.y, 8, 1.2)
            fx.shake(0.12)
            sfx.spring()
          }
      }
      if (hero.grounded) hero.run += (Math.abs(hero.vx) / 300) * dt * 2.2
      if (hero.grounded && Math.abs(hero.vx) > 250 && Math.random() < dt * 8) puff(hero.x - hero.face * 10, hero.y, 1, 0.4)

      if (hero.y > H + 80) fellOff()
    }

    function updateBeetles(dt) {
      for (const b of beetles) {
        b.w += dt * b.speed / 30
        const ahead = b.x + b.dir * 18
        const c = Math.floor(ahead / TILE)
        const rBody = Math.floor((b.y - 10) / TILE)
        const rBelow = Math.floor((b.y + 2) / TILE)
        const nearStart = Math.abs(b.y - start.y) < 4 && Math.abs(ahead - start.x) < T.safeSpawn
        if (nearStart || solid(c, rBody) || !(solid(c, rBelow) || oneway(c, rBelow))) b.dir *= -1
        else b.x += b.dir * b.speed * dt
        if (hero.hurt <= 0 && Math.abs(hero.x - b.x) < PW / 2 + 16 && hero.y > b.y - 26 && hero.y - PH < b.y - 2) hurtHero(b.x)
      }
    }

    loadStage(0)

    const run = {
      score: 0,
      done: false,
      stats: () => [
        ['Stages', stagesCleared],
        ['Seeds', seedsTotal],
        ['Bumps', hits]
      ],
      debug: () => ({ hero, stageIndex, lap, time, stageTime, clearTimer, seedsLeft: seeds.filter((s) => !s.got).length, beetles, movers, load: (i) => ((stageIndex = i), loadStage(i)) }),
      prompts: (inp) => (inp.mode === 'touch' || inp.mode === 'mouse' ? [] : [['a', 'Jump (hold = higher)']]),
      update(dt) {
        clock += dt
        for (const cl of clouds) {
          cl.x += cl.v * dt
          if (cl.x > W + 120) ((cl.x = -120), (cl.y = rand(130, 330)))
        }
        fx.update(dt)
        for (let i = dust.length - 1; i >= 0; i--) {
          const d = dust[i]
          d.life -= dt
          if (d.life <= 0) {
            dust.splice(i, 1)
            continue
          }
          d.vx *= Math.pow(0.02, dt)
          d.x += d.vx * dt
          d.y += d.vy * dt
        }
        for (let i = floaters.length - 1; i >= 0; i--) {
          const f = floaters[i]
          f.life -= dt
          f.y -= 40 * dt
          if (f.life <= 0) floaters.splice(i, 1)
        }
        flash = Math.max(0, flash - dt)
        timeShake = Math.max(0, timeShake - dt)
        // squash/stretch springs back
        hero.sx = approach(hero.sx, 1, 14, dt)
        hero.sy = approach(hero.sy, 1, 14, dt)
        for (const sp of springs) sp.squish = approach(sp.squish, 0, 10, dt)
        for (const s of seeds) s.ph += dt * 3
        if (flower) flower.bloom = approach(flower.bloom, clearTimer > 0 ? 1 : 0, 6, dt)

        if (hitStop > 0) {
          hitStop -= dt
          return
        }
        if (clearTimer > 0) {
          clearTimer -= dt
          hero.vy += T.gravity * dt
          hero.y += hero.vy * dt
          if (hero.y >= hero.groundY) ((hero.y = hero.groundY), (hero.vy = clearTimer > 0.3 ? -420 : 0), (hero.sx = 1.25), (hero.sy = 0.8))
          if (clearTimer <= 0) nextStage()
          return
        }

        time -= dt
        stageTime += dt
        if (time <= 0) {
          time = 0
          run.done = true
          sfx.end()
          return
        }
        streakTimer -= dt
        if (streakTimer <= 0) streak = 0
        hero.invuln = Math.max(0, hero.invuln - dt)

        // moving planks
        for (const m of movers) {
          m.ph += (dt * TAU) / m.period
          const k = 0.5 - 0.5 * Math.cos(m.ph)
          const nx = m.x0 + m.dx * k
          const ny = m.y0 + m.dy * k
          m.mvx = nx - m.x
          m.mvy = ny - m.y
          m.x = nx
          m.y = ny
        }

        if (hero.hurt > 0) {
          hero.hurt -= dt
          hero.vy += T.gravity * dt
          hero.x += hero.vx * dt
          hero.y += hero.vy * dt
          hero.spin += dt * 14 * Math.sign(hero.vx || 1)
          if (hero.hurt <= 0) respawn()
        } else updateHero(dt, false)

        updateBeetles(dt)

        // seeds
        if (hero.hurt <= 0)
          for (const s of seeds) {
            if (s.got) continue
            if (Math.abs(hero.x - s.x) < 26 && Math.abs(hero.y - 17 - s.y) < 30) {
              s.got = true
              seedsTotal++
              run.score += T.seedPoints
              streak = streakTimer > 0 ? streak + 1 : 0
              streakTimer = T.streakWindow
              sfx.seed(streak)
              fx.burst(s.x, s.y, C.seed, 10, 240, { size: 5, life: 0.45, gravity: 200 })
              fx.burst(s.x, s.y, '#ffffff', 5, 160, { size: 3.5, life: 0.35, gravity: 0 })
              float(`+${T.seedPoints}`, s.x, s.y - 20, C.cream, 26)
            }
          }

        // goal
        if (hero.hurt <= 0 && flower && Math.abs(hero.x - flower.x) < 30 && hero.y > flower.y - 80 && hero.y - PH < flower.y) {
          hero.groundY = hero.grounded ? hero.y : flower.y
          clearStage()
        }
      },
      draw(ctx) {
        const [ox, oy] = fx.offset()
        ctx.save()
        ctx.translate(ox, oy)
        ctx.drawImage(BACK_CV, -20, -20, W + 40, H + 40)
        for (const cl of clouds) drawCloud(ctx, cl.x, cl.y, cl.s)
        // mover tracks
        ctx.strokeStyle = 'rgba(43,29,20,0.25)'
        ctx.lineWidth = 4
        ctx.setLineDash([2, 12])
        ctx.lineCap = 'round'
        for (const m of movers) {
          ctx.beginPath()
          ctx.moveTo(m.x0 + m.w / 2, m.y0 + 9)
          ctx.lineTo(m.x0 + m.dx + m.w / 2, m.y0 + m.dy + 9)
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.drawImage(tiles, 0, 0, W, H)
        for (const m of movers) {
          drawPlank(ctx, m.x, m.y, m.w, C.mover, C.moverDark, false)
          ctx.fillStyle = C.ink
          for (const bx of [m.x + 12, m.x + m.w - 12]) {
            ctx.beginPath()
            ctx.arc(bx, m.y + 9, 3, 0, TAU)
            ctx.fill()
          }
        }
        for (const sp of springs) {
          ctx.save()
          ctx.translate(sp.x, sp.y)
          drawSpring(ctx, sp.squish)
          ctx.restore()
        }
        if (flower) {
          ctx.save()
          ctx.translate(flower.x, flower.y)
          // a soft halo so the goal reads from across the screen
          ctx.fillStyle = `rgba(255,255,255,${0.25 + Math.sin(clock * 3) * 0.1})`
          ctx.beginPath()
          ctx.arc(0, -56, 34 + flower.bloom * 14, 0, TAU)
          ctx.fill()
          drawFlower(ctx, clock, flower.bloom)
          ctx.restore()
        }
        for (const s of seeds) {
          if (s.got) continue
          ctx.fillStyle = 'rgba(30,60,40,0.15)'
          ctx.beginPath()
          ctx.ellipse(s.x, s.y + 18, 8, 3, 0, 0, TAU)
          ctx.fill()
          drawSeed(ctx, s.x, s.y + Math.sin(s.ph) * 4, 1, Math.sin(s.ph * 0.7) * 0.25)
        }
        for (const b of beetles) {
          ctx.save()
          ctx.translate(b.x, b.y)
          drawBeetle(ctx, b.dir, b.w)
          ctx.restore()
        }
        // dust
        for (const d of dust) {
          const k = d.life / d.max
          ctx.globalAlpha = k * 0.85
          ctx.fillStyle = C.cream
          ctx.beginPath()
          ctx.arc(d.x, d.y, d.r * (1.4 - k * 0.5), 0, TAU)
          ctx.fill()
        }
        ctx.globalAlpha = 1
        // hero
        if (hero.invuln <= 0 || Math.floor(hero.invuln * 14) % 2 === 0) {
          ctx.save()
          ctx.translate(hero.x, hero.y)
          if (hero.hurt <= 0 && clearTimer <= 0 && !hero.grounded) {
            // shadow-free; a slight lean with speed
            ctx.rotate(hero.vx / T.runSpeed * 0.08)
          }
          drawHero(ctx, { sx: hero.sx, sy: hero.sy, face: hero.face, run: hero.run, moving: hero.grounded ? Math.min(1, Math.abs(hero.vx) / 200) : 0, t: clock, air: !hero.grounded || clearTimer > 0, spin: hero.hurt > 0 ? hero.spin : 0 })
          ctx.restore()
        }
        fx.draw(ctx)
        for (const f of floaters) {
          ctx.globalAlpha = clamp(f.life * 2, 0, 1)
          label(ctx, f.text, f.x, f.y, { font: font(400, f.size, 'Lilita One'), color: f.color, edge: 6, edgeColor: C.ink })
        }
        ctx.globalAlpha = 1
        ctx.restore()

        if (flash > 0) {
          ctx.fillStyle = `rgba(255,255,255,${flash * 3})`
          ctx.fillRect(0, 0, W, H)
        }

        // ---- HUD ----
        const pill = (x, y, w, h) => {
          roundRect(ctx, x, y, w, h, h / 2)
          ctx.fillStyle = 'rgba(255,246,220,0.92)'
          ctx.fill()
          ctx.strokeStyle = C.ink
          ctx.lineWidth = 4
          ctx.stroke()
        }
        pill(32, 30, 250, 56)
        label(ctx, String(run.score), 56, 60, { font: font(400, 38, 'Lilita One'), color: C.ink, align: 'left' })
        drawSeed(ctx, 200, 58, 0.9)
        label(ctx, `×${seedsTotal}`, 216, 60, { font: font(400, 28, 'Lilita One'), color: C.ink, align: 'left' })
        const secs = Math.ceil(time)
        const tx = W / 2 + (timeShake > 0 && !settings.data.reducedShake ? Math.sin(clock * 60) * 6 * timeShake : 0)
        pill(tx - 80, 30, 160, 56)
        label(ctx, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, tx, 60, { font: font(400, 38, 'Lilita One'), color: time <= 10 && Math.floor(clock * 4) % 2 ? '#e23c3c' : C.ink })
        pill(W / 2 + 104, 30, 196, 56)
        label(ctx, `Stage ${stageIndex + 1}${lap ? ' ★'.repeat(Math.min(lap, 3)) : ''}`, W / 2 + 202, 60, { font: font(400, 30, 'Lilita One'), color: C.ink })

        if (stageTime < 1.6 && clearTimer <= 0) {
          ctx.globalAlpha = clamp((1.6 - stageTime) * 2, 0, 1)
          label(ctx, STAGES[stageIndex].name, W / 2, 170, { font: font(400, 52, 'Lilita One'), color: C.cream, edge: 10, edgeColor: C.ink })
          ctx.globalAlpha = 1
        }
        if (clearTimer > 0) {
          const k = clamp((T.clearTime - clearTimer) * 5, 0, 1)
          const s = 0.6 + 0.4 * k + Math.sin(k * Math.PI) * 0.15
          ctx.save()
          ctx.translate(W / 2, 220)
          ctx.scale(s, s)
          label(ctx, 'Stage clear!', 0, 0, { font: font(400, 72, 'Lilita One'), color: C.centre, edge: 12, edgeColor: C.ink })
          label(ctx, `+${T.stagePoints}  ·  time bonus +${clearBonus}`, 0, 64, { font: font(400, 32, 'Lilita One'), color: C.cream, edge: 8, edgeColor: C.ink })
          ctx.restore()
        }

        // touch / mouse buttons
        if (touchMode()) {
          const tp = readTouch()
          const btn = (r, on, draw) => {
            roundRect(ctx, r.x, r.y, r.w, r.h, 28)
            ctx.fillStyle = on ? 'rgba(255,246,220,0.7)' : 'rgba(255,246,220,0.35)'
            ctx.fill()
            ctx.strokeStyle = 'rgba(43,29,20,0.7)'
            ctx.lineWidth = 4
            ctx.stroke()
            ctx.fillStyle = 'rgba(43,29,20,0.8)'
            draw(r.x + r.w / 2, r.y + r.h / 2)
          }
          const tri = (d) => (cx, cy) => {
            ctx.beginPath()
            ctx.moveTo(cx + d * 22, cy)
            ctx.lineTo(cx - d * 16, cy - 26)
            ctx.lineTo(cx - d * 16, cy + 26)
            ctx.closePath()
            ctx.fill()
          }
          btn(BTN.left, tp.left, tri(-1))
          btn(BTN.right, tp.right, tri(1))
          btn(BTN.jump, tp.jump, (cx, cy) => label(ctx, 'JUMP', cx, cy + 2, { font: font(400, 34, 'Lilita One'), color: 'rgba(43,29,20,0.85)' }))
        }
      }
    }
    return run
  }
}
