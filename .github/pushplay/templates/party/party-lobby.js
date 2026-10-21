// pushplay runtime v2 — replaced by npm run update-kit; don't edit
// The party lobby on the TV: the room code and QR code to join, everyone who's in, and Start.
// Phones join by scanning or typing the code; controllers on this machine press A to join.
// Start: A on a joined controller, Space/Enter/click, or the first phone's Start button.
// Style it with the options, not by editing.
//
//   const lobby = createPartyLobby(party, input, { title: 'Fib Finder' })
//   lobby.open()                                 // from the title screen
//   in the lobby screen:  const result = lobby.update()   // 'start' | 'back' | null
//                         lobby.draw(ctx, W, H)
//   during play:          drawJoinBadge(ctx, party, x, y)  // so latecomers can still join
import { drawQr, makeQr } from './qr.js'

export function createPartyLobby(party, input, { title = '', accent = '#ffb547', ink = '#eef0f5', quiet = '#9aa3b5', panel = 'rgba(13,15,20,0.85)', font = 'system-ui, sans-serif' } = {}) {
  let startRequested = false
  let qr = null
  // The build check runs the TV with nobody at the controls.
  const auto = typeof window !== 'undefined' && Boolean(window.__kitPartyTest)

  party.on('msg', ({ from, data }) => {
    if (data?.$start && from === vip()) startRequested = true
  })

  /** The first phone still connected: it gets the Start button. */
  const vip = () => party.players.find((p) => p.kind === 'phone' && p.connected)?.id ?? null
  const canStart = () => party.players.length >= party.minPlayers

  const lobby = {
    open() {
      startRequested = false
      party.open()
    },

    update() {
      const ready = canStart()
      party.public.lobby = { vip: vip(), canStart: ready, need: Math.max(0, party.minPlayers - party.players.length) }

      if (party.status === 'error') {
        if (input.pressed('a')) party.open()
        else if (input.pressed('b')) return back()
        return null
      }

      let start = startRequested || (auto && ready)
      let padUsed = false
      for (const pad of input.pads) {
        if (!pad.connected) continue
        const id = `local${pad.index}`
        if (pad.pressed('a')) {
          padUsed = true
          if (!party.player(id) && party.localPlayers) party.addLocal(pad.index)
          else start = true
        }
        if (pad.pressed('b') && party.player(id)) {
          padUsed = true
          party.kick(id)
        }
      }
      if (!padUsed && input.pressed('a')) start = true
      if (!padUsed && input.pressed('b')) return back()

      startRequested = false
      if (!start || !ready) return null
      delete party.public.lobby
      return 'start'
    },

    draw(ctx, W, H) {
      ctx.save()
      ctx.fillStyle = panel
      ctx.fillRect(0, 0, W, H)
      ctx.textBaseline = 'alphabetic'

      // Left: how to join.
      const left = 70
      ctx.fillStyle = ink
      ctx.textAlign = 'left'
      ctx.font = `800 52px ${font}`
      ctx.fillText(title, left, 110)

      if (party.status === 'error') {
        ctx.fillStyle = '#ff6b6b'
        ctx.font = `600 26px ${font}`
        ctx.fillText(party.error, left, 200)
        ctx.fillStyle = quiet
        ctx.fillText(`${input.label('a')} Try again    ${input.label('b')} Back`, left, 250)
        ctx.restore()
        return
      }
      if (!party.code) {
        ctx.fillStyle = quiet
        ctx.font = `600 26px ${font}`
        ctx.fillText(party.status === 'reconnecting' ? 'Reconnecting…' : 'Opening the party…', left, 200)
        ctx.restore()
        return
      }

      const link = party.joinUrl.replace(/^https?:\/\//, '').replace(/\/j\/[A-Z]{4}$/, '')
      ctx.fillStyle = quiet
      ctx.font = `600 26px ${font}`
      ctx.fillText('Join on your phone at', left, 175)
      ctx.fillStyle = ink
      ctx.font = `700 34px ${font}`
      ctx.fillText(link, left, 220)
      ctx.fillStyle = quiet
      ctx.font = `600 26px ${font}`
      ctx.fillText('Room code', left, 285)
      ctx.fillStyle = accent
      ctx.font = `900 120px ${font}`
      ctx.fillText(party.code, left - 4, 395)

      if (party.joinUrl) {
        if (qr?.url !== party.joinUrl) qr = { url: party.joinUrl, code: makeQr(party.joinUrl) }
        const px = Math.floor(300 / (qr.code.size + 8))
        drawQr(ctx, qr.code, left, 430, px)
      }

      // Right: who's in.
      const x0 = 560
      ctx.fillStyle = quiet
      ctx.font = `600 26px ${font}`
      ctx.fillText(`Players ${party.players.length}/${party.maxPlayers}`, x0, 175)
      const cols = party.maxPlayers > 10 ? 3 : 2
      const tw = cols === 3 ? 206 : 310
      const th = party.maxPlayers > 10 ? 56 : 64
      for (let i = 0; i < party.maxPlayers; i++) {
        const x = x0 + (i % cols) * (tw + 20)
        const y = 200 + Math.floor(i / cols) * (th + 14)
        const p = party.players[i]
        ctx.fillStyle = p ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'
        roundRect(ctx, x, y, tw, th, 14)
        ctx.fill()
        if (!p) continue
        ctx.globalAlpha = p.connected ? 1 : 0.45
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(x + 32, y + th / 2, 16, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = ink
        ctx.font = `700 26px ${font}`
        ctx.fillText(fit(ctx, p.name, tw - 110), x + 60, y + 42)
        ctx.fillStyle = quiet
        ctx.font = `600 18px ${font}`
        ctx.textAlign = 'right'
        ctx.fillText(p.kind === 'local' ? 'pad' : p.connected ? 'phone' : 'away', x + tw - 16, y + 40)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }

      // Bottom: what to press.
      ctx.fillStyle = quiet
      ctx.font = `600 24px ${font}`
      const need = party.minPlayers - party.players.length
      const parts = [need > 0 ? `Need ${need} more player${need === 1 ? '' : 's'}` : `${input.label('a')} Start`, `${input.label('b')} Back`]
      if (party.localPlayers && input.pads.some((p) => p.connected)) parts.unshift('Controllers: press A to join')
      ctx.fillText(parts.join('     '), x0, H - 60)
      ctx.restore()
    }
  }

  function back() {
    party.close()
    return 'back'
  }

  return lobby
}

/** The room code in a corner during play, so latecomers can still join. */
export function drawJoinBadge(ctx, party, x, y, { ink = '#eef0f5', quiet = '#9aa3b5', font = 'system-ui, sans-serif' } = {}) {
  if (!party.code || party.locked) return
  ctx.save()
  ctx.fillStyle = 'rgba(13,15,20,0.7)'
  roundRect(ctx, x, y, 210, 58, 12)
  ctx.fill()
  ctx.fillStyle = quiet
  ctx.font = `600 16px ${font}`
  ctx.textAlign = 'left'
  ctx.fillText('Join with code', x + 14, y + 23)
  ctx.fillStyle = ink
  ctx.font = `800 24px ${font}`
  ctx.fillText(party.code, x + 14, y + 48)
  ctx.restore()
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fit(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text
  while (text.length > 1 && ctx.measureText(`${text}…`).width > width) text = text.slice(0, -1)
  return `${text}…`
}
