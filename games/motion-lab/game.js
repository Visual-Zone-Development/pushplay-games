// Motion Lab: a hub of short motion-control stations played with a phone (or a stand-in).
// The phone joins through the party kit (controller.html is its screen); motion.js turns its
// tilt, swings and button into one interface that every station reads. The TV runs everything.
//
// Screens: title → lobby (connect a phone; A starts even without one) → playing (the station
// hub, or a station round) ↔ paused → gameover (results), plus settings.
import { input } from './input.js'
import { createMenu } from './menu.js'
import { fitCanvas } from './fit.js'
import { createAudio } from './audio.js'
import { createSave, createSettings } from './save.js'
import { createSettingsScreen } from './settings.js'
import { drawPrompts } from './prompts.js'
import { createParty } from './party.js'
import { createPartyLobby, drawJoinBadge } from './party-lobby.js'
import { createMotion } from './motion.js'
import { createSfx, createSequencer, loopSong } from './sfx.js'
import { C, W, H, MEDAL_NAMES, createFx, drawGrid, drawMedal, easeOutBack, finish, font, gloss, panel, phoneGlyph, rrect, setTextScale, text, clamp } from './gfx.js'
import { medalBy } from './stations/common.js'
import bench from './stations/bench.js'
import maze from './stations/maze.js'
import derby from './stations/derby.js'
import slash from './stations/slash.js'
import rhythm from './stations/rhythm.js'
import kart from './stations/kart.js'

const ID = 'motion-lab'

/** Every gameplay number. Stations read their own section. */
const TUNING = {
  readyTime: 2, // the countdown; stations with centerOnReady also take their centre during it
  motion: {
    tiltRange: 25, // degrees from neutral for full tilt (divided by the sensitivity setting)
    defaultBeta: 35,
    swingThresholds: [8, 12, 17], // m/s² for Low / Medium / High
    padPower: 0.8, // swing power for a button press
    swipeMin: 70, // px a mouse/touch drag needs to count as a swipe
    swipeFull: 2600, // px/s for a full-power swipe
    pingEvery: 1.0,
    filterMin: 1.6, // Hz: smoothing for slow, small movement (lower = steadier, but laggier)
    filterBeta: 0.6, // how quickly fast movement cuts through the smoothing
    wheelRange: 70, // degrees of wheel turn for full lock
    wheelFilter: 2.2, // Hz: the wheel is smoothed less than tilt, so steering stays quick
    centerWait: 1.5, // s to wait for a still phone before re-centering anyway
    clockSamples: 8, // clock checks kept; the fastest round trip of these sets the clock difference
    fullSwing: 32, // m/s² for a full-power swing
    dirDeadzone: 2, // m/s² of sideways push a swing needs to have a direction
    peakMs: 110, // longest a flick or shake can last
    flipWindowMs: 260, // longest a bat swing waits for its push-to-stop turn
    gyroSwingK: 1 / 30, // stations that count turning: 30 deg/s of turn = 1 m/s² of swing
    gyroTighten: 1.5, // deg/s: slower turns are scaled down (tremor, drift)
    gyroSmooth: [4, 12] // deg/s: turns slower than the first are smoothed, faster than the second are not
  },
  maze: { time: 90, accel: 1500, friction: 1.1, steer: 3.2, reverse: 2.5, brake: 7, maxSpeed: 720, radius: 15, bounce: 0.35, holeRadius: 17, levelScore: 100, gemScore: 25, medals: [250, 450, 650] },
  derby: { pitches: 10, waitTime: 1.1, windup: 0.55, flightStart: 1.15, flightEnd: 0.72, camera: 7, distance: 18, window: 0.24, sweet: 0.05, learn: 0.3, learnMax: 0.25, minDist: 30, maxDist: 165, fence: 110, foulAngle: 0.8, foulAt: 0.9, medals: [350, 700, 1000] },
  slash: { time: 60, spawnStart: 1.5, spawnEnd: 0.55, gravity: 620, doubleAfter: 22, goldChance: 0.08, points: 10, comboStep: 5, medals: [250, 550, 900] },
  rhythm: { bpm: 104, bars: 30, countIn: 8, speed: 430, perfect: 0.09, good: 0.18, bigPower: 0.5, learn: 0.25, medals: [0.55, 0.75, 0.9] },
  kart: { time: 75, maxSpeed: 330, minSpeed: 90, accel: 260, brake: 480, grassSpeed: 0.45, grassDrag: 3, turn: 3.1, turnFull: 190, brakeTurn: 1.35, steerEase: 12, grip: 7, gripGrass: 2.5, width: 110, coinGroups: 6, coinRadius: 26, coinScore: 10, lapScore: 100, medals: [500, 800, 1100] }
}
const STATIONS = [bench, maze, derby, slash, rhythm, kart]
for (const s of STATIONS) {
  s.medals = TUNING[s.id]?.medals ?? []
  s.medalFor ??= (score) => medalBy(s.medals)(score)
}

