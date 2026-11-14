// node <kit>/check.mjs [game-id ...]
// Validates, builds, plays (headless: controller, keyboard-only, touch-only, mouse-only, a denser
// 1280×720 @2× screen, and for phone games a touch-only phone at 3×) and renders art for games.
// With no ids, checks every game. Exit code 1 if any game has errors.
// Without a headless browser (its download blocked), the static checks still run and the rest is
// skipped with a note; KIT_BROWSER=/path/to/chrome uses an installed browser instead.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ART, CHECK_RUN_MS, RETIRED_DOCS, RETIRED_DOCS_DIR, VIEWPORT, VIEWPORT_PHONE } from './config.mjs'
import { display, listGames, log, layout, ROOT } from './repo.mjs'
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

let browser = null
try {
  browser = await launchBrowser()
} catch (err) {
  log(`⚠ No headless browser (${String(err.message).split('\n')[0]}).`)
  log('  Static checks only. Run `npm run setup` to install one, or set KIT_BROWSER to a Chrome/Chromium executable.')
}
let failed = 0
for (const game of selected) {
  log(`\n▶ ${game.id}`)
  try {
    const result = await buildGame(game, browser, { pack: false })
    for (const w of result.warnings) log(`  ⚠ ${w}`)
    if (result.skipped) {
      log('  ✓ builds (not played: no browser)')
      continue
    }
    const art = (name) => display(join(result.out, ART_DIR, `${name}.png`))
    log(`  ✓ playable. Look at the art and screenshot to make sure they look right:`)
    log(`    ${art('cover')}  (library tile, ${ART.cover.width}×${ART.cover.height})`)
    log(`    ${art('hero')}  (detail banner, ${ART.hero.width}×${ART.hero.height})`)
    log(`    ${art('screenshot')}  (the game after ${CHECK_RUN_MS / 1000}s at ${VIEWPORT.width}×${VIEWPORT.height})`)
    const phone = result.manifest.phone?.orientation
    for (const o of phone === 'any' ? ['portrait', 'landscape'] : phone ? [phone] : []) {
      const v = VIEWPORT_PHONE[o]
      log(`    ${art(`screenshot-phone-${o}`)}  (on a ${o} phone, ${v.width}×${v.height} @${v.deviceScaleFactor}x, touch only)`)
    }
  } catch (err) {
    failed++
    log(`  ✗ ${String(err.message).replaceAll('\n', '\n  ✗ ')}`)
  }
}
await browser?.close()
log(failed ? `\n${failed} of ${selected.length} game(s) need fixes.` : `\nAll ${selected.length} game(s) passed.`)
// The guides moved into the skills with kit v13. An update started by an older kit's update-kit
// installs this kit but can't do that move, so its old copies are still here.
if (RETIRED_DOCS.some((name) => existsSync(join(ROOT, RETIRED_DOCS_DIR, name)))) {
  log(`\n⚠ This repo's kit was updated by an older update-kit, which stopped half-way. Run \`npm run update-kit\` once more to finish (it removes the old guides in ${RETIRED_DOCS_DIR}/, links .agents/skills and adds the newer tools).`)
}
process.exit(failed ? 1 : 0)
