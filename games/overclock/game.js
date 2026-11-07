// Overclock: a boss-rush roguelite platformer. Beat Talon, bolt on one of three parts, fight it
// again, stronger, until it breaks you. Screens: title | playing | paused | settings | gameover.
// The fight itself lives in world.js; sprites and part add-ons in art.js.
import { input } from './input.js'
import { createMenu } from './menu.js'
import { fitCanvas } from './fit.js'
import { createAudio } from './audio.js'
import { createSave, createSettings } from './save.js'
import { createSettingsScreen } from './settings.js'
import { drawPrompts } from './prompts.js'
import { art, loadArt, drawFrame, frame, anchorAt, tile, drawAddon } from './art.js'
import { createWorld, TUNING, PARTS, SLOTS, SLOT_COLOR, AW, AH, TS, TF } from './world.js'

const ID = 'overclock'
const W = 1280
const H = 800
const NW = 320
const NH = 200
const PX = 4 // native pixel → screen pixel
const BG = '#0f0d22'
const canvas = document.getElementById('game')
const fit = fitCanvas(canvas, { w: W, h: H, letterbox: BG })
const ctx = fit.ctx
input.attach(canvas, W, H)
// Z / X / C (and J / K / L) as the classic jump / shoot / dash keys, next to Space / Shift / Backspace.
input.extendKeys({ KeyZ: 'a', KeyX: 'x', KeyC: 'b', KeyK: 'a', KeyJ: 'x', KeyL: 'b' })

const settings = createSettings(ID, { screenFlash: true })
const audio = createAudio({ settings })
const save = createSave(ID, 1, { bestLoop: 0, runs: 0, seen: [] })

// The world is drawn at 320×200 and blown up ×4 with hard pixels.
const view = document.createElement('canvas')
view.width = NW
view.height = NH
const g = view.getContext('2d')
g.imageSmoothingEnabled = false

const params = new URLSearchParams(location.search)
const debug = params.has('debug')

const state = {
  screen: 'title', // title | playing | paused | settings | gameover
  from: 'title',
  run: null,
  world: null,
  phase: 'intro', // intro | fight | victory | choose | down (inside 'playing')
  phaseT: 0,
  choices: [],
  hintT: 0,
  titleT: 0
}
window.__game = { state, TUNING, PARTS, save, settings, get titleMenu() { return titleMenu } }

const titleMenu = createMenu([{ id: 'play', label: 'Start run' }, { id: 'settings', label: 'Settings' }], { y: 520, width: 380, height: 60, accent: '#43d3c0' })
const pauseMenu = createMenu(
  [{ id: 'resume', label: 'Resume' }, { id: 'restart', label: 'Restart run' }, { id: 'settings', label: 'Settings' }, { id: 'title', label: 'Quit to title' }],
  { y: H / 2 - 90, width: 420, height: 60, accent: '#43d3c0' }
)
const overMenu = createMenu([{ id: 'again', label: 'New run' }, { id: 'title', label: 'Title' }], { y: 560, width: 380, height: 60, accent: '#43d3c0' })
let chooseMenu = null
const settingsScreen = createSettingsScreen({ settings, audio })

// Gameplay prompts name the classic Z / X / C keys on a keyboard (Space / Shift / Backspace still work).
const KEY_NAMES = { a: 'Z', x: 'X', b: 'C' }
const playInput = Object.create(input, { label: { value: (b) => (input.mode === 'keyboard' && KEY_NAMES[b]) || input.label(b) } })

const PAUSE_BUTTON = { x: W - 88, y: 28, w: 56, h: 56 }
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

input.onPause(() => { if (state.screen === 'playing') pause() })

loadArt().catch((e) => console.error('art failed to load', e))
const font = new FontFace('Pixelify', 'url(assets/fonts/pixelify-sans-latin-700-normal.woff2)', { weight: '700' })
font.load().then((f) => document.fonts.add(f)).catch(() => {})
const px = (size) => `700 ${Math.round(size * settings.data.textScale)}px Pixelify, system-ui, sans-serif`

// ---- run flow -------------------------------------------------------------------------------
function newRun() {
  const startParts = { legs: null, arm: null, core: null, rig: null }
  // ?parts=spring,splitter and ?loop=3 for testing
  for (const id of (params.get('parts') || '').split(',')) if (PARTS[id]) startParts[PARTS[id].slot] = id
  state.run = { loop: Number(params.get('loop')) || 1, hp: TUNING.hp, parts: startParts, rebootUsed: false, time: 0 }
  save.data.runs++
  save.save()
  startLoop()
}
function startLoop() {
  const run = state.run
  const world = createWorld({ on: onEvent })
  world.load(run.loop)
  world.spawnPlayer(run, 0)
  world.spawnBoss()
  world.updateCamera(0, true)
  state.world = world
  setPhase('intro')
  state.screen = 'playing'
  state.hintT = run.loop === 1 ? 14 : 0
  music.start()
}
function setPhase(p) {
  state.phase = p
  state.phaseT = 0
  if (state.world) state.world.phase = p === 'intro' ? 'intro' : p
}
function pause() {
  pauseMenu.select('resume')
  state.screen = 'paused'
  save.save()
}
function openSettings(from) {
  state.from = from
  state.screen = 'settings'
}
function gameOver() {
  state.screen = 'gameover'
  overMenu.select('again')
  const cleared = state.run.loop - 1
  state.run.cleared = cleared
  state.run.newBest = cleared > save.data.bestLoop
  if (state.run.newBest) save.data.bestLoop = cleared
  save.save()
  music.stop()
}
function offerParts() {
  const run = state.run
  const owned = new Set(Object.values(run.parts))
  const pool = Object.keys(PARTS).filter((id) => !owned.has(id))
  // three parts from different slots where possible
  const picks = []
  const shuffled = pool.sort(() => Math.random() - 0.5)
  for (const id of shuffled) if (picks.length < 3 && !picks.some((p) => PARTS[p].slot === PARTS[id].slot)) picks.push(id)
  for (const id of shuffled) if (picks.length < 3 && !picks.includes(id)) picks.push(id)
  state.choices = picks
  chooseMenu = createMenu(picks.map((id) => ({ id, label: PARTS[id].name })), { y: 250, width: 980, height: 136, gap: 18, accent: '#43d3c0' })
  setPhase('choose')
}
function takePart(id) {
  const run = state.run
  run.parts[PARTS[id].slot] = id
  if (!save.data.seen.includes(id)) save.data.seen.push(id)
  const p = state.world.players[0]
  run.hp = Math.min(TUNING.hp, (p ? p.hp : run.hp) + (run.parts.rig === 'wrench' ? TUNING.hp : TUNING.healAfterWin))
  run.loop++
  if (run.loop - 1 > save.data.bestLoop) save.data.bestLoop = run.loop - 1
  save.save()
  sfx.part()
  startLoop()
}

