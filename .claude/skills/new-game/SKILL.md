---
name: new-game
description: Create a new game in this repo that plays on a Steam Deck or Legion Go through the PushPlay launcher, and on PCs with keyboard, mouse or touch. It interviews the user about the idea, writes a design brief, then builds the game and its cover and hero art. Use whenever the user asks to make, prototype or add a game.
---

# New game

Follow AGENTS.md; this is the step-by-step version. Design material lives in `docs/game-design/`: read [framework.md](../../../docs/game-design/framework.md) and [complete-game.md](../../../docs/game-design/complete-game.md) before designing, and the others as needed.

The aim is a **complete, fun game**, not a tech demo: design first, then build in milestones.

## 1. Understand the request
List what the request already settles (genre, theme, 2D/3D, style, players, feel, reference games) and **never ask about those**.
- **"Surprise me" / "just make something":** skip the interview. Pick a strong concept yourself (genre + twist + theme, see [genres.md](../../../docs/game-design/genres.md)), record your assumptions in DESIGN.md, and go to step 3.

## 2. Interview (adaptive)
Use `AskUserQuestion` (otherwise ask in chat). Tailor every option to this idea and put your recommendation first, marked "(Recommended)". Give 2–4 options per question; the user can always type their own. **Use plain language**: "how should it feel?", not "pick an MDA aesthetic". Map the answers to the frameworks yourself.

- **Vague request** ("make a fun game", "something with a frog"): don't ask abstract questions. Pitch **3 distinct concepts** as options, each *familiar genre + one twist + theme* and each aimed at a different feel. Use `preview` to show the core loop, controls, and the game it riffs on. The user picks one, mixes them (Other), or asks for more. Then continue with whatever round 1 and 2 questions are still open.
- **Round 1** (only the unanswered ones, max 4):
  - **Gameplay**: genre or loop options that fit the idea.
  - **2D or 3D**: 2D canvas (Recommended unless the idea needs depth) vs 3D three.js.
  - **Look**: presets from [art-directions.md](../../../docs/game-design/art-directions.md), with the palette and mood in `preview`.
  - **Assets**: none (draw it in code) / "I have files" (then ask for the folder path) / find free CC0 assets.
- **Round 2** (only if still unclear):
  - **Feel** (multiSelect, up to 2): e.g. "Tense, one-more-try" / "Crunchy and explosive" / "Calm and cozy" / "Clever aha moments" / "Exploring and secrets" / "Laughing with friends".
  - **Like which game?**: suggest 2–3 references; Other for their own.
  - **Players**: solo / local 2–4 on one Deck / online 2–N across Decks (see [multiplayer.md](../../../docs/game-design/multiplayer.md) for what plays well online).
  - **Session**: quick 2–5 min runs / 10–15 min levels / long game with saves.

Two rounds maximum. Fill any remaining gaps with sensible defaults and list them as assumptions.

## 3. Research inspiration
Follow [inspiration.md](../../../docs/game-design/inspiration.md): 2–3 reference games (any the user named first). Use a few web searches if available, otherwise the offline canon. Record borrow / change / avoid for each, and state the twist that makes this game its own. Keep it quick.

## 4. Write the brief and get approval
Pick a short, catchy name and a `kebab-case` id. Then:
1. `npm run setup` if `node_modules/` is missing.
2. `npm run new-game <id> --name "<Name>"`, adding `--vite` for 3D or npm packages, and `--online --players <min>-<max>` for online multiplayer. The starter already has title, pause and settings screens that work on every input; keep them and build the game around them. The runtime files it copies (`input.js`, `menu.js`, `fit.js`, `audio.js`, `save.js`, `settings.js`, `prompts.js`, plus `net.js` and `lobby.js` for `--online`) are never edited.
3. Copy [DESIGN.template.md](../../../docs/game-design/DESIGN.template.md) to `games/<id>/DESIGN.md` and fill it in:
   - Every one of the 8 formal elements is decided.
   - Each fun target maps to concrete mechanics and juice.
   - Scope is split into v1 and stretch (v1 = one sitting; cut to ≤ 3 core systems).
   - The **Definition of done** is tailored from complete-game.md.

Show a compact summary (pitch, feel, loop, controls, look, v1 scope, assumptions) and ask **Build it / Change something** with `AskUserQuestion`. This is the only gate: after approval, work autonomously to the end.

## 5. Build in milestones
Run `npm run check <id>` after each milestone and fix every ✗.

