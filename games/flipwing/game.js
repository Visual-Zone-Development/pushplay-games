// Flipwing: steer a tiny starship through an asteroid stream with one thumb, and tap to flip its
// colour so it slips through matching energy gates. Endless; score from distance, gates and dust.
// Screens: title (Play / Ship / Settings), pause (Resume / Restart / Settings / Quit to title),
// settings, game over. Works with a controller, a keyboard, a mouse and touch.
import { input } from './input.js'
import { createMenu } from './menu.js'
import { fitCanvas } from './fit.js'
import { createAudio } from './audio.js'
import { createSave, createSettings } from './save.js'
import { createSettingsScreen } from './settings.js'
import { drawPrompts } from './prompts.js'
import { PALETTE, SKINS, drawShip, drawGate, drawRock, rockShape, drawDust, drawBackdrop, makeStars, glowStroke, halo, marker, withAlpha } from './art.js'
import { createMusic } from './music.js'

const ID = 'flipwing'
/** The smallest space; with fill the canvas grows to the phone's shape. Difficulty lives in a 720-wide column. */
const W = 720
const H = 1280
const canvas = document.getElementById('game')
const fit = fitCanvas(canvas, { w: W, h: H, fill: true, letterbox: PALETTE.bg, orientation: 'portrait' })
const ctx = fit.ctx
input.attach(canvas, W, H)

/** Every gameplay number. Distances in game px, times in seconds. */
const TUNING = {
  column: 720, // playfield width; wider screens only show more backdrop
  shipFromBottom: 380, // ship height above the safe bottom edge (thumb sits below it)
  shipHalfWidth: 40, // how close the ship gets to the column edge
  hitRadius: 22, // ship hitbox (forgiving: the drawn ship is ~44)
  rockHit: 0.82, // fraction of a rock's radius that kills
  dragGain: 1.3, // ship px per thumb px
  tapTime: 0.22, // a touch shorter than this ...
  tapSlop: 16, // ... that moved less than this is a flip
  stickSpeed: 1150, // ship px/s with a stick or arrows at full tilt
  stickResponse: 16, // how quickly the ship reaches stick speed
  startSpeed: 520, // world scroll px/s
  accel: 4.2, // px/s gained per second
  maxSpeed: 1250,
  pxPerMetre: 40,
  minGapTime: 0.52, // seconds between threats, at the current speed
  graceTime: 0.07, // a flip this soon after reaching a wrong gate still counts
  lateWindow: 0.25, // a flip this close before a gate is a Late flip
  multMax: 5,
  multHold: 6, // seconds a multiplier step lasts without another late flip
  gatePoints: 20,
  latePoints: 30,
  dustPoints: 5,
  swapLead: 0.9, // a swapping gate changes this long before it reaches the ship
  doubleGap: 0.6, // seconds between the two halves of a double gate
  firstGateAt: 2.6, // seconds into a run
  stages: [
    { at: 0, name: null },
    { at: 30, name: 'Split gates', tip: 'Steer into your colour, or flip' },
    { at: 60, name: 'Drifting rocks', tip: 'They slide sideways' },
    { at: 90, name: 'Three-way gates', tip: 'Find your lane' },
    { at: 120, name: 'Swapping gates', tip: 'They change colour as they arrive' },
    { at: 150, name: 'Double gates', tip: 'Flip, then flip again' }
  ],
  deathSlowmo: 0.5,
  deathDelay: 1.1,
  overLock: 0.6 // game over ignores input this long, so a stray tap doesn't restart
}

const settings = createSettings(ID, { vibrate: true }) // flipwing-settings-v1
const audio = createAudio({ settings })
const music = createMusic(audio)
const save = createSave(ID, 1, { best: 0, bestDist: 0, skin: 'classic', runs: 0 }) // flipwing-save-v1

const state = {
  screen: 'title', // title | playing | paused | settings | gameover
  from: 'title',
  t: 0, // run time
  clock: 0, // real time, for animation
  speed: TUNING.startSpeed,
  scroll: 0,
  dist: 0,
  score: 0,
  mult: 1,
  multT: 0,
  bestMult: 1,
  gates: 0,
  lateFlips: 0,
  ship: { x: TUNING.column / 2, vx: 0, which: 0, flipT: 1, bank: 0, lastFlip: -9, beforeFlip: 0 },
  things: [], // rocks, gates, dust
  nextSpawn: 0, // world px until the next pattern
  stage: 0,
  banner: null,
  popups: [],
  dying: 0, // > 0 while the death animation plays
  shake: 0,
  flash: 0,
  newBest: false,
  unlocked: [],
  overLock: 0,
  bgScroll: 0
}
const particles = []
const trail = []
const stars = makeStars(170, 1600, 2400, 7)
const touchState = { down: false, t: 0, lastX: 0, moved: 0 }
let god = false

window.__game = {
  state,
  TUNING,
  save,
  settings,
  get titleMenu() {
    return titleMenu
  },
  get pauseMenu() {
    return pauseMenu
  },
  get pauseButton() {
    return pauseButton()
  },
  /** For headless playtests: start a run, flip, and read what's coming. */
  start: () => startRound(),
  flip: () => flip(),
  god: (on = true) => (god = on)
}
const params = new URLSearchParams(location.search)
const debug = params.has('debug')
if (params.has('god')) god = true

// ---------- Layout (fill: the space follows the screen, so everything is placed from fit.w / fit.h)

const ox = () => Math.round((fit.w - TUNING.column) / 2)
const shipY = () => Math.round(fit.h - fit.safe.bottom - TUNING.shipFromBottom)
const textScale = () => settings.data.textScale ?? 1
const font = (weight, px) => `${weight} ${Math.round(px * textScale())}px system-ui, sans-serif`
const skin = () => SKINS.find((s) => s.id === save.data.skin) ?? SKINS[0]
const colors = () => skin().colors
const unlockedSkins = () => SKINS.filter((s) => s.unlock <= save.data.best)

