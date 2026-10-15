// Controller + keyboard input for the Steam Deck (standard gamepad mapping).
// Call input.update() once per frame, then read input.x / input.y (-1..1),
// input.held('a') and input.pressed('a') (true only on the frame it went down).
//
// Buttons: a, b, x, y, lb, rb, lt, rt, select, start, up, down, left, right.
// Keyboard: arrows/WASD move, Space/Enter = a, Escape/Backspace = b, Shift = x, E = y, P = start.
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

const keysDown = new Set()
addEventListener('keydown', (e) => {
  if (KEYS[e.code]) {
    keysDown.add(KEYS[e.code])
    e.preventDefault()
  }
})
addEventListener('keyup', (e) => keysDown.delete(KEYS[e.code]))
addEventListener('blur', () => keysDown.clear())

let now = new Set()
let before = new Set()

export const input = {
  x: 0,
  y: 0,
  /** Right stick, for twin-stick games. */
  aimX: 0,
  aimY: 0,
  usingGamepad: false,

  update() {
    before = now
    now = new Set(keysDown)
    let x = 0
    let y = 0
    let aimX = 0
    let aimY = 0
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue
      pad.buttons.forEach((b, i) => {
        if (b.pressed && BUTTONS[i]) {
          now.add(BUTTONS[i])
          this.usingGamepad = true
        }
      })
      const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes
      if (Math.hypot(lx, ly) > DEADZONE) {
        x += lx
        y += ly
        this.usingGamepad = true
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
    if (keysDown.size) this.usingGamepad = false
  },

  held: (button) => now.has(button),
  pressed: (button) => now.has(button) && !before.has(button),

  /** Label for on-screen prompts, e.g. `Press ${input.label('a')} to start`. */
  label(button) {
    if (this.usingGamepad) return { a: 'A', b: 'B', x: 'X', y: 'Y', start: '☰', select: '⧉' }[button] ?? button.toUpperCase()
    return { a: 'Space', b: 'Esc', x: 'Shift', y: 'E', start: 'P' }[button] ?? button
  }
}