const canvas = document.getElementById('game')
const fit = fitCanvas(canvas, { w: W, h: H, maxDpr: 2, integer: false, letterbox: C.bg })
const ctx = fit.ctx
input.attach(canvas, W, H)
input.extendKeys({ KeyR: 'y' })

const settings = createSettings(ID, { tiltSensitivity: 1, swingThreshold: 1, invertSwipes: false })
const save = createSave(ID, 1, { best: {}, medals: {}, plays: {}, neutral: null })
const audio = createAudio({ settings })
const sfx = createSfx(audio)
const seq = createSequencer(audio)
const fx = createFx(settings)

// Menu input: the machine's own controls plus the phone's menu buttons (D-pad, OK, Back,
// Pause), so the whole game can be run from the phone. Gameplay still reads input and motion.
const NAV = new Set(['up', 'down', 'left', 'right', 'a', 'b', 'menu'])
const phoneNav = new Set()
let navNow = new Set()
let phonePick = null
let pickQueued = null
let phoneChoice = null
let chooseQueued = null
/** A menu item the phone tapped directly, if it's in this menu and enabled. */
const tapped = (menu) => (phoneChoice && menu.items.some((it) => it.id === phoneChoice && !it.disabled) ? phoneChoice : null)
const ui = Object.create(input, {
  navX: { get: () => input.navX || (navNow.has('right') ? 1 : navNow.has('left') ? -1 : 0) },
  navY: { get: () => input.navY || (navNow.has('down') ? 1 : navNow.has('up') ? -1 : 0) },
  pressed: { value: (b) => input.pressed(b) || navNow.has(b) }
})

const party = createParty({ input, minPlayers: 0, maxPlayers: 2, localPlayers: false })
const lobby = createPartyLobby(party, ui, { title: 'Connect your phone', accent: C.orange, ink: C.ink, quiet: C.quiet, panel: 'rgba(15,22,48,0.55)' })

const state = {
  screen: 'title', // title | lobby | playing | paused | settings | gameover
  from: 'title',
  resumeTo: 'playing',
  lobbyFrom: 'title',
  station: null, // the station being played; null on the hub
  run: null,
  ready: 0,
  hubSel: 1,
  results: null,
  t: 0
}
const motion = createMotion({ party, input, settings, save, TUNING, sfx, isBlocked: () => state.screen !== 'playing' || state.ready > 0 })
window.__game = { state, TUNING, party, motion, settings, save, get titleMenu() { return titleMenu }, start: (id) => startStation(STATIONS.find((s) => s.id === id)) }
const debug = new URLSearchParams(location.search).has('debug')
const env = { motion, sfx, fx, input, settings, save, audio, seq, TUNING }

const titleMenu = createMenu(
  [
    { id: 'play', label: 'Play' },
    { id: 'settings', label: 'Settings' }
  ],
  { y: 470, width: 380, accent: C.orange }
)
const pauseMenu = createMenu(
  [
    { id: 'resume', label: 'Resume' },
    { id: 'restart', label: 'Restart' },
    { id: 'settings', label: 'Settings' },
    { id: 'stations', label: 'Stations' },
    { id: 'title', label: 'Quit to title' }
  ],
  { y: 250, accent: C.orange }
)
const resultsMenu = createMenu(
  [
    { id: 'retry', label: 'Retry' },
    { id: 'stations', label: 'Stations' }
  ],
  { y: 580, width: 320, accent: C.orange }
)
const settingsScreen = createSettingsScreen({
  settings,
  audio,
  y: 130,
  extra: [
    { id: 'tiltSensitivity', label: 'Tilt sensitivity', type: 'range', value: 1, min: 0.5, max: 2, step: 0.25, format: (v) => `${v}×` },
    {
      id: 'swingThreshold',
      label: 'Swing needed',
      type: 'choice',
      value: 1,
      options: [
        { value: 0, label: 'Gentle' },
        { value: 1, label: 'Medium' },
        { value: 2, label: 'Hard' }
      ]
    },
    { id: 'invertSwipes', label: 'Invert swipe directions', type: 'toggle', value: false }
  ]
})

