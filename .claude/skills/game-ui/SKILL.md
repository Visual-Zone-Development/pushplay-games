---
name: game-ui
description: Design the HUD, menus, onboarding and results screens of a game in games/ so they read on a 7–8" handheld, work with controller, keyboard, mouse and touch, and match the game's art style — health and score display, input prompts, tutorials taught by doing, game-over tallies, level-select and upgrade screens. Use for "the HUD is cluttered / hard to read", "players don't know what to do", "add a tutorial", "make the menus look better", "add an upgrade / shop / level-select screen".
---

# Game UI

Follow AGENTS.md (*Menus*, *Screens and scaling*, *Input hints*, *Settings*). Read the game's `DESIGN.md` for the palette, font and fun targets.

## 1. Audit what's on screen
Run `npm run check <id>` and view the screenshot; capture more states (title, gameplay at 60 s, pause, game over) with a repro script ([debugging.md](../../../docs/game-design/debugging.md)). For each screen ask:
- Can I tell in **3 seconds** what to do and how I'm doing?
- Is every piece of text ≥ 24 px (× `settings.data.textScale`) with strong contrast, and every important HUD element ≥ 32 px from the edges?
- Does every prompt come from `input.label()` / `drawPrompts`, never a literal "A" or "Space"?
- Is anything there that the player doesn't need right now?

## 2. HUD rules
- **One goal on screen.** Show only the resources the player acts on (health, score, timer, ammo). Everything else goes on the pause screen or `select` (Tab) overlay.
- **Corners:** score top-left, secondary info top-right, prompts bottom-centre; keep the top-right or top-left corner clear for the ≥ 56×56 on-screen pause button the starter draws.
- **Icons and bars over numbers** where possible (hearts, a health bar); numbers pop (scale 1.2 → 1 over 150 ms) when they change.
- **Diegetic hints:** a glow on the thing to interact with, an arrow to an off-screen objective.
- Colour is never the only signal: pair it with shape or icon (colourblind-safe).
- All sizes scale with `textScale`; test at the largest setting that nothing overlaps.

## 3. Onboarding by doing
- Teach each action the first time it's needed, with an in-world prompt (`` `${input.label('a')} to jump` ``) that disappears once the player has done it (track in `save.data` so returning players don't see it).
- Build prompt strings **every frame** so they switch when the player changes device.
- A safe first room or first wave where the verb can't fail.
- No text walls; one line, readable in 3 seconds.

## 4. Menus and extra screens
- Every menu is `createMenu()` from `menu.js` (title, pause, settings, game over, level select, shop): that gives controller, keyboard, mouse and touch for free. A custom grid (level select, upgrade tree) uses `input.navX` / `input.navY`, A to choose, B to go back, and `input.pointer` taps on each cell, with a visible highlight.
- Pause menu stays exactly **Resume, Restart, Settings, Quit to title**.
- **Game over / results:** score tally that counts up, the best, "new best!" and a near-miss line ("2 away from your best"), retry on one press.
- Style menus in the game's palette and font: a panel shape, a highlight bar, a small easing on selection change. Use `menu.selected` and `menu.items` for custom drawing.
- Show the cursor in every menu; hide it only during gameplay in mouse mode.

## 5. Verify
1. Verification matrix from AGENTS.md for every screen you touched: controller, keyboard only, mouse only, touch (DevTools device mode), 1920×1080 and DPR 2.
2. Text size at maximum: nothing clipped or overlapping.
3. `npm run check <id>`, view the screenshot, fix every ✗.
4. Bump `version`, update DESIGN.md (Changelog, tick *Screens and flow* items), commit (`<Name>: UI …`) and push.
