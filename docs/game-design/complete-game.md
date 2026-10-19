# Definition of done

What separates a complete game from a toy. Copy the items that apply into the game's `DESIGN.md` under **Definition of done**, tailored to the game, and tick them off before calling it finished. `improve-game` audits against this list too. Missing items here are usually the biggest, cheapest wins.

## Play

- [ ] **Onboarding by doing.** The first 30 seconds teach the core verb through play, using in-world prompts (`Press ${input.label('a')} to jump`) that disappear once used. No walls of text, no separate tutorial screen required.
- [ ] **Clear goal.** The player always knows what they're trying to do. One objective on screen.
- [ ] **An ending or a score to beat.** Either a win state (levels, a boss, a finale) or an endless mode with a score or time that's saved as a personal best.
- [ ] **Difficulty curve.** Early wins in the first minute, then a steady ramp. Something new (enemy type, hazard, mechanic, music layer) appears roughly every 30–60 seconds of play. No sudden spikes.
- [ ] **Fair failure.** Threats are telegraphed and readable at handheld size. When the player loses, it's clear why.
- [ ] **Retry hook.** After game over, play again in **one press**, in under a second. Show the score, the best, "new best!", and near-miss feedback ("2 away from your best").
- [ ] **Progression or variety.** At least one of: levels, unlocks, upgrades between runs, random runs (procedural layouts or seeds), a collection.

## Feel

- [ ] **Every action has feedback**, both visual and audio: movement, hits, pickups, damage, menu moves.
- [ ] **Juice aimed at the fun targets.** Hit-stop, screen shake, particles (capped, e.g. ≤ 300 alive), squash/stretch, easing. The biggest effects go on the biggest moments.
- [ ] **Rumble** on big impacts where `gamepad.vibrationActuator` exists (guard for `null`).

## Audio

- [ ] **SFX for every action**, generated with WebAudio or bundled files.
- [ ] **Music**: a simple generated loop or a bundled track that fits the mood.
- [ ] **Volume / mute** setting, saved in `localStorage`.

## Screens and flow

- [ ] **Title screen** with the name, a clear `Press ${input.label('a')} to start`, and the best score.
- [ ] **Pause** on Start, Esc/P, and an on-screen pause button for mouse and touch: resume, restart, quit to title. The game is fully frozen while paused.
- [ ] **Every menu works with every input**: controller, keyboard, mouse and touch, via `menu.js` (move, choose, back, hover, click, tap).
- [ ] **Game over / results** screen that's satisfying to look at (tally animation, stats).
- [ ] **Settings** reachable from title and pause: volume, plus difficulty or reduced shake where relevant. Navigable with the d-pad + A/B, the keyboard and the mouse.
- [ ] **Saves**: best score, unlocks, settings and (for longer games) progress in `localStorage`, under a versioned key (`<id>-save-v1`).

## Accessibility

- [ ] **Colorblind-safe**: don't rely on hue alone. Pair color with shape, icon or pattern.
- [ ] **No required button mashing** or long holds without an alternative.
- [ ] **Reduced shake / flash** option if the game shakes or flashes a lot.
- [ ] **Text ≥ 24px**, high contrast against the background.

## Under the hood

- [ ] **`TUNING` object** at the top of `game.js` holds every gameplay number (speeds, timings, spawn rates, ramp). Later changes are then one-line edits.
- [ ] **Delta-time movement**, clamped (`dt = Math.min(1/20, …)`), so it plays the same at 60, 90 or 120 Hz.
- [ ] **Debug overlay** behind `?debug`, plus `window.__game` hooks (see [`debugging.md`](debugging.md)).
- [ ] **Steady 60fps** on the Deck: no per-frame allocations in hot loops, capped particles.
- [ ] `npm run check` passes and the screenshot shows real gameplay or a real title screen.