const PAUSE_BUTTON = { x: W - 84, y: 22, w: 60, h: 60 }
const LOBBY_START = { x: 900, y: 630, w: 310, h: 64 }
const LOBBY_BACK = { x: 560, y: 630, w: 310, h: 64 }
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

// Hub: the six stations, then Connect phone and Settings, in a 4 × 2 grid.
const TILES = [...STATIONS.map((s) => ({ id: s.id, station: s })), { id: 'phone' }, { id: 'settings' }]
const TILE = { w: 270, h: 250, gap: 24, x0: 64, y0: 170 }
const tileRect = (i) => ({ x: TILE.x0 + (i % 4) * (TILE.w + TILE.gap), y: TILE.y0 + Math.floor(i / 4) * (TILE.h + TILE.gap), w: TILE.w, h: TILE.h })

input.onPause(() => {
  if (state.screen === 'playing' || state.screen === 'lobby') pause()
  save.save()
})

party.on('join', () => sfx.join())
party.on('msg', ({ from, data }) => {
  // Any connected phone can work the menus (not only the one doing the motion).
  if (party.player(from)?.kind !== 'phone' || !data) return
  if (NAV.has(data.nav)) phoneNav.add(data.nav)
  if (typeof data.pick === 'string') pickQueued = data.pick
  if (typeof data.choose === 'string') chooseQueued = data.choose
})
party.on('msg', ({ from, data }) => {
  // The first phone's Start button in the lobby is handled by party-lobby; nothing else to do.
  if (data?.center && from === motion.activeId) party.view(from).n = { ...motion.neutral }
})

// ---- flow ----------------------------------------------------------------------------------

function openLobby(from) {
  state.lobbyFrom = from
  lobby.open()
  state.screen = 'lobby'
}
function pause() {
  state.resumeTo = state.screen
  pauseMenu.items[1].disabled = !state.run
  pauseMenu.select('resume')
  state.screen = 'paused'
  party.public.paused = true
  save.save()
}
function resume() {
  state.screen = state.resumeTo
  party.public.paused = false
}
function openSettings(from) {
  state.from = from
  state.screen = 'settings'
}
function toHub() {
  motion.tune = { scale: 1, cd: 200 }
  state.station = null
  state.run = null
  state.screen = 'playing'
  party.public.paused = false
  fx.reset()
  seq.play(loopSong(sfx, { bpm: 108, root: 50 }))
}
function startStation(station) {
  state.station = station
  motion.tune = { scale: 1, cd: 200, ...station.swing }
  fx.reset()
  state.run = station.create(env)
  state.ready = station.noScore ? 0 : TUNING.readyTime
  // Stations that need a fresh centre take it from how the phone is held during the countdown.
  if (station.centerOnReady && state.ready > 0) motion.center()
  state.screen = 'playing'
  party.public.paused = false
  save.data.plays[station.id] = (save.data.plays[station.id] ?? 0) + 1
  seq.stop()
  if (station.music) seq.play(loopSong(sfx, station.music))
  sfx.pick()
}
function finishStation() {
  const s = state.station
  const run = state.run
  const score = Math.round(run.score)
  const medal = s.medalFor(score, run)
  const prevBest = save.data.best[s.id] ?? 0
  const isBest = score > prevBest
  if (isBest) save.data.best[s.id] = score
  save.data.medals[s.id] = Math.max(save.data.medals[s.id] ?? 0, medal)
  save.save()
  state.results = { score, medal, best: Math.max(score, prevBest), prevBest, isBest, stats: run.stats(), t: 0, sounded: false }
  resultsMenu.select('retry')
  state.screen = 'gameover'
  seq.stop()
  motion.buzz(medal ? 80 : 30)
}

// ---- update --------------------------------------------------------------------------------

