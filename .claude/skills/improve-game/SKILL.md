---
name: improve-game
description: Change or improve an existing game in games/. Covers specific requests ("add a double jump", "make enemies faster", "new palette", "add co-op") and open-ended ones ("make it more fun", "it gets boring", "polish it"). Use whenever the user wants to modify a game that already exists. For crashes and bugs use debug-game.
---

# Improve game

Follow AGENTS.md. Design material lives in `docs/game-design/`.

## 0. Get context, pick a mode
1. Find the game (`games/<id>`). Read `games/<id>/DESIGN.md` and the code relevant to the request.
2. **No DESIGN.md?** Reverse-engineer one from the code, using [DESIGN.template.md](../../../docs/game-design/DESIGN.template.md):
   - infer the fun targets, core loop, 8 elements and controls
   - check it against [complete-game.md](../../../docs/game-design/complete-game.md) to fill in Definition of done, ticking what already exists

   Save it. For a direct change, just mention it to the user; for an open-ended request, confirm it with them as part of the debrief.
3. Pick the mode:
   - **Direct change**: the request names something specific.
   - **Make it better**: the request is open-ended.
   - Something is broken → switch to the `debug-game` skill.

## Direct change
1. **Sanity-check against the design.** If the change would undermine a fun target, break controller or screen rules, or blow the Deck's performance budget, say so in one line and propose the closest version that works. Otherwise don't ask; just do it.
2. **Implement in the existing style.**
   - Numbers go in `TUNING`. If there isn't a `TUNING` object yet, gather the relevant numbers into one as you go.
   - A **new mechanic must meet the same bar as the rest of the game**: an onboarding prompt (`input.label()`), visual and audio feedback, a place in the difficulty ramp, and a free button that isn't Start+Select.
3. **Check neighbouring systems:**
   - pause and restart still reset everything correctly
   - saves: if the save shape changed, bump the key (`-v2`) or migrate
   - local multiplayer, if the game has it
   - title, HUD and help text that mention the old behavior
   - cover and hero art, if the look changed
4. `npm run check <id>`, fix every ✗, and look at the screenshot.
5. **Record it:**
   - bump `version` in `pushplay.json`: patch for tuning or fixes, minor for features or content
   - update DESIGN.md (affected sections plus a Changelog line)
   - commit (`<Name>: <change>`) and push
6. Report what changed and how to try it. Optionally suggest 1–2 related follow-ups, but don't build them unasked.

## Make it better
1. **Look.** Run `npm run check <id>` and view the screenshot. If deeper states matter, use the repro script in [debugging.md](../../../docs/game-design/debugging.md) to capture screenshots at 10s, 60s and so on.
2. **Playtest debrief.** If the user has played it, ask one `AskUserQuestion` round in plain language. Skip anything they already told you.
   - **Why did you stop?** Got bored / too hard / confused / beat it / wanted more.
   - **How long did a session last?** < 2 min / 2–10 min / longer.
   - **Best or worst moment?** Free text via Other; offer guesses as options.

   Map the answers to likely causes:

   | Answer | Look at |
   |---|---|
   | Bored | No ramp or variety; weak core verb (30-second fun test); weak Sensation |
   | Too hard | Difficulty curve, readability, telegraphing, unfair deaths |
   | Confused | Onboarding, goal clarity, feedback |
   | Beat it / wanted more | Progression, meta loop, replay variety, content |
3. **Diagnose.** Audit the game against:
   - its fun targets and the 8 elements ([framework.md](../../../docs/game-design/framework.md)): is each target backed by mechanics?
   - [complete-game.md](../../../docs/game-design/complete-game.md): missing items are usually the biggest, cheapest wins (no retry hook, silent actions, no ramp, no best score)
   - game feel: response time, acceleration, hit-stop, shake, sound
   - the difficulty curve, read from `TUNING` and the spawn and ramp code
   - control rules (controller, keyboard and mouse all work everywhere; menus use `menu.js`), screen rules (24px text, 32px margins) and performance

   If it helps, research how the DESIGN.md reference games, or similar games, solved the same problem ([inspiration.md](../../../docs/game-design/inspiration.md)).
4. **Propose.** Offer 3–5 improvements in one `AskUserQuestion` (multiSelect). Each option gives the problem → the fix, its expected effect on feel, and its size (S/M/L).
   - Mix quick wins (tuning, juice, missing feedback) with one bigger idea: a new mechanic, a mode (daily seed, endless, boss rush, co-op) or a meta loop.
   - Put the fix for the **biggest fun problem** first, marked "(Recommended)", even if it isn't the smallest.
5. **Implement** the chosen items one at a time, using the Direct change steps 2–4 for each.
6. **Record and hand back.**
   - Bump `version`.
   - Update DESIGN.md: tick Definition of done items and add a Changelog entry.
   - Commit and push.
   - Tell the user what changed and **what to watch for in the next playtest**, so the next round of feedback is specific.