const MENU_W = 540
const menuOpts = (y) => ({ x: fit.w / 2, y, width: MENU_W, height: 88, gap: 20, wrap: true })
let titleMenu, pauseMenu, overMenu, settingsScreen
function buildMenus() {
  const keep = (m) => m?.selected?.id
  const sel = { title: keep(titleMenu), pause: keep(pauseMenu), over: keep(overMenu), settings: keep(settingsScreen?.menu) }
  const bottom = fit.h - fit.safe.bottom
  titleMenu = createMenu(
    [
      { id: 'play', label: 'Play' },
      {
        id: 'skin',
        label: 'Ship',
        type: 'choice',
        value: skin().id,
        options: unlockedSkins().map((s) => ({ value: s.id, label: s.name })),
        onChange: (v) => {
          save.data.skin = v
          save.save()
          audio.tone({ freq: 700, dur: 0.07, gain: 0.12 })
        }
      },
      { id: 'settings', label: 'Settings' }
    ],
    menuOpts(Math.max(fit.h * 0.56, bottom - 520))
  )
  pauseMenu = createMenu(
    [
      { id: 'resume', label: 'Resume' },
      { id: 'restart', label: 'Restart' },
      { id: 'settings', label: 'Settings' },
      { id: 'title', label: 'Quit to title' }
    ],
    menuOpts(Math.max(fit.h * 0.42, bottom - 620))
  )
  overMenu = createMenu(
    [
      { id: 'again', label: 'Play again' },
      { id: 'title', label: 'Title' }
    ],
    menuOpts(Math.max(fit.h * 0.6, bottom - 420))
  )
  settingsScreen = createSettingsScreen({
    settings,
    audio,
    x: fit.w / 2,
    y: fit.safe.top + 220,
    width: Math.min(660, fit.w - 60),
    extra: [{ id: 'vibrate', label: 'Vibration', type: 'toggle', value: true }]
  })
  if (sel.title) titleMenu.select(sel.title)
  if (sel.pause) pauseMenu.select(sel.pause)
  if (sel.over) overMenu.select(sel.over)
  if (sel.settings) settingsScreen.menu.select(sel.settings)
}
buildMenus()
let lastSize = ''
function layout() {
  const key = `${fit.w}x${fit.h}:${fit.safe.top},${fit.safe.bottom}:${textScale()}`
  if (key !== lastSize) {
    lastSize = key
    buildMenus()
  }
}

/** On-screen pause button: top-right, inside the safe area, 64×64. */
const pauseButton = () => ({ x: fit.w - fit.safe.right - 32 - 64, y: fit.safe.top + 28, w: 64, h: 64 })
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

input.onPause(() => {
  if (state.screen === 'playing') pause()
})

// ---------- Flow

function startRound() {
  Object.assign(state, {
    screen: 'playing',
    t: 0,
    speed: TUNING.startSpeed,
    scroll: 0,
    dist: 0,
    score: 0,
    mult: 1,
    multT: 0,
    bestMult: 1,
    gates: 0,
    lateFlips: 0,
    things: [],
    nextSpawn: 0,
    stage: 0,
    banner: null,
    popups: [],
    dying: 0,
    shake: 0,
    flash: 0,
    newBest: false,
    unlocked: [],
    firstGate: false
  })
  state.ship = { x: TUNING.column / 2, vx: 0, which: 0, flipT: 1, bank: 0, lastFlip: -9, beforeFlip: 0 }
  particles.length = 0
  trail.length = 0
  touchState.down = false
  music.setMode('run')
}
function pause() {
  pauseMenu.select('resume')
  state.screen = 'paused'
  touchState.down = false
  save.save()
}
function openSettings(from) {
  state.from = from
  state.screen = 'settings'
}
function toTitle() {
  state.screen = 'title'
  buildMenus()
  music.setMode('title')
}
function endRound() {
  const oldBest = save.data.best
  save.data.runs++
  save.data.bestDist = Math.max(save.data.bestDist, Math.floor(state.dist))
  if (state.score > oldBest) {
    save.data.best = state.score
    state.newBest = oldBest > 0
  }
  state.unlocked = SKINS.filter((s) => s.unlock > oldBest && s.unlock <= save.data.best)
  save.save()
  state.screen = 'gameover'
  state.overLock = TUNING.overLock
  overMenu.select('again')
  buildMenus()
  music.setMode('title')
  if (state.unlocked.length) [0, 0.1, 0.2, 0.3].forEach((d, i) => audio.tone({ freq: [523, 659, 784, 1047][i], dur: 0.18, type: 'triangle', gain: 0.18, delay: d + 0.2 }))
}

// ---------- Update

function update(dt) {
  state.clock += dt
  if (state.screen === 'title') state.bgScroll += 320 * dt
  else if (state.screen === 'playing' && state.dying <= 0) state.bgScroll += state.speed * dt
  layout()
  music.update(state.screen === 'playing' ? state.speed : TUNING.startSpeed, state.screen !== 'paused')
  updateParticles(dt * (state.dying > 0 ? TUNING.deathSlowmo : 1))
  switch (state.screen) {
    case 'title': {
      updateTitleScene(dt)
      const choice = titleMenu.update(input, dt)
      if (choice === 'play') startRound()
      if (choice === 'settings') openSettings('title')
      return
    }
    case 'settings':
      if (settingsScreen.update(input, dt) === 'back') {
        state.screen = state.from
        buildMenus()
      }
      return
    case 'paused': {
      const choice = pauseMenu.update(input, dt)
      if (choice === 'resume' || choice === 'back') state.screen = 'playing'
      if (choice === 'restart') startRound()
      if (choice === 'settings') openSettings('paused')
      if (choice === 'title') toTitle()
      return
    }
    case 'gameover': {
      state.overLock -= dt
      if (state.overLock > 0) return
      const choice = overMenu.update(input, dt)
      if (choice === 'again') startRound()
      if (choice === 'title' || choice === 'back') toTitle()
      return
    }
  }
  play(dt)
}

