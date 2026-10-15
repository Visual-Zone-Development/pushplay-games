# PushPlay games

Ask an AI for a game, and it shows up on your Steam Deck.

Every folder in `games/` is a game. Push to any branch and GitHub Actions builds the games that changed: it plays each one headlessly to catch crashes, renders its cover art, and publishes it to this repo's **pushplay-latest** release. The [PushPlay](https://github.com/tmorren/pushplay) launcher on your Deck watches that release, so new games and updates appear on their own.

Comes with one sample game, **Star Courier**.

## Set up your own

1. Click **Use this template → Create a new repository**. Private is fine. (Use the template rather than forking: forks have Actions turned off and can't be private.)
2. Open the new repo's **Actions** tab and run **Build games** once (or just push anything) to publish the sample.
3. In PushPlay on your Deck: **Add game → GitHub → watch this repo**.

## Make a game with AI

Use any coding agent that can push to GitHub. The rules live in [`AGENTS.md`](AGENTS.md), which Codex, Copilot, Cursor, Gemini, Jules and others read automatically; Claude Code reads it through `CLAUDE.md`. Then just ask:

> Make a game where you defend a breakroom from paper airplanes.

The agent scaffolds the game, writes it, designs its cover and banner art, runs the check, and pushes.

| Where you are | How |
|---|---|
| Phone or browser | **Claude Code**: Claude app → Code (or claude.ai/code), pick this repo. **Codex**: chatgpt.com/codex, pick this repo. **Copilot**: open an issue describing the game and assign it to Copilot. |
| Computer | Any agent CLI or IDE in a clone of this repo. |

Cloud agents usually push to a branch or open a pull request. That's fine: every branch is built, and the Deck gets the newest build. Merge when you want the game on `main`.

Tip: some cloud sandboxes can't download the headless browser that `npm run check` uses. The agent can still push, and the Actions run will report any problems. For Claude Code on the web you can add `npx playwright install chromium` to the environment's setup script.

## Make a game by hand

```sh
npm install
npx playwright install chromium
npm run new-game my-game        # or --vite for npm packages
npm run dev my-game             # play at http://localhost:5173
npm run check my-game           # what CI runs; also renders the art
```

## How a build works

`tools/` holds everything; the workflow just calls `node tools/ci.mjs`.

1. **Validate** `pushplay.json` against `tools/manifest.schema.json` (generated from the launcher's own schema).
2. **Build:** copy plain-HTML games as-is, or run `vite build` for `--vite` games.
3. **Play check:** open the game at 1280×800 in headless Chromium with a virtual gamepad that presses A and moves the stick. Fail on crashes, missing files, internet requests, `alert()` dialogs or a blank screen. Save a screenshot.
4. **Art:** render `art/cover.svg` (720×500) and `art/hero.svg` (1920×450) to PNG with bundled fonts, or generate them from the screenshot if the game has none.
5. **Publish** `<id>-web.zip`, the PNGs and `pushplay-index.json` to the `pushplay-latest` release. A failed build keeps the last good version and records the error, so the Deck can show "build failed" instead of losing the game.

## Notes

- **Actions minutes:** private repos use your plan's minutes (2,000/month free). A typical build takes about 2 minutes.
- **Templates don't receive updates:** repos made from this template don't pick up later changes to `tools/`. Copy the folder over to update.
- **Renaming:** names shared with the launcher (`pushplay.json`, the release tag) live in `tools/config.mjs`.
