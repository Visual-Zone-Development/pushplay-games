# online-netcode in a PushPlay game

The general `online-netcode` skill teaches the host-authoritative model, the fixes by symptom, designing for delay and the test procedure. This page gives the same advice in terms of `net.js`, for any change to an `--online` game's networking (scaffolded with `npm run new-game <id> --online`). AGENTS.md *Online multiplayer* is the rule. Read [multiplayer.md](../multiplayer.md) first: it has the full `net.js` API. Never edit `net.js` or `lobby.js`.

## Input

- `input.onPause` already pauses the player's own controls on `visibilitychange`. The host keeps running, so a returning player rejoins the present.

## Menus

- `menu` opens the `menu.js` pause menu (Resume, Settings, Leave game). It only stops your own controls (`net.setInput({})`); the host keeps running.
- When `net.connection` is `'offline'`, show "Connection lost" with a Back to lobby item.

## Online

- The model is fixed. Every copy calls `net.setInput(...)`. Only the host runs the rules in `hostUpdate(dt)`, reading `net.inputs[id]` and writing `net.state`. Every copy draws `net.view`.
- The flow is `title` → `lobby` → `playing` ↔ `paused`, with `state.screen` and `window.__game` exposed.
- Show who's who: "You", and colours by `net.slot(id)`.
- Draw `net.status` (its usual values plus `'reconnecting'`) and `net.connection` (`'connected' | 'reconnecting' | 'offline'`) somewhere on every playable screen. The pause screen says "Reconnecting…" while reconnecting.
- Fixes by symptom:

  | Symptom | Fix |
  |---|---|
  | My own action feels late | Instant local feedback on the button press on the local copy, before the host confirms. Keep the authoritative result from `net.view` |
  | Others jump or stutter | Keep positions and angles **fractional** (they're blended between updates); keep counters whole; don't recompute wobbling floats |
  | Teleporting on respawn / big moves | Send a `net.event('teleport', { id })` so copies snap instead of gliding across the map |
  | Too much data | Only what players must see goes in `net.state`; particles, shake and sounds come from `net.event` on each copy; key collections by id (`bullets: { b17: {...} }`), never arrays that shift; no per-frame timers in state (send an end time once) |
  | Secrets visible in dev tools | Hidden info goes in `net.privateView(id)` → `net.mine`, never in `net.state` |
  | Someone leaves mid-match | Handle `net.on('leave')`: remove or freeze their character, and keep the match going if the rules allow. `end` (the host left) returns everyone to the lobby with the reason |
  | A phone locks or the app is hidden | The socket is suspended; `net.js` reconnects to the same room and seat. Read `net.status` every frame: while `'reconnecting'`, draw "Reconnecting…" over play and on the pause screen and send empty input; when `net.connection` is `'offline'`, show "Connection lost" with a Back to lobby item |
  | The host's phone locks | The match stalls for everyone. Say in the lobby "Keep this screen on while hosting". On the host's `'reconnecting'`, other copies freeze on `net.view` and show who they're waiting for. A host whose `net.connection` stays `'offline'` ends the match (`end`) |
  | Late joiner sees nothing | Everything they need to draw must be in `net.state` (they get it all once on join); don't rely on events they missed |

## Manifest

- Bump `version` whenever the netcode or the state shape changes: only builds with the same version play together.

## Debug hooks and the check

- Run `npm run dev` and play in **two browser windows**; the dev relay starts automatically. Play as host and as guest: the non-host is where lag shows.
- `window.__kitNet` shows status, players and bytes sent.
- Throttle one window (DevTools → Network → slow 4G) to feel delay.
- Take one copy offline for 20 s (DevTools → Network → Offline) and back. It must show "Reconnecting…", rejoin the same room and seat, and carry on. A phone game in device mode should do the same after `visibilitychange`.
- `npm run check` plays two copies together through a local relay. It warns above about 20 KB/s for two players; fix the bandwidth warning as well as the failures.
