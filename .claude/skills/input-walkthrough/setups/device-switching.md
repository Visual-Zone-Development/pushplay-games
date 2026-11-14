---
id: device-switching
name: Switching devices
summary: Starts on the controller, switches to keyboard and mouse halfway through, and the controller disconnects.
browser: --viewport 1280x800 --gamepad
inputs: gamepad, keyboard, mouse
optional: false
---

## How to play
All of `pad`, `press`, `key`, `click` and `mouse`, mixed in the order below.

1. Open a menu with the controller and move the selection.
2. Press a key, then move the mouse. Check what the prompts and highlight do after each.
3. Go back to the controller and confirm a menu item.
4. Start gameplay, then run `pad disconnect` mid-play.
5. Run `pad connect` and carry on with the controller.

## What must be true
- Prompts follow the device used last, and switch within a moment of using it.
- Switching device never loses the menu selection or leaves two items highlighted.
- Disconnecting the controller during play pauses the game (or the project's spec says otherwise), and it doesn't resume by itself.
- Reconnecting lets the player carry on without reloading.