function vibrate(ms) {
  if (settings.data.vibrate !== false) navigator.vibrate?.(ms)
}

function flip() {
  const s = state.ship
  s.beforeFlip = s.which
  s.which = 1 - s.which
  s.flipT = 0
  s.lastFlip = state.t
  const up = s.which === 1
  audio.tone({ freq: up ? 620 : 880, dur: 0.09, slide: up ? 380 : -380, gain: 0.12 })
  vibrate(8)
  const c = colors()[s.which]
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    spark(ox() + s.x, shipY(), Math.cos(a) * 260, Math.sin(a) * 260, c, 0.3)
  }
}

/** Touch and mouse: the ship moves by how far the pointer slides; a short, still touch flips. */
function pointerControl() {
  const p = input.pointer
  const usePointer = input.mode === 'touch' || input.mode === 'mouse'
  if (p.pressed && inside(p, pauseButton())) {
    input.requestMenu()
    return
  }
  if (p.pressed && usePointer) Object.assign(touchState, { down: true, t: state.clock, lastX: p.x, moved: 0 })
  if (!touchState.down) return
  const dx = p.x - touchState.lastX
  touchState.lastX = p.x
  touchState.moved += Math.abs(dx)
  state.ship.x += dx * TUNING.dragGain
  state.ship.dragV = dx * TUNING.dragGain
  if (p.released || !p.down) {
    if (state.clock - touchState.t < TUNING.tapTime && touchState.moved < TUNING.tapSlop) flip()
    touchState.down = false
  }
}
/** A touch that could still turn out to be a flip. */
const tapPending = () => touchState.down && touchState.moved < TUNING.tapSlop && state.clock - touchState.t < TUNING.tapTime

function play(rawDt) {
  if (input.pressed('menu')) return pause()
  // Death: slow motion, then the results.
  if (state.dying > 0) {
    state.dying -= rawDt
    const dt = rawDt * TUNING.deathSlowmo
    for (const th of state.things) th.y += state.speed * 0.25 * dt
    state.shake = Math.max(0, state.shake - rawDt)
    if (state.dying <= 0) endRound()
    return
  }
  const dt = rawDt
  const s = state.ship
  state.t += dt
  state.speed = Math.min(TUNING.maxSpeed, TUNING.startSpeed + TUNING.accel * state.t)

  // Steering.
  s.dragV = 0
  pointerControl()
  if (state.screen !== 'playing') return
  const target = input.x * TUNING.stickSpeed
  s.vx += (target - s.vx) * Math.min(1, dt * TUNING.stickResponse)
  s.x += s.vx * dt
  const lo = TUNING.shipHalfWidth
  const hi = TUNING.column - TUNING.shipHalfWidth
  s.x = Math.max(lo, Math.min(hi, s.x))
  const lean = s.vx / TUNING.stickSpeed + (s.dragV || 0) / (900 * dt + 1e-6) * 0.6
  s.bank += (Math.max(-1, Math.min(1, lean)) - s.bank) * Math.min(1, dt * 12)
  if (['a', 'b', 'x', 'y'].some((b) => input.pressed(b))) flip()
  s.flipT = Math.min(1, s.flipT + dt / 0.14)

  // Scroll the world.
  const move = state.speed * dt
  state.scroll += move
  const metres = move / TUNING.pxPerMetre
  state.dist += metres
  state.score += Math.round(metres * 10 * state.mult) / 10
  state.nextSpawn -= move
  if (state.nextSpawn <= 0) spawnPattern()

  // Multiplier decay.
  if (state.mult > 1) {
    state.multT -= dt
    if (state.multT <= 0) {
      state.mult--
      state.multT = state.mult > 1 ? TUNING.multHold : 0
    }
  }

  // Stage changes bring a banner.
  const next = TUNING.stages[state.stage + 1]
  if (next && state.t >= next.at) {
    state.stage++
    state.banner = { text: next.name, tip: next.tip, t: 2.8 }
    audio.tone({ freq: 392, dur: 0.14, type: 'triangle', gain: 0.16 })
    audio.tone({ freq: 587, dur: 0.22, type: 'triangle', gain: 0.16, delay: 0.12 })
  }
  if (state.banner && (state.banner.t -= dt) <= 0) state.banner = null

  const sy = shipY()
  for (const th of state.things) {
    const prevY = th.y
    th.y += move
    if (th.kind === 'rock') {
      th.x += th.vx * dt
      if (th.x < th.r || th.x > TUNING.column - th.r) th.vx *= -1
      th.angle += th.spin * dt
      if (!god && Math.hypot(th.x - s.x, th.y - sy) < th.r * TUNING.rockHit + TUNING.hitRadius) return die(th)
    } else if (th.kind === 'dust') {
      if (!th.taken && Math.abs(th.x - s.x) < 44 && Math.abs(th.y - sy) < 44) collectDust(th)
    } else if (th.kind === 'gate') {
      if (th.swap && !th.swapped && th.y >= sy - state.speed * TUNING.swapLead) swapGate(th)
      if (!th.passed && prevY < sy && th.y >= sy) {
        th.passed = true
        th.seg = th.segs.find((g) => s.x >= g.x0 && s.x < g.x1) ?? th.segs[0]
        th.check = TUNING.graceTime
      }
      if (th.check !== undefined) {
        const ok = th.seg.which === s.which
        if (ok) {
          passGate(th)
          th.check = undefined
        } else if (tapPending()) {
          // A tap in progress may still be a flip: wait for it.
        } else if ((th.check -= dt) <= 0) {
          th.check = undefined
          if (!god) return die(th)
        }
      }
    }
  }
  state.things = state.things.filter((th) => th.y < fit.h + 200)

  // Trail behind the ship.
  for (const tp of trail) tp.y += move
  trail.unshift({ x: s.x, y: sy + 30, c: colors()[s.which] })
  if (trail.length > 26) trail.length = 26
  for (const pp of state.popups) (pp.t -= dt), (pp.y -= 60 * dt)
  state.popups = state.popups.filter((pp) => pp.t > 0)
  state.shake = Math.max(0, state.shake - dt)
  state.flash = Math.max(0, state.flash - dt * 4)
}

