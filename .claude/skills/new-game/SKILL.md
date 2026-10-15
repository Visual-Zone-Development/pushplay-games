---
name: new-game
description: Create a new game in this repo that plays on a Steam Deck through the PushPlay launcher, including its cover and hero art. Use whenever the user asks to make, prototype or add a game.
---

# New game

Follow AGENTS.md; this is the step-by-step version.

1. **Pin down the idea in one line** (genre, core verb, win/lose). If the request is vague, pick something fun and achievable in one sitting rather than asking. Choose a short, catchy name and a `kebab-case` id.
2. `npm run setup` if `node_modules/` is missing.
3. `npm run new-game <id> --name "<Name>"`. Add `--vite` only if you need npm packages.
4. **Build the core loop first.** Get moving, the main action and fail/score working in `game.js`. Then add title, pause (Start) and game-over screens, juice (particles, screen shake, sound with WebAudio), difficulty ramp and a saved best score.
5. **Controller check:** everything works with `input.js` (stick/d-pad, A, B, Start), prompts use `input.label()`, nothing needs a mouse or keyboard text entry, and Start+Select isn't used.
6. **Manifest:** write the `description` (what you do and why it's fun, 1–3 sentences) and set `players`, `version`, `tags` (2–5 lowercase genre/style words; reuse ones other games already use), plus `online` if networked.
7. **Art:** design `art/cover.svg` (720×500, big title, bottom 110px clear) and `art/hero.svg` (1920×450, no text, key visual on the right). Use the game's palette and its hero object, and the bundled fonts listed in AGENTS.md. Aim for something you'd click on in a store.
8. `npm run check <id>`. Fix every ✗. Then **open the three PNGs it lists** and look at them: does the cover read at thumbnail size? Is the title legible? Does the screenshot show real gameplay? Refine and re-run until all three look good.
9. Commit (`Add <Name>`) and push.

Tell the user: the game name and one-line pitch, the controls, and that it will appear in PushPlay on their Deck once the GitHub Action finishes (a couple of minutes).
