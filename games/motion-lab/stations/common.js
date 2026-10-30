// Helpers shared by the stations.

/** Medal level 0–3 for a score against [bronze, silver, gold] thresholds. */
export const medalBy = (thresholds) => (value) => thresholds.filter((t) => value >= t).length

/** "Tilt your phone" or "Use the left stick", depending on what's connected. */
export function tiltWord(motion, input) {
  if (motion.phoneLive) return motion.phoneState === 'touch' ? 'Drag the phone pad' : 'Tilt your phone'
  return `Use ${input.stickLabel()}`
}
export function swingWord(motion, input, verb = 'Swing') {
  if (motion.phoneLive) return motion.phoneState === 'touch' ? 'Flick the phone pad' : `${verb} your phone`
  return input.mode === 'mouse' || input.mode === 'touch' ? (input.mode === 'touch' ? 'Tap' : 'Click') : `Press ${input.label('a')}`
}
