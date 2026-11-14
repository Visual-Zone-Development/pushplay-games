# release-notes in a PushPlay game

The general `release-notes` skill covers choosing the version, writing player-facing "what's new" notes, and showing them in the game. This page gives the PushPlay side: where the version lives and how an update reaches players. AGENTS.md *Workflow*, *Saves*, *Input hints* and *Manifest* are the rules.

## Input

- The in-game "what's new" panel closes with `a` or `b`; draw the prompt with `drawPrompts`.
- Never block starting the game: A on the title still starts after closing the panel.

## Settings

- The panel's bullets are ≥ 24 px × `settings.data.textScale`.

## Saves

- Store `lastSeenVersion` in `save.data`. If that changes the save's shape, bump the save version and pass a `migrate`.
- On the title screen, if `lastSeenVersion` differs from the current version, show a small panel with the bullets. When it closes, save the new version.

## Manifest

- The version is `version` in `pushplay.json`; the history is the Changelog in `DESIGN.md`. Read both first.
- Online and party games: bump `version` whenever the netcode changed. Only the same version plays together.

## Publishing

- Pushing the default branch publishes the build to PushPlay automatically. Never push to the default branch on your own.
- Commit with a message like `<Name> 1.3.0: boss, ship unlocks, punchier dash` and push to the working branch.
- Give the user the notes ready to paste (for a group chat, say), and tell them the update reaches PushPlay once it's on the default branch and the GitHub Action has finished.
