# prototype-sprint in a PushPlay game

The general `prototype-sprint` skill covers building two or three small playable directions and picking a winner. This page gives the PushPlay side: all prototypes ship as one game. AGENTS.md *Workflow*, *Menus*, *Manifest* and *Art* are the rules.

## Menus

- The `menu.js` title menu lists the prototypes ("A: Dodge", "B: Shoot", "C: Build") plus Settings. The first item starts with A, so the check still lands in gameplay.
- Each prototype is a module (`proto-a.js`, …) with `reset()`, `update(dt)` and `draw(ctx)`. They share the starter's pause, settings, audio and save.

## Manifest

- Scaffold one game for all the prototypes: `npm run new-game <id> --name "<Name> Prototypes"`. Add `--vite` if any direction is 3D.
- When a winner is picked, rename the game if it had "Prototypes" in it: `name` in `pushplay.json`, and the title. Keep the id unless the user wants a new one: a new id means a new folder and a new library entry.
- To grow the winner, rewrite DESIGN.md as a full brief (Status: approved) and continue with step 5 of the `new-game` skill (build in milestones) through to shipping.
- Bump `version` to `1.0.0` at release, and record the sprint in the Changelog.

## Debug hooks and the check

- Prototypes skip content, progression and polish, but they still follow the rules that keep the check green (title, pause, settings, art), because they ship to the user's library to be played.

## Art and tools

- Make a simple cover (title "<Name> Prototypes") and hero so the check passes; see the `cover-art` skill.
