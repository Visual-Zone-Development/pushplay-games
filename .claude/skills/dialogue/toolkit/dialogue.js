// Dialogue box (dialogue skill): draws and drives a conversation from dialogue-script.js on the game's
// canvas with controller, keyboard, mouse and touch. Typewriter text with pauses, emphasis, colour and shake
// markup; per-speaker voice blips; name plate and portrait; choices; skip; a log of past lines; text size,
// text speed and reduced shake from the game's settings. Looks are injected (style.panel, portrait, colours,
// font), so the box matches the game's art direction instead of having one look of its own.
//
// The box has no dependencies. It talks to the game through a few small objects the game passes in:
//
//   input     (required) the game's input state, or a thin adapter over it, read every update():
//               pressed(name) → true on the frame that button went down. Names asked for: 'a' (confirm /
//                               advance), 'b' (skip to the next choice), 'select' (open and close the log).
//                               Other names: pass buttons: { confirm, skip, log }.
//               navY          → -1 / 0 / +1, a stepped up / down with key repeat (d-pad, stick, arrows)
//               pointer       → { x, y, pressed } in the canvas's logical units; pressed is true on the frame
//                               a click or tap went down
//               mode          → the device used last: 'touch' and 'mouse' show the on-screen Skip button and
//                               'mouse' gives hover highlight; any other value ('gamepad', 'keyboard') doesn't
//   width, height           the logical size the game draws in (default 1280 by 800)
//   settings  (optional)    { textScale, textSpeed, reducedShake }, read live; an object that keeps those
//                           under .data works too
//   prompts   (optional)    (ctx, input, pairs, { x, y, align, size }) => void: draws button hints with the
//                           game's own prompt helper. pairs is [[buttonName, label], …], e.g. [['a', 'Next']].
//                           Without it the box draws only its built-in "next" arrow (and a Back label in the log).
//   portrait  (optional)    (ctx, who, mood, x, y, size, talking) => void
//   blip      (optional)    (who, char) => void, called as letters appear; voiceBlip() below makes one
//   avoid     (optional)    [{ x, y, w, h }]: rectangles where a tap must not advance the text (a pause button)
//
//   import { createRunner } from './dialogue-script.js'
//   import { createDialogueBox, voiceBlip } from './dialogue.js'
//   const talk = createDialogueBox({ input, settings, prompts: drawButtonHints, avoid: [PAUSE_BUTTON],
//     blip: voiceBlip(playTone, { Brom: { freq: 130 }, Ash: { freq: 260 } }),
//     portrait: (ctx, who, mood, x, y, size, talking) => drawPortrait(who, mood, …), style: { … } })
//   talk.open(createRunner(script, { vars: saved.dialogue, on: { give: giveItem } }).start('smith'))
//   // each frame during play (not while paused):
//   if (talk.active) { if (talk.update(dt) === 'done') saveGame() } else updateGameplay(dt)
//   … draw the world …; talk.draw(ctx)

const DEFAULT_STYLE = {
  font: 'system-ui, sans-serif',
  size: 30,                 // px before the text-size setting (≥ 28 on a small screen)
  lines: 3,                 // lines per page
  cps: 45,                  // characters per second
  margin: 32,               // from the screen edges
  pad: 26,
  portraitSize: 168,
  color: '#f4ead2',
  dim: '#b9ad94',
  emphasis: '#ffd36b',
  nameColors: {},           // { Brom: '#e0904a' }
  fill: 'rgba(16,12,24,0.92)',
  border: '#f4ead2',
  panel: null,              // (ctx, x, y, w, h, kind) → draws a panel in the game's style; kind: 'box' | 'name' | 'choices' | 'log' | 'button'
  punctuationPause: { '.': 0.22, '!': 0.22, '?': 0.22, ',': 0.08, ';': 0.12, ':': 0.12, '—': 0.12, '…': 0.3 }
}

/**
 * Per-speaker voice: a short tone every couple of letters, pitch varied a little by the letter.
 * sound is the game's tone generator: a function ({ freq, dur, type, gain }) => void (dur in seconds, type an
 * oscillator type), or an object with such a function as its tone method.
 */
