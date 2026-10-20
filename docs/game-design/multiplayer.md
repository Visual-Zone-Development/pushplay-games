# Online multiplayer

Online games play through one shared relay that is already set up. The game maker configures
nothing: no server, no keys, no accounts. The kit gives every online game the same three files,
and the AI writes only the game.

```sh
npm run new-game <id> --online --players 2-4
```

| File | What it is | Edit it? |
|---|---|---|
| `net.js` | Connection, rooms, and the shared state that syncs itself | No. Shared by every online game |
| `lobby.js` | The controller lobby: Quick match / Host / Join, open-games list, waiting room | No. Style it with `createLobby` options |
| `game.js` | Starter: title → lobby → play, with the host running the rules | Yes: this is the game |

The scaffold also sets `"online": true` and `"players"` in `pushplay.json`.

## How it works: the host runs the game

One player's copy (the **host**, whoever opened the room) runs the real game. Everyone else
sends only their controls and draws what the host says is happening. This keeps every copy in
agreement without the relay knowing anything about the game.

```js
const net = createNet({ minPlayers: 2, maxPlayers: 4 })

// every frame, on every copy
net.setInput({ x: input.x, y: input.y, fire: input.held('a') })
if (net.isHost) hostUpdate(dt) // the rules: read net.inputs, write net.state
net.update()
draw(net.view) // what to draw: net.state, smoothed between updates

function hostUpdate(dt) {
  for (const id of net.players) {
    const ship = (net.state.ships ??= {})[id] ??= { x: 640, y: 400, hp: 3 }
    const i = net.inputs[id] ?? {}
    ship.x += (i.x ?? 0) * TUNING.speed * dt
  }
}
```

| API | |
|---|---|
| `net.isHost`, `net.me`, `net.players` | Who you are; player ids in join order, host first |
| `net.slot(id)` | 0 for the host, 1, 2…: use it for colours and spawn points |
| `net.state` | Host: write the game here. Players: the newest state received |
| `net.view` | Draw this on every copy (the host's is its own state) |
| `net.inputs[id]` | Host: each player's latest `setInput` value, including the host's own |
| `net.event(name, data)` | One-off moments everyone should see or hear (goal, explosion, round over) |
| `net.on(type, fn)` | `join`, `leave`, `start`, `end` (host left), `event`, `disconnect` |
| `net.leave()`, `net.disconnect()` | Back to the lobby, or hang up entirely |

## Only changes are sent

You never call "send" for state. About 30 times a second `net.js` compares `net.state` with
what players already have and sends only the fields that changed. Nothing changed means nothing
is sent. Numbers are rounded to 2 decimals first, so jitter doesn't count as a change. A player
who joins gets everything once, then the same changes as everyone else. To keep games cheap:

- **Put only what players must see in `net.state`.** Timers, AI internals and particles stay
  in local variables. Particles and screen shake come from `net.event` on each copy.
- **Key things by id, not array position:** `bullets: { b17: {...} }`, not `bullets: [...]`.
  Removing the first item of an array shifts every index after it, and all of them get resent.
- **Don't write a value just to write it.** Setting `x = x` costs nothing; recomputing a
  float that wobbles at the 3rd decimal place does.

The check warns above about 20 KB/s for two players.

## Screens and flow

- **Title** (`Press A to play online`) → **lobby** (`lobby.update()` returns `'start'` when the
  host starts) → **playing**.
- **Start** opens a menu but can't pause the world: it stops your controls, with resume and
  "leave the game".
- When the host leaves, `end` fires and the game goes back to the lobby, which says why.
- The lobby needs no text entry: rooms are joined from a list or by Quick match.
- Show who's who on screen ("You", colours by `net.slot`), since players can't see each other.

## Design for latency

Players see the world about 80 ms plus network delay behind the host: `net.view` is drawn a
moment in the past and blended between updates, so motion stays smooth even when the network
wobbles. Host events (`net.event`) play at that same moment, in step with the picture. Pick
mechanics that tolerate that:

- **Good fits:** co-op, party games, racing, arena brawlers, sports, turn-based and card games.
- **Hard:** frame-perfect fighting games, competitive twitch shooters. Prefer generous
  hitboxes and slower projectiles.
- Make the local player's own actions feel instant with a sound or flash on button press,
  even before the host confirms the result.

## Testing

- `npm run dev <id>` starts a local relay as well: open the game in **two browser windows** to
  play against yourself.
- `npm run check <id>` runs the usual check, then plays **two copies** together through a local
  relay. It fails if they can't get into a match, or if the second copy never receives state.
  Keep the template's flow (title → lobby → play) so the check can drive it.
- `window.__kitNet` in the console shows status, players and bytes sent.

## On the Deck

Builds get the relay's address and a pass for that repo, game and version automatically. Only
copies with the same version play together, so bump `version` when the netcode changes. If the
build log says online play is off, the relay isn't configured for this repo yet. The game still
builds, and its lobby shows the reason.
