// Sprite atlases (generated with the image API, sliced to game pixels) and the hand-drawn
// pixel add-ons that show Rivet's parts. Everything here draws at native resolution (320×200).

const ATLASES = ['rivet', 'talon', 'parts', 'fx', 'tiles']
export const art = { ready: false, img: {}, meta: {}, white: new Map() }

export async function loadArt() {
  const loadImg = (src) => new Promise((ok, fail) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = () => fail(new Error(src))
    i.src = src
  })
  await Promise.all([
    ...ATLASES.map(async (n) => {
      art.img[n] = await loadImg(`assets/sprites/${n}.png`)
      art.meta[n] = await (await fetch(`assets/sprites/${n}.json`)).json()
    }),
    loadImg('assets/sprites/bg.png').then((i) => (art.img.bg = i))
  ])
  buildAddons()
  art.ready = true
}

/** Frame rectangle + anchors of atlas `n`, frame index i. */
export function frame(n, i) {
  const m = art.meta[n]
  if (m.anchors) return m.anchors[i]
  const [x, y, w, h] = m.frames[i]
  return { x, y, w, h, ox: w >> 1, oy: h }
}

/**
 * Draw frame i of atlas n with its origin (ox, oy) at world point (x, y).
 * dir = 1 faces right (as drawn), -1 mirrors. opts.white draws a white silhouette (hit flash).
 */
export function drawFrame(g, n, i, x, y, dir = 1, opts = {}) {
  const f = frame(n, i)
  const src = opts.white ? whiteOf(n) : art.img[n]
  const left = Math.round(dir > 0 ? x - f.ox : x - (f.w - f.ox))
  const top = Math.round(y - f.oy)
  g.save()
  if (opts.alpha != null) g.globalAlpha = opts.alpha
  if (dir > 0) g.drawImage(src, f.x, f.y, f.w, f.h, left, top, f.w, f.h)
  else {
    g.translate(left + f.w, top)
    g.scale(-1, 1)
    g.drawImage(src, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h)
  }
  g.restore()
}

/** Anchor (ax, ay in frame pixels) → world point for a frame drawn at (x, y) facing dir. */
export function anchorAt(n, i, ax, ay, x, y, dir = 1) {
  const f = frame(n, i)
  return { x: x + (ax - f.ox) * dir, y: y + (ay - f.oy) }
}

function whiteOf(n) {
  if (art.white.has(n)) return art.white.get(n)
  const img = art.img[n]
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  g.globalCompositeOperation = 'source-atop'
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  art.white.set(n, c)
  return c
}

export function tile(g, name, sx, sy, sw, sh, dx, dy) {
  const [x, y] = art.meta.tiles[name]
  g.drawImage(art.img.tiles, x + sx, y + sy, sw, sh, Math.round(dx), Math.round(dy), sw, sh)
}

// ---- part add-ons: hand-placed pixels in the generated palette ----------------------------------
// K outline, d/m/l gunmetal ramp, then the slot colour (G legs, O arm, Y core, C rig) light/dark.
const PAL = {
  K: '#14121f', d: '#2c2f45', m: '#555b78', l: '#8f96b4', w: '#d9dcec',
  G: '#5cf06a', g: '#22983a', O: '#ffa040', o: '#c0561e', Y: '#ffd84a', y: '#c48a12',
  C: '#46e0ff', c: '#1c7cb0', R: '#ff5c4a'
}
const ADDON_ART = {
  // under each foot: a fat coil spring with a green band
  spring: `
.KKKKKKK.
KGGgGGgGK
.KlmlmlK.
KlmlmlmlK
.KlmlmlK.
KlmlmlmlK
KKKKKKKKK`,
  // calf jet pod
  hover: `
.KKKK.
KlGGmK
KmGGdK
KlmmdK
KmmmdK
KdmmdK
KKddKK
.KKKK.`,
  // heel fin
  dashb: `
KKK.....
KGGKK...
KlGGGKK.
KmllGGGK
KmmmmmlK
KKKKKKKK`,
  splitter: `
.KKKKK.
KOllmdK
KKKKKKK
KOllmdK
KKKKKKK
KOllmdK
.KKKKK.`,
  rapid: `
.KKKKKKKKKKK.
KlOlOlOlOlmdK
KmoKoKoKoKmdK
.KKKKKKKKKKK.`,
  pierce: `
..KK...
.KlOK..
KlwOOK.
KmOOOOK
KlwOOK.
.KlOK..
..KK...`,
  overclock: `
.KYK.
KYwYK
.KYK.`,
  reboot: `
.KKK.
KCCcK
KwCcK
KCwcK
KCCcK
KmmmK
.KKK.`,
  coolant: `
KKKKKKK
KlKlKlK
KmCmCmK
KlKlKlK
KmCmCmK
KlKlKlK
KdddddK
KKKKKKK`,
  scanner: `
KKKKKKKKKK
KwwllllmdK
.KllmmmdK.
..KKmmKK..
....Km....
....KC....
...KKKK...`,
  wrench: `
KK...KK.
KlK.KlK.
.KlKlK..
..KllK..
...KmK..
....KmK.
.....KmK
......KK`
}
export const addon = {}
function buildAddons() {
  for (const [name, str] of Object.entries(ADDON_ART)) {
    const rows = str.trim().split('\n')
    const c = document.createElement('canvas')
    c.width = Math.max(...rows.map((r) => r.length))
    c.height = rows.length
    const g = c.getContext('2d')
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      if (!PAL[ch]) return
      g.fillStyle = PAL[ch]
      g.fillRect(x, y, 1, 1)
    }))
    addon[name] = c
  }
}

/** Draw an add-on centred on (x, y) in the world, mirrored when dir < 0. */
export function drawAddon(g, name, x, y, dir = 1, ax = 0.5, ay = 0.5) {
  const c = addon[name]
  if (!c) return
  const left = Math.round(x - (dir > 0 ? c.width * ax : c.width * (1 - ax)))
  const top = Math.round(y - c.height * ay)
  if (dir > 0) g.drawImage(c, left, top)
  else {
    g.save()
    g.translate(left + c.width, top)
    g.scale(-1, 1)
    g.drawImage(c, 0, 0)
    g.restore()
  }
}
