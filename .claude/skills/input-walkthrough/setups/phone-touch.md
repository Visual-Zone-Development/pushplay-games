---
id: phone-touch
name: Phone, touch
summary: A phone held upright (390x844), touch only.
browser: --device mobile
inputs: touch
optional: true
---

Optional: run it when asked for, for websites, or when the project says it
runs on phones (a phone controller screen, a mobile web build).

## How to play
`tap` and `scroll` only.

## What must be true
- Everything in `touch-only` holds, at phone width.
- Nothing needs a landscape screen, or if it does, the page clearly asks the player to rotate and works once rotated.
- Nothing scrolls sideways, and fixed bars and the on-screen keyboard don't cover what the player needs.
- Text is readable without zooming.
