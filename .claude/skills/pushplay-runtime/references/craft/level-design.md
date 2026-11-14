# level-design in a PushPlay game

The general `level-design` skill covers levels, waves, procedural generation, difficulty curves and pacing. This page gives the PushPlay side. AGENTS.md *Settings*, *Saves*, *Screens and scaling* and *Tech* are the rules.

## Settings

- All difficulty knobs (spawn rates, speeds, budgets, growth) go in `TUNING`. A difficulty setting multiplies them; add it as an `extra` item in the Settings screen (`settings.js`) if the kickoff asked for selectable difficulty.

## Saves

- Save progress with `save.js`: unlocked levels and the best per level, on every level clear and on pause.

## Screen and scaling

- Handheld readability: the whole threat fits the 1280×800 view, or is telegraphed before it enters it.

## Debug hooks and the check

- **Procedural content** uses a seeded RNG (e.g. mulberry32), so `?seed=123` replays the same run (see [debugging.md](../debugging.md)).
- Add `window.__game.jumpTo(n)` (the debug overlay convention in [debugging.md](../debugging.md)) so any level or wave can be reached instantly.
- Use a repro script to capture screenshots at each level, or at 10 s, 60 s and 3 min, and read them: is each stage visibly different? Is anything unreadable or overcrowded?
- New content is a minor `version` bump; update the pacing table in DESIGN.md.
