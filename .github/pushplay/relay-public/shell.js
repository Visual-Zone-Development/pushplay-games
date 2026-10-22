// The party join page: the same page for every game. It joins a TV's party by code, gets the
// game's controller from the TV, runs it in a sandboxed frame (frame.html) and passes messages
// between the two. It survives locked phones and Wi-Fi changes: the seat is kept on the relay
// and taken back with a resume token.
//
// Messages inside the relay's `send` payload (d), host → phone:
//   {k:'cb', h, i, n, s}   controller chunk i of n (n = 0: "use the one you have", h = its hash)
//   anything else          passed to the controller
// phone → host:
//   {k:'hi', h}            "I'm (back) here; I have controller h": the host replies with the
//                          controller if needed, then everything the controller should show
//   anything else          from the controller

const COLORS = ['#ffb547', '#ff6b6b', '#4dd8a8', '#5aa9ff', '#c38bff', '#ff8fd0', '#f5e663', '#8ce05a']
const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {}
  }
}
const session = {
  get: (k) => {
    try {
      return sessionStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k, v) => {
    try {
      if (v === null) sessionStorage.removeItem(k)
      else sessionStorage.setItem(k, v)
    } catch {}
  }
}
const $ = (id) => document.getElementById(id)

const ERRORS = {
  'not-found': 'No party with that code. Check the TV.',
  full: 'That party is full.',
  locked: "That game has started and isn't letting new players in.",
  'bad-message': 'Something went wrong. Try again.'
}
const CLOSED = { 'host-left': 'The game ended.', idle: 'The party closed after a quiet spell.', kicked: 'You were removed from the party.' }

let ws = null
let code = ''
let me = null // { id, name, color }
let resume = null
let left = false
let retry = 0
let retryTimer = null
let frame = null
let frameReady = false
let pending = [] // messages for the controller until it's ready
let chunks = null
let wakeLock = null

// ---- join form ---------------------------------------------------------------------------

const fromPath = /^\/j\/([A-Za-z]{4})\/?$/.exec(location.pathname)?.[1]?.toUpperCase()
let color = store.get('party:color') ?? COLORS[Math.floor(Math.random() * COLORS.length)]
$('code').value = fromPath ?? ''
$('name').value = store.get('party:name') ?? ''
for (const c of COLORS) {
  const b = document.createElement('button')
  b.type = 'button'
  b.style.background = c
  b.setAttribute('aria-label', c)
  b.setAttribute('aria-pressed', String(c === color))
  b.onclick = () => {
    color = c
    for (const o of $('colors').children) if (o.tagName === 'BUTTON') o.setAttribute('aria-pressed', String(o === b))
  }
  $('colors').append(b)
}

// Back on the page with a seat still held (reload, or the browser dropped the tab): rejoin.
const held = fromPath && session.get(`party:resume:${fromPath}`)
if (held && $('name').value) join(fromPath, $('name').value, held)
else showForm()

function showForm(error = '') {
  $('play').hidden = true
  $('join').hidden = false
  $('error').textContent = error
  $('go').disabled = false
  ;($('code').value ? $('name') : $('code')).focus()
}

$('join').onsubmit = (e) => {
  e.preventDefault()
  const c = $('code').value.trim().toUpperCase()
  const name = $('name').value.trim()
  if (!/^[A-Z]{4}$/.test(c)) return showForm('Room codes are four letters.')
  if (!name) return showForm('Pick a name.')
  store.set('party:name', name)
  store.set('party:color', color)
  history.replaceState(null, '', `/j/${c}`)
  join(c, name, session.get(`party:resume:${c}`))
}

$('leave').onclick = () => {
  left = true
  send({ t: 'leave' })
  session.set(`party:resume:${code}`, null)
  ws?.close(1000)
  unmount()
  history.replaceState(null, '', '/')
  $('code').value = ''
  showForm()
}

// ---- connection --------------------------------------------------------------------------

function join(c, name, token) {
  code = c
  resume = token
  me = { id: null, name, color }
  left = false
  $('go').disabled = true
  $('join').hidden = true
  $('play').hidden = false
  $('who').textContent = name
  $('swatch').style.background = color
  $('room').textContent = code
  notice('Joining…')
  connect()
}

function connect() {
  clearTimeout(retryTimer)
  if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) return
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/?party=1`)
  ws = socket
  socket.onopen = () => send({ t: 'party-join', room: code, name: me.name, color: me.color, resume })
  socket.onmessage = (e) => receive(JSON.parse(e.data))
  socket.onclose = (e) => {
    if (ws !== socket || left) return
    ws = null
    if (e.code === 4001) return notice('This party is open in another tab.', 'Use this tab', connect)
    if (e.code === 4008) return notice('Online play is resting until tomorrow.')
    // Lost the connection (locked phone, Wi-Fi change): the seat waits for us, so keep trying.
    notice('Reconnecting…')
    retryTimer = setTimeout(connect, Math.min(8000, 500 * 2 ** retry++))
  }
}

function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

function receive(msg) {
  switch (msg.t) {
    case 'party-joined':
      retry = 0
      me.id = msg.you
      resume = msg.resume
      session.set(`party:resume:${code}`, resume)
      keepAwake()
      hello()
      return
    case 'host-away':
      return notice('The TV lost its connection. Hang on…')
    case 'host-back':
      return hello()
    case 'closed':
      left = true
      session.set(`party:resume:${code}`, null)
      ws?.close(1000)
      unmount()
      return notice(CLOSED[msg.reason] ?? 'The party closed.', 'Join another', () => {
        history.replaceState(null, '', '/')
        $('code').value = ''
        showForm()
      })
    case 'error':
      if (msg.code === 'not-found' && resume) session.set(`party:resume:${code}`, null)
      left = true
      ws?.close(1000)
      return showForm(ERRORS[msg.code] ?? ERRORS['bad-message'])
    case 'warn':
      return
    case 'msg':
      return fromHost(msg.d)
  }
}

/** Tell the host we're here, and which controller we already have. */
function hello() {
  notice('Getting the game ready…')
  send({ t: 'send', d: { k: 'hi', h: store.get('party:controller-hash') } })
}

function fromHost(d) {
  if (!d || typeof d !== 'object') return
  if (d.k !== 'cb') return toController(d)
  if (d.n === 0) {
    const html = store.get('party:controller-hash') === d.h ? store.get('party:controller') : null
    if (html) return mount(html)
    // The cache went missing since we said hello: ask again, with nothing cached.
    return send({ t: 'send', d: { k: 'hi', h: null } })
  }
  if (!chunks || chunks.h !== d.h) chunks = { h: d.h, parts: [] }
  chunks.parts[d.i] = d.s
  if (chunks.parts.filter((p) => p !== undefined).length < d.n) return
  const html = chunks.parts.join('')
  chunks = null
  store.set('party:controller', html)
  store.set('party:controller-hash', d.h)
  mount(html)
}

// ---- the controller frame ----------------------------------------------------------------

function mount(html) {
  // Keep messages waiting for the controller: the host sends everything right after the
  // controller pages, which are paced, so the state often arrives first.
  frame?.remove()
  frameReady = false
  frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.setAttribute('allow', 'fullscreen')
  frame.src = '/frame.html'
  frame.html = html
  $('stage').append(frame)
}

function unmount() {
  frame?.remove()
  frame = null
  frameReady = false
  pending = []
}

function toController(d) {
  if (frameReady) frame.contentWindow.postMessage({ type: 'msg', d }, '*')
  else pending.push(d)
}

addEventListener('message', (e) => {
  if (!frame || e.source !== frame.contentWindow || !e.data) return
  const m = e.data
  if (m.type === 'frame') frame.contentWindow.postMessage({ type: 'load', html: frame.html }, '*')
  else if (m.type === 'ready') {
    frameReady = true
    frame.contentWindow.postMessage({ type: 'me', me: { ...me, room: code } }, '*')
    for (const d of pending.splice(0)) toController(d)
    notice(null)
  } else if (m.type === 'send') send({ t: 'send', d: m.d })
  else if (m.type === 'vibrate') navigator.vibrate?.(Math.min(1000, Number(m.ms) || 0))
})

// ---- niceties ----------------------------------------------------------------------------

function notice(text, button, onClick) {
  $('notice').hidden = !text
  $('notice-text').textContent = text ?? ''
  $('notice-button').hidden = !button
  $('notice-button').textContent = button ?? ''
  $('notice-button').onclick = onClick ?? null
}

/** Keep the screen on while playing. */
async function keepAwake() {
  try {
    if (!wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock?.request('screen')
      wakeLock?.addEventListener('release', () => (wakeLock = null))
    }
  } catch {}
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !me?.id || left) return
  keepAwake()
  // Phones often kill sockets in the background without telling us.
  if (ws?.readyState !== WebSocket.OPEN) {
    retry = 0
    connect()
  }
})
