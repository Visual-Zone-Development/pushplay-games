# canvas2d-assets in a PushPlay game

The general `canvas2d-assets` skill is a toolkit for drawing and animating 2D assets on canvas, with an asset gallery page for renders. This page gives the PushPlay side: where the toolkit goes, how the gallery stays out of the build, and crispness under `fitCanvas`. AGENTS.md *Screens and scaling*, *Input hints*, *Performance* and *Tech* are the rules.

## Input

- UI and HUD use the same style object (outline, palette) as the game art, with text ≥ 24 px. Button icons come from `input.label` / `drawPrompts`. Animate UI in 150–300 ms.

## Screen and scaling

- The logical space is 1280×800 and `fitCanvas` scales it, with DPR up to 2. Paths and text stay crisp automatically; bitmaps don't. Bake procedural frames at `scale: 2`, supply 2× sprite sheets, or use pixel art with `integer: true`.
- **Pixel art:** draw with `pixels()` at native size (e.g. 16×16, 32×32), add `pixelOutline()`, and blit at whole-number scales with smoothing off. Call `fitCanvas(..., { integer: true })` and snap positions to whole pixels. Use few, held frames (4–8 per cycle) and a fixed palette from STYLE.md.
- Avoid `shadowBlur` and per-frame `filter`, cap particles, and cache static backgrounds in an offscreen canvas.

## Art and tools

- Copy what the game needs from the skill's `toolkit/` into the game folder: next to `game.js`, or into `src/` in a `--vite` game. If the game already has its own versions, extend those instead of adding a second system.
- The asset gallery (`gallery.html`, `gallery.js`) takes these parameters:

  | Parameter | Shows |
  |---|---|
  | `?asset=<id>&scales=1,3` | one asset at the given scales |
  | `&anim=<a>&frames=<n>` | a cycle strip |
  | `&facings=<n>` | directional / top-down facings |
  | `&compare=<id2>,<id3>` | assets side by side |
  | `&hitbox=1` | the hitbox |
  | `&bg=game\|light\|dark\|checker\|#hex` | the background |
  | `&t=`, `&team=` | a time, a team colour |
  | `?list` | every asset |

- The gallery sets `document.title = 'ready'` for the `model-asset` skill's `scripts/shot.mjs` (see [model-asset.md](model-asset.md)).
- The gallery is not part of the build: in a plain (non-Vite) game, list it in `.pushplayignore`.
