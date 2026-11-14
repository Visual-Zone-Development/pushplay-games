# game-ui in a PushPlay game

The general `game-ui` skill covers the audit questions, HUD rules, onboarding by doing, and menu and results-screen design. This page gives the PushPlay side: how to do it with the runtime files. AGENTS.md *Menus*, *Screens and scaling*, *Input hints* and *Settings* are the rules.

## Input

- Every prompt comes from `input.label()` / `drawPrompts`, never a literal "A" or "Space".
- Teach each action the first time it's needed, with an in-world prompt (`` `${input.label('a')} to jump` ``) that disappears once the player has done it. Build prompt strings every frame, so they switch when the player changes device.
- No prompt row along the bottom (AGENTS.md *Input hints*): a control is taught once, next to the thing it acts on, and never on touch or mouse.
- Everything that isn't one of the resources the player acts on goes on the pause screen or the `select` (Tab) overlay.
- Keep the top-right or top-left corner clear for the ≥ 56×56 on-screen pause button the starter draws.
- A custom grid (level select, upgrade tree) uses `input.navX` / `input.navY`, A to choose, B to go back, and `input.pointer` taps on each cell, with a visible highlight.

## Menus

- Every menu is `createMenu()` from `menu.js`: title, pause, settings, game over, level select, shop. That gives controller, keyboard, mouse and touch for free.
- The pause menu stays exactly **Resume, Restart, Settings, Quit to title**.
- Menus that end at the bottom leave room for the launcher's extra "Quit to library" row.
- Use `menu.selected` and `menu.items` for custom drawing: a panel shape, a highlight bar, a small easing on selection change.

## Settings

- Every piece of text is ≥ 24 px × `settings.data.textScale`, and all sizes scale with `textScale`. Test at the largest setting: nothing clipped, nothing overlapping.

## Saves

- Track in `save.data` which first-time tutorial prompts the player has completed, so returning players don't see them.

## Touch

- In a phone layout the bottom third (portrait) or the lower two-thirds of each side (landscape) belong to the thumbs and the `touch.js` controls: no HUD there.

## Screen and scaling

- Design screens to read on a 7–8" handheld (the Deck, the Legion Go) at 1280×800.
- In a phone game (manifest `phone`): text ≥ 32 px, and margins measured from `fit.safe`, not the canvas edge.
- Phone layouts ([phone.md](../phone.md)): the HUD is a read-only band at the top, inside `fit.safe`. Portrait menus start at about y = 560 so the items sit in reach; items are ≥ 56 px tall and 12 px apart.

## Debug hooks and the check

- For the audit, run `npm run check` and view the screenshot; capture more states (title, gameplay at 60 s, pause, game over) with a repro script (see [debugging.md](../debugging.md)).
- Run the verification matrix from AGENTS.md for every screen you touched: controller, keyboard only, mouse only, touch (DevTools device mode), 1920×1080 and DPR 2. For a phone game add 390×844 / 844×390 at DPR 3 with touch only; the check's phone pass measures text under 32 px.
- Tick the *Screens and flow* items in DESIGN.md.