// ---- update ---------------------------------------------------------------------------------
function update(dt) {
  state.titleT += dt
  switch (state.screen) {
    case 'title': {
      const c = titleMenu.update(input, dt)
      if (c === 'play' && art.ready) newRun()
      if (c === 'settings') openSettings('title')
      return
    }
    case 'settings':
      if (settingsScreen.update(input, dt) === 'back') state.screen = state.from
      return
    case 'paused': {
      const c = pauseMenu.update(input, dt)
      if (c === 'resume' || c === 'back') state.screen = 'playing'
      if (c === 'restart') newRun()
      if (c === 'settings') openSettings('paused')
      if (c === 'title') { state.screen = 'title'; music.stop() }
      return
    }
    case 'gameover': {
      const c = overMenu.update(input, dt)
      if (c === 'again') newRun()
      if (c === 'title' || c === 'back') state.screen = 'title'
      return
    }
  }
  play(dt)
}

function play(dt) {
  if (input.pointer.pressed && inside(input.pointer, PAUSE_BUTTON)) input.requestMenu()
  if (input.pressed('menu')) return pause()
  const world = state.world
  state.phaseT += dt
  state.run.time += dt
  state.hintT = Math.max(0, state.hintT - dt)
  const p = world.players[0]
  if (state.run && p) state.run.hp = p.hp

  switch (state.phase) {
    case 'intro':
      if (state.phaseT > 2.2) setPhase('fight')
      break
    case 'fight':
      if (world.boss.dead && world.boss.t > 1.9) { setPhase('victory'); p.win = true; sfx.win() }
      if (p.dead) setPhase('down')
      break
    case 'victory':
      if (state.phaseT > 1.4) offerParts()
      break
    case 'choose': {
      const c = chooseMenu.update(input, dt)
      if (c && c !== 'back' && PARTS[c]) takePart(c)
      break
    }
    case 'down':
      if (state.phaseT > 1.8) gameOver()
      break
  }
  if (state.phase !== 'choose') world.update(dt, [input])
  music.update(world)
}

// ---- events from the world → sound, flashes --------------------------------------------------
let flash = 0
function onEvent(ev, data) {
  switch (ev) {
    case 'shoot': data ? sfx.bigShot(data) : sfx.shot(); break
    case 'charged': sfx.charged(data); break
    case 'jump': sfx.jump(); break
    case 'walljump': sfx.kick(); break
    case 'dash': sfx.dash(); break
    case 'land': sfx.land(); break
    case 'hurt': sfx.hurt(); rumble(0.4, 120); break
    case 'heal': sfx.heal(); break
    case 'bubblePop': sfx.bubble(); break
    case 'bubbleUp': sfx.heal(); break
    case 'reboot': sfx.reboot(); flash = 0.25; break
    case 'playerDead': sfx.dead(); break
    case 'bossHit': sfx.bossHit(data); break
    case 'tell': sfx.tell(); break
    case 'roar': case 'phase2': sfx.roar(); if (ev === 'phase2') flash = 0.15; break
    case 'pounce': sfx.whoosh(); break
    case 'bossLand': case 'slam': sfx.thud(ev === 'slam'); rumble(0.5, 140); break
    case 'spit': sfx.spit(); break
    case 'dive': sfx.dive(); break
    case 'toss': sfx.whoosh(); break
    case 'wave': sfx.wave(); break
    case 'bossDead': sfx.bossDead(); flash = 0.3; rumble(1, 600); break
  }
}
function rumble(strength, ms) {
  for (const pad of navigator.getGamepads?.() ?? []) pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch?.(() => {})
}

