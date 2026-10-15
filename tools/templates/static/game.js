// {{NAME}}: starter game loop. Replace the contents of update() and draw() with the real game.
import { input } from './input.js'

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

const state = {
  screen: 'title', // title | playing | paused
  player: { x: W / 2, y: H / 2 },
  best: Number(localStorage.getItem('best') ?? 0) // saves persist on the Deck
}

function update(dt) {
  if (state.screen === 'title') {
    if (input.pressed('a') || input.pressed('start')) state.screen = 'playing'
    return
  }
  if (input.pressed('start')) state.screen = state.screen === 'paused' ? 'playing' : 'paused'
  if (state.screen === 'paused') {
    if (input.pressed('b')) state.screen = 'title'
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
    ctx.font = '500 28px system-ui, sans-serif'
    ctx.fillText(`Press ${input.label('a')} to start`, W / 2, H / 2 + 120)
  } else if (state.screen === 'paused') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#eef0f5'
    ctx.font = '700 56px system-ui, sans-serif'
    ctx.fillText('Paused', W / 2, H / 2)
    ctx.font = '500 24px system-ui, sans-serif'
    ctx.fillText(`${input.label('start')} resume · ${input.label('b')} quit to title`, W / 2, H / 2 + 60)
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