export function voiceBlip(sound, voices = {}, { every = 2, gain = 0.06 } = {}) {
  const play = typeof sound === 'function' ? sound : (o) => sound.tone(o)
  let n = 0
  return (who, ch) => {
    if (!/[\p{L}\p{N}]/u.test(ch) || n++ % every) return
    const v = voices[who] || voices['*'] || { freq: 220 }
    const vary = v.vary ?? 0.08
    const k = 1 + ((ch.toLowerCase().charCodeAt(0) * 7) % 9 - 4) / 4 * vary
    play({ freq: v.freq * k, dur: v.dur ?? 0.035, type: v.type ?? 'square', gain: v.gain ?? gain })
  }
}

const inside = (p, r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

/** Markup → glyphs: *emphasis*, {w} / {w=0.6} pause, {shake}…{/shake}, {c=#hex}…{/c}. */
function glyphs(text, style) {
  const out = []
  let emph = false, shake = false, color = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '*') { emph = !emph; continue }
    if (ch === '{') {
      const end = text.indexOf('}', i)
      if (end > i) {
        const tag = text.slice(i + 1, end)
        i = end
        if (tag === 'shake') shake = true
        else if (tag === '/shake') shake = false
        else if (tag.startsWith('c=')) color = tag.slice(2)
        else if (tag === '/c') color = null
        else if (tag === 'w' || tag.startsWith('w=')) {
          const prev = out[out.length - 1]
          if (prev) prev.pause = (prev.pause || 0) + (tag === 'w' ? 0.35 : Number(tag.slice(2)) || 0.35)
        }
        continue
      }
    }
    out.push({ ch, color: color || (emph ? style.emphasis : null), shake, pause: style.punctuationPause[ch] || 0 })
  }
  return out
}

