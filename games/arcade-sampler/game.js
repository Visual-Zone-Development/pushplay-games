// Arcade Sampler: twelve small, complete games in one cabinet, each a different genre in a
// different art style. This file is the hub: title, the cabinet hall, a ready screen, pause,
// results, settings, saves and medals. Each game is a module in games/ (see games/README.md for
// the interface) and only plays; the hub owns everything around it.
import { input } from './input.js'
import { createMenu } from './menu.js'
import { fitCanvas } from './fit.js'
import { createAudio } from './audio.js'
import { createSave, createSettings } from './save.js'
import { createSettingsScreen } from './settings.js'
import { drawPrompts } from './prompts.js'
import { createMusic } from './music.js'
import { W, H, TAU, clamp, label, drawMedal, medalFor, MEDAL_COLORS, MEDAL_NAMES } from './common.js'
import starCourier from './games/star-courier.js'
import hopGarden from './games/hop-garden.js'
import mergeJars from './games/merge-jars.js'
import tinyTactics from './games/tiny-tactics.js'
import keyhole from './games/keyhole.js'
import neonRing from './games/neon-ring.js'
import miniPutt from './games/mini-putt.js'
import rooftopRun from './games/rooftop-run.js'
import lazyLake from './games/lazy-lake.js'
import tinyTowers from './games/tiny-towers.js'
import letterDrop from './games/letter-drop.js'
import sunsetDrift from './games/sunset-drift.js'

const ID = 'arcade-sampler'
const GAMES = [starCourier, hopGarden, rooftopRun, mergeJars, letterDrop, tinyTactics, tinyTowers, keyhole, neonRing, miniPutt, lazyLake, sunsetDrift]
/** The hub's numbers; each game's own TUNING is under its id. */
const TUNING = { readyTime: 1.6, ...Object.fromEntries(GAMES.map((g) => [g.id, g.TUNING])) }
const C = { bg: '#140f2e', bg2: '#22184d', ink: '#f6f1ff', quiet: '#a79fd0', dark: '#0a0718', gold: '#ffd23f', pink: '#ff5c8a', teal: '#2ad1c9' }

const canvas = document.getElementById('game')
const fit = fitCanvas(canvas, { w: W, h: H, letterbox: C.bg })
const ctx = fit.ctx
input.attach(canvas, W, H)

// Bundled fonts (OFL, assets/CREDITS.md); text falls back to system fonts until they load.
for (const [family, file, weight] of [
  ['Lilita One', 'lilita-one', 400],
  ['Rubik', 'rubik-700', 700],
  ['Rubik', 'rubik-900', 900],
  ['Press Start 2P', 'press-start-2p', 400],
  ['Bungee', 'bungee', 400],
  ['EB Garamond', 'eb-garamond-600', 600]
]) {
  const face = new FontFace(family, `url(./assets/fonts/${file}.woff2)`, { weight: String(weight) })
  face.load().then((f) => document.fonts.add(f), () => {})
}
const settings = createSettings(ID)
const audio = createAudio({ settings })
const music = createMusic(audio)
const save = createSave(ID, 1, { best: {}, medals: {}, plays: {}, games: {} })
const font = (weight, px, family = 'Rubik') => `${weight} ${Math.round(px * (settings.data.textScale ?? 1))}px "${family}", system-ui, sans-serif`
const sfx = {
  move: () => audio.tone({ freq: 520, dur: 0.04, type: 'triangle', gain: 0.1 }),
  pick: () => audio.tone({ freq: 660, dur: 0.1, slide: 300, gain: 0.14 }),
  tick: () => audio.tone({ freq: 880, dur: 0.05, type: 'square', gain: 0.08 }),
  go: () => audio.tone({ freq: 1320, dur: 0.18, type: 'square', gain: 0.1 }),
  medal: (level) => [0, 4, 7, 12, 16].slice(0, 2 + level).forEach((s, i) => audio.tone({ freq: 523 * 2 ** (s / 12), dur: 0.18, type: 'square', gain: 0.1, delay: i * 0.09 }))
}

