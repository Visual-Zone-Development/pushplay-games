---
name: level-design
description: Design and build the content of the game in this repo — hand-made levels, enemy waves, procedural or seeded generation, difficulty curves, pacing and boss or finale moments — so the game keeps introducing something new and ramps fairly. Use for "add more levels", "it gets boring after a minute", "too easy / too hard later on", "make a level editor format", "add procedural maps", or the content part of a new game. For feel use game-feel.
---

# Level design

Follow the project's own rules first (its `AGENTS.md` or platform guide): they decide the APIs, the screen size, the checks and how to finish a change. Read the game's `DESIGN.md` (fun targets, session and structure, core loop) and the code that spawns or loads content.

## 1. Map the curve before building
Write a short **pacing table** in DESIGN.md under *Scope* (or a new *Content* section): one row per level, wave or minute of play.

| # / time | New thing introduced | Threat level (1–10) | Breather? |
|---|---|---|---|
| 1 / 0:00 | core verb only, impossible to fail | 1 | |
| 2 / 0:30 | first hazard, telegraphed | 2 | |
| … | | | |

Rules of thumb ([definition-of-done.md](../game-design/references/definition-of-done.md), [genres.md](../game-design/references/genres.md)):
- **Something new every 30–60 s** of play: an enemy type, a hazard, a mechanic, a music layer, a visual change.
- **Teach, test, twist:** introduce a thing safely, then test it, then combine it with something already known.
- **Saw-tooth difficulty:** ramp, peak, breather, higher ramp. Never a flat line, never a cliff.
- **Early wins:** the first minute is nearly impossible to lose.
- **An ending or a moment:** a boss (build it with the `boss-design` skill), a finale wave, or a milestone (every 5 waves) with a bigger reward.
- **Handheld readability:** the whole threat fits the game's view, or is telegraphed before it enters it.

## 2. Pick the content format
- **Hand-made levels:** data, not code. Tile strings (`'#..^..G'`) or small arrays in a `levels.js` module next to the game's code, one entry per level with its name and parameters. Easy to add, easy to read in a diff.
- **Waves:** a list of `{ at, spawn, count, pattern }` entries, or a budget system (each wave gets `budget = base + growth × n` points to spend on enemies with costs).
- **Procedural:** a seeded RNG (e.g. mulberry32) so `?seed=123` replays the same run. Generate from hand-made **chunks** stitched together, not pure noise, and validate each result (reachable exit, no unavoidable damage) and regenerate if it fails.
- **Daily seed** (stretch): seed from the date so everyone's run is the same that day; save the day's best.

All difficulty knobs (spawn rates, speeds, budgets, growth) go in `TUNING`. A difficulty setting multiplies them; add it to the game's Settings screen if the kickoff asked for selectable difficulty.

## 3. Build and verify the curve
1. Build the content in the format above, level by level or wave by wave.
2. Add a debug hook (a `jumpTo(n)` the game exposes behind `?debug`, say) so any level or wave can be reached instantly.
3. Drive the game with a short headless-browser script (Playwright) that presses the inputs and captures screenshots at each level or at 10 s, 60 s, 3 min, and read them: is each stage visibly different? Is anything unreadable or overcrowded?
4. If a bot or replay is practical, run the `playtest` skill to measure where runs end.
5. Progress goes in the game's save data (unlocked levels, best per level); saved on every level clear and on pause.
6. Update DESIGN.md (pacing table, Changelog), then run the project's checks and finish the change the way its rules say.
7. Tell the user where the new content starts and what to watch for ("does wave 6 feel like a spike?").
