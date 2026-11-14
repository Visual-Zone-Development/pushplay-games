---
name: online-netcode
description: Make an online multiplayer game feel good despite network delay, with host-authoritative netcode over a relay or WebSocket (one copy runs the game) — instant local feedback, smoothing, generous and fair hit rules, what belongs in synced state versus one-off events, private data for secrets, bandwidth limits, joins and leaves mid-match, dropped and reconnecting players ("Reconnecting" on phones), and testing with two copies. Use for "online feels laggy", "hits don't register", "players teleport", "too much bandwidth", "add online play", "it loses the match when my phone locks", or any change to an online game's networking.
---

# Online netcode

Follow the project's own rules first (its `AGENTS.md` or platform guide): they decide the networking layer (its relay, rooms and API), the screen flow, the checks and how to finish a change. If the project ships a networking layer, use it and read its documentation first; don't edit shared files, and don't open connections its rules don't allow. This skill is the model and the craft; the sketches show what a layer does when there is none.

## The model: the host runs the game
One copy (the host: a player's browser, or a small server) runs the rules. Every copy sends **its inputs** and draws **the state the host sends back**. A relay or WebSocket server only passes messages between the copies in a room.

```js
// every copy, each frame: send what the player is doing (only when it changed, at most ~20–30 times a second)
send({ t: 'input', x: moveX, y: moveY, jump, fire })

// host only: a fixed-rate loop reads the latest input per player and writes the shared state
function hostUpdate(dt) {
  for (const id in state.players) step(state.players[id], inputs[id] || {}, dt) // missing input = standing still
  resolveHits(state) // hits are judged here and nowhere else
}
setInterval(() => broadcast({ t: 'state', patch: diff(lastSent, state) }), 50) // changes only

// every copy, host included: draw the newest state, blended (see below); events play effects
on('state', (m) => { before = view; target = apply(view, m.patch); since = 0 })
on('event', (m) => effects[m.name]?.(m.data))
```

Three kinds of data, kept apart:

| Kind | What goes in it | How it travels |
|---|---|---|
| **State** | everything a copy needs to draw the match right now: positions, health, scores, the phase, end times | changes only; all of it once to a player who joins |
| **Events** | one-off moments: a hit, a teleport, a pickup, a round start; they trigger particles, shake and sounds on each copy | once, never stored; late joiners miss them |
| **Private data** | a hand of cards, a hidden role | from the host to that one player only, never in the shared state |

## 1. Find what feels bad
Run two copies (two browser windows on the project's dev server) and play as the **non-host**, which is where lag shows. Note: is it **input delay** (my action shows late), **jitter** (others jump around), **unfair hits** (I got hit when I'd dodged), or **bandwidth** (count the bytes sent per second; more than about 20 KB/s for two players is too much)? Have a debug readout of connection status, players and bytes sent.

## 2. Fixes by symptom
| Symptom | Fix |
|---|---|
| My own action feels late | **Instant local feedback**: play the sound, flash, muzzle effect or a small predicted motion on button press on the local copy, before the host confirms. Keep the authoritative result from the host's state |
| My character feels sluggish | Lower-latency mechanics: shorter wind-ups are hidden by local animation; movement that accelerates (rather than snapping) hides delay |
| Others jump or stutter | **Blend between updates**: draw positions and angles interpolated from the previous update to the newest over one send interval (so about 50 ms behind), never the raw latest. Keep those values fractional, keep counters whole, and don't put wobbling floats that are recomputed every frame in the state |
| Teleporting on respawn / big moves | Send a "teleport" event with the id, so copies snap instead of gliding across the map |
| Hits feel unfair | Generous hitboxes, slower projectiles, telegraphed attacks; judge hits on the host only; show hit results with a clear effect |
| Too much data | Only what players must see goes in the state; particles, shake and sounds come from events on each copy; key collections by id (`bullets: { b17: {...} }`), never arrays that shift; no per-frame timers in state (send an end time once); round positions to what the screen can show |
| Secrets visible in dev tools | Hidden info goes to its owner as private data, never in the shared state: anything a copy receives, its player can read |
| Someone leaves mid-match | Handle the leave: remove or freeze their character, keep the match going if the rules allow. When the host leaves, the match ends (or another copy takes over, if the layer supports it): return everyone to the lobby with the reason |
| A phone locks or the app is hidden | The socket is suspended. Reconnect to the **same room and seat** (a session token the client keeps; the room holds the seat for a minute or two) and resume in place. While reconnecting, draw "Reconnecting…" over play and on the pause screen and send empty input; once it has given up, show "Connection lost" with a Back to lobby item. The player's own controls pause on `visibilitychange` as in any game; the host keeps running, so they rejoin the present |
| The host's phone locks | The match stalls for everyone. Say in the lobby "Keep this screen on while hosting"; while the host is reconnecting, other copies freeze on the last state and show who they're waiting for; a host that stays offline ends the match |
| Late joiner sees nothing | Everything they need to draw must be in the state (they get it all once on join); don't rely on events they missed |

## 3. Design for the delay
About 80 ms plus network delay sits between the host and other players. Good fits: co-op, party, racing, brawlers with chunky hits, sports, turn-based and card games. Avoid frame-perfect timing; when a mechanic needs precision, make it **host-friendly for everyone** (wider windows, slower bullets, aim assist).

## 4. Flow rules that must keep working
- Title → lobby (find, host or join a room, without typed text if the game is played with a controller) → playing ↔ paused.
- **Pause can't freeze a shared world.** The pause button still opens a pause menu (Resume, Settings, Leave game), but it only stops your own controls (send empty input); the host keeps running. Leave game leaves the room and returns to the lobby.
- Show who's who: "You", and a colour per seat that every copy agrees on.
- The connection status (connected, reconnecting, offline) is visible somewhere on every playable screen; the pause screen says "Reconnecting…" while reconnecting.
- Copies must run the same build: put a protocol or game version in the room handshake and refuse a mismatch with a clear message, and raise it whenever the netcode or the state's shape changes.

## 5. Verify
1. Two windows by hand, as host and as guest; then with one window throttled (DevTools → Network → slow 4G) to feel delay. Then take one copy offline for 20 s (DevTools → Network → Offline) and back: it must show "Reconnecting…", rejoin the same room and seat, and carry on; on a phone-sized layout it should do the same after `visibilitychange`.
2. Join late (a third window mid-match) and leave mid-match as guest and as host: nothing breaks, nobody is left on a frozen screen.
3. Measure bytes per second with two players and fix what's over budget.
4. Update DESIGN.md (Changelog).
5. Run the project's checks and finish the change the way its rules say.
