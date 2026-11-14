# touch-controls in a PushPlay game

The general `touch-controls` skill covers picking a scheme per verb, the tuning numbers (dead zone, tap vs hold, swipe), feedback and the test procedure. This page gives the PushPlay side: how to do it with `input.js` and `touch.js`. AGENTS.md *Controls* and *Input hints* are the rules. Never edit `touch.js` or `input.js`: the scheme lives in `game.js`.

## Input

- `input.js` already turns the mouse and fingers into `input.pointer` (the first finger: `x, y, down, pressed, released`) and `input.pointers` (every finger, by id), in game units. It doesn't decide how a finger *means* "move left" or "jump". For a stick and buttons the kit has `touch.js`; for tap, swipe and drag schemes, write a few lines in `game.js`.
- **Multitouch:** every gesture tracks its own pointer id from `input.pointers`. A second finger never cancels the first: the stick thumb stays down while the other thumb taps jump. Ignore a third finger.
- `input.mode` switches to `'touch'` on the first finger and back to `'gamepad'` on the first button press, so a tablet player can swap mid-run. The controls hide and show with it.
- Keep the controller, keyboard and mouse forms of every verb. Prompts come from `input.label()` / `drawPrompts`, which say "Tap" in touch mode. Build prompt strings every frame.
- A pointer-driven scheme (tap-to-move, drag) needs its stick or snapping form for the Deck (AGENTS.md *Controls*): `input.navX` / `input.navY` to move a highlight, `a` to confirm.
- Give slightly stronger aim assist when `input.mode === 'touch'`.
- "Tap anywhere" schemes ignore taps on the pause button and inside `fit.safe`.
- Local multiplayer: touch can't join as an extra player. The on-screen controls belong to player 1 (the merged `input`), pads to `input.pads[i]`.

## Settings

- Touch feedback honours `settings.data.reducedShake` (no flashes).

## Audio

- Phones in PushPlay get no rumble, so every touch needs to be seen and heard. Play audio through `audio.js` as for any action, with a distinct click for UI taps.

## Touch

Use `touch.js` for the stick and buttons:

```js
import { createTouchControls } from './touch.js'
const touch = createTouchControls(input, {
  stick: true, // left thumb zone → input.x, input.y (floating origin, dead zone built in)
  buttons: ['a', 'b'], // right thumb zone, ≥ 64 px round buttons → input.held / pressed / released
  labels: { a: 'Jump', b: 'Dash' }, // drawn on the buttons; keep to one word
})
// each frame, during play:
input.update(dt)
touch.update() // right after input.update(), before the game reads input
// …game logic reads input.x, input.pressed('a') as always…
touch.draw(ctx) // last, over the HUD; draws nothing unless input.mode === 'touch'
```

- It writes into the same `input` the game already reads, so no gameplay code changes: a Deck player's stick and a thumb produce the same `input.x`. Don't read `input.pointer` for movement as well, or the stick and the drag will fight.
- `buttons` are the pad names from the AGENTS.md table (`a`, `b`, `x`, `y`), up to four. Use the ones the game maps: buttons are for anything a Deck player does with `a b x y`. `menu` is never a touch button; the on-screen pause button is.
- It draws only while `input.mode === 'touch'`, so plugging a controller into a tablet hides it, and `input.label()` switches to button names at the same time. Don't add your own "controller connected" check, and don't draw it on the title or pause screens.
- It lays itself out in the thumb zones from the space given to `input.attach` and keeps clear of `fit.safe`. If you move the pause button or the HUD, keep them out of those zones instead of moving the controls.
- A game that uses tap-to-move or swipes doesn't need it. A game that uses only buttons passes `stick: false`.
- Draw touch feedback with `touch.js` or in `game.js`, never with DOM elements.
- The general skill's schemes, in kit terms:

  | Scheme | In a PushPlay game |
  |---|---|
  | Virtual stick | `touch.js` |
  | Aim | a `touch.js` second stick, or tap where to shoot |
  | Jump / dash / fire / use | `touch.js` buttons |

