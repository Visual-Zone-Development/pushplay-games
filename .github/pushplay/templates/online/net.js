// Online play: connects to the shared relay, runs rooms (host / join / quick match), and keeps
// one shared state object in sync. Shared by every online game; don't edit it per game (the
// build check warns when a copy is out of date).
//
// The host's game runs the rules: it reads everyone's inputs and writes `net.state`. net.js
// sends only what changed, about 30 times a second, stamped with the host's clock. Players draw
// from `net.view`: a moment slightly in the past (INTERP_MS), blended between the two updates
// around it, so uneven network timing never shows as stutter. Host events (net.event) play at
// the same moment, in step with what's on screen. Nothing changed means nothing is sent.
//
//   const net = createNet({ maxPlayers: 4 })
//   each frame:  net.update()
//   host:        net.state.ships[id] = {...}; read net.inputs[id] for each id in net.players
//   everyone:    net.setInput({ x: input.x, fire: input.held('a') }); draw from net.view
//   events:      net.on('join' | 'leave' | 'start' | 'end' | 'event' | 'disconnect', fn)
//   secrets:     host: net.privateView(id).hand = [...]   that player: net.mine.hand
//                (net.state reaches everyone; a view reaches only its player)
//
// Fractional numbers (positions, angles) are blended between updates; whole numbers (counts,
// scores, countdowns) jump straight to the newest value.
//
// Keep state small and JSON-shaped (numbers, strings, booleans, objects, arrays). Key things
// that come and go by id (`ships: { p2: {...} }`), not by array position: removing the first
// item of an array changes every index after it, and all of them get resent.

export const NET_VERSION = 4

/** Time between state updates from the host (about 30 a second). */
const TICK_MS = 33
/**
 * How far in the past players see the game, so there's always a next update to blend toward:
 * enough to ride out one late update and normal network wobble.
 */
const INTERP_MS = 80
/** Numbers are rounded to this many decimal places, so tiny jitter isn't a change. */
const DECIMALS = 2
/** Dev and the build check run their own relay next to the game. */
const LOCAL_RELAY_PORT = 5174

const CLOSE_REASONS = {
  4003: "This build can't go online. Rebuild it to get a fresh online pass.",
  4008: 'Online play is resting until tomorrow.',
  4009: 'Too many connections from this network.',
  4013: 'The game sent a message that was too big.',
  4029: 'The game sent too much data.'
}

