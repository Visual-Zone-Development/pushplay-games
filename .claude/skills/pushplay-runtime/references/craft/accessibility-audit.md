# accessibility-audit in a PushPlay game

The general `accessibility-audit` skill has the audit checklist and the list of options (colourblind palette, remapping, hold to toggle, one-handed and touch options, assists, visual cues for sound). This page gives the PushPlay side: how to build them with the runtime files. AGENTS.md *Settings*, *Input hints* and *Screens and scaling* are the rules. Never edit the runtime files: everything here lives in `game.js` and as `extra` items in `createSettingsScreen`.

## Input

- **Remapping:** keep a game-level action map in `game.js`, e.g. `const ACTIONS = { jump: 'a', dash: 'x', shoot: 'rt' }`, and read gameplay through it (`input.pressed(ACTIONS.jump)`).
- Offer one `choice` item per action in Settings, listing the free buttons (`a`, `b`, `x`, `y`, `lb`, `rb`, `lt`, `rt`). Never offer `menu` or `select` combinations, F10 or chords.
- Build prompts from the map, `input.label(ACTIONS.jump)`, so they follow the remap. Controls row of the audit: every action has a prompt from `input.label`.
- Keyboard aliases go through `input.extendKeys`.

## Settings

Every fix is a Settings `extra` item saved by `settings.js`: `createSettingsScreen({ settings, audio, extra })`, with the items in `menu.js` value-item form.

- **Colourblind palette:** a `choice` item (*Default / Deuteranopia / Protanopia / Tritanopia / High contrast*) that swaps the palette object in `game.js`. Add permanent shape or pattern differences as well; they help everyone.
- **Hold to toggle:** a `toggle` item that turns hold actions (charge, aim, sprint) into press-on / press-off.
- **Assists:** game speed (70–100%), extra health, aim assist strength, auto-fire, skip a level after N failures, invincibility for a story or kids mode, as `range` / `toggle` / `choice` items.
- **Text:** scale every size by `settings.data.textScale`. Raise contrast with a panel behind HUD text, and wrap long lines at large `textScale`.
- **Motion:** when `settings.data.reducedShake` is on, remove shake, full-screen flashes and strobing (nothing may flash more than 3 times a second).
- Every new Settings item must work with controller, keyboard, mouse and touch, save, and survive a restart of the game.
- Tell the user which options exist and where (Settings, from the title or pause).

## Touch

For phone games:

- A *Left-handed* toggle that mirrors the `touch.js` stick and buttons.
- A *One-thumb* scheme where it fits the game: auto-run or auto-fire plus a single tap or swipe.
- A *Button size* choice (normal / large) for the on-screen controls.
- No gesture that needs two fingers at once, unless the design is two-thumb.
- Every tap target is ≥ 56 px (on-screen buttons ≥ 64 px) and inside `fit.safe` (see [phone.md](../phone.md)).

## Screen and scaling

- Text is ≥ 24 px at 1280×800 (≥ 32 px in a phone space), with contrast ≥ 4.5:1 and nothing clipped at the largest text size.
- For a phone game, test the largest text size and button size at 390×844 / 844×390 with touch only: nothing overlaps the thumb zones or the safe areas.

## Debug hooks and the check

- Capture the screenshots for the audit with `npm run check` and a repro script (see [debugging.md](../debugging.md)).
- For the colour row, also view them in greyscale, e.g. render the canvas with `ctx.filter = 'grayscale(1)'` in a debug mode.
- Re-run the checklist after the fixes: every row passes or is n/a with a reason. Then tick the *Accessibility* items in DESIGN.md's Definition of done.
