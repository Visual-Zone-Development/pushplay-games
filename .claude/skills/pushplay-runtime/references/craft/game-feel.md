# game-feel in a PushPlay game

The general `game-feel` skill covers responsiveness and juice: movement, hit-stop, shake, particles, squash and stretch, and impact sounds. This page gives the PushPlay side. AGENTS.md *Controls*, *Settings* and *Audio* are the rules.

## Input

- Input reaches motion within one frame: read `input` after `input.update()` and apply it the same frame.

## Settings

- **Screen shake:** a trauma value 0..1 that decays; offset = trauma² × max × noise, with max 6–16 px. Skip it when `settings.data.reducedShake` is on.
- **Flash:** a white or colour overlay on the thing that was hit, not the whole screen, for 1–3 frames. Skip full-screen flashes when `settings.data.reducedShake` is on.
- **Numbers and text** (damage numbers, "+100", a combo counter that pops): ≥ 24 px × `settings.data.textScale`.

## Audio

- Every action has a sound, with pitch varied ±5–10% at random per play and rising on combos. Play them with `audio.tone`, `audio.noise` or `audio.play` with a `rate` (see [game-audio.md](game-audio.md)).

## Debug hooks and the check

- Build the feedback helpers as a small set in `game.js`, not in the runtime files, and use them everywhere.
- To test the core verb alone, run `npm run dev` (or a repro script from [debugging.md](../debugging.md)) and do only that verb for 30 seconds in an empty space.
- Tune one number at a time. Live-tune through `window.__game.TUNING` in the dev console.
- A feel pass is a patch `version` bump; tick the *Feel* items in DESIGN.md's Definition of done.
