---
name: accessibility-audit
description: Audit and improve the accessibility of a game in games/ — colourblind-safe visuals, readable text and text size, reduced shake and flash, control remapping, hold and mash alternatives, one-handed play, difficulty and assist options, audio cues with visual equivalents — then fix what's missing. Use for "make it accessible", "colourblind mode", "remap buttons", "my kid can't beat it", "add an easy mode / assist mode", or before calling a game finished.
---

# Accessibility audit

Follow AGENTS.md (*Settings*, *Input hints*, *Screens and scaling*) and the *Accessibility* items in [complete-game.md](../../../docs/game-design/complete-game.md). Never edit the runtime files: everything here lives in `game.js` and as `extra` items in `createSettingsScreen`.

## 1. Audit
Go through the game with the checklist below and mark each row pass / fail / n/a. Capture screenshots with `npm run check <id>` and a repro script ([debugging.md](../../../docs/game-design/debugging.md)); for the colour row, also view them in greyscale (e.g. render the canvas with `ctx.filter = 'grayscale(1)'` in a debug mode).

| Area | Must be true |
|---|---|
| Colour | No information carried by hue alone: friend vs. foe, matching colours, danger zones also differ in **shape, icon, pattern or brightness**. Readable in greyscale |
| Text | ≥ 24 px at 1280×800, strong contrast (≥ 4.5:1 against what's behind it), scaled by `settings.data.textScale`, nothing clipped at the largest size |
| Motion | `settings.data.reducedShake` removes shake, full-screen flashes and strobing (nothing flashing more than 3 times a second) |
| Controls | No mashing, no long holds without a toggle option, no chords, no precise timing windows below ~100 ms without an assist; every action has a prompt from `input.label` |
| Remapping | Gameplay actions can be moved to other buttons (see below) |
| One-handed | Optional: can the game be played with the stick + one face button, or the d-pad + one button? |
| Difficulty | A way through for a less experienced player: a difficulty choice or assists |
| Audio | Every important sound cue has a visual equivalent (an off-screen enemy sound also shows an edge marker) |
| Time | No timer the player can't pause; reading text is never timed |
| Pause | Pause is always available and fully freezes the game |

## 2. Fixes, all as Settings `extra` items saved by `settings.js`
- **Colourblind palette:** a `choice` item (*Default / Deuteranopia / Protanopia / Tritanopia / High contrast*) that swaps the palette object in `game.js`; plus permanent shape or pattern differences, which help everyone.
- **Remapping:** keep a game-level action map in `game.js`, e.g. `const ACTIONS = { jump: 'a', dash: 'x', shoot: 'rt' }`, read gameplay through it (`input.pressed(ACTIONS.jump)`), and offer `choice` items per action listing free buttons (`a`, `b`, `x`, `y`, `lb`, `rb`, `lt`, `rt`). Never offer `menu` or `select` combinations, F10 or chords. Prompts then use `input.label(ACTIONS.jump)` so they follow the remap. Keyboard aliases go through `input.extendKeys`.
- **Hold to toggle:** a toggle item that turns hold actions (charge, aim, sprint) into press-on / press-off.
- **Assists:** game speed (70–100%), extra health, aim assist strength, auto-fire, skip a level after N failures, invincibility for a story or kids mode. Name them neutrally ("Assist"), never shaming ("Baby mode").
- **Visual cues for sound:** edge arrows or icons for important off-screen sounds.
- **Text:** raise contrast with a panel behind HUD text; wrap long lines at large `textScale`.

## 3. Verify and record
1. Re-run the checklist; every row passes or is n/a with a reason.
2. Every new Settings item works with controller, keyboard, mouse and touch, saves, and survives a restart of the game.
3. `npm run check <id>`, fix every ✗.
4. Bump `version`, tick the *Accessibility* items in DESIGN.md's Definition of done, add a Changelog line, commit (`<Name>: accessibility`) and push. Tell the user which options exist and where (Settings, from the title or pause).
