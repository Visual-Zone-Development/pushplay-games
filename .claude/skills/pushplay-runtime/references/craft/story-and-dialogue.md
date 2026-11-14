# story-and-dialogue in a PushPlay game

The general `story-and-dialogue` skill covers the story bible, the premise and the beats between levels. This page gives the PushPlay side: the box that shows a beat. AGENTS.md *Controls*, *Input hints*, *Saves* and *Settings* are the rules. For conversations with choices, see [dialogue.md](dialogue.md).

## Input

- `a` (or a tap or click) finishes the line instantly, then advances. Draw the prompt with `drawPrompts(ctx, input, [['a', 'Next']])`.
- `b` skips the whole beat; show it with a prompt. For mouse and touch, draw a ≥ 56×56 px on-screen Skip button.
- `menu` still pauses, and the beat resumes where it was.

## Settings

- A line is readable in **3 seconds**: about 60 characters at most, 2 lines per box, ≥ 28 px × `settings.data.textScale`.

## Saves

- Remember in `save.data` which beats were seen, so repeat runs skip them automatically. If the story matters, add a "Replay story" item to a menu.

## Audio

- Type the text on quickly (30–60 chars/s) with a soft blip every few letters through `audio.tone` (see [game-audio.md](game-audio.md)).

## Screen and scaling

- The dialogue box sits at the bottom of the screen, ≥ 32 px from the edges, as a panel in the game's palette.
- Read every beat on the 1280×800 screenshot: does it fit, at the largest `textScale` too?
