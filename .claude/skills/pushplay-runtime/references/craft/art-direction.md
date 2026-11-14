# art-direction in a PushPlay game

The general `art-direction` skill covers the look of the whole screen: materials, palette, textured backgrounds, UI that looks like part of the world, typography and a finishing pass. This page gives the PushPlay side: which kit calls the restyled UI keeps, the sizes to render at, fonts, and the library art. AGENTS.md *Menus*, *Input hints*, *Settings*, *Screens and scaling* and *Art* are the rules.

## Input

- Prompts still come from `input.label()` / `drawPrompts`, never literal key names. Draw them on the game's material (an `inkBlot()` behind a button prompt, say).

## Menus

- Keep `menu.js` for behaviour and draw its items yourself from `menu.items` and `menu.selected`, with the selection in the hero colour.
- Panels become `paperCard()` (or the game's equivalent material) and headers sit on a `brush()` stroke.

## Settings

- Every text size stays ≥ 24 px × `settings.data.textScale`. Use small caps with letter spacing (`ctx.letterSpacing`) for labels and italics for flavour lines.

## Screen and scaling

- Render the same screens as the reference and as your *before* shots, at 1280×800 and at DPR 2.
- **Pixel art look:** draw at a low internal resolution (e.g. 320×200 or 427×267) on an offscreen canvas, then scale up by an integer to 1280×800 with `ctx.imageSmoothingEnabled = false`. Snap positions to whole pixels. Sprites can be defined as string arrays in code (`'..XX..'`) and baked into canvases once at startup.
- **Low-poly 3D look** (faceted, flat-shaded, colourful): needs a `--vite` game and three.js; see [3d.md](../3d.md).

## Debug hooks and the check

- Capture the *before* shots at play size: title, gameplay after ~20 s, pause, game over and any custom screen. Use the `model-asset` skill's `scripts/shot.mjs`, or the `npm run check` screenshot:

  ```sh
  node <model-asset skill folder>/scripts/shot.mjs <game folder> <scratch>/before \
    "index.html|title.png" "index.html|play.png|keys=Enter|wait=20000"
  ```

  In a PushPlay repo the game folder is `.` (one game at the root) or `games/<id>` (a workshop); the script finds the kit's Playwright by itself. Renders go to a scratch folder, never the repo.
- After the pass, measure frame time on gameplay with the overlay on. If it drops below 60 fps at DPR 2, use the `performance-pass` skill.
- Look at the check's screenshot before finishing, and update STYLE.md's Scene look.

## Art and tools

- **Fonts in art.** The bundled art fonts are `Chakra Petch` (600, 700), `Rubik` (400, 700, 900), `Bungee`, `Lilita One` and `Press Start 2P`. The cover art can only use these, so pick the closest one for the cover title, or draw the cover with `art/cover.html`, which can load the game's own font from its folder.
- **The same fonts in the game.** They are available when the art is rendered, but not automatically in the game. Copy the font's `.woff2` from `.github/pushplay/node_modules/@fontsource/<font>/files/` (e.g. `bungee-latin-400-normal.woff2`) into `assets/fonts/` and load it with `@font-face` or `new FontFace()`. They are OFL licensed, so note it in `assets/CREDITS.md`. Wait for `document.fonts.ready` before the first text draw, or text flashes in a fallback font.
- **Library art.** Match the cover and hero to the new look with the `cover-art` skill; an `art/cover.html` can reuse `texture.js`.
- **One art module.** Keep one art module that the game, `art/cover.html`, `art/hero.html` and an `art/gallery.html` contact sheet all import, so the library art can't drift from the game. (Battle Drones' HUD icons are renders of its models for the same reason.) `npm run art:shots` renders them all, plus the cover at tile size.
- **Pixel art cover:** an `art/cover.html` that draws with the game's own sprite code keeps it pixel-perfect. Otherwise use SVG `<rect>` grids with `shape-rendering="crispEdges"`.
- **Low-poly 3D cover:** `art/cover.html` can render the actual scene with three.js, or draw the key model as flat SVG polygons in the same colours.
- **Worked examples.** A preset sets the palette; what makes it look finished is the light and depth treatment. [Star Courier's `art.js`](https://github.com/Visual-Zone-Development/arcade-sampler/tree/main/games/star-courier/art.js) in Arcade Sampler is a worked example of a lit vector look, and Arcade Sampler's other games show flat bold, paper and pastel, parchment, pixel art and neon side by side.
- **Painted surfaces with the user's own image key (optional).** If `OPENAI_API_KEY`, `GEMINI_API_KEY` or `REPLICATE_API_TOKEN` is set (environment or `.env`), painted backgrounds, terrain textures, key art and detailed props can also be generated:
  1. Write `art/prompts.json` with the Scene look as its `style`.
  2. Run `npm run art -- --dry` and tell the user the cost. Wait for them to agree.
  3. Generate 2–3 with `--approve <$>` and look at the contact sheet.
  4. Tell them the cost of the rest and ask again before generating it (see [generated-art.md](../generated-art.md)).

  Bake them like any surface and keep the toolkit versions as fallbacks. With no key, skip this: the toolkit alone reaches the target quality.