function update(dt) {
  state.t += dt
  party.update()
  navNow = new Set(phoneNav)
  phoneNav.clear()
  phonePick = pickQueued
  pickQueued = null
  phoneChoice = chooseQueued
  chooseQueued = null
  motion.update(dt)
  setTextScale(settings.data.textScale)
  publish()

  switch (state.screen) {
    case 'title': {
      const choice = tapped(titleMenu) ?? titleMenu.update(ui, dt)
      if (choice === 'play') {
        sfx.pick()
        if (party.code) toHub()
        else openLobby('title')
      }
      if (choice === 'settings') openSettings('title')
      break
    }
    case 'settings':
      if (settingsScreen.update(ui, dt) === 'back') state.screen = state.from
      break
    case 'lobby': {
      if (ui.pressed('menu')) {
        pause()
        break
      }
      // From the hub, Back returns there and keeps the phone connected.
      if (state.lobbyFrom === 'hub' && ui.pressed('b')) {
        delete party.public.lobby
        state.screen = 'playing'
        break
      }
      // The kit's lobby starts on A; these buttons make it work by mouse and touch too.
      const p = input.pointer
      if (p.released && inside(p, LOBBY_START)) {
        delete party.public.lobby
        toHub()
        break
      }
      if (p.released && inside(p, LOBBY_BACK)) {
        delete party.public.lobby
        if (state.lobbyFrom === 'hub') state.screen = 'playing'
        else {
          party.close()
          state.screen = 'title'
        }
        break
      }
      const result = lobby.update()
      if (result === 'start') toHub()
      if (result === 'back') state.screen = 'title'
      break
    }
    case 'paused': {
      const choice = tapped(pauseMenu) ?? pauseMenu.update(ui, dt)
      if (choice === 'resume' || choice === 'back') resume()
      if (choice === 'restart' && state.station) startStation(state.station)
      if (choice === 'settings') openSettings('paused')
      if (choice === 'stations') toHub()
      if (choice === 'title') {
        state.station = state.run = null
        party.public.paused = false
        seq.stop()
        state.screen = 'title'
      }
      break
    }
    case 'gameover': {
      state.results.t += dt
      fx.update(dt)
      if (!state.results.sounded && state.results.t > 0.9) {
        state.results.sounded = true
        sfx.medal(state.results.medal)
        if (state.results.medal === 3) fx.burst(W / 2, 250, C.gold, 40, 600)
      }
      const choice = tapped(resultsMenu) ?? resultsMenu.update(ui, dt)
      if (choice === 'retry') startStation(state.station)
      if (choice === 'stations' || choice === 'back') toHub()
      break
    }
    case 'playing':
      playUpdate(dt)
      break
  }
  canvas.style.cursor = state.screen === 'playing' && state.run && !state.station?.noScore && input.mode === 'mouse' ? 'none' : ''
}

function playUpdate(dt) {
  if (input.pointer.pressed && inside(input.pointer, PAUSE_BUTTON)) input.requestMenu()
  if (ui.pressed('menu')) return pause()
  seq.update(dt)
  if (input.pressed('y')) motion.center()
  if (!state.run) return hubUpdate(dt)

  if (fx.stop > 0) {
    fx.stop -= dt
    return
  }
  fx.update(dt)
  if (state.ready > 0) {
    const before = state.ready
    state.ready -= dt
    if (before > 0.4 && state.ready <= 0.4) {
      sfx.note(84, { dur: 0.2, type: 'square', gain: 0.14 })
      if (state.station.centerOnReady) motion.centerFinish()
    }
    else if (Math.ceil(before * 2) !== Math.ceil(state.ready * 2) && state.ready > 0.4) sfx.tick()
    return
  }
  state.run.update(dt)
  if (state.station.noScore && ui.pressed('b')) return toHub()
  if (state.run.done) finishStation()
}

function hubUpdate() {
  let sel = state.hubSel
  if (ui.navX) sel = (sel + ui.navX + 8) % 8
  if (ui.navY) sel = (sel + ui.navY * 4 + 8) % 8
  const p = input.pointer
  let chosen = ui.pressed('a') ? sel : -1
  const picked = TILES.findIndex((t) => t.id === phonePick)
  if (picked >= 0) chosen = sel = picked
  if (p.active) {
    const over = TILES.findIndex((_, i) => inside(p, tileRect(i)))
    if (over >= 0 && (input.mode === 'mouse' || p.pressed)) sel = over
    if (p.released && over >= 0) chosen = over
  }
  if (sel !== state.hubSel) {
    state.hubSel = sel
    sfx.move()
  }
  if (ui.pressed('b')) {
    sfx.back()
    seq.stop()
    state.screen = 'title'
    return
  }
  if (chosen < 0) return
  state.hubSel = chosen
  const tile = TILES[chosen]
  if (tile.station) startStation(tile.station)
  else if (tile.id === 'phone') {
    sfx.pick()
    openLobby('hub')
  } else if (tile.id === 'settings') openSettings('playing')
}

