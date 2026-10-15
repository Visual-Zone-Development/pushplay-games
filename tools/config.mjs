// Names shared with the PushPlay launcher. If the launcher is renamed, change them here.
export const MANIFEST_FILE = 'pushplay.json'
export const RELEASE_TAG = 'pushplay-latest'
export const INDEX_ASSET = 'pushplay-index.json'

export const GAMES_DIR = 'games'
/** Build output, ignored by git. */
export const WORK_DIR = '.pushplay'

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
 * Fonts available to art files by name (they're injected when art is rendered, so text looks
 * the same on every machine). family → [fontsource package, weights].
 */
export const ART_FONTS = {
  'Chakra Petch': ['chakra-petch', [600, 700]],
  Rubik: ['rubik', [400, 700, 900]],
  Bungee: ['bungee', [400]],
  'Lilita One': ['lilita-one', [400]],
  'Press Start 2P': ['press-start-2p', [400]]
}
