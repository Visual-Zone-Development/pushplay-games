---
name: input-walkthrough
description: Check that a game works with every input on its own (Steam Deck and Legion Go controls, a controller on a PC or TV, keyboard only, mouse only, touch, switching devices, auto-pause, window sizes, and a party game's phone screen), across every menu and screen and the gameplay, or one section you name, and report a screen-by-input matrix with screenshots. Use for "does it work on the Deck", "check every input", "test controller / keyboard / touch", or before calling a game finished. It reports; fixes go through debug-game, game-ui or accessibility-audit.
---

# Input walkthrough

Follow AGENTS.md. This is the headless version of its **Verification** matrix: every screen, with each input alone. Many players have only one input (a controller on a handheld, a keyboard, a mouse or a touchscreen), so each **input setup** in [setups/](setups/README.md) is played through on its own, and you get a matrix of what works where and the fixes that matter most.

`<skill-dir>` is the folder this file is in.

## 1. Work out the scope

Get these from the request. Ask only about what you can't infer.

- **Target:** start the game with `npm run dev <id>` (just `npm run dev` in a one-game repo) in the background and wait until `http://localhost:5173/` responds.
- **Section** (optional): one part to check, such as "the settings menu", "the pause menu", "level select" or "the first boss". Without one, the scope is the whole game.
- **Screen list:** every screen and menu in scope; these are the rows of the matrix. Title, every menu and submenu, settings, pause, game over or results, level select, shops, dialogs, the lobby in an online or party game, and **gameplay** as its own row, split by mode when modes play differently. List them from the `state.screen` values in `game.js` as well as by looking, so screens that are hard to reach still get listed.
- **Shortcuts:** read the current screen with `eval window.__game.state.screen`. `?seed=` and `?debug` help reach later states. Use them to check state and save time, but reach every screen with the setup's own inputs at least once.

Done when you have the screen list and can say how each screen is reached.

## 2. The controls contract

AGENTS.md's *Controls*, *Menus*, *Leaving your game*, *Exit and pause*, *Input hints* and *Screens and scaling* sections, and the `inputs` list in the game's `pushplay.json`. In short:

- `menu` (Start, Esc, P, the on-screen pause button) pauses. Esc never acts as back.
- `b` (B, Backspace, right-click) goes back in menus.
- Nothing is bound to F10, Start+Select or a held Esc.
- The pause menu is Resume, Restart, Settings, Quit to title, and gameplay freezes while it's open.
- Settings can be reached from the title and from pause.
- Prompts come from `input.label`: never a literal "A" or "Space".
- Text is at least 24 px, and the HUD at least 32 px from the edges, at 1280×800. A phone game (manifest `phone`) draws in 720×1280 or 1280×720 instead, with text at least 32 px and the HUD inside `fit.safe`; run the `phone-game` setup for it.
- The cursor is hidden only during gameplay.
- Mouse and touch gameplay are required only if `inputs` lists them. Menus always need all four inputs.

**Run `npm run check <id>` first** and record the result. It already covers the short gamepad, keyboard, mouse, touch, pause and DPR 2 passes; the walkthrough goes further: every screen, every setup, judged from screenshots.

## 3. Pick the setups

Read every file in [setups/](setups/README.md) except the README, then the project's own `input-setups/` folder if it has one (same `id` replaces, new `id` adds, `disabled: true` removes).

- Use the setups the user named, or all of them.
- Otherwise run every setup without `optional: true`. Add the optional ones when they apply: `phone-game` for a game with `phone` in its manifest, `party-phone` for a party game, `phone-touch` when the user asks.
- A setup is skipped only when the contract rules it out (a mouse-only pass for a game whose `inputs` has no `"mouse"` still checks the menus), and the report says why.

## 4. Check the browser

```bash
PW_MODULE=.github/pushplay/node_modules/playwright node <skill-dir>/scripts/browser.mjs help
```

Use the kit's copy of Playwright through `PW_MODULE` on every browser command (run `npm run setup` first in a fresh checkout). If the browser can't be installed here, say so and stop: the check in GitHub Actions still covers the short passes.

Add `--webgl` to a setup's browser flags only for WebGL or 3D games. It slows 2D canvas games down badly.

## 5. Play each setup

Pick an output folder: `walkthrough-reports/<YYYY-MM-DD>-<game-id>/` in the repo root, with `screens/<setup-id>/` per setup. If your agent can run subagents, give each setup to its own subagent and start them all at once; otherwise play the setups one after another yourself. Either way the brief is the same, with the setup file in full:

> You are checking a game with one input setup, and nothing else.
>
> **Your setup:** the setup file's contents
> **Where:** the URL
> **Scope:** the section, or "everything"
> **Screens to cover:** the screen list, with how each is reached
> **Controls contract:** the contract from step 2
> **Shortcuts for checking state:** the debug hooks
>
> **Browser:**
> ```
> B="<skill-dir>/scripts/browser.mjs"     # with PW_MODULE set as in step 4
> node "$B" start <url> --id <setup-id> <the setup's browser flags>
> node "$B" pad press|hold <button> [ms] / pad stick left|right <x> <y> <ms> / pad connect|disconnect
> node "$B" press <key> / key down|up <key> / key hold <key> <ms>
> node "$B" click <ref|text> / mouse <x> <y> [move|click|right] / tap <x> <y> / scroll [down|up]
> node "$B" wait <ms>
> node "$B" eval <expression>
> node "$B" screenshot <out>/screens/<setup-id>/NN-<screen>.png --id <setup-id>
> node "$B" stop --id <setup-id>
> ```
> Add `--id <setup-id>` to every command, and run `node "$B" help` for details.
>
> **Rules:**
> - Use only the inputs your setup allows. `eval`, `wait` and `screenshot` are observation and always allowed. Never use `eval` to press buttons or change screens for the player.
> - **Look at your screenshots.** A canvas game's snapshot text is almost empty, so the screenshot is the only way to see the screen. Take one on every screen you reach, and whenever something goes wrong.
> - **The page keeps running between commands.** The game carries on in real time while you think, so pause it (with your setup's pause input) before long reasoning during gameplay, and expect a few hundred milliseconds to pass per command.
> - Mouse and tap positions are CSS pixels. If the screenshot says the image is larger than the viewport, divide by that factor.
>
> **For every screen in scope:**
> 1. Reach it with your setup's inputs. If you can't, that's a finding: record where you got stuck.
> 2. Move through every item, change one value (a slider or toggle) and put it back, then leave with the contract's back input.
> 3. Check the setup's "What must be true" list, and that the prompts on screen name your input.
>
> **For gameplay:** play for about 60 seconds (or through the named section), using every action in the controls contract at least once. Pause and resume. While paused, take two screenshots about 2 seconds apart: they should match, because nothing should move. Confirm `window.__game.state.screen` says `paused`.
>
> Leave the project's files unchanged.
>
> When finished, run `stop`, then reply with *only* this:
> 1. **Matrix rows:** a table `screen | result (✅ works / ⚠️ works with problems / ❌ broken or unreachable / n/a) | what you did | screenshot`.
> 2. **Findings:** for each problem, the screen, what you pressed, what happened, what should happen (citing the contract or the setup's rule), severity (blocker / major / minor / polish), and a screenshot.
> 3. **Gameplay:** which actions worked, the pause check result, and anything that only went wrong with this input.
> 4. **Not reached:** screens you couldn't get to, and why.

Done when every setup has its rows for every screen in scope.

## 6. Write the report

Save `<output folder>/report.md` with:

1. **Summary:** scope, setups, the check's result, and the verdict in 2–3 sentences.
2. **Matrix:** rows are screens, columns are setups, and each cell is ✅, ⚠️, ❌ or n/a, linked to the screenshot.
3. **Top fixes,** ranked by severity, then by how many setups hit the issue, then by how cheap the fix looks. Name the screen, the input and the change to make. A problem that shows up in several setups is often one cause, such as a custom menu that ignores touch: merge those into one fix.
4. **Per-setup notes:** each setup's findings and gameplay results.
5. **Not covered:** screens no setup reached, and setups that were skipped.

Don't invent results. A cell that wasn't checked is "not reached", not ✅.

## Things that aren't bugs

- Outside the launcher, `input.mode` starts as keyboard until the first input, so the title prompts can name keys before any button is pressed. Inside the launcher's gaming mode, it starts as gamepad. Check that the prompts switch after the first controller press instead.
- **Quit to library** only appears inside the launcher (`window.pushplay`), so it's missing in this walkthrough. Expect it to be absent.

## Afterwards

1. Stop any browsers still running, and the dev server if you started it.
2. Add `walkthrough-reports/` to `.gitignore` if it isn't there: reports are never committed.
3. In chat, give a short summary: the matrix in compact form, the top 3 fixes and the report path.
4. Don't fix things in this skill. Offer to fix the findings with `debug-game` (broken input or pause), `game-ui` (prompts, legibility, layout) or `accessibility-audit` (remapping, holds, text size). For each fixed game, bump `version` and add a Changelog line as AGENTS.md says.
5. Headless checks can't feel the real device: suggest the 2–3 things most worth trying by hand on the actual handheld.
