# boss-design in a PushPlay game

The general `boss-design` skill covers attack patterns, telegraphs, phases, the arena, the health bar and an entrance and death that feel like an event. This page gives the PushPlay side. AGENTS.md *Controls*, *Settings*, *Saves* and *Screens and scaling* are the rules.

## Input

- Play the boss with a controller and with the keyboard: it must be beatable on both, and with mouse and touch if the manifest's `inputs` includes them.
- The entrance is skippable with `a` after the first time.

## Settings

- Draw the boss's name in big text on its entrance: ≥ 48 px × `settings.data.textScale`.
- Skip all shake and flash, the death included, when `settings.data.reducedShake` is on.

## Saves

- Store in `save.data` that the entrance has been seen, so it can be skipped from the second time on.

## Audio

- Change the music on the entrance: a new layer or track (see [game-audio.md](game-audio.md)).

## Screen and scaling

- The arena fits the 1280×800 view (or locks the camera), with room to dodge.

## Debug hooks and the check

- Add `window.__game.jumpTo('boss')` so the boss can be reached instantly.
- A new boss is a minor `version` bump; update the Boss section of DESIGN.md.
