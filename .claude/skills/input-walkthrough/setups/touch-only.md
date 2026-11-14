---
id: touch-only
name: Touch only
summary: A handheld or tablet touchscreen at 1280x800, with no buttons at all.
browser: --viewport 1280x800 --touch
inputs: touch
optional: false
---

## How to play
`tap` only, plus `scroll` for pages that scroll. Work out tap positions from
the screenshot (CSS pixels).

## What must be true
- Every menu and screen works by tapping, including going back, pausing and changing values.
- Gameplay works by touch, unless the project says touch play isn't supported. In that case the game says so on its title screen.
- Tap targets are at least about 44x44 px and far enough apart not to hit the wrong one.
- Prompts say "Tap" or show touch controls, not keys or buttons.
- Nothing needs hover, a double tap or a long press without another way to do it.