1. **Core loop.**
   - Put all gameplay numbers in a `TUNING` object at the top of `game.js` (`src/game.js` for `--vite`).
   - Keep the starter's skeleton: `fitCanvas(...)`, `input.attach(canvas, 1280, 800)`, `input.update()` first in the frame, `state.screen` with the names `title | playing | paused | settings | gameover`, `window.__game = { state, TUNING }`, and `input.onPause(...)` switching to `paused`.
   - Add the `?debug` overlay ([debugging.md](../../../docs/game-design/debugging.md)).
   - Map gameplay to buttons from the AGENTS.md table: `b` is a normal action button; `menu` is only pause. Game-specific key aliases via `input.extendKeys`.
   - Get the core verb feeling good: pass the **30-second fun test** in framework.md before adding content.
   - **Online:** read [multiplayer.md](../../../docs/game-design/multiplayer.md) first. The host runs the rules in `hostUpdate()` and writes `net.state`; everyone draws `net.view`. Keep the template's title → lobby → playing flow with `state.screen` exposed; `menu` still opens the `menu.js` pause menu (Resume, Settings, Leave game) but it only stops your controls, since the host keeps the world running. Never edit `net.js` or `lobby.js`.
   - If the user supplied assets, import them per [assets.md](../../../docs/game-design/assets.md). For 3D, follow [3d.md](../../../docs/game-design/3d.md).
2. **Complete game.** Work through the Definition of done: onboarding by doing, difficulty ramp with something new every 30–60s, retry in one press, best score, progression or variety; title / pause (Resume, Restart, Settings, Quit to title) / game-over / settings screens on `menu.js` and `settings.js`; SFX + music through `audio.js` obeying the sliders; `save.js` under `<id>-save-v1`, saved on pause and in `input.onPause`; reduced shake and text size honoured.
3. **Polish.** Add juice aimed at the fun targets: the biggest effects on the biggest moments, with capped particles, all skipped when `reducedShake` is on.

**Self-review** before moving on to art: re-read DESIGN.md and tick off every Definition of done item. Build anything missing, or list it as a known gap.

## 6. Controls, manifest, art
- **Verification matrix.** Run `npm run dev <id>` and do each pass with only that input; every one must pass:

  | Pass | How | Must be true |
  |---|---|---|
  | Controller | pad plugged in, or on the Deck / Legion Go | every screen works; Start pauses; B never quits anything without a menu; prompts show button names |
  | Keyboard only | no pad, hands off the mouse | Enter starts, Esc pauses, Backspace backs, every action reachable; prompts show key names |
  | Mouse only | hands off the keyboard | every menu by click; the on-screen pause button pauses; gameplay too if `inputs` includes `"mouse"`; cursor visible in every menu |
  | Touch | Chrome DevTools → device toolbar with touch emulation | every menu by tap; pause button; prompts say "Tap"; gameplay too if `inputs` includes `"touch"` |
  | Scaling | resize the window to 1920×1080, then device mode at DPR 2 | centred and letterboxed in the game's colour, text crisp, nothing clipped or blurry |
  | `npm run check <id>` | | passes: gamepad, keyboard-only, touch, Start → `__game.state.screen === 'paused'`, 1920×1080 at DPR 2 |

  Also confirm: menus use `menu.js`; pause menu is Resume / Restart / Settings / Quit to title; Settings is reachable from title and pause; no `F10`, Start+Select or held-Esc binding; no hard-coded button names (`input.label`, `drawPrompts`); nothing needs hover, a double-click, a scroll wheel or text entry; `window.__game.state.screen` is exposed.
- **Manifest:**
  - `description`: what you do and why it's fun, 1–3 sentences.
  - `players`, `version`.
  - `tags` (required): 2–5 lowercase genre/style words, reusing tags other games already use; add `online multiplayer` for online games.
  - `inputs` (required): the inputs the whole game is playable with; drop `"mouse"` or `"touch"` only when gameplay genuinely can't, and say so on the title screen.
  - `online` if the game is networked (the `--online` scaffold sets it).
- **Art:**
  - `art/cover.svg`: 720×500, big title, bottom 110px clear.
  - `art/hero.svg`: 1920×450, no text, key visual on the right.
  - Both use DESIGN.md's palette, font and hero object; see art-directions.md.
- **Check and review:** run `npm run check <id>`, then **open the three PNGs it lists**:
  - Does the cover read at thumbnail size?
  - Is the title legible?
  - Does the screenshot show real gameplay or the title?

  Refine and re-run until all three look good.

## 7. Ship
Update DESIGN.md if the design drifted (set Status to shipped, add a Changelog entry). Commit (`Add <Name>`) and push.

Tell the user:
- the name, the pitch and the controls
- what feel the game aims for, and any known gaps
- that it will appear in PushPlay on their Deck or Legion Go once the GitHub Action finishes (a couple of minutes)

Then suggest they play it and come back with feedback, or with "improve <name>". Give 2–3 specific things to notice while playing, e.g. "does minute two get boring?" or "is the dash satisfying?".
