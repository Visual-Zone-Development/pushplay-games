// A relay running next to the game, for `npm run dev` and the build check, so online games
// work with no internet. Same room logic as the hosted relay (relay-rooms.mjs is copied from it).
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { WebSocketServer } from 'ws'

// In a game repo the kit carries its own copy; in the launcher monorepo it reads the relay's.
const vendored = join(import.meta.dirname, 'relay-rooms.mjs')
const source = join(import.meta.dirname, '../../../apps/relay/src/rooms.mjs')
const { Relay } = await import(pathToFileURL(existsSync(vendored) ? vendored : source).href)

/** Start a relay on 127.0.0.1 (port 0 = any free port). Tracks the bytes it forwards. */
export async function startLocalRelay(port = 0) {
  const stats = { bytes: 0 }
  const relay = new Relay({ onTraffic: (n) => (stats.bytes += n) })
  const server = createServer((_req, res) => res.writeHead(404).end())
  const wss = new WebSocketServer({ server })
  wss.on('connection', (ws) => {
    const client = relay.connect({ send: (t) => ws.send(t), close: (code, reason) => ws.close(code, reason) }, { game: 'local' })
    ws.on('message', (data) => client.receive(data.toString('utf8')))
    ws.on('close', () => client.disconnect())
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  return {
    url: `ws://127.0.0.1:${server.address().port}/`,
    stats,
    close: () =>
      new Promise((resolve) => {
        for (const ws of wss.clients) ws.terminate()
        server.close(resolve)
      })
  }
}