// ---- audio ----------------------------------------------------------------------------------
const tone = (o) => audio.tone(o)
const sfx = {
  shot: () => tone({ freq: 900, dur: 0.06, type: 'square', gain: 0.08, slide: -400 }),
  bigShot: (l) => { tone({ freq: l > 1 ? 300 : 500, dur: 0.25, type: 'sawtooth', gain: 0.14, slide: -200 }); audio.noise({ dur: 0.15, gain: 0.08 }) },
  charged: (l) => tone({ freq: l > 1 ? 880 : 660, dur: 0.1, type: 'triangle', gain: 0.1, slide: 200 }),
  jump: () => tone({ freq: 330, dur: 0.09, type: 'square', gain: 0.06, slide: 260 }),
  kick: () => { tone({ freq: 260, dur: 0.07, type: 'square', gain: 0.07, slide: 300 }); audio.noise({ dur: 0.05, gain: 0.05 }) },
  dash: () => { audio.noise({ dur: 0.18, gain: 0.07 }); tone({ freq: 180, dur: 0.16, type: 'sawtooth', gain: 0.05, slide: 140 }) },
  land: () => audio.noise({ dur: 0.04, gain: 0.04 }),
  hurt: () => { tone({ freq: 220, dur: 0.2, type: 'square', gain: 0.14, slide: -150 }); audio.noise({ dur: 0.12, gain: 0.08 }) },
  heal: () => [523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.08, type: 'triangle', gain: 0.08, delay: i * 0.06 })),
  bubble: () => tone({ freq: 1200, dur: 0.2, type: 'sine', gain: 0.12, slide: -900 }),
  reboot: () => [262, 392, 523, 784].forEach((f, i) => tone({ freq: f, dur: 0.12, type: 'square', gain: 0.08, delay: i * 0.08 })),
  dead: () => { tone({ freq: 400, dur: 0.9, type: 'sawtooth', gain: 0.14, slide: -360 }); audio.noise({ dur: 0.6, gain: 0.1 }) },
  bossHit: (d) => tone({ freq: d.crit ? 1400 : 160 + d.lvl * 40, dur: 0.05, type: 'square', gain: 0.07, slide: -60 }),
  tell: () => tone({ freq: 1500, dur: 0.07, type: 'square', gain: 0.05 }),
  roar: () => { tone({ freq: 140, dur: 0.6, type: 'sawtooth', gain: 0.14, slide: -60 }); tone({ freq: 210, dur: 0.6, type: 'square', gain: 0.06, slide: -90 }) },
  whoosh: () => audio.noise({ dur: 0.22, gain: 0.06 }),
  thud: (big) => { tone({ freq: big ? 70 : 90, dur: 0.25, type: 'sine', gain: 0.25, slide: -40 }); audio.noise({ dur: 0.15, gain: big ? 0.14 : 0.08 }) },
  spit: () => tone({ freq: 700, dur: 0.12, type: 'sawtooth', gain: 0.07, slide: -400 }),
  dive: () => tone({ freq: 900, dur: 0.35, type: 'sawtooth', gain: 0.08, slide: -700 }),
  wave: () => tone({ freq: 110, dur: 0.3, type: 'square', gain: 0.07, slide: -50 }),
  bossDead: () => { for (let i = 0; i < 8; i++) audio.noise({ dur: 0.3, gain: 0.12, delay: i * 0.2 }); tone({ freq: 200, dur: 1.6, type: 'sawtooth', gain: 0.12, slide: -170 }) },
  win: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'square', gain: 0.08, delay: i * 0.09 })),
  part: () => [659, 988].forEach((f, i) => tone({ freq: f, dur: 0.14, type: 'triangle', gain: 0.1, delay: i * 0.08 }))
}

// A small step sequencer on the music bus: driving bass + arpeggio in A minor, faster in phase 2.
const music = (() => {
  const BASS = [45, 45, 57, 45, 48, 48, 60, 48, 43, 43, 55, 43, 40, 40, 52, 44]
  const ARP = [69, 72, 76, 72, 69, 72, 76, 79, 67, 71, 74, 71, 64, 68, 71, 76]
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12)
  let on = false, step = 0, next = 0
  return {
    start() { on = true; next = 0 },
    stop() { on = false },
    update(world) {
      const ac = audio.ctx
      if (!on || !ac || !audio.unlocked || state.screen !== 'playing') return
      const fast = world?.boss?.phase2 && !world.boss.dead
      const dur = (fast ? 60 / 168 : 60 / 150) / 4
      if (next < ac.currentTime) next = ac.currentTime + 0.05
      while (next < ac.currentTime + 0.15) {
        const delay = next - ac.currentTime
        const i = step % 16
        const bar = Math.floor(step / 16) % 4
        const shift = [0, 0, -2, 3][bar]
        if (i % 2 === 0) tone({ freq: hz(BASS[i] + shift), dur: dur * 1.8, type: 'triangle', bus: 'music', gain: 0.16, delay })
        if (state.phase === 'fight' || state.phase === 'intro') tone({ freq: hz(ARP[(i + bar * 3) % 16] + shift), dur: dur * 0.9, type: 'square', bus: 'music', gain: 0.035, delay })
        if (fast && i % 4 === 2) audio.noise({ dur: 0.03, bus: 'music', gain: 0.03, delay })
        if (i % 8 === 0) tone({ freq: 55, dur: 0.12, type: 'sine', bus: 'music', gain: 0.2, slide: -30, delay })
        step++
        next += dur
      }
    }
  }
})()