function popup(text, x, y, color, size = 40) {
  state.popups.push({ text, x, y, color, size, t: 0.9 })
}

function passGate(g) {
  const s = state.ship
  state.gates++
  const late = state.t - s.lastFlip < TUNING.lateWindow + TUNING.graceTime && s.beforeFlip !== g.seg.which
  let pts = TUNING.gatePoints * state.mult
  const c = colors()[g.seg.which]
  if (late) {
    state.lateFlips++
    state.mult = Math.min(TUNING.multMax, state.mult + 1)
    state.bestMult = Math.max(state.bestMult, state.mult)
    state.multT = TUNING.multHold
    pts += TUNING.latePoints * state.mult
    popup('LATE FLIP!', s.x, shipY() - 120, c, 46)
    ;[0, 0.06, 0.12].forEach((d, i) => audio.tone({ freq: 1046 * (1 + i * 0.25), dur: 0.08, type: 'triangle', gain: 0.1, delay: d }))
    if (!settings.data.reducedShake) state.flash = 0.35
  }
  state.score += pts
  popup(`+${Math.round(pts)}`, s.x, shipY() - 70, PALETTE.text, 34)
  const pitch = 1 + (state.mult - 1) * 0.12
  audio.tone({ freq: 523 * pitch, dur: 0.16, type: 'triangle', gain: 0.14 })
  audio.tone({ freq: 784 * pitch, dur: 0.2, type: 'triangle', gain: 0.1, delay: 0.03 })
  // The matched segment shatters.
  const o = ox()
  for (let i = 0; i < 26; i++) {
    const x = g.seg.x0 + Math.random() * (g.seg.x1 - g.seg.x0)
    spark(o + x, g.y, (Math.random() - 0.5) * 300, -100 - Math.random() * 400, c, 0.5)
  }
  ring(o + s.x, shipY(), c)
  g.shattered = g.seg
}

function swapGate(g) {
  g.swapped = true
  for (const seg of g.segs) seg.which = 1 - seg.which
  audio.tone({ freq: 300, dur: 0.12, type: 'sawtooth', gain: 0.07, slide: 300 })
  const o = ox()
  for (const seg of g.segs) for (let i = 0; i < 6; i++) spark(o + seg.x0 + Math.random() * (seg.x1 - seg.x0), g.y, 0, (Math.random() - 0.5) * 200, '#FFFFFF', 0.3)
}

function collectDust(d) {
  d.taken = true
  const pts = TUNING.dustPoints * state.mult
  state.score += pts
  state.dustChain = (state.dustChain || 0) + 1
  audio.tone({ freq: 1200 + (state.dustChain % 8) * 90, dur: 0.05, type: 'sine', gain: 0.07 })
  for (let i = 0; i < 5; i++) spark(ox() + d.x, d.y, (Math.random() - 0.5) * 240, (Math.random() - 0.5) * 240, PALETTE.dust, 0.3)
}

function die(cause) {
  state.dying = TUNING.deathDelay
  touchState.down = false
  const s = state.ship
  const o = ox()
  const sy = shipY()
  const c = colors()[s.which]
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2
    const v = 120 + Math.random() * 620
    spark(o + s.x, sy, Math.cos(a) * v, Math.sin(a) * v, i % 3 ? c : PALETTE.rock, 0.7 + Math.random() * 0.6)
  }
  ring(o + s.x, sy, '#FFFFFF')
  ring(o + s.x, sy, c, 1.6)
  state.shake = settings.data.reducedShake ? 0 : 0.6
  if (!settings.data.reducedShake) state.flash = 0.6
  state.deathCause = cause.kind
  audio.noise({ dur: 0.6, gain: 0.32 })
  audio.tone({ freq: 320, dur: 0.7, type: 'sawtooth', gain: 0.16, slide: -260 })
  vibrate(160)
}

// ---------- Spawning: patterns of rocks, gates and dust, spaced by time at the current speed

const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
let rockSeed = 1

function rock(x, y, r, vx = 0) {
  return { kind: 'rock', x, y, r, vx, angle: Math.random() * 6, spin: rnd(-1.2, 1.2), shape: rockShape(r, rockSeed++) }
}
function gate(y, segs, extra = {}) {
  return { kind: 'gate', y, segs, ...extra }
}
function dustLine(x, y, n, dx = 0) {
  return Array.from({ length: n }, (_, i) => ({ kind: 'dust', x: Math.max(40, Math.min(TUNING.column - 40, x + dx * i)), y: y - i * 64 }))
}
/** Split the column into n lanes with alternating colours, starting with `first`. */
function lanes(n, first) {
  const w = TUNING.column / n
  return Array.from({ length: n }, (_, i) => ({ x0: i * w, x1: (i + 1) * w, which: (first + i) % 2 }))
}

