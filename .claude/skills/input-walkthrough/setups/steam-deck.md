---
id: steam-deck
name: Steam Deck
summary: A 7-inch 1280x800 handheld, played with its built-in controller, sometimes with its touchscreen.
browser: --viewport 1280x800 --dpr 1 --gamepad --touch
inputs: gamepad
optional: false
---

## How to play
Use only `pad press`, `pad hold` and `pad stick`, the way a person holding the
Deck would: the d-pad or left stick to move through menus, A to confirm, B to
go back, Start for the pause menu. Use `tap` only for the final touchscreen
check below.

## What must be true
- Every screen in scope is reachable and usable with the controller alone, and the selected item is always clearly highlighted.
- B goes back one level in menus. It never quits the game or loses progress without asking.
- Start opens the pause menu from gameplay, and the game is frozen while paused.
- Prompts show controller buttons (A, B, Start), not keys or "click".
- Text is readable on a 7-inch screen: judge from the screenshot at this size. Roughly, nothing smaller than 24 px at 1280x800, and important HUD at least 32 px from the edges.
- Nothing needs hover, typing, a scroll wheel or two buttons at once.
- **Touchscreen check:** after the controller pass, tap the main menu items once. A Deck owner sometimes reaches for the screen, and it should work or at least do nothing harmful.
