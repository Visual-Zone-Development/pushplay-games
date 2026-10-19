// Controller, keyboard and mouse/touch input. Games run on a Steam Deck and on Linux, Windows and
// Mac PCs, so every action needs to work with each (standard gamepad mapping).
// Call input.update() once per frame, then read input.x / input.y (-1..1),
// input.held('a') and input.pressed('a') (true only on the frame it went down).
//
// Buttons: a, b, x, y, lb, rb, lt, rt, select, start, up, down, left, right.
// Keyboard: arrows/WASD move, Space/Enter = a, Escape/Backspace = b, Shift = x, E = y, P = start.
// Mouse/touch: input.pointer, in the game's 1280×800 space once input.attach(canvas) is called;
// right-click = b.
// Don't use select+start together: the launcher reserves that combo for its pause menu.

const BUTTONS = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'select', 'start', 'ls', 'rs', 'up', 'down', 'left', 'right']
const KEYS = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'a',
  Enter: 'a',
  Escape: 'b',
  Backspace: 'b',
  ShiftLeft: 'x',
  KeyE: 'y',
  KeyP: 'start'
}
const DEADZONE = 0.2
const PAD_LABELS = { a: 'A', b: 'B', x: 'X', y: 'Y', start: '☰', select: '⧉' }
const KEY_LABELS = { a: 'Space', b: 'Esc', x: 'Shift', y: 'E', start: 'P' }

const keysDown = new Set()
/** Keys pressed since the last update, so a tap shorter than a frame still counts. */
const tapped = new Set()
addEventListener('keydown', (e) => {
  if (KEYS[e.code]) {
    keysDown.add(KEYS[e.code])
    tapped.add(KEYS[e.code])
    input.mode = 'keyboard'
    e.preventDefault()
  }
})
addEventListener('keyup', (e) => keysDown.delete(KEYS[e.code]))
addEventListener('blur', () => keysDown.clear())

let now = new Set()
let before = new Set()
let pointerDown = false
// Went down / came up since the last update: a quick click or tap can do both between frames.
let pointerWentDown = false
let pointerWentUp = false
/** A right-click counts as one press of b (back), like Esc. */
let rightClick = false

export const input = {
  x: 0,
  y: 0,
  /** Right stick, for twin-stick games. */
  aimX: 0,
  aimY: 0,
  /** What the player last used: 'gamepad', 'keyboard' or 'pointer' (mouse or touch). */
  mode: 'keyboard',
  get usingGamepad() {
    return this.mode === 'gamepad'
  },
  /**
   * Mouse or touch, in game coordinates: x, y, down (held), pressed (went down this frame),
   * released (came up this frame). active is false until the pointer is first used.
   */
  pointer: { x: 0, y: 0, down: false, pressed: false, released: false, active: false },

  /**
   * Track the mouse and touch on the game's canvas, converted to a w×h drawing space
   * (1280×800 unless the game draws at another size).
   */
  attach(canvas, w = 1280, h = 800) {
    const place = (e) => {
      const r = canvas.getBoundingClientRect()
      this.pointer.x = ((e.clientX - r.left) / r.width) * w
      this.pointer.y = ((e.clientY - r.top) / r.height) * h
      this.pointer.active = true
    }
    canvas.addEventListener('pointermove', (e) => {
      place(e)
      if (e.movementX || e.movementY || e.pointerType !== 'mouse') this.mode = 'pointer'
    })
    canvas.addEventListener('pointerdown', (e) => {
      place(e)
      if (e.button === 2) {
        rightClick = true
        return
      }
      pointerDown = true
      pointerWentDown = true
      this.mode = 'pointer'
      canvas.setPointerCapture?.(e.pointerId)
    })
    canvas.addEventListener('pointerup', (e) => {
      place(e)
      if (!pointerDown) return
      pointerDown = false
      pointerWentUp = true
    })
    canvas.addEventListener('pointercancel', () => (pointerDown = false))
    // Right-click is b (back), not the browser's menu.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.style.touchAction = 'none'
  },

  update() {
    before = now
    now = new Set([...keysDown, ...tapped])
    tapped.clear()
    if (rightClick) now.add('b')
    rightClick = false
    let x = 0
    let y = 0
    let aimX = 0
    let aimY = 0
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue
      pad.buttons.forEach((b, i) => {
        if (b.pressed && BUTTONS[i]) {
          now.add(BUTTONS[i])
          this.mode = 'gamepad'
        }
      })
      const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes
      if (Math.hypot(lx, ly) > DEADZONE) {
        x += lx
        y += ly
        this.mode = 'gamepad'
      }
      if (Math.hypot(rx, ry) > DEADZONE) {
        aimX += rx
        aimY += ry
      }
    }
    if (now.has('left')) x -= 1
    if (now.has('right')) x += 1
    if (now.has('up')) y -= 1
    if (now.has('down')) y += 1
    const len = Math.hypot(x, y)
    this.x = len > 1 ? x / len : x
    this.y = len > 1 ? y / len : y
    this.aimX = aimX
    this.aimY = aimY

    this.pointer.pressed = pointerWentDown
    this.pointer.released = pointerWentUp
    this.pointer.down = pointerDown
    pointerWentDown = pointerWentUp = false
  },

  held: (button) => now.has(button),
  pressed: (button) => now.has(button) && !before.has(button),

  /**
   * Label for on-screen prompts, e.g. `Press ${input.label('a')} to start`: the controller button
   * with a pad, otherwise the key (a mouse player has a keyboard too, and menus are clickable).
   */
  label(button) {
    if (this.mode === 'gamepad') return PAD_LABELS[button] ?? button.toUpperCase()
    return KEY_LABELS[button] ?? button
  }
}
