// A vertical menu that works the same with a controller, a keyboard, a mouse and touch:
//   d-pad / stick / arrows / WASD move, A / Space / Enter choose, B / Esc go back,
//   hovering highlights, clicking or tapping chooses, right-click goes back.
// Use it for every menu (title, pause, game over, options) so no player gets stuck.
//
//   const pause = createMenu([{ id: 'resume', label: 'Resume' }, { id: 'quit', label: 'Quit to title' }])
//   // each frame, after input.update():
//   const choice = pause.update(input)   // 'resume', 'quit', 'back' (B / Esc / right-click) or null
//   pause.draw(ctx)

const MOVE_REPEAT_S = 0.18

/**
 * items: [{ id, label, disabled? }]. Options: center x and top y of the menu in game coordinates,
 * item width and height, gap between items, and colors.
 */
export function createMenu(items, options = {}) {
  const o = { x: 640, y: 420, width: 420, height: 64, gap: 14, accent: '#ffb547', text: '#eef0f5', idle: 'rgba(255,255,255,0.08)', ...options }
  let selected = Math.max(0, items.findIndex((i) => !i.disabled))
  let repeat = 0
  let lastY = 0

  const rect = (i) => ({ x: o.x - o.width / 2, y: o.y + i * (o.height + o.gap), w: o.width, h: o.height })
  const hit = (p, i) => {
    const r = rect(i)
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
  }
  const step = (dir) => {
    for (let n = 1; n <= items.length; n++) {
      const i = (selected + dir * n + items.length * n) % items.length
      if (!items[i].disabled) return (selected = i)
    }
  }

  return {
    items,
    get selected() {
      return items[selected]
    },
    select(id) {
      const i = items.findIndex((it) => it.id === id && !it.disabled)
      if (i >= 0) selected = i
    },

    /** Call once per frame. Returns the chosen item's id, 'back', or null. */
    update(input, dt = 1 / 60) {
      // Up/down: every press of the d-pad or a key moves one; holding (or the stick) repeats.
      const tap = input.pressed('up') ? -1 : input.pressed('down') ? 1 : 0
      const y = input.y < -0.5 ? -1 : input.y > 0.5 ? 1 : 0
      repeat -= dt
      if (tap || (y && (y !== lastY || repeat <= 0))) {
        step(tap || y)
        repeat = tap || y !== lastY ? MOVE_REPEAT_S * 2 : MOVE_REPEAT_S
      }
      lastY = y

      // Mouse and touch: hover highlights, a click or tap chooses.
      const p = input.pointer
      if (p?.active) {
        const over = items.findIndex((it, i) => !it.disabled && hit(p, i))
        if (over >= 0 && (input.mode === 'pointer' || p.pressed)) selected = over
        if (p.released && over >= 0 && over === selected) return items[over].id
      }

      if (input.pressed('a')) return items[selected]?.disabled ? null : items[selected].id
      if (input.pressed('b')) return 'back'
      return null
    },

    /** A plain default look; draw your own using menu.items, menu.selected and the same layout if you like. */
    draw(ctx, font = '600 30px system-ui, sans-serif') {
      ctx.save()
      ctx.font = font
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      items.forEach((it, i) => {
        const r = rect(i)
        const on = i === selected
        ctx.fillStyle = on ? o.accent : o.idle
        ctx.beginPath()
        ctx.roundRect(r.x, r.y, r.w, r.h, 14)
        ctx.fill()
        ctx.globalAlpha = it.disabled ? 0.4 : 1
        ctx.fillStyle = on ? '#1a1206' : o.text
        ctx.fillText(it.label, o.x, r.y + r.h / 2)
        ctx.globalAlpha = 1
      })
      ctx.restore()
    }
  }
}
