// Rooftop Run: a one-button endless runner across city rooftops at dusk. The runner never stops;
// tap to hop, hold to fly further. Rooftops, gaps and obstacles are generated ahead of you, and
// every gap is checked against the real jump (same integrator as the game) so it's always makeable.
// Style: dusk silhouettes — orange-to-violet sky, a big low sun, three baked parallax skylines,
// deep purple rooftops with lit windows and a crisp black runner with a trailing red scarf.
import { W, H, TAU, clamp, lerp, rand, approach, label, createFx } from '../common.js'

export const TUNING = {
  // speed (px/s): ramps every second until speedMax
  speedStart: 440,
  speedMax: 940,
  speedRamp: 10,
  stumbleKeep: 0.78, // speed kept after clipping a chimney or AC unit
  speedRecover: 1.6, // rate back up to the ramp speed after a stumble
  // jump
  gravity: 2900,
  fallMult: 1.18,
  maxFall: 1500,
  jumpSpeed: 920,
  holdGravity: 0.42, // gravity multiplier while the button is held on the way up
  holdMax: 0.27, // seconds the hold keeps working (full jump ≈ 264 px high)
  minHold: 0.07, // even a tap gets this much lift (≈ 91 px)
  jumpCut: 0.5, // upward speed kept on release
  coyote: 0.1,
  buffer: 0.13,
  ledgeSnap: 14, // land on a roof edge even if your feet are this far below it
  // body
  halfW: 13,
  foot: 9,
  bodyH: 62,
  stride: 150, // px per full run cycle
  // generation (d = difficulty 0..1 over rampSeconds)
  rampSeconds: 55,
  gapSafety: 0.8, // gaps are at most this fraction of the full-jump reach (minus body width)
  gapMin: 110,
  gapFrac: [
    [0.2, 0.55],
    [0.62, 1]
  ], // [min, max] fraction of the safe gap at d = 0 and d = 1
  maxRiseFrac: 0.5, // next roof at most this fraction of the full jump height above
  maxDrop: 170,
  topMin: 460,
  topMax: 630,
  roofTime: [
    [1.5, 2.8],
    [0.85, 1.7]
  ], // roof length in seconds of running at d = 0 and d = 1
  obstacleChance: [0.3, 0.9],
  doubleChance: [0.05, 0.55],
  obstacleHold: 0.15, // obstacles must be clearable with a press this short…
  obstacleSlack: 0.07, // …with this many seconds of timing slack
  landRunTime: 0.22, // seconds of clear roof after a full-jump landing
  edgeRunTime: 0.3, // seconds of clear roof before an edge
  genAhead: 3200,
  // pickups and score
  starR: 38,
  starSpacing: 58,
  starArcChance: 0.8,
  streakWindow: 1.3,
  pxPerMetre: 60,
  starPoints: 2,
  closeEdge: 34, // land this close to a roof's edge for a "Close!"
  closeBonus: 10,
  hardLand: 1180, // fall speed that shakes the screen
  birdScare: 260,
  camLead: 300,
  lookAhead: 0.22 // extra camera lead per px/s above the start speed
}

// ---- pure simulation (also driven headlessly by a bot to set the medals) -----------------------
const STEP = 1 / 120

