# Input setups

Each file here is one way a person plays: a screen size and pixel density, plus the **only** inputs they have. The walkthrough goes through every screen, and the game itself, using that setup alone.

A project can add or replace setups in its own `input-setups/` folder at the repo root (or next to the game): a file with the same `id` replaces the one here, a new `id` is added, and `disabled: true` in its frontmatter removes the one here.

## File format

```markdown
---
id: kebab-case-id
name: Short name
summary: One line: the device and the inputs
browser: Flags for `browser.mjs start` (screen, --gamepad, --touch, ...)
inputs: gamepad | keyboard | mouse | touch, comma-separated   # the only ones allowed
optional: true | false     # optional setups run only when asked for or clearly relevant
---

## How to play
## What must be true
```

**How to play** lists the `browser.mjs` commands allowed in that setup. Commands for other inputs are off limits: a controller-only player has no mouse, so `click` and `mouse` are out. Checking state with `eval` and taking screenshots are always allowed, because they're observation, not input.