/** What the phone shows: the station, its hint and its button. */
function publish() {
  const s = state.screen === 'playing' || state.screen === 'paused' || state.screen === 'gameover' ? state.station : null
  party.public.title = s ? s.name : state.screen === 'playing' ? 'Choose a station' : 'Motion Lab'
  party.public.hint = s ? s.phoneHint : 'Hold the phone in portrait, screen facing you.'
  party.public.btn = s && state.screen === 'playing' ? s.btn ?? null : null
  // 'play' during a round (motion, station button, Pause); 'menu' everywhere else (D-pad, OK, Back).
  const round = state.screen === 'playing' && state.run
  party.public.mode = round ? (state.station.noScore ? 'bench' : 'play') : 'menu'
  // Title, pause and results menus also appear on the phone as buttons to tap.
  const menu = { title: titleMenu, paused: pauseMenu, gameover: resultsMenu }[state.screen]
  party.public.menu = menu ? { heading: { title: 'Motion Lab', paused: 'Paused', gameover: 'Round over' }[state.screen], items: menu.items.filter((it) => !it.disabled).map((it) => ({ id: it.id, label: it.label })), sel: menu.selected?.id } : null
  party.public.picks = state.screen === 'playing' && !state.run ? STATIONS.map((st) => ({ id: st.id, name: st.name, medal: save.data.medals[st.id] ?? 0 })) : null
  if (motion.activeId) party.view(motion.activeId).n = { ...motion.neutral }
}

// ---- draw ----------------------------------------------------------------------------------

let finished = false // a round applies the finishing pass under its HUD, so it stays crisp
function draw() {
  finished = false
  ctx.save()
  drawGrid(ctx, state.t)
  switch (state.screen) {
    case 'title':
      drawTitle()
      break
    case 'settings':
      drawGrid(ctx, state.t)
      settingsScreen.draw(ctx, { font: font(700, 26), titleFont: font(900, 52), color: C.ink })
      break
    case 'lobby':
      lobby.draw(ctx, W, H)
      drawJoinSteps()
      break
    case 'gameover':
      drawResults()
      break
    default:
      drawPlay()
      if (state.screen === 'paused') {
        ctx.fillStyle = 'rgba(10,15,34,0.8)'
        ctx.fillRect(0, 0, W, H)
        text(ctx, 'Paused', W / 2, 160, { size: 64, weight: 900, outline: 10 })
        pauseMenu.draw(ctx, font(700, 30))
      }
  }
  ctx.restore()
  if (!finished) finish(ctx)
  if (debug) drawDebug()
}

function drawTitle() {
  const t = state.t
  // A phone swinging back and forth, with motion arcs.
  const rot = Math.sin(t * 2.2) * 0.45
  ctx.save()
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = [C.teal, C.pink, C.lime][i]
    ctx.globalAlpha = 0.85 - i * 0.2
    ctx.beginPath()
    ctx.arc(W / 2, 330, 150 + i * 34, -Math.PI / 2 - 0.55 + rot * 0.6, -Math.PI / 2 + 0.55 + rot * 0.6)
    ctx.stroke()
  }
  ctx.restore()
  phoneGlyph(ctx, W / 2, 250, 90, 160, { rot, screen: C.orange })
  text(ctx, 'MOTION LAB', W / 2, 120, { size: 96, weight: 900, outline: 16, color: C.ink })
  text(ctx, 'Six stations to test your phone as a motion controller', W / 2, 375, { size: 26, weight: 700, color: C.quiet })
  titleMenu.draw(ctx, font(800, 32))
  drawPhoneChip(W / 2 - 230, 640)
  text(ctx, 'Also plays with a controller, keyboard, mouse or touch', W / 2, 712, { size: 22, weight: 600, color: C.quiet })
  drawPrompts(ctx, input, [['a', 'Choose'], ['menu', 'Pause in game']], { y: 760, size: 24 * settings.data.textScale, color: C.ink })
}

