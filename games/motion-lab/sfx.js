// Motion Lab's sounds: named effects built from audio.tone / audio.noise, and a small step
// sequencer for the music loops (and the Maraca Rhythm song, which reads its clock).

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12)

export function createSfx(audio) {
  const t = (o) => audio.tone(o)
  const n = (o) => audio.noise(o)
  return {
    move: () => t({ freq: 520, dur: 0.04, type: 'triangle', gain: 0.12 }),
    pick: () => {
      t({ freq: 660, dur: 0.07, type: 'square', gain: 0.12 })
      t({ freq: 990, dur: 0.09, type: 'square', gain: 0.1, delay: 0.06 })
    },
    back: () => t({ freq: 440, dur: 0.08, type: 'triangle', gain: 0.12, slide: -160 }),
    join: () => t({ freq: 660, dur: 0.1, slide: 300, gain: 0.15 }),
    center: () => {
      t({ freq: 880, dur: 0.05, type: 'sine', gain: 0.18 })
      t({ freq: 1320, dur: 0.08, type: 'sine', gain: 0.14, delay: 0.05 })
    },
    whoosh: (p = 0.6) => n({ dur: 0.12 + p * 0.1, gain: 0.06 + p * 0.08 }),
    crack: (p = 1) => {
      n({ dur: 0.08, gain: 0.35 })
      t({ freq: 180 + p * 120, dur: 0.12, type: 'square', gain: 0.25, slide: -120 })
      t({ freq: 1200, dur: 0.05, type: 'triangle', gain: 0.18 })
    },
    thud: () => {
      t({ freq: 120, dur: 0.12, type: 'sine', gain: 0.3, slide: -60 })
      n({ dur: 0.05, gain: 0.08 })
    },
    miss: () => t({ freq: 220, dur: 0.18, type: 'sawtooth', gain: 0.1, slide: -90 }),
    cheer: () => {
      n({ dur: 0.9, gain: 0.08 })
      ;[0, 4, 7, 12].forEach((s, i) => t({ freq: NOTE(72 + s), dur: 0.16, type: 'square', gain: 0.1, delay: i * 0.08 }))
    },
    slice: (combo = 0) => {
      n({ dur: 0.07, gain: 0.18 })
      t({ freq: 700 + Math.min(combo, 12) * 60, dur: 0.09, type: 'triangle', gain: 0.16, slide: 400 })
    },
    splat: () => t({ freq: 160, dur: 0.1, type: 'sine', gain: 0.25, slide: -80 }),
    shaker: (big = false) => {
      n({ dur: big ? 0.11 : 0.06, gain: big ? 0.3 : 0.2 })
      if (big) t({ freq: 1760, dur: 0.05, type: 'triangle', gain: 0.08 })
    },
    bang: () => {
      n({ dur: 0.22, gain: 0.4 })
      t({ freq: 110, dur: 0.18, type: 'square', gain: 0.25, slide: -60 })
    },
    click: () => t({ freq: 300, dur: 0.03, type: 'square', gain: 0.1 }),
    quack: () => {
      t({ freq: 520, dur: 0.09, type: 'sawtooth', gain: 0.12, slide: -180 })
      t({ freq: 480, dur: 0.09, type: 'sawtooth', gain: 0.1, slide: -160, delay: 0.11 })
    },
    hit: () => {
      t({ freq: 880, dur: 0.06, type: 'square', gain: 0.14 })
      t({ freq: 1320, dur: 0.1, type: 'square', gain: 0.12, delay: 0.05 })
    },
    roll: (speed) => n({ dur: 0.03, gain: Math.min(0.05, speed * 0.00008) }),
    clack: (v) => t({ freq: 300 + Math.random() * 80, dur: 0.05, type: 'triangle', gain: Math.min(0.25, v * 0.0006) }),
    fall: () => t({ freq: 700, dur: 0.45, type: 'sine', gain: 0.18, slide: -600 }),
    gem: () => {
      t({ freq: NOTE(84), dur: 0.08, type: 'sine', gain: 0.16 })
      t({ freq: NOTE(91), dur: 0.12, type: 'sine', gain: 0.14, delay: 0.06 })
    },
    goal: () => [0, 4, 7, 12, 16].forEach((s, i) => t({ freq: NOTE(67 + s), dur: 0.14, type: 'square', gain: 0.12, delay: i * 0.07 })),
    tick: () => t({ freq: 1200, dur: 0.03, type: 'square', gain: 0.08 }),
    medal: (level) => [0, 7, 12, 16, 19, 24].slice(0, 3 + level).forEach((s, i) => t({ freq: NOTE(64 + s), dur: 0.2, type: 'square', gain: 0.12, delay: i * 0.1 })),
    note: (midi, o = {}) => t({ freq: NOTE(midi), ...o })
  }
}

/**
 * A step sequencer on its own clock (advanced by the game's dt, so pausing freezes it). Each
 * frame it schedules the notes due in the next lookahead window on the audio clock.
 * song: { bpm, steps (per bar, 8 = eighths), step(i, at) → called once per step with its delay }.
 */
export function createSequencer(audio) {
  const LOOKAHEAD = 0.12
  let song = null
  let time = 0
  let next = 0 // index of the next step to schedule
  const seq = {
    get time() {
      return time
    },
    get playing() {
      return Boolean(song)
    },
    stepLength: () => (song ? 60 / song.bpm / (song.steps / 4) : 0),
    play(s, startAt = 0) {
      song = s
      time = startAt
      next = Math.max(0, Math.ceil(startAt / seq.stepLength()))
    },
    stop() {
      song = null
    },
    update(dt) {
      if (!song) return
      time += dt
      const len = seq.stepLength()
      while (next * len < time + LOOKAHEAD) {
        const delay = Math.max(0, next * len - time)
        if (audio.unlocked) song.step(next, delay)
        next++
      }
    }
  }
  return seq
}

/** A light loop: bass on the beat, a plucky arpeggio, hats. root is a MIDI note. */
export function loopSong(sfx, { bpm = 112, root = 50, gain = 0.07, chords = [0, 5, 7, 3] } = {}) {
  return {
    bpm,
    steps: 8,
    step(i, delay) {
      const bar = Math.floor(i / 8) % chords.length
      const s = i % 8
      const r = root + chords[bar]
      if (s % 4 === 0) sfx.note(r - 12, { dur: 0.22, type: 'triangle', gain: gain * 2.2, bus: 'music', delay })
      if (s % 2 === 1) sfx.note(r + [12, 16, 19, 24][(s >> 1) % 4] - (chords[bar] === 3 ? 1 : 0), { dur: 0.09, type: 'square', gain, bus: 'music', delay })
      if (s % 2 === 0) sfx.note(r + 31, { dur: 0.02, type: 'square', gain: gain * 0.25, bus: 'music', delay })
    }
  }
}