// ---- drawing --------------------------------------------------------------------------------
function draw() {
  ctx.save()
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)
  if (state.screen === 'title') drawTitle()
  else if (state.screen === 'settings') {
    if (state.from === 'paused' && state.world) drawGame()
    ctx.fillStyle = 'rgba(10,8,24,0.86)'
    ctx.fillRect(0, 0, W, H)
    settingsScreen.draw(ctx, { font: px(28) })
    drawPrompts(ctx, input, [['left', 'Change'], ['b', 'Back']], { size: 24 * settings.data.textScale })
  } else {
    drawGame()
    if (state.screen === 'paused') {
      ctx.fillStyle = 'rgba(10,8,24,0.75)'
      ctx.fillRect(0, 0, W, H)
      text('PAUSED', W / 2, 200, 64, '#e8f0ff')
      text(`Loop ${state.run.loop}  ·  ${ARENA_NAME()}`, W / 2, 252, 26, '#9fb0e0')
      pauseMenu.draw(ctx, px(28))
      drawPrompts(ctx, input, [['a', 'Choose'], ['b', 'Resume']], { size: 24 * settings.data.textScale })
    }
    if (state.screen === 'gameover') drawGameOver()
  }
  ctx.restore()
  if (debug) drawDebug()
}
const ARENA_NAME = () => state.world?.arena?.name ?? ''

function text(str, x, y, size, color, align = 'center') {
  ctx.font = px(size)
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillText(str, x + 3, y + 3)
  ctx.fillStyle = color
  ctx.fillText(str, x, y)
}

