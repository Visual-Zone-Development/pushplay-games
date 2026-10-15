// npm run dev <game-id>
// Serves a game with live reload at http://localhost:5173 for playing in a browser.
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { gamesRoot, listGames, log, ROOT } from './lib.mjs'

const id = process.argv[2]
if (!id || !listGames().includes(id)) {
  log(`Usage: npm run dev <game-id>   (games: ${listGames().join(', ') || 'none yet'})`)
  process.exit(1)
}
const child = spawn('npx', ['vite', join(gamesRoot, id), '--port', '5173'], { cwd: ROOT, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