function spawnPattern() {
  const C = TUNING.column
  const top = -120
  const v = state.speed
  const gap = Math.max(240, v * TUNING.minGapTime)
  const st = state.stage
  const items = []
  let length = 0
  const s = state.ship

  // The first gate of a run teaches the flip: full width, the other colour.
  if (!state.firstGate && state.t >= TUNING.firstGateAt) {
    state.firstGate = true
    items.push(gate(top, [{ x0: 0, x1: C, which: 1 - s.which }], { teach: true }))
    items.push(...dustLine(C / 2, top + 380, 4))
    length = 200
  } else {
    const options = [['rocks', 3], ['gate', 3], ['dust', 1]]
    if (st >= 1) options.push(['split2', 3])
    if (st >= 3) options.push(['split3', 2])
    if (st >= 4) options.push(['swap', 2])
    if (st >= 5) options.push(['double', 2])
    if (!state.firstGate) options.splice(1, 1) // only rocks and dust before the teaching gate
    let total = options.reduce((a, [, w]) => a + w, 0)
    let roll = Math.random() * total
    const kind = options.find(([, w]) => (roll -= w) < 0)[0]
    const drift = () => (st >= 2 && Math.random() < 0.45 ? pick([-1, 1]) * rnd(60, 140) : 0)
    const which = () => (Math.random() < 0.5 ? 0 : 1)

    if (kind === 'rocks') {
      const n = 1 + Math.floor(Math.random() * Math.min(3, 1 + st))
      const spacing = Math.max(170, v * 0.38)
      for (let i = 0; i < n; i++) {
        const r = rnd(34, 62)
        items.push(rock(rnd(r, C - r), top - i * spacing, r, drift()))
      }
      length = (n - 1) * spacing
      if (Math.random() < 0.4) items.push(...dustLine(rnd(80, C - 80), top - length - 40, 3, rnd(-40, 40)))
    } else if (kind === 'gate') {
      items.push(gate(top, [{ x0: 0, x1: C, which: which() }]))
      if (Math.random() < 0.5) items.push(...dustLine(rnd(80, C - 80), top + 260, 3))
    } else if (kind === 'dust') {
      const x = rnd(120, C - 120)
      items.push(...dustLine(x, top, 6, pick([-50, 50, 0])))
      length = 320
    } else if (kind === 'split2' || kind === 'split3') {
      const n = kind === 'split2' ? 2 : 3
      const segs = lanes(n, which())
      items.push(gate(top, segs))
      // From drifting-rocks on, a rock may guard one lane in front of the gate.
      if (st >= 2 && Math.random() < 0.5) {
        const seg = pick(segs)
        const lead = Math.max(260, v * 0.32)
        items.push(rock((seg.x0 + seg.x1) / 2, top + lead, rnd(30, 40)))
      }
    } else if (kind === 'swap') {
      const segs = Math.random() < 0.5 ? [{ x0: 0, x1: C, which: which() }] : lanes(2, which())
      items.push(gate(top, segs, { swap: true }))
    } else if (kind === 'double') {
      const first = which()
      const gapPx = v * TUNING.doubleGap
      items.push(gate(top, [{ x0: 0, x1: C, which: first }]))
      items.push(gate(top - gapPx, [{ x0: 0, x1: C, which: 1 - first }]))
      length = gapPx
    }
  }
  state.things.push(...items)
  state.nextSpawn = length + gap * rnd(1, 1.35)
}

// ---------- Particles (capped; skipped shake/flash honour reduced shake)

