// npm run new-game <game-id> [--vite] [--name "Display Name"]
// Creates games/<game-id>/ from the starter template: a controller-ready game loop,
// a manifest, and placeholder art to replace.
//   default: plain HTML + ES modules, no build step (best for most 2D games)
//   --vite:  a Vite project, for games that need npm packages (three.js, etc.)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { MANIFEST_FILE } from './config.mjs'
import { gamesRoot, log, ROOT } from './lib.mjs'

const args = process.argv.slice(2)
const vite = args.includes('--vite')
const nameIndex = args.indexOf('--name')
const name = nameIndex >= 0 ? args[nameIndex + 1] : undefined
const id = args.find((a, i) => !a.startsWith('--') && (nameIndex < 0 || i !== nameIndex + 1))

if (!id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
  log('Usage: npm run new-game <game-id> [--vite] [--name "Display Name"]')
  log('  game-id: lowercase letters, digits and dashes, e.g. tower-panic')
  process.exit(1)
}
const dir = join(gamesRoot, id)
if (existsSync(dir)) {
  log(`games/${id} already exists.`)
  process.exit(1)
}

const title = name ?? id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const templates = join(import.meta.dirname, 'templates')
const fill = (text) => text.replaceAll('{{NAME}}', title).replaceAll('{{ID}}', id)

/** Copy a template folder, filling placeholders in text files. */
function copyTemplate(from, to) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from)) {
    const src = join(from, entry)
    const dest = join(to, entry)
    if (statSync(src).isDirectory()) copyTemplate(src, dest)
    else writeFileSync(dest, fill(readFileSync(src, 'utf8')))
  }
}

const codeDir = vite ? join(dir, 'src') : dir
copyTemplate(join(templates, 'static'), codeDir)
cpSync(join(templates, 'shared/input.js'), join(codeDir, 'input.js'))
copyTemplate(join(templates, 'shared/art'), join(dir, 'art'))

const manifest = {
  $schema: '../../tools/manifest.schema.json',
  id,
  name: title,
  description: '',
  version: '0.1.0',
  entry: { web: 'index.html' },
  art: { cover: 'art/cover.svg', hero: 'art/hero.svg' },
  controls: 'gamepad',
  players: '1'
}

if (vite) {
  // index.html lives at the project root for Vite; the game code lives in src/.
  const html = readFileSync(join(codeDir, 'index.html'), 'utf8').replace('./game.js', './src/game.js')
  writeFileSync(join(dir, 'index.html'), html)
  rmSync(join(codeDir, 'index.html'))
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: id, private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build' } }, null, 2) + '\n'
  )
  // Relative base so the build works from any folder.
  writeFileSync(join(dir, 'vite.config.js'), `import { defineConfig } from 'vite'\n\nexport default defineConfig({ base: './' })\n`)
  manifest.build = { preset: 'vite', output: 'dist' }
}

writeFileSync(join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n')

// A Vite game is an npm workspace; refresh package-lock.json so CI's install matches. Commit it.
if (vite) spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: 'inherit' })

log(`Created games/${id}/ (${vite ? 'Vite' : 'plain HTML'}).`)
log('Next:')
log(`  1. Write the game in games/${id}/${vite ? 'src/' : ''}game.js (input.js handles controller + keyboard).`)
log(`  2. Fill in "description" in games/${id}/${MANIFEST_FILE}.`)
log(`  3. Replace games/${id}/art/cover.svg and hero.svg with real art.`)
log(`  4. npm run dev ${id}   → play it in a browser`)
log(`  5. npm run check ${id} → must pass before pushing`)
if (vite) log(`  npm packages: npm install <pkg> --workspace games/${id}`)
