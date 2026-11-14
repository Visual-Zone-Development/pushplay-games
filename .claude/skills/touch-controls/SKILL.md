---
name: touch-controls
description: Design and build the touch gameplay input of the game in this repo — virtual stick vs tap-to-move vs swipe vs drag, button placement for thumbs, multitouch, dead zones, feedback without haptics (visual and audio), one-handed portrait schemes, and hiding the on-screen controls when a controller is connected to the tablet. Use for "add touch controls", "the virtual stick feels bad", "my thumb covers the player", "make it one-handed", "buttons are in the wrong place", "the controls show up with my controller", or the input part of bringing a game to phones and tablets. Pairs with game-feel (how it feels) and game-ui (where the HUD goes).
---

# Touch controls

Follow the project's own rules first (its `AGENTS.md` or platform guide): they decide the input APIs, the screen size, the checks and how to finish a change. If the project ships its own on-screen stick and buttons or a pointer layer, use those instead of the sketches below, and never edit shared files the project says not to touch.

**Read [references/phone-layout.md](references/phone-layout.md)** (thumb zones, safe areas, sizes). Read the game's `DESIGN.md` *Controls* table: every touch verb below maps to one of its rows, so a controller or keyboard player plays the same game.

Turning fingers into positions is the easy half: Pointer Events give every finger an id, a position and down / move / up, and one conversion puts them in the game's logical space. What that doesn't decide is how a finger *means* "move left" or "jump": that's this skill. Sizes below are for a logical space about 1280 units wide; scale them for another.

## 1. Pick the scheme from the verb
Write the game's verbs (move, aim, jump, shoot, place, select, dash) and pick one row each. Fewer distinct gestures is better; one gesture per verb; nothing that needs two gestures at once unless the game is two-thumb by design.

| Verb | Scheme | When | Watch out |
|---|---|---|---|
| Move freely (platformer, twin-stick, racer) | **Virtual stick**, left thumb zone | the game needs analogue direction or holding a direction | floating origin (appears where the thumb lands) beats a fixed one; dead zone 12–16 % of the radius |
| Move to a place (top-down, strategy, puzzle) | **Tap-to-move** / tap a cell | discrete destinations, slow pace | show the destination marker; pathing must be forgiving (tap near a cell = that cell) |
| Lanes, directions, flips | **Swipe** (≥ 48 px in ≤ 250 ms, from any point) | runners, match games, card swipes | a short tap is still a tap; decide the direction from the dominant axis; one swipe per finger lifetime |
| Aim and shoot | **Right stick** (a second virtual stick) or **tap where to shoot** | twin-stick: stick; slower games: tap target | auto-fire while the aim stick is held, so one thumb does both; tap-to-shoot needs generous hitboxes (a finger is ~ 40 px) |
| Pick up, place, drag | **Drag** with the object drawn above the finger | puzzles, builders, card games | snap to grid or nearest slot on release; a tap on the same object is "select" |
| Jump, dash, fire, use | **On-screen buttons**, right thumb zone | anything a controller player does with the face buttons | ≤ 4 buttons, round, ≥ 64 px; the most used one biggest and lowest; order them like a pad (A bottom, B right, X left, Y top) |
| Hold or charge | hold a button | charge shots, sprint | show the charge ring on the button itself; offer a toggle in Settings (accessibility) |
| Screen-wide "tap anywhere" | tap outside the HUD | one-button games (flappers, tappers) | ignore taps on the pause button and inside the safe-area insets; the whole play field is the target |

**One-handed portrait** (standing on a bus): everything in the bottom third, under one thumb. Good schemes: tap anywhere; tap left / right halves; a single horizontal slider for movement with auto-fire; swipes. Don't put a stick *and* buttons in a portrait game unless it's held with two hands by design.

**Two-thumb landscape**: stick left, 1–4 buttons right, both in the lower two-thirds of each side (about 320 px wide); the action framed between them.

## 2. Build the stick and buttons as an input source
The on-screen controls write into the **same input state the game already reads** (its move axis and its named buttons), so no gameplay code changes: a controller's stick and a thumb produce the same value. A sketch, when the project has nothing of its own:

```js
// once: canvas.style.touchAction = 'none' (stops the page scrolling and zooming under the thumbs)
const R = 60, DEAD = 0.14 // full deflection at 60 px, dead zone 14 %
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }
const toGame = (e) => { // CSS pixels → the game's logical space
  const r = canvas.getBoundingClientRect()
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }
}
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return
  const p = toGame(e), b = buttonAt(p) // buttons own their finger
  if (b) { b.id = e.pointerId; b.held = true; b.pressed = true }
  else if (stick.id === null && inLeftZone(p)) Object.assign(stick, { id: e.pointerId, ox: p.x, oy: p.y })
})
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stick.id) return
  const p = toGame(e)
  let dx = p.x - stick.ox, dy = p.y - stick.oy
  const d = Math.hypot(dx, dy)
  if (d > R) { stick.ox += dx * (1 - R / d); stick.oy += dy * (1 - R / d); dx *= R / d; dy *= R / d } // origin follows
  const m = Math.max(0, (Math.min(d, R) / R - DEAD) / (1 - DEAD)) // rescale 0..1 past the dead zone
  stick.x = d ? dx / Math.min(d, R) * m : 0; stick.y = d ? dy / Math.min(d, R) * m : 0
})
const up = (e) => { // one handler for pointerup and pointercancel
  if (e.pointerId === stick.id) Object.assign(stick, { id: null, x: 0, y: 0 })
  for (const b of buttons) if (b.id === e.pointerId) { b.id = null; b.held = false; b.released = true }
}
```
Each frame, after the game has read its other devices and before gameplay reads input: add `stick.x / y` to the move axis, merge each button's `held / pressed / released` into the game's named button, then clear `pressed` and `released`. Draw the controls last, over the HUD.

