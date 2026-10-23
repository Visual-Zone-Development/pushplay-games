---
name: animate-unit
description: Make a procedural three.js unit's motion look natural and consistent — walk/run cycles, attacks, casting, idles, hit reactions, deaths, mounts and siege engines — in a 3D game in games/ that uses the model-unit toolkit (rig.js). Use for "the walk looks robotic", "make attacks feel heavier", "units move in sync", "add a death animation", or animation consistency across a game's units.
---

# Animate a unit

Units are posed in code every frame by `pose()` in the game's `src/rig.js` (toolkit: the model-unit skill's
`toolkit/rig.js`). There are no keyframed clips: motion is built from a few curves and blended weights, so
**fix motion in the rig or in the unit's timing tokens, never per frame in game code.**

Read the game's `STYLE.md` *Animation* section first. Timing must match the unit's size class there; if a unit
needs different timing, change the rule (for the whole class) or justify the exception in STYLE.md.

## How the rig animates

- `advance(u, dt)` blends weights `u.w.move`, `u.w.run`, `u.w.attack`, `u.w.cast` toward the current `u.anim`
  (≈ 0.1 s), so changes ease in and out instead of snapping. Set `u.anim`; never jump weights by hand.
- `u.stride` advances with movement (legs ease into and out of the cycle); `u.attackT` loops 0..1 per swing;
  `u.dieT` runs the fall; `army.hit(u)` plays a recoil and flash.
- Per-unit `u.seed` varies cycle speed (±6 %), idle glances and sway, so crowds never move in lockstep.
- Curves are keyframes sampled with easing: `keys(a, [[t, value, ease], …])`, eases `inOut`, `out`, `in`,
  `back` (overshoot), `linear`. The melee swing is `SWING_ARM`, `SWING_LEAN`, `SWING_TWIST`, `SWING_STEP`.
- Unit timing tokens (in the unit definition): `stride`, `attackTime`, `heavy` (0..1), plus posture
  (`lean`, `splay`, `stance`, `legSplay`) and `aim` (ranged pose) / `ram` (engine thrust).
- Cloth bones `skirtF`, `skirtB`, `cape` trail the motion and flutter: attach loincloths, skirts and capes to them.

## Principles (what "natural" means here)

1. **Anticipation**: every strike winds up first (≈ 40 % of the attack, ease in-out), body twists away and leans back.
2. **Fast action, slow everything else**: the strike itself takes ≈ 10–15 % of the attack with an `out` ease.
3. **Follow-through and overlap**: the weapon overshoots past the target, then settles; arms lag the legs by
   ~0.35 rad; tails, capes and skirts lag the body.
4. **Weight**: the body dips at each foot contact (twice per stride) and rises when legs pass; hips sway over the
   standing leg; heavy units bob deeper, sway wider, move slower (`heavy`).
5. **Counter-rotation**: shoulders twist against the hips in a walk; the head counter-rotates and stays level.
6. **Arcs**: limbs rotate from joints, so hands and feet travel in arcs; avoid straight-line slides.
7. **Knees and elbows**: the knee folds on the forward swing (foot clears the ground) and straightens at contact;
   elbows bend more on the back swing.
8. **Idle is alive**: breathing (chest lift, shoulder splay), slow weight shifts, occasional glances, all desynced.
9. **Readable from the game camera**: exaggerate poses (the swing raises the weapon overhead, the lean is visible
   from above); subtle motion disappears at 40 px.
10. **Consistency**: the same action has the same rhythm across a faction's units, scaled by size class.

## Workflow

1. **Name the problem precisely** with the user ("the feet slide", "the attack has no weight") or from renders.
2. **Render strips before changing anything** (model-unit's `scripts/shot.mjs` + `viewer.html`):
   - `viewer.html?unit=<id>&anim=walk&frames=8&views=side,front`
   - `viewer.html?unit=<id>&anim=attack&frames=8&views=34,side`
   - `viewer.html?unit=<id>&anim=idle&frames=6&views=front` and `anim=die`
   - plus the game view of a group (the game's own preview, if it has one)
3. **Decide where the fix lives**:
   - one unit's rhythm or posture → its timing tokens in its asset file;
   - a whole archetype (all bipeds, all mounts) → the curves in `rig.js` (re-render one unit of every archetype after);
   - a new action (block, cheer, spell channel) → a new curve set and weight in `rig.js`, documented in STYLE.md.
4. **Change one thing, re-render the same strips, compare** frame by frame. Keep the before strip for the user.
5. **Check transitions**: walk → attack → walk and idle → walk should ease, not pop (render with `t` values around
   the change, or watch it in `npm run dev`).
6. **Performance**: `pose()` runs for every unit every frame. No allocations in it (reuse the scratch matrices),
   no per-frame `new`, only a few `keys()` calls per bone.
7. **Update STYLE.md** (timing table and rules) and the game's DESIGN.md changelog.

## Recipes

| Problem | Fix |
|---|---|
| Robotic walk | more hip sway and counter-rotation; arm lag `-0.35`; knee fold on `cos(phase)`; bob at `cos(2·phase)` |
| Feet slide | match `stride` to the movement speed in game code: cycles/s ≈ speed ÷ (2 × step length) |
| Floaty attack | longer wind-up, shorter strike with `out` ease, add `SWING_STEP` forward and a hold at the end |
| Weightless big unit | raise `heavy`, lower `stride`, longer `attackTime`, bigger lean into the strike |
| Crowd in lockstep | make sure each unit has its own `seed` and spawn phase; vary `attackTime` slightly |
| Snapping between actions | set `u.anim` and let `advance()` blend; never reset `stride` on a state change |
| Stiff cloth | attach to `skirtF` / `skirtB` / `cape`; increase drag from movement |
| Dead units pop out | let `die` finish (fall, bounce, settle, sink) before removing; fade with `dieT` |
