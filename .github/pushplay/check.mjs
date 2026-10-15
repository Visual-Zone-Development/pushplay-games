// node <kit>/check.mjs [game-id ...]
// Validates, builds, plays (headless, at Steam Deck size) and renders art for games.
// With no ids, checks every game. Exit code 1 if any game has errors.
import { join } from 'node:path'
import { display, listGames, log, layout } from './repo.mjs'
import { ART_DIR, buildGame, launchBrowser } from './pipeline.mjs'

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const games = listGames()
if (!games.length) {
  log(layout() === 'collection' ? 'No games yet. Create one with: npm run new-game <id>' : 'No game manifest found.')
  process.exit(1)
}
const selected = wanted.length ? games.filter((g) => wanted.includes(g.id)) : games
const unknown = wanted.filter((id) => !games.some((g) => g.id === id))
if (unknown.length) {
  log(`Unknown game(s): ${unknown.join(', ')}. Games: ${games.map((g) => g.id).join(', ')}`)
  process.exit(1)
}

const browser = await launchBrowser()
let failed = 0
for (const game of selected) {
  log(`\n▶ ${game.id}`)
  try {
    const result = await buildGame(game, browser, { pack: false })
    for (const w of result.warnings) log(`  ⚠ ${w}`)
    const art = (name) => display(join(result.out, ART_DIR, `${name}.png`))
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
log(failed ? `\n${failed} of ${selected.length} game(s) need fixes.` : `\nAll ${selected.length} game(s) passed.`)
process.exit(failed ? 1 : 0)
