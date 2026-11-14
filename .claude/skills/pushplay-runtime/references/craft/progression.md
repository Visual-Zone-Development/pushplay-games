# progression in a PushPlay game

The general `progression` skill covers unlocks, upgrades, achievements and daily challenges. This page gives the PushPlay side: the save shape, when to save, and the unlock screens. AGENTS.md *Saves* and *Menus* are the rules.

## Input

- A grid screen moves with `input.navX` / `input.navY` and takes pointer taps (see [game-ui.md](game-ui.md)). B goes back.

## Menus

- A shop, collection or unlocks screen is reachable from the title and built with `menu.js`, or as a grid (above).

## Saves

- **Save shape:** add the fields (`unlocks`, `currency`, `achievements`, `stats`, `daily`) to the defaults of `createSave(id, version, defaults, migrate)`.
- If the save already exists, bump the save version and write `migrate(old)`, so existing players keep their best scores. Keys stay `<id>-save-v<n>`.
- **Award at the right moments:** at game over, level clear and achievement triggers. Call `save.save()` right after every award; the game already saves on pause and in `input.onPause`.

## Debug hooks and the check

- Add a debug helper, `window.__game.unlockAll()` behind `?debug`, to test every unlock quickly.
- The check warns on save keys without the game id.
- New progression is a minor `version` bump; update the Meta loop section of DESIGN.md.