## Screen and scaling

- The general skill's `references/phone-layout.md` is the platform-neutral rewrite of the kit's phone guide. In a PushPlay game read [phone.md](../phone.md) instead: it has the same layout rules plus everything that names the kit.

  | Topic | What phone.md adds for PushPlay |
  |---|---|
  | Plays-on labels | Handheld & controller, Desktop, Tablet, Phone and Party are read from `pushplay.json` and backed by `npm run check`. Phone needs `"phone": { "orientation": … }`, `"touch"` in `inputs` and a green phone pass |
  | The spaces | 1280×800 is the default (the Deck's screen and the launcher's window). Phone spaces are `fitCanvas` with `{ w: 720, h: 1280 }` or `{ w: 1280, h: 720 }`, set up by `npm run new-game <id> --phone portrait\|landscape`. `input.attach(canvas, w, h)` agrees with the manifest's `phone` field. `"orientation": "any"` swaps layouts on `fit.onResize`. A 1280×720 game letterboxes on the Deck (1280×720 in 1280×800) |
  | Fill the screen | `fitCanvas(canvas, { w, h, fill: true })` (kit v11), `fit.w` / `fit.h`, `fit.minW` × `fit.minH`, `fit.onResize`. `input` and `touch.js` follow the live size on their own |
  | Safe areas | `fit.safe` → `{ top, right, bottom, left }`, e.g. `x = fit.safe.left + 32`. Use it instead of reading `env(safe-area-inset-*)` yourself |
  | Thumb zones | measured from `fit.safe.top` / `fit.safe.bottom`; `touch.js` is the stick and buttons; `menu.js` centres menu items |
  | Text and tap sizes | the phone pass measures text, and the check fails under 32 px; sizes scale with `settings.data.textScale` |
  | What phones can't do | there is no `b`: the kit settings screen has a Back item (`{ id: 'back', label: 'Back' }`) and `touch.js` can give `b` a button. `input.label()` says "Tap". `input.onPause` lands on `paused` (it does in a kit starter). `audio.js` resumes on the next input. `fitCanvas` caps at `maxDpr`. The PushPlay app rotates a game with a fixed `orientation`: don't write your own orientation-lock code |
  | Controllers on tablets | `input.js` reads the Gamepad API, `input.mode` becomes `'gamepad'`, `touch.js` draws nothing unless `input.mode === 'touch'`, and extra pads are `input.pads[i]`. This is what earns Handheld & controller and Desktop for a phone game |
  | Online games on phones | `net.js` reconnects to the same room and seat; see [online-netcode.md](online-netcode.md) |
  | Party games on a tablet | the tablet is the TV running `game.js`: the QR code, `party.js`, the 1280×800 TV layout; see [party.md](../party.md) |
  | The phone check pass | the mouse-only pass; the phone pass at 390×844 / 844×390 at DPR 3, expecting `state.screen === 'paused'`; the 32 px text failure; `"orientation": "any"` runs both sizes |

## Debug hooks and the check

- DevTools device mode (iPhone 14 at 390×844 and rotated, DPR 3, touch on): play two minutes with thumbs only.
- Plug in or fake a gamepad: the controls disappear and prompts change on the first press. Nothing in gameplay is touch-only.
- `npm run check`: the phone pass runs touch-only at phone size if the manifest has `phone`, and the touch pass taps the title menu in every game.
- Try a real phone if possible: `npm run dev -- --host`. Ask the user whether their thumb finds the main button without looking; that's the test.
- Tuning is a patch `version` bump, a new scheme a minor one. Update *Controls* in DESIGN.md with a *Touch* column or a line per verb.
- For the whole phone layout (portrait or landscape, the manifest's `phone` field, the Phone label), use the `mobile-port` skill.
