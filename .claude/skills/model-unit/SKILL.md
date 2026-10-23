---
name: model-unit
description: Build or rebuild a procedural three.js 3D model in code (a unit, character, beast, siege engine, or a prop/building) matched to a reference image the user provides, for a 3D game in games/. Covers the per-game STYLE.md, reference breakdown, proportions, block-out, sculpted parts, painted textures and render-and-compare rounds. For one targeted change to an existing asset use edit-asset; for motion use animate-unit.
---

# Model a unit

3D units in this repo are built **in code**, not in a modelling tool: sculpted parts on a small
skeleton, drawn with instancing. Quality comes from one discipline: **work from a reference and
compare renders against it every round.** Never "improve" from memory alone.

Sister skills: **edit-asset** (one focused change to one asset) and **animate-unit** (motion).
All three share the game's `STYLE.md` and the toolkit below.

## 0. Toolkit and style guide

The toolkit lives in this skill's `toolkit/` folder. In a `--vite` three.js game (`npm install three --workspace games/<id>`):

| Copy | To | What it is |
|---|---|---|
| `toolkit/rig.js` | `games/<id>/src/rig.js` | Skeleton, blended procedural animation, instanced rendering, team colour (`color: 'team'`), `painted()` shading |
| `toolkit/sculpt.js` | `games/<id>/src/sculpt.js` | `loft()`, `plate()`, `hornGeo()`, `shell()` + `shellRim()`, `furRoll()`, painted canvas textures, shared `common.*` materials, `registerShapes()` / `registerMaterials()` |
| `toolkit/models/orc-grunt.js` | `games/<id>/src/models/` | Worked example of a sculpted asset (copy, rename, rebuild) |
| `toolkit/assets.js` | `games/<id>/src/assets.js` | `ASSETS = { '<group>.<unit>': def }`: every model by id, for the viewer |
| `toolkit/viewer.html`, `toolkit/viewer.js` | `games/<id>/viewer.html`, `games/<id>/src/viewer.js` | Asset viewer: views, animation strips, side-by-side compares (not part of the game build) |

If the game already has these files, **use the game's copies** (they may have evolved); only copy what is missing.

**One file per asset**: `src/models/<asset>.js` holds that asset's shapes, textures and part list, registered under
an `<asset>.` name prefix. Shared shapes and materials (`common.*`) live in `sculpt.js`. This keeps edits local.

**Style guide**: every game with 3D assets has `games/<id>/STYLE.md` (start from `STYLE.template.md` next to this
file). Read it first; every proportion, colour and timing you choose must follow it, and every new rule you
establish goes into it. The asset catalogue at the bottom lists each asset, its file and status.

**Rendering**: `scripts/shot.mjs` (next to this file) starts Vite, renders pages to PNG and stops:

```sh
node .claude/skills/model-unit/scripts/shot.mjs <game-id> <outDir> \
  "viewer.html?unit=orc.grunt&views=front,34,side,game|views.png" \
  "viewer.html?unit=orc.grunt&anim=walk&frames=8&views=side,front|walk.png" \
  "viewer.html?unit=orc.grunt&compare=orc.gruntOld&views=front,34|compare.png"
```

Viewer parameters: `unit`, `compare`, `views` (`front`, `34`, `side`, `back`, `top`, `game`), `anim`
(`idle`, `walk`, `run`, `attack`, `cast`, `die`), `frames` (animation strip), `t`, `team`, `zoom`, `bg`; `?list`
shows every id. Write renders to the scratchpad (or another temp folder), never into the repo.

## 1. Get the reference (user-provided only)

- Ask the user for screenshots or concept art: front, ¾, side, and one at game zoom if possible. If they have
  none, describe the target in words and get a yes before modelling.
