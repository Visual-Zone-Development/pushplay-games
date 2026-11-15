# My Game

A starter game for [PushPlay](https://pushplay.gg): it already has a title screen, a pause menu and a settings screen that work with a controller, a keyboard, a mouse and touch. Make it yours.

## From here to playing it

You can do all of this on github.com, with nothing installed.

1. Press **Use this template** on GitHub to make your own repo from this one (private is fine). Don't fork it: forks have Actions turned off.
2. Write your game in `game.js`. To edit on github.com, open the file, press the pencil, and press **Commit changes** when you are done: that is a push.
3. In `pushplay.json`, change `"id"` and `"name"` from `my-game` to your own (and the matching `ID` at the top of `game.js`; it names the game's saves), write a description and tags, and replace the two pictures in `art/`.
4. Every push builds and checks the game (`.github/workflows/pushplay.yml` does that; there is nothing to set up). Open the repo's **Actions** tab: a green tick after about two minutes means it is published, and a red cross opens to say in plain words what is wrong. A change to a `.md` file alone doesn't start a build.
5. In PushPlay: **Add game → Connect GitHub**, then pick your repo. The game is in your library from then on, and every push updates it.

### On your computer (optional)

With [Node.js](https://nodejs.org) installed you can clone the repo and try the game before you push:

- Play it: `npx github:Visual-Zone-Development/pushplay-kit dev`
- Check it: `npx github:Visual-Zone-Development/pushplay-kit check` (it plays the game and tells you in plain words what is wrong; GitHub runs the same check on each push).

## What is in here

| File | What it is |
|---|---|
| `index.html`, `game.js` | The game. Start in `game.js`. |
| `input.js`, `menu.js`, `fit.js`, `audio.js`, `save.js`, `settings.js`, `prompts.js`, `touch.js` | Helpers the starter's screens are built on. Use them or not; refresh them with `npx github:Visual-Zone-Development/pushplay-kit update-runtime`. |
| `pushplay.json` | What PushPlay shows about the game: name, description, tags, how it is played. |
| `art/cover.svg`, `art/hero.svg` | The library tile and the banner. |
| `.github/workflows/pushplay.yml` | Builds, checks and publishes the game on every push. |

Everything PushPlay needs from a game, whatever it is made with: https://github.com/Visual-Zone-Development/pushplay-kit/blob/main/docs/pushplay-build.md
