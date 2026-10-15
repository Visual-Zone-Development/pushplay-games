// npm run check [game-id ...]
// Validates, builds, plays (headless, at Steam Deck size) and renders art for games.
// With no ids, checks every game. Exit code 1 if any game has errors.
import { relative } from 'node:path'
import { listGames, log, parseArgs, ROOT } from './lib.mjs'
import { buildGame, launchBrowser } from './pipeline.mjs'

const { positional } = parseArgs(process.argv.slice(2))
const all = listGames()
const ids = positional.length ? positional : all
const unknown = ids.filter((id) => !all.includes(id))
if (unknown.length) {
  log(`Unknown game(s): ${unknown.join(', ')}. Games: ${all.join(', ') || '(none yet; run npm run new-game <id>)'}`)
  process.exit(1)
}

const browser = await launchBrowser()
let failed = 0
for (const id of ids) {
  log(`\n▶ ${id}`)
  try {
    const result = await buildGame(id, browser, { pack: false })
    for (const w of result.warnings) log(`  ⚠ ${w}`)
    const art = (name) => relative(ROOT, `${result.out}/__art/${name}.png`)
    log(`  ✓ playable. Look at the art and screenshot to make sure they look right:`)
    log(`    ${art('cover')}  (library tile, 720×500)`)
    log(`    ${art('hero')}  (detail banner, 1920×450)`)
    log(`    ${art('screenshot')}  (the game after 3s at 1280×800)`)
  } catch (err) {
    failed++
    log(`  ✗ ${String(err.message).replaceAll('\n', '\n  ✗ ')}`)
  }
}
await browser.close()
log(failed ? `\n${failed} of ${ids.length} game(s) need fixes.` : `\nAll ${ids.length} game(s) passed.`)
process.exit(failed ? 1 : 0)