function mulberry(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One airborne step. b = { vy, y, air, cut }. Shared by the game and the reach tables. */
function airStep(b, h, T, holding) {
  const hold = !b.cut && (holding || b.air < T.minHold)
  if (!hold && !b.cut) {
    b.cut = true
    if (b.vy < 0) b.vy *= T.jumpCut
  }
  let g = T.gravity
  if (hold && b.vy < 0 && b.air < T.holdMax) g *= T.holdGravity
  if (b.vy > 0) g *= T.fallMult
  b.air += h
  b.vy = Math.min(T.maxFall, b.vy + g * h)
  b.y += b.vy * h
}

/** The jump path from take-off (0,0) at a fixed speed, holding for holdTime seconds. */
export function jumpArc(T, speed, holdTime = Infinity, maxDrop = 420) {
  const b = { vy: -T.jumpSpeed, y: 0, air: 0, cut: false }
  const pts = [{ x: 0, y: 0, vy: b.vy }]
  let x = 0
  while (b.y < maxDrop && pts.length < 2000) {
    airStep(b, STEP, T, b.air < holdTime)
    x += speed * STEP
    pts.push({ x, y: b.y, vy: b.vy })
  }
  return pts
}
const apexOf = (pts) => -Math.min(...pts.map((p) => p.y))
/** Horizontal distance until the path comes back down to dh (positive = lower). */
function landX(pts, dh) {
  for (let i = 1; i < pts.length; i++) if (pts[i].vy > 0 && pts[i].y >= dh) return pts[i].x
  return 0
}
/** [x1, x2] where the path is at least h above take-off. */
function above(pts, h) {
  let x1 = -1
  let x2 = -1
  for (const p of pts) if (-p.y >= h) ((x1 = x1 < 0 ? p.x : x1), (x2 = p.x))
  return x1 < 0 ? null : [x1, x2]
}

export function createSim(T, rng = Math.random) {
  const R = (a, b) => a + rng() * (b - a)
  const full0 = jumpArc(T, 1)
  const apexFull = apexOf(full0)
  const apexTap = apexOf(jumpArc(T, 1, T.obstacleHold))
  const speedAt = (t) => Math.min(T.speedMax, T.speedStart + T.speedRamp * t)
  const START_X = 200

  const s = {
    t: 0,
    speed: T.speedStart,
    p: { x: START_X, y: 560, vy: 0, ground: true, on: null, from: null, coyote: 0, buffer: 0, air: 0, cut: true, wall: false, squash: 0 },
    roofs: [],
    stars: [],
    birds: [],
    events: [],
    starsGot: 0,
    closes: 0,
    bumps: 0,
    jumps: 0,
    streak: 0,
    lastStar: -9,
    falling: false,
    over: false,
    distance: 0,
    score: 0,
    apexFull,
    apexTap,
    startX: START_X,
    speedAt
  }
  const first = { x: -500, w: 2000, top: 560, seed: 1, obs: [], kind: 0, gapBefore: 0 }
  first.style = 0
  s.roofs.push(first)
  s.p.on = { ref: first, roof: first, x0: first.x, x1: first.x + first.w, top: first.top }
  s.p.from = first
  s.p.y = first.top

  function addStarArc(edgeX, top, pts, x0, fromX, toX, limit = 5) {
    let next = fromX
    let n = 0
    for (const q of pts) {
      const x = x0 + q.x
      if (x < next || x > toX) continue
      s.stars.push({ x, y: top + q.y - 36, got: false, ph: rng() * TAU })
      next = x + T.starSpacing
      if (++n >= limit) break
    }
  }

  function addRoof() {
    const last = s.roofs[s.roofs.length - 1]
    const edge = last.x + last.w
    const v = speedAt(s.t) // fairness speed: the slowest you can be going when you get there
    const vArrive = speedAt(s.t + Math.max(0, edge - s.p.x) / Math.max(200, s.speed))
    const d = clamp(s.t / T.rampSeconds, 0, 1)
    // height: rises are capped by the jump, drops by taste
    let top = last.top + (rng() < 0.45 ? R(-T.maxRiseFrac * apexFull, -20) : R(0, T.maxDrop))
    if (rng() < 0.2) top = last.top
    top = Math.round(clamp(top, T.topMin, T.topMax))
    const dh = top - last.top
    const full = jumpArc(T, v)
    const safe = landX(full, dh) * T.gapSafety - 2 * T.halfW
    const gf = T.gapFrac
    const f = R(lerp(gf[0][0], gf[1][0], d), lerp(gf[0][1], gf[1][1], d))
    const gap = Math.round(Math.max(T.gapMin, Math.min(safe, safe * f)))
    const x = edge + gap
    const rt = T.roofTime
    const w = Math.round(Math.max(420, vArrive * R(lerp(rt[0][0], rt[1][0], d), lerp(rt[0][1], rt[1][1], d))))
    const roof = { x, w, top, seed: Math.floor(rng() * 1e6), obs: [], style: Math.floor(rng() * 3), gapBefore: gap }
    s.roofs.push(roof)

    // stars along a good arc over the gap (centred so a well-timed full jump collects them)
    if (rng() < T.starArcChance) {
      const arc = jumpArc(T, vArrive)
      const reachX = landX(arc, dh)
      const lead = Math.max(20, (reachX - gap) / 2)
      addStarArc(edge, last.top, arc, edge - lead, edge - lead + 50, x + 30)
    }

    // obstacles: hop-able with a short press, with clear roof before and after
    const fullArr = jumpArc(T, vArrive)
    const landRun = Math.max(150, landX(fullArr, 0) - gap + vArrive * T.landRunTime)
    const edgeRun = vArrive * T.edgeRunTime + 60
    let n = 0
    if (rng() < lerp(T.obstacleChance[0], T.obstacleChance[1], d)) n = rng() < lerp(T.doubleChance[0], T.doubleChance[1], d) ? 2 : 1
    let cursor = x + landRun
    const tapArc = jumpArc(T, vArrive, T.obstacleHold)
    const tapLand = landX(tapArc, 0)
    for (let i = 0; i < n; i++) {
      const kind = rng() < 0.5 ? 'chimney' : 'ac'
      let ow = kind === 'chimney' ? Math.round(R(40, 52)) : Math.round(R(70, 96))
      let oh = kind === 'chimney' ? Math.round(R(0.45, 0.62) * apexTap) : Math.round(R(0.3, 0.42) * apexTap)
      const win = above(tapArc, oh + 4)
      if (!win || win[1] - win[0] < ow + 2 * T.halfW + vArrive * T.obstacleSlack) continue
      const room = x + w - edgeRun - ow - cursor
      if (room < 0) break
      const ox = Math.round(cursor + R(0, Math.min(room, vArrive * 0.6)))
      roof.obs.push({ kind, x: ox, w: ow, h: oh, hit: false, dx: 0, dy: 0, vx: 0, vy: 0, rot: 0, spin: 0, seed: rng() })
      if (rng() < 0.5) addStarArc(ox, top, tapArc, ox + ow / 2 - (win[0] + win[1]) / 2, ox - 30, ox + ow + 30, 3)
      cursor = ox + ow + tapLand + vArrive * 0.32
    }
    // a run-through row of stars on obstacle-free roofs
    if (!roof.obs.length && rng() < 0.5) {
      const sx = x + landRun + R(0, 120)
      for (let k = 0; k < 4 && sx + k * T.starSpacing < x + w - 80; k++) s.stars.push({ x: sx + k * T.starSpacing, y: top - 34, got: false, ph: rng() * TAU })
    }
    // pigeons that scatter when you get close
    if (rng() < 0.4) {
      const bx = x + R(0.3, 0.8) * w
      const flock = Math.floor(rng() * 1e6)
      for (let k = 0, m = 3 + Math.floor(rng() * 3); k < m; k++) {
        const px = bx + k * R(14, 26)
        const o = roof.obs.find((ob) => px > ob.x - 6 && px < ob.x + ob.w + 6)
        s.birds.push({ x: px, y: o ? top - o.h : top, vx: 0, vy: 0, fly: false, flock, ph: rng() * TAU, face: rng() < 0.5 ? 1 : -1 })
      }
    }
  }

  function supportsNear(x) {
    const out = []
    for (const r of s.roofs) {
      if (r.x > x + 300 || r.x + r.w < x - 300) continue
      out.push({ ref: r, roof: r, x0: r.x, x1: r.x + r.w, top: r.top })
      for (const o of r.obs) if (!o.hit) out.push({ ref: o, roof: r, x0: o.x, x1: o.x + o.w, top: r.top - o.h })
    }
    return out
  }

  function land(sup, vy) {
    const p = s.p
    p.ground = true
    p.on = sup
    p.y = sup.top
    p.vy = 0
    p.air = 0
    let close = false
    if (sup.ref === sup.roof && p.from !== sup.roof && p.x - sup.x0 < T.closeEdge) {
      close = true
      s.closes++
    }
    p.from = sup.roof
    s.events.push({ type: 'land', vy, x: p.x, y: p.y, close, hard: vy > T.hardLand })
  }

  s.step = function (h, held, pressed) {
    if (s.over) return
    const p = s.p
    s.t += h
    const target = speedAt(s.t)
    s.speed = s.speed < target ? approach(s.speed, target, T.speedRecover, h) + T.speedRamp * h : target
    if (pressed) p.buffer = T.buffer
    p.buffer -= h
    p.coyote -= h
    if (p.buffer > 0 && (p.ground || p.coyote > 0) && !p.wall && !s.falling) {
      p.vy = -T.jumpSpeed
      p.air = 0
      p.cut = false
      p.ground = false
      p.coyote = 0
      p.buffer = 0
      p.from = p.on ? p.on.roof : p.from
      s.jumps++
      s.events.push({ type: 'jump', x: p.x, y: p.y })
    }
    const x0 = p.x
    const y0 = p.y
    if (!p.wall) p.x += s.speed * h
    if (!p.ground) airStep(p, h, T, held)

    const sups = supportsNear(p.x)
    if (p.ground) {
      const o = p.on
      const still = sups.find((q) => q.ref === o.ref && p.x + T.foot >= q.x0 && p.x - T.foot <= q.x1)
      if (still) p.y = still.top
      else {
        // walked off: maybe straight onto something just as high
        const next = sups.find((q) => p.x + T.foot >= q.x0 && p.x - T.foot <= q.x1 && Math.abs(q.top - p.y) < 2)
        if (next) p.on = next
        else {
          p.ground = false
          p.coyote = T.coyote
          p.cut = true
          p.air = 0
          p.vy = 0
          p.from = o.roof
        }
      }
    }
    if (!p.ground && p.vy >= 0) {
      let best = null
      for (const q of sups) if (p.x + T.foot >= q.x0 && p.x - T.foot <= q.x1 && y0 <= q.top + 1 && p.y >= q.top && (!best || q.top < best.top)) best = q
      if (best) land(best, p.vy)
    }
    // the next roof's wall: snap onto the ledge if nearly there, otherwise slam into it
    if (!p.wall)
      for (const q of sups) {
        if (q.ref !== q.roof) continue
        if (p.x + T.halfW > q.x0 && x0 + T.halfW <= q.x0 + 1 && p.y > q.top + 0.5) {
          if (p.y - q.top <= T.ledgeSnap && !s.falling) land(q, p.vy)
          else {
            p.wall = true
            p.x = q.x0 - T.halfW
            p.ground = false
            if (p.vy < 0) p.vy = 0
            s.events.push({ type: 'splat', x: p.x, y: p.y })
          }
          break
        }
      }
    // clipping a chimney or AC unit: it tumbles, you stumble
    for (const q of sups) {
      if (q.ref === q.roof) continue
      const o = q.ref
      if (o.hit) continue
      if (p.x + T.halfW > q.x0 && p.x - T.halfW < q.x1 && p.y > q.top + 6 && p.y - T.bodyH < q.roof.top) {
        o.hit = true
        o.vx = s.speed * R(0.45, 0.7)
        o.vy = -R(380, 560)
        o.spin = R(4, 9)
        s.speed *= T.stumbleKeep
        s.streak = 0
        s.bumps++
        if (p.ground && p.on.ref === o) p.ground = false
        if (p.ground) {
          p.ground = false
          p.vy = -340
          p.air = T.holdMax
          p.cut = true
          p.from = q.roof
        }
        s.events.push({ type: 'bump', x: o.x + o.w / 2, y: q.top, kind: o.kind })
      }
    }
    if (!p.ground && !s.falling && p.y > T.topMax + 70) {
      s.falling = true
      s.events.push({ type: 'fall' })
    }
    if (p.y > H + 260) s.over = true

    // debris, stars, birds
    for (const r of s.roofs)
      for (const o of r.obs)
        if (o.hit) {
          o.vy += T.gravity * 0.8 * h
          o.dx += o.vx * h
          o.dy += o.vy * h
          o.rot += o.spin * h
        }
    for (const st of s.stars) {
      if (st.got) continue
      const dx = st.x - p.x
      if (dx > 60) break
      const dy = st.y - (p.y - 32)
      if (dx * dx + dy * dy < T.starR * T.starR) {
        st.got = true
        s.starsGot++
        s.streak = s.t - s.lastStar < T.streakWindow ? s.streak + 1 : 1
        s.lastStar = s.t
        s.events.push({ type: 'star', x: st.x, y: st.y, streak: s.streak })
      }
    }
    let scared = -1
    for (const b of s.birds) {
      if (!b.fly && b.x - p.x < T.birdScare && (b.flock === scared || scared < 0)) {
        b.fly = true
        b.vx = R(-40, 260)
        b.vy = -R(260, 420)
        b.face = b.vx > 60 ? 1 : -1
        if (scared !== b.flock) s.events.push({ type: 'birds', x: b.x, y: b.y })
        scared = b.flock
      }
      if (b.fly) {
        b.x += b.vx * h
        b.y += b.vy * h
        b.vy += 120 * h
        b.vx += 60 * h
      }
    }

    s.distance = Math.max(0, (p.x - START_X) / T.pxPerMetre)
    s.score = Math.floor(s.distance) + s.starsGot * T.starPoints + s.closes * T.closeBonus

    while (s.roofs[s.roofs.length - 1].x + s.roofs[s.roofs.length - 1].w < p.x + T.genAhead) addRoof()
    while (s.roofs.length > 2 && s.roofs[0].x + s.roofs[0].w < p.x - 1600) s.roofs.shift()
    while (s.stars.length && s.stars[0].x < p.x - 900) s.stars.shift()
    if (s.birds.length && (s.birds[0].x < p.x - 900 || s.birds[0].y < -200)) s.birds.shift()
  }
  // generate the opening stretch
  while (s.roofs[s.roofs.length - 1].x + s.roofs[s.roofs.length - 1].w < s.p.x + T.genAhead) addRoof()
  return s
}

// ---- art ---------------------------------------------------------------------------------------
const C = {
  sky: ['#1f1248', '#4a2275', '#a2427e', '#f0705f', '#ffb06a'],
  far: '#b9567f',
  mid: '#7b3577',
  near: '#4b2160',
  roof: '#22113a',
  roofFace: '#1b0e30',
  lip: '#3b2260',
  edge: '#a26fd0',
  rim: '#ff9468',
  win: '#ffc46e',
  winCool: '#ff8fb0',
  winDark: '#2b1848',
  ink: '#120a22',
  scarf: '#ff3f62',
  scarfDark: '#c32350',
  star: '#ffe07a',
  starDeep: '#ffad3b',
  text: '#fff1dc',
  quiet: '#e7b6d6'
}
const hash = (a, b) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return v - Math.floor(v)
}
function canvas(w, h, k = 2) {
  const cv = document.createElement('canvas')
  cv.width = Math.ceil(w * k)
  cv.height = Math.ceil(h * k)
  const g = cv.getContext('2d')
  g.scale(k, k)
  return { cv, g, w, h }
}
const SUN = { x: 900, y: 520, r: 150 }

