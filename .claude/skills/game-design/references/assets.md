# Using assets

Games can be entirely procedural (shapes, generated sound), which is often the fastest route to a cohesive look. When the player has their own sprites, sounds or models, or wants a specific look, bring them in this way.

## Drawing assets in code

Many small web games draw their art in code rather than shipping files. The skills keep it consistent and good-looking:
**model-asset** (build an asset to a reference the user provides, comparing renders every round), **edit-asset** (one
focused change to one asset), **animate-asset** (natural motion that fits the game's physics), plus the engine
how-tos **canvas2d-assets** (2D in any art style: vector, pixel art, sprite sheets, SVG; an asset gallery page) and
**threejs-models** (3D models built in three.js code). A game's `STYLE.md` records its palette, proportions,
shared parts and animation timing.

## Where they go

```

  assets/
    sprites/   PNG / WebP sprite sheets and images
    audio/     OGG / MP3 / WAV sound effects and music
    models/    GLB / GLTF (three.js games)
    fonts/     WOFF2
    CREDITS.md who made what, and the license
```

- **Copy files into the game folder.** Never reference files outside it (`../`, absolute paths) or from the internet: the game should work offline, and a dead link must never break it.
- Use relative URLs from `index.html`, e.g. `assets/sprites/hero.png`. With a bundler such as Vite, files in `public/assets/` are served as-is, or you can `import heroUrl from './assets/hero.png'`.
- Use lowercase, dash-separated filenames (case matters on Linux, where builds and servers usually run).

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

Big files slow the download and the first load.

| Type | Target |
|---|---|
| Sprite sheets | PNG or WebP, ≤ 2048×2048, ideally ≤ 1024. Pack small sprites into sheets. |
| Backgrounds | no bigger than the game's logical resolution; no need for more |
| Music | OGG or MP3, 96–128 kbps, loopable, ≤ ~3 MB per track |
| SFX | short OGG or WAV, mono |
| 3D models | GLB, ≤ ~5k tris per character, textures ≤ 1024, Draco optional |
| Total | aim for < 30 MB per game |

If the player hands over huge files, downscale or re-encode them, and mention what you changed.

## Loading

Preload everything **before** the title screen accepts input, and draw something while it loads. A progress bar counts; get something on screen within a few seconds.

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
- **Audio:** load and play bundled files through the game's audio layer, on its SFX or music bus, so the Settings sliders and pause-mute apply. Don't create a second `AudioContext`: browsers keep one suspended until a user gesture, so the audio layer unlocks it once on the first key, click, tap or button press. Nothing is audible before that first input, so don't rely on title music starting on load.
- **Models:** `GLTFLoader` from `three/examples/jsm/loaders/GLTFLoader.js` (see [3d.md](../../threejs-models/references/3d.md)).
