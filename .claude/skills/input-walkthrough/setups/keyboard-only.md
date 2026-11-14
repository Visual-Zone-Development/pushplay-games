---
id: keyboard-only
name: Keyboard only
summary: A desktop with no mouse and no controller: everything by keyboard.
browser: --viewport 1920x1080
inputs: keyboard
optional: false
---

## How to play
`press`, `key down`, `key up` and `key hold` only. Try the keys a person would
guess first: arrows and WASD to move, Enter or Space to confirm, Escape to
pause or go back (whichever the project's controls spec says), Tab to move
between fields on a website.

## What must be true
- Every screen and every action in scope can be reached with the keyboard alone.
- The focused or selected item is always visible.
- On websites, the Tab order follows the visual order, and nothing traps focus except an open dialog, which Escape closes.
- Prompts name keys ("Space", "Esc"), not controller buttons.
- Every action in the project's controls list has a key, and holding a key for continuous movement works.
