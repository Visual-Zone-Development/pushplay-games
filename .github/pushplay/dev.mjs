// npm run dev <game-id>
// Serves a game with live reload at http://localhost:5173 for playing in a browser.
import { spawn } from 'node:child_process'
import { LOCAL_RELAY_PORT } from './config.mjs'
import { startLocalRelay } from './local-relay.mjs'
import { findGame, listGames, log, npmSpawn, quote, readManifest, ROOT } from './repo.mjs'

const games = listGames()
const game = process.argv[2] ? findGame(process.argv[2]) : games.length === 1 ? games[0] : undefined
if (!game) {
  log(`Usage: npm run dev <game-id>   (games: ${games.map((g) => g.id).join(', ') || 'none yet'})`)
  process.exit(1)
}
// Online games find this relay on their own when served from localhost: open two browser
// windows to play against yourself.
if (readManifest(game).online) {
  await startLocalRelay(LOCAL_RELAY_PORT).then(
    () => log(`Local online relay on ws://localhost:${LOCAL_RELAY_PORT} (open the game in two windows to test online play)`),
    (err) => log(`Couldn't start the local online relay on port ${LOCAL_RELAY_PORT}: ${err.message}`)
  )
}
const child = spawn('npx', quote(['vite', game.dir, '--port', '5173']), { ...npmSpawn, cwd: ROOT, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
