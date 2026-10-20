# PushPlay games

Ask an AI for a game, and it shows up on your Steam Deck, or in PushPlay on a Linux, Windows or Mac PC.

**One repo holds as many games as you like.** Every folder in `games/` is a game, and each one gets its own tile, art and updates in the library. Push and GitHub Actions builds the games that changed: it plays each one headlessly to catch crashes and renders its cover art on every branch, and publishes from the default branch to this repo's **pushplay-latest** release. The [PushPlay](https://pushplay.gg) launcher watches that release, so new games and updates appear on their own: watch the repo once and every game you add later shows up too.

Comes with one sample game, **Star Courier**. Keep it, change it, or delete its folder once you have your own.

Good for prototypes, playtests, and games made just for you.

## Set up your own

1. Click **Use this template → Create a new repository**. Private is fine. (Use the template rather than forking: forks have Actions turned off and can't be private.)
2. Open the new repo's **Actions** tab and run **Build games** once (or just push anything) to publish the sample.
3. In PushPlay (Steam Deck, Linux, Windows or Mac): **Add game → My repositories**, sign in with your phone, and watch this repo. [Install PushPlay](https://pushplay.gg/download) first if you haven't.

## One repo, many games

Add a game by asking for one, or with `npm run new-game <id>`; either way it gets its own folder in `games/`. There's no limit and nothing to register: the next build adds it to the release, and PushPlay adds it to the library. A build only rebuilds the games that changed, and one broken game never blocks the others. Delete a folder on the default branch and the game leaves the library (players who installed it keep their copy).

## Make a game with AI

Use any coding agent that can push to GitHub. The rules live in [`AGENTS.md`](AGENTS.md), which Codex, Copilot, Cursor, Gemini, Jules and others read automatically; Claude Code reads it through `CLAUDE.md`. Then just ask:

> Make a game where you defend a breakroom from paper airplanes.

The agent asks a few quick questions (how it should feel, 2D or 3D, art style, any assets or games you love), writes a one-page design brief for you to approve, then builds the game, designs its cover and banner art, runs the check, and pushes. Later, ask it to *improve* a game ("it gets boring after a minute") or *fix* one, and it works from the same brief. The design guides live in [`docs/game-design/`](docs/game-design/).

| Where you are | How |
|---|---|
| Phone or browser | **Claude Code**: Claude app → Code (or claude.ai/code), pick this repo. **Codex**: chatgpt.com/codex, pick this repo. **Copilot**: open an issue describing the game and assign it to Copilot. |
| Computer | Any agent CLI or IDE in a clone of this repo. |

Cloud agents usually push to a branch or open a pull request. That's fine: every branch runs the check, so the run's summary shows any problems. PushPlay gets the build once you merge to the default branch.

Tip: some cloud sandboxes can't download the headless browser that `npm run check` uses. The agent can still push, and the Actions run will report any problems. For Claude Code on the web you can add `npm run setup` to the environment's setup script.

## Already have a game in its own repo?

You don't need this template, an AI, or anything made for PushPlay. Any repo works ([details](https://pushplay.gg/guide/your-repo)):

- **GitHub releases:** if you attach zipped builds to releases, you're done. PushPlay reads the platform from the file name (`Game-Windows.zip`, `Game-Linux.zip`, `Game-macOS.zip`, `Game-HTML5.zip`), or looks inside a single zip, and uses the newest published release that has a build. Godot, Unity and anything else that exports a program work this way.
- **Plain HTML game** (an `index.html` at the root or in `dist/`, `docs/` or `build/`): add the topic `pushplay-game` to the repo, or a `pushplay.json`, and PushPlay plays it straight from the latest commit.
- **A web game with a build step:** add the build kit. Copy `.github/pushplay/` and `.github/workflows/pushplay.yml` from this repo, or use **Set up auto-builds** in PushPlay, which opens a pull request for you. If the repo has a `package.json` with a `build` script, the kit runs it and ships the output (`dist/` by default).

A `pushplay.json` ([fields](AGENTS.md#manifest-gamesidpushplayjson)) is optional everywhere except the template: it sets the name, art and controls.

## Make a game by hand

```sh
npm run setup                   # dependencies + headless browser
npm run new-game my-game        # or --vite for npm packages
npm run dev my-game             # play at http://localhost:5173 (--host to try it on a phone; ?debug for the state overlay)
npm run check my-game           # what CI runs; also renders the art
npm run update-kit              # newest build kit, prompts and runtime files (see Notes)
```

The starter already has a title, pause and settings screen that work with a controller, a keyboard, a mouse and touch. Its runtime files (`input.js`, `menu.js`, `fit.js`, `audio.js`, `save.js`, `settings.js`, `prompts.js`) are shared with every game and replaced by `update-kit`, so write your game in `game.js` and leave them alone.

## How a build works

The build kit in `.github/pushplay/` does everything; the workflow (`.github/workflows/pushplay.yml`) installs it and runs `ci.mjs`. The kit keeps its own dependencies (and lockfile) inside that folder, so it never touches your project's `package.json`.

1. **Validate** `pushplay.json` against `.github/pushplay/manifest.schema.json` (generated from the launcher's own schema), plus the game's code: no F10 binding, save keys prefixed with the game id, `menu.js` and `input.attach` in use.
2. **Build:** copy plain-HTML games as-is (skipping `tools/`, `mockups/`, `*.py`, `DESIGN.md` and anything in the game's `.pushplayignore`), or run `vite build` for `--vite` games.
3. **Play check:** open the game at 1280×800 in headless Chromium four times: with a virtual gamepad that presses A, moves the stick and then presses Start (the game must report `window.__game.state.screen === 'paused'`); with only a keyboard (Enter, then Esc must pause); with only touch (a tap on the title menu); and at 1920×1080 with 2× pixels (the canvas must be drawn and centred). Fail on crashes, missing files, internet requests or WebSockets, `alert()` dialogs or a blank screen. Save a screenshot.
4. **Art:** render `art/cover.svg` (720×500) and `art/hero.svg` (1920×450) to PNG with bundled fonts, or generate them from the screenshot if the game has none.
5. **Publish** `<id>-web.zip`, the PNGs and `pushplay-index.json` to the `pushplay-latest` release. It's a prerelease that's updated in place, not a versioned release, so it never becomes your repo's "Latest". A failed build keeps the last good version and records the error, so PushPlay can show "build failed" instead of losing the game.

The workflow runs in two jobs: **build** runs the games with read-only permissions and no token in reach, and uploads the results as an artifact; **publish** (only on the default branch) takes that artifact and uploads it to the release. Other branches only build and check.

## Notes

- **Actions minutes:** private repos use your plan's minutes (2,000/month free). A typical build takes about 2 minutes.
- **Updating the build kit:** repos made from the template keep the kit version they started with, and the launcher shows "build kit outdated" once a newer one exists. Run `npm run update-kit` to fetch the newest kit from the latest PushPlay release: it replaces `.github/pushplay/` and the workflow, refreshes `AGENTS.md`, `CLAUDE.md`, `.claude/skills/` and `docs/game-design/`, and swaps the runtime files in every game (files that still start with the `pushplay runtime v…` header; a hand-edited `input.js` or `menu.js` is replaced too, with a warning, so move key aliases to `input.extendKeys()` in `game.js`). It also accepts a path to a kit folder, an unpacked template repo, or a downloaded `kit.zip`. Then run `npm run check` and commit.
- **Renaming:** names shared with the launcher (`pushplay.json`, the release tag) come from `.github/pushplay/brand.json`.
