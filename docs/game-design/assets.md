# Using assets

Games can be entirely procedural (shapes, generated sound), which is often the fastest route to a cohesive look. When the player has their own sprites, sounds or models, or wants a specific look, bring them in this way.

## Where they go

```
games/<id>/
  assets/
    sprites/   PNG / WebP sprite sheets and images
    audio/     OGG / MP3 / WAV sound effects and music
    models/    GLB / GLTF (three.js games)
    fonts/     WOFF2
    CREDITS.md who made what, and the license
```

- **Copy files into the game folder.** Never reference files outside it (`../`, absolute paths) or from the internet: the game must work offline, and the check fails on network requests.
- Use relative URLs from `index.html`, e.g. `assets/sprites/hero.png`. In `--vite` games, files in `public/assets/` are served as-is, or you can `import heroUrl from './assets/hero.png'`.
- Use lowercase, dash-separated filenames (case matters on Linux, where the build runs).

## Licenses

Ask where assets came from if it isn't obvious. Record each one in `assets/CREDITS.md`:

```md
- sprites/hero.png: made by the player
- audio/jump.ogg: "Jump 3" by Kenney (CC0), kenney.nl
- fonts/bungee-latin-400-normal.woff2: Bungee by David Jonathan Ross (OFL)
```

Only use assets the player owns or that have a license allowing redistribution (CC0, CC-BY with credit, OFL for fonts). Don't pull art from commercial games.

### Free CC0 sources (download at dev time, bundle in the folder)
- **Kenney.nl:** huge CC0 packs of 2D sprites, UI, 3D models and audio. Consistent styles.
- **OpenGameArt.org:** check each item's license.
- **Quaternius:** CC0 low-poly 3D models.
- **jsfxr / sfxr:** generate retro SFX and export WAV. Or generate them live with WebAudio in code.

## Keep them small

The Deck loads games from local storage, but the build is zipped and downloaded. Big files slow everything down.

| Type | Target |
|---|---|
| Sprite sheets | PNG or WebP, ≤ 2048×2048, ideally ≤ 1024. Pack small sprites into sheets. |
| Backgrounds | ≤ 1280×800 (the screen size); no need for more |
| Music | OGG or MP3, 96–128 kbps, loopable, ≤ ~3 MB per track |
| SFX | short OGG or WAV, mono |
| 3D models | GLB, ≤ ~5k tris per character, textures ≤ 1024, Draco optional |
| Total | aim for < 30 MB per game |

If the player hands over huge files, downscale or re-encode them, and mention what you changed.

## Loading

Preload everything **before** the title screen accepts input, and draw something while it loads. A progress bar counts, and the check expects something on screen within 3 seconds.

```js
const load = (src) => new Promise((ok, fail) => {
  const img = new Image()
  img.onload = () => ok(img)
  img.onerror = () => fail(new Error(`missing ${src}`))
  img.src = src
})
const sprites = await load('assets/sprites/hero.png')
```

- **Sprite sheets:** `ctx.drawImage(sheet, sx, sy, sw, sh, dx, dy, dw, dh)` with frame `i` at `sx = (i % cols) * fw`, `sy = Math.floor(i / cols) * fh`. For pixel art, set `ctx.imageSmoothingEnabled = false` and scale by whole numbers.
- **Audio:** `fetch` → `arrayBuffer` → `audioCtx.decodeAudioData`, then play through `AudioBufferSourceNode`s routed via a master `GainNode` (that's your volume setting). Resume the `AudioContext` on the first input in case it starts suspended.
- **Models:** `GLTFLoader` from `three/examples/jsm/loaders/GLTFLoader.js` (see [3d.md](3d.md)).

## Assets in the art

Cover and hero SVGs can embed images as `<image href="data:image/png;base64,…">` (no external links). An `art/cover.html` page can also load files from the game folder with relative paths, so it can draw with the real sprites.
