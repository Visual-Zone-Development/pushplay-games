---
name: playtest
description: Playtest the game in this repo without a human — drive it headlessly with scripted or bot inputs, capture screenshots over time, measure how long runs last, where players die and how the score grows, and turn that into a balance and fun report with concrete TUNING changes. Use for "is it balanced?", "playtest it", "is it too hard", "check the difficulty curve", "does it get boring", or before shipping a new game. It reports and proposes; it changes the game only when the user approves.
---

# Playtest

Follow the project's own rules first (its `AGENTS.md` or platform guide): they decide the APIs, the dev server, the checks and how to finish a change. Read the game's `DESIGN.md` (fun targets, pacing, Definition of done) and its `TUNING`. This skill **measures and reports**; it doesn't change the game unless the user approves the proposals.

It needs the game to expose a **debug hook**: a global the page can read, holding the game's state (current screen, score, health, level or wave, where the player, pickups and threats are) and its `TUNING`. If the game has none, add one first, the way the project's rules say.

## 1. Plan what to measure
Pick 3–6 questions from the design, for example:
- How long does a run last for a weak, an average and a good player?
- When does the first new thing appear, and then every how many seconds?
- Where do runs end (which enemy, hazard or level)?
- Is the first minute nearly impossible to lose?
- Does the score or progress grow at the rate the design expects?

## 2. Build a playtest script (scratch, never in the game folder)
Drive the game in a headless browser with Playwright: keyboard input, the state read through the debug hook, screenshots at intervals. Save this as `playtest.mjs` in a scratch folder that has Playwright (if `import 'playwright'` fails there: `npm install playwright && npx playwright install chromium`), start the project's dev server, and run `node playtest.mjs <url> <bot> <seed>`:

```js
import { chromium } from 'playwright'

const [url = 'http://localhost:5173', botName = 'idle', seed = '1'] = process.argv.slice(2)
const HOOK = 'debugHook'                  // the global the game exposes: { state, TUNING }
const RUN_MS = 180_000, TICK_MS = 100     // 3 min per run, 10 decisions a second
const shots = [5, 30, 60, 120]            // seconds

// A bot gets the state and returns the keys to hold this tick.
const bots = {
  idle: () => [],
  random: () => ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].filter(() => Math.random() < 0.3),
  greedy: (s) => [],                      // toward the nearest pickup, away from the nearest threat
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })   // the game's logical resolution
page.on('pageerror', (e) => console.error('page error:', e.message))
await page.goto(`${url}?seed=${seed}`)
await page.waitForFunction((h) => window[h]?.state, HOOK)
await page.keyboard.press('Enter')        // whatever starts a run from the title

// Copy out only what you measure and what the bots need (plain data, no functions).
const read = () => page.evaluate((h) => {
  const s = window[h].state
  return { screen: s.screen, score: s.score, health: s.health, wave: s.wave }
}, HOOK)

const log = [], held = new Set(), t0 = Date.now()
while (Date.now() - t0 < RUN_MS) {
  const t = (Date.now() - t0) / 1000
  const s = await read()
  if (!log.length || t - log.at(-1).t >= 1) log.push({ t, ...s })
  if (shots.length && t >= shots[0]) await page.screenshot({ path: `${botName}-${seed}-${shots.shift()}s.png` })
  if (s.screen === 'gameover') { await page.screenshot({ path: `${botName}-${seed}-death.png` }); break }
  const want = new Set(bots[botName](s))
  for (const k of held) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k) }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k) }
  await page.waitForTimeout(TICK_MS)
}
console.log(JSON.stringify({ bot: botName, seed, end: log.at(-1), log }))
await browser.close()
```

Then add:
- **Bots of 2–3 skill levels.** Read the state through the debug hook each tick and choose inputs: *idle* (presses nothing, finds the floor of difficulty), *random* (mashes and wanders), *greedy* (moves toward pickups and away from the nearest threat, with a reaction delay of 150–300 ms). Keep each bot to a few dozen lines.
- **Seeds:** run each bot on 5–10 seeds (`?seed=n`) if the game is seeded; otherwise run more times.
- **Fast-forward:** if the game exposes it, raise a time-scale in `TUNING` to run faster; otherwise just run in real time with a timeout (e.g. 3 min per run).
- **Logging:** every second record time, the current screen, score, health, level or wave, entity counts, and fps (from `requestAnimationFrame` timing). On game over record the cause if the state exposes it.
- **Screenshots** at 5 s, 30 s, 60 s, 2 min, and at each death.
- **Phone games:** run the same bots in a phone viewport too (`viewport: { width: 390, height: 844 }` or `844×390`, `deviceScaleFactor: 3, hasTouch: true, isMobile: true`), driving the on-screen touch controls with `page.touchscreen.tap()` and pointer sequences in the thumb zones (or keep the keyboard input and only check the picture). Screenshots then show what a thumb-covered screen looks like: overlay two 320 px thumb zones when you read them.

Keep it under the session's limits: a handful of runs per bot is enough to see a trend.

## 3. Read the results
Look at every screenshot (you can read PNGs) and the numbers:

| Signal | Means | Usual fix |
|---|---|---|
| idle bot survives a long time | no pressure, nothing forces the verb | earlier first threat, a timer |
| random bot does about as well as greedy | skill doesn't matter | reward precision: combos, risk/reward pickups |
| all bots die at the same spot | a spike | smooth that step in the curve |
| greedy bot never dies | too easy at the top end | steeper late ramp, a new threat type |
| nothing new on screen between two screenshots 60 s apart | boring stretch | add content there (level-design) |
| fps below 55 anywhere | performance | cap entities or particles (performance-pass) |
| screenshots hard to read | readability | game-ui |
| phone shots: the threat appears under a thumb zone, or text under 32 px | phone layout | touch-controls, game-ui |

## 4. Report and propose
Write a short report (in chat, and a *Playtest* section with the date in DESIGN.md): the questions, a small table of results per bot, the screenshots that matter, and **3–5 proposals**, each as *problem → change (exact `TUNING` key and new value, or a content change) → expected effect*. Ask the user (with a question tool if you have one, letting them pick several) which to apply, the biggest fun problem first, marked "(Recommended)". Apply the chosen ones, re-run the same playtest to confirm the numbers moved the right way, then run the project's checks and finish the change the way its rules say.

Remind the user that bots measure balance, not fun: suggest 2–3 specific things to feel for in their own next session.
