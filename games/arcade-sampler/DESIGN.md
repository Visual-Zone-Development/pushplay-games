# Arcade Sampler: design brief

> Twelve tiny, complete games in one arcade cabinet, each a different genre in a different art style: a sampler of what you can make with this kit, and a quick fix of fun.

*Status: shipped · Version: 1.3.0*

## Kickoff
| Topic | Answer |
|---|---|
| Concept / genre | A hub of six short games: arcade (Star Courier), platformer, merge puzzle, card tactics, pixel-art adventure room, twin-stick arena |
| 2D or 3D | 2D canvas, plain HTML (no build step), so every game is easy to read and copy |
| Art style | Each game its own preset (lit vector, flat bold, paper and pastel, parchment board game, pixel art, neon), inside one shared cabinet frame |
| Players | Solo everywhere; the twin-stick arena adds 2-player co-op with a second controller |
| Feel | *(assumed)* Quick and satisfying: every game teaches itself in 10 s and is juicy |
| Camera / view | *(assumed)* One fixed screen per game (no scrolling), so each stays small |
| Session and structure | *(assumed)* Each game is a 60–120 s round or a short complete challenge, with best score and bronze/silver/gold medals; the hub shows your medals |
| Like which game? | *(assumed)* Clubhouse Games, WarioWare's variety, arcade compilation cabinets |
| Audience and difficulty | Everyone; medals give a goal for experts |
| Assets | Procedural, drawn in code (that's the point: no asset files needed) |
| Sound and music | Generated SFX and a small loop per game |
| Progression | Medals per game; a gold on every game lights up the cabinet |

## Fun targets
- **Primary: Variety (Discovery).** Six different verbs and looks within minutes.
- **Secondary: Challenge.** Medals and best scores per game give a reason to replay.
- **Tertiary: Sensation.** Each game gets its genre's juice: jump squash, combo pops, card flips, screen shake.

## The games
| Game | Genre and verb | Style | Shows (skills) | Score / medals |
|---|---|---|---|---|
| **Star Courier** | arcade: thrust, boost, grab parcels, dodge rocks, 60 s | lit vector | the starter conventions, code-drawn art | parcels |
| **Hop Garden** | one-screen platformer: run, jump (coyote time, buffering), collect seeds, avoid beetles, reach the flower | flat bold vector | game-feel, level-design, physics-feel | seeds + time bonus |
| **Merge Jars** | merge puzzle: slide jars on a 4×4 grid, equal jars merge and grow | paper and pastel | puzzle loop, combos, juice | highest jar + points |
| **Tiny Tactics** | turn-based tactics duel on a 6×6 board, three units each vs a CPU | parchment board game | turns, enemy-ai, readable UI | win + units left |
| **Keyhole** | pixel-art adventure room: walk 8 ways, talk to the keeper, find the key, open the door, three rooms | pixel art (integer scaled) | pixel-art, dialogue, environments | rooms cleared + time |
| **Neon Ring** | twin-stick arena: move and aim, dash, survive waves, 1–2 players co-op | neon glow | enemy-ai, game-feel, local-multiplayer | waves + kills |
| **Rooftop Run** | one-button endless runner: jump gaps and chimneys at rising speed, fair procedural gaps | dusk silhouettes, parallax | game-feel, level-design (fair generation) | metres + stars |
| **Letter Drop** | word game: chain falling letter tiles into words (no typing), 21k-word offline dictionary | newspaper puzzle, wooden tiles | game-ui, grid input on every device | letter values × length × combo |
| **Tiny Towers** | tower defense: 3 towers with upgrades, 5 waves and a boss | toy diorama | level-design (waves), enemy-ai (paths), build menus | kills + lives + win |
| **Mini Putt** | mini golf: aim, power swing or slingshot drag, 6 holes (banks, slope, windmill, pond, bumpers) | felt and wood toy course | physics-feel (swept collisions, bounce, cup capture) | strokes under par+3 |
| **Sunset Drift** | pseudo-3D racer: 3 laps vs 5 CPU rivals; hold drift through curves to charge a boost, let go to fire it | synthwave (striped sun, magenta grid, neon palms) | camera (segment-projected road, hills, parallax), physics-feel (centrifugal pull, drift), enemy-ai (racing line, avoidance, rubber band) | place + drifts + passes |
| **Lazy Lake** | cozy fishing: cast, hook in time, keep the line's tension in the zone; 4 species, a saved catalogue; dusk falls over the round | golden-hour lake | a tension mechanic, ambient environments, time of day | fish points |

## Core loop
- **Hub:** pick a cabinet → a short ready screen (how to play, with live input prompts) → play → results (score, best, medal) → again or back to the hub.
- **Meta:** medals per game; the hub shows them on each cabinet, and gold on all six lights the marquee.

## Controls
Every game plays with controller, keyboard, mouse and touch; menus are menu.js. Per game:
| Game | Stick / keys | `a` | `b` | Mouse / touch |
|---|---|---|---|---|
| Star Courier | thrust | boost | | hold to steer toward, tap boost button |
| Hop Garden | run | jump (hold = higher) | | on-screen ◀ ▶ and jump buttons |
| Merge Jars | slide (d-pad / stick flick) | | undo once | swipe |
| Tiny Tactics | move cursor | select / act | back | tap tiles |
| Keyhole | walk | talk / use | | tap to walk there, tap NPC to talk |
| Neon Ring | move; right stick (or mouse) aims | dash | | drag to move, auto-aim at the nearest |
| Sunset Drift | steer (down / `lt` brakes) | hold to drift, let go to boost (`x`, `rt` too) | brake | mouse: point to steer, hold the button to drift; touch: drag to steer, hold the DRIFT button |

`menu` pauses everywhere (Resume, Restart, Settings, Back to the hub, Quit to title). Second player in Neon Ring: a second pad presses `a` to join.

## Structure (code)
- `game.js`: hub, menus, flow, saves, medals, the cabinet frame.
- `games/<id>.js`: one module per game, `{ id, name, blurb, style, medals, howTo(input), create(env) → { update(dt), draw(ctx), score, done, stats(), prompts(input) } }`, with each game's numbers in its own `TUNING` section.
- `games/star-courier/`: Star Courier's original `art.js`, moved in.

## Definition of done
- [x] Six games, each complete: onboarding by doing, a ramp, sound, best score, medals
- [x] Hub with medals; results screen; retry in one press
- [x] Every input works in menus and gameplay (2P for Neon Ring)
- [x] Settings (volumes, reduced shake, text size) honoured by every game
- [x] Cover and hero art drawn by the games' own code
- [x] 60 fps on the Deck

## Medals and balance (from headless bots; check against real play)
- Star Courier [15, 25, 35] parcels: first guess, not simulated.
- Hop Garden [300, 700, 1200]: a route-knowing bot clears a stage in 5–10 s; a casual player ~3 stages (bronze), a good one into lap 2 (gold).
- Merge Jars [800, 2000, 3500]: 400 bot games each: random ≈ bronze, greedy bronze–silver, a corner strategy ≈ silver–gold.
- Tiny Tactics [400, 900, 1400]: 1500 strong-bot runs vs the CPU: bronze 68 %, silver 36 %, gold 11 %.
- Keyhole [400, 950, 1250]: the slimes are now required (+50 each); a tap bot cleared everything for 1319.
- Rooftop Run [350, 800, 1500]: timing-noise bots (σ 0.15 → 0.07 s) score ≈ 475 → 1620.
- Letter Drop [2000, 4500, 8000]: casual bot ≈ 2400, good ≈ 9200 (it searches perfectly, so gold sits below it).
- Tiny Towers [800, 2200, 3000]: a basic arrow layout ≈ bronze, mixed builds ≈ silver, gold needs the boss to die.
- Mini Putt [1000, 1600, 2200]: sloppy bot ≈ 1100, careless ≈ 2000, careful ≈ 3000.
- Lazy Lake [500, 950, 1450]: casual bot median 585, good 1405.
- Sunset Drift [1000, 2400, 3300]: a no-drift bot that brakes for hairpins finishes 3rd ≈ 1075; drifting only the hard curves wins ≈ 2970; drifting every curve ≈ 3350.
- Neon Ring [1500, 4000, 7000]: bronze ≈ reaching the first boss, silver ≈ wave 8, gold ≈ beating wave 10.

## Known gaps
- Controller play was tested through the keyboard path (same code); Neon Ring touch and its victory ending were only exercised by the node bot.
- Mouse-only Hop Garden can hold one on-screen button at a time (keyboard and touch are fine).
- Each game exposes a small debug hook (`run.debug` / `run._dbg` / `run.sim`) used by its test scripts.

## Changelog
- 1.3.1: Build kit v5. Inside the launcher the pause menu ends with **Quit to library** (added by `menu.js`), so players can always find their way back to their games.
- 1.3.0: A twelfth game, Sunset Drift: a pseudo-3D racer drawn in plain canvas (a road of projected segments with curves, hills and fog), three laps against five rivals, drifts that charge a boost, and a synthwave look. The hall's 4×3 grid is full; it joins the cover in the middle of the fan.
- 1.2.0: Five more games (Rooftop Run, Letter Drop, Tiny Towers, Mini Putt, Lazy Lake); the hall is a 4×3 grid and the cover features seven of the eleven.
- 1.1.0: From playtest feedback. Tiny Tactics makes each step of a turn clear: a ① Unit → ② Move → ③ Act indicator with one plain instruction, an action menu after moving (Attack / Heal / Wait / Undo move), target picking with a damage preview, acted units dimmed with a ✓, "Your turn" / "Enemy turn" banners, and first-battle tips. Keyhole gives you a sword (from the keeper) with a pixel slash animation (`x`, or `b`; tap a slime with mouse or touch), slimes have 2 HP, hit flash, knockback and a death poof, chase when near, and room 3's door stays sealed until all three are beaten.
- 1.0.0: First version: six games (Star Courier moved in from its own folder), the cabinet hall with medals, ready countdown, results, cover and banner drawn by the games' own icons.
