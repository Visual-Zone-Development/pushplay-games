# Laying a game out for phones and tablets

How to make a web game comfortable on a phone or a tablet: which way up, where thumbs go, what
the system covers, how big things must be, and what happens when the screen locks. The project's
own rules decide the logical resolution and the scaling layer; this guide says what to do with
them. The [touch-controls](../SKILL.md) skill covers the on-screen controls themselves.

## Pick a logical space

A game draws in a fixed logical space and scales it to the window. A space made for a wide
handheld or a desktop window (16:10 or 16:9) already suits a **tablet in landscape**. A phone
needs a choice:

| Space | For | Shown on |
|---|---|---|
| **Portrait**, 9:16 (e.g. 720×1280) | one-handed phone games: tappers, stackers, endless runners, puzzles, cards | a phone held upright, a tablet upright |
| **Landscape**, 16:9 (e.g. 1280×720) | two-thumb phone games: platformers, shooters, racers, anything with a stick | a phone or tablet held sideways, and (with bars or a little extra view) handhelds and desktop windows |

Sizes in this guide are in those units: a space 720 wide in portrait, 1280 wide in landscape.

Which one?

- **Portrait** when the game is played with one thumb, the action is vertical (falling,
  climbing, stacking, a lane runner) or it's turn-based (cards, puzzles, words). Portrait games
  are the ones people play standing in a queue.
- **Landscape** when the game needs a stick and buttons, a wide view (a side-scroller, a racer,
  a twin-stick arena), or it should also feel at home on a handheld and a tablet with a
  controller. A 16:9 game letterboxes slightly on a 16:10 screen and fills a 16:9 window exactly.
- A game that already exists in a wide space is usually closest to **landscape**: most of the
  work is moving the HUD out of the thumbs' way and raising text sizes.
- **Both** means laying every screen out twice and swapping when the window turns. That's more
  work and rarely worth it; pick one unless the design really plays both ways.

## Fill the screen

Phones are not all the same shape (19.5:9, 20:9, 4:3 tablets). A fixed space letterboxes: on a
20:9 phone a 720×1280 game loses about a sixth of the height to bars. Bars in the game's
background colour are acceptable; never white, never transparent.

Better for a phone game: treat the logical size as the **smallest** space and let it grow to the
screen's shape, never stretched. A 720×1280 minimum becomes 720×1604 on a 412×918 phone,
720×1560 on a 360×780 one, 983×1280 on a 768×1024 tablet. Then:

- Read the live width and height every frame (or on resize); never cache them. Anchor the HUD
  and buttons to the edges and the safe-area insets, centre titles on the live centre, and place
  menus from the current size.
- Keep what decides difficulty inside the minimum space: a taller phone may see further ahead,
  a tablet more to the sides, but never get wider gaps or slower hazards. Fill the extra room
  with background (stars, sky, floor), never with things that change the game.
- Pointer positions and on-screen controls follow the live size too.

The page needs `<meta name="viewport" content="width=device-width, initial-scale=1,
viewport-fit=cover">` to reach the edges of the screen, and `touch-action: none` on the canvas so
the page doesn't scroll or zoom under the thumbs.

## Safe areas

Phones draw into the notch or camera cut-out and under the home indicator. The browser reports
how much of each edge the system covers as `env(safe-area-inset-top)` and its three siblings (in
CSS pixels; they need `viewport-fit=cover`). If the project's scaling layer doesn't already give
them to you in game units, read them from a probe element and convert:

```js
// <div id="safe" style="position:fixed; visibility:hidden; padding:
//   env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)">
const cs = getComputedStyle(document.getElementById('safe'))
const k = logicalWidth / canvas.getBoundingClientRect().width // CSS px → game units
const safe = { top: parseFloat(cs.paddingTop) * k, right: parseFloat(cs.paddingRight) * k,
  bottom: parseFloat(cs.paddingBottom) * k, left: parseFloat(cs.paddingLeft) * k }
```

The values change when the phone turns (the notch moves to a side in landscape) and are zero on
a handheld or a PC. Read them every frame or on resize, never once at load.

Rules:
- Nothing the player **reads or taps** goes inside a safe inset: score, timer, prompts, pause
  button, menu items. Backgrounds and the world may extend under them.
- On top of the insets keep the usual margin: important HUD ≥ 32 px from the edge of the
  *safe* area, so `x = safe.left + 32`, not `x = 32`.
- The pause button sits in the top corner, inside the safe area, ≥ 56 px (64 px is better on a
  phone). On a phone in landscape the top corners are reached with the index fingers, which is
  fine for pause; it's wrong for anything pressed during play.
- Typical sizes, in game units: a portrait notch takes about 90 px at the top and the home
  indicator about 60 px at the bottom; in landscape the cut-out takes about 70 px on one side.
  Don't hard-code these; read the insets.

## Thumb zones

A phone is held, not propped up, so the thumbs cover part of the screen and can't reach all of
it. Lay the screen out in three bands.

Portrait, one hand or two:

```
┌───────────────────────────┐  ← top inset (notch)
│  HUD: score, timer, lives │  read-only, ≥ 32 px text
│  (nobody taps up here)    │
├───────────────────────────┤
│                           │
│        the game           │  the action; nothing to press
│                           │
│                           │
├───────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░ │  easy reach: taps, swipes,
│ ░░ left   ░░░░   right ░░ │  on-screen controls, menu's
│ ░░ thumb  ░░░░   thumb ░░ │  main items
│ ░░░░░░░░░░░░░░░░░░░░░░░░░ │
└───────────────────────────┘  ← bottom inset (home bar)
```