/** The empty side of the lobby: how to connect, and how the phone is doing. */
function drawJoinSteps() {
  if (!party.code) return
  const x = 560
  const steps = ['Scan the QR code (or open the address, type the code)', 'On iPhone, tap "Allow motion controls"', 'Hold the phone in portrait, screen facing you']
  steps.forEach((s, i) => {
    const y = 330 + i * 64
    gloss(ctx, x + 20, y, 20, [C.orange, C.teal, C.lime][i], { edge: 3, shine: 0.6 })
    text(ctx, String(i + 1), x + 20, y + 1, { size: 24, weight: 900, color: C.dark })
    text(ctx, s, x + 54, y, { size: 22, weight: 700, align: 'left' })
  })
  phoneGlyph(ctx, 1150, 520, 60, 106, { rot: Math.sin(state.t * 2) * 0.3, screen: motion.phone ? C.lime : C.orange })
  drawPhoneChip(x, 524)
  text(ctx, state.lobbyFrom === 'hub' ? 'Phones can join or swap any time' : 'No phone? Start anyway: every station has a stand-in', x, 588, { size: 20, weight: 600, align: 'left', color: C.quiet })
  for (const [r, label, fill] of [
    [LOBBY_BACK, 'Back', C.panelHi],
    [LOBBY_START, state.lobbyFrom === 'hub' ? 'Done' : 'Start', C.orange]
  ]) {
    panel(ctx, r.x, r.y, r.w, r.h, { fill, r: 16, lw: 4 })
    text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, { size: 28, weight: 800, color: fill === C.orange ? C.dark : C.ink })
  }
}

/** Which phone is connected and whether its sensors work. */
function drawPhoneChip(x, y) {
  const p = motion.phone
  const states = {
    on: ['motion on', C.lime],
    touch: ['no sensors: touch pad', C.pink],
    ask: ['tap Allow on the phone', C.gold],
    waiting: ['starting sensors…', C.gold],
    none: ['away', C.pink]
  }
  if (motion.touchWhy === 'insecure') states.touch = ['no sensors over http: touch pad', C.pink]
  const [label, color] = p ? (motion.centering ? ['hold still: centering…', C.gold] : states[motion.phoneState] ?? [motion.phoneState, C.gold]) : [state.screen === 'lobby' ? 'Waiting for a phone…' : 'No phone yet: connect one from Play', C.quiet]
  panel(ctx, x, y - 26, 460, 52, { r: 26, lw: 4 })
  ctx.fillStyle = p ? color : C.panelHi
  ctx.beginPath()
  ctx.arc(x + 28, y, 11, 0, Math.PI * 2)
  ctx.fill()
  text(ctx, p ? `${p.name}: ${label}` : label, x + 50, y + 1, { size: 22, weight: 700, align: 'left', color: C.ink })
}

function drawPlay() {
  if (!state.run) drawHub()
  else {
    ctx.save()
    fx.applyShake(ctx)
    state.run.draw(ctx)
    fx.draw(ctx)
    ctx.restore()
    fx.drawFlash(ctx)
    finish(ctx)
    finished = true
    drawHud()
    if (state.ready > 0) {
      const go = state.ready <= 0.4
      const k = go ? 1 + (0.4 - state.ready) * 1.5 : 1
      ctx.fillStyle = 'rgba(10,15,34,0.45)'
      ctx.fillRect(0, 0, W, H)
      text(ctx, go ? 'GO!' : 'READY', W / 2, H / 2 - 40, { size: 120 * k, weight: 900, outline: 18, color: go ? C.lime : C.ink })
      text(ctx, state.station.centerOnReady && motion.phoneLive ? state.station.centerOnReady : state.station.howTo(input), W / 2, H / 2 + 60, { size: 30, weight: 700, outline: 8 })
    }
  }
  drawPauseButton()
}

