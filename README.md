# My Game

A starter game for [PushPlay](https://pushplay.gg): it already has a title screen, a pause menu and a settings screen that work with a controller, a keyboard, a mouse and touch. Make it yours.

## From here to playing it

1. Press **Use this template** on GitHub to make your own repo from this one, and clone it.
2. Play it on your computer: `npx github:Visual-Zone-Development/pushplay-kit dev`
3. Write your game in `game.js`. Give it a name, a description and tags in `pushplay.json`, and replace the two pictures in `art/`.
4. Check it: `npx github:Visual-Zone-Development/pushplay-kit check` (it plays the game and tells you in plain words what is wrong).
5. Push. GitHub builds and checks the game on every push (`.github/workflows/pushplay.yml` does that; there is nothing to set up).
6. In PushPlay: **Add game → Connect GitHub**, then pick your repo. The game is in your library from then on, and every push updates it.

Steps 2 and 4 need [Node.js](https://nodejs.org) on your computer. Without it you can still edit, push and play in PushPlay; the check then runs on GitHub only.

## What is in here

| File | What it is |
|---|---|
| `index.html`, `game.js` | The game. Start in `game.js`. |
| `input.js`, `menu.js`, `fit.js`, `audio.js`, `save.js`, `settings.js`, `prompts.js`, `touch.js` | Helpers the starter's screens are built on. Use them or not; refresh them with `npx github:Visual-Zone-Development/pushplay-kit update-runtime`. |
| `pushplay.json` | What PushPlay shows about the game: name, description, tags, how it is played. |
| `art/cover.svg`, `art/hero.svg` | The library tile and the banner. |
| `.github/workflows/pushplay.yml` | Builds, checks and publishes the game on every push. |

Everything PushPlay needs from a game, whatever it is made with: https://github.com/Visual-Zone-Development/pushplay-kit/blob/main/docs/pushplay-build.md
