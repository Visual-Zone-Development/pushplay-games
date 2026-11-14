# game-audio in a PushPlay game

The general `game-audio` skill covers the sound list, the recipes as tone and noise parameters, variation, music structure and the mix. This page gives the PushPlay side: how to do it with `audio.js`. AGENTS.md *Audio* and *Settings* are the rules.

## Settings

- The buses follow the Settings sliders (Master, Music, SFX) because the same `settings` object is passed to `createAudio`.
- To verify, move each slider to 0 and back: each must work.

## Audio

- Everything goes through `createAudio({ settings })` from `audio.js`. Never create your own `AudioContext` and never edit `audio.js`.
- The buses are `master`, `music` and `sfx`.
- The API for generated sound is `audio.tone({ freq, dur, type, gain, slide, delay, bus })` and `audio.noise({ dur, gain, delay, bus })`.
- Keep the generated SFX in one `sfx` object in `game.js`, so each is a single call:

  | Sound | Recipe |
  |---|---|
  | Menu tick | `audio.tone({ freq: 880, dur: 0.03, type: 'square', gain: 0.08 })` |
  | Confirm | two tones, 660 then 990, `delay: 0.05` |
  | Jump | `audio.tone({ freq: 300, slide: 400, dur: 0.12, type: 'square' })` |
  | Laser / shot | `audio.tone({ freq: 1200, slide: -900, dur: 0.1, type: 'sawtooth', gain: 0.1 })` |
  | Hit | `audio.noise({ dur: 0.06, gain: 0.25 })` + `audio.tone({ freq: 120, dur: 0.08, type: 'triangle' })` |
  | Explosion | `audio.noise({ dur: 0.4, gain: 0.35 })` + `audio.tone({ freq: 80, slide: -50, dur: 0.4, type: 'sine', gain: 0.3 })` |
  | Pickup / coin | `audio.tone({ freq: 990, dur: 0.06 })`, then `audio.tone({ freq: 1320, dur: 0.1, delay: 0.06 })` |
  | Hurt | `audio.tone({ freq: 220, slide: -120, dur: 0.2, type: 'sawtooth' })` |
  | Combo step n | the pickup sound with `freq × 2^(n/12)` (a semitone up per step, capped) |

- **Bundled files** (the user's or CC0): put them in `assets/sfx/` and `assets/music/` (`.ogg` or `.mp3`, music ≤ ~3 MB) and credit them in `assets/CREDITS.md` (see [assets.md](../assets.md)). `await audio.load()` once at startup, then `audio.play(buf, { rate, gain, bus })`.
- **Generated music loop:** a tiny step sequencer in `game.js`: a tempo and a 16-step pattern per voice (bass, lead, drums from `noise`), scheduled a bar ahead with `tone({ …, delay, bus: 'music' })` on a timer that stops while paused.
- **Bundled track:** `audio.play(buf, { bus: 'music', loop: true })`. Keep the source and `stop()` it on Quit to title and Restart.
- Don't count on music on the title screen before the first input: browsers block audio until a gesture, and `audio.js` unlocks on the first press.
- Pause silences everything: `audio.js` mutes on pause, and your sequencer must also stop scheduling. Restart and Quit to title stop the run's loops.
- Update the *Audio* section of DESIGN.md.
