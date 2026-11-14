---
name: release-notes
description: Prepare an update of the game in this repo for release — check the version bump, turn the DESIGN.md Changelog and the git history into player-facing "what's new" notes, optionally show them in-game once after an update, update the repo README's game list, and write the commit message and a short post the user can share. Use for "write release notes", "what changed since last time", "prepare a release", "announce the update", or at the end of building or changing a game when the user wants notes.
---

# Release notes

Follow the project's own rules first (its `AGENTS.md` or platform guide): they decide where the version lives, the checks and how an update reaches players. This skill makes sure the update is described well and the version is right. It never publishes or pushes to the default branch on its own.

## 1. Gather what changed
1. Read the game's current version (wherever the project keeps it) and the Changelog in `DESIGN.md`.
2. Find the last released state: the last commit on the default branch (`git log -1 origin/<default>`), and the changes since then (`git log --oneline origin/<default>..HEAD` and `git diff --stat`). For a new game, everything is new.
3. Check the **version bump** matches the change: patch for fixes and tuning, minor for features or content, major for a reworked game or a save or netcode break. Online games: bump whenever the netcode changed, if only matching versions can play together. Fix the version and the Changelog if they're missing or wrong.

## 2. Write the notes
Write for **players**, not developers: what they'll notice, in plain words, most exciting first.

```
Star Courier 1.3.0
• New: a boss at wave 10 — the Comet Hauler.
• New: unlock three ships by delivering parcels.
• Better: dashing now freezes for a beat on a hit, so it feels punchier.
• Fixed: the game no longer stutters during big explosions.
```

- 3–6 bullets, each starting with **New / Better / Fixed**.
- No file names, function names or `TUNING` keys.
- Mention anything players must know (a save reset, a changed button, a new setting) first.

Put the notes in the DESIGN.md Changelog entry for this version (keep any developer detail as a second line).

## 3. Optional: "What's new" in the game
If the user wants it, show the notes once after an update:
- store `lastSeenVersion` in the game's save data (migrate old saves if the shape changes);
- on the title screen, if it differs from the current version, show a small panel with the bullets (≥ 24 px × the game's text-size setting), closed with confirm or back (shown with the game's input-prompt helper), then save the new version;
- never block starting the game: confirm on the title still starts after closing the panel.

## 4. Finish
1. If the game is new or renamed, update the list of games in the repo's `README.md` (only if the README already lists games).
2. Run the project's checks and finish the change the way its rules say, on the working branch, with a message like `<Name> 1.3.0: boss, ship unlocks, punchier dash`.
3. Give the user the notes ready to paste (e.g. for a group chat), and say how and when the update reaches players (the project's rules say).