const state = {
  screen: 'title', // title | playing | paused | settings | gameover ('playing' with no run = the hub)
  from: 'title',
  game: null, // the module being played
  run: null,
  ready: 0,
  sel: 0,
  result: null,
  t: 0
}
window.__game = { state, TUNING, save, settings, GAMES, get titleMenu() { return titleMenu }, start: (id) => start(GAMES.find((g) => g.id === id)) }
const debug = new URLSearchParams(location.search).has('debug')

const titleMenu = createMenu(
  [
    { id: 'play', label: 'Play' },
    { id: 'settings', label: 'Settings' }
  ],
  { y: 560 }
)
const pauseMenu = createMenu(
  [
    { id: 'resume', label: 'Resume' },
    { id: 'restart', label: 'Restart' },
    { id: 'settings', label: 'Settings' },
    { id: 'hub', label: 'Back to the arcade' },
    { id: 'title', label: 'Quit to title' }
  ],
  { y: 300 }
)
const overMenu = createMenu(
  [
    { id: 'again', label: 'Play again' },
    { id: 'hub', label: 'Back to the arcade' }
  ],
  { y: 620 }
)
const settingsScreen = createSettingsScreen({ settings, audio })

const PAUSE_BUTTON = { x: W - 88, y: 24, w: 56, h: 56 }
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

input.onPause(() => {
  if (state.screen === 'playing') pause()
  save.save()
})

// ---- flow --------------------------------------------------------------------------------------

/** What a game gets to work with. */
function env(game) {
  save.data.games[game.id] ??= {}
  return { input, audio, music, settings, font, store: save.data.games[game.id], saveNow: () => save.save(), TUNING: TUNING[game.id] }
}
function start(game) {
  state.game = game
  state.run = game.create(env(game))
  state.ready = TUNING.readyTime
  state.screen = 'playing'
  state.result = null
  music.play(game.music ?? {})
  save.data.plays[game.id] = (save.data.plays[game.id] ?? 0) + 1
}
function toHub() {
  state.game?.stop?.()
  state.game = null
  state.run = null
  state.screen = 'playing'
  music.play({ bpm: 104, root: 50, chords: [0, 5, 3, 7], lead: [0, 4, 2, 4, 5, 4, 2, null], wave: 'triangle', gain: 0.035 })
}
function pause() {
  pauseMenu.select('resume')
  pauseMenu.items.find((i) => i.id === 'restart').disabled = !state.run
  pauseMenu.items.find((i) => i.id === 'hub').disabled = !state.run
  state.screen = 'paused'
  save.save()
}
function finish() {
  const g = state.game
  const run = state.run
  const score = Math.round(run.score)
  const medal = medalFor(g.medals, score)
  const best = save.data.best[g.id] ?? 0
  const isBest = score > best
  if (isBest) save.data.best[g.id] = score
  if (medal > (save.data.medals[g.id] ?? 0)) save.data.medals[g.id] = medal
  save.save()
  state.result = { score, medal, best: Math.max(best, score), isBest, stats: run.stats?.() ?? [], next: g.medals.find((m) => m > score) }
  state.screen = 'gameover'
  overMenu.select('again')
  music.stop()
  sfx.medal(medal)
}

// ---- update ------------------------------------------------------------------------------------

function update(dt) {
  state.t += dt
  music.update()
  switch (state.screen) {
    case 'title': {
      const c = titleMenu.update(input, dt)
      if (c === 'play') toHub()
      if (c === 'settings') ((state.from = 'title'), (state.screen = 'settings'))
      return
    }
    case 'settings':
      if (settingsScreen.update(input, dt) === 'back') state.screen = state.from
      return
    case 'paused': {
      const c = pauseMenu.update(input, dt)
      if (c === 'resume' || c === 'back') state.screen = 'playing'
      if (c === 'restart') start(state.game)
      if (c === 'settings') ((state.from = 'paused'), (state.screen = 'settings'))
      if (c === 'hub') toHub()
      if (c === 'title') ((state.screen = 'title'), (state.run = null), (state.game = null), music.stop())
      return
    }
    case 'gameover': {
      const c = overMenu.update(input, dt)
      if (c === 'again') start(state.game)
      if (c === 'hub' || c === 'back') toHub()
      return
    }
  }
  // playing
  if (input.pointer.pressed && inside(input.pointer, PAUSE_BUTTON)) input.requestMenu()
  if (input.pressed('menu')) return pause()
  if (!state.run) return hubUpdate(dt)
  if (state.ready > 0) {
    const before = state.ready
    state.ready -= dt
    if (Math.ceil(before * 2) !== Math.ceil(state.ready * 2)) state.ready > 0 ? sfx.tick() : sfx.go()
    return
  }
  state.run.update(dt)
  if (state.run.done) finish()
}

