# Overclock: design brief

> Boss-rush roguelite platformer: beat the boss, bolt on one of its parts, fight it again, stronger, until it breaks you.

*Status: prototype shipped (phase 1: 1 hero, 1 boss) · Version: 0.1.0*

## Kickoff

| Topic | Answer |
|---|---|
| Concept / genre | Boss-rush roguelite action platformer. A run is a chain of boss fights; after each win you pick 1 of 3 rewards (visible bolt-on parts). Phase 1: one hero, one boss, looped. |
| 2D or 3D | 2D |
| Art style | 16-bit SNES-era pixel art (Mega Man X–like energy, but modular robots with visible bolt-on parts, own palette and silhouettes). Sprites, tiles, background and effects generated with the user's OpenAI key, then sliced to game pixels; part add-ons hand-drawn |
| Players | Solo for phase 1. **Co-op planned** (2 heroes with different roles vs. one boss) but not built: code keeps a `players` array and a camera that frames all players. |
| Feel | Tight and responsive (instant jump/dash, variable jump), punchy (hit-stop, shake, flashes) |
| Camera / view | Side view; arena ~2 screens wide × 1.6 tall; camera follows hero with look-ahead and leans toward the boss; off-screen boss arrow |
| Session and structure | Run = boss loops until death (prototype). Full game: ~6 bosses + final, branching map, 20–25 min |
| Like which game? | Mega Man X (feel, charge shot, wall jump, boss weapons), Awesomenauts (heroes with roles and sizes), Hades / Risk of Rain (run rewards, builds) |
| Audience and difficulty | *(assumed)* Players who like action games; first loop learnable in 2–3 tries, loop 4+ is hard |
| Assets | Generated with the image API (`art/prompts.json` → `art/raw/`), sliced to `assets/sprites/` at game resolution; part add-ons hand-placed pixels in `art.js` |
| Sound and music | *(assumed)* Generated SFX with `audio.js`; chiptune-ish sequenced loop |
| Progression | In-run: parts. Across runs: best loop, parts discovered (the meta unlock tree is a stretch goal) |

## Fun targets
- **Primary: Challenge.** Learn the boss's tells, dodge with wall jumps and dashes, punish its recovery windows. Fair telegraphs, every hit your fault.
- **Secondary: Discovery / expression.** Each part changes a verb (hover, double dash, 3-way shot), so every run plays differently and builds feel like yours.

## Core loop
- **Moment-to-moment (seconds):** read the tell → dodge (jump / dash / wall jump) → shoot or charge in the recovery window → boss bar drops.
- **Round (minutes):** fight (~60–120 s) → boss explodes → pick 1 of 3 parts (visible on Rivet) → next loop: boss faster, new attack, new arena layout.
- **Meta (across sessions):** beat your best loop; see every part. Later: unlock heroes and parts into the pool.

## The 8 formal elements
| Element | This game |
|---|---|
| Players | 1 (co-op planned) |
| Objectives | Survive as many boss loops as possible |
| Procedures | Run, jump, wall slide / wall jump, dash, shoot, hold to charge |
| Rules | Contact and projectiles hurt; brief invulnerability after a hit; one part per slot (a new one replaces the old); the boss gets new attacks each loop |
| Resources | Health (16 pips, full heal between loops), charge, parts (4 slots), health capsules the boss sometimes drops |
| Conflict | Talon, a raptor mech that climbs walls and pounces across the arena |
| Boundaries | One arena per loop, ~640×320 native px, with 2–3 platform levels and climbable walls |
| Outcome | Score = loops cleared (+ time); best saved |

## Controls

| Input | Action |
|---|---|
| Left stick / d-pad (`x`) | Run left / right |
| `a` | Jump (hold for height); wall jump while sliding; hover with Hover Jets |
| `x` | Shoot (tap); hold to charge, release to fire |
| `b` | Dash (ground; air dash with Dash Boots) |
| `y` | Also shoot (for players who prefer it) |
| `rt` | Dash (alternative, X-style) |
| Down + `a` on a girder | Drop through it |