function drawGame() {
  const world = state.world
  if (!world || !art.ready) return
  const reduce = settings.data.reducedShake
  const camX = Math.round(world.cam.x)
  const camY = Math.round(world.cam.y)
  drawWorld(world, camX, camY)
  let sx = 0, sy = 0
  if (!reduce && world.shake > 0) { sx = Math.round((Math.random() - 0.5) * world.shake) * PX; sy = Math.round((Math.random() - 0.5) * world.shake) * PX }
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(view, sx, sy, W, H)
  drawGlow(world, camX, camY, sx, sy)
  if (flash > 0 && !reduce) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.5, flash * 2)})`
    ctx.fillRect(0, 0, W, H)
  }
  drawHud(world, camX, camY)
}

function drawWorld(world, camX, camY) {
  const t = world.t
  g.save()
  // far background with parallax
  g.drawImage(art.img.bg, -Math.round(camX * 0.5), -Math.round(camY * 0.5))
  g.fillStyle = 'rgba(16,10,40,0.28)'
  g.fillRect(0, 0, NW, NH)
  g.translate(-camX, -camY)
  // decor chains in the far columns
  for (const cx of [104, 296, 488]) tile(g, 'chain', 0, 0, 10, 44, cx, TS + Math.sin(t * 0.8 + cx) * 1.5)
  // tiles
  const x0 = Math.floor(camX / TS), x1 = Math.ceil((camX + NW) / TS)
  const y0 = Math.floor(camY / TS), y1 = Math.ceil((camY + NH) / TS)
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const c = world.cell(tx, ty)
    const x = tx * TS, y = ty * TS
    if (c === '#') {
      const above = world.cell(tx, ty - 1)
      const open = above !== '#'
      const qx = (tx & 1) * 16
      if (open) tile(g, 'floor', qx, 0, 16, 16, x, y)
      else if (world.cell(tx, ty - 2) !== '#' && ty > 0) tile(g, 'floor', qx, 16, 16, 16, x, y)
      else tile(g, 'wall', qx, (ty & 1) * 16, 16, 16, x, y)
    } else if (c === '=') {
      const l = world.cell(tx - 1, ty) !== '=', r = world.cell(tx + 1, ty) !== '='
      const sx = l ? 0 : r ? 48 : 16 + ((tx & 1) * 16)
      tile(g, 'girder', sx, 0, 16, 13, x, y)
    } else if (c === '~') {
      const off = Math.floor(t * 8) % 16
      tile(g, 'lava', ((tx & 1) * 16 + off) % 16, 2, 16 - (((tx & 1) * 16 + off) % 16), 16, x, y + 3)
      tile(g, 'lava', 0, 2, ((tx & 1) * 16 + off) % 16, 16, x + 16 - (((tx & 1) * 16 + off) % 16), y + 3)
    }
  }
  // wall vents
  for (const [vx, vy] of [[TS, 64], [AW - TS - 22, 64]]) tile(g, 'vent', 0, 0, 22, 24, vx, vy)

  const b = world.boss
  // dive aim line
  if (world.aim) {
    const a = world.aim
    g.strokeStyle = Math.floor(t * 20) % 2 ? '#ff3050' : '#ffd0d8'
    g.globalAlpha = 0.4 + 0.6 * Math.min(1, a.t)
    g.lineWidth = 1
    g.setLineDash([3, 3])
    g.beginPath()
    g.moveTo(a.x0 + 0.5, a.y0 + 0.5)
    g.lineTo(a.x1 + 0.5, a.y1 + 0.5)
    g.stroke()
    g.setLineDash([])
    g.globalAlpha = 1
  }
  // shockwaves
  for (const w of world.waves) drawFrame(g, 'fx', 16, w.x, w.y + 2, w.dir, { alpha: 0.9 })
  // capsules
  for (const c of world.capsules) if (c.life > 2 || Math.floor(c.life * 8) % 2) drawFrame(g, 'fx', 15, c.x, c.y + 6 + Math.sin(t * 5) * 1, 1)
  // boss
  if (b) drawBoss(b, t)
  // ghosts (dash afterimages)
  for (const f of world.fx) if (f.kind === 'ghost') drawFrame(g, 'rivet', f.f, f.x, f.y, f.dir, { alpha: 0.35 * (1 - f.t / f.life) })
  // players
  for (const p of world.players) if (p) drawRivet(p, t)
  // shots
  for (const s of world.shots) {
    const fi = [0, 1, 2][s.lvl]
    const sc = s.lvl === 2 && s.owner?.parts.arm === 'pierce' ? 1.25 : 1
    drawScaled('fx', fi, s.x, s.y, Math.sign(s.vx) || 1, sc * [0.55, 0.6, 0.6][s.lvl])
  }
  for (const e of world.enemyShots) {
    if (e.kind === 'bolt') { g.save(); g.translate(Math.round(e.x), Math.round(e.y)); g.rotate(Math.atan2(e.vy, e.vx)); drawScaled('fx', 4, 0, 0, 1, 0.45); g.restore() }
    else { g.save(); g.translate(Math.round(e.x), Math.round(e.y)); g.rotate(e.spin); drawScaled('fx', 5, 0, 0, 1, 0.42); g.restore() }
  }
  // particles
  for (const f of world.fx) {
    if (f.kind === 'px') { g.fillStyle = f.color; g.fillRect(Math.round(f.x), Math.round(f.y), 1, 1) }
    else if (f.kind === 'anim') {
      const fi = f.frames[Math.min(f.frames.length - 1, Math.floor(f.t * f.fps))]
      drawScaled('fx', fi, f.x, f.y, f.dir || 1, f.scale ?? 0.6)
    }
  }
  g.restore()
}

/** Draw an fx frame centred and scaled (effects are allowed off the pixel grid only in scale). */
function drawScaled(n, i, x, y, dir, s) {
  const f = frame(n, i)
  const w = Math.max(1, Math.round(f.w * s)), h = Math.max(1, Math.round(f.h * s))
  g.save()
  g.translate(Math.round(x), Math.round(y))
  if (dir < 0) g.scale(-1, 1)
  g.drawImage(art.img[n], f.x, f.y, f.w, f.h, -(w >> 1), -(h >> 1), w, h)
  g.restore()
}

function drawBoss(b, t) {
  const tell = ['pounce', 'sweep', 'discs'].includes(b.state) && b.frame === TF.crouch
  const white = b.flash > 0 || (tell && Math.floor(t * 16) % 2 === 0 && !settings.data.reducedShake)
  let x = b.x, y = b.y
  if (b.state === 'cling' || b.state === 'spit' || (b.state === 'diveAim' && b.wall)) {
    // clinging frames are drawn with the wall on Talon's right: mirror for the left wall
    drawFrame(g, 'talon', b.frame, x - b.wall * 2, y + 30, b.wall > 0 ? 1 : -1, { white })
  } else if (b.state === 'stuck' || b.state === 'dive') {
    drawFrame(g, 'talon', TF.dive, x, y + 8, b.dir, { white })
  } else {
    drawFrame(g, 'talon', b.frame, x, y, b.dir, { white })
  }
  if (tell) {
    // red eye flare on the tell, readable without colour too (it blinks)
    const hb = state.world.headBox(b)
    g.fillStyle = Math.floor(t * 12) % 2 ? '#ff3050' : '#ffffff'
    g.fillRect(Math.round(hb.x + hb.w / 2) - 1, Math.round(hb.y + hb.h / 2) - 1, 3, 3)
  }
}

function drawRivet(p, t) {
  if (p.iframes > 0 && !p.dead && Math.floor(t * 20) % 2 === 0) return
  const parts = p.parts
  const f = frame('rivet', p.frame)
  const lift = parts.legs === 'spring' ? 5 : 0
  const x = p.x, y = p.y - lift
  const at = (ax, ay) => anchorAt('rivet', p.frame, ax, ay, x, y, p.dir)
  const feet = f.feet && f.feet.length ? f.feet : [[f.ox, f.oy - 1]]
  const back = f.back ? at(f.back[0], f.back[1]) : { x: x - p.dir * 6, y: y - 22 }
  const dome = f.dome ? at(f.dome[0] + f.dome[2] / 2, f.dome[1]) : { x, y: y - 34 }
  // behind the body: rig packs and hover jets
  if (parts.rig === 'coolant') drawAddon(g, 'coolant', back.x - p.dir * 2, back.y + 3, p.dir)
  if (parts.rig === 'wrench') drawAddon(g, 'wrench', back.x - p.dir * 3, back.y + 1, p.dir)
  if (parts.core === 'reboot') drawAddon(g, 'reboot', back.x - p.dir * 1, back.y + 7, p.dir)
  if (parts.legs === 'hover') for (const [fx_, fy] of feet.slice(0, 2)) {
    const pt = at(fx_, fy)
    drawAddon(g, 'hover', pt.x - p.dir * 5, pt.y - 8, p.dir)
    if (p.hovering) { g.fillStyle = Math.floor(t * 30) % 2 ? '#5cf06a' : '#c8ffd0'; g.fillRect(Math.round(pt.x - p.dir * 5) - 1, Math.round(pt.y - 3), 3, 4 + (Math.floor(t * 30) % 3)) }
  }
  drawFrame(g, 'rivet', p.frame, x, y, p.dir, { white: p.hurt > 0 && Math.floor(t * 30) % 2 === 0 })
  // feet
  for (const [fx_, fy] of feet.slice(0, 2)) {
    const pt = at(fx_, fy)
    if (parts.legs === 'spring') drawAddon(g, 'spring', pt.x, pt.y - 1, p.dir, 0.5, 0)
    if (parts.legs === 'dashb') drawAddon(g, 'dashb', pt.x - p.dir * 5, pt.y - 3, p.dir)
  }
  // core
  if (parts.core === 'overclock' && f.chest) {
    const c = at(f.chest[0], f.chest[1] + 3)
    if (Math.floor(t * 6) % 3) drawAddon(g, 'overclock', c.x, c.y, p.dir)
  }
  // helmet dish
  if (parts.rig === 'scanner') drawAddon(g, 'scanner', dome.x - p.dir * 5, dome.y + 2, p.dir, 0.5, 1)
  // cannon attachment (visible when the cannon is up)
  if (parts.arm && f.muzzle) {
    const m = at(f.muzzle[0], f.muzzle[1])
    drawAddon(g, parts.arm, m.x + p.dir * 2, m.y, p.dir, 0.2, 0.5)
  }
  // charge sparks
  const lvl = state.world.chargeLevel(p)
  if (lvl && !p.dead) {
    const col = lvl > 1 ? (Math.floor(t * 20) % 2 ? '#ffd84a' : '#46e0ff') : '#46e0ff'
    for (let i = 0; i < 2 + lvl * 2; i++) {
      const a = t * 9 + i * 2.1
      g.fillStyle = col
      g.fillRect(Math.round(x + Math.cos(a) * (10 + lvl * 2)), Math.round(y - 16 + Math.sin(a) * (14 + lvl * 2)), 1, 1)
    }
  }
}

/** Soft additive glow at full resolution over the pixel layer: shots, charge, bubble, molten floor. */
function drawGlow(world, camX, camY, sx, sy) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const glow = (x, y, r, rgb, a) => {
    const X = (x - camX) * PX + sx, Y = (y - camY) * PX + sy, R = r * PX
    if (X < -R || X > W + R || Y < -R || Y > H + R) return
    const gr = ctx.createRadialGradient(X, Y, 0, X, Y, R)
    gr.addColorStop(0, `rgba(${rgb},${a})`)
    gr.addColorStop(1, `rgba(${rgb},0)`)
    ctx.fillStyle = gr
    ctx.fillRect(X - R, Y - R, R * 2, R * 2)
  }
  for (const s of world.shots) glow(s.x, s.y, [8, 16, 28][s.lvl], '70,200,255', [0.35, 0.45, 0.55][s.lvl])
  for (const e of world.enemyShots) glow(e.x, e.y, 10, e.kind === 'bolt' ? '255,40,70' : '200,200,255', 0.35)
  for (const w of world.waves) glow(w.x, w.y - 4, 14, '255,140,40', 0.4)
  for (const f of world.fx) if (f.kind === 'anim' && f.frames[0] >= 6 && f.frames[0] <= 11) glow(f.x, f.y, f.frames[0] === 11 ? 40 : 16, '255,140,40', 0.4 * (1 - f.t / f.life))
  for (const p of world.players) if (p && !p.dead) {
    const lvl = world.chargeLevel(p)
    if (lvl) glow(p.x, p.y - 16, 14 + lvl * 8, lvl > 1 ? '255,220,90' : '70,200,255', 0.18 + 0.1 * Math.sin(world.t * 20))
    if (p.bubble) {
      const X = (p.x - camX) * PX + sx, Y = (p.y - 17 - camY) * PX + sy
      ctx.strokeStyle = `rgba(80,220,255,${0.45 + 0.15 * Math.sin(world.t * 6)})`
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(X, Y, 22 * PX, 0, Math.PI * 2)
      ctx.stroke()
      glow(p.x, p.y - 17, 22, '60,180,255', 0.08)
    }
  }
  // molten pits glow
  for (let ty = 0; ty < world.grid.length; ty++) for (let tx = 0; tx < world.grid[ty].length; tx += 2) if (world.grid[ty][tx] === '~') glow(tx * TS + 16, ty * TS + 4, 34, '255,110,30', 0.22)
  const b = world.boss
  if (b && !b.dead) { const hb = world.headBox(b); glow(hb.x + hb.w / 2, hb.y + hb.h / 2, 12, '255,40,70', 0.25) }
  ctx.restore()
}

function drawHud(world, camX, camY) {
  const p = world.players[0]
  const ts = settings.data.textScale
  // Rivet health
  ctx.fillStyle = 'rgba(10,8,24,0.7)'
  ctx.fillRect(28, 28, 16 * 17 + 20, 40)
  for (let i = 0; i < TUNING.hp; i++) {
    const on = p && i < p.hp
    ctx.fillStyle = on ? (p.hp <= 4 && Math.floor(world.t * 4) % 2 ? '#ff6a5a' : '#43d3c0') : '#2b2d4f'
    ctx.fillRect(38 + i * 17, 36, 12, 24)
    if (on) { ctx.fillStyle = '#c9fff3'; ctx.fillRect(38 + i * 17, 36, 12, 4) }
  }
  // charge meter
  if (p) {
    const c = Math.min(1, p.charge / TUNING.charge2)
    ctx.fillStyle = 'rgba(10,8,24,0.7)'
    ctx.fillRect(28, 72, 16 * 17 + 20, 12)
    ctx.fillStyle = c >= 1 ? '#ffd84a' : c >= TUNING.charge1 / TUNING.charge2 ? '#46e0ff' : '#2f8fe0'
    ctx.fillRect(34, 75, (16 * 17 + 8) * c, 6)
  }
  // parts
  SLOTS.forEach((slot, i) => {
    const x = 28 + i * 64, y = 92
    const id = state.run.parts[slot]
    ctx.fillStyle = 'rgba(10,8,24,0.72)'
    ctx.fillRect(x, y, 56, 56)
    ctx.fillStyle = SLOT_COLOR[slot]
    ctx.fillRect(x, y + 52, 56, 4)
    if (id) {
      const f = frame('parts', PARTS[id].icon)
      const s = Math.min(46 / f.w, 46 / f.h)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(art.img.parts, f.x, f.y, f.w, f.h, x + 28 - (f.w * s) / 2, y + 26 - (f.h * s) / 2, f.w * s, f.h * s)
    } else {
      ctx.fillStyle = '#3a3d5c'
      ctx.fillRect(x + 22, y + 22, 12, 12)
    }
  })
  // boss bar (top centre)
  const b = world.boss
  if (b) {
    const bx = 440, by = 30, bw = 440
    ctx.fillStyle = 'rgba(10,8,24,0.75)'
    ctx.fillRect(bx - 8, by - 2, bw + 16, 44)
    text('TALON', bx, by + 12, 22, '#ff8aa0', 'left')
    text(`LOOP ${state.run.loop}`, bx + bw, by + 12, 22, '#ffd84a', 'right')
    const f = b.hp / b.maxHp
    ctx.fillStyle = '#2b1d3f'
    ctx.fillRect(bx, by + 26, bw, 12)
    ctx.fillStyle = b.phase2 ? '#ff3050' : '#c43a8a'
    ctx.fillRect(bx, by + 26, bw * (state.phase === 'intro' ? Math.min(1, state.phaseT / 1.2) : f), 12)
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    for (let i = 1; i < 4; i++) ctx.fillRect(bx + (bw * i) / 4, by + 26, 2, 12)
    // off-screen arrow
    const sx = (b.x - camX) * PX, sy = (b.y - 24 - camY) * PX
    if (!b.dead && (sx < 0 || sx > W || sy < 0 || sy > H)) {
      const ax = Math.max(40, Math.min(W - 40, sx)), ay = Math.max(170, Math.min(H - 60, sy))
      const ang = Math.atan2(sy - ay, sx - ax)
      ctx.save()
      ctx.translate(ax, ay)
      ctx.rotate(ang)
      ctx.fillStyle = Math.floor(world.t * 4) % 2 ? '#ff3050' : '#ff8aa0'
      ctx.beginPath()
      ctx.moveTo(22, 0); ctx.lineTo(-12, -16); ctx.lineTo(-12, 16)
      ctx.fill()
      ctx.restore()
    }
  }
  // pause button
  if (state.screen === 'playing') {
    ctx.fillStyle = 'rgba(10,8,24,0.6)'
    ctx.beginPath()
    ctx.roundRect(PAUSE_BUTTON.x, PAUSE_BUTTON.y, PAUSE_BUTTON.w, PAUSE_BUTTON.h, 12)
    ctx.fill()
    ctx.fillStyle = '#e8f0ff'
    ctx.fillRect(PAUSE_BUTTON.x + 18, PAUSE_BUTTON.y + 16, 7, 24)
    ctx.fillRect(PAUSE_BUTTON.x + 31, PAUSE_BUTTON.y + 16, 7, 24)
  }
  // phase banners
  if (state.screen !== 'playing') return
  if (state.phase === 'intro') {
    const a = Math.min(1, state.phaseT * 3)
    ctx.globalAlpha = a
    text(state.run.loop === 1 ? 'TALON' : `LOOP ${state.run.loop}`, W / 2, 330, 72, '#ff8aa0')
    text(world.arena.name.toUpperCase(), W / 2, 395, 28, '#e8f0ff')
    if (state.run.loop === 2) text('New: dive and tail sweep', W / 2, 440, 26, '#ffd84a')
    if (state.run.loop === 3) text('New: bouncing claw discs', W / 2, 440, 26, '#ffd84a')
    ctx.globalAlpha = 1
  }
  if (state.phase === 'victory') text('TALON DOWN', W / 2, 330, 72, '#ffd84a')
  if (state.phase === 'down') text('RIVET OFFLINE', W / 2, 330, 64, '#ff6a5a')
  if (state.phase === 'choose') drawChoose()
  // first-loop control hints
  if (state.hintT > 0 && state.phase === 'fight') {
    ctx.globalAlpha = Math.min(1, state.hintT)
    drawPrompts(ctx, playInput, [['a', 'Jump'], ['x', 'Shoot · hold to charge'], ['b', 'Dash'], ['menu', 'Pause']], { size: 24 * ts, y: H - 40 })
    ctx.globalAlpha = 1
  }
}

function drawChoose() {
  ctx.fillStyle = 'rgba(10,8,24,0.82)'
  ctx.fillRect(0, 0, W, H)
  text('PICK A PART', W / 2, 150, 54, '#e8f0ff')
  text(`Bolt it on and face Talon again: loop ${state.run.loop + 1}`, W / 2, 200, 24, '#9fb0e0')
  const m = chooseMenu
  m.items.forEach((it, i) => {
    const part = PARTS[it.id]
    const x = W / 2 - 490, y = 250 + i * (136 + 18), w = 980, h = 136
    const on = i === m.selected
    ctx.fillStyle = on ? '#1f3a4f' : 'rgba(255,255,255,0.06)'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = SLOT_COLOR[part.slot]
    ctx.fillRect(x, y, 10, h)
    if (on) { ctx.strokeStyle = '#43d3c0'; ctx.lineWidth = 4; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4); text('▶', x - 30, y + h / 2, 34, '#43d3c0') }
    const f = frame('parts', part.icon)
    const s = Math.min(100 / f.w, 100 / f.h)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(art.img.parts, f.x, f.y, f.w, f.h, x + 80 - (f.w * s) / 2, y + h / 2 - (f.h * s) / 2, f.w * s, f.h * s)
    text(part.name, x + 160, y + 40, 34, '#e8f0ff', 'left')
    text(part.slot.toUpperCase(), x + w - 30, y + 40, 22, SLOT_COLOR[part.slot], 'right')
    text(part.desc, x + 160, y + 84, 24, '#c9d2f0', 'left')
    const cur = state.run.parts[part.slot]
    if (cur) text(`Replaces ${PARTS[cur].name}`, x + 160, y + 116, 20, '#ff9a7a', 'left')
  })
  drawPrompts(ctx, input, [['up', 'Choose'], ['a', 'Bolt on']], { size: 24 * settings.data.textScale })
}

function drawTitle() {
  if (art.ready) {
    // backdrop: the arena background, slowly panning
    const off = Math.round((Math.sin(state.titleT * 0.15) + 1) * 40)
    g.drawImage(art.img.bg, -off, -40)
    g.fillStyle = 'rgba(16,10,40,0.35)'
    g.fillRect(0, 0, NW, NH)
    for (let x = 0; x < NW; x += 16) { tile(g, 'floor', (x / 16 & 1) * 16, 0, 16, 16, x, NH - 32); tile(g, 'floor', (x / 16 & 1) * 16, 16, 16, 16, x, NH - 16) }
    const fr = [0, 1][Math.floor(state.titleT * 2.5) % 2]
    drawFrame(g, 'rivet', fr, 92, NH - 32, 1)
    drawFrame(g, 'talon', [0, 1][Math.floor(state.titleT * 3) % 2], 236, NH - 32, -1)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(view, 0, 0, W, H)
  }
  ctx.fillStyle = 'rgba(10,8,24,0.45)'
  ctx.fillRect(0, 120, W, 600)
  text('OVERCLOCK', W / 2, 220, 120, '#43d3c0')
  text('Beat the boss. Bolt on a part. Fight it again, stronger.', W / 2, 310, 28, '#e8f0ff')
  text(save.data.bestLoop ? `Best: ${save.data.bestLoop} loop${save.data.bestLoop > 1 ? 's' : ''} cleared` : 'How many loops can you clear?', W / 2, 360, 24, '#ffd84a')
  titleMenu.draw(ctx, px(30))
  const kb = input.mode === 'keyboard'
  text(kb ? 'Z or Space jump · X or Shift shoot · C dash · arrows move' : 'Gameplay needs a controller or keyboard', W / 2, 690, 22, '#9fb0e0')
  drawPrompts(ctx, input, [['a', 'Choose'], ['menu', 'Pause in game']], { size: 24 * settings.data.textScale, y: 752 })
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(10,8,24,0.85)'
  ctx.fillRect(0, 0, W, H)
  const run = state.run
  text('RUN OVER', W / 2, 170, 72, '#ff6a5a')
  text(`Loops cleared: ${run.cleared}`, W / 2, 260, 40, '#e8f0ff')
  text(run.newBest ? 'New best!' : `Best: ${save.data.bestLoop}`, W / 2, 310, 28, '#ffd84a')
  const ids = Object.values(run.parts).filter(Boolean)
  text(ids.length ? ids.map((id) => PARTS[id].name).join(' · ') : 'No parts this run', W / 2, 370, 24, '#9fb0e0')
  const m = Math.floor(run.time / 60), s = Math.floor(run.time % 60)
  text(`Time ${m}:${String(s).padStart(2, '0')}`, W / 2, 410, 24, '#9fb0e0')
  overMenu.draw(ctx, px(30))
  drawPrompts(ctx, input, [['a', 'Choose']], { size: 24 * settings.data.textScale })
}

function drawDebug() {
  const world = state.world
  ctx.save()
  ctx.font = '500 16px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(8, H - 100, 560, 92)
  ctx.fillStyle = '#9fe'
  ctx.fillText(`screen ${state.screen} phase ${state.phase} mode ${input.mode}  fps ${fps.toFixed(0)}  dpr ${fit.dpr}`, 16, H - 92)
  if (world) {
    const p = world.players[0], b = world.boss
    ctx.fillText(`rivet ${p.x.toFixed(0)},${p.y.toFixed(0)} v ${p.vx.toFixed(0)},${p.vy.toFixed(0)} f${p.frame} hp ${p.hp}`, 16, H - 72)
    if (b) ctx.fillText(`talon ${b.state} ${b.t.toFixed(2)} hp ${b.hp.toFixed(0)}/${b.maxHp} p2 ${b.phase2}`, 16, H - 52)
    ctx.fillText(`shots ${world.shots.length} enemy ${world.enemyShots.length} fx ${world.fx.length}`, 16, H - 32)
    // hitboxes
    const cx = Math.round(world.cam.x), cy = Math.round(world.cam.y)
    ctx.strokeStyle = '#0f0'
    ctx.strokeRect((p.x - p.w / 2 - cx) * PX, (p.y - p.h - cy) * PX, p.w * PX, p.h * PX)
    if (b) {
      const bb = world.bossBox(b), hb = world.headBox(b)
      ctx.strokeStyle = '#f00'
      ctx.strokeRect((bb.x - cx) * PX, (bb.y - cy) * PX, bb.w * PX, bb.h * PX)
      ctx.strokeStyle = '#ff0'
      ctx.strokeRect((hb.x - cx) * PX, (hb.y - cy) * PX, hb.w * PX, hb.h * PX)
    }
  }
  ctx.restore()
}

let last = performance.now()
let fps = 60
function loop(now) {
  const dt = Math.min(1 / 20, (now - last) / 1000)
  last = now
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05
  input.update(dt)
  update(dt)
  flash = Math.max(0, flash - dt)
  draw()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
