// {{NAME}}: starter game loop. Replace the contents of update() and draw() with the real game.
// Menus use menu.js, so they work with a controller, a keyboard, a mouse and touch alike.
import { input } from './input.js'
import { createMenu } from './menu.js'

const canvas = document.getElementById('game')
const ctx = canvas.getContext('2d')

// Draw in a fixed 1280×800 space (the Steam Deck screen) and scale to fit any window.
const W = 1280
const H = 800
function resize() {
  const scale = Math.min(innerWidth / W, innerHeight / H)
  canvas.width = Math.round(W * scale * devicePixelRatio)
  canvas.height = Math.round(H * scale * devicePixelRatio)
  canvas.style.width = `${W * scale}px`
  canvas.style.height = `${H * scale}px`
  canvas.style.margin = `${(innerHeight - H * scale) / 2}px auto`
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0)
}
addEventListener('resize', resize)
resize()
input.attach(canvas, W, H)

const titleMenu = createMenu([{ id: 'play', label: 'Play' }], { y: H / 2 + 60 })
const pauseMenu = createMenu(
  [
    { id: 'resume', label: 'Resume' },
    { id: 'title', label: 'Quit to title' }
  ],
  { y: H / 2 }
)
// A pause button for mouse and touch players (a controller uses Start, a keyboard Esc or P).
const PAUSE_BUTTON = { x: W - 88, y: 32, w: 56, h: 56 }
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

const state = {
  screen: 'title', // title | playing | paused
  player: { x: W / 2, y: H / 2 },
  best: Number(localStorage.getItem('best') ?? 0) // saves persist on the Deck
}

function update(dt) {
  if (state.screen === 'title') {
    if (titleMenu.update(input, dt) === 'play' || input.pressed('start')) state.screen = 'playing'
    return
  }
  if (state.screen === 'paused') {
    const choice = pauseMenu.update(input, dt)
    if (choice === 'resume' || choice === 'back' || input.pressed('start')) state.screen = 'playing'
    if (choice === 'title') state.screen = 'title'
    return
  }
  const clickedPause = input.pointer.pressed && inside(input.pointer, PAUSE_BUTTON)
  if (input.pressed('start') || input.pressed('b') || clickedPause) {
    pauseMenu.select('resume')
    state.screen = 'paused'
    return
  }
  state.player.x = Math.max(24, Math.min(W - 24, state.player.x + input.x * 420 * dt))
  state.player.y = Math.max(24, Math.min(H - 24, state.player.y + input.y * 420 * dt))
}

function draw() {
  ctx.fillStyle = '#141a2a'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ffb547'
  ctx.beginPath()
  ctx.arc(state.player.x, state.player.y, 24, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#eef0f5'
  ctx.textAlign = 'center'
  if (state.screen === 'title') {
    ctx.font = '700 72px system-ui, sans-serif'
    ctx.fillText('{{NAME}}', W / 2, H / 2 - 80)
    titleMenu.draw(ctx)
    ctx.font = '500 24px system-ui, sans-serif'
    ctx.fillText(`Press ${input.label('a')} to start`, W / 2, H / 2 + 180)
  } else if (state.screen === 'playing') {
    // Pause button: two bars, top-right, clear of the outermost 32px.
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath()
    ctx.roundRect(PAUSE_BUTTON.x, PAUSE_BUTTON.y, PAUSE_BUTTON.w, PAUSE_BUTTON.h, 12)
    ctx.fill()
    ctx.fillStyle = '#eef0f5'
    ctx.fillRect(PAUSE_BUTTON.x + 18, PAUSE_BUTTON.y + 16, 7, 24)
    ctx.fillRect(PAUSE_BUTTON.x + 31, PAUSE_BUTTON.y + 16, 7, 24)
  } else if (state.screen === 'paused') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#eef0f5'
    ctx.font = '700 56px system-ui, sans-serif'
    ctx.fillText('Paused', W / 2, H / 2 - 80)
    pauseMenu.draw(ctx)
  }
}

let last = performance.now()
function frame(now) {
  const dt = Math.min(1 / 20, (now - last) / 1000)
  last = now
  input.update()
  update(dt)
  draw()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
