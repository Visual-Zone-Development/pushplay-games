# Star Courier: design brief

> Pilot a tiny courier ship through an asteroid field, grabbing parcels before the 60-second clock runs out.

*Status: shipped · Version: 1.1.0*

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
- **Style:** Flat bold vector
- **Palette:** `#0b1024` background, `#5cc8ff` ship, `#ffb547` parcels/accent, `#ff7a6b` danger, `#eef0f5` text
- **Font:** system-ui in game; Rubik/Lilita One style in art
- **Rendering:** 2D canvas
- **Assets:** procedural (no files)
- **Cover idea:** the ship mid-boost with a parcel and rocks, title big at the top
- **Hero idea:** the ship and asteroid field on the right half, calm starfield on the left

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
- 1.1.0: Runtime v2: settings screen, sound effects, auto-pause, mouse and touch flight, input-aware prompts, versioned save.
- 1.0.0: First version.
