---
name: polish-pass
description: Turn a game that plays but looks and feels like a prototype (grey blocks, flat colours, no impact) into one that looks finished, without changing its rules — an art-direction pass and a game-feel pass by specialist agents, measured honestly with a before / after capture of the same seed and autopilot at the same frames, side by side, then a fresh-eyes playtester review. Use for "make it look and feel like a real game", "it looks like a tech demo / programmer art", "polish pass", "before and after", "make it look like this video / screenshot", or the polish milestone of new-game.
---

# Polish pass

Follow AGENTS.md. This is how a game goes from *grey blocks on a grey floor* to *a lit stone courtyard
with hit flashes, ember bursts and score pops*: the **same rules, same seed, same autopilot**, with an art
director and a game-feel designer working on the build, and a before / after capture that proves what
changed. The capture keeps everyone honest: if the after shot doesn't look clearly better at the same
moment, the pass isn't done.

The rules are **frozen** for the whole pass: no changes to speeds, damage, spawns, waves, scoring or
anything else in `TUNING` that changes what happens. Feel layers that only add time (hit-stop) are fine.
Gameplay changes go through `improve-game` or `level-design`, before or after this pass, never inside it,
so the comparison stays a fair one.

## 0. Make the game testable (once per game)

The capture needs three hooks ([debugging.md](../../../docs/game-design/debugging.md), *Test hooks*):

- `?seed=n` seeds every random thing that affects play (`Math.random` only for pure decoration);
- `?autopilot` makes an in-game bot play by itself, reading only game state: move toward goals, aim at
  the nearest threat, fire, dodge. A few dozen lines; it doesn't need to be good, just busy and
  deterministic, so the camera sees combat, pickups and deaths;
- `window.__game.start()` starts a run from the title.

If any is missing, add it as its own small commit first (`<Name>: test hooks (seed, autopilot)`), check
that two runs of the same seed match (`--solo` twice, compare the `report.json` states), then start.

## 1. Baseline

```sh
git rev-parse HEAD   # remember this: it is "before" for the whole pass
node .claude/skills/polish-pass/scripts/compare.mjs <id> <scratch>/polish/base --solo --at 2,5,10,20 --video
```

`--solo` captures only the current build: stills at those seconds of play, `compare.png` and
`clip.mp4`. Pick moments that show the game at work: the first enemies, a fight, a big moment
(a wave clear, a boss, a crowd). For a phone game add `--size 390x844` (or `844x390`). Look at every
still and write down in plain words what makes it look and feel unfinished.

## 2. The brief

Read `DESIGN.md` and `STYLE.md`. Ask the user once (`AskUserQuestion`) for the look they want, with a
reference if they have one (a screenshot or video of another game; look at it, never copy its art). Offer
2–3 looks from the art-direction *Look recipes* that fit the game, your pick first. Then write a short
brief: the look (materials, palette with one hero colour, light), the feel targets from DESIGN.md, the
3–5 biggest problems from the baseline, and the frozen-rules rule.

## 3. Art direction, then feel

Use the project agents in `.claude/agents/`, one after the other (they edit the same files, so never in
parallel). Give each one the game id, the brief, the baseline folder and the "before" commit:

1. **`art-director`**: the whole frame (palette and values, surfaces and lighting, the HUD as part of
   the world, atmosphere, the finishing overlay). For a 3D game, also [3d.md](../../../docs/game-design/3d.md)
   *Action that reads in 3D*.
2. **`game-feel-designer`**: impact and response (hit flash, hit-stop, shake, particles, score pops,
   telegraphs, sound, rumble), honouring reduced shake.

Each returns what it changed and its own capture. If the Agent tool isn't available, do the same work
yourself with the `art-direction` and `game-feel` skills, in the same order.

## 4. Before / after

```sh
node .claude/skills/polish-pass/scripts/compare.mjs <id> <scratch>/polish/round1 --before <before-sha> --at 2,5,10,20 --video
```

It checks out "before" into a temporary worktree, runs both builds on a virtual clock (exactly 1/60 s per
frame, so frame N is the same moment in both however slow rendering is), with the same seed and
autopilot, and writes `before-<t>.png`, `after-<t>.png`, a labelled `compare.png`, `side-by-side.mp4` and
`report.json`. Read the warnings:

- **runs differ in state** → the pass changed the rules (undo that) or something isn't seeded, or the
  autopilot reads input (fix the hook). Hit-stop legitimately shifts timing; then only the screens matter.
- **page errors** → fix them first (`debug-game`).
- **ms of script per frame** went up a lot → check with `performance-pass` before shipping.

Look at `compare.png` yourself and list the top differences that are still missing against the brief.

## 5. Fresh eyes

Run the **`playtester`** agent on the after build with only the game id, DESIGN.md and the round folder:
not the brief, not the diff. It plays (autopilot and its own bots), looks at the captures and returns
findings ranked by severity. Fix the S1 and S2 findings (and cheap S3s) through the agents or skills that
own them, then capture again into `round2`. Two or three rounds is normal; stop when the after column is
clearly better at every moment and the playtester has no S1 or S2 left.

## 6. Finish

- Reduced shake on: capture once more with `--query` set to whatever turns it on in the game, or check by
  hand; nothing shakes, flashes full-screen or strobes.
- `npm run check`, look at the screenshot, cover and hero; update the library art to the new look
  (`cover-art`) if it no longer matches.
- Bump `version`, add a Changelog line to DESIGN.md and the Scene look to STYLE.md, commit
  (`<Name>: polish pass`) and push.
- Show the user `compare.png` and `side-by-side.mp4` (send the files), say what each agent changed and
  what to feel for when they play it ("hits should land with a flash and a short freeze").

Keep captures in the scratchpad; never commit them to the game folder (they'd ship).
