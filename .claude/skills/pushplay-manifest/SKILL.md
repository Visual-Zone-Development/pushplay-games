---
name: pushplay-manifest
description: Write or fix a game's pushplay.json, the manifest PushPlay reads its name, description, art, tags, inputs, player count and Plays-on labels (Handheld & controller, Desktop, Tablet, Phone, Party) from. Use for "fill in the manifest", "the check says tags / inputs / description is missing", "why doesn't my game show the Phone label", "add tags", "change the game's name or description", "bump the version", or step 3 of new-game. For the cover and banner images themselves use cover-art.
---

# The PushPlay manifest

Follow AGENTS.md (*Manifest*). `pushplay.json` sits next to the game's `index.html` (the repo root, or `games/<id>/` in a workshop). `npm run new-game` writes a starter; this skill fills it in and fixes what `npm run check` reports about it. It is validated against `.github/pushplay/manifest.schema.json`, which rejects fields it doesn't know.

```json
{
  "$schema": "./.github/pushplay/manifest.schema.json",
  "id": "star-courier",
  "name": "Star Courier",
  "description": "Pilot a tiny courier ship through an asteroid field, grabbing parcels before the clock runs out.",
  "version": "1.0.0",
  "entry": { "web": "index.html" },
  "art": { "cover": "art/cover.svg", "hero": "art/hero.svg" },
  "controls": "gamepad",
  "inputs": ["gamepad", "keyboard", "mouse", "touch"],
  "players": "1",
  "tags": ["arcade", "space", "score attack"],
  "online": false,
  "phone": { "orientation": "landscape" }
}
```

## 1. Read the game before writing about it

Read `DESIGN.md` and play the game (`npm run dev`) or look at the check's screenshot. Every field below describes what the game really does today: an input in `inputs` that gameplay doesn't support, or a tag for a mode that isn't built, is a bug a player will hit.

## 2. Fields

| Field | Rule |
|---|---|
| `id` | Set by `new-game`: lowercase letters, digits and dashes, and in a workshop the same as the folder name. **Never change it**: players' saves and the game's PushPlay listing follow it. |
| `name` | The title as players see it, up to 80 characters. |
| `description` | **Required by the check** (at least 20 characters). 1–3 plain sentences: what you do, and what makes it fun. It is shown in the library, so write it for a player, not as a feature list. No "A game where you…", no engine or tech words. |
| `version` | Bump it on every notable change (`1.0.0` → `1.1.0` for something a player would notice, `1.0.1` for a fix), with a line in DESIGN.md's Changelog. Online games: only builds with the same version play together, so bump it whenever the netcode changes. |
| `entry` | `{ "web": "index.html" }` for every kit game. The file must exist. |
| `art` | `cover` (720×500, with the title) and `hero` (1920×450, no title), as `.svg`, `.html`, `.png`, `.jpg` or `.webp` paths inside the game folder. The check fails while either is still the placeholder; the `cover-art` skill makes them. The build writes `art.screenshots` itself: don't set it by hand. |
| `controls` | `"gamepad"` once the game works with a controller (every kit game). `"keyboard-mapped"` is only for a ported game that has no controller support yet. |
| `inputs` | **Required.** Which inputs the whole game, gameplay included, can be played with: any of `"gamepad"`, `"keyboard"`, `"mouse"`, `"touch"`, each once. `"gamepad"` and `"keyboard"` are always there. Drop `"mouse"` or `"touch"` only when gameplay genuinely can't work with them, and then say so on the title screen ("Needs a controller or keyboard"). Menus must work with all four regardless. |
| `players` | `"1"`, or a range like `"1-4"` or `"2-4"`. |
| `tags` | **Required.** 2–5 is right, 8 the limit: lowercase words players filter the library by. Genre first (`"racing"`, `"puzzle"`, `"platformer"`, `"shooter"`), then setting or style (`"space"`, `"pixel art"`, `"cozy"`), then `"local multiplayer"`, `"online multiplayer"` or `"party"` when they apply. Letters, digits, spaces, `-`, `&` and `'`, up to 24 characters each. |
| `online` | `true` only for a game scaffolded with `--online` (it may then connect to the relay). |
| `party` | `true` only for a game scaffolded with `--party`. |
| `phone` | Only for a game laid out in a phone space: `{ "orientation": "portrait" \| "landscape" \| "any" }`, matching the size passed to `fitCanvas` (720×1280, 1280×720, or both). `inputs` must then include `"touch"`. Leave it out of a 1280×800 game. |
| `build` | `{ "preset": "vite", "output": "dist" }` in a `--vite` game (the scaffold adds it). Leave it out otherwise. |
| `movedFrom` | Written by `npm run promote` so players' copies follow a game to its new repo. Never add or edit it by hand. |

## 3. Plays-on labels are earned, not typed

PushPlay derives where a game plays from the manifest and the check's passes. To get a label, make the game deserve it:

| Label | What earns it |
|---|---|
| **Handheld & controller** | Every kit game. |
| **Desktop** | `"keyboard"` and `"mouse"` in `inputs`, with the check's keyboard-only and mouse-only passes green. |
| **Tablet** | A landscape game with `"touch"` in `inputs`. Without `"touch"` it is listed as "Needs a controller". |
| **Phone** | `phone` set, `"touch"` in `inputs`, and a green phone pass (touch only at 390×844 or 844×390, DPR 3). The `mobile-port` skill gets a game there. |
| **Party** | `"party": true`. |

If a label is missing, the fix is in the game (or in `inputs`), never a field you add.

## 4. What the check says, and the fix

| Message | Fix |
|---|---|
| `add a "description" of 1–3 sentences` | Write it (step 2); 20 characters is the floor, not the goal. |
| `add "tags"` / `add "inputs"` | Add them from what the game supports. |
| `"id" must match the folder name` | Someone renamed the folder or the id. Put the id back; rename the folder to match it, not the other way round. |
| `a phone game … "inputs" must include "touch"` | Make touch gameplay work (`touch-controls`), then list it; or remove `phone`. |
| `art.cover … is still the placeholder` | The `cover-art` skill. |
| `entry.web "…" doesn't exist` | Point it at the real page, usually `index.html`. |
| `(root) must NOT have additional properties "…"` | Remove the field: the schema doesn't know it. |
| `build preset "vite" needs a package.json with a "build" script` | Add the script, or re-scaffold with `--vite`. |

## 5. Finish

Run `npm run check` (with the game id in a workshop) and read what it prints about the manifest. Changing only the description, tags or art still deserves a patch `version` bump, since the library shows them.
