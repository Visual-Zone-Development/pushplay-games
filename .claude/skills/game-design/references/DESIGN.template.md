# <Game Name>: design brief

> One-line pitch: what you do and why it's fun.

*Status: draft / approved / shipped · Version: 1.0.0*

## Kickoff
Answers from the kickoff interview (kickoff.md in the `game-design` skill). Mark anything you decided yourself as *(assumed)*.

| Topic | Answer |
|---|---|
| Concept / genre | |
| 2D or 3D | |
| Art style | |
| Players | <solo / local 2–4 / online 2–N / party with phones> |
| Platform and devices | <where it runs and what it's played on: handheld / PC / tablet / phone portrait or landscape / TV with phones; the logical resolution; the inputs gameplay supports> |
| Feel | |
| Camera / view | |
| Session and structure | |
| Like which game? | |
| Audience and difficulty | |
| Assets | |
| Sound and music | |
| Progression | |

## Fun targets
- **Primary:** <kind of fun>. <How the game delivers it, in one line.>
- **Secondary:** <kind of fun>. <How.>

See framework.md in the `game-design` skill. Each target must map to a mechanic or feedback below.

## Core loop
- **Moment-to-moment (seconds):** <verb> → <challenge> → <reward> → <growth>
- **Round (minutes):** …
- **Meta (across sessions):** …

## The 8 formal elements
| Element | This game |
|---|---|
| Players | |
| Objectives | |
| Procedures | |
| Rules | |
| Resources | |
| Conflict | |
| Boundaries | |
| Outcome | |

## Controls
List the game's actions by input. Keyboard, mouse and touch equivalents follow the project's input layer.

| Input | Action |
|---|---|
| Left stick / d-pad | |
| A | |
| B | <gameplay action, or "back" in menus only> |
| X / Y | |
| LB / RB | |
| LT / RT | |
| Right stick | |
| Start / Esc / on-screen button | Pause |

- **Inputs:** controller, keyboard, mouse, touch. <Which of mouse / touch cover gameplay? If not, what does the title screen say?>
- **Touch scheme** (phone games): <virtual stick + buttons / tap-to-move / swipe / drag; one-handed or two; what each touch verb is on a controller>
- **Players:** <1 / 2–4 local, one controller each, join by press>

## Inspirations
| Game | Borrow | Change / avoid |
|---|---|---|
| | | |

## Art direction
- **Style:** <preset from art-directions.md, or custom>
- **Palette:** `#……` background, `#……` hero, `#……` accent, `#……` danger, `#……` text
- **Font:** <bundled font for art, and in-game>
- **Rendering:** 2D canvas / three.js
- **Online:** no / yes: <who runs the game and how it stays in sync>
- **Assets:** procedural / user-supplied (`assets/`, credits in `assets/CREDITS.md`) / CC0
- **Key art idea** (cover, banner): …

## Audio
- **SFX:** …
- **Music:** …

## Scope
**v1 must-haves**
- …

**Stretch**
- …

## Definition of done
Tailored from definition-of-done.md in the `game-design` skill. Keep the fixed items; add the game's own under *Play* and *Feel*.

**Play**
- [ ] Onboarding by doing (prompts from the game's input-prompt helper), clear goal, ending or score to beat, difficulty curve, fair failure, retry in one press, progression or variety
- [ ] <game-specific>

**Feel**
- [ ] Feedback for every action; juice on the big moments; rumble where available
- [ ] <game-specific>

**Audio**
- [ ] SFX and music through the game's audio layer, following the Settings sliders; nothing assumes sound before the first input

**Screens and flow**
- [ ] Title (a menu that starts the game, best score), pause with Resume / Restart / Settings / Quit to title, game over with one-press retry
- [ ] Auto-pause when the game loses focus or the page is hidden; fully frozen while paused
- [ ] Every menu works with controller, keyboard, mouse and touch
- [ ] Settings from title and pause: master / music / SFX, reduced shake, text size <+ game items>
- [ ] Saves: best score, unlocks, progress; saved on every change that matters and on pause
- [ ] Cursor hidden only during gameplay

**Accessibility**
- [ ] Colorblind-safe, no mashing, reduced shake honoured, text ≥ 24px scaled by the text-size setting, no hard-coded button names

**Scaling and inputs**
- [ ] Scales to any window (letterbox colour, DPR ≤ 2, integer scaling for pixel art); right at the logical resolution, at DPR 2, in a window of another shape and in small windows
- [ ] Verified with each input alone (controller, keyboard only, mouse only, touch) on the target devices
- [ ] Phone games only: HUD and tap targets inside the safe area and out of the thumb zones; text ≥ 32px; on-screen controls hidden with a controller; a hidden page pauses

**Under the hood**
- [ ] `TUNING`, clamped `dt`, `?debug` overlay, 60fps, nothing shipped but the game, the project's checks green

## Open questions / assumptions
- …

## Changelog
- 1.0.0: First version.
