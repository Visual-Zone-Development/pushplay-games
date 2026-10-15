// npm run dev <game-id>
// Serves a game with live reload at http://localhost:5173 for playing in a browser.
import { spawn } from 'node:child_process'
import { findGame, listGames, log, ROOT } from './repo.mjs'

const games = listGames()
const game = process.argv[2] ? findGame(process.argv[2]) : games.length === 1 ? games[0] : undefined
if (!game) {
  log(`Usage: npm run dev <game-id>   (games: ${games.map((g) => g.id).join(', ') || 'none yet'})`)
  process.exit(1)
}
const child = spawn('npx', ['vite', game.dir, '--port', '5173'], { cwd: ROOT, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
