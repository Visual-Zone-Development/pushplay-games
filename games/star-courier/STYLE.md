# Star Courier: art and animation style

The single source of truth for how Star Courier looks. All drawing lives in `art.js`, which the game, `art/cover.html`, `art/hero.html` and `art/gallery.html` all import. Change a rule here first, then the code.

## Look
- **Rendering:** 2D canvas shapes. Sprites are baked once at 2–3× (`bake()`) and blitted. Big renders (the title ship, cover, hero) call the vector functions directly.
- **Reference style:** lit vector: enamel-like flat shapes given volume by light, like a polished mobile arcade game.
- **Shape language:** chunky and friendly; rounded hull, swept wings, faceted rocks. Every shape gets a dark **ink edge** (`#070a18`, 2–4 px, filled before the colours) and **three tones** from one light at the upper left: a base, a cool shade toward the lower right (mixed toward `#0a0c24`) and a warm highlight toward the upper left (mixed toward `#fff6e6`). Edges facing the light get a 1–1.5 px white highlight, and the far edge gets a thin cool rim (`#7fe3ff`).
- **Readability:** the ship is about 70 px long in play, rocks 44–88 px and parcels about 40 px. The ship is the only cyan thing, parcels the only amber things (and they glow), rocks are desaturated violet-grey and danger is coral. At 44 px the ship still shows its cyan wings and amber cargo pod.

## Scene look
- **Materials:** enamel-painted metal (ship), cardboard with a strap (parcels), cratered stone (rocks), and a nebula of soft light.
- **Values:** lightest is the ship's white hull and the parcels; darkest is the ink edge and the deep-space corners. The backdrop sits mid-dark and is the least saturated layer.
- **Hero colour:** `#5cc8ff` on `#0b1024`, used only for the ship (wings, spine stripe) and the parcel tag.
- **Surfaces:** `drawBackdrop()`: a vertical gradient, three big nebula clouds (violet, teal, plum), two wisp "rivers", dark dust lanes, seeded far stars with rare glints, and a hazy ringed planet. A vignette over the play layer.
- **Type:** display Lilita One with a thick ink stroke; HUD and menus Rubik 700. Both are bundled in `assets/fonts/`.
- **Light:** one light from the upper left. Rocks turn but their light doesn't: the shading gradient and the warm rim are drawn unrotated, clipped to the outline (`drawRock`). Glow is baked radial halos blitted with `lighter`, never `shadowBlur`.

## Palette
| Role | Colour | Used on |
|---|---|---|
| Background | `#0b1024`, `#060917`, nebula `#4a2f8a` / `#16708f` / `#7a2e6e` | backdrop |
| Player | `#5cc8ff`, dark `#1f6fb0`, light `#d2f3ff`; hull `#eef2f8` → `#7d88a3` | ship |
| Danger | `#ff7a6b` | hit sparks, low clock, port wingtip light |
| Pickups | `#ffb547`, dark `#b8661c`, light `#ffe4a8` | parcels, cargo pod, engine flame, exhaust |
| Rock | `#6d6a80` ± 12% per rock | asteroids |
| Ink / text | `#070a18` / `#eef0f5` | edges / text |

## Proportions and scale
| Archetype | Size on screen | Notes |
|---|---|---|
| Ship | 72×56 sprite, nose at +x | cargo pod mid-spine, cockpit forward, two nozzles |
| Parcel | 40×38 | crate seen slightly from above: lit top, front, shaded side |
| Rock | radius 22–44 | 6 baked variants with 10–13 sides and 3–5 craters |

## Animation
- The engine flame flickers (two sines) and grows with thrust: idle glow, more when steering, most on boost. Exhaust puffs fade behind the ship (capped at 90).
- Parcels bob and tilt slightly and their halo pulses. Rocks spin with their light fixed.