function bakeSky() {
  const { cv, g } = canvas(W, H, 1)
  const gr = g.createLinearGradient(0, 0, 0, H)
  C.sky.forEach((c, i) => gr.addColorStop([0, 0.32, 0.56, 0.74, 0.9][i], c))
  g.fillStyle = gr
  g.fillRect(0, 0, W, H)
  // the sun's glow
  const glow = g.createRadialGradient(SUN.x, SUN.y, SUN.r * 0.6, SUN.x, SUN.y, SUN.r * 3.6)
  glow.addColorStop(0, 'rgba(255,214,140,0.55)')
  glow.addColorStop(0.4, 'rgba(255,150,110,0.18)')
  glow.addColorStop(1, 'rgba(255,120,110,0)')
  g.fillStyle = glow
  g.fillRect(0, 0, W, H)
  // a few long thin clouds
  const rng = mulberry(7)
  for (let i = 0; i < 9; i++) {
    const y = 110 + rng() * 330
    const x = rng() * W
    const w = 220 + rng() * 420
    g.fillStyle = y < 260 ? 'rgba(120,60,150,0.35)' : 'rgba(255,170,170,0.22)'
    g.beginPath()
    g.ellipse(x, y, w / 2, 5 + rng() * 6, 0, 0, TAU)
    g.fill()
    g.beginPath()
    g.ellipse(x + w * 0.2, y - 6, w / 4, 4 + rng() * 4, 0, 0, TAU)
    g.fill()
  }
  return cv
}

