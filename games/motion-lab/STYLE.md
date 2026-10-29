# Motion Lab: art and animation style

The single source of truth for how Motion Lab looks. Shared drawing lives in `gfx.js`; each station draws its scene with it, and `art/scene.js` builds the cover and banner from the same code.

## Look
- **Rendering:** 2D canvas, procedural. Static scenery (the maze board, the ballpark, the kart track, the cutting mat) is baked once at 2× and blitted. Moving things are drawn live.
- **Reference style:** glossy toy lab: chunky plastic toys on a lit blueprint, in the spirit of Wii Sports and WarioWare.
- **Shape language:** round, chunky, friendly. Every object gets a dark ink edge (`#0a0f22`) and three tones from one light at the upper left (`gloss()` for balls, `glossFill()` for any path). Shadows mix toward a cool ink and highlights toward a warm white. Round things get a white shine spot.
- **Readability:** the player's object (marble, bat, sight) is orange; pickups and medals are gold; danger is pink or red; scenery is calmer and behind the play layer.

## Scene look
- **Materials:** glossy plastic (toys, fruit, notes, phone), moulded plastic trays (panels), a blueprint sheet (backdrop).
- **Values:** lightest = text, the phone body and the shine spots; darkest = the ink edges. The backdrop sits mid-dark navy and is lit by a soft pool from the upper left.
- **Hero colour:** `#ff8a3d` orange on `#0f1630` navy: Play and selection, the marble, the bat and the sight.
- **Surfaces:** `drawGrid()` is a baked gradient plus a light pool, with fine 40 px lines and brighter 160 px lines. `finish()` adds a vignette (0.26) and grain (overlay at 0.12) over every frame; during rounds it runs before the HUD so the HUD stays crisp.
- **Type:** display Lilita One (`font(900, …)`); everything else Rubik 700/900. Both are bundled in `assets/fonts/`.
- **UI objects:** `panel()` is a moulded tray: a drop shadow, ink edge, a body lit from the top, a bright top lip and a dark bottom lip. `panel(…, { flat: true })` gives the old flat card.
- **Light:** one light at the upper left. Things that spin (fruit, the maraca, the cog) keep their light fixed: the body is shaded in world space and the details turn.

## Palette
| Role | Colour | Used on |
|---|---|---|
| Background | `#0f1630`, grid lines `rgba(120,150,255,0.09)` | backdrop |
| Hero | `#ff8a3d` | selection, marble, bat, sight |
| Accents | `#2ad1c9` teal, `#ff5c8a` pink, `#b6f04a` lime, `#a98bff` violet | stations, arcs |
| Reward | `#ffd23f` gold, medals bronze `#d98b4a` / silver `#c9d3ea` | gems, stars, scores, medals |
| Danger | `#ff4d5e` red, `#ff5c8a` pink | holes, misses, low time |
| Ink / text | `#0a0f22` / `#eef2ff` | edges / text |
