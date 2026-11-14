# edit-asset in a PushPlay game

The general `edit-asset` skill makes one focused change to one existing asset, with before and after renders. This page gives the PushPlay side: how to capture the renders and how to commit the edit. AGENTS.md *Art* and *Assets* are the rules.

## Debug hooks and the check

- Capture the *before* render with the `model-asset` skill's `scripts/shot.mjs`, close up in the gallery and in the game:

  ```sh
  node <model-asset skill folder>/scripts/shot.mjs <game folder> <scratch>/before \
    "gallery.html?asset=<id>&scale=4|close.png" "index.html|in-game.png|keys=Enter|wait=2500"
  ```

  In a PushPlay repo the game folder is `.` (one game at the root) or `games/<id>` (a workshop); the script finds the kit's Playwright by itself.

## Art and tools

- Update the asset's row in STYLE.md's catalogue.
- Commit the edit on its own, as `<game>: <asset> — <change>`, so it is easy to revert.
