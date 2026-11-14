---
name: local-multiplayer
description: Add or improve couch multiplayer for the game in this repo — 2–4 players on one screen, one controller each through the Gamepad API, a join screen where each controller presses to join, player colours and spawns, a shared camera, co-op or versus rules, catch-up mechanics, rounds and a results screen; on a handheld, a PC, a TV or a tablet with several Bluetooth controllers. Use for "add local co-op", "make it 2 player", "versus mode", "my friends want to play together on one screen", "two controllers on my iPad", or improving a local multiplayer game. For online play use online-netcode.
---

# Local multiplayer

Follow the project's own rules first (its `AGENTS.md` or platform guide): they decide the input API (how to read one controller at a time), the screen names, the checks and how to finish a change. Read the game's `DESIGN.md` and the Fellowship notes in [framework.md](../game-design/references/framework.md).

## 1. Decide the shape
- **Co-op or versus?** Co-op: shared goal, revive, shared lives or score. Versus: rounds, a score to win (first to 3–5), a quick rematch.
- **One shared screen** (no split screen on a small display): one arena that fits, or a camera that frames everyone (see the [camera](../camera/SKILL.md) skill).
- **Rounds of 1–3 minutes**, then a results screen that's fun to look at together.
- **Drop in / drop out:** new players join from the title or between rounds; a player who drops (pad disconnected) becomes a gap, not a crash.

## 2. Input rules
- Each player reads **their own pad**, never a merged view of all devices; the merged view is for menus only. If the project's input layer has a per-controller view, use it. Otherwise read the Gamepad API directly:

```js
const prev = [] // last frame's buttons, per pad index
function readPads() { // once per frame; getGamepads() returns fresh snapshots each call
  const out = []
  for (const gp of navigator.getGamepads()) {
    if (!gp || !gp.connected || gp.mapping !== 'standard') continue
    const was = prev[gp.index] || [], now = gp.buttons.map((b) => b.pressed)
    const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v) // stick dead zone
    out.push({
      index: gp.index,
      x: dz(gp.axes[0]) || (now[15] ? 1 : 0) - (now[14] ? 1 : 0), // stick, else d-pad
      y: dz(gp.axes[1]) || (now[13] ? 1 : 0) - (now[12] ? 1 : 0),
      held: (b) => !!now[b], pressed: (b) => !!now[b] && !was[b], // 0 A, 1 B, 2 X, 3 Y, 9 Start
    })
    prev[gp.index] = now
  }
  return out
}
```
- A player's slot remembers the pad's `index`, which stays the same while the pad is connected; browsers only list a pad after its first button press, which is exactly what a join screen asks for.
- Player 1 may also play on the keyboard; say so on the join screen.
- Pause from any pad pauses for everyone; the shared pause menu takes input from every device.
- Never rely on chords, or on buttons the system or the platform may keep for itself (Home / Guide, a browser's function keys, Start+Select style combinations).
- Mouse and touch can't join as extra players; if gameplay needs pads, say "Needs controllers" on the title screen and don't list the game as mouse or touch playable. Menus still work with every input.
- **A tablet with several Bluetooth controllers** is the same couch: one slot per pad and nothing changes in the game. Don't assume player 1 has a keyboard (a tablet has none); if the game also plays solo by touch, the on-screen controls belong to player 1 only and hide once a pad is used ([touch-controls](../touch-controls/SKILL.md)). Keep the join screen and HUD inside the safe area so a tablet's rounded corners and home bar don't cover a player's slot ([phone-layout.md](../touch-controls/references/phone-layout.md)).

## 3. Join screen
- The join screen is a step between the title and play (part of the title screen or its own sub-step), not an online-style lobby; keep the project's screen names.
- One slot per player: "⟨confirm button⟩ to join" in each empty slot, the button name coming from the game's input-prompt helper and built every frame; a slot fills when that pad presses confirm, shows the player's colour and name ("P2"), and back on that pad leaves.
- Start when at least the minimum have joined (any joined player presses confirm again, or a countdown).
- Colours: 4 distinct, colourblind-safe colours, each paired with a shape or number marker (P1–P4 icons above heads).

## 4. Fairness and fun
- **Catch-up mechanics:** the leader is a bigger target, trailing players respawn faster or get better pickups, rubber-banding in racers; keep it subtle.
- **Spawns:** spread evenly, never on top of an opponent, brief invulnerability after respawn.
- **Moments to shine:** individual stats on the results screen (most hits, longest combo, "clutch save").
- **Readable chaos:** cap effects, keep each player's character distinct, and label who did what in big moments.

## 5. Build and verify
1. Say how many can play wherever the project lists it (its metadata or store listing, the title screen, DESIGN.md *Players*).
2. Per-player state in an array indexed by slot; Restart resets all players but keeps who joined.
3. Test by hand with two controllers, or in a headless-browser script that replaces `navigator.getGamepads` before the page loads (Playwright's `page.addInitScript`) to return two fake pads (`{ index, connected: true, mapping: 'standard', axes, buttons: [{ pressed, value }] }`) whose buttons and axes follow a timeline; also test that 1 player alone still works.
4. Unplug a pad mid-game (`gamepaddisconnected`, or the pad missing from `getGamepads()`): pause, or leave that slot empty and carry on; when every pad is gone, pause. Never crash, and never hand the slot to another pad silently.
5. Update DESIGN.md (Players, Controls, Changelog).
6. Run the project's checks and finish the change the way its rules say.
