# character-models in a PushPlay game

The general `character-models` skill covers bringing a 3D character in from a file (VRoid, Blender, GLB/VRM), the toon look and a character creator. This page gives the PushPlay side. AGENTS.md *Menus*, *Saves*, *Exit and pause*, *Screens and scaling* and *Performance* are the rules, and [3d.md](../3d.md) covers the render size, the HUD canvas, models in `public/assets/models/` and the loading screen.

## Input

- In the character creator, prompts come from `input.label()`.

## Menus

- Build the character creator as a `menu.js` menu with `choice` value items (left/right changes the value), drawn in the game's style (the `art-direction` skill's parchment card, say), with the model turning slowly in the left half.

## Saves

- Save the creator's choices in `save.data.hero` and call `save.save()` on Accept.

## Screen and scaling

- Keep `renderer.setPixelRatio(Math.min(devicePixelRatio, 1))` at 1280×800 ([3d.md](../3d.md)). Outlines and toon bands stay clean at that size.

## Debug hooks and the check

- Load the model behind a loading screen. The title and pause screens must never wait for it: the check takes its screenshot at about 3 s and presses Start soon after.
- Freeze `mixer` and `vrm.update` while paused: the game is fully frozen when paused.
- Measure frame time on the Deck target with the character, outline and overlay on (the `performance-pass` skill).

## Art and tools

- **Budget (Deck / Legion Go):** hero ≤ ~15k triangles, others ≤ ~5k ([assets.md](../assets.md)), textures ≤ 1024, ≤ 8 materials, ≤ ~60 bones.
- VRoid exports are often 30–70k triangles with 2048 textures: re-export with reduction on, or decimate in Blender.
- Check file size: a hero GLB/VRM should stay under ~8 MB.
- Record the model's source and licence in `assets/CREDITS.md`.
