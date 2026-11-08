# PushPlay game template

Ask an AI for a game, and it shows up on your Steam Deck, or in PushPlay on a Linux, Windows or Mac PC. A game can also be laid out for a phone or tablet (`--phone`, touch controls, a phone check pass), and PushPlay labels where each game plays: handheld, desktop, tablet, phone, party.

**One game, or a workshop of many.** Push and GitHub Actions builds your games: it plays each one headlessly to catch crashes and renders its cover art on every branch, and publishes from the default branch to this repo's **pushplay-latest** release. The [PushPlay](https://pushplay.gg) launcher watches that release, so updates appear on their own. The first game decides how the repo is used:

- **One game** (`npm run new-game my-game`): the game sits at the root of the repo, with its own releases, its own page, and a listing on PushPlay's **Discover** tab. For a game you mean to publish.
- **Workshop** (`npm run new-game my-game --workshop`): every game is a folder in `games/`, so a coding agent (on your phone or computer) can make and prototype as many as you like in one place. When one is finished, `npm run promote my-game` (or **Actions → Promote a game** from your phone) moves it into its own repo for Discover, and players keep their saves.

Just ask your agent for a game: it asks which you want the first time. For finished examples to play and learn from, see the starter games, each in its own repo and on **Discover**:

- **[Arcade Sampler](https://github.com/Visual-Zone-Development/arcade-sampler)**: twelve tiny, complete games in one cabinet, each a different genre in its own art style, all drawn in code.
- **[Motion Lab](https://github.com/Visual-Zone-Development/motion-lab)**: a party game where your phone is the controller: tilt a marble maze, swing for home runs, slash fruit, shake maracas and steer a kart, with a live Sensor Bench. Make your own with `npm run new-game <id> --party --controller motion` and [`docs/game-design/motion.md`](docs/game-design/motion.md).

Good for prototypes, playtests, and games made just for you.

## Set up your own

1. Click **Use this template → Create a new repository**: named after your game for one game (public if you want it on Discover), or something like `my-games` for a workshop (private is fine). (Use the template rather than forking: forks have Actions turned off and can't be private.)
2. Make the game (see *Make a game with AI* below) and push it: the **Build games** action publishes it.
3. In PushPlay (Steam Deck, Linux, Windows or Mac): **Add game → Follow a GitHub account** and follow yourself; every repo you make from this template shows up on its own (sign in to GitHub there for private ones). [Install PushPlay](https://pushplay.gg/download) first if you haven't.

## One game, or a workshop

`npm run new-game <id>` in a fresh copy puts the game at the root of the repo: `pushplay.json`, `index.html`, `game.js` and `art/` sit next to this README, and the agent's guides (`AGENTS.md`, `.claude/`, `docs/`) stay out of the build. That repo is now that game; `new-game` refuses a second one.

`npm run new-game <id> --workshop` instead makes the repo a workshop: each game is a folder in `games/`, there's no limit, and a build only rebuilds the games that changed. When a game is ready for Discover:

```sh
npm run promote my-game     # its own public repo, with the game at the root; then git push
```

It builds the new repo from this template, pushes it (the first push builds and publishes the game), takes the game out of `games/`, and records where it came from so PushPlay moves players' copies over with their saves. From your phone: **Actions → Promote a game** (add a `PROMOTE_TOKEN` secret first; see `.github/workflows/promote.yml`). Cloud agents use the `promote-game` skill.

A failed build keeps the last good version, so a broken push never takes a game away from players.

## Make a game with AI

Use any coding agent that can push to GitHub. The rules live in [`AGENTS.md`](AGENTS.md), which Codex, Copilot, Cursor, Gemini, Jules and others read automatically; Claude Code reads it through `CLAUDE.md`. Then just ask:

> Make a game where you defend a breakroom from paper airplanes.

The agent asks a few quick questions (how it should feel, 2D or 3D, art style, any assets or games you love), writes a one-page design brief for you to approve, then builds the game, designs its cover and banner art, runs the check, and pushes. Later, ask it to *improve* the game ("it gets boring after a minute") or *fix* one, and it works from the same brief. The design guides live in [`docs/game-design/`](docs/game-design/).

| Where you are | How |
|---|---|
| Phone or browser | **Claude Code**: Claude app → Code (or claude.ai/code), pick this repo. **Codex**: chatgpt.com/codex, pick this repo. **Copilot**: open an issue describing the game and assign it to Copilot. |
| Computer | Any agent CLI or IDE in a clone of this repo. |

Cloud agents usually push to a branch or open a pull request. That's fine: every branch runs the check, so the run's summary shows any problems. PushPlay gets the build once you merge to the default branch.

Tip: some cloud sandboxes can't download the headless browser that `npm run check` uses. The agent can still push, and the Actions run will report any problems. For Claude Code on the web you can add `npm run setup` to the environment's setup script.

## Better art (optional): bring your own image API key

Games draw their art in code by default: lit, outlined sprites, pixel art, code-built 3D models, textured backdrops, and cover and banner art made from the game's own drawing code (the `art-direction`, `pixel-art`, `threejs-models` and `cover-art` skills). No key or account is needed. Ask the agent to *"do an art pass"* whenever the game looks plain.

If you'd like painted sprites, textures or key art as well, give the agent your own image API key. Generation only happens while the agent works: the images are saved into the game and bundled, and the game never calls the API.

1. Get a key from **OpenAI** (`OPENAI_API_KEY`), **Google Gemini** (`GEMINI_API_KEY`) or **Replicate** (`REPLICATE_API_TOKEN`).
2. **On your computer:** copy `.env.example` to `.env` and paste the key in. `.env` is gitignored, so it never gets pushed. **In a cloud agent** (Claude Code on the web, Codex): add the same variable to the environment's settings instead.
3. Ask for it: *"generate painted art with my key"*. The agent writes the prompts and tells you the estimated cost (`npm run art -- --dry`). Only after you agree does it generate the images, look at them and refine them. Every later batch or redo is quoted and asked about again: `npm run art` refuses to charge anything an agent hasn't been given approval for, and in a terminal it asks you first.

It costs roughly $0.003–$0.21 per image depending on the provider and quality, so about $0.50–$6 for a typical game. Each run stops at 12 images unless you allow more. Details: [`docs/game-design/generated-art.md`](docs/game-design/generated-art.md).

## Already have a game in its own repo?

You don't need this template, an AI, or anything made for PushPlay. Any repo works ([details](https://pushplay.gg/guide/your-repo)):

- **GitHub releases:** if you attach zipped builds to releases, you're done. PushPlay reads the platform from the file name (`Game-Windows.zip`, `Game-Linux.zip`, `Game-macOS.zip`, `Game-HTML5.zip`), or looks inside a single zip, and uses the newest published release that has a build. Godot, Unity and anything else that exports a program work this way.
- **Plain HTML game** (an `index.html` at the root or in `dist/`, `docs/` or `build/`): add the topic `pushplay-game` to the repo, or a `pushplay.json`, and PushPlay plays it straight from the latest commit.
- **A web game with a build step:** add the build kit. Copy `.github/pushplay/` and `.github/workflows/pushplay.yml` from this repo, or use **Set up auto-builds** in PushPlay, which opens a pull request for you. If the repo has a `package.json` with a `build` script, the kit runs it and ships the output (`dist/` by default).

A `pushplay.json` ([fields](AGENTS.md#manifest-pushplayjson)) is optional everywhere except the template: it sets the name, art and controls.

## Make a game by hand

```sh
npm run setup                   # dependencies + headless browser
npm run new-game my-game        # the repo's one game (--workshop for many); --vite for npm packages, --party [--controller motion] for TV + phones, --phone portrait|landscape for a phone game
npm run dev                     # (workshop: npm run dev my-game) play at http://localhost:5173 (--host to try it on a phone; ?debug for the state overlay)
npm run check                   # what CI runs; also renders the art
npm run art:shots               # render the cover, banner and art/gallery.html to PNG to look at
npm run art -- --dry            # optional: generated art with your own key (see Better art)
npm run update-kit              # newest build kit, prompts and runtime files (see Notes)
```

The starter already has a title, pause and settings screen that work with a controller, a keyboard, a mouse and touch. Its runtime files (`input.js`, `menu.js`, `fit.js`, `audio.js`, `save.js`, `settings.js`, `prompts.js`, `touch.js`) come from the build kit and are replaced by `update-kit`, so write your game in `game.js` and leave them alone.

## How a build works

The build kit in `.github/pushplay/` does everything; the workflow (`.github/workflows/pushplay.yml`) installs it and runs `ci.mjs`. The kit keeps its own dependencies (and lockfile) inside that folder, so it never touches your project's `package.json`.

1. **Validate** `pushplay.json` against `.github/pushplay/manifest.schema.json` (generated from the launcher's own schema), plus the game's code: no F10 binding, save keys prefixed with the game id, `menu.js` and `input.attach` in use.
2. **Build:** copy a plain-HTML game as-is (skipping `tools/`, `mockups/`, `*.py`, `DESIGN.md`, the repo's `AGENTS.md`, `CLAUDE.md` and `docs/`, and anything in `.pushplayignore`), or run `vite build` for `--vite` games.
3. **Play check:** open the game at 1280×800 in headless Chromium several times: with a virtual gamepad that presses A, moves the stick and then presses Start (the game must report `window.__game.state.screen === 'paused'`); with only a keyboard (Enter, then Esc must pause); with only a mouse (menus by click, the pause button); with only touch (a tap on the title menu); and at 1920×1080 with 2× pixels (the canvas must be drawn and centred). A game with `phone` in its manifest is also played touch-only at phone size (390×844 or 844×390, 3× pixels): menus by tap, the pause button, a hidden page must pause, and text under 32 px fails. Fail on crashes, missing files, internet requests or WebSockets, `alert()` dialogs or a blank screen. Save a screenshot.
4. **Art:** render `art/cover.svg` (720×500) and `art/hero.svg` (1920×450) to PNG with bundled fonts, or generate them from the screenshot if the game has none.
5. **Publish** `<id>-web.zip`, the PNGs and `pushplay-index.json` to the `pushplay-latest` release. It's a prerelease that's updated in place, not a versioned release, so it never becomes your repo's "Latest". A failed build keeps the last good version and records the error, so PushPlay can show "build failed" instead of losing the game.

The workflow runs in two jobs: **build** runs the game with read-only permissions and no token in reach, and uploads the results as an artifact; **publish** (only on the default branch) takes that artifact and uploads it to the release. Other branches only build and check.

## Notes

- **Actions minutes:** private repos use your plan's minutes (2,000/month free). A typical build takes about 2 minutes.
- **Updating the build kit:** repos made from the template keep the kit version they started with, and the launcher shows "build kit outdated" once a newer one exists. Run `npm run update-kit` to fetch the newest kit from the latest PushPlay release: it replaces `.github/pushplay/` and the workflow, refreshes `AGENTS.md`, `CLAUDE.md`, `.claude/skills/` and `docs/game-design/`, and swaps the runtime files (files that still start with the `pushplay runtime v…` header; a hand-edited `input.js` or `menu.js` is replaced too, with a warning, so move key aliases to `input.extendKeys()` in `game.js`). It also accepts a path to a kit folder, an unpacked template repo, or a downloaded `kit.zip`. Then run `npm run check` and commit.
- **Renaming:** names shared with the launcher (`pushplay.json`, the release tag) come from `.github/pushplay/brand.json`.
