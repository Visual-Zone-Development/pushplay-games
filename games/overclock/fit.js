// pushplay runtime v2 — replaced by `npm run update-kit`; don't edit, extend from game.js.
//
// Fits a fixed-size drawing space (1280×800 by default: the Steam Deck) into any window and
// keeps it centred with letterbox bars, at up to 2× device pixels so text stays sharp on dense
// screens (Legion Go, launcher zoom, Retina). Sizes update on resize; draw in w×h units always.
//
//   const fit = fitCanvas(canvas, { w: 1280, h: 800 })
//   const ctx = fit.ctx                        // transform already set; just draw at 1280×800
//   fit.scale, fit.dpr                         // current fit, for anything sized in CSS pixels
//
// Pixel art: { integer: true } snaps the scale to whole multiples (or 1/n) and turns smoothing off.
// WebGL / three.js: create the renderer first, `renderer.setSize(1280, 800, false)`, then
// `fitCanvas(renderer.domElement, { maxDpr: 1 })`. A canvas that already has a WebGL context
// keeps its drawing buffer (three.js owns it); fitCanvas only sets its CSS size, position and
// the letterbox, and reports scale/dpr in fit.onResize(cb) if you want to resize the renderer.

export function fitCanvas(canvas, { w = 1280, h = 800, maxDpr = 2, integer = false, letterbox = '#000', context = '2d', buffer } = {}) {
  // getContext('2d') returns null on a canvas that already has a WebGL context.
  const ctx = context === '2d' ? canvas.getContext('2d') : null
  const ownsBuffer = buffer ?? ctx !== null
  const listeners = new Set()
  const fit = {
    w,
    h,
    scale: 1,
    dpr: 1,
    /** The 2D context with its transform set, or null for a WebGL canvas. */
    ctx,
    /** Drawn width/height in CSS pixels and the canvas' offset from the window's top-left. */
    cssWidth: w,
    cssHeight: h,
    left: 0,
    top: 0,
    onResize(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    /** Window coordinates → game coordinates (input.attach does this for you). */
    toGame(clientX, clientY) {
      return { x: (clientX - fit.left) / fit.scale, y: (clientY - fit.top) / fit.scale }
    },
    resize() {
      let scale = Math.min(innerWidth / w, innerHeight / h) || 1
      if (integer) scale = scale >= 1 ? Math.floor(scale) : 1 / Math.ceil(1 / scale)
      const dpr = Math.min(devicePixelRatio || 1, maxDpr)
      fit.scale = scale
      fit.dpr = dpr
      fit.cssWidth = w * scale
      fit.cssHeight = h * scale
      fit.left = Math.round((innerWidth - fit.cssWidth) / 2)
      fit.top = Math.round((innerHeight - fit.cssHeight) / 2)
      if (ownsBuffer) {
        canvas.width = Math.round(w * scale * dpr)
        canvas.height = Math.round(h * scale * dpr)
      }
      Object.assign(canvas.style, {
        position: 'absolute',
        left: `${fit.left}px`,
        top: `${fit.top}px`,
        width: `${fit.cssWidth}px`,
        height: `${fit.cssHeight}px`,
        margin: '0',
        imageRendering: integer ? 'pixelated' : ''
      })
      if (ctx) {
        // Assigning canvas.width reset the context: drawing stays in w×h units.
        ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0)
        ctx.imageSmoothingEnabled = !integer
      }
      for (const cb of listeners) cb(fit)
    }
  }
  if (typeof document !== 'undefined' && document.body) {
    document.body.style.background = letterbox
    document.body.style.margin = '0'
    document.body.style.overflow = 'hidden'
  }
  if (!canvas.__fitInstalled) {
    canvas.__fitInstalled = true
    addEventListener('resize', () => fit.resize())
  }
  fit.resize()
  return fit
}