- **Never commit reference images** (they are usually someone else's art). Look at them in the conversation; if you
  need the file for a side-by-side, copy it to the scratchpad only. What the reference shows is recorded **in words**
  in STYLE.md (asset catalogue) and in your breakdown.

## 2. Write the breakdown before any code

1. **Silhouette**: the 3–5 shapes that read at game zoom (~40 px tall), biggest first.
2. **Proportions in head-heights**: height, shoulder span, arm reach (where the fists end), legs, stance,
   where the head sits relative to the shoulders. Check them against STYLE.md's archetype table.
3. **Posture**: lean, knee bend, arm splay, weapon carry.
4. **Parts list** with materials: skin, cloth, leather, fur, metal, bone, team colour. Reuse `common.*` materials.
5. **Palette**: 5–8 hex colours from the reference, mapped to STYLE.md's palette roles.
6. **Painted vs modelled**: what is texture (muscle lines, straps, rivets, stitching, faces), what is geometry.

## 3. Block out, then check the silhouette

1. Rig numbers first (`hip`, `chest`, `shoulder`, `arm`, `neckZ`, `lean`, `splay`, `stance`, `legSplay`), then one big
   shape per body region.
2. Render `front`, `34`, `side` and `game` views and compare side by side with the reference.
3. Fix proportions now. Detail never rescues a wrong silhouette.

## 4. Sculpt the parts

- **Organic forms → `loft(sections)`**, sections bottom-to-top `[y, rx, rz, dz, dx, flat]`: bulge where the muscle is,
  taper at joints; `dz` pushes forward (pecs, jaw), `flat` squares off (chests, jaws, fists).
- **Flat cut-outs → `plate(outline, thickness)`**: blades, flaps, ears, shields, emblems. Keep outlines chunky.
- **Armour shells → `shell(W, D, H)` + `shellRim()`**: pauldrons, helmets, plates; give rims `common.steel`.
- **Horns, tusks, spikes → `hornGeo(len, r, bend)`**; **fur collars/cuffs/knee rolls → `furRoll(R, r)`**.
- **Hide joints** with overlap: elbow spheres, fur cuffs, pauldrons over shoulders.
- **Cloth that should move** goes on the cloth bones: `skirtF`, `skirtB` (body) and `cape` (chest).
- **Exaggerate** per STYLE.md; thin parts vanish at game zoom, so make them thicker than feels right.

## 5. Paint the small stuff

`canvas(w, h, draw)` returns a texture. `loft()` UVs: u = 0 at the back, 0.5 at the front; v bottom → top
(canvas y = 0 is the top). Paint light in (highlights on top surfaces, dark grooves), keep base colours saturated.
Thin trims (tubes, rims) get a plain material, not a banded texture: tube UVs stretch the bands.
Team colour (`color: 'team'`) goes on parts big enough to read: pauldrons, tabards, shields, banners.

## 6. Animation check

Render `walk`, `attack` and `idle` strips (`frames=8`). Weapons stay in hand, nothing clips badly, legs don't kick
out sideways, the attack reads from the game camera. Motion problems belong to **animate-unit**.

## 7. Compare, list differences, iterate

Each round:
1. Render the same views as the reference, **plus a straight front view and the game view** (a high camera hides
   faults: black rims and short legs only showed from the front).
2. Write down the **top 5 differences**, biggest first (silhouette > proportions > big parts > colours > detail).
3. Fix those, re-render, repeat until what's left is small detail (3–5 rounds is normal).
4. Show the user the before/after and the remaining gaps honestly.

## 8. Finish

- Update STYLE.md: catalogue row (file, reference described in words, status), and any new shared rule.
- Add a line to the game's DESIGN.md changelog and bump `version` in `pushplay.json`.
- Budget: each new shape × material pair is one draw call for *all* units; reuse shapes and `common.*` materials,
  ≤ ~8 materials and ≤ ~4k triangles per unit, textures 64–256 px.

## Lessons so far

- Judge leg length from the front view and arm reach from the ¾ view; a high camera foreshortens legs.
- Painted detail (straps, rivets, muscle lines) reads better at game zoom than tiny geometry.
- Rounded-rectangle shells read as armour; spheres read as pillows. Flatten domes (`H` ≈ ¼ of the width).
- The worked example (`toolkit/models/orc-grunt.js`) took 4 rounds against a Warcraft III grunt screenshot:
  red layered pauldrons with steel rims, fur collar and knee rolls, crossed straps painted on the torso, strip skirt
  on the cloth bones, horned helmet, bracer-shield, toe plates, head-down axe.