// The cabinet hall: a 4×3 grid of games, chosen with the d-pad / stick / keys, hover or tap.
// Each game's icon() is drawn for a 360-wide card and scaled to fit.
const COLS = 4
const CARD = { w: 284, h: 172, gap: 18, top: 188 }
const ICON_K = CARD.w / 360
const cardRect = (i) => {
  const x0 = (W - (COLS * CARD.w + (COLS - 1) * CARD.gap)) / 2
  return { x: x0 + (i % COLS) * (CARD.w + CARD.gap), y: CARD.top + Math.floor(i / COLS) * (CARD.h + CARD.gap), w: CARD.w, h: CARD.h }
}
const lastPointer = { x: 0, y: 0 }
function hubUpdate(dt) {
  const before = state.sel
  if (input.navX) state.sel = (state.sel + input.navX + GAMES.length) % GAMES.length
  if (input.navY) state.sel = clamp(state.sel + input.navY * COLS, 0, GAMES.length - 1)
  const p = input.pointer
  const moved = p.active && (p.x !== lastPointer.x || p.y !== lastPointer.y)
  lastPointer.x = p.x
  lastPointer.y = p.y
  let tapped = -1
  for (let i = 0; i < GAMES.length; i++) {
    if (!inside(p, cardRect(i))) continue
    if (moved || p.pressed) state.sel = i
    if (p.pressed) tapped = i
  }
  if (state.sel !== before) sfx.move()
  if (tapped >= 0 || input.pressed('a')) {
    sfx.pick()
    start(GAMES[state.sel])
  } else if (input.pressed('b')) state.screen = 'title'
}

// ---- draw --------------------------------------------------------------------------------------

function drawHall() {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, C.bg2)
  g.addColorStop(1, C.bg)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // a perspective floor grid that drifts toward you
  ctx.strokeStyle = 'rgba(255,92,138,0.16)'
  ctx.lineWidth = 2
  const horizon = 470
  for (let i = -10; i <= 10; i++) {
    ctx.beginPath()
    ctx.moveTo(W / 2 + i * 30, horizon)
    ctx.lineTo(W / 2 + i * 240, H)
    ctx.stroke()
  }
  const k = (state.t * 0.25) % 1
  for (let j = 0; j < 8; j++) {
    const y = horizon + (H - horizon) * ((j + k) / 8) ** 2
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
}

function drawMarquee(y, size) {
  const all = GAMES.every((g) => (save.data.medals[g.id] ?? 0) >= 3)
  const pulse = 0.5 + 0.5 * Math.sin(state.t * 3)
  label(ctx, 'ARCADE SAMPLER', W / 2, y, { font: font(400, size, 'Lilita One'), color: all ? C.gold : C.ink, edge: size * 0.16, edgeColor: C.dark })
  ctx.globalAlpha = 0.25 + pulse * 0.2
  label(ctx, 'ARCADE SAMPLER', W / 2, y, { font: font(400, size, 'Lilita One'), color: 'rgba(0,0,0,0)', edge: size * 0.32, edgeColor: all ? C.gold : C.pink })
  ctx.globalAlpha = 1
  label(ctx, 'ARCADE SAMPLER', W / 2, y, { font: font(400, size, 'Lilita One'), color: all ? C.gold : C.ink, edge: size * 0.12, edgeColor: C.dark })
}

function drawTitle() {
  drawHall()
  drawMarquee(210, 120)
  label(ctx, `${GAMES.length} tiny games, ${GAMES.length} genres, ${GAMES.length} looks.`, W / 2, 320, { font: font(700, 30), color: C.ink })
  label(ctx, 'Every one made in code with this kit.', W / 2, 362, { font: font(700, 24), color: C.quiet })
  const golds = GAMES.filter((g) => (save.data.medals[g.id] ?? 0) >= 3).length
  if (golds) label(ctx, `${golds} of ${GAMES.length} gold medals`, W / 2, 440, { font: font(700, 24), color: C.gold })
  titleMenu.draw(ctx, font(700, 30))
  drawPrompts(ctx, input, [['a', 'Choose'], ['menu', 'Pause in game']], { size: 24 * (settings.data.textScale ?? 1) })
}

