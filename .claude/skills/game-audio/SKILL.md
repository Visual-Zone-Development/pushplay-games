---
name: game-audio
description: Create and mix the sound for the game in this repo — generated SFX from oscillator tones and noise bursts, bundled sound files, a music loop or sequencer that fits the mood, layering, variation and mixing on master / music / SFX buses so everything follows the Settings sliders. Use for "add sound", "the game is silent", "make the music better", "sounds are annoying / repetitive", "add a soundtrack", or the audio part of a new game.
---

# Game audio

Follow the project's own rules first (its `AGENTS.md` or platform guide): they decide the audio API, where assets go, the checks and how to finish a change. If the project has an audio layer, everything goes through it (never a second `AudioContext`, never edits to shared files). Read the game's `DESIGN.md` (*Audio*, fun targets, the kickoff answer for sound and music).

## 1. List every sound the game needs
Go through the game's actions and screens and write a table in DESIGN.md under *Audio*:

| Event | Character | Priority |
|---|---|---|
| menu move / choose / back | soft tick / bright blip / low blip | must |
| jump, shoot, hit, pickup, hurt, death | … | must |
| combo, level up, new best | rising, rewarding | must |
| ambience, music | the kickoff's mood | must |

Every action and every menu move has a sound ([definition-of-done.md](../game-design/references/definition-of-done.md)).

## 2. The audio layer: three buses and two generators
What the game needs: a **master** bus with a **music** and an **SFX** bus under it, each following a Settings slider, a `tone` and a `noise` generator, and silence while paused. When the project has none, this is all of it in Web Audio:

```js
const ac = new AudioContext()
const bus = { master: ac.createGain(), music: ac.createGain(), sfx: ac.createGain() }
bus.music.connect(bus.master); bus.sfx.connect(bus.master); bus.master.connect(ac.destination)
const setVolume = (name, v) => bus[name].gain.setTargetAtTime(v, ac.currentTime, 0.02) // 0..1, from the sliders

// browsers start audio only after a gesture
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => ac.resume(), { once: true })

function tone({ freq = 440, dur = 0.1, type = 'square', gain = 0.15, slide = 0, delay = 0, to = 'sfx' }) {
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t + dur) // slide in Hz over the note
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur) // a fade, so no click
  o.connect(g).connect(bus[to]); o.start(t); o.stop(t + dur)
}
function noise({ dur = 0.1, gain = 0.2, delay = 0, to = 'sfx' }) {
  const t = ac.currentTime + delay, n = Math.ceil(ac.sampleRate * dur)
  const buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  const s = ac.createBufferSource(), g = ac.createGain()
  s.buffer = buf
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  s.connect(g).connect(bus[to]); s.start(t)
}
```
Pause: ramp the master gain to 0 (or `ac.suspend()`) on pause and when the page is hidden; restore on resume. A pad's first press isn't a gesture in every browser, so never assume sound is running.

## 3. Generated SFX recipes
Keep them in one `sfx` object so each is a single call (`sfx.jump()`). In the notation above:

| Sound | Recipe |
|---|---|
| Menu tick | `tone({ freq: 880, dur: 0.03, type: 'square', gain: 0.08 })` |
| Confirm | two tones, 660 then 990, `delay: 0.05` |
| Jump | `tone({ freq: 300, slide: 400, dur: 0.12, type: 'square' })` |
| Laser / shot | `tone({ freq: 1200, slide: -900, dur: 0.1, type: 'sawtooth', gain: 0.1 })` |
| Hit | `noise({ dur: 0.06, gain: 0.25 })` + `tone({ freq: 120, dur: 0.08, type: 'triangle' })` |
| Explosion | `noise({ dur: 0.4, gain: 0.35 })` + `tone({ freq: 80, slide: -50, dur: 0.4, type: 'sine', gain: 0.3 })` |
| Pickup / coin | `tone({ freq: 990, dur: 0.06 })`, then `tone({ freq: 1320, dur: 0.1, delay: 0.06 })` |
| Hurt | `tone({ freq: 220, slide: -120, dur: 0.2, type: 'sawtooth' })` |
| Combo step n | the pickup sound with `freq × 2^(n/12)` (a semitone up per step, capped) |

Variation: randomise pitch ±5–10% on repeated sounds, limit how many of the same sound can start per 50 ms, and keep `gain` low (0.05–0.3): many sounds stack.

**Bundled files** (the user's or CC0): keep them in the game (`assets/sfx/`, `assets/music/`; `.ogg` or `.mp3`, music ≤ ~3 MB), never streamed from another site, and credit them in `assets/CREDITS.md` ([assets.md](../game-design/references/assets.md)). Load once at startup (`fetch` → `arrayBuffer()` → `ac.decodeAudioData`) and play each through a buffer source with its own playback rate and gain into the right bus.

## 4. Music
- **Generated loop:** a tiny step sequencer: a tempo, a 16-step pattern per voice (bass, lead, drums from `noise`), scheduled a bar ahead with delayed tones on the music bus, on a timer that stops while paused. Pick a scale that fits the mood (minor pentatonic for tense, major pentatonic for cozy).
- **Layers:** add a voice as intensity rises (a drum layer at wave 5, a lead at the boss). Players notice it as "something new".
- **Bundled track:** a looping buffer source on the music bus; keep the source and `stop()` it on Quit to title and Restart.
- Don't count on music on the title screen before the first input (browsers block audio until a gesture).

## 5. Mix and verify
1. Music sits under SFX (music gain about half of SFX). Important sounds (hurt, low health) are the loudest and most distinct.
2. Pause silences everything, and the sequencer stops scheduling too (notes already scheduled a bar ahead would otherwise play on). Restart and Quit to title stop the run's loops.
3. Move each Settings slider (Master, Music, SFX) to 0 and back; each must work.
4. Play 2 minutes: is anything grating or too repetitive? Fix it.
5. Update DESIGN.md (*Audio*, Changelog).
6. Run the project's checks and finish the change the way its rules say.
