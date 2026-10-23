# <Game Name>: art and animation style

The single source of truth for how every unit, building and prop in this game looks and moves.
`model-unit`, `edit-asset` and `animate-unit` read it before any change and update it after.
Change a rule here first, then bring assets in line — never let one asset quietly drift.

## Look
- **Reference style:** <e.g. "Warcraft III (Reforged): chunky, saturated, hand-painted">. Reference images are
  provided by the user in the conversation; they are never committed. Describe what they showed here in words.
- **Shading:** <painted() strength, flat vs smooth shading, roughness ranges>
- **Outline / readability:** <team ring, silhouette rules, minimum part thickness at game zoom>

## Palette
| Role | Colour | Notes |
|---|---|---|
| Team colour (attackers) | `#……` | on pauldrons, tabards, banners |
| Team colour (defenders) | `#……` | |
| Skin(s) | `#……` | per race |
| Metal / steel | `#……` | shared `common.metal` / `common.steel` |
| Leather, cloth, fur | `#……` | shared `common.*` materials |
| Accent / glow | `#……` | magic, fire |

## Proportions (in head-heights)
| Archetype | Height | Shoulder span | Arm reach | Legs | Notes |
|---|---|---|---|---|---|
| Brute (orc, ogre) | 6 | 4 | fists at knee | 2.5 | hunched, head forward |
| Soldier (human) | 6.5 | 3 | fists at mid-thigh | 3 | upright |
| Small (imp, goblin) | 4 | 2 | | 1.5 | big head |
| Beast / mount | | | | | |

Exaggeration rules: weapon heads ≈ head size, hands 1.5× realistic, shoulder armour wider than the torso.

## Materials and shared parts
Shared materials (`common.leather`, `common.metal`, `common.steel`, `common.fur`, …) are used by every asset so metal,
fur and leather match across the game. New shared parts go in `sculpt.js`; asset-only parts stay in the asset's file.

## Animation
Timing tokens every unit follows (set them in the unit definition):
| Token | Small | Medium | Large / heavy |
|---|---|---|---|
| `stride` (walk cycle speed) | 11–13 | 7–9 | 5–6 |
| `attackTime` (s per swing) | 0.6–0.7 | 0.9–1.0 | 1.3–1.6 |
| `heavy` (bob, sway, slowness) | 0 | 0–0.3 | 0.6–1 |
| Idle breathing | quick, small | | slow, deep |

Rules: anticipation before every strike (wind-up ≈ 40% of the attack), follow-through after it, arms lag legs,
cloth trails motion, no two units in a crowd move in sync (per-unit seed), the head stays level when walking.

## Camera and scale
- Game camera: <angle, distance>; units are about <N> px tall at play zoom.
- Unit scale ↔ building scale: <e.g. a tower is 3× a soldier's height>.

## Asset catalogue
| Asset id | File | Reference (described) | Status | Last change |
|---|---|---|---|---|
| `orc.grunt` | `src/models/orc-grunt.js` | WC3 grunt: red pauldrons, fur, horned helm | sculpted v2 | <date / what> |
