// Marble Maze: tilt the phone like a tray to roll the marble to the flag. Holes send it back
// to the start; gems are a bonus; hold BRAKE (the phone's button) to stop. 90 s, as many mazes
// as you can.
import { C, clamp, gloss, glossFill, groundShadow, panel, rrect, shade, star, text } from '../gfx.js'
import { LEVELS } from './maze-levels.js'

const TILE = 46
const COLS = 25
const ROWS = 14
const X0 = (1280 - COLS * TILE) / 2
const Y0 = 104

export default {
  id: 'maze',
  name: 'Marble Maze',
  blurb: 'Tilt to roll',
  phoneHint: 'Tilt like a tray to roll the marble. Hold BRAKE to stop.',
  // Level is however you hold the phone when the round starts (not a pose saved from another station).
  centerOnReady: 'Hold the phone comfortably: that is level',
  btn: 'BRAKE',
  music: { bpm: 96, root: 55, gain: 0.05, chords: [0, 3, 5, 3] },
  icon(ctx, x, y, s) {
    ctx.save()
    rrect(ctx, x - s * 0.45, y - s * 0.45, s * 0.9, s * 0.9, s * 0.14)
    ctx.lineWidth = s * 0.06
    ctx.strokeStyle = C.dark
    ctx.stroke()
    glossFill(ctx, C.teal, x - s * 0.45, y - s * 0.45, s * 0.9, s * 0.9)
    ctx.fillStyle = shade('#2b3a78', -0.2)
    ctx.fillRect(x - s * 0.1, y - s * 0.45, s * 0.1, s * 0.5)
    ctx.fillRect(x - s * 0.45, y + s * 0.12, s * 0.4, s * 0.1)
    ctx.beginPath()
    ctx.arc(x + s * 0.22, y + s * 0.22, s * 0.1, 0, Math.PI * 2)
    ctx.fill()
    gloss(ctx, x - s * 0.25, y - s * 0.22, s * 0.13, C.orange)
    ctx.restore()
  },
  howTo: (input) => `${input.mode === 'touch' || input.mode === 'mouse' ? 'Hold the pointer where to roll' : 'Tilt to roll'} · reach the flag`,
  create(env) {
    const { motion, sfx, fx, input, TUNING } = env
    const T = TUNING.maze
    let level = 0
    let grid = []
    let gems = []
    let start = { x: 0, y: 0 }
    let goal = { x: 0, y: 0 }
    const ball = { x: 0, y: 0, vx: 0, vy: 0, falling: 0, spin: 0 }
    let rollTimer = 0
    let goalAnim = 0
    const run = {
      score: 0,
      done: false,
      timeLeft: T.time,
      cleared: 0,
      gemsTaken: 0,
      falls: 0,
      update,
      draw,
      stats: () => [
        ['Mazes cleared', run.cleared],
        ['Gems', run.gemsTaken],
        ['Falls', run.falls]
      ],
      prompts: (input) => [
        ['a', 'Brake'],
        ['y', 'Re-center'],
        ['menu', 'Pause']
      ]
    }
    load(0)

    function load(i) {
      level = i
      const rows = LEVELS[i % LEVELS.length]
      // Every second lap is mirrored so repeats don't feel the same.
      const flip = Math.floor(i / LEVELS.length) % 2 === 1
      grid = rows.map((r) => [...(flip ? [...r].reverse().join('') : r)])
      gems = []
      grid.forEach((r, y) =>
        r.forEach((c, x) => {
          const p = { x: X0 + (x + 0.5) * TILE, y: Y0 + (y + 0.5) * TILE }
          if (c === 'S') start = p
          if (c === 'G') goal = p
          if (c === '*') gems.push({ ...p, taken: false })
        })
      )
      respawn()
    }
    function respawn() {
      Object.assign(ball, { x: start.x, y: start.y, vx: 0, vy: 0, falling: 0 })
    }
    const solid = (cx, cy) => grid[cy]?.[cx] === '#' || cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS

    function update(dt) {
      run.timeLeft -= dt
      if (run.timeLeft <= 0) {
        run.done = true
        return
      }
      goalAnim += dt
      if (ball.falling > 0) {
        ball.falling -= dt
        if (ball.falling <= 0) respawn()
        return
      }
      // Tilt, or the pointer: hold where the marble should roll.
      let ax = motion.tilt.x
      let ay = motion.tilt.y
      const p = input.pointer
      if (p.down && motion.source !== 'phone' && p.y > 100) {
        ax = clamp((p.x - ball.x) / 220, -1, 1)
        ay = clamp((p.y - ball.y) / 220, -1, 1)
      }
      ball.vx += ax * T.accel * dt
      ball.vy += ay * T.accel * dt
      // Steering assist: with only acceleration, a marble you tilt toward a target swings past it
      // and ends up circling it (the tilt arrives a little late over the network, and sideways
      // speed never goes away). So speed across the tilt direction bleeds off, and speed against
      // it brakes harder: the marble heads where you tilt instead of orbiting it.
      const tl = Math.hypot(ax, ay)
      if (tl > 0.12) {
        const nx = ax / tl
        const ny = ay / tl
        let along = ball.vx * nx + ball.vy * ny
        const px = ball.vx - along * nx
        const py = ball.vy - along * ny
        const side = Math.exp(-T.steer * Math.min(1, tl * 1.5) * dt)
        if (along < 0) along *= Math.exp(-T.reverse * dt)
        ball.vx = along * nx + px * side
        ball.vy = along * ny + py * side
      }
      const damp = Math.exp(-(motion.fireHeld ? T.brake : T.friction) * dt)
      ball.vx *= damp
      ball.vy *= damp
      const sp = Math.hypot(ball.vx, ball.vy)
      if (sp > T.maxSpeed) {
        ball.vx *= T.maxSpeed / sp
        ball.vy *= T.maxSpeed / sp
      }
      // Move in small steps so it never skips through a wall.
      const steps = Math.ceil((sp * dt) / 6) || 1
      for (let i = 0; i < steps; i++) {
        ball.x += (ball.vx * dt) / steps
        collide('x')
        ball.y += (ball.vy * dt) / steps
        collide('y')
      }
      ball.spin += (sp * dt) / T.radius
      rollTimer -= dt
      if (sp > 60 && rollTimer <= 0) {
        rollTimer = 0.07
        sfx.roll(sp)
      }

      // Holes, gems, goal.
      const cx = Math.floor((ball.x - X0) / TILE)
      const cy = Math.floor((ball.y - Y0) / TILE)
      for (let y = cy - 1; y <= cy + 1; y++)
        for (let x = cx - 1; x <= cx + 1; x++) {
          if (grid[y]?.[x] !== 'O') continue
          const hx = X0 + (x + 0.5) * TILE
          const hy = Y0 + (y + 0.5) * TILE
          if (Math.hypot(ball.x - hx, ball.y - hy) < T.holeRadius) {
            ball.falling = 0.6
            ball.x = hx
            ball.y = hy
            run.falls++
            sfx.fall()
            motion.buzz(120)
            fx.kick(6)
            fx.float(hx, hy - 30, 'Oops!', C.pink, 32)
            return
          }
        }
      for (const g of gems) {
        if (g.taken || Math.hypot(ball.x - g.x, ball.y - g.y) > 26) continue
        g.taken = true
        run.gemsTaken++
        run.score += T.gemScore
        sfx.gem()
        motion.buzz(20)
        fx.burst(g.x, g.y, C.gold, 14, 260, { gravity: 0, life: 0.5 })
        fx.float(g.x, g.y - 24, `+${T.gemScore}`, C.gold, 28)
      }
      if (Math.hypot(ball.x - goal.x, ball.y - goal.y) < 24) {
        run.cleared++
        run.score += T.levelScore
        sfx.goal()
        motion.buzz(60)
        fx.burst(goal.x, goal.y, C.lime, 30, 520)
        fx.blink(0.25, C.lime)
        fx.hitstop(0.12)
        fx.float(640, 400, 'CLEAR!', C.lime, 72)
        load(level + 1)
      }
    }

    function collide(axis) {
      const r = T.radius
      const x0 = Math.floor((ball.x - r - X0) / TILE)
      const x1 = Math.floor((ball.x + r - X0) / TILE)
      const y0 = Math.floor((ball.y - r - Y0) / TILE)
      const y1 = Math.floor((ball.y + r - Y0) / TILE)
      for (let ty = y0; ty <= y1; ty++)
        for (let tx = x0; tx <= x1; tx++) {
          if (!solid(tx, ty)) continue
          // Closest point on the tile to the ball.
          const left = X0 + tx * TILE
          const top = Y0 + ty * TILE
          const nx = clamp(ball.x, left, left + TILE)
          const ny = clamp(ball.y, top, top + TILE)
          const dx = ball.x - nx
          const dy = ball.y - ny
          const d = Math.hypot(dx, dy)
          if (d >= r || d === 0) continue
          const push = r - d
          ball.x += (dx / d) * push
          ball.y += (dy / d) * push
          const v = axis === 'x' ? ball.vx : ball.vy
          if (Math.abs(v) > 140) sfx.clack(Math.abs(v))
          if (Math.abs(dx) > Math.abs(dy)) ball.vx *= -T.bounce
          else ball.vy *= -T.bounce
        }
    }

    // The board is baked once per maze: a tray with raised plastic walls lit from the upper left,
    // and holes sunk into it. Only the moving parts are drawn each frame.
    let baked = null
    let bakedFor = null
    function bakeBoard() {
      const bw = COLS * TILE + 20
      const bh = ROWS * TILE + 20
      const c = document.createElement('canvas')
      c.width = (bw + 20) * 2
      c.height = (bh + 20) * 2
      const g = c.getContext('2d')
      g.scale(2, 2)
      g.translate(-(X0 - 20), -(Y0 - 20))
      panel(g, X0 - 10, Y0 - 10, bw, bh, { fill: '#2b3a78', r: 18, lw: 6 })
      const floor = g.createRadialGradient(X0 + 300, Y0 + 120, 40, X0 + 500, Y0 + 300, 900)
      floor.addColorStop(0, '#34478f')
      floor.addColorStop(1, '#1d285a')
      g.fillStyle = floor
      g.fillRect(X0, Y0, COLS * TILE, ROWS * TILE)
      g.save()
      g.beginPath()
      g.rect(X0, Y0, COLS * TILE, ROWS * TILE)
      g.clip()
      g.strokeStyle = 'rgba(255,255,255,0.035)'
      g.lineWidth = 1
      for (let i = 0; i < COLS * TILE + ROWS * TILE; i += 9) {
        g.beginPath()
        g.moveTo(X0 + i, Y0)
        g.lineTo(X0 + i - ROWS * TILE, Y0 + ROWS * TILE)
        g.stroke()
      }
      const wall = (x, y) => y < 0 || y >= ROWS || x < 0 || x >= COLS || grid[y][x] === '#'
      // shadows the walls cast down and to the right
      g.fillStyle = 'rgba(3,5,18,0.45)'
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) if (grid[y][x] === '#') g.fillRect(X0 + x * TILE + 6, Y0 + y * TILE + 8, TILE, TILE)
      // holes: a dark pit whose far (lower-right) wall catches the light
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          if (grid[y][x] !== 'O') continue
          const cx = X0 + x * TILE + TILE / 2
          const cy = Y0 + y * TILE + TILE / 2
          const pit = g.createRadialGradient(cx - 5, cy - 6, 2, cx, cy, 21)
          pit.addColorStop(0, '#02030c')
          pit.addColorStop(0.7, '#090d24')
          pit.addColorStop(1, '#4a3270')
          g.fillStyle = pit
          g.beginPath()
          g.arc(cx, cy, 20, 0, Math.PI * 2)
          g.fill()
          g.lineWidth = 4
          g.strokeStyle = C.pink
          g.stroke()
          g.strokeStyle = 'rgba(255,255,255,0.4)'
          g.lineWidth = 2
          g.beginPath()
          g.arc(cx, cy, 21, Math.PI * 1.05, Math.PI * 1.6)
          g.stroke()
        }
      // raised walls: one light across the whole board (so walls read as continuous plastic),
      // shaded lips where a wall meets the floor, an ink edge
      const body = g.createLinearGradient(X0, Y0, X0 + COLS * TILE * 0.5, Y0 + ROWS * TILE)
      body.addColorStop(0, '#52ebe2')
      body.addColorStop(1, '#1ea8a2')
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          if (grid[y][x] !== '#') continue
          const px = X0 + x * TILE
          const py = Y0 + y * TILE
          g.fillStyle = body
          g.fillRect(px - 0.5, py - 0.5, TILE + 1, TILE + 1)
          if (!wall(x, y - 1)) {
            g.fillStyle = 'rgba(255,255,255,0.6)'
            g.fillRect(px, py, TILE, 4)
          }
          if (!wall(x - 1, y)) {
            g.fillStyle = 'rgba(255,255,255,0.3)'
            g.fillRect(px, py, 3, TILE)
          }
          if (!wall(x, y + 1)) {
            g.fillStyle = shade(C.teal, -0.45)
            g.fillRect(px, py + TILE - 8, TILE, 8)
          }
          if (!wall(x + 1, y)) {
            g.fillStyle = shade(C.teal, -0.3)
            g.fillRect(px + TILE - 5, py, 5, TILE)
          }
          g.fillStyle = C.dark
          if (!wall(x, y - 1)) g.fillRect(px, py - 1.5, TILE, 3)
          if (!wall(x, y + 1)) g.fillRect(px, py + TILE - 1.5, TILE, 3)
          if (!wall(x - 1, y)) g.fillRect(px - 1.5, py, 3, TILE)
          if (!wall(x + 1, y)) g.fillRect(px + TILE - 1.5, py, 3, TILE)
        }
      g.restore()
      baked = c
      bakedFor = grid
    }

    function draw(ctx) {
      if (bakedFor !== grid) bakeBoard()
      ctx.drawImage(baked, X0 - 20, Y0 - 20, COLS * TILE + 40, ROWS * TILE + 40)
      // Start pad and goal flag.
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 4
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.arc(start.x, start.y, 19, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      groundShadow(ctx, goal.x + 4, goal.y + 6, 26, 14, 0.45)
      gloss(ctx, goal.x, goal.y, 20 + Math.sin(goalAnim * 5) * 3, C.lime, { edge: 4 })
      ctx.fillStyle = C.dark
      ctx.fillRect(goal.x - 2, goal.y - 34, 4, 34)
      ctx.beginPath()
      ctx.moveTo(goal.x + 2, goal.y - 34)
      ctx.lineTo(goal.x + 24, goal.y - 27)
      ctx.lineTo(goal.x + 2, goal.y - 20)
      ctx.closePath()
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      ctx.strokeStyle = C.dark
      ctx.stroke()
      glossFill(ctx, C.pink, goal.x, goal.y - 34, 24, 14)
      for (const g of gems) {
        if (g.taken) continue
        const gy = g.y + Math.sin(goalAnim * 4 + g.x) * 2
        groundShadow(ctx, g.x + 3, g.y + 12, 14, 5, 0.4)
        star(ctx, g.x, gy, 15, 7, 5)
        ctx.lineWidth = 4
        ctx.lineJoin = 'round'
        ctx.strokeStyle = C.dark
        ctx.stroke()
        glossFill(ctx, C.gold, g.x - 15, gy - 15, 30, 30)
      }
      // Marble with a rolling highlight; shrinks while it falls.
      const k = ball.falling > 0 ? ball.falling / 0.6 : 1
      const r = T.radius * k
      if (r > 0.5) {
        groundShadow(ctx, ball.x + 5, ball.y + 7, r * 1.3, r * 0.9, 0.5)
        gloss(ctx, ball.x, ball.y, r, C.orange, { edge: 4, shine: 0 })
        // a stripe that rolls with the marble; the shine stays put, like real light
        ctx.save()
        ctx.beginPath()
        ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2)
        ctx.clip()
        ctx.strokeStyle = 'rgba(255,240,220,0.5)'
        ctx.lineWidth = r * 0.22
        ctx.beginPath()
        ctx.ellipse(ball.x, ball.y, r * Math.abs(Math.cos(ball.spin)) + 0.5, r, 0.4, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.beginPath()
        ctx.ellipse(ball.x - r * 0.38, ball.y - r * 0.42, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2)
        ctx.fill()
      }
      // Tilt arrow from the marble, so the input is visible.
      const tl = Math.hypot(motion.tilt.x, motion.tilt.y)
      if (tl > 0.08 && ball.falling <= 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(ball.x, ball.y)
        ctx.lineTo(ball.x + motion.tilt.x * 60, ball.y + motion.tilt.y * 60)
        ctx.stroke()
      }
      if (motion.fireHeld) text(ctx, 'BRAKE', ball.x, ball.y - 32, { size: 20, weight: 900, color: C.gold, outline: 6 })
      text(ctx, `Maze ${level + 1}`, 1280 - 140, 128, { size: 22, weight: 800, align: 'right', color: C.ink, outline: 6 })
    }

    return run
  }
}