- **One owner per finger.** Movement comes from the stick or from a drag on the world, never both, or they fight.
- Buttons carry the game's own action names (up to four), with a one-word label on each ("Jump"). Pause is never one of them: it's the separate pause button in a top corner.
- **Show them only while touch is the last device used.** Track the last input device (touch, gamepad, keyboard, mouse); a controller plugged into a tablet hides the controls on its first press, and the input prompts switch to button names at the same moment. Don't draw them on the title or pause screens.
- Lay them out in the thumb zones from the current logical size, clear of the safe-area insets; if the pause button or the HUD collides, move those, not the controls.
- A game that uses tap-to-move or swipes doesn't need a stick; a game that only needs buttons draws no stick.

## 3. Tune it like a controller
Numbers in `TUNING`, same as any input feel ([game-feel](../game-feel/SKILL.md)):
- **Dead zone** 12–16 % of the stick radius, then scale 0..1 from there so small pushes still move. Full deflection at about 60 px from the origin, not the drawn ring's edge, so the thumb doesn't have to travel far.
- **Floating origin**: the stick appears where the thumb lands in the left zone and follows it when it drags past the radius, so a long push doesn't pin the thumb to the edge.
- **Tap vs hold**: a touch under 150 ms and 12 px of travel is a tap; longer is a hold or a drag. Decide on release for taps, on the threshold for drags, so a tap never also starts a drag.
- **Swipe**: direction from the dominant axis, minimum 48 px, maximum 250 ms; fire once per finger. Accept a swipe that starts on a button? No: buttons own their finger.
- **Multitouch**: every gesture tracks its own pointer id; a second finger never cancels the first (the stick thumb stays down while the other thumb taps jump). Ignore a third finger.
- **Forgiveness** is bigger on touch: wider hitboxes for taps (a finger is ~ 40 px), jump buffers and coyote time at the high end of their ranges (~ 120 ms), slightly stronger aim assist while touch is the active device.
- The finger hides what it touches: draw dragged objects 60–80 px above the touch point, and never put the thing the player watches under their thumb.

## 4. Feedback without haptics
Don't count on vibration (browsers on many phones have none, and players turn it off), so every touch needs to be seen and heard:
- Buttons: a pressed state within one frame (scale 0.92, brighter fill), a release pop, and the game's own sound for the action. The stick shows its knob offset and a faint ring at the dead zone.
- Taps on the world: a short ripple or marker where the finger landed, so a missed tap is understood as "missed", not "broken".
- Swipes: a brief streak in the swipe direction.
- Audio through the game's audio layer as for any action; a distinct click for UI taps.
- All of it honours the game's reduced shake / flash setting (no flashes) and is drawn on the game's canvas, not with DOM elements laid over it (they scale, theme and capture differently from the game).

## 5. Keep every other input right
- The controller, keyboard and mouse forms of every verb stay, and prompts come from the game's input-prompt helper (never literal key names), built every frame so they follow the device. In touch mode show no button prompts: things that can be tapped should look tappable.
- The active device switches to touch on the first finger and back to the controller on its first button press, so a tablet player can swap mid-run; the controls hide and show with it.
- A pointer-driven scheme (tap-to-move, drag) needs a form without a pointer for controller and keyboard players: stepped navigation that moves a highlight between cells or targets, and confirm to choose.
- Local multiplayer: touch can't join as an extra player; the on-screen controls belong to player 1, the pads to everyone else ([local-multiplayer](../local-multiplayer/SKILL.md)).

## 6. Verify
1. Browser DevTools device mode (a phone preset such as 390×844 and rotated, DPR 3, touch on): play two minutes with thumbs only. Can you keep moving while jumping? Does a swipe ever read as a tap? Does anything spawn under a thumb?
2. Plug in (or fake, see [local-multiplayer](../local-multiplayer/SKILL.md) step 5) a gamepad: the controls disappear and prompts change on the first press; nothing in gameplay is touch-only.
3. A real phone if possible: serve the project's dev server on the local network and open it on a phone on the same Wi-Fi. Ask the user whether their thumb finds the main button without looking; that's the test.
4. Update DESIGN.md *Controls* (a *Touch* column or line per verb) and its Changelog.
5. Run the project's checks and finish the change the way its rules say.