Landscape, both hands:

```
┌──────┬─────────────────────────────────────┬──────┐
│ safe │  HUD top-centre        pause ▢ (≥56)│ safe │  ← notch is on one side
│      ├─────────────────────────────────────┤      │
│ ░░░░ │                                     │ ░░░░ │
│ ░░L░ │            the game                 │ ░R░░ │  thumbs cover ~320 px on
│ ░░░░ │                                     │ ░░░░ │  each side, lower two-thirds
│ stick│                                     │ a b  │
└──────┴─────────────────────────────────────┴──────┘
```

- **Easy reach** (shaded): the bottom third in portrait, the lower two-thirds of each side in
  landscape, about 320 px wide. Put everything the player presses during play here: the virtual
  stick on the left, buttons on the right (see [touch-controls](../SKILL.md)).
- **The game** sits where thumbs don't cover it. The hero and the next threat must be visible
  with two thumbs on the screen; anything that spawns under a thumb is unfair.
- **HUD** goes at the top, read-only, inside the safe area. The pause button is the only tap
  target up there.
- Menus: in portrait, stack items vertically in the lower two-thirds (the first item at about
  y = 560 of 1280, not at the top); in landscape, centred is fine. Every item is ≥ 56 px tall
  with ≥ 12 px between items so a thumb can't hit two.

## Text and tap sizes

Phones are small and held further from the eye than a handheld on the lap.

| | Wide space on a handheld or desktop | Phone spaces |
|---|---|---|
| Body and HUD text | ≥ 24 px | ≥ **32 px** |
| Headings | ≥ 32 px | ≥ 44 px |
| Tap target | ≥ 56 px (pause button) | ≥ 56 px; on-screen buttons ≥ **64 px**, 24 px apart |
| HUD margin | 32 px from the edge | 32 px from the edge of the **safe** area |

All sizes still multiply by the game's text-size setting; test the largest setting for overlaps.
Text at 32 px in a 720-wide space is about 17 CSS px on a 390-wide phone, which is the floor;
40 px reads comfortably.

## What phones can't do

- **No hover, no cursor, no right-click.** Anything shown on hover must be shown always or on
  tap. A controller's "back" button has no touch equivalent: every menu a player can leave needs
  a visible **Back** item, and during play a back or cancel action needs an on-screen button.
- **No keyboard.** Don't ask for typed text during play, and build key hints with the game's
  input-prompt helper so they don't name keys the player doesn't have.
- **Precision is poor.** A finger is ~ 40 px wide in game units and hides what's under it. No
  tiny targets, no pixel-precise drags; snap drags to a grid or to targets, and offset dragged
  objects above the finger so the player can see them.
- **Timers lie after a background.** `requestAnimationFrame` stops while hidden, so the first
  `dt` after coming back can be seconds; clamp it (`Math.min(1/20, dt)`).
- **Notches and home bars** cover the edges (see *Safe areas*). Browsers may also keep a
  system gesture on the very bottom edge, so a swipe starting there may not reach the game.
- **Performance** varies more than on a handheld console: a mid-range phone at DPR 3 pushes
  many pixels. Cap the device pixel ratio the game renders at (2 is plenty); cap particles; no
  `shadowBlur` in the loop.
- **Orientation** can change mid-game. A game laid out for one orientation shows a letterboxed
  view (or a "turn your phone" card) the other way up; it mustn't crash or lose the run. The
  Screen Orientation lock only works in fullscreen or an installed app, so don't depend on it.

## Screen lock and backgrounding

A phone call, a notification tap or the lock button hides the page at any moment. The page gets
`visibilitychange` and `document.hidden` turns true.

```js
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAndSave() })
```

- The handler must land on the pause screen **and save**: the browser may discard the page
  while it's hidden.
- Audio stops; resume the audio context on the next input, not on return.
- **Never auto-resume.** The player comes back to the pause menu and presses Resume.
- Connections drop too: an online game's socket is suspended while hidden (see
  [online-netcode](../../online-netcode/SKILL.md) for reconnecting).

## Controllers on tablets (and phones)

A tablet with a Bluetooth controller is a handheld with a bigger screen: the Gamepad API reports
it like any other pad. On its first press the active device becomes the controller, prompts
switch to button names and the on-screen controls hide.

- Don't tie gameplay to touch alone. A landscape phone game should play with a pad and a
  keyboard too.
- **Several pads on one tablet** is a valid couch for a [local-multiplayer](../../local-multiplayer/SKILL.md)
  game. The join screen must not assume player 1 has a keyboard; touch can't join as an extra
  player.
- When a pad is connected, the thumb zones stop mattering and the safe areas still do.

## Try it

Browser DevTools device mode (a recent iPhone or Pixel preset, about 390×844 at DPR 3, touch
emulation on): menus by tap, play with thumbs, rotate the device, and fake a screen lock from the
console:

```js
Object.defineProperty(document, 'hidden', { value: true, configurable: true })
document.dispatchEvent(new Event('visibilitychange'))
```

Then a real phone: serve the project's dev server on the local network and open the address on
a phone on the same Wi-Fi. Thumbs find problems that a mouse pointer in device mode never will.
