---
name: cover-art
description: Make or improve the library art for a game in games/ — the 720×500 cover with the title (art/cover.svg or cover.html) and the 1920×450 hero banner (art/hero.svg) — so it reads at thumbnail size, shows what the game is, uses the game's palette and bundled fonts, and keeps clear of the areas the launcher draws over. Use for "make the cover", "the cover looks bad / generic", "new banner", a failing check about placeholder art, or the art step of new-game.
---

# Cover art

Follow AGENTS.md (*Art*) and [art-directions.md](../../../docs/game-design/art-directions.md). Read the game's `DESIGN.md` (*Art direction*: palette, font, hero object, cover and hero ideas). If the repo has `model-asset` or `canvas2d-assets` skills, use them to draw the hero object the same way as in game.

## 1. The rules (the check enforces some)
| | Cover `art/cover.svg` | Hero `art/hero.svg` |
|---|---|---|
| Size | exactly 720×500 (`width`, `height`, `viewBox`) | exactly 1920×450 |
| Shown at | ~216×150 in the library | full-width banner on the game's page |
| Text | **the title, big and bold** | **no text at all** |
| Keep clear | the **bottom 110 px** (badges) | the **bottom-left** (the launcher writes the title there) |
| Focal point | the hero object, large, breaking out of the frame | on the **right half** |

Also: a full background (no transparency), 2–4 main colours from the game's palette plus a text colour, fonts only from `Chakra Petch` (600, 700), `Rubik` (400, 700, 900), `Bungee`, `Lilita One`, `Press Start 2P`, no external images or links (`data:` images are fine). Pixel-art games can use `art/cover.html` drawing with the game's own sprite code (set `"cover": "art/cover.html"`).

## 2. Compose for a thumbnail
1. **Pick one idea:** the hero object doing the core verb (a ship mid-dodge, a frog mid-jump), plus one hint of the challenge (an asteroid, a boss shadow). Not a collage.
2. **Silhouette test:** the main shape must be recognisable as a flat single-colour shape.
3. **Value contrast:** light hero on a dark background or the reverse; the title the highest-contrast thing on the cover.
4. **Title:** 70–130 px tall, one or two lines, a thick outline or drop shadow (an offset copy, not a filter blur) so it reads on any background; placed top or middle, never in the bottom 110 px.
5. **Depth with few layers:** background gradient or shapes → mid-ground hint of the world → hero → title. Diagonals and a slight tilt give energy.
6. **Hero banner:** a wide version of the same scene; key visual on the right third, calm, darker area bottom-left for the launcher's title.

## 3. Render, look, iterate
1. `npm run check <id>`; it renders `cover.png` and `hero.png` under `.github/pushplay/.work/out/<id>/__art/`.
2. **Open both PNGs** and judge them:
   - Shrink test: does the cover still read at ~216×150? (Imagine or render it small.) Is the title legible?
   - Does it look like *this* game, in its palette, and not a generic placeholder?
   - Anything important in the bottom 110 px of the cover or the bottom-left of the hero?
3. Fix and re-run until both look good: usually by enlarging the hero, simplifying the background and strengthening contrast.
4. Commit (`<Name>: cover and hero art`) and push. Bump `version` if the game was already released.
