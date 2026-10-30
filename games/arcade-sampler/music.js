// A tiny music loop for each game, scheduled ahead on the audio clock so it never drifts:
//   music.play({ bpm: 110, root: 48, chords: [0, 5, 3, 7], wave: 'triangle', lead: [0, 2, 4, 7], gain: 0.05 })
//   music.update() every frame; music.stop()
// chords are semitone offsets from root, one per bar; lead is a scale-degree pattern over 8 steps.
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14]
const MINOR = [0, 2, 3, 5, 7, 8, 10, 12, 14]

export function createMusic(audio) {
  let song = null
  let next = 0
  let step = 0
  const hz = (m) => 440 * 2 ** ((m - 69) / 12)
  return {
    play(s) {
      song = { bpm: 110, root: 48, chords: [0, 5, 7, 5], wave: 'triangle', lead: null, minor: false, gain: 0.05, hats: true, ...s }
      next = audio.ctx ? audio.ctx.currentTime + 0.05 : 0
      step = 0
    },
    stop() {
      song = null
    },
    update() {
      const ctx = audio.ctx
      if (!song || !ctx || ctx.state !== 'running') return
      const dur = 60 / song.bpm / 2 // eighth notes
      const scale = song.minor ? MINOR : MAJOR
      while (next < ctx.currentTime + 0.2) {
        const delay = Math.max(0, next - ctx.currentTime)
        const bar = Math.floor(step / 8) % song.chords.length
        const root = song.root + song.chords[bar]
        const s = step % 8
        if (s === 0 || s === 3 || s === 6) audio.tone({ freq: hz(root - 12), dur: dur * 1.7, type: 'triangle', bus: 'music', gain: song.gain * 2.2, delay })
        if (s === 2 || s === 6) for (const iv of song.minor ? [3, 7] : [4, 7]) audio.tone({ freq: hz(root + iv), dur: dur * 0.8, type: 'sine', bus: 'music', gain: song.gain * 0.8, delay })
        if (song.lead && step % 16 < 8) {
          const d = song.lead[s % song.lead.length]
          if (d !== null && d !== undefined) audio.tone({ freq: hz(root + 12 + scale[d % scale.length]), dur: dur * 0.9, type: song.wave, bus: 'music', gain: song.gain, delay })
        }
        if (song.hats && s % 2 === 1) audio.noise({ dur: 0.025, bus: 'music', gain: song.gain * 0.5, delay })
        next += dur
        step++
      }
    }
  }
}
