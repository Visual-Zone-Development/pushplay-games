// One motion interface for every station, fed by the active phone or by a stand-in:
//   motion.tilt.x / .y     -1..1, calibrated (phone tilt, or the left stick / arrows / WASD)
//   motion.fireHeld / firePressed   the phone's on-screen button, or a
//   motion.swings          this frame's swings: { dir, power 0..1, t (seconds, TV clock), src, tap?, x?, y? }
//                          phone flicks and shakes, or a / d-pad / right-stick flick / mouse or touch swipe and tap
//
// The phone (controller.html) sends held input ≈30 times a second ({ tb, tg, ta } tilt in degrees,
// u its "up" in screen axes, gx/gy gyro totals, m strength, f the button, st motion state, still,
// ph sensor stats) and detects swings itself at the full sensor rate, sending
// { swing: { dir, p, m, pt } } with pt the swing's moment on the phone's clock. The TV pings the
// phone and keeps the fastest round trip of the last few: that one shows the clock difference
// best, so phone times turn into TV times to within a few ms (clock sync, like NTP).
// Calibration is per player name (save.data.profiles): the level pose and learned timing.

const now = () => performance.now() / 1000
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const DIRS = ['left', 'right', 'up', 'down']
const DEG = Math.PI / 180

/**
 * Side and forward tilt in degrees, from the phone's beta/gamma. Raw gamma misbehaves as the
 * phone stands up (it swings wildly near upright), which made diagonal aiming fight itself.
 * Measuring the direction of "up" in the phone's own frame instead keeps the two axes
 * independent at any holding angle.
 */
function upOf(b, g) {
  return [-Math.sin(g * DEG) * Math.cos(b * DEG), Math.sin(b * DEG), Math.cos(g * DEG) * Math.cos(b * DEG)]
}
function tiltAngles([ux, uy, uz]) {
  return { x: Math.asin(clamp(-ux, -1, 1)) / DEG, y: Math.atan2(uy, uz) / DEG }
}
/**
 * One Euro filter: smooths hard when the value moves slowly (hand jitter, readings arriving in
 * bursts over the network) and barely at all when it moves fast, so aiming stays quick.
 */
function oneEuro(minCutoff, beta) {
  let x = null
  let dx = 0
  const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt))
  return {
    reset: () => (x = null),
    step(v, dt) {
      if (x === null || !dt) return (x = v)
      dx += alpha(1, dt) * ((v - x) / dt - dx)
      x += alpha(minCutoff + beta * Math.abs(dx), dt) * (v - x)
      return x
    }
  }
}
const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180


