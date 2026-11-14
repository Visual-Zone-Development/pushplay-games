# model-asset in a PushPlay game

The general `model-asset` skill covers creating or rebuilding a visual asset to match a reference: STYLE.md, silhouette, block-out, detail, and render-and-compare rounds. This page gives the PushPlay side: how to render in a PushPlay repo and what the build ships. AGENTS.md *Art*, *Assets* and *Tech* are the rules.

## Debug hooks and the check

- Render each round with the skill's `scripts/shot.mjs`, run from the repo root:

  ```sh
  node <model-asset skill folder>/scripts/shot.mjs <game folder> <scratch>/round1 \
    "gallery.html?asset=hero&scale=4|hero-big.png" \
    "gallery.html?asset=hero&scale=1|hero-play-size.png" \
    "index.html|in-game.png|keys=Enter|wait=2500"
  ```

- In a PushPlay repo the game folder is `.` (one game at the root) or `games/<id>` (a workshop); a bare `<id>` also finds `games/<id>`. The script finds the kit's Playwright by itself: it searches `node_modules` up to two folders deep, hidden folders included.
- When the asset is done, run `npm run check` and look at its screenshot. If the asset moves, check the motion first (the `animate-asset` skill).

## Art and tools

- **Cover and hero art (SVG):** edit the SVG. `npm run check` renders it, or use `scripts/shot.mjs` as above.
- **The gallery page** isn't part of the build. Vite only bundles `index.html`; in a plain game, list the gallery in `.pushplayignore`.
- Update STYLE.md: the catalogue row (file, reference in words, status) and any new shared rule.