export function createDialogueBox({ input, settings = null, prompts = null, portrait = null, blip = null, avoid = [], style = {}, labels = {}, buttons = {}, width = 1280, height = 800 } = {}) {
  const S = { ...DEFAULT_STYLE, ...style }
  const L = { next: 'Next', skip: 'Skip', log: 'Log', back: 'Back', choose: 'Choose', ...labels }
  const B = { confirm: 'a', skip: 'b', log: 'select', ...buttons }
  const W = width, H = height
  const setting = (key, fallback) => (settings?.data ?? settings)?.[key] ?? fallback
  const measure = document.createElement('canvas').getContext('2d')
  let runner = null, view = null, pages = [], page = 0, shown = 0, wait = 0, t = 0, acc = 0
  let choice = 0, mode = 'idle', log = [], logScroll = 0, skipping = false, last = null

  const scale = () => setting('textScale', 1)
  const size = () => Math.round(S.size * scale())
  const lineH = () => Math.round(size() * 1.32)
  const boxRect = () => {
    const h = S.pad * 2 + lineH() * S.lines
    return { x: S.margin, y: H - S.margin - h, w: W - S.margin * 2, h }
  }
  const textRect = () => {
    const b = boxRect()
    const shownLine = view?.type === 'line' ? view : view?.type === 'choices' ? last : null
    const hasPortrait = portrait && shownLine?.who
    const ps = Math.min(S.portraitSize, b.h - S.pad)
    const x = b.x + S.pad + (hasPortrait ? ps + S.pad : 0)
    return { x, y: b.y + S.pad, w: b.x + b.w - S.pad - x, ps }
  }
  const skipButton = () => { const b = boxRect(); return { x: b.x + b.w - 120, y: b.y - 72, w: 120, h: 60 } }
  const choiceRects = () => {
    if (view?.type !== 'choices') return []
    const b = boxRect(), rowH = Math.max(60, Math.round(size() * 1.7)), w = 640
    const n = view.options.length, top = b.y - 16 - rowH * n
    return view.options.map((o, i) => ({ x: b.x + b.w - w, y: top + i * rowH, w, h: rowH - 6 }))
  }

  function layout(text) {
    const gl = glyphs(text, S)
    const { w } = textRect()
    measure.font = `${size()}px ${S.font}`
    const lines = [[]]
    let word = [], lineW = 0
    const flush = () => {
      const ww = measure.measureText(word.map((g) => g.ch).join('')).width
      if (lineW + ww > w && lines[lines.length - 1].length) { lines.push([]); lineW = 0; while (word[0]?.ch === ' ') word.shift() }
      lines[lines.length - 1].push(...word)
      lineW += measure.measureText(word.map((g) => g.ch).join('')).width
      word = []
    }
    for (const g of gl) {
      if (g.ch === '\n') { flush(); lines.push([]); lineW = 0; continue }
      word.push(g)
      if (g.ch === ' ') flush()
    }
    flush()
    const out = []
    for (let i = 0; i < lines.length; i += S.lines) out.push(lines.slice(i, i + S.lines))
    return out
  }

  function advance() {
    view = runner.next()
    if (view.type === 'line') {
      last = view
      pages = layout(view.text)
      page = 0; shown = 0; wait = 0
      log.push({ who: view.who, text: view.text.replace(/\{[^}]*\}|\*/g, '').replace(/\s+/g, ' ').trim() })
      if (log.length > 60) log.shift()
      mode = 'typing'
    } else if (view.type === 'choices') {
      // keep the question on screen while the player chooses
      if (last) { page = pages.length - 1; shown = Infinity }
      mode = 'choices'; choice = 0; skipping = false
    } else {
      mode = 'idle'; runner = null; skipping = false
      return 'done'
    }
    return null
  }
  const pageLen = () => pages[page].reduce((n, l) => n + l.length, 0)
  const finishPage = () => { shown = pageLen(); wait = 0; mode = 'waiting' }
  const proceed = () => {
    if (page < pages.length - 1) { page++; shown = 0; mode = 'typing'; return null }
    return advance()
  }

  const box = {
    get active() { return !!runner },
    open(r) { runner = r; skipping = false; last = null; pages = []; return advance() },
    close() { runner = null; mode = 'idle' },
    update(dt) {
      if (!runner) return 'done'
      t += dt
      const p = input.pointer
      const tap = p.pressed && !avoid.some((r) => inside(p, r))
      const tapSkip = tap && (input.mode === 'touch' || input.mode === 'mouse') && inside(p, skipButton()) && mode !== 'choices'
      if (mode === 'log') {
        if (input.pressed(B.log) || input.pressed(B.skip) || tap) mode = view?.type === 'choices' ? 'choices' : 'waiting'
        logScroll = Math.max(0, Math.min(log.length - 1, logScroll - input.navY))
        return null
      }
      if (input.pressed(B.log)) { mode = 'log'; logScroll = 0; return null }
      if (input.pressed(B.skip) || tapSkip) skipping = mode !== 'choices'
      if (skipping) {
        // fast-forward through lines (events still fire) and stop at the next choice or the end
        for (let i = 0; i < 500 && skipping; i++) { const r = proceed(); if (r === 'done') return 'done' }
        return null
      }
      if (mode === 'choices') {
        const rects = choiceRects()
        if (input.navY) choice = (choice + input.navY + rects.length) % rects.length
        if (input.mode === 'mouse') rects.forEach((r, i) => { if (inside(p, r)) choice = i })
        let pick = input.pressed(B.confirm) ? choice : -1
        if (p.pressed) rects.forEach((r, i) => { if (inside(p, r)) pick = i })
        if (pick >= 0) {
          log.push({ who: '›', text: view.options[pick].text })
          runner.choose(view.options[pick].index)
          return advance()
        }
        return null
      }
      const confirm = input.pressed(B.confirm) || (tap && !tapSkip)
      if (mode === 'typing') {
        if (confirm) { finishPage(); return null }
        const speed = S.cps * setting('textSpeed', 1)
        if (wait > 0) { wait -= dt; return null }
        acc += dt * speed
        const flat = pages[page].flat()
        while (acc >= 1 && shown < flat.length) {
          const g = flat[shown++]
          acc -= 1
          blip?.(view.who, g.ch)
          if (g.pause) { wait = g.pause; break }
        }
        if (shown >= flat.length) { mode = 'waiting'; acc = 0 }
        return null
      }
      if (mode === 'waiting' && confirm) return proceed()
      return null
    },
    draw(ctx) {
      if (!runner || !view) return
      const reduced = setting('reducedShake', false)
      const panel = (x, y, w, h, kind) => {
        if (S.panel) return S.panel(ctx, x, y, w, h, kind)
        ctx.fillStyle = S.fill
        ctx.strokeStyle = S.border
        ctx.lineWidth = 3
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill(); ctx.stroke()
      }
      ctx.save()
      ctx.textBaseline = 'top'
      const b = boxRect(), tr = textRect()
      panel(b.x, b.y, b.w, b.h, 'box')
      const line = view.type === 'line' ? view : view.type === 'choices' ? last : null
      if (line?.who) {
        ctx.font = `700 ${size()}px ${S.font}`
        const nw = ctx.measureText(line.who).width + S.pad * 2, nh = lineH() + 12
        panel(b.x + 12, b.y - nh + 8, nw, nh, 'name')
        ctx.fillStyle = S.nameColors[line.who] || S.emphasis
        ctx.fillText(line.who, b.x + 12 + S.pad, b.y - nh + 14)
        if (portrait) portrait(ctx, line.who, line.mood, b.x + S.pad, b.y + (b.h - tr.ps) / 2, tr.ps, mode === 'typing')
      }
      if (line && pages.length) {
        ctx.font = `${size()}px ${S.font}`
        let n = 0
        pages[page].forEach((row, li) => {
          let x = tr.x
          for (const g of row) {
            if (n++ >= shown) break
            const jx = g.shake && !reduced ? Math.sin(t * 40 + n) * 1.5 : 0, jy = g.shake && !reduced ? Math.cos(t * 37 + n * 2) * 1.5 : 0
            ctx.fillStyle = g.color || (line.who ? S.color : S.dim)
            ctx.fillText(g.ch, x + jx, tr.y + li * lineH() + jy)
            x += ctx.measureText(g.ch).width
          }
        })
        if (mode === 'waiting') {
          const bob = reduced ? 0 : Math.round(Math.sin(t * 6) * 3)
          ctx.fillStyle = S.emphasis
          ctx.beginPath(); const ax = b.x + b.w - 34, ay = b.y + b.h - 30 + bob
          ctx.moveTo(ax - 9, ay - 6); ctx.lineTo(ax + 9, ay - 6); ctx.lineTo(ax, ay + 5); ctx.fill()
        }
      }
      if (view.type === 'choices') {
        const rects = choiceRects()
        const all = rects.reduce((a, r) => ({ y: Math.min(a.y, r.y), y2: Math.max(a.y2, r.y + r.h) }), { y: 1e9, y2: 0 })
        panel(rects[0].x - 12, all.y - 12, rects[0].w + 24, all.y2 - all.y + 24, 'choices')
        ctx.font = `${size()}px ${S.font}`
        rects.forEach((r, i) => {
          const on = i === choice
          if (on) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(r.x, r.y, r.w, r.h) }
          ctx.fillStyle = on ? S.emphasis : S.color
          ctx.textBaseline = 'middle'
          ctx.fillText((on ? '▶ ' : '   ') + view.options[i].text, r.x + 16, r.y + r.h / 2)
        })
        ctx.textBaseline = 'top'
      }
      if ((input.mode === 'touch' || input.mode === 'mouse') && view.type !== 'choices') {
        const s = skipButton()
        panel(s.x, s.y, s.w, s.h, 'button')
        ctx.font = `600 ${Math.round(24 * scale())}px ${S.font}`
        ctx.fillStyle = S.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(L.skip, s.x + s.w / 2, s.y + s.h / 2)
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      }
      if (prompts && input.mode !== 'touch') {
        if (view.type === 'choices') {
          const r = choiceRects()
          prompts(ctx, input, [[B.confirm, L.choose]], { x: r[0].x - 28, y: r[r.length - 1].y + r[r.length - 1].h / 2, align: 'right', size: 24 })
        } else {
          // left of the on-screen Skip button when it shows (mouse), so they never overlap
          const right = input.mode === 'mouse' ? skipButton().x - 16 : b.x + b.w - 12
          prompts(ctx, input, [[B.confirm, L.next], [B.skip, L.skip], [B.log, L.log]], { x: right, y: b.y - 34, align: 'right', size: 24 })
        }
      }
      if (mode === 'log') {
        panel(80, 60, W - 160, H - 160, 'log')
        ctx.font = `${size()}px ${S.font}`
        const rows = Math.floor((H - 240) / lineH())
        const start = Math.max(0, log.length - rows - logScroll)
        log.slice(start, start + rows).forEach((e, i) => {
          ctx.fillStyle = e.who === '›' ? S.emphasis : S.nameColors[e.who] || S.color
          ctx.fillText(e.who ? `${e.who}: ${e.text}` : e.text, 112, 92 + i * lineH(), W - 224)
        })
        if (prompts) prompts(ctx, input, [[B.skip, L.back]], { x: W - 110, y: H - 132, align: 'right', size: 24 })
        else {
          ctx.font = `600 ${Math.round(24 * scale())}px ${S.font}`
          ctx.fillStyle = S.dim; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
          ctx.fillText(L.back, W - 110, H - 132)
          ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        }
      }
      ctx.restore()
    }
  }
  return box
}
