---
name: kit-upgrade
description: Update this repo to the newest PushPlay build kit and shared files, only when the user asks — run npm run update-kit (or npm run sync-template in a repo made from the template), keep this repo's own additions to AGENTS.md, CLAUDE.md, skills and docs, then run the check on every game and fix what the new kit flags. Use for "update the kit", "the launcher says build kit outdated", "sync from the template", "get the latest skills / runtime".
---

# Kit upgrade

Follow AGENTS.md. **Only run this when the user asks** (AGENTS.md: `npm run update-kit` only on request). It touches shared files in every game, so work on a branch and commit separately from game changes.

## 1. Pick the tool
- `npm run update-kit` downloads the newest kit from the latest PushPlay release (or takes a path to a kit folder, an unpacked template repo or a `kit.zip`). It **replaces** `.github/pushplay/` and the workflow, **overwrites** `AGENTS.md` and `CLAUDE.md`, replaces each kit skill folder in `.claude/skills/` and each kit doc in `docs/game-design/` (the repo's own extra skills and docs survive), and swaps the runtime files in every game.
- `npm run sync-template` (only in repos that have `tools/template-sync/`) brings in what changed in the template repo since the last sync as a **3-way merge**, so this repo's own additions survive; conflicts are left with `<<<<<<<` markers. `-- --check` only reports whether anything is new.

Prefer `sync-template` when it exists; use `update-kit` otherwise, or when the user asks for it.

## 2. Run it safely
1. Start from a clean working tree (`git status`), on a branch.
2. Run the tool and read its whole output: overwritten runtime files, warnings, conflicts.
3. **Review the diff of the shared prompt files** (`git diff AGENTS.md CLAUDE.md .claude/skills docs/game-design`):
   - After `update-kit`, re-add any repo-specific lines that were overwritten (for example a `CLAUDE.md` line routing to the repo's own skills). `git diff` shows them as removed lines.
   - After `sync-template`, resolve each conflict by keeping both the template's change and the repo's addition.
4. **Hand-edited runtime files:** if a game's `input.js`, `menu.js` or another runtime file was edited, the tool warns and replaces it. Move the game's change into `game.js` (key aliases via `input.extendKeys`, behaviour in the game's own code).

## 3. Check every game
1. `npm run setup` if dependencies changed, then `npm run check` (all games).
2. Fix each ✗ in the game that reports it, using the `debug-game` steps; new kit rules (for example a newly required manifest field) are usually small manifest or code fixes. Bump each fixed game's patch `version` and add a Changelog line.
3. Look at a few screenshots to make sure nothing renders differently.

## 4. Commit and report
1. Commit the kit update on its own (`Kit: update to <version>` or `Sync from template`), then any game fixes as separate commits (`<Name>: fixes for the new kit`). Push.
2. Tell the user what the new kit brought (read the tool's output and the diff of `docs/` and skills), which games needed fixes, and anything left to do.
