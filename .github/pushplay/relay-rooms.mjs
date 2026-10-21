// Rooms and message forwarding for online games. The relay never reads game data: it groups
// players into rooms and passes their messages along, within limits.
//
// Transport-agnostic and dependency-free: the hosted relay (server.mjs) and the build kit's
// local stand-in (copied into game repos as relay-rooms.mjs) both drive it. A socket is
// anything with send(text) and close(code, reason).
//
// Protocol (JSON text frames). Client → relay:
//   {t:'list'}                    open rooms of this game
//   {t:'host', max}               open a room and join it as host
//   {t:'join', room}              join a room by code
//   {t:'quick', max}              join the oldest open room with space, or host one
//   {t:'start'}                   host only: close the room to new players
//   {t:'leave'}
//   {t:'send', to?, d}            forward d to one player (to) or everyone else in the room
// Relay → client:
//   {t:'hello', you, limits}      {t:'rooms', rooms:[{id, players, max}]}
//   {t:'joined', room, you, host, players, max}
//   {t:'peer-join', id}  {t:'peer-leave', id}  {t:'start'}  {t:'closed', reason}
//   {t:'msg', from, d}  {t:'error', code}  {t:'warn', code}

export const LIMITS = {
  maxPlayers: 8,
  /** Largest frame a client may send. */
  maxMessageBytes: 16 * 1024,
  /** Per player, counting every copy forwarded (a host sending to 3 players pays 3×). */
  bytesPerSecond: 48 * 1024,
  burstBytes: 128 * 1024,
  messagesPerSecond: 90,
  roomsPerGame: 200,
  idleRoomMs: 10 * 60_000,
  /** Over-limit messages (dropped) before the player is disconnected. */
  strikes: 30
}

export const CLOSE = { rate: 4029, tooBig: 4013 }

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I or O: codes are read off a screen

export class Relay {
  /**
   * @param {object} [opts]
   * @param {Partial<typeof LIMITS>} [opts.limits]
   * @param {(bytes: number) => void} [opts.onTraffic] bytes sent to clients, for bandwidth budgets
   * @param {() => number} [opts.now]
   */
  constructor({ limits = {}, onTraffic = () => {}, now = Date.now } = {}) {
    this.limits = { ...LIMITS, ...limits }
    this.onTraffic = onTraffic
    this.now = now
    /** game → Map(code → room) */
    this.games = new Map()
    this.clients = new Set()
    this.nextId = 1
  }

  /** Attach a socket. `game` namespaces rooms (repo, game id and version), so games never mix. */
  connect(socket, { game }) {
    const client = {
      id: `p${this.nextId++}`,
      game,
      socket,
      room: null,
      bytes: this.limits.burstBytes,
      messages: this.limits.messagesPerSecond,
      refilled: this.now(),
      strikes: 0,
      warned: -Infinity
    }
    this.clients.add(client)
    const { maxMessageBytes, bytesPerSecond, maxPlayers } = this.limits
    this.#send(client, { t: 'hello', you: client.id, limits: { maxMessageBytes, bytesPerSecond, maxPlayers } })
    return {
      id: client.id,
      receive: (text) => this.#receive(client, text),
      disconnect: () => this.#disconnect(client)
    }
  }

  /** Close rooms nobody has used for a while. Call every minute or so. */
  sweep() {
    const cutoff = this.now() - this.limits.idleRoomMs
    for (const rooms of this.games.values()) for (const room of rooms.values()) if (room.active < cutoff) this.#close(room, 'idle')
  }

  /** Close every connection (budget exhausted, shutdown). */
  closeAll(code, reason) {
    for (const client of [...this.clients]) client.socket.close(code, reason)
  }

  stats() {
    let rooms = 0
    for (const r of this.games.values()) rooms += r.size
    return { players: this.clients.size, rooms, games: this.games.size }
  }

  #receive(client, text) {
    const size = typeof text === 'string' ? Buffer.byteLength(text) : text.length
    if (size > this.limits.maxMessageBytes) return client.socket.close(CLOSE.tooBig, 'message too big')
    let msg
    try {
      msg = JSON.parse(text)
    } catch {
      return this.#send(client, { t: 'error', code: 'bad-message' })
    }
    if (!msg || typeof msg !== 'object') return this.#send(client, { t: 'error', code: 'bad-message' })

