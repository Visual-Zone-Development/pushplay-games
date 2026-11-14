# Definition of done

What separates a complete game from a toy. Copy the items that apply into the game's `DESIGN.md` under **Definition of done**, tailored to the game, and tick them off before calling it finished. Audit an existing game against this list too. Missing items here are usually the biggest, cheapest wins.

The project's own rules (its `AGENTS.md` or platform guide) decide the APIs, the screen size and the checks; where they ask for more than this list, they win.

## Play

- [ ] **Onboarding by doing.** The first 30 seconds teach the core verb through play, using in-world prompts ("<button> to jump", the button named by the game's input-prompt helper) that disappear once used. No walls of text, no separate tutorial screen required.
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

- [ ] **SFX for every action**, generated in code or from bundled files, through the game's audio layer.
- [ ] **Music**: a simple generated loop or a bundled track that fits the mood, on its own music bus.
- [ ] **Audio unlock**: the audio context starts on the first input and mutes on pause; nothing in the game assumes sound is running before the first key, click, tap or button press (browsers block it).

## Screens and flow

- [ ] **Title screen** with the name, a menu that starts the game, and the best score. No strip of button prompts along the bottom of this or any other screen. If gameplay needs a controller or keyboard, the title says so.
- [ ] **Pause** on its own button (Start, Esc, and an on-screen pause button for mouse and touch), with **Resume, Restart, Settings, Quit to title**. The game is fully frozen while paused.
- [ ] **Auto-pause** when the window loses focus, the page is hidden or every controller is gone: it lands on the pause screen and saves. Never auto-resume.
- [ ] **Every menu works with every input**: controller, keyboard, mouse and touch (move, choose, back, hover, click, tap; left/right for values). Back and pause are different buttons and are never swapped.
- [ ] **Game over / results** screen that's satisfying to look at (tally animation, stats), with retry in one press.
- [ ] **Settings**, reachable from title and pause: master / music / SFX volume, reduced shake / flash, text size, plus difficulty or other game items. Saved.
- [ ] **Saves**: best score, unlocks and (for longer games) progress, in the game's save data. Saved on every change that matters and on pause; versioned, with a migration when the shape changes.
- [ ] **Cursor** hidden only during gameplay in mouse mode, visible in every menu.

## Accessibility

- [ ] **Colorblind-safe**: don't rely on hue alone. Pair color with shape, icon or pattern.
- [ ] **No required button mashing** or long holds without an alternative.
- [ ] **Reduced shake / flash** honoured: when the game's reduced shake / flash setting is on, no screen shake, white flashes or strobing.
- [ ] **Text ≥ 24px** on a handheld-size screen (≥ 32px in a phone layout), high contrast, scaled by the game's text-size setting.
- [ ] **Prompts never hard-coded**: every button name comes from the game's input-prompt helper and switches when the player changes device.

## Scaling and inputs

- [ ] **One logical resolution**, scaled to any window by the game's scaling layer: letterbox in the game's colour, DPR capped at 2, integer scaling for pixel art. Looks right at the target device's resolution, at DPR 2, in a window of another shape and in small resizable windows.
- [ ] **Each input alone**, checked by hand: controller, keyboard only, mouse only, touch (DevTools device mode). Gameplay works with every input the game claims to support.
- [ ] **Local multiplayer** (if any) joins by press, one controller per player.
- [ ] **Phone games** (see [phone-layout.md](../../touch-controls/references/phone-layout.md)): laid out for portrait or landscape, text ≥ 32px, HUD and tap targets inside the safe area and out of the thumb zones, on-screen controls hidden when a controller is in use, a hidden page pauses and saves, and the game still plays with a controller and a keyboard. Online games show "Reconnecting…" and "Connection lost" when the connection drops.

## Under the hood

- [ ] **`TUNING` object** at the top of the game's code holds every gameplay number (speeds, timings, spawn rates, ramp). Later changes are then one-line edits.
- [ ] **Delta-time movement**, clamped (`dt = Math.min(1/20, …)`), so it plays the same at 60, 90 or 120 Hz.
- [ ] **Debug overlay** behind `?debug`, and a debug hook that exposes the game's state and `TUNING` for tests and playtests.
- [ ] **Steady 60fps** on the target device, DPR 2 included: no per-frame allocations in hot loops, capped particles.
- [ ] **Nothing shipped but the game**: no tools, mockups, scripts or notes in the build.
- [ ] **The project's checks pass**, and a screenshot of the build shows real gameplay or a real title screen.
