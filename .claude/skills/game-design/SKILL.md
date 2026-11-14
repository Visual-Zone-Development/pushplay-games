---
name: game-design
description: Design the game in this repo before building it, or decide whether it's finished — a short kickoff interview, fun targets and the 8 formal elements, the genre's core loop, research into the games it should feel like, a design brief (DESIGN.md) the user approves, and a definition of done to build toward. Use for "design a game", "write a design brief", "what should the game be", "kickoff questions", "is this game finished", "it isn't fun and I don't know why", or at the start of any new game.
---

# Game design

Follow the project's own rules first (its `AGENTS.md` or platform guide): they decide the APIs, the screen size, the target devices, the checks and how a game is started and finished. This skill decides **what the game is**, in a brief short enough to read in two minutes, before any code is written. A complete, fun game beats a quick tech demo.

Use it for a new game (all four steps), for a game that has no `DESIGN.md` yet (write one from the code, then ask only what's unclear), and for "is it finished?" or "why isn't it fun?" (steps 2 and 4 as an audit).

## 1. Kickoff interview
Ask the questions in [kickoff.md](references/kickoff.md) in plain language (with a question tool if you have one, otherwise in chat):
- **A few at a time**, at most three rounds, each question with 2–4 options tailored to the idea and **your recommended option first**.
- **Don't re-ask what the request already says.** Recap it instead ("Got it: a 2D frog platformer. A few quick questions…") so the user can correct it.
- Every required topic gets an answer before any code: concept / genre, 2D or 3D, art style, players, target devices and inputs, how it should *feel*, camera / view, session length and structure, and the games it should feel like. Then whatever is still open: audience and difficulty, assets, sound, theme, progression.
- **Only decide for the user when they say "surprise me" or "you decide"**, and record each choice as an *(assumed)* answer.
- For a vague request ("make a fun game"), pitch three concepts, each *familiar genre + one twist + theme*, each aimed at a different feel.

## 2. Turn the answers into a design
Read [framework.md](references/framework.md) and work through it with the answers:
- **Fun targets:** one primary and up to two secondary kinds of fun, mapped from the user's own words ("tense, one more try" → Challenge). Every target needs a mechanic or a piece of feedback behind it, or it isn't a target.
- **The 8 formal elements:** players, objectives, procedures, rules, resources, conflict, boundaries, outcome. Decide each on purpose; a blank one is where the game will feel vague.
- **The core loop** at three timescales (seconds, minutes, across sessions), each as *verb → challenge → reward → growth*. Start from the genre's loop, controls and v1 in [genres.md](references/genres.md): a great small game is often a familiar genre + one twist + a theme.
- **Inspirations:** look at the 2–3 games it should feel like ([inspiration.md](references/inspiration.md)) and write what to borrow and what to change or avoid. Mechanics and feel are fair game; names, art, levels and text are not.
- **Scope:** v1 is the core loop, the definition of done and about ten minutes of fun. More than about three distinct systems means cutting. Everything else is listed as stretch.
- **Assets:** drawn in code, the user's own files or free CC0 packs ([assets.md](references/assets.md) for licences, credits and sizes).

The **30-second fun test** decides the order of building: the core verb alone, in an empty room, has to feel good before goals, enemies or menus go in.

## 3. Write DESIGN.md and get a yes
1. Copy [DESIGN.template.md](references/DESIGN.template.md) to `DESIGN.md` in the game's folder and fill every section: pitch, kickoff table, fun targets, core loop, formal elements, controls, inspirations, art direction, audio, scope, definition of done, assumptions.
2. Show the user a compact summary (pitch, feel, loop, view, controls, look, players, v1 scope, assumptions) and ask **Build it / Change something**. That's the last question: after the yes, build to the end without stopping for more.
3. Set *Status: approved*. From here every change to the game starts by reading `DESIGN.md` and ends by updating it (the Changelog at the bottom, and any section the change touched).

## 4. The finish line
[definition-of-done.md](references/definition-of-done.md) is what separates a complete game from a toy: play (onboarding by doing, a clear goal, a curve, fair failure, one-press retry), feel, audio, screens and flow, accessibility, scaling and inputs. Copy the items that apply into `DESIGN.md`, tailored to the game, when you write the brief; tick them off as they become true; call the game finished only when all are ticked. Asked "is this game finished?", audit against the list and report what's missing, biggest and cheapest win first.

## Who builds what
| Part of the brief | Skill |
|---|---|
| Two strong directions and no way to choose | `prototype-sprint` |
| Levels, waves, the difficulty curve | `level-design` |
| How the core verb feels, juice and impact | `game-feel` |
| HUD, menus, onboarding, results | `game-ui` |
| Sound effects and music | `game-audio` |
| The look of the whole screen, palette, fonts | `art-direction` |
| Is it balanced, where do runs end | `playtest` |

Run the project's checks and finish the change the way its rules say.