export function createNet({ maxPlayers = 2, minPlayers = 2 } = {}) {
  let ws = null
  let connecting = null
  let lastTick = 0
  let lastSent = {} // host: the snapshot players have
  let lastViews = {} // host: each player's private view, as they have it
  let snaps = [] // player: recent states as { t: host time, s: state }, oldest first
  let events = [] // player: host events waiting for their moment on screen
  let clockOffset = null // player: local time minus host time, at the lowest latency seen
  let myInput = {}
  let sentInput = '{}'
  const listeners = {}
  const round = 10 ** DECIMALS

  const net = {
    /** idle | connecting | online (no room) | room (lobby) | playing | error */
    status: 'idle',
    error: '',
    /** Open rooms, after refresh(): [{ id, players, max }] */
    rooms: [],
    room: null,
    me: null,
    hostId: null,
    get isHost() {
      return net.me !== null && net.me === net.hostId
    },
    /** Player ids in join order; the host is first. */
    players: [],
    maxPlayers,
    minPlayers,
    /** Host: the game's shared state, written by the host. Players: the newest state received. */
    state: {},
    /** What to draw: the state, smoothed between updates (the host sees its own state). */
    view: {},
    /** Host: every player's latest input, by id (including the host's own). */
    inputs: {},
    /** Host: each player's private view, by id; net.privateView(id) creates one. */
    privateViews: {},
    /** This player's private view, from the host (only this player gets it). */
    mine: {},
    privateView: (id) => (net.privateViews[id] ??= {}),
    stats: { sentBytes: 0, receivedBytes: 0, patches: 0, fulls: 0 },

    /** Number for a player (0 = host): handy for colours and spawn points. */
    slot: (id) => net.players.indexOf(id),

    on(type, fn) {
      ;(listeners[type] ??= []).push(fn)
      return () => (listeners[type] = listeners[type].filter((f) => f !== fn))
    },

    connect,
    refresh: () => send({ t: 'list' }),
    host: () => withSocket(() => send({ t: 'host', max: maxPlayers })),
    join: (room) => withSocket(() => send({ t: 'join', room })),
    quickMatch: () => withSocket(() => send({ t: 'quick', max: maxPlayers })),
    /** Host: close the room to new players and start the match. */
    start() {
      if (net.isHost) send({ t: 'start' })
    },
    leave() {
      send({ t: 'leave' })
      leftRoom()
    },
    /** Hang up entirely (back to the title screen). */
    disconnect() {
      ws?.close(1000)
      ws = null
      connecting = null
      leftRoom()
      net.status = 'idle'
    },

    /** This player's controls. Sent to the host only when they change. */
    setInput(value) {
      myInput = value
      if (net.isHost && net.me) net.inputs[net.me] = value
    },

    /** A one-off moment (a goal, an explosion) for everyone, including yourself. */
    event(name, data) {
      send({ t: 'send', d: { k: 'e', n: name, d: data, t: Math.round(performance.now()) } })
      emit('event', { name, data, from: net.me })
    },

    /** Call once per frame. */
    update(now = performance.now()) {
      if (!net.room) return
      if (net.isHost) {
        net.view = net.state
        if (now - lastTick >= TICK_MS) {
          // Keep to the beat instead of drifting a frame late each time.
          lastTick = now - lastTick > TICK_MS * 2 ? now : lastTick + TICK_MS
          const snap = snapshot(net.state, round)
          const ops = diff(lastSent, snap)
          if (ops.length) {
            send({ t: 'send', d: { k: 'p', p: ops, t: Math.round(now) } })
            net.stats.patches++
          }
          lastSent = snap
          for (const id of net.players) {
            if (id === net.me || !lastViews[id]) continue
            const v = snapshot(net.privateViews[id] ?? {}, round)
            const vops = diff(lastViews[id], v)
            if (vops.length) send({ t: 'send', to: id, d: { k: 'v', p: vops } })
            lastViews[id] = v
          }
        }
        net.mine = net.privateViews[net.me] ?? {}
      } else {
        const text = JSON.stringify(snapshot(myInput, round))
        if (text !== sentInput && net.hostId) {
          sentInput = text
          send({ t: 'send', to: net.hostId, d: { k: 'i', i: JSON.parse(text) } })
        }
        // Draw the host's world as it was INTERP_MS ago, blended between the updates around then.
        const at = clockOffset === null ? 0 : now - clockOffset - INTERP_MS
        net.view = sample(snaps, at)
        while (snaps.length > 2 && snaps[1].t <= at) snaps.shift()
        while (events.length && events[0].t <= at) {
          const e = events.shift()
          emit('event', { name: e.n, data: e.d, from: net.hostId })
        }
      }
    }
  }

  function emit(type, payload) {
    for (const fn of listeners[type] ?? []) fn(payload)
  }

  function fail(message) {
    net.status = 'error'
    net.error = message
    leftRoom()
    emit('disconnect', message)
  }

  function leftRoom() {
    net.room = null
    net.hostId = null
    net.players = []
    net.inputs = {}
    if (net.status === 'room' || net.status === 'playing') net.status = 'online'
  }

  function send(msg) {
    if (ws?.readyState !== WebSocket.OPEN) return
    const text = JSON.stringify(msg)
    net.stats.sentBytes += text.length
    ws.send(text)
  }

  async function withSocket(fn) {
    await connect()
    if (ws?.readyState === WebSocket.OPEN) fn()
  }

  /** Where the relay is: __net.json (written into the build), else a relay running next to the game. */
  async function relayAddress() {
    try {
      const res = await fetch(new URL('__net.json', document.baseURI))
      if (res.ok) {
        const { url, token } = await res.json()
        if (url) return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token ?? '')}`
      }
    } catch {}
    if (['localhost', '127.0.0.1'].includes(location.hostname)) return `ws://${location.hostname}:${LOCAL_RELAY_PORT}/?game=local`
    return null
  }

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return Promise.resolve()
    if (connecting) return connecting
    net.status = 'connecting'
    net.error = ''
    connecting = (async () => {
      const address = await relayAddress()
      if (!address) return fail("This build isn't set up for online play.")
      await new Promise((resolve) => {
        const socket = new WebSocket(address)
        ws = socket
        socket.onopen = resolve
        socket.onmessage = (e) => receive(e.data)
        socket.onclose = (e) => {
          resolve()
          if (ws !== socket) return
          ws = null
          connecting = null
          if (net.status !== 'idle') fail(CLOSE_REASONS[e.code] ?? "Can't reach the game server. Check your connection.")
        }
      })
      if (ws?.readyState === WebSocket.OPEN) net.status = 'online'
    })()
    return connecting
  }

  function receive(text) {
    net.stats.receivedBytes += text.length
    const msg = JSON.parse(text)
    switch (msg.t) {
      case 'hello':
        net.me = msg.you
        break
      case 'rooms':
        net.rooms = msg.rooms
        break
      case 'joined':
        net.room = msg.room
        net.me = msg.you
        net.hostId = msg.host
        net.players = msg.players
        net.status = 'room'
        net.inputs = {}
        for (const id of net.players) net.inputs[id] = {}
        net.inputs[net.me] = myInput
        sentInput = '{}'
        net.privateViews = {}
        net.mine = {}
        lastViews = {}
        if (net.isHost) {
          lastSent = {}
          net.state = {}
        } else {
          net.state = {}
          snaps = []
          events = []
          clockOffset = null
        }
        net.view = net.state
        emit('joined', msg)
        break
      case 'peer-join':
        net.players.push(msg.id)
        net.inputs[msg.id] = {}
        // Newcomers get everything once; after that, the same changes as everyone else.
        if (net.isHost) {
          send({ t: 'send', to: msg.id, d: { k: 'f', s: lastSent, t: Math.round(performance.now()) } })
          lastViews[msg.id] = snapshot(net.privateViews[msg.id] ?? {}, round)
          send({ t: 'send', to: msg.id, d: { k: 'V', s: lastViews[msg.id] } })
          net.stats.fulls++
        }
        emit('join', msg.id)
        break
      case 'peer-leave':
        net.players = net.players.filter((id) => id !== msg.id)
        delete net.inputs[msg.id]
        delete net.privateViews[msg.id]
        delete lastViews[msg.id]
        emit('leave', msg.id)
        break
      case 'start':
        net.status = 'playing'
        emit('start')
        break
      case 'closed':
        leftRoom()
        net.error = msg.reason === 'host-left' ? 'The host left the game.' : 'The room closed.'
        emit('end', msg.reason)
        break
      case 'error':
        net.error = { 'not-found': "That room doesn't exist anymore.", full: 'That room is full.', started: 'That game already started.', busy: 'The server is busy. Try again soon.' }[msg.code] ?? ''
        emit('error', msg.code)
        break
      case 'msg':
        message(msg.from, msg.d)
        break
    }
  }

  function message(from, d) {
    if (!d || typeof d !== 'object') return
    const now = performance.now()
    if (d.k === 'i' && net.isHost) net.inputs[from] = d.i
    else if (from === net.hostId && d.k === 'V') net.mine = d.s
    else if (from === net.hostId && d.k === 'v') net.mine = applyPatch(structuredClone(net.mine), d.p)
    else if (from === net.hostId && typeof d.t === 'number') {
      // Track the host's clock. The lowest offset seen is the fastest delivery; drift up slowly
      // so a clock that wanders, or a one-off fast packet, doesn't freeze the view.
      const offset = now - d.t
      clockOffset = clockOffset === null || offset < clockOffset ? offset : clockOffset + (offset - clockOffset) * 0.002
      if (d.k === 'f') {
        net.state = d.s
        snaps = [{ t: d.t, s: d.s }]
      } else if (d.k === 'p') {
        const last = snaps.at(-1)
        // Nothing was sent while nothing changed: the old state held until just before this one.
        if (last && d.t - last.t > TICK_MS * 1.5) snaps.push({ t: d.t - TICK_MS, s: last.s })
        net.state = applyPatch(structuredClone(net.state), d.p)
        snaps.push({ t: d.t, s: net.state })
        if (snaps.length > 60) snaps.splice(0, snaps.length - 60)
      } else if (d.k === 'e') events.push(d)
    } else if (d.k === 'e') emit('event', { name: d.n, data: d.d, from })
  }

  if (typeof window !== 'undefined') window.__kitNet = net // the build check reads this
  return net
}

