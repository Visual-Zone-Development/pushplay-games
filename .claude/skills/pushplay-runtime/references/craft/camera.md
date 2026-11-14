# camera in a PushPlay game

The general `camera` skill covers follow, dead zones, look-ahead, room locks, framing, zoom, shake and 3D cameras. This page gives the PushPlay side. AGENTS.md *Controls*, *Settings* and *Screens and scaling* are the rules.

## Input

- A 3D chase camera sits behind at a fixed distance and height, follows with damping, and turns with the right stick (`input.aimX` / `input.aimY`), with sensible limits on pitch.

## Settings

- Apply shake as an offset **after** following, from a decaying trauma value (see [game-feel.md](game-feel.md)), and skip it when `settings.data.reducedShake` is on.

## Screen and scaling

- The logical screen is always 1280×800; the camera decides which part of the world maps onto it.
- For 2D, keep a camera object `{ x, y, zoom }` and draw the world inside `save()` / `restore()`:

  ```js
  ctx.save()
  ctx.translate(640 - cam.x * zoom, 400 - cam.y * zoom)
  ctx.scale(zoom, zoom)
  // … draw the world …
  ctx.restore()
  // … draw the HUD in screen space …
  ```

- Check at 1280×800 and in a 16:9 window: `fitCanvas` letterboxes, the camera itself doesn't change.