function bakeSun() {
  const r = SUN.r
  const { cv, g } = canvas(r * 2 + 8, r * 2 + 8, 2)
  g.translate(r + 4, r + 4)
  const gr = g.createLinearGradient(0, -r, 0, r)
  gr.addColorStop(0, '#fff3b8')
  gr.addColorStop(0.55, '#ffc46e')
  gr.addColorStop(1, '#ff7f5e')
  g.fillStyle = gr
  g.beginPath()
  g.arc(0, 0, r, 0, TAU)
  g.fill()
  // dusk bands cut through the lower half
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 5; i++) {
    const y = r * 0.18 + i * r * 0.17
    g.fillRect(-r, y, r * 2, 3 + i * 2.2)
  }
  g.globalCompositeOperation = 'source-over'
  return cv
}

/** A tiling skyline strip, baked at 2×. Returns the canvas and some windows to flicker live. */
function bakeSkyline({ seed, h, minH, maxH, minW, maxW, color, haze, winAlpha, winP, flickerN }) {
  const SW = 1280
  const { cv, g } = canvas(SW, h, 2)
  const rng = mulberry(seed)
  const R = (a, b) => a + rng() * (b - a)
  const blds = []
  for (let x = -20; x < SW; ) {
    const bw = R(minW, maxW)
    blds.push({ x, w: bw, h: R(minH, maxH), kind: Math.floor(rng() * 5) })
    x += bw + R(-10, 14)
  }
  const flicker = []
  for (const shift of [0, -SW, SW]) {
    for (const b of blds) {
      const x = b.x + shift
      if (x > SW || x + b.w < 0) continue
      const top = h - b.h
      g.fillStyle = color
      g.fillRect(x, top, b.w, b.h)
      // roof shapes
      if (b.kind === 1) g.fillRect(x + b.w * 0.2, top - 18, b.w * 0.6, 18)
      if (b.kind === 2) {
        g.beginPath()
        g.moveTo(x + b.w * 0.15, top)
        g.lineTo(x + b.w / 2, top - b.w * 0.45)
        g.lineTo(x + b.w * 0.85, top)
        g.fill()
      }
      if (b.kind === 3) {
        // water tower
        const tx = x + b.w * 0.3
        g.fillRect(tx, top - 34, 3, 34)
        g.fillRect(tx + 22, top - 34, 3, 34)
        g.fillRect(tx - 3, top - 58, 31, 26)
        g.beginPath()
        g.moveTo(tx - 5, top - 58)
        g.lineTo(tx + 12, top - 70)
        g.lineTo(tx + 30, top - 58)
        g.fill()
      }
      if (b.kind === 4) g.fillRect(x + b.w * 0.6, top - 46, 3, 46)
      // windows
      if (winAlpha > 0) {
        const cw = 14
        const rh = 20
        for (let wy = top + 14; wy < h - 10; wy += rh)
          for (let wx = x + 8; wx < x + b.w - 14; wx += cw) {
            const r = rng()
            if (r < winP) {
              g.fillStyle = `rgba(255,196,110,${winAlpha * (0.5 + rng() * 0.5)})`
              g.fillRect(wx, wy, 6, 9)
            } else if (r < winP * 1.25 && shift === 0 && flicker.length < flickerN && wx > 0 && wx < SW - 8) flicker.push({ x: wx, y: wy, ph: rng() * 100, sp: 0.2 + rng() * 0.6 })
          }
      }
    }
  }
  // atmospheric haze towards the bottom
  const fog = g.createLinearGradient(0, h * 0.35, 0, h)
  fog.addColorStop(0, haze.replace('A', '0'))
  fog.addColorStop(1, haze.replace('A', '0.55'))
  g.fillStyle = fog
  g.globalCompositeOperation = 'source-atop'
  g.fillRect(0, 0, SW, h)
  g.globalCompositeOperation = 'source-over'
  return { cv, h, flicker, alpha: winAlpha }
}

function bakeStar() {
  const { cv, g } = canvas(72, 72, 2)
  g.translate(36, 36)
  const glow = g.createRadialGradient(0, 0, 4, 0, 0, 36)
  glow.addColorStop(0, 'rgba(255,224,122,0.55)')
  glow.addColorStop(1, 'rgba(255,170,80,0)')
  g.fillStyle = glow
  g.fillRect(-36, -36, 72, 72)
  starPath(g, 0, 0, 15, 6.5)
  g.fillStyle = C.starDeep
  g.fill()
  starPath(g, -1, -1.5, 12, 5.2)
  g.fillStyle = C.star
  g.fill()
  g.fillStyle = '#fffbe6'
  g.beginPath()
  g.ellipse(-3, -5, 2.4, 3.6, -0.5, 0, TAU)
  g.fill()
  return cv
}
function starPath(g, x, y, ro, ri) {
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? ri : ro
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  g.closePath()
}

let ART = null
const art = () =>
  (ART ??= {
    sky: bakeSky(),
    sun: bakeSun(),
    star: bakeStar(),
    layers: [
      { f: 0.06, y: 0, ...bakeSkyline({ seed: 11, h: 440, minH: 140, maxH: 360, minW: 40, maxW: 110, color: C.far, haze: 'rgba(255,150,130,A)', winAlpha: 0, winP: 0, flickerN: 0 }) },
      { f: 0.16, y: 0, ...bakeSkyline({ seed: 23, h: 380, minH: 110, maxH: 300, minW: 60, maxW: 150, color: C.mid, haze: 'rgba(210,90,120,A)', winAlpha: 0.45, winP: 0.12, flickerN: 16 }) },
      { f: 0.34, y: 0, ...bakeSkyline({ seed: 37, h: 330, minH: 80, maxH: 250, minW: 80, maxW: 190, color: C.near, haze: 'rgba(120,40,100,A)', winAlpha: 0.75, winP: 0.16, flickerN: 24 }) }
    ]
  })

function drawBackdrop(ctx, A, camX, t) {
  ctx.drawImage(A.sky, 0, 0, W, H)
  ctx.drawImage(A.sun, SUN.x - SUN.r - 4, SUN.y - SUN.r - 4, SUN.r * 2 + 8, SUN.r * 2 + 8)
  for (const L of A.layers) {
    const off = -((((camX * L.f) % 1280) + 1280) % 1280)
    const y = H - L.h
    for (const ox of [off, off + 1280]) {
      ctx.drawImage(L.cv, ox, y, 1280, L.h)
      if (L.flicker.length) {
        for (const w of L.flicker) {
          const k = hash(w.ph, Math.floor(t * w.sp + w.ph))
          if (k < 0.45) continue
          const x = ox + w.x
          if (x < -10 || x > W) continue
          ctx.fillStyle = k > 0.8 ? '#ffe2a0' : `rgba(255,196,110,${L.alpha})`
          ctx.fillRect(x, y + w.y, 6, 9)
        }
      }
    }
  }
}

