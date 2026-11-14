# environments in a PushPlay game

The general `environments` skill covers the world the game takes place in: play spaces, tiles, scattering, backdrops, skies, weather and ambient motion. This page gives the PushPlay side. AGENTS.md *Settings* and *Screens and scaling* are the rules.

## Settings

- A few ambient movements make a space alive; too many fight the gameplay for attention. When `settings.data.reducedShake` is on, show no flashing, no lightning and no camera-shaking weather.

## Debug hooks and the check

- Capture the area in the game, next to the reference, with the `model-asset` skill's `scripts/shot.mjs` (see [model-asset.md](model-asset.md)) or the check's screenshot.
- Update STYLE.md when the environment changes.