function drawHub() {
  drawHall()
  drawMarquee(92, 70)
  label(ctx, 'Pick a cabinet', W / 2, 152, { font: font(700, 24), color: C.quiet })
  GAMES.forEach((g, i) => {
    const r = cardRect(i)
    const sel = i === state.sel
    const lift = sel ? -8 : 0
    ctx.save()
    ctx.translate(0, lift)
    // the card in the game's own colours, with its icon as a little preview
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.roundRect(r.x + 6, r.y + 10, r.w, r.h, 22)
    ctx.fill()
    ctx.fillStyle = g.style.bg
    ctx.beginPath()
    ctx.roundRect(r.x, r.y, r.w, r.h, 22)
    ctx.fill()
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(r.x, r.y, r.w, r.h, 22)
    ctx.clip()
    ctx.save()
    ctx.translate(r.x + r.w / 2, r.y + 62)
    ctx.scale(ICON_K, ICON_K)
    g.icon(ctx, 0, 0, 130, state.t)
    ctx.restore()
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(r.x, r.y + r.h - 62, r.w, 62)
    ctx.restore()
    ctx.lineWidth = sel ? 6 : 3
    ctx.strokeStyle = sel ? g.style.accent : 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.roundRect(r.x, r.y, r.w, r.h, 22)
    ctx.stroke()
    label(ctx, g.name, r.x + 16, r.y + r.h - 40, { font: font(400, 27, 'Lilita One'), color: '#fff', edge: 6, edgeColor: 'rgba(0,0,0,0.6)', align: 'left' })
    label(ctx, g.blurb, r.x + 16, r.y + r.h - 15, { font: font(700, 16), color: 'rgba(255,255,255,0.82)', align: 'left' })
    drawMedal(ctx, r.x + r.w - 26, r.y + r.h - 40, 13, save.data.medals[g.id] ?? 0)
    const best = save.data.best[g.id]
    if (best) label(ctx, `Best ${best}`, r.x + r.w - 20, r.y + 26, { font: font(700, 18), color: '#fff', edge: 5, edgeColor: 'rgba(0,0,0,0.6)', align: 'right' })
    ctx.restore()
  })
  drawPauseButton()
  drawPrompts(ctx, input, [['a', 'Play'], ['b', 'Title'], ['menu', 'Pause']], { size: 22 * (settings.data.textScale ?? 1) })
}

function drawPauseButton() {
  ctx.fillStyle = 'rgba(10,7,24,0.55)'
  ctx.beginPath()
  ctx.roundRect(PAUSE_BUTTON.x, PAUSE_BUTTON.y, PAUSE_BUTTON.w, PAUSE_BUTTON.h, 14)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.fillRect(PAUSE_BUTTON.x + 18, PAUSE_BUTTON.y + 16, 7, 24)
  ctx.fillRect(PAUSE_BUTTON.x + 31, PAUSE_BUTTON.y + 16, 7, 24)
}

function drawGame() {
  const g = state.game
  ctx.save()
  state.run.draw(ctx)
  ctx.restore()
  drawPauseButton()
  if (state.ready > 0) {
    ctx.fillStyle = 'rgba(10,7,24,0.55)'
    ctx.fillRect(0, 0, W, H)
    label(ctx, g.name, W / 2, H / 2 - 90, { font: font(400, 84, 'Lilita One'), color: g.style.accent, edge: 14, edgeColor: C.dark })
    label(ctx, g.howTo(input), W / 2, H / 2 + 10, { font: font(700, 30), color: C.ink, edge: 7, edgeColor: C.dark })
    const n = Math.ceil(state.ready / (TUNING.readyTime / 3))
    label(ctx, state.ready > 0.15 ? String(n) : 'GO!', W / 2, H / 2 + 110, { font: font(400, 64, 'Lilita One'), color: C.gold, edge: 10, edgeColor: C.dark })
  } else if (state.screen === 'playing') {
    const prompts = state.run.prompts?.(input) ?? []
    if (prompts.length) drawPrompts(ctx, input, [...prompts, ['menu', 'Pause']], { size: 22 * (settings.data.textScale ?? 1), color: 'rgba(255,255,255,0.85)' })
  }
}