const MAX_PARTICLES = 320
function spark(x, y, vx, vy, color, life) {
  if (particles.length >= MAX_PARTICLES) particles.shift()
  particles.push({ kind: 'spark', x, y, vx, vy, color, life, max: life })
}
function ring(x, y, color, scale = 1) {
  particles.push({ kind: 'ring', x, y, color, life: 0.4 * scale, max: 0.4 * scale, scale })
}
function updateParticles(dt) {
  const fall = state.screen === 'playing' && state.dying <= 0 ? state.speed * dt * 0.6 : 0
  for (const p of particles) {
    p.life -= dt
    if (p.kind === 'spark') {
      p.x += p.vx * dt
      p.y += p.vy * dt + fall
      p.vx *= 1 - dt * 2
      p.vy *= 1 - dt * 2
    }
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1)
}
function drawParticles() {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (const p of particles) {
    const a = Math.max(0, p.life / p.max)
    if (p.kind === 'spark') {
      ctx.strokeStyle = withAlpha(p.color, a)
      ctx.lineWidth = 3.5
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04)
      ctx.stroke()
    } else {
      ctx.strokeStyle = withAlpha(p.color, a * 0.8)
      ctx.lineWidth = 6 * a + 1
      ctx.beginPath()
      ctx.arc(p.x, p.y, (1 - a) * 160 * p.scale + 20, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.restore()
}

// ---------- Title scene: the ship bursts through a split gate, flipping as it crosses

const title = { gateY: -200, which: 0, flipT: 1, rocks: [] }
function updateTitleScene(dt) {
  const sy = titleShipY()
  const prev = title.gateY
  title.gateY += 560 * dt
  if (prev < sy && title.gateY >= sy) {
    title.which = 1 - title.which
    title.flipT = 0
    const c = colors()[title.which]
    for (let i = 0; i < 24; i++) spark(fit.w / 2 + rnd(-110, 110), sy, rnd(-200, 200), rnd(-420, -60), c, 0.6)
    ring(fit.w / 2, sy, c)
  }
  if (title.gateY > fit.h + 200) title.gateY = -240
  title.flipT = Math.min(1, title.flipT + dt / 0.14)
}
const titleShipY = () => Math.round(Math.max(fit.safe.top + 400, fit.h * 0.36))

// ---------- Drawing

function draw() {
  const safe = fit.safe
  const w = fit.w
  const h = fit.h
  ctx.save()
  if (state.shake > 0 && !settings.data.reducedShake) ctx.translate((Math.random() - 0.5) * 22 * state.shake, (Math.random() - 0.5) * 22 * state.shake)
  const moving = state.screen === 'playing' && state.dying <= 0
  drawBackdrop(ctx, w, h, { stars, scroll: state.bgScroll, speed: state.screen === 'title' ? 500 : moving ? state.speed : 0, t: state.clock, tint: colors()[state.ship.which] })
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (state.screen === 'title') drawTitle()
  else if (state.screen === 'settings') {
    ctx.fillStyle = 'rgba(4,6,15,0.55)'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = PALETTE.text
    ctx.font = font(900, 56)
    ctx.fillText('Settings', w / 2, safe.top + 130)
    drawMenu(settingsScreen.menu, 34)
    if (input.mode !== 'touch') drawPrompts(ctx, input, [['left', 'Change'], ['b', 'Back']], { x: w / 2, y: h - safe.bottom - 48, size: 34 * textScale() })
  } else {
    drawPlay()
    if (state.screen === 'paused') {
      ctx.fillStyle = 'rgba(4,6,15,0.72)'
      ctx.fillRect(0, 0, w, h)
      neonText('PAUSED', w / 2, pauseMenu.rect(0).y - 120, 84, colors()[0])
      drawMenu(pauseMenu)
    } else if (state.screen === 'gameover') drawGameOver()
  }
  drawParticles()
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${state.flash * 0.25})`
    ctx.fillRect(-30, -30, w + 60, h + 60)
  }
  ctx.restore()
  canvas.style.cursor = state.screen === 'playing' && state.dying <= 0 && input.mode === 'mouse' ? 'none' : 'default'
  if (debug) drawDebug()
}

function neonText(text, x, y, px, color, align = 'center') {
  ctx.save()
  ctx.font = `900 ${Math.round(px)}px system-ui, sans-serif`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = color
  for (const [lw, a] of [[18, 0.08], [10, 0.14], [5, 0.3]]) {
    ctx.globalAlpha = a
    ctx.lineWidth = lw
    ctx.strokeText(text, x, y)
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(text, x, y)
  ctx.lineWidth = 3
  ctx.strokeText(text, x, y)
  ctx.restore()
}

/** Neon pill buttons on top of menu.js (which still does all the input). */
function drawMenu(menu, size = 38) {
  const accent = colors()[0]
  ctx.save()
  ctx.textBaseline = 'middle'
  menu.items.forEach((it, i) => {
    const r = menu.rect(i)
    const on = menu.selected === it
    const p = new Path2D()
    p.roundRect(r.x, r.y, r.w, r.h, r.h / 2)
    ctx.fillStyle = on ? withAlpha(accent, 0.18) : 'rgba(255,255,255,0.05)'
    ctx.fill(p)
    if (on) glowStroke(ctx, p, accent, 3)
    else {
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'
      ctx.lineWidth = 2
      ctx.stroke(p)
    }
    const cy = r.y + r.h / 2
    ctx.fillStyle = on ? '#FFFFFF' : PALETTE.text
    ctx.font = font(on ? 800 : 700, size)
    if (it.type) {
      // Value rows: ‹ value › on the right, label on the left.
      ctx.textAlign = 'left'
      ctx.fillText(it.label, r.x + 36, cy)
      ctx.textAlign = 'right'
      const val = menu.display(it)
      if (it.id === 'skin') {
        const sk = SKINS.find((s) => s.id === it.value) ?? SKINS[0]
        marker(ctx, r.x + r.w - 150, cy, 13, 0, sk.colors[0])
        marker(ctx, r.x + r.w - 110, cy + 2, 13, 1, sk.colors[1])
        ctx.fillStyle = PALETTE.dim
        ctx.fillText(`${SKINS.indexOf(sk) + 1}/${SKINS.length}`, r.x + r.w - 190, cy)
      } else ctx.fillText(val, r.x + r.w - 64, cy)
      ctx.fillStyle = PALETTE.dim
      ctx.textAlign = 'center'
      ctx.fillText('›', r.x + r.w - 36, cy)
      if (it.id !== 'skin') ctx.fillText('‹', r.x + r.w - 84 - ctx.measureText(val).width - 4, cy)
      else ctx.fillText('‹', r.x + r.w - 260, cy)
    } else {
      ctx.textAlign = 'center'
      ctx.fillText(it.label, r.x + r.w / 2, cy)
    }
  })
  ctx.restore()
}

/** How to play, in the current input's words: [steer, flip]. */
function controlsHint() {
  if (input.mode === 'touch') return ['Slide to steer', `${input.label('a')} to flip`]
  if (input.mode === 'mouse') return ['Drag to steer', `${input.label('a')} to flip`]
  return [`${input.stickLabel()} to steer`, `${input.label('a')} to flip`]
}

function drawTitle() {
  const w = fit.w
  const safe = fit.safe
  const c = colors()
  const sy = titleShipY()
  const cx = w / 2
  // Rocks drifting at the sides.
  const rocksAt = [[-260, 0.08, 54, 3], [250, -0.02, 40, 9], [240, 0.3, 34, 4]]
  for (const [dx, fy, r, seed] of rocksAt) drawRock(ctx, cx + dx, sy + fit.h * fy + Math.sin(state.clock * 0.8 + seed) * 10, r, (title[`r${seed}`] ??= rockShape(r, seed)), state.clock * 0.3 + seed)
  // Trail and gate.
  const gy = title.gateY
  const tg = ctx.createLinearGradient(0, sy + 40, 0, sy + 520)
  tg.addColorStop(0, withAlpha(c[title.which], 0.5))
  tg.addColorStop(1, withAlpha(c[title.which], 0))
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = tg
  ctx.beginPath()
  ctx.moveTo(cx - 24, sy + 40)
  ctx.lineTo(cx + 24, sy + 40)
  ctx.lineTo(cx + 5, sy + 520)
  ctx.lineTo(cx - 5, sy + 520)
  ctx.fill()
  ctx.restore()
  const next = gy < sy ? 1 - title.which : title.which
  const mid = 220
  drawGate(ctx, gy, [{ x0: 0, x1: cx - mid / 2, which: 1 - next }, { x0: cx - mid / 2, x1: cx + mid / 2, which: next }, { x0: cx + mid / 2, x1: w, which: 1 - next }], { colors: c, t: state.clock, thick: 26 })
  drawShip(ctx, cx, sy + Math.sin(state.clock * 2) * 8, { colors: c, which: title.which, flip: title.flipT, scale: 2, t: state.clock, thrust: 1.5 })

  // Two-tone title, centred as a whole.
  const ty = safe.top + 150
  const px = Math.min(112, (w - 140) / 5.6)
  ctx.font = `900 ${Math.round(px)}px system-ui, sans-serif`
  const fw = ctx.measureText('FLIP').width
  const ww = ctx.measureText('WING').width
  const left = cx - (fw + ww + 12) / 2
  neonText('FLIP', left, ty, px, c[0], 'left')
  neonText('WING', left + fw + 12, ty, px, c[1], 'left')
  if (save.data.best > 0) {
    const text = `Best ${fmt(save.data.best)} · ${fmt(save.data.bestDist)} m`
    ctx.font = font(700, 34)
    const tw = ctx.measureText(text).width + 90
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.beginPath()
    ctx.roundRect(cx - tw / 2, ty + 90, tw, 62, 31)
    ctx.fill()
    ctx.fillStyle = '#FFD23C'
    ctx.fillText('★', cx - tw / 2 + 38, ty + 122)
    ctx.fillStyle = PALETTE.text
    ctx.fillText(text, cx + 18, ty + 122)
  }
  drawMenu(titleMenu)
  ctx.font = font(600, 34)
  ctx.fillStyle = PALETTE.dim
  const last = titleMenu.rect(titleMenu.items.length - 1)
  const hy = Math.min(fit.h - safe.bottom - 100, last.y + last.h + 80)
  const [steer, flipHint] = controlsHint()
  ctx.fillText(steer, cx, hy)
  ctx.fillText(input.mode === 'touch' ? flipHint : `${flipHint} · ${input.label('menu')} to pause`, cx, hy + 48)
}

const fmt = (n) => Math.floor(n).toLocaleString('en-US').replace(/,/g, ' ')

function drawPlay() {
  const o = ox()
  const sy = shipY()
  const c = colors()
  const s = state.ship
  const w = fit.w
  // Column edges, faint, so the play area reads on wide screens.
  if (o > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(0, 0, o, fit.h)
    ctx.fillRect(o + TUNING.column, 0, w - o - TUNING.column, fit.h)
  }
  for (const th of state.things) {
    if (th.y < -200 || th.y > fit.h + 120) continue
    if (th.kind === 'rock') drawRock(ctx, o + th.x, th.y, th.r, th.shape, th.angle)
    else if (th.kind === 'dust') {
      if (!th.taken) drawDust(ctx, o + th.x, th.y, state.clock)
    } else if (th.kind === 'gate') {
      const segs = th.segs.map((g, i) => ({ x0: o + g.x0 - (i === 0 ? o : 0), x1: o + g.x1 + (i === th.segs.length - 1 ? w - o - TUNING.column : 0), which: g.which, gone: g === th.shattered }))
      const visible = segs.filter((g) => !g.gone)
      // A swapping gate flickers a hint of its other colour before it changes.
      const tts = (sy - th.y) / state.speed
      const warn = th.swap && !th.swapped ? Math.max(0, Math.sin(state.clock * 22)) * Math.max(0, 1 - (tts - TUNING.swapLead) / 1.2) * 0.6 : 0
      drawGate(ctx, th.y, visible, { colors: c, t: state.clock, warn })
      if (th.swap && !th.swapped) for (const g of visible) marker(ctx, (g.x0 + g.x1) / 2, th.y - 52, 12, 1 - g.which, withAlpha(c[1 - g.which], 0.7))
    }
  }
  // Trail.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1]
    const b = trail[i]
    ctx.strokeStyle = withAlpha(b.c, 0.5 * (1 - i / trail.length))
    ctx.lineWidth = 16 * (1 - i / trail.length) + 2
    ctx.beginPath()
    ctx.moveTo(o + a.x, a.y)
    ctx.lineTo(o + b.x, b.y)
    ctx.stroke()
  }
  ctx.restore()
  if (state.dying <= 0) drawShip(ctx, o + s.x, sy, { colors: c, which: s.which, flip: s.flipT, bank: s.bank, t: state.clock, thrust: 1 + (state.speed - TUNING.startSpeed) / 700 })

  for (const pp of state.popups) {
    ctx.globalAlpha = Math.min(1, pp.t * 2)
    ctx.font = font(900, pp.size)
    ctx.fillStyle = pp.color
    ctx.fillText(pp.text, o + pp.x, pp.y)
    ctx.globalAlpha = 1
  }
  if (state.screen === 'playing' && state.dying <= 0) drawHints(o, sy)
  drawHud()
}

/** Teaching by doing: say how to flip while a wrong-coloured gate is coming in the first runs. */
function drawHints(o, sy) {
  const s = state.ship
  const c = colors()
  if (state.t < 3) {
    ctx.font = font(700, 40)
    ctx.fillStyle = withAlpha(PALETTE.text, Math.min(1, (3 - state.t) * 1.5))
    ctx.fillText(controlsHint()[0], fit.w / 2, sy - 200)
  }
  const teaching = state.gates < 3 && save.data.runs < 4
  if (!teaching) {
    if (state.banner) {
      const a = Math.min(1, state.banner.t * 2, (2.8 - state.banner.t) * 4)
      ctx.globalAlpha = a
      ctx.font = font(800, 34)
      ctx.fillStyle = c[1]
      ctx.fillText('NEW', fit.w / 2, fit.h * 0.3 - 56)
      neonText(state.banner.text, fit.w / 2, fit.h * 0.3, 54 * textScale(), c[0])
      ctx.font = font(600, 34)
      ctx.fillStyle = PALETTE.text
      ctx.fillText(state.banner.tip, fit.w / 2, fit.h * 0.3 + 60)
      ctx.globalAlpha = 1
    }
    return
  }
  const g = state.things.find((th) => th.kind === 'gate' && !th.passed && th.y < sy && th.y > -60)
  if (!g) return
  const seg = g.segs.find((q) => s.x >= q.x0 && s.x < q.x1)
  if (!seg || seg.which === s.which) return
  const y = Math.min(sy - 150, g.y + 140)
  ctx.font = font(800, 44)
  ctx.fillStyle = PALETTE.text
  ctx.fillText(`${input.label('a')} to flip`, fit.w / 2, y)
  ctx.font = font(600, 32)
  ctx.fillStyle = PALETTE.dim
  ctx.fillText('only your colour gets through', fit.w / 2, y + 48)
}

function drawHud() {
  const safe = fit.safe
  const c = colors()
  ctx.save()
  ctx.textAlign = 'left'
  ctx.fillStyle = PALETTE.text
  ctx.font = font(800, 56)
  ctx.fillText(fmt(state.score), safe.left + 32, safe.top + 64)
  ctx.font = font(600, 32)
  ctx.fillStyle = PALETTE.dim
  ctx.fillText(`${fmt(state.dist)} m`, safe.left + 34, safe.top + 116)
  if (state.mult > 1) {
    const x = fit.w / 2
    const y = safe.top + 64
    const pulse = 1 + Math.max(0, state.multT - TUNING.multHold + 0.3) * 0.8
    ctx.textAlign = 'center'
    ctx.font = font(900, 44 * pulse)
    ctx.fillStyle = c[1]
    ctx.fillText(`×${state.mult}`, x, y)
    const p = new Path2D()
    p.arc(x, y, 48, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * state.multT) / TUNING.multHold)
    glowStroke(ctx, p, c[1], 5, 0.6)
  }
  ctx.restore()
  if (state.screen === 'playing') {
    const b = pauseButton()
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath()
    ctx.roundRect(b.x, b.y, b.w, b.h, 16)
    ctx.fill()
    ctx.fillStyle = PALETTE.text
    ctx.fillRect(b.x + 21, b.y + 18, 8, 28)
    ctx.fillRect(b.x + 35, b.y + 18, 8, 28)
    if (input.mode !== 'touch' && state.t < 6) drawPrompts(ctx, input, [['a', 'Flip'], ['menu', 'Pause']], { x: fit.w / 2, y: fit.h - safe.bottom - 48, size: 34 * textScale() })
  }
}

function drawGameOver() {
  const w = fit.w
  const cx = w / 2
  const safe = fit.safe
  const c = colors()
  ctx.fillStyle = 'rgba(4,6,15,0.78)'
  ctx.fillRect(0, 0, w, fit.h)
  const top = Math.max(safe.top + 140, overMenu.rect(0).y - 640)
  ctx.font = font(700, 40)
  ctx.fillStyle = PALETTE.dim
  ctx.fillText('SCORE', cx, top)
  ctx.font = font(900, 120)
  ctx.fillStyle = PALETTE.text
  ctx.fillText(fmt(state.score), cx, top + 96)
  ctx.font = font(800, 40)
  if (state.newBest) {
    ctx.fillStyle = c[0]
    ctx.fillText('NEW BEST!', cx, top + 186)
  } else {
    ctx.fillStyle = PALETTE.dim
    ctx.fillText(`Best ${fmt(save.data.best)}`, cx, top + 186)
  }
  ctx.font = font(600, 34)
  ctx.fillStyle = PALETTE.dim
  ctx.fillText(`${fmt(state.dist)} m · ${state.gates} gates · best ×${state.bestMult}`, cx, top + 252)
  if (state.unlocked.length) {
    const sk = state.unlocked[state.unlocked.length - 1]
    const y = top + 300
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.beginPath()
    ctx.roundRect(cx - 280, y, 560, 150, 24)
    ctx.fill()
    drawShip(ctx, cx - 190, y + 78, { colors: sk.colors, which: Math.floor(state.clock * 1.5) % 2, t: state.clock })
    ctx.textAlign = 'left'
    ctx.font = font(800, 34)
    ctx.fillStyle = PALETTE.text
    ctx.fillText('New ship colours!', cx - 110, y + 52)
    ctx.font = font(700, 32)
    ctx.fillStyle = sk.colors[0]
    ctx.fillText(sk.name, cx - 110, y + 102)
    ctx.textAlign = 'center'
  } else {
    const nextSkin = SKINS.find((s) => s.unlock > save.data.best)
    if (nextSkin) {
      ctx.font = font(600, 32)
      ctx.fillStyle = PALETTE.dim
      ctx.fillText(`Next ship colours at ${fmt(nextSkin.unlock)}`, cx, top + 320)
    }
  }
  ctx.globalAlpha = state.overLock > 0 ? 0.4 : 1
  drawMenu(overMenu)
  ctx.globalAlpha = 1
}

/** ?debug: live state in the corner. */
function drawDebug() {
  ctx.save()
  ctx.font = '500 18px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.fillRect(8, fit.h - 140, 520, 130)
  ctx.fillStyle = '#9fe'
  const lines = [
    `screen ${state.screen}  mode ${input.mode}  fps ${fps.toFixed(0)}`,
    `space ${fit.w}x${fit.h}  dpr ${fit.dpr}  safe ${fit.safe.top.toFixed(0)}/${fit.safe.bottom.toFixed(0)}`,
    `t ${state.t.toFixed(1)}  speed ${state.speed.toFixed(0)}  stage ${state.stage}`,
    `things ${state.things.length}  particles ${particles.length}  mult ${state.mult} ${state.multT.toFixed(1)}`,
    `god ${god}  gates ${state.gates}  late ${state.lateFlips}`
  ]
  lines.forEach((l, i) => ctx.fillText(l, 16, fit.h - 132 + i * 24))
  ctx.restore()
}

let last = performance.now()
let fps = 60
function frame(now) {
  const dt = Math.min(1 / 20, (now - last) / 1000)
  last = now
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05
  input.update(dt)
  update(dt)
  draw()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
