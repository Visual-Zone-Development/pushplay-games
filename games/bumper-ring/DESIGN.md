# Bumper Ring: design brief

> Online sumo for 2–4 Decks: dash into your friends and knock them off a shrinking ring. Last puck standing takes the round; first to 3 wins.

*Status: shipped · Version: 1.0.0*

## Fun targets
- **Primary:** Fellowship (laughing with friends). Every round ends in a scramble at the edge, and big hits get a crunchy sound, shake and sparks everyone sees.
- **Secondary:** Challenge. The dash is powerful but on a cooldown, so timing it (and dodging someone else's) is the skill.

## Core loop
- **Moment-to-moment (seconds):** circle → line up a dash → bump → watch them slide toward the edge.
- **Round (20–40 s):** 3-2-1-GO, fight, the ring starts shrinking after 15 s, last one on wins a point.
- **Meta (across sessions):** matches to 3 points, instant rematch; match wins are saved.

## The 8 formal elements
| Element | This game |
|---|---|
| Players | 2–4 online, one Deck each, free-for-all. The host's Deck runs the physics. |
| Objectives | Be the last puck on the ring; first to 3 round wins. |
| Procedures | Steer with the stick, A to dash (1.1 s cooldown). |
| Rules | Off the edge = out for the round. A dashing puck hits twice as hard. The ring shrinks after 15 s. |
| Resources | The dash cooldown; your position near the centre. |
| Conflict | Every other player, plus the shrinking edge. |
| Boundaries | A circular arena in the middle of the screen. |
| Outcome | A match winner each match; rematch in one press (host). |

## Controls
| Input | Action |
|---|---|
| Left stick / d-pad | Steer (with momentum) |
| A | Dash; confirm in menus; host: rematch |
| B | Back in menus |
| X / Y | Title: screen shake on/off / sound on/off |
| Start | Menu (resume, leave the game). Online play doesn't pause. |

## Inspirations
| Game | Borrow | Change / avoid |
|---|---|---|
| Sumo in Mario Party / Fall Guys' Block Party | Last one standing, simple knock-off goal | No random hazards; skill is all in the dash timing |
| Bumper cars / air hockey | Satisfying elastic hits, momentum | Top-down and readable at handheld size |
| TowerFall | Short rounds, first to N, instant rematch | Online instead of couch |

## Art direction
- **Style:** neon arcade on dark navy.
- **Palette:** `#0d1222` background, `#1b2442` arena, `#ffb547` P1, `#5ad1ff` P2, `#ff6b8a` P3, `#7dff8a` P4, `#eef0f5` text.
- **Font:** Bungee for art; system UI in game.
- **Rendering:** 2D canvas.
- **Online:** yes: host runs the game, `net.js` syncs it ([multiplayer.md](../../docs/game-design/multiplayer.md)).
- **Assets:** procedural (shapes and WebAudio).
- **Cover idea:** two pucks colliding on a glowing ring edge with sparks, big title.
- **Hero idea:** the ring on the right half, a puck flying off the edge.

## Audio
- **SFX:** dash whoosh (played instantly on your own press), bump thud scaled by impact, fall whistle, countdown blips, round/match fanfare.
- **Music:** a soft generated bass arpeggio during play.

## Scope
**v1 must-haves**
- Physics: momentum, friction, elastic puck collisions, dash.
- Rounds with countdown, shrinking ring, scores, match to 3, host rematch.
- Lobby (shared), HUD with scores, results screen.
- Juice: sparks (capped), shake, rumble, sounds.
- Settings: sound and shake toggles, saved.

**Stretch**
- Power-ups (heavy puck, bouncy edge), arena variants, team mode.

## Definition of done
- [x] Onboarding by doing: the first countdown shows "Stick steer · A dash · knock them off".
- [x] Clear goal: one line on screen during each phase.
- [x] An ending: first to 3; saved match-win count on the title.
- [x] Difficulty curve: the ring shrinks after 15 s, forcing a finish.
- [x] Fair failure: ring edge is bright; falls are announced with the faller's colour and number.
- [x] Retry hook: host rematches with one press.
- [x] Every action has feedback (visual + audio); rumble on big hits.
- [x] Music loop and sound toggle, saved.
- [x] Title, lobby, menu, results screens.
- [x] Colourblind-safe: every puck shows its player number.
- [x] Reduced shake option.
- [x] Text ≥ 24px, HUD inside 32px margins.

## Open questions / assumptions
- Pause can't freeze an online match; Start opens a menu that stops your controls instead.
- Players can't join a match in progress (the lobby closes the room on start).

## Changelog
- 1.0.0: First version, built as the demo for online multiplayer.
