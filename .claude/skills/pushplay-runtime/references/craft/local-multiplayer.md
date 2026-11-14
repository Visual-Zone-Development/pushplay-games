# local-multiplayer in a PushPlay game

The general `local-multiplayer` skill covers the shape (co-op or versus, one shared screen, rounds, drop in and out), the join screen, colours, fairness and catch-up. This page gives the PushPlay side: how to do it with the runtime files. AGENTS.md *Controls* (the *Local multiplayer* item), *Flow* and *Manifest* are the rules.

## Input

- Each player reads their own pad: `input.pads[i]` (`{ index, connected, x, y, aimX, aimY, held(), pressed() }`), for i = 0..3. The merged `input.*` view is for menus only.
- Player 1 may also play on the keyboard; say so on the join screen.
- `menu` from any pad pauses for everyone: the shared pause menu is driven by the merged `input`.
- Never rely on chords or on a button the launcher owns (F10, Start+Select, held Esc).
- **Join screen:** one slot per player, with `` `${input.label('a')} to join` `` in each empty slot, built every frame. A slot fills when that pad presses `a` and shows the player's colour and name ("P2"); `b` on that pad leaves. Start when at least the minimum have joined: any joined player presses `a` again, or a countdown.
- The `lobby` screen name isn't used for local play. The join screen is part of `title`, or its own sub-step before `playing`; keep the `state.screen` names AGENTS.md lists.
- **Unplugged pad mid-game:** `input.onPause` fires only when **all** pads are gone. Handle a single disconnect yourself: pause, or leave the slot empty.
- Keep per-player state in an array indexed by slot. Restart resets all players but keeps who joined.

## Touch

- A tablet with several Bluetooth controllers is the same couch: `input.pads[i]` fills one slot per pad and nothing changes in the game.
- Don't assume player 1 has a keyboard: a tablet has none.
- If the game also plays solo by touch, the on-screen controls (`touch.js`) belong to player 1 only and hide once a pad is used.

## Screen and scaling

- It plays on the Deck, a PC or a tablet with several Bluetooth controllers. No split screen on a 7–8" display.
- Keep the join screen and HUD inside `fit.safe`, so a tablet's rounded corners and home bar don't cover a player's slot (see [phone.md](../phone.md)).

## Party

- For phones on a TV, make a party game instead of local multiplayer: the `--party` scaffold and [party.md](../party.md).

## Manifest

- Set `players` like `"1-4"` and add the `local multiplayer` tag.
- Mouse and touch can't join as extra players. If gameplay needs pads, drop `"mouse"` / `"touch"` from `inputs` and say "Needs controllers" on the title. Menus still work with all four.

## Debug hooks and the check

- Test by hand with two controllers, or in a repro script that replaces `navigator.getGamepads` (with `page.addInitScript`) to return two fake pads whose buttons and axes follow a timeline.
- Also test that one player alone still works.
- Adding local multiplayer is a minor `version` bump; update Players and Controls in DESIGN.md.
