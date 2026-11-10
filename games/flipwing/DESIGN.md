# Flipwing: design brief

> Slide your thumb to weave a tiny starship through an asteroid stream, and tap to flip its colour so it slips through matching energy gates. How far can you get?

*Status: shipped · Version: 1.0.0*

## Kickoff
Answers from the kickoff interview ([kickoff.md](../../docs/game-design/kickoff.md)). Mark anything you decided yourself as *(assumed)*.

| Topic | Answer |
|---|---|
| Concept / genre | Endless vertical dodger (replaces Pulse Rocket). Steer left/right to avoid rocks; second mechanic: **colour switch gates**. Tap flips the ship cyan ⇄ magenta, gates only let the matching colour through |
| 2D or 3D | 2D canvas |
| Art style | Neon vector: glowing outlines on deep space, cyan/magenta ship and gates, orange rocks |
| Players | Solo |
| Devices | Phone portrait 720×1280 (`fill: true`), one hand. Earns Phone, Handheld & controller, Desktop (keyboard + mouse) |
| Feel | Tense, one-more-try |
| Camera / view | Fixed top-down, world scrolls down past the ship *(assumed)* |
| Session and structure | Endless runs of 1–4 minutes, score from distance, gates and stardust |
| Like which game? | *(assumed)* Color Switch, Race the Sun / endless dodgers, Pulse Rocket (what it replaces) |
| Audience and difficulty | Anyone can pick it up; the speed ramp makes it a challenge *(assumed)* |
| Assets | None, everything drawn in code *(assumed)* |
| Sound and music | Synthwave loop whose tempo follows the run's speed; zappy flip and gate sounds |
| Progression | Best score and best distance, plus ship colour pairs unlocked at best-score milestones |

## Fun targets
- **Primary:** Challenge. Speed climbs, gates arrive faster and mix with rocks; each death is your own mistake, and a better run is one tap away.
- **Secondary:** Sensation. Neon trails, a speed-streak starfield, a pop and flash on each gate, a chunky explosion on death, music that speeds up with you.

## Core loop
- **Moment-to-moment (seconds):** slide to dodge a rock → read the next gate's colour → flip (or steer into the matching half) → gate bursts, points, sound
- **Round (minutes):** survive as the speed rises and new gate types appear every ~30 s; flip late for the multiplier; die → score, best, retry in one press
- **Meta (across sessions):** beat your best; unlock new ship colour pairs at 1 500 / 4 000 / 8 000 / 15 000 points

## The 8 formal elements
| Element | This game |
|---|---|
| Players | One |
| Objectives | Travel as far as possible and score as high as possible |
| Procedures | Slide (or stick / arrows) to move sideways; tap (or A / Space) to flip colour |
| Rules | Touching a rock ends the run. Crossing a gate segment of the other colour ends the run. Matching segments give points; a flip in the last 0.25 s before a gate (plus a 0.07 s grace after reaching it) is a **Late flip** and raises the multiplier (×1 → ×5) which drops a step after 6 s without one. Stardust gives points |
| Resources | The ship's colour (two states), the multiplier, position |
| Conflict | Rocks and gates, speeding up; gates and rocks combine so the safe lane and the right colour must both be chosen |
| Boundaries | A 720-wide column; the ship can't leave it |
| Outcome | Score and distance; best kept |

## Controls
| Input | Action |
|---|---|
| Left stick / d-pad (`x`) | Move left / right |
| `a` | Flip colour |
| `b` / `x` / `y` | Flip colour too (any face button works) |
| `menu` (Start / Esc / on-screen button) | Pause |

- **Inputs:** gamepad, keyboard, mouse, touch, all playable.
- **Touch scheme:** one thumb anywhere on the screen. The ship moves by how far the thumb slides (relative, 1.3× gain), so the thumb never covers it; a short touch (< 0.22 s, < 14 px of movement) is a flip. Mouse works the same: drag to steer, click to flip. No on-screen stick.
- **Players:** 1