    const recipients = msg.t === 'send' ? this.#recipients(client, msg.to).length : 1
    if (!this.#spend(client, size * Math.max(1, recipients))) return

    switch (msg.t) {
      case 'list':
        return this.#send(client, { t: 'rooms', rooms: this.#openRooms(client.game).map((r) => ({ id: r.id, players: r.players.length, max: r.max })) })
      case 'host':
        return this.#host(client, msg.max)
      case 'join':
        return this.#join(client, String(msg.room ?? '').toUpperCase())
      case 'quick': {
        const max = this.#max(msg.max)
        const room = this.#openRooms(client.game).find((r) => r.max === max && r !== client.room)
        return room ? this.#join(client, room.id) : this.#host(client, max)
      }
      case 'start':
        if (client.room?.host === client) {
          client.room.open = false
          this.#broadcast(client.room, { t: 'start' })
        }
        return
      case 'leave':
        return this.#leave(client)
      case 'send': {
        if (!client.room) return this.#send(client, { t: 'error', code: 'no-room' })
        client.room.active = this.now()
        const out = JSON.stringify({ t: 'msg', from: client.id, d: msg.d })
        for (const to of this.#recipients(client, msg.to)) this.#sendRaw(to, out)
        return
      }
      default:
        return this.#send(client, { t: 'error', code: 'bad-message' })
    }
  }

  /** Token buckets for bytes and messages. Over the limit: drop, warn, and eventually disconnect. */
  #spend(client, bytes) {
    const now = this.now()
    const seconds = (now - client.refilled) / 1000
    client.refilled = now
    const { bytesPerSecond, burstBytes, messagesPerSecond } = this.limits
    client.bytes = Math.min(burstBytes, client.bytes + seconds * bytesPerSecond)
    client.messages = Math.min(messagesPerSecond, client.messages + seconds * messagesPerSecond)
    if (client.bytes >= bytes && client.messages >= 1) {
      client.bytes -= bytes
      client.messages -= 1
      return true
    }
    if (++client.strikes > this.limits.strikes) {
      client.socket.close(CLOSE.rate, 'sending too much')
      return false
    }
    if (now - client.warned > 1000) {
      client.warned = now
      this.#send(client, { t: 'warn', code: 'rate' })
    }
    return false
  }

  #max(max) {
    const n = Math.floor(Number(max))
    return Number.isFinite(n) ? Math.max(2, Math.min(this.limits.maxPlayers, n)) : 2
  }

  #rooms(game) {
    let rooms = this.games.get(game)
    if (!rooms) this.games.set(game, (rooms = new Map()))
    return rooms
  }

  #openRooms(game) {
    const rooms = this.games.get(game)
    if (!rooms) return []
    return [...rooms.values()].filter((r) => r.open && r.players.length < r.max).sort((a, b) => a.created - b.created)
  }

  #host(client, max) {
    this.#leave(client)
    const rooms = this.#rooms(client.game)
    if (rooms.size >= this.limits.roomsPerGame) return this.#send(client, { t: 'error', code: 'busy' })
    let id
    do id = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('')
    while (rooms.has(id))
    const now = this.now()
    const room = { id, game: client.game, host: client, players: [client], max: this.#max(max), open: true, created: now, active: now }
    rooms.set(id, room)
    client.room = room
    this.#sendJoined(client)
  }

  #join(client, id) {
    const room = this.games.get(client.game)?.get(id)
    if (!room) return this.#send(client, { t: 'error', code: 'not-found' })
    if (room === client.room) return this.#sendJoined(client)
    if (!room.open) return this.#send(client, { t: 'error', code: 'started' })
    if (room.players.length >= room.max) return this.#send(client, { t: 'error', code: 'full' })
    this.#leave(client)
    this.#broadcast(room, { t: 'peer-join', id: client.id })
    room.players.push(client)
    room.active = this.now()
    client.room = room
    this.#sendJoined(client)
  }

  #sendJoined(client) {
    const room = client.room
    this.#send(client, { t: 'joined', room: room.id, you: client.id, host: room.host.id, players: room.players.map((p) => p.id), max: room.max })
  }

  #leave(client) {
    const room = client.room
    if (!room) return
    client.room = null
    if (room.host === client) return this.#close(room, 'host-left')
    room.players = room.players.filter((p) => p !== client)
    this.#broadcast(room, { t: 'peer-leave', id: client.id })
  }

  #close(room, reason) {
    this.games.get(room.game)?.delete(room.id)
    if (this.games.get(room.game)?.size === 0) this.games.delete(room.game)
    for (const p of room.players) {
      if (p.room !== room) continue
      p.room = null
      this.#send(p, { t: 'closed', reason })
    }
  }

  #disconnect(client) {
    if (!this.clients.delete(client)) return
    this.#leave(client)
  }

  #recipients(client, to) {
    const room = client.room
    if (!room) return []
    if (to === undefined || to === null) return room.players.filter((p) => p !== client)
    const target = room.players.find((p) => p.id === to)
    return target && target !== client ? [target] : []
  }

  #broadcast(room, msg) {
    const out = JSON.stringify(msg)
    for (const p of room.players) this.#sendRaw(p, out)
  }

  #send(client, msg) {
    this.#sendRaw(client, JSON.stringify(msg))
  }

  #sendRaw(client, text) {
    this.onTraffic(Buffer.byteLength(text))
    client.socket.send(text)
  }
}
