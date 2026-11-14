# dialogue in a PushPlay game

The general `dialogue` skill has the writing craft, the script format and a neutral toolkit (`toolkit/dialogue-script.js`, `toolkit/dialogue.js`, `lint.mjs`) that takes an input adapter, an optional `prompts` callback and a tone function. PushPlay's runtime objects fit that contract as they are, so wiring is passing them in. AGENTS.md *Controls*, *Input hints*, *Screens and scaling* and *Saves* are the rules.

```js
import { createRunner } from './dialogue-script.js'
import { createDialogueBox, voiceBlip } from './dialogue.js'
import { drawPrompts } from './prompts.js'
import smith from './dialogue/smith.js'

const talk = createDialogueBox({
  input,                 // the kit's input: pressed('a' | 'b' | 'select'), navY, pointer, mode
  settings,              // createSettings(...): the box reads settings.data.textScale / textSpeed / reducedShake
  prompts: drawPrompts,  // the kit's drawPrompts, passed as the toolkit's `prompts` option
  avoid: [PAUSE_BUTTON],
  blip: voiceBlip(audio, { Brom: { freq: 130 }, Mira: { freq: 300, type: 'triangle' } }), // calls audio.tone()
  portrait: (ctx, who, mood, x, y, size, talking) => drawPortrait(who, mood, x, y, size, talking),
  style: { /* panel, font, colours, nameColors */ },
  // width / height default to 1280 × 800; a phone game passes its space (720, 1280 or 1280, 720)
})
talk.open(createRunner(smith, { vars: save.data.dialogue, on: { give: giveItem } }).start('smith'))
// each frame while state.screen === 'playing' (not while paused):
if (talk.active) { if (talk.update(dt) === 'done') save.save() } else updateGameplay(dt)
// … draw the world …
talk.draw(ctx)
```

## Input

- Pass the kit's `input` as it is. The box reads `input.pressed('a' | 'b' | 'select')`, `input.navY`, `input.pointer` (`x, y, pressed`) and `input.mode`.
- **The prompts option is `prompts`.** The general toolkit takes `prompts`, a callback that draws button hints; in a PushPlay game pass the kit's `drawPrompts` as `prompts: drawPrompts`. The option used to be called `drawPrompts`: a game that copied the older toolkit passes `drawPrompts` directly (`createDialogueBox({ input, drawPrompts, … })`). When you update such a game's copy of the toolkit, change that call to `prompts: drawPrompts`, or the box draws no hints.
- The controls are built in:

  | Action | Control |
  |---|---|
  | Finish the line, then advance | A, Space, Enter, click or tap anywhere |
  | Fast-forward to the next choice | B |
  | Open the log | Select / View (Tab) |
  | Pick a choice | d-pad or stick and A, or a tap on the option (hover highlights it for the mouse) |
  | Skip, for mouse and touch | an on-screen Skip button |

- Pass the game's pause button in `avoid`, so tapping it doesn't advance the text.
- While `talk.active`, update the box instead of gameplay. `state.screen` stays `'playing'` and `menu` still pauses: don't call `talk.update` while paused.
- The box's own prompt hints sit beside the box and the choices, not in a row along the bottom edge, and aren't drawn in touch mode.

## Settings

- The box honours `textScale` and `reducedShake`: it reads them from `settings.data`.
- Add a *Text speed* range (0.5–2, saved as `settings.data.textSpeed`) to the Settings `extra` items:

  ```js
  { id: 'textSpeed', label: 'Text speed', type: 'range', min: 0.5, max: 2, step: 0.25,
    value: settings.data.textSpeed ?? 1, onChange: (v) => { settings.data.textSpeed = v } }
  ```

## Saves

- Create the runner with `createRunner(script, { vars: save.data.dialogue, on: { give, heal, … }, strings })`, then `.start('smith')`.
- Keep `vars` in `save.data` and call `save.save()` when a conversation ends, so choices persist.

## Audio

- `voiceBlip(audio, { Brom: { freq: 130 }, Mira: { freq: 300, type: 'triangle' } })`: passing the kit's `audio` object works. The blips go through `audio.tone()` on the `sfx` bus.

## Screen and scaling

- `width` / `height` default to 1280 × 800. A phone game passes its space (720, 1280 or 1280, 720).
- Handheld budget: a line fits in the box, about 140 characters, 2–3 lines at 30 px on the 1280×800 screen.
- Read every conversation on the 1280×800 screen, at the largest Text size too: nothing clipped, nothing over three lines.

## Art and tools

- Copy `toolkit/dialogue-script.js` and `toolkit/dialogue.js` from the `dialogue` skill into the game: next to `game.js`, or into `src/`.
- Put scripts in `dialogue/*.js` as `` export default `…` ``. They load offline in plain and Vite games alike.
- Lint the scripts with the `dialogue` skill's `lint.mjs` before running the check:

  ```sh
  node <dialogue skill folder>/lint.mjs dialogue/*.js --entry <nodes the game starts>
  ```
