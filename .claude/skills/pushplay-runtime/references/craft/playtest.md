# playtest in a PushPlay game

The general `playtest` skill covers driving the game headlessly with bots, measuring runs, and turning that into a balance report. This page gives the PushPlay side: what the script starts from, what it reads, and where findings go. AGENTS.md *Flow* is the rule (`state.screen` and `window.__game`).

## Touch

- For a phone game (manifest `phone`), run the same bots in a phone viewport too: `viewport: { width: 390, height: 844 }` or 844×390, with `deviceScaleFactor: 3, hasTouch: true, isMobile: true`.
- Drive the `touch.js` controls with `page.touchscreen.tap()` and pointer sequences in the thumb zones, or keep the virtual gamepad and only check the picture.
- The screenshots then show what a thumb-covered screen looks like: overlay two 320 px thumb zones when you read them.

## Debug hooks and the check

- Start from the repro script in [debugging.md](../debugging.md): the build kit's Playwright, `npm run dev`, and a virtual gamepad on a timeline.
- Write bots of 2–3 skill levels. Each tick they read `window.__game.state` and choose inputs.
- Every second, log the time, `state.screen`, score, health, level or wave, entity counts, and fps (from `requestAnimationFrame` timing).
- Route the findings:

  | Finding | Kind | Where it goes |
  |---|---|---|
  | fps below 55 anywhere | performance | cap entities or particles (the `debug-game` skill) |
  | phone shots: the threat appears under a thumb zone, or text under 32 px | phone layout | the `mobile-port` skill, [game-ui.md](game-ui.md) |

- Apply the chosen changes with the `improve-game` skill's steps, then re-run the same playtest to confirm the numbers moved the right way.