Keyboard: Z / X / C (or J / K / L) jump / shoot / dash, arrows or WASD to move; Space / Shift / Backspace also work. In-game prompts name Z / X / C.
| `menu` (Start / Esc / on-screen button) | Pause |

- **Inputs:** gamepad and keyboard for gameplay. Mouse and touch work in every menu; the title says gameplay needs a controller or keyboard.
- **Players:** 1. Co-op later via `input.pads[i]`.

## Heroes and parts (full game plan; phase 1 = Rivet only)

| Hero | Role | Size | Base weapon |
|---|---|---|---|
| Rivet | All-rounder | Medium (32×42) | Arm cannon, charge |
| Mortar | Tank | Large | Arcing shells, ground pound, no dash |
| Shear | Agile melee | Small | Blade combo, parry, double jump |
| Prism | Glass cannon | Small/medium | Bouncing beam |

Parts are drawn per body size as add-ons on mount points (boots, back, arm, head), in shared gunmetal with a coloured slot stripe.

**Phase 1 part pool (12), each visible on Rivet:**
- **Legs:** Spring Boots (higher jump; coils under the feet) · Hover Jets (hold jump to glide; calf pods with green flame) · Dash Boots (air dash, 2 per jump; heel fins)
- **Arm:** Splitter (3-way shots) · Rapid Coil (auto-fire while held) · Pierce Lens (charge shots bigger, ×1.5, pass through). Shown on the cannon tip in firing poses
- **Core:** Overclock (charge 2× faster; glowing chest) · Bubble Shield (blocks 1 hit, recharges in 10 s; visible bubble) · Reboot Cell (revive once at half health; battery on the back)
- **Rig** (replaced Head, to match the generated part art): Coolant Pack (invulnerable while dashing) · Scanner Dish (2× damage on Talon's head) · Repair Kit (full repair after each win, capsules heal double and drift to you)

Between loops Rivet repairs 8 health (all of it with the Repair Kit). Talon drops a health capsule every quarter of its bar.

## Boss: Talon (raptor-mech)
~64×48, purple-and-gunmetal, red eye. Climbs walls and ceilings.
- **Pounce** (loop 1): crouch + eye flash (0.5 s) → arcing leap at the hero → landing skid. Punish: the skid.
- **Wall spray** (loop 1): jumps to a wall, clings, fires a 3-shot fan; then drops.
- **Dive** (loop 2): from the ceiling/wall, aims a red line (0.6 s), dives along it, sticks in the floor 1 s.
- **Tail sweep** (loop 2): low sweep across the floor, jump over it.
- **Disc toss** (loop 3): throws 2 bouncing claw discs.
- **Phase 2** (below 50% each loop): faster, landings send ground shockwaves.
- Each loop: HP +20%, speed +8%, shorter recoveries; arena layout cycles through 3 variants.

## Inspirations
| Game | Borrow | Change / avoid |
|---|---|---|
| Mega Man X | Charge shot, dash, wall slide/jump, crisp boss tells, boss weapons as rewards | Its hero design (no blue helmet, no centred gem), tiny one-screen boss rooms |
| Awesomenauts | Heroes with distinct roles, sizes and movement | Online PvP |
| Hades / Risk of Rain 2 | Pick 1 of 3 after each fight, builds that change verbs | Long runs; keep runs short for a handheld |

**Twist:** only bosses, in big vertical arenas, and every reward is a part you can see bolted onto your robot.

## Art direction
- **Style:** 16-bit pixel art, 320×200 native ×4, generated sheets downscaled to game pixels with hard alpha and 64-colour palettes; soft additive glow drawn at full resolution over the pixel layer (shots, charge, molten floor, explosions)
- **Rivet (redesigned to move away from X):** off-white dome helmet with a cyan visor slit and a stubby antenna, teal riveted armour on a navy suit, one oversized pipe arm cannon, chunky boots. No face, fin or forehead gem
- **Talon:** black-gunmetal raptor mech with red lights and fins, hooked silver claws, bladed tail
- **Scaling:** `fitCanvas` without integer snapping so the game fills 1920×1080 windows; the 320×200 layer is blown up with smoothing off
- **Palette:** `#141a38` background, `#43d3c0` hero teal, `#ff8838` glow accent, `#c43a5a`/`#6a3a8a` boss, `#e8f0ff` text; parts gunmetal `#6c7698` with slot stripes (legs green, arm orange, core yellow, head cyan)
- **Font:** Pixelify Sans (bundled, OFL) in game; Press Start 2P / Bungee for art
- **Rendering:** 2D canvas, plain HTML
- **Assets:** procedural (hand-placed sprites as text)
- **Cover idea:** Rivet mid-charge on the left, Talon's silhouette clawing down from the top-right, big "OVERCLOCK" title
- **Hero idea:** Talon clinging to a wall on the right, firing, Rivet dashing in

## Audio
- **SFX:** shot, charge hum (rising), charged shot, jump, dash, wall kick, hit, boss hit, boss tell, boss explosion, part pickup, menu
- **Music:** driving minor-key arpeggio loop, faster in phase 2

## Scope
**v1 (phase 1 prototype) must-haves**
- Rivet with run / variable jump / wall slide / wall jump / dash / shoot / charge
- Talon with 5 attacks introduced over loops, phase 2, telegraphs
- 3 arena layouts, camera, off-screen boss arrow
- Part choice after each win; all 12 parts working and visible
- HUD: health, charge, boss bar, loop, parts
- Title, pause, settings, game over with best loop; SFX + music

**Stretch**
- Power budget per hero, more heroes, more bosses, branching map, meta unlocks, co-op, rumble

## Definition of done
**Play**
- [ ] First loop teaches by doing (prompts via `input.label`); score = loops; one-press retry
- [ ] Each loop adds something new (attack, arena, part)

**Feel**
- [ ] Hit-stop and flash on boss hits; shake on big landings and explosions (off with reduced shake)
- [ ] Jump and dash respond on the frame they're pressed; coyote time and jump buffer

**Audio**
- [ ] SFX and music through `audio.js`, following the Settings sliders

**Screens and flow**
- [ ] Title, pause (Resume / Restart / Settings / Quit to title), game over with best and retry
- [ ] Auto-pause via `input.onPause`; no F10 / Start+Select / held-Esc binding
- [ ] Every menu on `menu.js`, including the part choice
- [ ] Settings from title and pause
- [ ] Saves under `overclock-save-v1`

**Accessibility**
- [ ] Telegraphs readable by shape and motion, not only colour; reduced shake honoured; text scaled by `textScale`

**Scaling and inputs**
- [ ] `fitCanvas` integer scaling, letterbox `#141a38`; manifest `tags` + `inputs`

**Under the hood**
- [ ] `TUNING`, clamped `dt`, `?debug` overlay, runtime files unedited, 60 fps, `npm run check` green

## Open questions / assumptions
- Co-op: entity code keyed by player; camera frames all players; boss targets the nearest player. Not built in phase 1.
- Power budget left out of phase 1 (one part per slot is the only limit).
- Art pipeline: `npm run art -- overclock <id> --force` regenerates a sheet (costs money; the processed copies in `assets/art/` were removed to keep the repo small, so a plain `npm run art` would regenerate all six). The slicer and anchor tools are kept outside the repo; the sliced atlases plus `anchors` (origin, helmet, feet, back, chest, muzzle per frame) are in `assets/sprites/*.json`.

**Known gaps (phase 1):** arm parts only show while firing (the generated frames don't hold the cannon in one place); Talon's leaps ignore inner walls in Crane Tower; touch and mouse play only the menus; no meta unlocks yet.

## Changelog
- 0.1.0: Phase 1 prototype: Rivet vs Talon over three arenas (Foundry Floor, Furnace Pit, Crane Tower), five Talon attacks unlocked over loops plus a phase 2, 12 visible parts, pick 1 of 3 after each win, generated pixel art, chiptune loop and SFX.
