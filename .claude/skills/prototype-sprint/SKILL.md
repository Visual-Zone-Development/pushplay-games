---
name: prototype-sprint
description: Quickly build 2–3 tiny playable prototypes of different directions for one game idea, inside one game with a picker on the title screen, so the user can try them on the target device or in a browser and choose; then grow the winner into the full game and remove the rest. Use for "I'm not sure what I want", "try a few ideas", "prototype some options", "which version is more fun?", or when the kickoff interview leaves two strong directions.
---

# Prototype sprint

Follow the project's own rules first (its `AGENTS.md` or platform guide): they decide the APIs, how a game is started, the checks and how to finish a change. Prototypes answer **one question each: is this core verb fun?** They skip content, progression and polish, but they still follow the project's rules for a playable build (title, pause, settings), because the user has to be able to play them.

## 1. Pick the directions
From the request or the kickoff interview ([kickoff.md](../game-design/references/kickoff.md)), choose 2–3 directions that differ in **core verb or feel**, not just theme (e.g. "dodge" vs. "shoot" vs. "build"). Write one line each: *verb + challenge + the game it riffs on*. Confirm them with the user in one question (with a question tool if you have one), or decide if they said "you pick".

## 2. One game, a picker on the title
1. Start one game the way the project's rules say, named "<Name> Prototypes" (set up for 3D if any direction is 3D).
2. Write a short `DESIGN.md` with *Status: prototype*, the directions, and the question each answers.
3. On the title, the game's menu system lists the prototypes ("A: Dodge", "B: Shoot", "C: Build") plus Settings. Each prototype is a module (`proto-a.js`, …) with `reset()`, `update(dt)` and `draw(ctx)`, sharing one pause, settings, audio and save.
4. Keep each prototype tiny: one screen, the core verb, one challenge that ramps a little, a score or a fail state, a sound per action, quick placeholder shapes in the intended palette. Aim for the **30-second fun test** in [framework.md](../game-design/references/framework.md).
5. Run the project's checks and get the build to the user the way its rules say. Tell the user how to try each one and **what to pay attention to** ("which one did you keep playing?").

## 3. Pick the winner and grow it
When the user has played them, ask one question: which one, and what they liked or missed (or mix two). Then:
1. Remove the losing prototype modules and the picker; the winner becomes the game. Rename the game (its title, and wherever the project records its name) if it had "Prototypes" in it; keep its id unless the user wants a new one.
2. Rewrite DESIGN.md as a full brief (Status: approved) and build the game in milestones through to shipping (the `game-design` skill has the definition of done).
3. Record the sprint in the DESIGN.md Changelog, then run the project's checks and finish the change the way its rules say.
