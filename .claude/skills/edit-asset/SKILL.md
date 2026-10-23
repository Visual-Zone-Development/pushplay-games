---
name: edit-asset
description: Make one focused change to one existing 3D asset (a unit, building, prop, weapon or effect) in a game in games/ without touching anything else — e.g. "make the grunt's axe bigger", "the footman's helmet should have a plume", "darker red on the orc pauldrons", "fix the wolf rider's legs". Iterates on that single asset with before/after renders. For a new model or a full rebuild from a reference use model-unit; for motion use animate-unit.
---

# Edit one asset

The goal is a **small, contained, reversible** change: the user asks for one thing, one asset changes, and
everything else in the game stays exactly as it was. Sweeping restyles are a different job (model-unit, or a
STYLE.md change agreed with the user).

## 1. Pin down the target

- Which asset (id, e.g. `orc.grunt`) and which part ("the axe head", "left pauldron")? If the request is vague
  ("make it cooler"), offer 2–3 concrete options and let the user pick one.
- Read the game's `STYLE.md`: the change must stay inside its rules. If it can't (e.g. a colour outside the palette),
  say so and ask whether to change the rule or the request.
- Find the code: the asset catalogue in STYLE.md names the file (`src/models/<asset>.js`); otherwise search
  `src/assets.js` / `units.js` for the id.

## 2. Render "before"

With the model-unit skill's renderer and the game's asset viewer:

```sh
node .claude/skills/model-unit/scripts/shot.mjs <game-id> <scratch>/before \
  "viewer.html?unit=<id>&views=front,34,side,game|views.png"
```

Add an animation strip if the change could affect motion (weapons, capes, anything on a moving bone):
`viewer.html?unit=<id>&anim=attack&frames=6&views=34|attack.png`. Renders go to the scratchpad, never the repo.

## 3. Make the smallest change that does it

- Edit **only that asset's file**. Change part numbers (`pos`, `rot`, `size`, `color`) or the shape's outline/sections.
- **Shared code is off limits by default**: `sculpt.js` shapes and `common.*` materials, `rig.js`, and other
  assets' files are used by many units. If the change truly needs one of them, either:
  - fork it for this asset (copy the shape/material under the asset's own prefix, e.g. `grunt.axeHead`), or
  - ask the user, then re-render **every asset that uses it** before and after.
- Keep the old version reachable while iterating: duplicate the definition as `<id>Old` (e.g. `gruntOld`) in the same
  file and register it in `assets.js`, then compare with `viewer.html?unit=<id>&compare=<id>Old`. Remove the copy
  when the user is happy.
- Don't refactor, rename or "tidy" unrelated parts in the same change.

## 4. Render "after", compare, iterate

1. Render the same views as "before" (same parameters), plus `compare=<id>Old`.
2. Check: the requested change is visible at **game zoom**, nothing else moved, nothing clips in the animation strip.
3. Iterate in small steps until it reads right. Two or three rounds is typical.
4. Show the user before/after side by side and say exactly what changed (and what didn't).

## 5. Finish

- Remove the `<id>Old` copy (unless the user wants to keep comparing).
- Update the asset's row in STYLE.md's catalogue (status, last change); add a line to DESIGN.md's changelog; bump
  `version` in `pushplay.json`.
- Run `npm run check <game-id>` if the game's code changed beyond the asset file.
- Commit as its own small commit: `<game>: <asset> — <change>` so it is easy to revert.
