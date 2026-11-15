# PushPlay game repo (starter)

An empty repo that is ready for [PushPlay](https://pushplay.gg), the launcher that plays your games on a Steam Deck, a Legion Go, a PC and a phone. It holds one thing: the small workflow file that builds, checks and publishes whatever game you put here.

You don't need this repo to use PushPlay. It only saves you copying one file.

## Use it

1. **Use this template → Create a new repository.** Name it after your game, or something like `my-games` if you want to keep several in `games/`.
2. **Put a game in it.** Any of these:
   - Ask a coding agent that has the [PushPlay skills](https://github.com/Visual-Zone-Development/pushplay-plugin): *"Make me a game about a frog delivering mail."*
   - Start one yourself: `npx github:Visual-Zone-Development/pushplay-plugin new-game my-game`
   - Bring a game you already have, in any engine: add a `pushplay.json` and two pictures. The [build guide](https://github.com/Visual-Zone-Development/pushplay-plugin/blob/main/docs/pushplay-build.md) shows how for Godot, Unity, native builds and plain JavaScript.
3. **Push.** GitHub builds the game, plays it headlessly to catch problems, and publishes it from the default branch.
4. **In PushPlay:** Add game → Follow a GitHub account, and follow yourself.

Check before you push: `npx github:Visual-Zone-Development/pushplay-plugin check`.

## What ends up in your repo

Your game, `pushplay.json`, its art, and `.github/workflows/pushplay.yml`. Nothing else is added for PushPlay: the build runs from outside your repo, your own release workflow is not touched, and PushPlay's builds go to their own release.

Finished examples to play and read: [Arcade Sampler](https://github.com/Visual-Zone-Development/arcade-sampler) and [Motion Lab](https://github.com/Visual-Zone-Development/motion-lab).