export function createMotion({ party, input, settings, save, TUNING, sfx, isBlocked = () => false }) {
  const T = TUNING.motion
  let lastInput = null
  let pingId = 0
  let pingAt = 0
  let fastPings = 0
  const pingsOut = new Map() // id → TV time sent
  const clock = [] // the last few { rtt, off } checks
  let samples = 0
  let sampleClock = 0
  let swipe = null
  let aimArmed = true
  /** Phone swings arrive between frames; they join the next frame's swings. */
  const pending = []
  const smooth = ['tx', 'ty'].reduce((o, k) => ((o[k] = oneEuro(T.filterMin, T.filterBeta)), o), {})
  smooth.wh = oneEuro(T.wheelFilter, T.filterBeta)

  const motion = {
    activeId: null,
    tilt: { x: 0, y: 0 },
    /**
     * Steering wheel, -1..1 (right +): the phone held up like a wheel (sideways or upright,
     * screen facing you) and turned. It's the angle of gravity across the phone's face, so it
     * is absolute: no drift, nothing to re-center, and network lag can't make it wander. Null
     * while the phone lies too flat to read.
     */
    wheel: null,
    /** Bumped on every re-center. */
    centered: 0,
    /** Raw angles from the phone, and the neutral pose they're measured from. */
    raw: { b: 0, g: 0, m: 0 },
    neutral: { b: save.data.neutral?.b ?? T.defaultBeta, g: save.data.neutral?.g ?? 0 },
    needCenter: !save.data.neutral,
    /** Waiting for the phone to be held still before re-centering (TV time asked), or 0. */
    centering: 0,
    /** Phone clock minus TV clock, seconds; null until the first clock check. */
    clockOff: null,
    /** Spread of the recent round trips (s): how steady the connection is. */
    jitter: 0,
    /** What the phone says about its sensors: { hz, o (screen angle), bias (deg/s) }. */
    stats: null,
    /** The station's swing tuning: threshold scale and the gap between swings (ms). */
    tune: { scale: 1, cd: 200 },
    source: 'stick', // 'phone' | 'stick'
    phoneState: 'none', // none | on | ask | denied | unsupported | touch | waiting
    fireHeld: false,
    firePressed: false,
    swings: [],
    rtt: 0,
    hz: 0,
    log: [], // the last swings, for the bench

    get phone() {
      return motion.activeId ? party.player(motion.activeId) : null
    },
    get phoneLive() {
      const p = motion.phone
      return Boolean(p?.connected && (motion.phoneState === 'on' || motion.phoneState === 'touch'))
    },
    /** One-way delay estimate in seconds. */
    get lag() {
      return motion.rtt / 2
    },
    /** This player's saved calibration: { neutral, derby, rhythm } (timing offsets in s). */
    get profile() {
      const name = motion.phone?.name || 'Phone'
      save.data.profiles ??= {}
      return (save.data.profiles[name] ??= {})
    },
    calib(key) {
      return motion.profile[key] ?? null
    },
    setCalib(key, v) {
      motion.profile[key] = Math.round(v * 1000) / 1000
    },

    /** Re-center: waits (up to TUNING.motion.centerWait) for the phone to be held still. */
    center() {
      if (!motion.phoneLive) return
      motion.centering = motion.centering || now()
    },
    /** Finish a waiting re-center now (the round is starting). */
    centerFinish() {
      if (motion.centering) motion.centerNow()
    },
    centerNow() {
      motion.centering = 0
      motion.neutral = { b: motion.raw.b, g: motion.raw.g, a: motion.raw.a, u: motion.raw.u }
      save.data.neutral = { b: motion.neutral.b, g: motion.neutral.g }
      motion.profile.neutral = { b: motion.neutral.b, g: motion.neutral.g, u: motion.neutral.u }
      save.save()
      motion.needCenter = false
      motion.centered++
      sfx.center()
      motion.buzz(25)
    },
    buzz(ms) {
      if (motion.activeId && motion.phone?.kind === 'phone') party.send(motion.activeId, { buzz: ms })
    },
    take(id) {
      if (motion.activeId === id) return
      motion.activeId = id
      lastInput = null
      motion.rtt = 0
      motion.clockOff = null
      clock.length = 0
      pingsOut.clear()
      fastPings = 4 // a few quick clock checks to start
      motion.centering = 0
      // Someone who has played before gets their own level pose back; anyone else centers on arrival.
      const saved = motion.profile.neutral
      if (saved) motion.neutral = { b: saved.b, g: saved.g, u: saved.u }
      motion.needCenter = !saved
      for (const p of party.players) party.view(p.id).role = p.id === id ? 'active' : 'standby'
      party.public.active = id
      sfx.join()
    },

    update(dt) {
      const t = now()
      motion.swings.length = 0
      motion.swings.push(...pending)
      pending.length = 0
      motion.firePressed = false

      // Keep a phone in charge: the first connected one if the active one left.
      if (!motion.phone?.connected) {
        const next = party.players.find((p) => p.kind === 'phone' && p.connected)
        if (next) motion.take(next.id)
        else if (motion.activeId && !motion.phone) motion.activeId = null
      }
      party.public.cfg = {
        thr: Math.round(T.swingThresholds[settings.data.swingThreshold ?? 1] * (motion.tune.scale ?? 1) * 10) / 10,
        inv: Boolean(settings.data.invertSwipes),
        cd: motion.tune.cd ?? 200,
        at: motion.tune.at ?? 'peak',
        win: motion.tune.win ?? 3,
        winMs: motion.tune.winMs ?? T.flipWindowMs,
        peakMs: T.peakMs,
        full: T.fullSwing,
        dz: T.dirDeadzone,
        gk: motion.tune.gyro ? T.gyroSwingK : 0,
        tighten: T.gyroTighten,
        smoothLo: T.gyroSmooth[0],
        smoothHi: T.gyroSmooth[1]
      }

      const id = motion.activeId
      const inp = id ? party.inputs[id] : null
      motion.phoneState = motion.phone ? (motion.phone.connected ? inp?.st ?? 'waiting' : 'none') : 'none'
      if (inp && inp !== lastInput) {
        lastInput = inp
        samples++
      }
      sampleClock += dt
      if (sampleClock >= 1) {
        motion.hz = samples / sampleClock
        samples = 0
        sampleClock = 0
      }

      if (motion.phoneLive && typeof inp?.tb === 'number') {
        const u = Array.isArray(inp.u) && inp.u.length === 3 ? inp.u : upOf(inp.tb, inp.tg ?? 0)
        motion.raw = { b: inp.tb, g: inp.tg ?? 0, m: inp.m ?? 0, a: typeof inp.ta === 'number' ? inp.ta : undefined, u }
        motion.stats = inp.ph ?? null
        motion.touchWhy = inp.why ?? null
        if (motion.needCenter) motion.center()
        // Centre on a steady phone, not mid-wobble; give up waiting after a moment.
        if (motion.centering && (inp.still !== false || t - motion.centering > T.centerWait)) motion.centerNow()
        // The wheel: gravity's direction across the phone's face, in the phone's own axes (not
        // turned with the screen), against the centre pose.
        const du = upOf(motion.raw.b, motion.raw.g)
        if (Math.hypot(du[0], du[1]) > 0.35) {
          const th = Math.atan2(du[0], du[1]) / DEG
          if (motion.neutral.wheel === undefined) {
            const nu = upOf(motion.neutral.b, motion.neutral.g)
            motion.neutral.wheel = Math.hypot(nu[0], nu[1]) > 0.35 ? Math.atan2(nu[0], nu[1]) / DEG : th
          }
          const k = settings.data.tiltSensitivity ?? 1
          motion.wheel = smooth.wh.step(clamp((-wrap(th - motion.neutral.wheel) * k) / T.wheelRange, -1, 1), dt)
        }
        const range = T.tiltRange / (settings.data.tiltSensitivity ?? 1)
        const now = tiltAngles(motion.raw.u)
        const zero = tiltAngles(motion.neutral.u ?? upOf(motion.neutral.b, motion.neutral.g))
        motion.tilt.x = smooth.tx.step(clamp((now.x - zero.x) / range, -1, 1), dt)
        motion.tilt.y = smooth.ty.step(clamp(wrap(now.y - zero.y) / range, -1, 1), dt)
        motion.source = 'phone'
        motion.fireHeld = Boolean(inp.f)
        if (party.pressed(id, 'f')) motion.firePressed = true
      } else {
        motion.tilt.x = motion.tilt.y = 0
        motion.wheel = null
        for (const f of Object.values(smooth)) f.reset()
        motion.fireHeld = false
        motion.source = 'stick'
      }
      if (motion.activeId && motion.phone?.connected && t - pingAt > (fastPings > 0 ? 0.25 : T.pingEvery)) {
        pingAt = t
        fastPings--
        pingsOut.set(++pingId, t)
        for (const k of pingsOut.keys()) if (k < pingId - 8) pingsOut.delete(k)
        party.send(motion.activeId, { ping: pingId })
      } else if (!motion.phone?.connected) motion.centering = 0

      if (isBlocked()) return
      // Stand-ins. The stick takes over when there's no phone tilting: a phone held level (or
      // none) lets it, a phone being tilted keeps control.
      const phoneTilting = motion.source === 'phone' && Math.hypot(motion.tilt.x, motion.tilt.y) > 0.15
      if (Math.hypot(input.x, input.y) > 0.25 && !phoneTilting) {
        motion.tilt.x = input.x
        motion.tilt.y = input.y
        motion.source = 'stick'
      }
      if (input.held('a')) motion.fireHeld = true
      if (input.pressed('a')) {
        motion.firePressed = true
        push({ dir: null, power: T.padPower, t, src: 'pad' })
      }
      for (const d of DIRS) if (input.pressed(d)) push({ dir: d, power: T.padPower, t, src: 'pad' })
      const aim = Math.hypot(input.aimX, input.aimY)
      if (aim > 0.8 && aimArmed) {
        aimArmed = false
        const dir = Math.abs(input.aimX) > Math.abs(input.aimY) ? (input.aimX > 0 ? 'right' : 'left') : input.aimY > 0 ? 'down' : 'up'
        push({ dir, power: T.padPower, t, src: 'pad' })
      } else if (aim < 0.4) aimArmed = true
      pointerSwipes(t)
    },

    /** Messages from phones: swings, pongs, take-over, re-center. */
    message(from, data) {
      if (data.take) return motion.take(from)
      if (from !== motion.activeId) return
      if (pingsOut.has(data.pong)) {
        const sent = pingsOut.get(data.pong)
        pingsOut.delete(data.pong)
        const back = now()
        const check = { rtt: back - sent, off: typeof data.pt === 'number' ? data.pt / 1000 - (sent + back) / 2 : null }
        clock.push(check)
        if (clock.length > T.clockSamples) clock.shift()
        // The fastest trip had the least waiting in queues: it shows the clocks best.
        const best = clock.reduce((a, c) => (c.rtt < a.rtt ? c : a))
        motion.rtt = best.rtt
        motion.clockOff = best.off
        motion.jitter = Math.max(...clock.map((c) => c.rtt)) - best.rtt
      }
      if (data.center) motion.center()
      const s = data.swing
      if (s && !isBlocked()) {
        const dir = DIRS.includes(s.dir) ? s.dir : null
        // On the phone's clock when we have the clock check, otherwise from the delay estimate.
        const t = typeof s.pt === 'number' && motion.clockOff !== null ? Math.min(now(), s.pt / 1000 - motion.clockOff) : now() - motion.lag - (Number(s.age) || 0) / 1000
        const swing = { dir, power: clamp(Number(s.p) || 0, 0, 1), m: Number(s.m) || 0, t, src: 'phone', raw: s.raw }
        pending.push(swing)
        log(swing)
      }
    }
  }

  function push(s) {
    motion.swings.push(s)
    log(s)
  }
  function log(s) {
    motion.log.unshift({ ...s, at: now() })
    if (motion.log.length > 8) motion.log.length = 8
  }

  /** Mouse and touch: a quick drag is a swipe in its direction, a short press a tap. */
  function pointerSwipes(t) {
    const p = input.pointer
    if (p.pressed) swipe = { x: p.x, y: p.y, t, done: false }
    if (swipe && !swipe.done && p.down) {
      const dx = p.x - swipe.x
      const dy = p.y - swipe.y
      const dist = Math.hypot(dx, dy)
      if (dist > T.swipeMin) {
        const speed = dist / Math.max(0.016, t - swipe.t)
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
        push({ dir, power: clamp(speed / T.swipeFull, 0.3, 1), t, src: 'pointer' })
        swipe.done = true
      }
    }
    if (p.released && swipe) {
      if (!swipe.done) push({ dir: null, power: T.padPower, t, src: 'pointer', tap: true, x: p.x, y: p.y })
      swipe = null
    }
  }

  party.on('msg', ({ from, data }) => data && typeof data === 'object' && motion.message(from, data))
  return motion
}