function drawResults() {
  const g = state.game
  const r = state.result
  ctx.fillStyle = 'rgba(10,7,24,0.78)'
  ctx.fillRect(0, 0, W, H)
  label(ctx, g.name, W / 2, 110, { font: font(400, 64, 'Lilita One'), color: g.style.accent, edge: 12, edgeColor: C.dark })
  label(ctx, `${r.score}`, W / 2, 220, { font: font(400, 110, 'Lilita One'), color: C.ink, edge: 14, edgeColor: C.dark })
  label(ctx, g.scoreLabel ?? 'points', W / 2, 292, { font: font(700, 24), color: C.quiet })
  // One centred line each: the medal, then best, then what the next medal needs.
  ctx.font = font(900, 30)
  const mw = ctx.measureText(MEDAL_NAMES[r.medal]).width
  drawMedal(ctx, W / 2 - mw / 2 - 26, 352, 20, r.medal)
  label(ctx, MEDAL_NAMES[r.medal], W / 2 + 10, 354, { font: font(900, 30), color: r.medal ? MEDAL_COLORS[r.medal] : C.quiet })
  label(ctx, r.isBest ? 'New best!' : `Best ${r.best}`, W / 2, 398, { font: font(900, 26), color: r.isBest ? C.gold : C.ink })
  if (r.next !== undefined) label(ctx, `${r.next - r.score} more for ${MEDAL_NAMES[medalFor(g.medals, r.next)]}`, W / 2, 436, { font: font(700, 22), color: C.quiet })
  r.stats.slice(0, 3).forEach(([k, v], i) => {
    const x = W / 2 + (i - (Math.min(3, r.stats.length) - 1) / 2) * 260
    label(ctx, String(v), x, 492, { font: font(900, 36), color: C.ink })
    label(ctx, k, x, 530, { font: font(700, 20), color: C.quiet })
  })
  overMenu.draw(ctx, font(700, 30))
}

function draw() {
  ctx.save()
  canvas.style.cursor = state.screen === 'playing' && state.run && state.ready <= 0 && input.mode === 'mouse' && !state.game.cursor ? 'none' : ''
  if (state.screen === 'title' || (state.screen === 'settings' && state.from === 'title')) {
    drawTitle()
    if (state.screen === 'settings') {
      ctx.fillStyle = 'rgba(10,7,24,0.85)'
      ctx.fillRect(0, 0, W, H)
      settingsScreen.draw(ctx, { font: font(700, 28) })
      drawPrompts(ctx, input, [['left', 'Change'], ['b', 'Back']], { size: 24 * (settings.data.textScale ?? 1) })
    }
  } else if (!state.run) {
    drawHub()
    if (state.screen === 'paused' || state.screen === 'settings') drawPauseOverlay()
  } else {
    drawGame()
    if (state.screen === 'gameover') drawResults()
    if (state.screen === 'paused' || state.screen === 'settings') drawPauseOverlay()
  }
  ctx.restore()
  if (debug) drawDebug()
}
function drawPauseOverlay() {
  ctx.fillStyle = 'rgba(10,7,24,0.8)'
  ctx.fillRect(0, 0, W, H)
  if (state.screen === 'settings') {
    settingsScreen.draw(ctx, { font: font(700, 28) })
    drawPrompts(ctx, input, [['left', 'Change'], ['b', 'Back']], { size: 24 * (settings.data.textScale ?? 1) })
    return
  }
  label(ctx, 'Paused', W / 2, 190, { font: font(400, 72, 'Lilita One'), color: C.ink, edge: 12, edgeColor: C.dark })
  pauseMenu.draw(ctx, font(700, 30))
}

function drawDebug() {
  ctx.save()
  ctx.font = '500 16px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(8, H - 64, 520, 56)
  ctx.fillStyle = '#9fe'
  ctx.fillText(`screen ${state.screen} game ${state.game?.id ?? '-'} mode ${input.mode} fps ${fps.toFixed(0)} dpr ${fit.dpr}`, 16, H - 56)
  ctx.fillText(`score ${state.run ? Math.round(state.run.score) : '-'} pads ${input.pads.filter((p) => p.connected).length}`, 16, H - 34)
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