function drawHud() {
  const s = state.station
  const run = state.run
  panel(ctx, 16, 16, W - 120, 72, { fill: 'rgba(10,15,34,0.82)', r: 20, lw: 0 })
  s.icon(ctx, 54, 52, 44)
  text(ctx, s.name, 88, 52, { size: 30, weight: 800, align: 'left' })
  if (!s.noScore) text(ctx, `${Math.round(run.score)}`, W / 2, 52, { size: 42, weight: 900, color: C.gold, outline: 8 })
  const right = run.hudRight?.() ?? (run.timeLeft !== undefined ? `${Math.ceil(Math.max(0, run.timeLeft))}s` : '')
  if (right) text(ctx, right, W - 130, 52, { size: 32, weight: 800, align: 'right', color: run.timeLeft !== undefined && run.timeLeft < 10 ? C.pink : C.ink })
  // Where the motion is coming from, so testing is never a guess.
  const src = motion.source === 'phone' ? (motion.phoneState === 'touch' ? 'phone touch pad' : 'phone motion') : input.mode === 'gamepad' ? 'controller' : input.mode
  text(ctx, src, W / 2 + 110, 52, { size: 18, weight: 700, align: 'left', color: C.quiet })
  const prompts = run.prompts?.(input) ?? []
  if (prompts.length) drawPrompts(ctx, input, prompts, { y: H - 30, size: 22 * settings.data.textScale, color: C.ink })
}

function drawPauseButton() {
  const b = PAUSE_BUTTON
  panel(ctx, b.x, b.y, b.w, b.h, { fill: C.panelHi, r: 16, lw: 4 })
  ctx.fillStyle = C.ink
  ctx.fillRect(b.x + 19, b.y + 17, 8, 26)
  ctx.fillRect(b.x + 33, b.y + 17, 8, 26)
}

function drawHub() {
  text(ctx, 'Choose a station', 64, 70, { size: 48, weight: 900, align: 'left', outline: 10 })
  drawPhoneChip(560, 70)
  TILES.forEach((tile, i) => {
    const r = tileRect(i)
    const on = i === state.hubSel
    const lift = on ? -8 : 0
    const s = tile.station
    panel(ctx, r.x, r.y + lift, r.w, r.h, { fill: on ? C.panelHi : C.panel, stroke: on ? C.orange : C.dark, lw: on ? 6 : 5 })
    if (s) {
      s.icon(ctx, r.x + r.w / 2, r.y + 84 + lift, 96)
      text(ctx, s.name, r.x + r.w / 2, r.y + 162 + lift, { size: 28, weight: 800 })
      text(ctx, s.blurb, r.x + r.w / 2, r.y + 194 + lift, { size: 19, weight: 600, color: C.quiet })
      if (!s.noScore) {
        drawMedal(ctx, r.x + 34, r.y + 34 + lift, 18, save.data.medals[s.id] ?? 0)
        const best = save.data.best[s.id]
        if (best !== undefined) text(ctx, `Best ${s.format ? s.format(best) : best}`, r.x + r.w / 2, r.y + 225 + lift, { size: 19, weight: 700, color: C.gold })
      }
    } else if (tile.id === 'phone') {
      phoneGlyph(ctx, r.x + r.w / 2, r.y + 84 + lift, 52, 90, { screen: motion.phone ? C.lime : C.quiet })
      text(ctx, motion.phone ? 'Phones' : 'Connect phone', r.x + r.w / 2, r.y + 162 + lift, { size: 28, weight: 800 })
      text(ctx, 'QR code and room code', r.x + r.w / 2, r.y + 194 + lift, { size: 19, weight: 600, color: C.quiet })
    } else {
      drawCog(r.x + r.w / 2, r.y + 84 + lift, 40)
      text(ctx, 'Settings', r.x + r.w / 2, r.y + 162 + lift, { size: 28, weight: 800 })
      text(ctx, 'Sensitivity, volume', r.x + r.w / 2, r.y + 194 + lift, { size: 19, weight: 600, color: C.quiet })
    }
  })
  drawJoinBadge(ctx, party, 1040, 720)
  drawPrompts(ctx, input, [['a', 'Choose'], ['b', 'Title'], ['menu', 'Pause']], { y: 760, size: 24 * settings.data.textScale, color: C.ink })
}

function drawCog(x, y, r) {
  ctx.save()
  ctx.translate(x, y)
  const spin = state.t * 0.5
  ctx.rotate(spin)
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4)
    ctx.rect(-r * 0.2, -r * 1.1, r * 0.4, r * 0.5)
  }
  ctx.moveTo(r * 0.8, 0)
  ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2)
  ctx.lineWidth = 5
  ctx.strokeStyle = C.dark
  ctx.stroke()
  // brushed metal lit from the world's upper left, whatever the spin
  ctx.rotate(-spin)
  const metal = ctx.createLinearGradient(-r, -r, r * 0.5, r)
  metal.addColorStop(0, '#e4e9fb')
  metal.addColorStop(0.5, C.quiet)
  metal.addColorStop(1, '#5a6596')
  ctx.fillStyle = metal
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2)
  ctx.fillStyle = C.panel
  ctx.fill()
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.restore()
}

