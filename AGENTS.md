# Making games in this repo

This repo is a collection of small games. Each folder in `games/` is one game. When you push, GitHub Actions builds every game that changed and publishes it, and the **PushPlay** launcher on the owner's Steam Deck picks it up automatically. Whatever you make here gets played **on a handheld, with a controller, on the couch**. Design for that.

## Workflow (follow it every time)

1. **New game:** `npm run new-game <game-id>` (add `--vite` if you need npm packages like three.js). The id is lowercase-with-dashes and becomes the folder name. This creates a working, controller-ready starter: `game.js`, `input.js`, `pushplay.json` and placeholder art.
2. **Build the game** in that folder. Only touch other games, `.github/` or root files if the user asked you to.
3. **Fill in `pushplay.json`:** a real `description`, `players`, and anything else that applies (see *Manifest*).
4. **Make the art:** replace `art/cover.svg` and `art/hero.svg` (see *Art*). This is required; the check fails on placeholder art.
5. **Run `npm run check <game-id>` and fix everything it reports.** It builds the game, plays it headlessly at Steam Deck resolution with a virtual gamepad, and renders the art to PNG.
6. **Look at the output images** it prints (`.github/pushplay/.work/out/<id>/__art/cover.png`, `hero.png`, `screenshot.png`). If you can view images, check that the art reads well at small size and that the screenshot shows the game, not an error or empty screen. Iterate until they look good.
7. **Commit and push** (one commit per game is fine). Pushing any branch publishes the build.

First time in a fresh checkout: `npm run setup` (installs dependencies and the headless browser).

If your environment can't install the browser (some cloud sandboxes block the download), still do every other step. Then push: GitHub Actions runs the same check, and the run's summary page lists any problems to fix.

## Game rules

**Controls: controller first.**
- Use the provided `input.js`: `input.update()` once per frame, then `input.x`, `input.y` (-1..1, left stick + d-pad + WASD/arrows), `input.held('a')`, `input.pressed('a')`.
- Standard mapping: **A** confirm/jump/action, **B** back/cancel, **X/Y** secondary actions, **LB/RB** cycle, **Start** pause.
- **Never require Start + Select together.** The launcher reserves that for its own menu.
- Everything must be playable with a controller alone: menus navigable with d-pad + A/B, no mouse-only or hover-only interactions, no text entry.
- Also support keyboard (`input.js` already does).
- Show button prompts with `input.label('a')`, which shows "A" on a controller and "Space" on a keyboard.

**Screen.**
- The Steam Deck is **1280×800**. Lay out in that fixed space and scale to fit the window (the starter already does this).
- Text at least **24px** in that space (it's a 7" screen at arm's length).
- Keep important HUD away from the outermost ~32px.

**Flow.**
- Start on a title screen that says how to start (`Press A to start`).
- **Start** pauses, with resume and quit-to-title options.
- Never use `alert()`, `confirm()`, `prompt()`, `window.open()` or new tabs; they block the controller.
- Don't wait for a click before drawing. Audio may start without a user gesture.

**Offline and self-contained.**
- No CDNs, remote fonts, analytics or network calls. Bundle everything inside the game folder (or install it with npm in a `--vite` game). The check fails on internet requests.
- Exception: real online multiplayer, with `"online": true` in the manifest.
- Save progress and high scores in `localStorage`. Saves persist per game on the Deck.

**Performance.** The Deck has a mid-range integrated GPU. Aim for a steady 60fps. Prefer canvas 2D or modest WebGL scenes, cap particle counts, and avoid huge textures.

**Tech.**
- Default: plain HTML + ES modules (`<script type="module">`) and canvas.
- Use `--vite` when you need npm packages (three.js, Phaser, physics engines). Install with `npm install <pkg> --workspace games/<id>` and commit `package-lock.json`.
- Keep a game self-contained in its folder.

## Manifest (`games/<id>/pushplay.json`)

```json
{
  "$schema": "../../.github/pushplay/manifest.schema.json",
  "id": "star-courier",
  "name": "Star Courier",
  "description": "Pilot a tiny courier ship through an asteroid field, grabbing parcels before the clock runs out.",
  "version": "1.0.0",
  "entry": { "web": "index.html" },
  "art": { "cover": "art/cover.svg", "hero": "art/hero.svg" },
  "controls": "gamepad",
  "players": "1",
  "online": false
}
```

- `id` must equal the folder name.
- `description`: 1–3 sentences in plain language: what you do and what makes it fun. It's shown in the library.
- `players`: like `"1"` or `"1-4"`.
- `version`: bump it when you make a notable change.
- Vite games also have `"build": { "preset": "vite", "output": "dist" }` (the scaffold adds it).

## Art

Every game needs two images, written as **SVG** (or `.html` for art drawn with canvas). The check renders them to PNG. Both are required and must look good: they're the first thing anyone sees in the library.

| File | Size | Where it shows | Rules |
|---|---|---|---|
| `art/cover.svg` | 720×500 | Library tile (shown at ~216×150) | **Must include the game's title**, big and bold. Keep the **bottom 110px clear of important content** (the launcher draws badges there). |
| `art/hero.svg` | 1920×450 | Banner on the game's detail page | **No title text**: the launcher writes the title over the **bottom-left**, so keep that area calm and put the key visual on the **right half**. |

Guidelines:
- Set `width`, `height` and `viewBox` on the root `<svg>` to the exact size.
- Show what the game *is*: its hero character, ship or key object, in the game's own palette. Composition and contrast beat detail. It must read at thumbnail size.
- Fill the frame with a background (no transparency). Use bold shapes, 2–4 main colors, and a clear focal point.
- **Fonts for art text:** use one of these (bundled, so they look identical everywhere): `Chakra Petch` (600, 700), `Rubik` (400, 700, 900), `Bungee`, `Lilita One`, `Press Start 2P`. Other fonts won't be available when the art is rendered.
- No external images or links inside the SVG. Embedded `<image href="data:...">` is fine.
- For a pixel-art or canvas look, an `art/cover.html` page that draws with the game's own code also works. Set `"cover": "art/cover.html"`. The page is rendered at exactly 720×500, after `load`.

If you're truly unable to make art, remove the `art` field: the check will generate a basic cover from a screenshot. Hand-made art is strongly preferred.

## Commands

| Command | What it does |
|---|---|
| `npm run new-game <id> [--vite] [--name "Title"]` | Scaffold a game |
| `npm run dev <id>` | Play it in a browser with live reload (http://localhost:5173) |
| `npm run check [id]` | Validate, build, headless play test, render art. Must pass before pushing. |

## Don'ts

- Don't edit `.github/` unless asked: it holds the build kit and workflow shared by every game.
- Don't commit `node_modules/` or `dist/`.
- Don't delete or rewrite other games.
