# pixel-art in a PushPlay game

The general `pixel-art` skill covers pixel characters, tiles, props and UI, with a toolkit that renders and bakes them. This page gives the PushPlay side: the resolution maths for the kit's screen, the `fit.js` settings, and where the bake page goes. AGENTS.md *Screens and scaling*, *Input hints*, *Menus* and *Settings* are the rules.

## Input

- Prompts still come from `input.label()` / `drawPrompts`.

## Menus

- Focus must be visible without hover: controller and keyboard players have none. The focused button changes colour *and* gets a marker. Take the focus from `menu.js`:

  ```js
  button(g, 20, 20, 116, 18, menu.selected === 0 ? 'focus' : 'idle')
  ```

## Settings

- Skip hit flashes (white for 2 frames) when `settings.data.reducedShake` is on.

## Screen and scaling

- Pixel art uses `fitCanvas` with `integer: true`, and `ctx.imageSmoothingEnabled = false`.
- **Native resolution:** 1280×800 ÷ 4 = **320×200** (chunky, readable on a handheld), or ÷ 5 = 256×160 (chunkier). Not ÷ 3: 426.67 isn't whole. Write it in the pixel spec as "Game resolution: 320×200 native, ×4 to 1280×800 (fitCanvas integer: true)".
- Draw the world on a 320×200 canvas and scale it ×4, or draw sprites directly at ×4. Never mix pixel scales on screen: a ×3 sprite next to ×4 tiles looks wrong at once.
- **Text at full resolution:** draw text on the 1280×800 canvas, after scaling the native layer, with the pixel font at a whole multiple of its design size, aligned to the ×4 grid. Text ≥ 24 px.

## Debug hooks and the check

- Look at the check's screenshot before finishing, and update STYLE.md (spec, ramps, catalogue).

## Art and tools

- **Pixel font:** the skill bundles **Pixelify Sans** (400, 700; OFL) in its `toolkit/fonts/`. Load it like any `FontFace` and credit it in `assets/CREDITS.md`.
- **Bake ahead, ship PNGs.** A 160-px frame takes ~0.3 s, so a full sheet takes minutes. Put a bake page in the game's `tools/` folder (the build skips it) that sets `window.__bake = [{ name, canvas, meta }]` and `window.__bakeDone = true`, then run the skill's `bake.mjs` from the game folder:

  ```sh
  node <pixel-art skill folder>/bake.mjs . tools/bake.html assets/sprites
  ```

  The game then loads the baked PNGs from `assets/sprites`.
- **Bake, never render per frame** (sheets, tile sets, the static map, UI panels); per frame only blit. Measured on a desktop: 48 px × 8 directions × 18 frames ≈ 0.3 s; a 64-px hero with all 47 frames ≈ 0.8 s. Expect about twice that on a Deck.
- If the game bakes at startup, draw the title first, then bake a few frames per tick, or bake each animation the first time it's needed, so nothing freezes.
- **PixelLab.** PixelLab has an MCP server for coding agents; it needs a PixelLab subscription. If the user connects it, generate with it and apply the skill's spec and checklist to its output so it matches the rest of the game: same canvas size, view, outline, shading and palette.