/** A JSON-safe copy with numbers rounded. */
export function snapshot(value, round = 100) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * round) / round : 0
  if (Array.isArray(value)) return value.map((v) => snapshot(v, round))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) if (v !== undefined && typeof v !== 'function') out[k] = snapshot(v, round)
    return out
  }
  return typeof value === 'function' || value === undefined ? null : value
}

const isObject = (v) => v !== null && typeof v === 'object'

/** The changes from a to b: [path, value] sets, [path] deletes. Arrays shrink via a "length" set. */
export function diff(a, b, path = [], ops = []) {
  if (a === b) return ops
  if (isObject(a) && isObject(b) && Array.isArray(a) === Array.isArray(b)) {
    if (Array.isArray(b)) {
      for (let i = 0; i < b.length; i++) diff(a[i], b[i], [...path, i], ops)
      if (a.length > b.length) ops.push([[...path, 'length'], b.length])
    } else {
      for (const k of Object.keys(b)) diff(a[k], b[k], [...path, k], ops)
      for (const k of Object.keys(a)) if (!(k in b)) ops.push([[...path, k]])
    }
    return ops
  }
  ops.push([path, b])
  return ops
}

export function applyPatch(root, ops) {
  for (const [path, value] of ops) {
    const deleting = value === undefined
    if (!path.length) {
      root = deleting ? {} : value
      continue
    }
    let node = root
    for (let i = 0; i < path.length - 1; i++) {
      if (!isObject(node[path[i]])) node[path[i]] = typeof path[i + 1] === 'number' ? [] : {}
      node = node[path[i]]
    }
    const key = path.at(-1)
    if (deleting) delete node[key]
    else node[key] = isObject(value) ? structuredClone(value) : value
  }
  return root
}

/** The state at host time t, blended between the updates on either side of it. */
export function sample(snaps, t) {
  if (!snaps.length) return {}
  if (t <= snaps[0].t) return snaps[0].s
  for (let i = 1; i < snaps.length; i++) {
    const b = snaps[i]
    if (t < b.t) {
      const a = snaps[i - 1]
      return lerp(a.s, b.s, (t - a.t) / (b.t - a.t))
    }
  }
  return snaps.at(-1).s
}

/**
 * Blend numbers from a toward b (t = 0..1); everything else comes from b. Whole numbers on both
 * sides (counts, scores, countdowns, lives) aren't blended: a countdown never shows 1.37.
 */
export function lerp(a, b, t) {
  if (typeof a === 'number' && typeof b === 'number') return Number.isInteger(a) && Number.isInteger(b) ? b : a + (b - a) * t
  if (isObject(a) && isObject(b) && Array.isArray(a) === Array.isArray(b)) {
    const out = Array.isArray(b) ? [] : {}
    for (const k of Object.keys(b)) out[k] = lerp(a[k], b[k], t)
    return out
  }
  return b
}
