# threejs-models in a PushPlay game

The general `threejs-models` skill covers 3D models built in three.js code, with a toolkit and a 3D guide. This page gives the PushPlay side of that guide: setup, the render surface, the HUD canvas and the budget rows that name the kit. AGENTS.md *Screens and scaling*, *Controls*, *Menus*, *Performance* and *Tech* are the rules, and [3d.md](../3d.md) is the full PushPlay 3D guide.

## Input

- The right stick is `input.aimX` / `input.aimY`. Keyboard players get the same with the arrows or `input.pointer`: a mouse-look that also works from the stick.
- Never require the mouse, and never grab the pointer lock without a stick alternative.
- Call `input.attach` on the top-most canvas (the HUD canvas), so clicks and taps reach the menus.
- HUD prompts come from `input.label` / `drawPrompts`.

## Menus

- Pause, settings and all menus follow the same rules as 2D games: `menu.js`, `settings.js`, `input.onPause`, and no quit of your own.

## Settings

- No post-processing, or one cheap pass: no SSAO or SSR, and no bloom by default. If you add bloom or shadows, make them a Settings toggle in `extra` that defaults off.

## Audio

- Add audio through `audio.js` like any other game. 3D is not a reason to ship silent.

## Screen and scaling

- Render to a fixed **1280×800** surface at pixel ratio ≤ 1 and let `fit.js` scale and letterbox it, the same as the 2D starter. The 3D canvas is never rendered at DPR 2: a Legion Go at 2560×1600 would be four times the pixels for no readable gain.

  ```js
  import { fitCanvas } from './fit.js'
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1))
  renderer.setSize(1280, 800, false) // false = don't touch the CSS size; fitCanvas owns it
  fitCanvas(renderer.domElement, { w: 1280, h: 800, maxDpr: 1, letterbox: '#000' })
  ```

- Keep `camera.aspect = 1280 / 800` and don't add your own `resize` handler.
- Use the game's background colour for `letterbox`, so bars disappear on 16:9 windows.
- **HUD:** draw the HUD and every menu on a 2D canvas overlaid on the WebGL canvas, positioned in the same 1280×800 space and sized with its own `fitCanvas(hud, { w: 1280, h: 800, maxDpr: 2 })`, so text stays crisp. This is simpler than 3D text. The usual rules apply: text ≥ 24 px, kept away from the outer 32 px.
- **Budget:** the Steam Deck's and Legion Go's GPUs are roughly low-end laptop GPUs, and the Legion Go drives a 2560×1600 panel. Stay well under the budget numbers in [3d.md](../3d.md) for a steady 60 fps.

## Debug hooks and the check

- Draw a loading screen while models load. The check takes its screenshot at 3 seconds and presses Start soon after, so the title and pause screens must not wait on models.

## Art and tools

- **Setup:**

  ```sh
  npm run new-game <id> --vite
  npm install three
  ```

  Commit the updated `package-lock.json`. Import from `three`, and from `three/examples/jsm/...` for loaders and controls. Vite bundles everything, so there are no CDN links.
- Copy what the game needs from the skill's `toolkit/` into the game's `src/`.
- Put models in `public/assets/models/`, so Vite serves them as they are. See [assets.md](../assets.md) for size limits and licences.
- **Cover:** `art/cover.html` can render the actual three.js scene (import the built bundle or a small dedicated script), or you can draw the key model as flat SVG polygons in the same palette.
