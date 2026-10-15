# PushPlay games

Ask an AI for a game, and it shows up on your Steam Deck.

Every folder in `games/` is a game. Push to any branch and GitHub Actions builds the games that changed: it plays each one headlessly to catch crashes, renders its cover art, and publishes it to this repo's **pushplay-latest** release. The [PushPlay](https://pushplay.gg) launcher on your Deck watches that release, so new games and updates appear on their own.

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

Tip: some cloud sandboxes can't download the headless browser that `npm run check` uses. The agent can still push, and the Actions run will report any problems. For Claude Code on the web you can add `npm run setup` to the environment's setup script.

## Already have a game in its own repo?

You don't have to use this template. Any repo works with PushPlay:

- **Plain HTML game** (an `index.html` at the root or in `dist/`): works as-is. PushPlay plays it straight from the repo.
- **Anything else:** add a `pushplay.json` at the repo root (see [AGENTS.md](AGENTS.md#manifest-gamesidpushplayjson)) and the build kit: copy `.github/pushplay/` and `.github/workflows/pushplay.yml` from this repo, or use **Set up auto-builds** in PushPlay, which opens a pull request for you. If the repo has a `package.json` with a `build` script, the kit runs it and ships the output (`dist/` by default).
- **Native builds** (Godot etc.): attach `pushplay-linux-x64.zip` to a GitHub release.

## Make a game by hand

```sh
npm run setup                   # dependencies + headless browser
npm run new-game my-game        # or --vite for npm packages
npm run dev my-game             # play at http://localhost:5173
npm run check my-game           # what CI runs; also renders the art
```

## How a build works

The build kit in `.github/pushplay/` does everything; the workflow (`.github/workflows/pushplay.yml`) installs it and runs `ci.mjs`. The kit keeps its own dependencies inside that folder, so it never touches your project's `package.json`.

1. **Validate** `pushplay.json` against `.github/pushplay/manifest.schema.json` (generated from the launcher's own schema).
2. **Build:** copy plain-HTML games as-is, or run `vite build` for `--vite` games.
3. **Play check:** open the game at 1280×800 in headless Chromium with a virtual gamepad that presses A and moves the stick. Fail on crashes, missing files, internet requests, `alert()` dialogs or a blank screen. Save a screenshot.
4. **Art:** render `art/cover.svg` (720×500) and `art/hero.svg` (1920×450) to PNG with bundled fonts, or generate them from the screenshot if the game has none.
5. **Publish** `<id>-web.zip`, the PNGs and `pushplay-index.json` to the `pushplay-latest` release. A failed build keeps the last good version and records the error, so the Deck can show "build failed" instead of losing the game.

## Notes

- **Actions minutes:** private repos use your plan's minutes (2,000/month free). A typical build takes about 2 minutes.
- **Updating the build kit:** repos made from the template keep the kit version they started with. To update, replace `.github/pushplay/` and the workflow with the latest copies (PushPlay can do this for you with **Set up auto-builds**).
- **Renaming:** names shared with the launcher (`pushplay.json`, the release tag) come from `.github/pushplay/brand.json`.