/** A runner pose. Feet at (0,0), facing right. */
function runnerPose(phase, air, vy, t, dead) {
  const legs = []
  const arms = []
  for (let i = 0; i < 2; i++) {
    const c = phase * TAU + i * Math.PI
    let thigh = 0.12 + Math.sin(c) * 0.85
    let shin = thigh - (0.2 + 1.35 * Math.max(0, Math.cos(c)))
    let upper = -Math.sin(c) * 0.95
    let fore = upper + 1.5
    if (air) {
      const k = clamp((vy + 600) / 1200, 0, 1) // 0 rising, 1 falling
      const tuck = i === 0 ? [1.25, 0.15, 2.0, 2.8] : [-0.55, -1.7, -0.9, 0.2]
      const reach = i === 0 ? [0.7, 0.35, 1.6, 2.2] : [-0.2, -0.9, -1.4, -0.6]
      ;[thigh, shin, upper, fore] = tuck.map((v, j) => lerp(v, reach[j], k))
    }
    if (dead) {
      thigh = Math.sin(t * 22 + i * 2) * 1.1
      shin = thigh - 0.8
      upper = 2.4 + Math.sin(t * 25 + i * 3) * 0.9
      fore = upper + 0.6
    }
    legs.push([thigh, shin])
    arms.push([upper, fore])
  }
  return { legs, arms }
}
const limb = (x, y, a, l) => [x + Math.sin(a) * l, y + Math.cos(a) * l]

function drawRunner(ctx, { phase = 0, air = false, vy = 0, t = 0, dead = false, lean = 0.3, squash = 0, scale = 1, scarf = null, rim = true }) {
  const P = runnerPose(phase, air, vy, t, dead)
  const bob = air || dead ? 0 : -Math.abs(Math.sin(phase * TAU)) * 4
  const hip = [0, -40 + bob]
  const sh = [hip[0] + Math.sin(lean) * 27, hip[1] - Math.cos(lean) * 27]
  const head = [sh[0] + Math.sin(lean) * 12, sh[1] - Math.cos(lean) * 12]
  ctx.save()
  ctx.scale(scale * (1 + squash * 0.35), scale * (1 - squash * 0.3))
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const body = (dx, dy, col, extra) => {
    ctx.save()
    ctx.translate(dx, dy)
    ctx.strokeStyle = col
    ctx.fillStyle = col
    const leg = ([a, b], w) => {
      const k = limb(hip[0], hip[1], a, 21)
      const f = limb(k[0], k[1], b, 21)
      ctx.lineWidth = w + extra
      ctx.beginPath()
      ctx.moveTo(hip[0], hip[1])
      ctx.lineTo(k[0], k[1])
      ctx.lineTo(f[0], f[1])
      ctx.lineTo(f[0] + 7, f[1] + 1)
      ctx.stroke()
    }
    const arm = ([a, b], w) => {
      const e = limb(sh[0], sh[1], a, 16)
      const hnd = limb(e[0], e[1], b, 15)
      ctx.lineWidth = w + extra
      ctx.beginPath()
      ctx.moveTo(sh[0], sh[1])
      ctx.lineTo(e[0], e[1])
      ctx.lineTo(hnd[0], hnd[1])
      ctx.stroke()
    }
    // far limbs, torso, near limbs
    leg(P.legs[1], 8)
    arm(P.arms[1], 7)
    ctx.lineWidth = 14 + extra
    ctx.beginPath()
    ctx.moveTo(hip[0], hip[1])
    ctx.lineTo(sh[0], sh[1])
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(head[0], head[1], 9.5 + extra / 2, 0, TAU)
    ctx.fill()
    leg(P.legs[0], 8.5)
    arm(P.arms[0], 7.5)
    ctx.restore()
  }
  if (rim) body(2, -1, C.rim, 0)
  body(0, 0, C.ink, 0)
  // headband knot (the scarf hangs from the neck in world space, drawn by the caller)
  ctx.restore()
  return { neck: [sh[0] * scale * (1 + squash * 0.35), (sh[1] - 3) * scale * (1 - squash * 0.3)] }
}

function drawScarf(ctx, pts, t) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass ? C.scarf : C.scarfDark
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      const wob = (j) => Math.sin(t * 19 - j * 0.9) * j * 0.35
      ctx.lineWidth = (pass ? 8 : 11) - i * 0.55
      ctx.beginPath()
      ctx.moveTo(a.x, a.y + wob(i - 1))
      ctx.lineTo(b.x, b.y + wob(i))
      ctx.stroke()
    }
  }
}

function drawChimney(ctx, x, top, w, h, seed) {
  ctx.fillStyle = '#2d1749'
  ctx.fillRect(x, top, w, h)
  ctx.fillStyle = '#3c2160'
  for (let r = 0; r < h - 12; r += 10)
    for (let c = (r / 10) % 2 ? -10 : 0; c < w; c += 20) ctx.fillRect(x + Math.max(0, c) + 1, top + 12 + r, Math.min(18, w - Math.max(0, c) - 2), 8)
  ctx.fillStyle = C.lip
  ctx.fillRect(x - 5, top, w + 10, 10)
  ctx.fillStyle = C.edge
  ctx.fillRect(x - 5, top, w + 10, 3)
  ctx.fillStyle = C.rim
  ctx.fillRect(x + w + 3, top, 2, 10)
  ctx.fillRect(x + w - 2, top + 10, 2, h - 10)
  void seed
}
function drawAC(ctx, x, top, w, h, t) {
  ctx.fillStyle = '#3a2360'
  ctx.fillRect(x, top, w, h)
  ctx.fillStyle = '#4c3078'
  ctx.fillRect(x, top, w, 5)
  ctx.fillStyle = C.edge
  ctx.fillRect(x, top, w, 2)
  // grille slats + spinning fan
  ctx.fillStyle = '#2a1848'
  for (let i = 8; i < w * 0.45; i += 6) ctx.fillRect(x + i, top + 9, 3, h - 15)
  const fx = x + w * 0.72
  const fy = top + h / 2 + 2
  const fr = Math.min(h * 0.36, w * 0.18)
  ctx.beginPath()
  ctx.arc(fx, fy, fr, 0, TAU)
  ctx.fillStyle = '#1d0f33'
  ctx.fill()
  ctx.strokeStyle = '#6c4aa0'
  ctx.lineWidth = 3
  for (let k = 0; k < 3; k++) {
    const a = t * 14 + (k * TAU) / 3
    ctx.beginPath()
    ctx.moveTo(fx, fy)
    ctx.lineTo(fx + Math.cos(a) * fr * 0.85, fy + Math.sin(a) * fr * 0.85)
    ctx.stroke()
  }
  ctx.fillStyle = C.rim
  ctx.fillRect(x + w - 2, top, 2, h)
}
function drawPigeon(ctx, b, t) {
  ctx.save()
  ctx.translate(b.x, b.y)
  ctx.scale(b.face, 1)
  ctx.fillStyle = C.ink
  if (!b.fly) {
    const peck = Math.max(0, Math.sin(t * 3 + b.ph * 5)) > 0.9 ? 4 : 0
    ctx.beginPath()
    ctx.ellipse(0, -7, 9, 6, -0.15, 0, TAU)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(7, -13 + peck, 4, 0, TAU)
    ctx.fill()
    ctx.fillRect(-12, -9, 6, 3)
    ctx.fillRect(-2, -2, 2, 3)
  } else {
    const flap = Math.sin(t * 30 + b.ph * 7)
    ctx.beginPath()
    ctx.ellipse(0, 0, 8, 4.5, -0.2, 0, TAU)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(8, -3, 3.5, 0, TAU)
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = C.ink
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-10, -2 - flap * 10)
    ctx.lineTo(-2, -1)
    ctx.lineTo(4, -2 - flap * 11)
    ctx.stroke()
  }
  ctx.restore()
}