function drawResults() {
  const r = state.results
  const s = state.station
  const k = clamp(r.t / 0.9, 0, 1)
  ctx.fillStyle = 'rgba(10,15,34,0.5)'
  ctx.fillRect(0, 0, W, H)
  panel(ctx, 240, 60, 800, 670, { fill: C.panel })
  s.icon(ctx, 320, 130, 64)
  text(ctx, `${s.name}: results`, 370, 130, { size: 40, weight: 900, align: 'left' })
  const shown = Math.round(r.score * k)
  text(ctx, s.format ? s.format(shown) : `${shown}`, W / 2, 245, { size: 96, weight: 900, color: C.gold, outline: 12 })
  if (r.t > 0.9) {
    const m = easeOutBack(clamp((r.t - 0.9) / 0.4, 0, 1))
    drawMedal(ctx, 880, 245, 56 * m, r.medal)
    text(ctx, MEDAL_NAMES[r.medal], 880, 325, { size: 24, weight: 800, color: r.medal ? C.ink : C.quiet })
  }
  const best = s.format ? s.format(r.best) : r.best
  if (r.isBest && r.t > 0.9) text(ctx, 'NEW BEST!', W / 2, 330, { size: 36, weight: 900, color: C.lime, outline: 8 })
  else {
    const gap = r.prevBest - r.score
    text(ctx, gap > 0 && gap <= r.prevBest * 0.1 ? `So close: ${s.format ? s.format(gap) : gap} from your best (${best})` : `Best ${best}`, W / 2, 330, { size: 28, weight: 700, color: C.quiet })
  }
  const next = s.medals.find((m) => m > (s.medalValue ? s.medalValue(r.score, state.run) : r.score))
  if (next !== undefined && r.medal < 3) text(ctx, `${MEDAL_NAMES[r.medal + 1]} at ${s.medalLabel ? s.medalLabel(next) : next}`, W / 2, 372, { size: 22, weight: 600, color: C.quiet })
  r.stats.forEach(([label, value], i) => {
    const y = 412 + i * 34
    text(ctx, label, 400, y, { size: 26, weight: 600, align: 'left', color: C.quiet })
    text(ctx, String(value), 880, y, { size: 26, weight: 800, align: 'right' })
  })
  resultsMenu.draw(ctx, font(800, 30))
  fx.draw(ctx)
  drawPrompts(ctx, input, [['a', 'Choose'], ['b', 'Stations']], { y: 770, size: 22 * settings.data.textScale, color: C.ink })
}

function drawDebug() {
  ctx.save()
  ctx.font = '500 16px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(8, H - 128, 520, 120)
  ctx.fillStyle = '#9fe'
  const lines = [
    `screen ${state.screen}  station ${state.station?.id ?? '-'}  mode ${input.mode}  fps ${fps.toFixed(0)}`,
    `party ${party.status} ${party.code ?? ''}  players ${party.players.length}  active ${motion.activeId ?? '-'}`,
    `phone ${motion.phoneState}  src ${motion.source}  hz ${motion.hz.toFixed(0)}  rtt ${(motion.rtt * 1000).toFixed(0)}ms`,
    `tilt ${motion.tilt.x.toFixed(2)},${motion.tilt.y.toFixed(2)}  raw b ${motion.raw.b} g ${motion.raw.g} m ${motion.raw.m}`,
    `pointer ${input.pointer.type} ${input.pointer.down ? 'down' : 'up'} ${input.pointer.active ? 'active' : ''}  particles ${fx.parts.length}  scale ${fit.scale.toFixed(2)} dpr ${fit.dpr}`
  ]
  lines.forEach((l, i) => ctx.fillText(l, 16, H - 120 + i * 22))
  ctx.restore()
}

let last = performance.now()
let fps = 60
function frame(nowMs) {
  const dt = Math.min(1 / 20, (nowMs - last) / 1000)
  last = nowMs
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05
  input.update(dt)
  update(dt)
  draw()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
