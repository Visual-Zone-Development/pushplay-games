import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// In a game repo the kit carries its own copy of brand.json; in the launcher monorepo it reads
// the shared one. Either way, names never appear in this code.
const vendored = join(import.meta.dirname, 'brand.json')
const source = join(import.meta.dirname, '../../shared/src/brand.json')
export const brand = JSON.parse(readFileSync(existsSync(vendored) ? vendored : source, 'utf8'))

export const KIT_VERSION = 1

/** Current manifest name first, then names from before any rename. */
export const MANIFEST_FILES = brand.manifestFiles
export const MANIFEST_FILE = MANIFEST_FILES[0]
export const RELEASE_TAG = brand.releaseTag
export const INDEX_ASSET = brand.indexAsset

/** Where the kit lives inside a game repo, and its workflow. */
export const KIT_DIR = `.github/${brand.slug}`
export const WORKFLOW_FILE = `.github/workflows/${brand.slug}.yml`

/** Collection repos keep one game per folder here; single-game repos have the manifest at the root. */
export const GAMES_DIR = 'games'

/** The Steam Deck's screen. Games are checked (and screenshotted) at this size. */
export const VIEWPORT = { width: 1280, height: 800 }

/** Art sizes in px. The launcher shows the cover at about 216×150 and the hero at 1280×300. */
export const ART = {
  cover: { width: 720, height: 500 },
  hero: { width: 1920, height: 450 }
}

/** How long the headless check lets a game run before judging it. */
export const CHECK_RUN_MS = 3000

/** Minimum description length, so the library always has something useful to show. */
export const MIN_DESCRIPTION = 20

/**
 * Fonts available to art files by name (injected when art is rendered, so text looks the same
 * on every machine). family → [fontsource package, weights].
 */
export const ART_FONTS = {
  'Chakra Petch': ['chakra-petch', [600, 700]],
  Rubik: ['rubik', [400, 700, 900]],
  Bungee: ['bungee', [400]],
  'Lilita One': ['lilita-one', [400]],
  'Press Start 2P': ['press-start-2p', [400]]
}