/** A playable building: roof lip at r.top, face down to the bottom of the screen. */
function drawBuilding(ctx, r, sx, t) {
  const x = sx
  ctx.fillStyle = C.roofFace
  ctx.fillRect(x, r.top, r.w, H - r.top + 40)
  // windows
  const cols = Math.floor((r.w - 30) / 48)
  const ox = x + (r.w - cols * 48) / 2 + 10
  const tint = r.style === 1 ? C.winCool : C.win
  for (let row = 0; r.top + 46 + row * 58 < H; row++) {
    const wy = r.top + 46 + row * 58
    for (let c = 0; c < cols; c++) {
      const wx = ox + c * 48
      if (wx < -30 || wx > W + 10) continue
      const k = hash(r.seed + c, row)
      if (k < (r.style === 2 ? 0.45 : 0.32)) {
        const flick = k < 0.04 && hash(r.seed + c, Math.floor(t * 3 + row)) < 0.4
        ctx.fillStyle = flick ? C.winDark : tint
        ctx.globalAlpha = 0.55 + k
        ctx.fillRect(wx, wy, 24, 30)
        ctx.globalAlpha = 1
      } else {
        ctx.fillStyle = C.winDark
        ctx.fillRect(wx, wy, 24, 30)
      }
    }
  }
  // depth shade under the lip, rim light on the sun side
  ctx.fillStyle = 'rgba(10,4,24,0.45)'
  ctx.fillRect(x, r.top + 12, r.w, 14)
  const rim = ctx.createLinearGradient(0, r.top, 0, r.top + 160)
  rim.addColorStop(0, 'rgba(255,148,104,0.75)')
  rim.addColorStop(1, 'rgba(255,148,104,0)')
  ctx.fillStyle = rim
  ctx.fillRect(x + r.w - 3, r.top, 3, 160)
  ctx.fillStyle = C.lip
  ctx.fillRect(x - 6, r.top, r.w + 12, 13)
  ctx.fillStyle = C.edge
  ctx.fillRect(x - 6, r.top, r.w + 12, 3)
  ctx.fillStyle = C.rim
  ctx.fillRect(x + r.w + 4, r.top, 2, 13)
  // little parapet posts
  ctx.fillStyle = C.lip
  for (let px = 40; px < r.w - 30; px += 160) ctx.fillRect(x + px, r.top - 8, 8, 8)
}