## Inspirations
| Game | Borrow | Change / avoid |
|---|---|---|
| Color Switch | Match-your-colour gates as the core test | Avoid its tap-to-jump physics; ours is free steering, and colour is one of two choices per gate |
| Endless dodgers (Race the Sun, Pulse Rocket) | Speed ramp, distance score, instant retry | Not flappy movement; steering is direct and precise |
| Twist | Gates split into colour lanes, so every gate can be solved by steering *or* flipping, and rocks make you pick which | |

## Art direction
- **Style:** Neon vector
- **Palette:** `#070B1A` background, `#3CF2FF` cyan, `#FF4FD8` magenta, `#FFB13C` danger (rocks), `#EEF4FF` text
- **Shape coding:** colour A is also marked by circles (ship core, gate dots), colour B by triangles, so colour isn't the only cue
- **Font:** system-ui in game; Chakra Petch for the cover
- **Rendering:** 2D canvas, additive glow drawn with layered strokes (no `shadowBlur`)
- **Assets:** procedural
- **Cover idea:** the ship mid-flip, half cyan half magenta, bursting through a split gate, title big at the top
- **Hero idea:** ship streaking up-right through gates and rocks on the right half; calm starfield bottom-left

## Audio
- **SFX:** flip (rising/falling zap by colour), gate pass (bright chord, higher with multiplier), late flip (sparkle), stardust (tick), death (noise + falling tone)
- **Music:** synthwave bass + arpeggio sequenced with `audio.tone` on the music bus, tempo 110 → 150 BPM with speed

## Scope
**v1 must-haves**
- Steering + flipping on every input; rocks, full gates, split gates (2 and 3 lanes), drifting rocks, double gates, swapping gates, ramp
- Score, multiplier with late flips, stardust, distance; best saved
- Title with ship colour picker, pause, settings (+ vibration toggle), game over with one-press retry and unlock notice
- Music + SFX, juice, reduced shake

**Stretch**
- Daily seeded run, achievements, shield power-up

## Definition of done
**Play**
- [ ] First gate teaches the flip by doing (`${input.label('a')} to flip` hint while the wrong colour approaches)
- [ ] New threat every ~30 s: split gates (30 s), drifting rocks (60 s), 3-lane gates (90 s), swapping gates (120 s), double gates (150 s)
- [ ] Fair: spacing between threats never under the reaction time at the current speed; nothing spawns inside the thumb area unseen
- [ ] Retry in one press; best score; ship colour unlocks

**Feel**
- [ ] Ship banks with movement, trail in its colour, flip burst, gate shatter particles, death explosion with brief slow-mo, shake skipped with reduced shake; vibration on death (toggle)

**Audio**
- [ ] SFX and music through `audio.js`, following the Settings sliders; unlocks on first input

**Screens and flow**
- [ ] Title, pause (Resume / Restart / Settings / Quit to title), game over with one-press retry
- [ ] Auto-pause via `input.onPause`; no forbidden bindings
- [ ] Every menu on `menu.js`; Settings from title and pause
- [ ] Saves via `save.js` under `flipwing-save-v1`, saved on pause and `onPause`
- [ ] Cursor hidden only during gameplay; `state.screen` + `window.__game` exposed

**Accessibility**
- [ ] Colour + shape coding, no mashing, reduced shake honoured, text ≥ 32 px scaled by `textScale`, prompts from `input.label`

**Scaling and inputs**
- [ ] `fitCanvas` with `fill`, difficulty inside 720 wide; manifest `tags`, `inputs`, `phone.orientation`; phone pass green

**Under the hood**
- [ ] `TUNING`, clamped `dt`, `?debug` overlay, runtime files unedited, 60 fps, `npm run check` green

## Open questions / assumptions
- Reference games, audience, assets and camera were chosen by me (marked *assumed*).
- The check warns that a phone game usually imports `touch.js`; Flipwing doesn't on purpose: one thumb slides anywhere (relative steering) and taps to flip, so an on-screen stick would only get in the way.
- Home screen picked from mockups: variant A, "Gate burst" (the ship flips colour as it bursts through a split gate, two-tone title).
- Balance from a headless bot (3 × 3 min): it survived 80–180 s and died only to rocks, never to an unfair gate. Its scores (13–29k by 80–145 s) led to the 0.25 s late window and the unlock thresholds above.

## Changelog
- 1.0.0: First version.
