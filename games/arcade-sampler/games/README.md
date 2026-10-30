# A game in the sampler

Each file here is one complete little game. The hub (`../game.js`) owns everything around it:
title, the cabinet hall, the ready countdown, pause (Start / Esc / P / the on-screen button,
always in the top-right corner), results, medals, saves and settings. A game only plays.

```js
export default {
  id: 'hop-garden',            // kebab-case, unique
  name: 'Hop Garden',
  blurb: 'Jump, grab seeds, reach the flower',   // one line on its cabinet
  scoreLabel: 'points',        // under the score on the results screen
  style: { bg: '#2a7a5b', accent: '#ffd23f' },   // the cabinet's colours
  medals: [300, 600, 900],     // bronze, silver, gold (higher score is better)
  music: { bpm: 120, root: 52, chords: [0, 5, 7, 5], lead: [0, 2, 4, 2, 5, 4, 2, null], wave: 'square', gain: 0.04 },
  TUNING: { ... },             // every number the game uses (window.__game.TUNING[id])
  howTo: (input) => `${input.stickLabel()} to run · ${input.label('a')} to jump`,  // ready screen
  icon(ctx, x, y, size, t) {}, // a little picture of the game for its cabinet (centred on x, y)
  cursor: false,               // true if the game wants the mouse cursor visible while playing
  create(env) {                // a fresh run (also on Restart / Play again)
    return {
      score: 0,                // the hub reads this
      done: false,             // set true when the round is over
      update(dt) {},           // only called while playing (never while paused or counting down)
      draw(ctx) {},            // the whole 1280×800 screen, HUD included
      stats: () => [['Seeds', 12], ['Time', '0:48']],   // up to 3, shown on the results screen
      prompts: (input) => [['a', 'Jump']]               // the legend along the bottom (the hub adds Pause)
    }
  }
}
```

`env` is `{ input, audio, music, settings, font(weight, px, family), store, saveNow(), TUNING }`:
- `input`: the kit's input (`input.x/y`, `pressed('a')`, `pointer`, `pads[i]` for local players, `label()`).
- `audio.tone()` / `audio.noise()` for sound effects (they follow the Settings sliders).
- `settings.data.reducedShake` (skip shake and flashes) and `textScale` (font() applies it).
- `store`: this game's own saved object (e.g. a best lap); call `saveNow()` after changing it.
- Helpers in `../common.js`: `createFx(settings)` (particles and shake that honour reduced shake), `label()`, `clamp`, `rand`, `approach`.

Rules (from AGENTS.md):
- Logical space is 1280×800. Keep text ≥ 24 px and HUD ≥ 32 px from the edges, and keep the
  **top-right 130×100** clear (the pause button) and the bottom 50 px calm (the prompt legend).
- Every game plays with a controller, a keyboard, a mouse and touch. Never write button names: use
  `input.label('a')`, `input.stickLabel()`. `b` is free for gameplay; `menu` is the hub's.
- Fonts: `font(400, 32, 'Lilita One')`, `'Rubik'` (700, 900), `'Press Start 2P'`, `'Bungee'`, `'EB Garamond'` (600).
- Everything is drawn in code, in the game's own style. No image files, no network.
- Cap particles; no `shadowBlur` in the frame loop (bake glows once into a canvas instead).