// ---- the module --------------------------------------------------------------------------------
export default {
  id: 'rooftop-run',
  name: 'Rooftop Run',
  blurb: 'Leap the rooftops at dusk',
  scoreLabel: 'points',
  style: { bg: '#2b1f4f', accent: '#ff9a52' },
  // headless bot (take-off timing noise σ): σ 0.15 s ≈ 470 in 36 s, σ 0.09 s ≈ 1000 in 64 s, σ 0.07 s ≈ 1650 in 93 s
  medals: [350, 800, 1500],
  music: { bpm: 152, root: 45, chords: [0, -4, 3, -2], minor: true, lead: [0, 2, 4, 7, 4, 2, 4, 5], wave: 'square', gain: 0.032 },
  TUNING,
  howTo: (input) => `${input.label('a')} to jump · hold for a longer leap · don't fall`,
  icon(ctx, x, y, size, t) {
    // visible card area ≈ x ± 180, y − 80 … y + 60 (the hub covers the rest with the name bar)
    const A = art()
    ctx.save()
    ctx.drawImage(A.sky, 0, 300, W, 500, x - 200, y - 110, 400, 260)
    ctx.drawImage(A.sun, x + 20, y - 72, 130, 130)
    const L = A.layers[1]
    ctx.drawImage(L.cv, 0, 0, L.cv.width / 2, L.cv.height, x - 200, y - 30, 400, 190)
    const roofs = [
      [x - 200, y + 18, 130],
      [x + 50, y + 2, 160]
    ]
    for (const [rx, rt, rw] of roofs) {
      ctx.fillStyle = C.roofFace
      ctx.fillRect(rx, rt, rw, 160)
      ctx.fillStyle = C.lip
      ctx.fillRect(rx - 4, rt, rw + 8, 9)
      ctx.fillStyle = C.edge
      ctx.fillRect(rx - 4, rt, rw + 8, 3)
      ctx.fillStyle = C.rim
      ctx.fillRect(rx + rw + 2, rt, 2, 9)
      for (let c = 0; c < 3; c++) {
        ctx.fillStyle = (c + rw) % 2 ? C.win : C.winDark
        ctx.fillRect(rx + 18 + c * 40, rt + 26, 16, 20)
      }
    }
    drawChimney(ctx, x + 150, y - 26, 26, 28, 0)
    // stars along the arc
    for (let i = 0; i < 3; i++) {
      const k = i / 2
      ctx.drawImage(A.star, x - 10 + k * 90 - 17, y - 56 + k * k * 30 + Math.sin(t * 3 + i) * 2 - 17, 34, 34)
    }
    ctx.translate(x - 50, y + 8 + Math.sin(t * 2) * 3)
    const pts = Array.from({ length: 8 }, (_, i) => ({ x: -i * 7, y: i * 2 + Math.sin(t * 8 - i) * 1.2 }))
    ctx.save()
    ctx.translate(12, -50)
    ctx.scale(0.8, 0.8)
    drawScarf(ctx, pts, t)
    ctx.restore()
    drawRunner(ctx, { air: true, vy: -250, t, lean: 0.45, scale: 0.8 })
    ctx.restore()
  },
  create(env) {
    const { input, audio, settings, font } = env
    const T = env.TUNING
    const A = art()
    const fx = createFx(settings, { max: 160 })
    const sim = createSim(T)
    const PAUSE_ZONE = { x: W - 130, y: 0, w: 130, h: 100 }
    const inPause = (p) => p.x >= PAUSE_ZONE.x && p.y <= PAUSE_ZONE.h
    const bestM = env.store.bestM ?? 0

    let acc = 0
    let pressLatch = false
    let pointerHeld = false
    let camX = sim.p.x - T.camLead
    let clock = 0
    let phase = 0
    let squash = 0
    let overTimer = 0
    let hintT = 4.5
    let newBest = false
    const floaters = []
    const lines = Array.from({ length: 16 }, () => ({ x: rand(0, W), y: rand(90, 720), len: rand(80, 220), v: rand(1.4, 2.4) }))
    const scarf = Array.from({ length: 9 }, (_, i) => ({ x: -i * 10, y: 0 }))
    let neck = [10, -64]

    const vary = (f) => f * rand(0.94, 1.06)
    const sfx = {
      step: () => (audio.noise({ dur: 0.035, gain: 0.035 }), audio.tone({ freq: vary(130), dur: 0.04, type: 'triangle', gain: 0.05 })),
      jump: () => (audio.tone({ freq: vary(320), dur: 0.14, type: 'square', slide: 360, gain: 0.07 }), audio.noise({ dur: 0.05, gain: 0.05 })),
      land: (k) => (audio.noise({ dur: 0.05 + k * 0.08, gain: 0.06 + k * 0.14 }), k > 0.6 && audio.tone({ freq: 90, dur: 0.18, type: 'sine', slide: -40, gain: 0.25 })),
      star: (n) => {
        const f = 880 * Math.pow(2, Math.min(n - 1, 12) / 12)
        audio.tone({ freq: f, dur: 0.07, type: 'square', gain: 0.06 })
        audio.tone({ freq: f * 1.5, dur: 0.14, type: 'triangle', gain: 0.08, delay: 0.04 })
      },
      close: () => [660, 880, 1320].forEach((f, i) => audio.tone({ freq: f, dur: 0.1, type: 'triangle', gain: 0.1, delay: i * 0.06 })),
      bump: () => (audio.noise({ dur: 0.16, gain: 0.22 }), audio.tone({ freq: 170, dur: 0.2, type: 'sawtooth', slide: -90, gain: 0.08 })),
      splat: () => (audio.noise({ dur: 0.22, gain: 0.3 }), audio.tone({ freq: 90, dur: 0.3, type: 'sine', slide: -50, gain: 0.3 })),
      fall: () => audio.tone({ freq: 1500, dur: 1.0, type: 'sine', slide: -1150, gain: 0.11 }),
      birds: () => {
        for (let i = 0; i < 5; i++) audio.noise({ dur: 0.03, gain: 0.05, delay: i * 0.045 })
      }
    }
    const float = (text, x, y, color = C.star, size = 32) => floaters.length < 12 && floaters.push({ text, x, y, color, size, life: 0.9, max: 0.9 })
    const dust = (x, y, n, spread = 1) => {
      for (let i = 0; i < n; i++) fx.burst(x + rand(-8, 8), y - 3, i % 2 ? '#c79ad8' : '#8e64b0', 1, 160 * spread, { size: rand(3, 6), life: 0.45, gravity: -40 })
    }

    function handle(e) {
      const sxp = e.x - camX
      if (e.type === 'jump') {
        sfx.jump()
        squash = -0.35
        dust(sxp, e.y, 5, 0.7)
      } else if (e.type === 'land') {
        const k = clamp(e.vy / 1400, 0, 1)
        sfx.land(k)
        squash = 0.25 + k * 0.5
        dust(sxp, e.y, 4 + Math.round(k * 8), 0.6 + k)
        if (e.hard) fx.shake(0.22)
        if (e.close) {
          sfx.close()
          float('Close!', sxp + 30, e.y - 100, '#ffe07a', 38)
          float(`+${T.closeBonus}`, sxp + 30, e.y - 64, C.text, 26)
        }
      } else if (e.type === 'star') {
        sfx.star(e.streak)
        fx.burst(e.x - camX, e.y, C.star, 7, 220, { size: 3.5, life: 0.4, gravity: 200, square: true })
        if (e.streak >= 4 && e.streak % 2 === 0) float(`×${e.streak}`, e.x - camX, e.y - 40, '#ffd56b', 28)
      } else if (e.type === 'bump') {
        sfx.bump()
        fx.shake(0.3)
        fx.burst(e.x - camX, e.y, '#5a3a86', 10, 300, { size: 5, life: 0.6, gravity: 900, square: true })
        float('Oof', sxp + 20, e.y - 70, '#ff9db0', 28)
      } else if (e.type === 'splat') {
        sfx.splat()
        fx.shake(0.5)
        squash = 0.5
      } else if (e.type === 'fall') sfx.fall()
      else if (e.type === 'birds') sfx.birds()
    }

    const run = {
      score: 0,
      done: false,
      sim, // for headless play scripts
      stats: () => [
        ['Distance', `${Math.floor(sim.distance)} m`],
        ['Stars', sim.starsGot],
        ['Close calls', sim.closes]
      ],
      prompts: () => [['a', 'Jump · hold = further']],
      update(dt) {
        clock += dt
        hintT -= dt
        // input: the a button, or a press anywhere outside the pause corner
        const ptr = input.pointer
        if (ptr.pressed && !inPause(ptr)) ((pointerHeld = true), (pressLatch = true))
        if (!ptr.down) pointerHeld = false
        if (input.pressed('a')) pressLatch = true
        const held = input.held('a') || pointerHeld

        acc = Math.min(acc + dt, 0.1)
        while (acc >= STEP) {
          sim.step(STEP, held, pressLatch)
          pressLatch = false
          acc -= STEP
        }
        for (const e of sim.events) handle(e)
        sim.events.length = 0
        run.score = sim.score
        if (!newBest && bestM > 50 && sim.distance > bestM) {
          newBest = true
          float('New best!', W / 2, 200, '#ffe07a', 44)
          audio.tone({ freq: 1046, dur: 0.3, type: 'triangle', gain: 0.1 })
        }

        const p = sim.p
        // camera leads more as you speed up
        const want = p.x - T.camLead - (sim.speed - T.speedStart) * T.lookAhead
        camX = p.wall || sim.falling ? camX + (want - camX) * Math.min(1, dt * 2) : approach(camX, want, 8, dt)

        // run cycle + footsteps
        if (p.ground) {
          const before = phase
          phase = (phase + (sim.speed * dt) / T.stride) % 1
          if (Math.floor(before * 2) !== Math.floor(phase * 2)) {
            sfx.step()
            if (sim.speed > 650 && Math.random() < 0.5) dust(p.x - camX - 6, p.y, 1, 0.5)
          }
        } else phase = approach(phase, 0.25, 4, dt)
        squash = approach(squash, 0, 12, dt)

        // scarf: a chain trailing opposite the runner's motion, each link lagging a little more
        const back = Math.atan2(-(p.ground ? 0 : p.vy * 0.8), -(p.wall ? 40 : sim.speed))
        for (let i = 1; i < scarf.length; i++) {
          const a = scarf[i - 1]
          const q = scarf[i]
          const ang = back + Math.sin(clock * 11 - i * 0.9) * 0.05 * i - (p.ground ? 0.08 : 0)
          q.x = approach(q.x, a.x + Math.cos(ang) * 10, 30 - i * 2.5, dt)
          q.y = approach(q.y, a.y + Math.sin(ang) * 10 + 0.6, 30 - i * 2.5, dt)
        }

        for (const l of lines) {
          l.x -= sim.speed * l.v * dt
          if (l.x + l.len < 0) ((l.x = W + rand(0, 300)), (l.y = rand(90, 720)))
        }
        fx.update(dt)
        for (let i = floaters.length - 1; i >= 0; i--) {
          const f = floaters[i]
          f.life -= dt
          f.y -= 60 * dt
          if (f.life <= 0) floaters.splice(i, 1)
        }
        if (sim.over) {
          overTimer += dt
          if (overTimer > 0.35 && !run.done) {
            if (sim.distance > (env.store.bestM ?? 0)) ((env.store.bestM = Math.floor(sim.distance)), env.saveNow())
            run.done = true
          }
        }
      },
      draw(ctx) {
        const p = sim.p
        drawBackdrop(ctx, A, camX, clock)
        ctx.save()
        ctx.translate(...fx.offset())
        // the street below: dark depth in the gaps
        const deep = ctx.createLinearGradient(0, 560, 0, H)
        deep.addColorStop(0, 'rgba(20,8,38,0)')
        deep.addColorStop(1, 'rgba(20,8,38,0.9)')
        ctx.fillStyle = deep
        ctx.fillRect(-20, 560, W + 40, H - 520)

        // best-distance marker
        if (bestM > 20) {
          const bx = sim.startX + bestM * T.pxPerMetre - camX
          if (bx > -40 && bx < W + 40) {
            ctx.fillStyle = 'rgba(255,224,122,0.5)'
            for (let y = 230; y < 720; y += 22) ctx.fillRect(bx - 1.5, y, 3, 12)
            label(ctx, 'BEST', bx, 210, { font: font(400, 26, 'Lilita One'), color: C.star, edge: 6, edgeColor: C.ink })
          }
        }
        for (const r of sim.roofs) {
          const sx = r.x - camX
          if (sx > W + 20 || sx + r.w < -20) continue
          drawBuilding(ctx, r, sx, clock)
        }
        const calm = ctx.createLinearGradient(0, H - 150, 0, H)
        calm.addColorStop(0, 'rgba(16,7,30,0)')
        calm.addColorStop(1, 'rgba(16,7,30,0.85)')
        ctx.fillStyle = calm
        ctx.fillRect(-20, H - 150, W + 40, 170)
        for (const r of sim.roofs) {
          for (const o of r.obs) {
            const sx = o.x - camX + o.dx
            if (sx > W + 60 || sx + o.w < -60) continue
            const top = r.top - o.h + o.dy
            ctx.save()
            if (o.hit) {
              ctx.translate(sx + o.w / 2, top + o.h / 2)
              ctx.rotate(o.rot)
              ctx.translate(-(sx + o.w / 2), -(top + o.h / 2))
            }
            if (o.kind === 'chimney') drawChimney(ctx, sx, top, o.w, o.h, o.seed)
            else drawAC(ctx, sx, top, o.w, o.h, clock + o.seed * 9)
            ctx.restore()
          }
        }
        for (const b of sim.birds) {
          const sx = b.x - camX
          if (sx > -20 && sx < W + 20) drawPigeon(ctx, { ...b, x: sx }, clock)
        }
        for (const st of sim.stars) {
          if (st.got) continue
          const sx = st.x - camX
          if (sx < -40 || sx > W + 40) continue
          const bob = Math.sin(clock * 4 + st.ph) * 4
          const sc = 1 + Math.sin(clock * 6 + st.ph) * 0.06
          ctx.drawImage(A.star, sx - 30 * sc, st.y + bob - 30 * sc, 60 * sc, 60 * sc)
        }

        // the runner
        const rx = p.x - camX
        ctx.save()
        ctx.translate(rx + neck[0], p.y + neck[1])
        drawScarf(ctx, scarf, clock)
        ctx.restore()
        ctx.save()
        ctx.translate(rx, p.y)
        const lean = p.wall ? -0.1 : 0.22 + (sim.speed - T.speedStart) / 2600 + (p.ground ? 0 : 0.1)
        const out = drawRunner(ctx, { phase, air: !p.ground, vy: p.vy, t: clock, dead: sim.falling || p.wall, lean, squash, scale: 1.12 })
        neck = out.neck
        ctx.restore()
        fx.draw(ctx)

        // speed lines
        const k = clamp((sim.speed - 560) / 380, 0, 1)
        if (k > 0) {
          ctx.fillStyle = '#ffe4d0'
          for (const l of lines) {
            ctx.globalAlpha = k * 0.35
            ctx.fillRect(l.x, l.y, l.len * (0.5 + k), 2)
          }
          ctx.globalAlpha = 1
        }
        ctx.restore()

        for (const f of floaters) {
          ctx.globalAlpha = clamp(f.life / f.max * 2, 0, 1)
          const pop = 1 + Math.max(0, f.life - f.max + 0.15) * 3
          label(ctx, f.text, f.x, f.y, { font: font(400, f.size * pop, 'Lilita One'), color: f.color, edge: 7, edgeColor: C.ink })
        }
        ctx.globalAlpha = 1

        // HUD
        label(ctx, `${Math.floor(sim.distance)} m`, 34, 60, { font: font(400, 54, 'Lilita One'), color: C.text, edge: 9, edgeColor: C.ink, align: 'left' })
        ctx.drawImage(A.star, 22, 92, 48, 48)
        label(ctx, `${sim.starsGot}`, 72, 118, { font: font(900, 32), color: C.star, edge: 7, edgeColor: C.ink, align: 'left' })
        if (bestM > 0) label(ctx, `Best ${bestM} m`, 34, 166, { font: font(700, 24), color: C.quiet, edge: 6, edgeColor: C.ink, align: 'left' })
        if (hintT > 0) {
          ctx.globalAlpha = clamp(hintT, 0, 1)
          label(ctx, `${input.label('a')} to hop · hold it to fly further`, W / 2, 250, { font: font(700, 30), color: C.text, edge: 7, edgeColor: C.ink })
          ctx.globalAlpha = 1
        }
      }
    }
    return run
  }
}
