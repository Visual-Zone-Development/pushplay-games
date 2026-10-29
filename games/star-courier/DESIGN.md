# Star Courier: design brief

> Pilot a tiny courier ship through an asteroid field, grabbing parcels before the 60-second clock runs out.

*Status: shipped · Version: 1.2.1*

This is the sample game. It is also a worked example of the brief every game gets: see [`docs/game-design/`](../../docs/game-design/).

## Fun targets
- **Primary:** Challenge. Weave through drifting rocks under time pressure; a rock hit costs 5 seconds, so mistakes hurt but don't end the run.
- **Secondary:** Sensation. A floaty-but-responsive ship with momentum, a boost on A, spark bursts on pickups and hits.

## Core loop
- **Moment-to-moment (seconds):** steer → thread between rocks → grab a parcel (spark burst) → score +1, a new parcel spawns elsewhere
- **Round (60 s):** collect as many as possible → every 4th parcel adds a rock → clock hits zero → tally
- **Meta (across sessions):** beat your saved best score

## The 8 formal elements
| Element | This game |
|---|---|
| Players | 1, against the clock |
| Objectives | Deliver as many parcels as possible in 60 seconds |
| Procedures | Stick moves the ship with momentum; hold A (or RT) to boost; Start pauses |
| Rules | Touching a parcel collects it; touching a rock costs 5 seconds and knocks you back, with brief invulnerability |
| Resources | Time (the main resource, spent by both the clock and collisions); parcels collected |
| Conflict | Drifting asteroids that increase as you score; the clock |
| Boundaries | One 1280×800 screen; the ship is clamped to the edges; rocks drift in from off-screen |
| Outcome | Score at time-out, compared with the saved best |

## Controls
| Input | Action |
|---|---|
| Left stick / d-pad | Fly |
| A / RT (hold) | Boost |
| A | Start / play again |
| Start / Esc / on-screen ‖ button | Pause (Resume, Restart, Settings, Quit to title) |
| Mouse / touch | Hold to fly towards the pointer; menus by click or tap |

## Inspirations
| Game | Borrow | Change / avoid |
|---|---|---|
| Asteroids | Floaty inertia, drifting rocks | No shooting; rocks are obstacles, not targets |
| Crazy Taxi | Pick up and deliver against the clock | No map or destinations; pickups appear on-screen |
| Geometry Wars | One-screen arena, rising density | Far calmer visuals; capped particles for the Deck |

## Art direction
- **Style:** Lit vector (the art-direction skill's *Look recipes*); full rules in [STYLE.md](STYLE.md)
- **Style contract** (summary of STYLE.md): Top-down space, one light from the upper left. Every object has three tones (base, a cool blue-ish shade toward the lower right, a warm highlight toward the upper left), a dark ink edge (`#070a18`) so it separates from the nebula, and a thin cool rim light from behind. The ship is the only cyan thing; parcels are the only amber things and glow; rocks are desaturated violet-grey. The backdrop (nebula, dust, far stars, a hazy ringed planet) is the darkest, least saturated layer, with a vignette. No text or logos on objects.
- **Palette:** `#0b1024` space, `#5cc8ff` ship (hero), `#ffb547` parcels/accent, `#ff7a6b` danger, `#6d6a80` rock, `#eef0f5` text, `#070a18` ink edge
- **Font:** Lilita One (titles), Rubik 700 (HUD and menus), bundled in `assets/fonts/`
- **Rendering:** 2D canvas. `art.js` draws everything; the game bakes sprites once at 2–3× and blits them. Rocks turn but their light doesn't (shading is drawn unrotated, clipped to the outline).
- **Assets:** procedural, plus the three OFL fonts
- **Cover / hero:** `art/cover.html` and `art/hero.html` call the same `art.js`, so they always match the game. `art/gallery.html` is the contact sheet (`npm run art:shots star-courier`).

## Audio
- **SFX:** none yet
- **Music:** none yet

## Scope
**v1 must-haves**
- Ship movement with momentum and boost; parcels; rocks; 60-second timer; saved best; title, pause and game over

**Stretch**
- WebAudio SFX and a music loop
- Difficulty that ramps rock speed over the round, not just count
- Unlockable ships, a daily seed, combo bonus for quick consecutive pickups

## Definition of done
- [x] Onboarding: the title screen explains the goal; controls are learnable in seconds
- [x] Clear goal and score to beat (saved best)
- [x] Difficulty curve: rocks increase every 4 parcels
- [x] Retry in one press from game over
- [ ] Progression or variety beyond the best score
- [x] Visual feedback on pickups and hits
- [x] Audio: SFX (pickup, hit, time-out) with volume settings; no music yet
- [x] Title, pause, game over screens
- [x] Settings screen (volumes, reduced shake, text size), from title and pause
- [x] `TUNING` object, `?debug` overlay, `window.__game` hooks
- [x] Text ≥ 24px, steady 60fps

## Open questions / assumptions
- Kept deliberately small as the template's sample. The unchecked items are good first tasks for `improve-game`.

## Changelog
- 1.2.1: A rock hit that ends the round no longer leaves the game-over screen shaking.
- 1.2.0: Art pass: lit, inked sprites from `art.js` (ship, rocks, parcels), nebula backdrop with a planet, glow and exhaust, bundled fonts; cover and hero drawn by the game's own art code.
- 1.1.0: Runtime v2: settings screen, sound effects, auto-pause, mouse and touch flight, input-aware prompts, versioned save.
- 1.0.0: First version.
