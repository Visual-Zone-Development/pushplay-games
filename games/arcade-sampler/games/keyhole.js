// Keyhole: a three-room top-down pixel-art key hunt. Talk to the room's resident for a hint, find
// the key (in a chest, behind bars a crate opens, in a chest a lever unlocks), unlock the door.
// Style: 16 px pixel art from palette-indexed string maps, drawn on a 288×160 native canvas and
// scaled ×4 (one pixel scale for the whole world), with 'Press Start 2P' text on top at full size.
import { W, H, clamp } from '../common.js'

const TUNING = {
  roundSeconds: 120,
  speed: 62, // native px per second (×4 on screen)
  roomScore: 250,
  gemScore: 25,
  timeBonus: 3, // points per second left when all three rooms are cleared
  slimePenalty: 5, // seconds lost when a slime touches you
  slimeSpeed: [30, 38],
  slimeRadius: 9,
  invulnerable: 1.5,
  typeRate: 46, // characters per second
  pushHold: 0.12, // seconds of walking into a crate before it moves
  crateSlide: 0.16,
  walkFps: 8,
  cornerAssist: 7, // px: walking into a doorway edge slides you into it
  keyHold: 0.8
}

const TS = 16
const COLS = 18
const ROWS = 10
const SC = 4
const NW = COLS * TS
const NH = ROWS * TS
const OX = (W - NW * SC) / 2
const OY = 96
const PAUSE_ZONE = { x: W - 130, y: 0, w: 130, h: 100 }
const HW = 5 // hero collision box: x ± HW, y - HH .. y (the feet)
const HH = 9

// ---- palette (hue-shifted ramps: shadows go violet, highlights go warm) ------------------------
const PAL = {
  k: '#1a1426', n: '#2c2340',
  1: '#322d4a', 2: '#4a4566', 3: '#66607f', 4: '#8c86a3', 5: '#b9b4cc',
  w: '#3d2431', W: '#64392f', b: '#8c5636', B: '#b97f4c', v: '#dcaa6c',
  s: '#f2c7a0', S: '#c98a6e',
  g: '#1d4a3e', G: '#2e8452', h: '#79c45a',
  y: '#8f4f1f', Y: '#e2a23a', L: '#ffe48a',
  r: '#5e1c3a', R: '#b0354a', p: '#e26f86',
  c: '#233f7a', C: '#3b7fd0', i: '#8fd8ff',
  o: '#f4f0e6', O: '#bdb6d0'
}
const INK = PAL.k

// ---- sprite helpers ----------------------------------------------------------------------------
const mk = (w, h) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
function sprite(rows) {
  const w = Math.max(...rows.map((r) => r.length))
  const c = mk(w, rows.length)
  const g = c.getContext('2d')
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === '.' || ch === ' ') continue
      g.fillStyle = PAL[ch]
      g.fillRect(x, y, 1, 1)
    }
  })
  return c
}
/** Left halves mirrored into symmetric rows. */
const sym = (rows) => rows.map((r) => r + [...r].reverse().join(''))
function flipX(src) {
  const c = mk(src.width, src.height)
  const g = c.getContext('2d')
  g.translate(src.width, 0)
  g.scale(-1, 1)
  g.drawImage(src, 0, 0)
  return c
}
const hash = (x, y, s = 0) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// ---- characters (16×16) ------------------------------------------------------------------------
const HERO_DOWN = [
  '................',
  '.....kkkkkk.....',
  '....kGhhGGGk....',
  '...kGhGGGGGGk...',
  '...kGGGGGGGgk...',
  '...kgkkkkkkgk...',
  '...kWssssssWk...',
  '...kskssssksk...',
  '...kskssssksk...',
  '....kSsssSSk....',
  '...kGkRRRRkGk...',
  '..ksGkGhGGkGsk..',
  '....kyyYYyyk....',
  '....kGGGGGgk....'
]
const HERO_UP = [
  '................',
  '.....kkkkkk.....',
  '....kGGhhGGk....',
  '...kGGhGGGGGk...',
  '...kGGGGGGGgk...',
  '...kgGGGGGGgk...',
  '...kWggGGggWk...',
  '...kWWbWWbWWk...',
  '...kWbWWbWWWk...',
  '....kWWWWWWk....',
  '...kGkRRRRkGk...',
  '..ksGkGGGGkGsk..',
  '....kyyyyyyk....',
  '....kGGGGGgk....'
]
const HERO_SIDE = [
  '................',
  '....kkkkkk......',
  '...kGhhGGGk.....',
  '..kGhGGGGGGk....',
  '..kGGGGGGGGgk...',
  '..kgGGkkkkkkk...',
  '..kWWWssssssk...',
  '..kWWsssskssk...',
  '..kWWsssskssk...',
  '...kWSsssSSk....',
  '....kRRRRk......',
  '....kGhsGk......',
  '....kyyYyk......',
  '....kGGGgk......'
]
const LEGS_FRONT = [
  ['....kwk..kwk....', '....kkk..kkk....'],
  ['....kwk..kwk....', '....kkk..kkk....'],
  ['....kwk..kkk....', '....kkk.........'],
  ['....kkk..kwk....', '.........kkk....']
]
const LEGS_SIDE = [
  ['....kwkwk.......', '....kkkkk.......'],
  ['....kwkwk.......', '....kkkkk.......'],
  ['...kwk..kwk.....', '...kk....kk.....'],
  ['....kwwk........', '....kkkk........']
]
const heroFrames = (body, legs) => legs.map((l) => sprite([...body, ...l]))

const KEEPER = [
  '................',
  '................',
  '......kkkk......',
  '.....kssssk.....',
  '....kssssssk....',
  '...kOossssoOk...',
  '...kOskssksOk...',
  '...kOsSssSsOk...',
  '...kooooooook...',
  '..kCkooOOookCk..',
  '..kCCkoOOokCCk..',
  '.kCCCCkookCCCCk.',
  '.ksCCCCkkCCCcsk.',
  '..kCCiCCCCcCck..',
  '..kcCCCCCCCcck..',
  '...kkkkkkkkkk...'
]
const KEEPER_BLINK = KEEPER.map((r, y) => (y === 6 ? '...kOsSssSsOk...' : r))
const CAT = [
  '................',
  '................',
  '................',
  '...kk......kk...',
  '...kYk....kYk...',
  '...kYpkkkkpYk...',
  '...kYYYYYYYYk...',
  '...kYkhYYhkYk...',
  '...kLYYppYYLk...',
  '....kYYYYYYk....',
  '...kYyYLLYyYk...',
  '...kYyLLLLyYk.k.',
  '..kYYyLLLLyYkkYk',
  '..kYYyyLLyyYkYk.',
  '..kyYYkyykYYyk..',
  '...kkkkkkkkkk...'
]
const CAT_BLINK = CAT.map((r, y) => (y === 7 ? '...kYyyYYyyYk...' : r))
const GHOST = sym([
  '........',
  '.....kkk',
  '...kkooo',
  '..kioooo',
  '..kioooo',
  '.kiikkoo',
  '.kiikkoo',
  '.kipoooo',
  '.kiioooo',
  '.kCiiooo',
  '.kCiiioo',
  '.kCCiiio',
  '.kCCCiii',
  '.kCkCCiC',
  '..k.kkCk',
  '.....k.k'
])
const GHOST_BLINK = GHOST.map((r, y) => (y === 5 ? '.kiiooooooooiik.' : y === 6 ? '.kiikkooookkiik.' : r))
const SLIME_A = sym([
  '........',
  '........',
  '........',
  '........',
  '........',
  '......kk',
  '....kkpp',
  '...kpopp',
  '..kpoppp',
  '..kpkopp',
  '.kRpkkpp',
  '.kRRpppp',
  '.kRRRppR',
  '.krRRRRR',
  '..krrrrr',
  '...kkkkk'
])
const SLIME_B = sym([
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '.....kkk',
  '...kkppp',
  '..kpoppp',
  '.kpokopp',
  'kRppkkpp',
  'kRRRpppp',
  'kRRRRRpR',
  '.krrRRRR',
  '..kkkkkk'
])

// ---- props and items ---------------------------------------------------------------------------
const GEM = sprite([
  '..kkkk..',
  '.kiioCk.',
  'kioiiCck',
  'kiiCCcck',
  '.kCCcck.',
  '..kCck..',
  '...kk...',
  '........'
])
const KEY = sprite([
  '..kkkk..........',
  '.kLLLYk.........',
  'kLYkkYYkkkkkkkk.',
  'kYk..kYLLLLLLLYk',
  'kYk..kYYYYYYYYyk',
  'kyYkkYykkkkyykyk',
  '.kyyyyk...kyk.k.',
  '..kkkk.....k....'
])
const CHEST = sprite(
  sym([
    '........',
    '........',
    '........',
    '..kkkkkk',
    '.kBvvvvv',
    '.kbBBBBB',
    '.kyYyyyy',
    '.kbbbbbk',
    '.kkkkkkk',
    '.kWbbbbk',
    '.kYbbbbb',
    '.kWbbbbb',
    '.kYWWWWW',
    '.kwwwwww',
    '..kkkkkk',
    '........'
  ]).map((r, y) => (y === 7 ? '.kbbbbbkLkbbbbk.' : y === 8 ? '.kkkkkkYYkkkkkk.' : y === 9 ? '.kWbbbbkkbbbbWk.' : r))
)
const CHEST_OPEN = sprite(
  sym([
    '........',
    '..kkkkkk',
    '.kbBBBBB',
    '.kWbbbbb',
    '.kkkkkkk',
    '.kwnnnnn',
    '.knnnnnn',
    '.kkkkkkk',
    '.kWbbbbb',
    '.kYbbbbb',
    '.kWbbbbb',
    '.kYbbbbb',
    '.kYWWWWW',
    '.kwwwwww',
    '..kkkkkk',
    '........'
  ])
)
const PADLOCK = sprite(['.kkk.', 'k4.4k', 'kkkkk', 'k454k', 'k4k4k', 'kkkkk'])
const LEVER_OFF = sprite([
  '................',
  '................',
  '..kk............',
  '.kRpk...........',
  '.kRRk...........',
  '..kkbk..........',
  '....kbk.........',
  '.....kbk........',
  '......kbk.......',
  '....kkkkkkkk....',
  '...k44444443k...',
  '..k4555555543k..',
  '..k3444444443k..',
  '..k2333333332k..',
  '...kkkkkkkkkk...',
  '................'
])
const LEVER_ON = sprite([
  '................',
  '................',
  '............kk..',
  '...........kpRk.',
  '...........kRRk.',
  '..........kbkk..',
  '.........kbk....',
  '........kbk.....',
  '.......kbk......',
  '....kkkkkkkk....',
  '...k44444443k...',
  '..k4555h55543k..',
  '..k3444444443k..',
  '..k2333333332k..',
  '...kkkkkkkkkk...',
  '................'
])
const CRATE = sprite([
  '................',
  '.kkkkkkkkkkkkkk.',
  '.kvvvvvvvvvvvBk.',
  '.kvBBBBBBBBBBbk.',
  '.kBbbbbbbbbbbbk.',
  '.kkkkkkkkkkkkkk.',
  '.kBkbbbbbbbbkWk.',
  '.kBbkbbbbbbkbWk.',
  '.kBbbkbbbbkbbWk.',
  '.kBbbbkbbkbbbWk.',
  '.kBbbbbkkbbbbWk.',
  '.kBbbbkbbkbbbWk.',
  '.kBbbkbbbbkbbWk.',
  '.kBbkbbbbbbkbWk.',
  '.kkkkkkkkkkkkkk.',
  '................'
])
const PLATE_UP = sprite(
  sym([
    '........',
    '........',
    '........',
    '..kkkkkk',
    '.k555555',
    '.k544444',
    '.k54kkkk',
    '.k54kYYY',
    '.k54kYLL',
    '.k54kYYY',
    '.k54kkkk',
    '.k433333',
    '.k322222',
    '..kkkkkk',
    '........',
    '........'
  ])
)
const PLATE_DOWN = sprite(
  sym([
    '........',
    '........',
    '........',
    '........',
    '..kkkkkk',
    '.k333333',
    '.k32kkkk',
    '.k32kLLL',
    '.k32kLoo',
    '.k32kLLL',
    '.k32kkkk',
    '.k322222',
    '..kkkkkk',
    '........',
    '........',
    '........'
  ])
)
const BARS = sprite([
  'kkkkkkkkkkkkkkkk',
  'k44k44k44k44k44k',
  '.k4k.k4k.k4k.k4.',
  '.k5k.k5k.k5k.k5.',
  '.k4k.k4k.k4k.k4.',
  '.k4k.k4k.k4k.k4.',
  '.k3k.k3k.k3k.k3.',
  '.k4k.k4k.k4k.k4.',
  'kkkkkkkkkkkkkkkk',
  'k33k33k33k33k33k',
  '.k4k.k4k.k4k.k4.',
  '.k4k.k4k.k4k.k4.',
  '.k3k.k3k.k3k.k3.',
  '.k3k.k3k.k3k.k3.',
  '.k2k.k2k.k2k.k2.',
  '.kkk.kkk.kkk.kkk'
])
const BARS_UP = sprite(['kkkkkkkkkkkkkkkk', 'k44k44k44k44k44k', '.k3k.k3k.k3k.k3.', '.kkk.kkk.kkk.kkk'])
const BARREL = sprite(
  sym([
    '........',
    '...kkkkk',
    '..kBvvvv',
    '.kBbBBBB',
    '.kbwbbbb',
    '.kkkkkkk',
    '.kb3bBBb',
    '.kbbbbBb',
    '.kkkkkkk',
    '.kbbbbBb',
    '.kbWbbBb',
    '.kkkkkkk',
    '.kWbbbbb',
    '..kWWWWW',
    '...kkkkk',
    '........'
  ])
)
const PILLAR = sprite(
  sym([
    '..kkkkkk',
    '.k555555',
    '.k444444',
    '.kkkkkkk',
    '..k54444',
    '..k54444',
    '..k43333',
    '..k43333',
    '..k43333',
    '..k43332',
    '..k43332',
    '..k32222',
    '.kkkkkkk',
    '.k444444',
    '.k333333',
    '..kkkkkk'
  ])
)
const SHELF = sprite([
  'kkkkkkkkkkkkkkkk',
  'kBvvvvvvvvvvvvBk',
  'kbkkkkkkkkkkkkbk',
  'kbkRkCkhkYkRkkbk',
  'kbkRkCkhkYkRkpbk',
  'kbkrkckgkykrkpbk',
  'kbkkkkkkkkkkkkbk',
  'kbWWWWWWWWWWWWbk',
  'kbkkkkkkkkkkkkbk',
  'kbkCkkYkRkhkCkbk',
  'kbkCkLYkRkhkCkbk',
  'kbkckyykrkgkckbk',
  'kbkkkkkkkkkkkkbk',
  'kbWWWWWWWWWWWWbk',
  'kwwwwwwwwwwwwwwk',
  'kkkkkkkkkkkkkkkk'
])
const URN = sprite(
  sym([
    '........',
    '........',
    '....kkkk',
    '...k3444',
    '....kkkk',
    '...kc4CC',
    '..kcCCiC',
    '.kcCCCCC',
    '.kcCkkkk',
    '.kcCkYYY',
    '.kcCkkkk',
    '.kccCCCC',
    '..kccCCC',
    '...kcccc',
    '....kkkk',
    '........'
  ])
)
const DOOR = sprite(
  sym([
    '........',
    '........',
    '........',
    '...kkkkk',
    '..k44kkk',
    '.k45kBbb',
    '.k4kBbBb',
    '.k4kbbBb',
    '.k4k3333',
    '.k4kbbBk',
    '.k4kbbBY',
    '.k4kbbBk',
    '.k4k3333',
    '.k4kbbBb',
    '.k4kbbBb',
    '.k3kwwww'
  ]).map((r, y) => (y === 9 ? '.k4kbbBkkBbbk4k.' : y === 10 ? '.k4kbbBYLBbbk4k.' : y === 11 ? '.k4kbbBkkBbbk4k.' : r))
)
const DOOR_OPEN = sprite(
  sym([
    '........',
    '........',
    '........',
    '...kkkkk',
    '..k44kkk',
    '.k45knnn',
    '.k4knnnn',
    '.k4knkkk',
    '.k4kkkkk',
    '.k4kk111',
    '.k4kkkkk',
    '.k4kk222',
    '.k4kkkkk',
    '.k4kk333',
    '.k4kkkkk',
    '.k3kk444'
  ])
)
const TORCH = [0, 1, 2].map((f) =>
  sprite([
    '................',
    f === 0 ? '.......o........' : f === 1 ? '........o.......' : '......o.........',
    f === 0 ? '......LY........' : f === 1 ? '.......YL.......' : '......YL........',
    '......LLY.......',
    '.....YLoLY......',
    '.....YLooY......',
    '.....RYLYR......',
    '......kkkk......',
    '.....kyYYyk.....',
    '......kyyk......',
    '.......kk.......',
    '.......kk.......',
    '......k33k......',
    '......kkkk......',
    '................',
    '................'
  ])
)
const BANG = sprite(['.kkkkk.', 'kooRook', 'kooRooO', 'kooRooO', 'kooooOk', 'kooRoOk', '.kkkkk.', '..kOk..', '...k...'])
const HEART = sprite(['.kk.kk.', 'kRpkRRk', 'kRRRRRk', '.kRRRk.', '..kRk..', '...k...'])

// ---- rooms -------------------------------------------------------------------------------------
// # wall · T torch · D door · E way in · . floor · r rug · g gem · N resident · @ start
// C chest · L lever · x crate · s pressure plate · | bars · K key on the floor · o barrel/urn/pillar · B shelf
const ROOMS = [
  {
    name: "Keeper's Hall",
    floor: 'wood',
    npc: 'keeper',
    deco: 'barrel',
    map: [
      '###T####D####T####',
      '#BB............BC#',
      '#......rrrr......#',
      '#..g...rrrr...g..#',
      '#......rrrr......#',
      '#..o..........o..#',
      '#.......N........#',
      '#.g...........g..#',
      '#.......@........#',
      '########E#########'
    ]
  },
  {
    name: 'Cat Storeroom',
    floor: 'stone',
    npc: 'cat',
    deco: 'barrel',
    map: [
      '####T####D####T###',
      '#g###...........g#',
      '#.#K|.....s......#',
      '#.###.o..........#',
      '#................#',
      '#......x.....o...#',
      '#..............N.#',
      '#.g...........g..#',
      '#........@.......#',
      '#########E########'
    ]
  },
  {
    name: 'Ghost Crypt',
    floor: 'crypt',
    npc: 'ghost',
    deco: 'pillar',
    lockedChest: true,
    slimes: [
      [[3, 2], [15, 2]],
      [[3, 4], [11, 4], [11, 6], [3, 6]]
    ],
    map: [
      '###T####D####T####',
      '#C..o.........o.g#',
      '#................#',
      '#..g....oo.......#',
      '#...............L#',
      '#.o..........o...#',
      '#........g.......#',
      '#.g..........N...#',
      '#.......@........#',
      '########E#########'
    ]
  }
]

const FLOORS = {
  wood: { gap: '#40252c', base: ['#5c352d', '#62382f', '#6a3e32'], grain: '#714536', hi: '#7c4c37' },
  stone: { gap: '#2b2638', base: ['#4b4458', '#514a5e', '#574f63'], grain: '#433d50', hi: '#615a6e' },
  crypt: { gap: '#1f2034', base: ['#33364d', '#383b53', '#3d4058'], grain: '#2b2d42', hi: '#4a4e66', moss: ['#264a42', '#2f5f4d'] }
}

// ---- art bake ----------------------------------------------------------------------------------
let ART = null
function art() {
  if (ART) return ART
  const side = heroFrames(HERO_SIDE, LEGS_SIDE)
  ART = {
    hero: {
      down: heroFrames(HERO_DOWN, LEGS_FRONT),
      up: heroFrames(HERO_UP, LEGS_FRONT),
      right: side,
      left: side.map(flipX)
    },
    keeper: [sprite(KEEPER), sprite(KEEPER_BLINK)],
    cat: [sprite(CAT), sprite(CAT_BLINK)],
    ghost: [sprite(GHOST), sprite(GHOST_BLINK)],
    slime: [sprite(SLIME_A), sprite(SLIME_B)],
    glow: [bakeGlow(30), bakeGlow(33)],
    keyGlow: bakeGlow(14, PAL.L)
  }
  return ART
}
/** A stepped (banded) warm light disc at native resolution, drawn with 'lighter'. */
function bakeGlow(r, color = '#f0a040') {
  const c = mk(r * 2, r * 2)
  const g = c.getContext('2d')
  g.fillStyle = color
  for (let y = 0; y < r * 2; y++) {
    for (let x = 0; x < r * 2; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r
      const a = d < 0.38 ? 0.16 : d < 0.68 ? 0.1 : d < 1 ? 0.045 : 0
      if (!a) continue
      g.globalAlpha = a
      g.fillRect(x, y, 1, 1)
    }
  }
  return c
}

const isWallCh = (ch) => ch === '#' || ch === 'T' || ch === 'D' || ch === 'E' || ch === undefined

/** The static layer of a room: floor, rug, walls, shadows. Baked once per room. */
function bakeRoom(room, seed) {
  const c = mk(NW, NH)
  const g = c.getContext('2d')
  const F = FLOORS[room.floor]
  const at = (x, y) => (y < 0 || y >= ROWS || x < 0 || x >= COLS ? undefined : room.map[y][x])
  const wallAt = (x, y) => isWallCh(at(x, y)) || at(x, y) === '#'
  // Floor
  g.fillStyle = F.gap
  g.fillRect(0, 0, NW, NH)
  if (room.floor === 'wood') {
    for (let r = 0; r < NH / 4; r++) {
      let x = -Math.floor(hash(r, 1, seed) * 30)
      let n = 0
      while (x < NW) {
        const len = 18 + Math.floor(hash(r, n, seed + 2) * 26)
        g.fillStyle = F.base[Math.floor(hash(r, n, seed + 3) * 3)]
        g.fillRect(x, r * 4, len - 1, 3)
        g.fillStyle = F.hi
        g.fillRect(x, r * 4, 2, 1)
        for (let k = 0; k < 3; k++) {
          if (hash(r, n * 7 + k, seed + 4) < 0.55) {
            g.fillStyle = F.grain
            g.fillRect(x + 3 + Math.floor(hash(r, n * 9 + k, seed + 5) * (len - 8)), r * 4 + 1 + (k % 2), 3, 1)
          }
        }
        if (hash(r, n, seed + 6) < 0.08) {
          g.fillStyle = F.gap
          g.fillRect(x + 4 + Math.floor(hash(n, r, seed) * (len - 8)), r * 4 + 1, 1, 1)
        }
        x += len
        n++
      }
    }
  } else {
    const big = room.floor === 'crypt'
    const sw = big ? 12 : 8
    for (let r = 0; r < NH / 8; r++) {
      const off = r & 1 ? sw / 2 : 0
      for (let cx = -1; cx * sw < NW; cx++) {
        const x = cx * sw + off
        const y = r * 8
        const v = hash(cx, r, seed)
        g.fillStyle = F.base[v < 0.2 ? 0 : v > 0.8 ? 2 : 1]
        g.fillRect(x, y, sw - 1, 7)
        g.fillStyle = F.hi
        g.fillRect(x, y, sw - 2, 1)
        g.fillRect(x, y, 1, 3)
        const sp = hash(cx, r, seed + 9)
        if (sp < 0.2) {
          g.fillStyle = F.grain
          const px = x + 2 + Math.floor(hash(cx, r, seed + 10) * (sw - 5))
          const py = y + 2 + Math.floor(hash(cx, r, seed + 11) * 3)
          g.fillRect(px, py, 2, 1)
          g.fillRect(px + 1, py + 1, 1, 1)
        } else if (sp > 0.95) {
          // a crack: three dark pixels stepping down
          g.fillStyle = F.gap
          const px = x + 1 + Math.floor(hash(cx, r, seed + 12) * (sw - 5))
          g.fillRect(px, y + 2, 1, 1)
          g.fillRect(px + 1, y + 3, 1, 1)
          g.fillRect(px + 1, y + 4, 1, 1)
          g.fillRect(px + 2, y + 5, 1, 1)
        }
        if (F.moss && hash(cx, r, seed + 13) < 0.22) {
          const px = x + Math.floor(hash(cx, r, seed + 14) * (sw - 3))
          g.fillStyle = F.moss[0]
          g.fillRect(px, y + 6, 4, 2)
          g.fillStyle = F.moss[1]
          g.fillRect(px + 1, y + 6, 2, 1)
        }
      }
    }
  }
  // Rug
  let rx0 = 99, ry0 = 99, rx1 = -1, ry1 = -1
  room.map.forEach((row, y) => [...row].forEach((ch, x) => ch === 'r' && ((rx0 = Math.min(rx0, x)), (ry0 = Math.min(ry0, y)), (rx1 = Math.max(rx1, x)), (ry1 = Math.max(ry1, y)))))
  if (rx1 >= 0) {
    const x = rx0 * TS + 3, y = ry0 * TS + 2, w = (rx1 - rx0 + 1) * TS - 6, h = (ry1 - ry0 + 1) * TS - 4
    g.fillStyle = 'rgba(20,12,30,0.45)'
    g.fillRect(x + 1, y + 2, w, h)
    g.fillStyle = PAL.r
    g.fillRect(x, y, w, h)
    g.fillStyle = PAL.R
    g.fillRect(x + 1, y + 1, w - 2, h - 2)
    g.fillStyle = PAL.Y
    g.fillRect(x + 3, y + 3, w - 6, 1)
    g.fillRect(x + 3, y + h - 4, w - 6, 1)
    g.fillRect(x + 3, y + 3, 1, h - 6)
    g.fillRect(x + w - 4, y + 3, 1, h - 6)
    // diamonds down the middle
    for (let dy = 8; dy < h - 8; dy += 10) {
      const cx = x + Math.floor(w / 2), cy = y + dy
      g.fillStyle = PAL.r
      for (let k = -3; k <= 3; k++) g.fillRect(cx - (3 - Math.abs(k)), cy + k, (3 - Math.abs(k)) * 2 + 1, 1)
      g.fillStyle = PAL.p
      g.fillRect(cx, cy - 1, 1, 3)
      g.fillRect(cx - 1, cy, 3, 1)
    }
    // fringe at the short ends
    g.fillStyle = PAL.O
    for (let fx = x + 1; fx < x + w - 1; fx += 2) {
      g.fillRect(fx, y - 2, 1, 2)
      g.fillRect(fx, y + h, 1, 2)
    }
  }
  // Walls
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const ch = at(tx, ty)
      if (!isWallCh(ch)) continue
      const x = tx * TS, y = ty * TS
      if (ty === 0) {
        drawFace(g, x, y, 0, tx, seed)
      } else {
        drawCap(g, x, y, tx, ty, seed)
        // Outline the wall mass where it meets the floor.
        g.fillStyle = INK
        if (!wallAt(tx - 1, ty) && tx > 0) g.fillRect(x, y, 1, TS)
        if (!wallAt(tx + 1, ty) && tx < COLS - 1) g.fillRect(x + TS - 1, y, 1, TS)
        if (!wallAt(tx, ty - 1) && ty > 0) g.fillRect(x, y, TS, 1)
        const below = at(tx, ty + 1)
        if (ty < ROWS - 1 && !isWallCh(below) && below !== '#') drawFace(g, x, y, 9, tx, seed)
      }
      if (ch === 'E') {
        // the way in: a dark archway with two steps
        g.fillStyle = INK
        g.fillRect(x + 2, y, 12, TS)
        g.fillStyle = PAL.n
        g.fillRect(x + 3, y, 10, TS)
        g.fillStyle = PAL[2]
        g.fillRect(x + 3, y + 1, 10, 2)
        g.fillStyle = PAL[1]
        g.fillRect(x + 3, y + 5, 10, 2)
      }
    }
  }
  // Soft shadows cast on the floor by the walls (light from the top-left).
  g.fillStyle = 'rgba(16,10,28,0.38)'
  for (let ty = 1; ty < ROWS - 1; ty++) {
    for (let tx = 1; tx < COLS - 1; tx++) {
      if (isWallCh(at(tx, ty)) || at(tx, ty) === '#') continue
      const x = tx * TS, y = ty * TS
      if (isWallCh(at(tx, ty - 1)) || at(tx, ty - 1) === '#') g.fillRect(x, y, TS, 3)
      if (isWallCh(at(tx - 1, ty)) || at(tx - 1, ty) === '#') g.fillRect(x, y, 3, TS)
    }
  }
  return c
}
/** Brick wall face from row `from` to the bottom of the tile (with a cap on top when from = 0). */
function drawFace(g, x, y, from, tx, seed) {
  const top = y + from
  g.fillStyle = '#3a3552'
  g.fillRect(x, top, TS, TS - from)
  let row = 0
  for (let by = from === 0 ? 4 : from + 1; by < TS - 1; by += 4, row++) {
    const off = (row + (from ? 1 : 0)) & 1 ? 4 : 0
    for (let bx = -8 + off; bx < TS; bx += 8) {
      const v = hash(tx * 3 + Math.floor((bx + 8) / 8), by, seed + 20)
      g.fillStyle = v < 0.18 ? '#57516f' : v > 0.85 ? '#76708f' : '#66607f'
      const x0 = Math.max(x, x + bx), x1 = Math.min(x + TS, x + bx + 7)
      if (x1 > x0) {
        g.fillRect(x0, y + by, x1 - x0, 3)
        g.fillStyle = '#827c9b'
        if (x + bx >= x) g.fillRect(x + bx, y + by, Math.min(5, x + TS - (x + bx)), 1)
      }
    }
  }
  g.fillStyle = PAL[1]
  g.fillRect(x, y + TS - 2, TS, 1)
  g.fillStyle = INK
  g.fillRect(x, y + TS - 1, TS, 1)
  if (from === 0) {
    g.fillStyle = INK
    g.fillRect(x, y, TS, 1)
    g.fillStyle = PAL[1]
    g.fillRect(x, y + 1, TS, 2)
    g.fillStyle = PAL[4]
    g.fillRect(x, y + 3, TS, 1)
  } else {
    g.fillStyle = PAL[4]
    g.fillRect(x, top, TS, 1)
  }
}
function drawCap(g, x, y, tx, ty, seed) {
  g.fillStyle = PAL[1]
  g.fillRect(x, y, TS, TS)
  g.fillStyle = PAL.n
  for (let k = 0; k < 3; k++) {
    const px = x + Math.floor(hash(tx, ty, seed + 30 + k) * 13), py = y + Math.floor(hash(ty, tx, seed + 40 + k) * 13)
    g.fillRect(px, py, 3, 1)
  }
  g.fillStyle = PAL[2]
  const px = x + Math.floor(hash(tx, ty, seed + 50) * 12), py = y + Math.floor(hash(ty, tx, seed + 51) * 12)
  g.fillRect(px, py, 2, 1)
}

// ---- small drawing helpers ---------------------------------------------------------------------
function shadow(g, cx, cy, w) {
  g.fillStyle = 'rgba(12,8,24,0.42)'
  g.fillRect(Math.round(cx - w / 2) + 1, cy - 1, w - 2, 1)
  g.fillRect(Math.round(cx - w / 2), cy, w, 1)
  g.fillRect(Math.round(cx - w / 2) + 1, cy + 1, w - 2, 1)
}
function sparkle(g, x, y, f) {
  g.fillStyle = PAL.o
  if (f === 0) g.fillRect(x, y, 1, 1)
  else if (f === 1) (g.fillRect(x - 1, y, 3, 1), g.fillRect(x, y - 1, 1, 3))
  else (g.fillRect(x - 2, y, 5, 1), g.fillRect(x, y - 2, 1, 5), (g.fillStyle = PAL.i), g.fillRect(x, y, 1, 1))
}

/** A pixel frame (outer ink, light bevel, dark fill) on the full-res canvas, in 4 px steps. */
function pixelBox(ctx, x, y, w, h, { fill = '#221b36', edge = PAL[4], dark = PAL[2], alpha = 0.96 } = {}) {
  ctx.fillStyle = INK
  ctx.fillRect(x + 4, y, w - 8, h)
  ctx.fillRect(x, y + 4, w, h - 8)
  ctx.fillStyle = edge
  ctx.fillRect(x + 8, y + 4, w - 16, 4)
  ctx.fillRect(x + 4, y + 8, 4, h - 16)
  ctx.fillStyle = dark
  ctx.fillRect(x + 8, y + h - 8, w - 16, 4)
  ctx.fillRect(x + w - 8, y + 8, 4, h - 16)
  ctx.globalAlpha = alpha
  ctx.fillStyle = fill
  ctx.fillRect(x + 8, y + 8, w - 16, h - 16)
  ctx.globalAlpha = 1
}
function pixText(ctx, str, x, y, font, color = PAL.o, align = 'left') {
  ctx.font = font
  ctx.textAlign = align
  ctx.textBaseline = 'top'
  ctx.fillStyle = INK
  ctx.fillText(str, x + 4, y + 4)
  ctx.fillStyle = color
  ctx.fillText(str, x, y)
}

// ---- the hub icon: hero, a floating key and a locked door --------------------------------------
let ICON = null
function drawIcon(ctx, x, y, size, t) {
  const A = art()
  const w = 90, h = 42
  ICON ??= { c: mk(w, h), bg: null }
  const g = ICON.c.getContext('2d')
  if (!ICON.bg) {
    const bg = mk(w, h)
    const b = bg.getContext('2d')
    const baked = bakeRoom({ floor: 'stone', map: [...Array(ROWS)].map((_, r) => (r === 0 ? '#'.repeat(COLS) : '.'.repeat(COLS))) }, 7)
    b.drawImage(baked, 0, 0, w, h, 0, 0, w, h)
    ICON.bg = bg
  }
  g.clearRect(0, 0, w, h)
  g.drawImage(ICON.bg, 0, 0)
  const tf = Math.floor(t * 8) % 3
  g.drawImage(TORCH[tf], 6, 0)
  g.drawImage(TORCH[(tf + 1) % 3], 68, 0)
  g.globalCompositeOperation = 'lighter'
  g.drawImage(A.glow[Math.floor(t * 6) % 2], 14 - 30, 6 - 30)
  g.drawImage(A.glow[Math.floor(t * 6 + 1) % 2], 76 - 30, 6 - 30)
  g.globalCompositeOperation = 'source-over'
  g.drawImage(DOOR, 52, 0)
  const step = Math.floor(t * 4) % 4
  shadow(g, 30, 33, 10)
  g.drawImage(A.hero.right[step === 1 ? 2 : 1], 22, 20 + (step === 1 ? -1 : 0))
  const bob = Math.round(Math.sin(t * 3) * 1.5)
  shadow(g, 49, 36, 8)
  g.drawImage(KEY, 41, 20 + bob)
  sparkle(g, 53, 19 + bob, Math.floor(t * 5) % 3)
  const s = Math.max(1, Math.floor(size / 32))
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(ICON.c, Math.round(x - (w * s) / 2), Math.round(y - (h * s) / 2), w * s, h * s)
  ctx.restore()
}

export default {
  id: 'keyhole',
  name: 'Keyhole',
  blurb: 'Talk, push, sneak, find the key',
  scoreLabel: 'points',
  style: { bg: '#2a2342', accent: '#f2c14e' },
  medals: [400, 800, 1100],
  music: { bpm: 96, root: 55, chords: [0, 5, 9, 7], lead: [0, 2, 4, 7, 4, 2, 1, null], wave: 'square', gain: 0.028 },
  TUNING,
  howTo: (input) =>
    input.mode === 'touch' || input.mode === 'mouse'
      ? `${input.label('a')} where to walk · ${input.label('a')} people and things to use them`
      : `${input.stickLabel()} to walk · ${input.label('a')} to talk, open and push`,
  icon: drawIcon,
  cursor: true,
  create(env) {
    const { input, audio, settings, font } = env
    const T = env.TUNING
    const A = art()
    const nat = mk(NW, NH)
    const g = nat.getContext('2d')
    const F20 = () => font(400, 20, 'Press Start 2P')

    // ---- sound ----
    const sfx = {
      step: (n) => (audio.noise({ dur: 0.025, gain: 0.035 }), audio.tone({ freq: n ? 150 : 130, dur: 0.035, type: 'triangle', gain: 0.05 })),
      gem: () => (audio.tone({ freq: 1318, dur: 0.07, type: 'square', gain: 0.07 }), audio.tone({ freq: 1975, dur: 0.12, type: 'square', gain: 0.06, delay: 0.06 })),
      key: () => [0, 4, 7, 12, 16].forEach((s, i) => audio.tone({ freq: 523 * 2 ** (s / 12), dur: 0.14, type: 'square', gain: 0.08, delay: i * 0.07 })),
      unlock: () => (audio.tone({ freq: 220, dur: 0.06, type: 'square', gain: 0.1 }), audio.tone({ freq: 330, dur: 0.06, type: 'square', gain: 0.1, delay: 0.08 }), audio.noise({ dur: 0.18, gain: 0.08, delay: 0.16 }), audio.tone({ freq: 110, dur: 0.35, type: 'triangle', slide: -40, gain: 0.14, delay: 0.16 })),
      open: () => (audio.tone({ freq: 392, dur: 0.08, type: 'triangle', gain: 0.1 }), audio.tone({ freq: 587, dur: 0.12, type: 'triangle', gain: 0.1, delay: 0.07 })),
      lever: () => (audio.noise({ dur: 0.06, gain: 0.12 }), audio.tone({ freq: 180, dur: 0.1, type: 'square', slide: 120, gain: 0.08 }), audio.tone({ freq: 660, dur: 0.1, type: 'square', gain: 0.06, delay: 0.15 })),
      scrape: () => (audio.noise({ dur: 0.14, gain: 0.07 }), audio.tone({ freq: 90, dur: 0.14, type: 'square', slide: -20, gain: 0.05 })),
      bump: () => audio.tone({ freq: 90, dur: 0.06, type: 'triangle', gain: 0.08 }),
      plate: () => (audio.tone({ freq: 196, dur: 0.1, type: 'square', gain: 0.08 }), [0, 7, 12].forEach((s, i) => audio.tone({ freq: 392 * 2 ** (s / 12), dur: 0.12, type: 'triangle', gain: 0.08, delay: 0.12 + i * 0.08 }))),
      hit: () => (audio.noise({ dur: 0.2, gain: 0.16 }), audio.tone({ freq: 440, dur: 0.35, type: 'square', slide: -330, gain: 0.1 })),
      locked: () => (audio.tone({ freq: 140, dur: 0.07, type: 'square', gain: 0.08 }), audio.tone({ freq: 120, dur: 0.09, type: 'square', gain: 0.08, delay: 0.09 })),
      door: () => [0, 5, 9, 12].forEach((s, i) => audio.tone({ freq: 392 * 2 ** (s / 12), dur: 0.12, type: 'square', gain: 0.07, delay: i * 0.06 })),
      win: () => [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => audio.tone({ freq: 523 * 2 ** (s / 12), dur: 0.16, type: 'square', gain: 0.08, delay: i * 0.09 }))
    }
    const VOICES = {
      keeper: { name: 'KEEPER', art: 'keeper', blip: (n) => audio.tone({ freq: 150 + (n % 3) * 12, dur: 0.045, type: 'square', gain: 0.05 }) },
      cat: { name: 'MOTH', art: 'cat', blip: (n) => audio.tone({ freq: 880 + (n % 4) * 60, dur: 0.035, type: 'triangle', gain: 0.06, slide: 120 }) },
      ghost: { name: 'WISP', art: 'ghost', blip: (n) => audio.tone({ freq: 420 + Math.sin(n) * 60, dur: 0.07, type: 'triangle', gain: 0.05, slide: -80 }) },
      note: { name: null, blip: (n) => audio.tone({ freq: 520, dur: 0.02, type: 'square', gain: 0.025 }) }
    }
    const pointerMode = () => input.mode === 'touch' || input.mode === 'mouse'
    const LINES = {
      keeper: () => [
        'Ah, a visitor! These old halls lock behind you, I am afraid.',
        `My spare key sits in the chest in the east corner. Walk up and ${pointerMode() ? input.label('a').toLowerCase() + ' it' : 'press ' + input.label('a')} to open it.`,
        'Grab the gems on your way. Each door after this is trickier!'
      ],
      keeperAgain: () => ['The chest in the east corner, by the shelves. Then the big door up north.'],
      cat: () => ['Mrrp. The key is behind those bars, see?', `Shove that crate onto the gold plate and the bars lift. ${pointerMode() ? input.label('a') + ' the crate to push it.' : 'Walk into it to push.'}`, 'If it gets stuck, come back and I will nudge it home.'],
      catReset: () => ['Mrrow... fine. Back where it started.'],
      catAgain: () => ['Purr. Plate first, then the key.'],
      ghost: () => ['Ooooh... the slimes guard my old chest. It is locked tight.', 'Pull the lever on the east wall and it opens. If a slime touches you... back to the doorway you go!'],
      ghostAgain: () => ['Lever on the east wall... chest in the far corner... mind the slimes...']
    }

    // ---- run state ----
    let time = T.roundSeconds
    let roomIx = 0
    let gemsTotal = 0
    let roomsCleared = 0
    let hits = 0
    let bonus = 0
    let room = null
    let bg = null
    const hero = { x: 0, y: 0, dir: 'up', frame: 0, anim: 0, moving: false, inv: 0, hold: 0, push: 0 }
    let objs = []
    let gems = []
    let slimes = []
    let crate = null
    let plateLatched = false
    let hasKey = false
    let talk = null
    let path = null
    let fade = { t: 0.35, phase: 'in' }
    let finish = 0
    let finished = false
    let parts = []
    let floats = []
    let shake = 0
    let timeFlash = 0
    let stuckT = 0
    let lastStep = -1
    const t0 = performance.now() / 1000
    let clock = 0

    function loadRoom(ix) {
      room = ROOMS[ix]
      bg = bakeRoom(room, ix * 17 + 3)
      objs = []
      gems = []
      slimes = []
      crate = null
      plateLatched = false
      hasKey = false
      path = null
      talk = null
      room.map.forEach((row, ty) =>
        [...row].forEach((ch, tx) => {
          const o = { tx, ty }
          if (ch === '@') room.start = { tx, ty }
          else if (ch === 'g') gems.push({ x: tx * TS + 8, y: ty * TS + 9, got: false, ph: hash(tx, ty) * 6 })
          else if (ch === 'N') objs.push({ ...o, type: 'npc', who: room.npc, talked: false })
          else if (ch === 'C') objs.push({ ...o, type: 'chest', open: false, locked: !!room.lockedChest })
          else if (ch === 'L') objs.push({ ...o, type: 'lever', on: false })
          else if (ch === 'D') objs.push({ ...o, type: 'door', open: false, anim: 0 })
          else if (ch === 'T') objs.push({ ...o, type: 'torch' })
          else if (ch === 's') objs.push({ ...o, type: 'plate' })
          else if (ch === '|') objs.push({ ...o, type: 'bars', open: false, anim: 0 })
          else if (ch === 'K') objs.push({ ...o, type: 'key' })
          else if (ch === 'o') objs.push({ ...o, type: 'deco', solid: true, art: room.deco === 'pillar' ? (hash(tx, ty) < 0.5 ? PILLAR : URN) : BARREL })
          else if (ch === 'B') objs.push({ ...o, type: 'deco', solid: true, art: SHELF })
          else if (ch === 'x') crate = { tx, ty, home: { tx, ty }, fx: tx * TS, fy: ty * TS, sx: 0, sy: 0, slide: 0 }
        })
      )
      for (const p of room.slimes ?? []) {
        const i = slimes.length
        slimes.push({ pts: p.map(([x, y]) => [x * TS + 8, y * TS + 11]), i: 1, x: p[0][0] * TS + 8, y: p[0][1] * TS + 11, speed: T.slimeSpeed[i % T.slimeSpeed.length], ph: i * 1.7 })
      }
      placeHero()
    }
    function placeHero() {
      hero.x = room.start.tx * TS + 8
      hero.y = room.start.ty * TS + 11
      hero.dir = 'up'
      hero.frame = 0
      path = null
    }
    const objAt = (tx, ty) => objs.find((o) => o.tx === tx && o.ty === ty && o.type !== 'torch')
    function solid(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true
      const ch = room.map[ty][tx]
      if (ch === '#' || ch === 'T' || ch === 'E') return true
      if (crate && crate.tx === tx && crate.ty === ty) return true
      const o = objAt(tx, ty)
      if (!o) return false
      if (o.type === 'door') return !o.open
      if (o.type === 'bars') return !o.open
      return o.type === 'npc' || o.type === 'chest' || o.type === 'lever' || o.solid
    }
    function boxHits(x, y) {
      const x0 = Math.floor((x - HW) / TS), x1 = Math.floor((x + HW - 0.01) / TS)
      const y0 = Math.floor((y - HH) / TS), y1 = Math.floor((y - 0.01) / TS)
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solid(tx, ty)) return true
      return false
    }
    /** Axis-separated movement; returns which axes were blocked. */
    function move(dx, dy) {
      const blocked = { x: false, y: false }
      for (const ax of ['x', 'y']) {
        let rem = ax === 'x' ? dx : dy
        const s = Math.sign(rem)
        rem = Math.abs(rem)
        while (rem > 0) {
          const st = Math.min(1, rem)
          const nx = ax === 'x' ? hero.x + s * st : hero.x
          const ny = ax === 'y' ? hero.y + s * st : hero.y
          if (boxHits(nx, ny)) {
            blocked[ax] = true
            break
          }
          hero.x = nx
          hero.y = ny
          rem -= st
        }
      }
      return blocked
    }
    const heroTile = () => ({ tx: Math.floor(hero.x / TS), ty: Math.floor((hero.y - 3) / TS) })
    const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
    function facingTile() {
      const [dx, dy] = DIRV[hero.dir]
      return { tx: Math.floor((hero.x + dx * (HW + 4)) / TS), ty: Math.floor((hero.y - 3 + dy * 9) / TS) }
    }
    /** What `a` would act on right now (in front of the hero, or the crate being leaned on). */
    function target() {
      const f = facingTile()
      if (crate && crate.tx === f.tx && crate.ty === f.ty && !crate.slide) return { type: 'crate' }
      const o = objAt(f.tx, f.ty)
      if (o && ['npc', 'chest', 'lever', 'door'].includes(o.type)) {
        if (o.type === 'chest' && o.open) return null
        if (o.type === 'lever' && o.on) return null
        if (o.type === 'door' && o.open) return null
        return o
      }
      return null
    }
    const VERBS = { npc: 'Talk', chest: 'Open', lever: 'Pull', door: 'Unlock', crate: 'Push' }

    function say(who, lines, onEnd) {
      talk = { who: VOICES[who], lines, i: 0, shown: 0, blips: 0, onEnd }
      path = null
    }
    function burst(x, y, colors, n = 12, sp = 50) {
      for (let i = 0; i < n && parts.length < 140; i++) {
        const a = Math.random() * Math.PI * 2
        const s = sp * (0.3 + Math.random() * 0.7)
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0.4 + Math.random() * 0.4, c: colors[i % colors.length] })
      }
    }
    function float(str, x, y, color = PAL.L) {
      floats.push({ str, x: OX + x * SC, y: OY + y * SC, t: 0, color })
    }
    function getKey(fromX, fromY) {
      hasKey = true
      hero.hold = T.keyHold
      hero.dir = 'down'
      path = null
      sfx.key()
      burst(hero.x, hero.y - 20, [PAL.L, PAL.Y, PAL.o], 16, 60)
    }
    function interact(o) {
      if (!o) return
      if (o.type === 'crate') return tryPush(...DIRV[hero.dir])
      if (o.type === 'npc') {
        const first = !o.talked
        o.talked = true
        if (o.who === 'cat' && !first && crate && !plateLatched && (crate.tx !== crate.home.tx || crate.ty !== crate.home.ty)) {
          const ht = heroTile()
          if (ht.tx !== crate.home.tx || ht.ty !== crate.home.ty) {
            return say('cat', LINES.catReset(), () => {
              burst(crate.tx * TS + 8, crate.ty * TS + 8, [PAL.o, PAL.O], 10)
              crate.tx = crate.home.tx
              crate.ty = crate.home.ty
              crate.slide = 0
              burst(crate.tx * TS + 8, crate.ty * TS + 8, [PAL.o, PAL.O], 10)
              sfx.scrape()
            })
          }
        }
        return say(o.who, first ? LINES[o.who]() : LINES[o.who + 'Again']())
      }
      if (o.type === 'chest') {
        if (o.locked) {
          sfx.locked()
          return say('note', ['Locked tight. There must be a way to open it...'])
        }
        o.open = true
        sfx.open()
        burst(o.tx * TS + 8, o.ty * TS + 6, [PAL.L, PAL.Y], 10)
        return getKey()
      }
      if (o.type === 'lever') {
        o.on = true
        sfx.lever()
        const chest = objs.find((c) => c.type === 'chest')
        if (chest) {
          chest.locked = false
          burst(chest.tx * TS + 8, chest.ty * TS + 8, [PAL.L, PAL.o, PAL.i], 14, 60)
        }
        return say('note', ['Clunk! Far away, a lock springs open.'])
      }
      if (o.type === 'door') {
        if (!hasKey) {
          sfx.locked()
          return say('note', ['The door is locked. The key must be in this room somewhere.'])
        }
        hasKey = false
        o.open = true
        sfx.unlock()
        burst(o.tx * TS + 8, o.ty * TS + 10, [PAL.L, PAL.Y, PAL[5]], 16, 50)
        shake = 0.15
      }
    }
    function tryPush(dx, dy) {
      if (!crate || crate.slide > 0) return false
      const nx = crate.tx + dx, ny = crate.ty + dy
      const gemThere = gems.some((gm) => !gm.got && Math.floor(gm.x / TS) === nx && Math.floor(gm.y / TS) === ny)
      const ht = heroTile()
      if (solid(nx, ny) || gemThere || room.map[ny][nx] === 'K' || (ht.tx === nx && ht.ty === ny)) {
        sfx.bump()
        return false
      }
      crate.sx = crate.tx * TS
      crate.sy = crate.ty * TS
      crate.tx = nx
      crate.ty = ny
      crate.slide = T.crateSlide
      sfx.scrape()
      return true
    }
    function crateLanded() {
      const plate = objs.find((o) => o.type === 'plate')
      if (plate && crate.tx === plate.tx && crate.ty === plate.ty && !plateLatched) {
        plateLatched = true
        sfx.plate()
        const bars = objs.find((o) => o.type === 'bars')
        if (bars) {
          bars.open = true
          burst(bars.tx * TS + 8, bars.ty * TS + 4, [PAL[5], PAL.o, PAL.L], 14, 50)
        }
        burst(plate.tx * TS + 8, plate.ty * TS + 8, [PAL.L, PAL.Y], 12, 50)
      }
    }

    // ---- tap to walk: BFS over the tile grid ----
    function bfs(from, goals) {
      const key = (x, y) => y * COLS + x
      const prev = new Map([[key(from.tx, from.ty), null]])
      const q = [[from.tx, from.ty]]
      const isGoal = (x, y) => goals.some((gl) => gl.tx === x && gl.ty === y)
      while (q.length) {
        const [x, y] = q.shift()
        if (isGoal(x, y)) {
          const out = []
          let k = key(x, y)
          while (k !== null) {
            out.unshift({ tx: k % COLS, ty: Math.floor(k / COLS) })
            k = prev.get(k)
          }
          return out
        }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy
          if (prev.has(key(nx, ny)) || solid(nx, ny) || ny === 0) continue
          prev.set(key(nx, ny), key(x, y))
          q.push([nx, ny])
        }
      }
      return null
    }
    function tapAt(tx, ty) {
      const from = heroTile()
      const o = objAt(tx, ty)
      const isCrate = crate && crate.tx === tx && crate.ty === ty
      const usable = o && ['npc', 'chest', 'lever', 'door'].includes(o.type) && !(o.type === 'door' && o.open)
      if (isCrate || usable) {
        const dirs = o?.type === 'door' ? [['up', 0, 1]] : [['up', 0, 1], ['down', 0, -1], ['left', 1, 0], ['right', -1, 0]]
        const spots = dirs.map(([dir, dx, dy]) => ({ tx: tx + dx, ty: ty + dy, dir })).filter((s) => !solid(s.tx, s.ty) && s.ty > 0)
        const p = bfs(from, spots)
        if (!p) return sfx.bump()
        const end = p[p.length - 1]
        const spot = spots.find((s) => s.tx === end.tx && s.ty === end.ty)
        path = { tiles: p.slice(1), then: () => ((hero.dir = spot.dir), isCrate ? tryPush(...DIRV[spot.dir]) : interact(o)) }
        if (!path.tiles.length) (path.then(), (path = null))
        return
      }
      if (o?.type === 'door' && o.open) {
        const p = bfs(from, [{ tx, ty: 1 }])
        if (p) path = { tiles: [...p.slice(1), { tx, ty: 0 }], then: null }
        return
      }
      if (solid(tx, ty) || ty === 0) return
      const p = bfs(from, [{ tx, ty }])
      if (p) path = { tiles: p.slice(1), then: null }
    }

    function hitBySlime() {
      hits++
      time = Math.max(0, time - T.slimePenalty)
      timeFlash = 1
      sfx.hit()
      burst(hero.x, hero.y - 6, [PAL.p, PAL.R, PAL.o], 16, 70)
      float(`-${T.slimePenalty}s`, hero.x, hero.y - 20, PAL.p)
      shake = 0.3
      placeHero()
      hero.inv = T.invulnerable
    }

    loadRoom(0)

    const run = {
      score: 0,
      done: false,
      _dbg: () => ({ roomIx, hasKey, time, hx: hero.x, hy: hero.y, talk: !!talk, crate: crate && [crate.tx, crate.ty], plateLatched, gemsTotal, hits, finished }),
      stats: () => [
        ['Rooms', `${roomsCleared}/3`],
        ['Gems', `${gemsTotal}/12`],
        finished ? ['Time bonus', `+${bonus}`] : ['Slime hits', hits]
      ],
      prompts: (inp) => {
        if (talk) return [['a', 'Next']]
        const tg = target()
        return tg ? [['a', VERBS[tg.type]]] : []
      },
      update(dt) {
        clock += dt
        timeFlash = Math.max(0, timeFlash - dt * 2)
        shake = Math.max(0, shake - dt)
        for (const p of parts) {
          p.life -= dt
          p.x += p.vx * dt
          p.y += p.vy * dt
          p.vy += 120 * dt
        }
        parts = parts.filter((p) => p.life > 0)
        for (const f of floats) f.t += dt
        floats = floats.filter((f) => f.t < 1)
        for (const o of objs) if ((o.type === 'door' || o.type === 'bars') && o.open) o.anim = Math.min(1, o.anim + dt * 3)
        if (crate && crate.slide > 0) {
          crate.slide = Math.max(0, crate.slide - dt)
          if (!crate.slide) crateLanded()
        }

        if (finished) {
          finish -= dt
          if (finish <= 0) run.done = true
          return
        }
        if (fade.phase) {
          fade.t -= dt
          if (fade.t <= 0) {
            if (fade.phase === 'out') {
              roomIx++
              if (roomIx >= ROOMS.length) {
                finished = true
                bonus = Math.ceil(time) * T.timeBonus
                run.score += bonus
                finish = 2.2
                sfx.win()
                fade = { phase: null, t: 0 }
                return
              }
              loadRoom(roomIx)
              fade = { phase: 'in', t: 0.35 }
            } else fade = { phase: null, t: 0 }
          }
          if (fade.phase === 'out') return
        }

        // Dialogue: typewriter, a press finishes the line, the next press moves on.
        if (talk) {
          const line = talk.lines[talk.i]
          const before = Math.floor(talk.shown)
          talk.shown = Math.min(line.length, talk.shown + T.typeRate * dt)
          for (let c = before; c < Math.floor(talk.shown); c++) if (c % 2 === 0 && line[c] !== ' ') talk.who.blip(talk.blips++)
          const p = input.pointer
          const tap = p.pressed && !(p.x >= PAUSE_ZONE.x && p.y <= PAUSE_ZONE.h)
          if (input.pressed('a') || tap) {
            if (talk.shown < line.length) talk.shown = line.length
            else if (++talk.i >= talk.lines.length) {
              const end = talk.onEnd
              talk = null
              end?.()
            } else talk.shown = 0
          }
          return
        }

        time -= dt
        if (time <= 0) {
          time = 0
          run.done = true
          audio.tone({ freq: 330, dur: 0.5, type: 'triangle', slide: -200 })
          return
        }
        hero.inv = Math.max(0, hero.inv - dt)

        // Gem sparkle + pickup
        for (const gm of gems) {
          if (gm.got) continue
          if (Math.abs(gm.x - hero.x) < 9 && Math.abs(gm.y + 2 - hero.y) < 10) {
            gm.got = true
            gemsTotal++
            run.score += T.gemScore
            sfx.gem()
            burst(gm.x, gm.y - 4, [PAL.i, PAL.C, PAL.o], 10, 50)
            float(`+${T.gemScore}`, gm.x, gm.y - 12, PAL.i)
          }
        }
        // Floor key (behind the bars)
        const fk = objs.find((o) => o.type === 'key')
        if (fk && Math.abs(fk.tx * TS + 8 - hero.x) < 9 && Math.abs(fk.ty * TS + 10 - hero.y) < 9) {
          objs = objs.filter((o) => o !== fk)
          getKey()
        }

        // Slimes patrol their waypoints.
        for (const sl of slimes) {
          const [tx, ty] = sl.pts[sl.i]
          const d = Math.hypot(tx - sl.x, ty - sl.y)
          const st = sl.speed * dt
          if (d <= st) {
            sl.x = tx
            sl.y = ty
            sl.i = (sl.i + 1) % sl.pts.length
          } else {
            sl.x += ((tx - sl.x) / d) * st
            sl.y += ((ty - sl.y) / d) * st
          }
          if (hero.inv <= 0 && Math.hypot(sl.x - hero.x, sl.y - hero.y) < T.slimeRadius) hitBySlime()
        }

        if (hero.hold > 0) {
          hero.hold -= dt
          hero.moving = false
          return
        }

        // Pointer: tap a tile to walk there, tap people and things to use them.
        const p = input.pointer
        if (p.pressed && !(p.x >= PAUSE_ZONE.x && p.y <= PAUSE_ZONE.h)) {
          const nx = (p.x - OX) / SC, ny = (p.y - OY) / SC
          if (nx >= 0 && ny >= 0 && nx < NW && ny < NH) tapAt(Math.floor(nx / TS), Math.floor(ny / TS))
        }

        let mx = input.x, my = input.y
        const stick = Math.hypot(mx, my)
        if (stick > 0.25) path = null
        else ((mx = 0), (my = 0))
        if (path) {
          const nt = path.tiles[0]
          if (!nt) {
            const then = path.then
            path = null
            then?.()
          } else {
            const gx = nt.tx * TS + 8, gy = nt.ty * TS + 11
            const dx = gx - hero.x, dy = gy - hero.y
            const d = Math.hypot(dx, dy)
            if (d < 1.2) {
              hero.x = gx
              hero.y = gy
              path.tiles.shift()
            } else ((mx = dx / d), (my = dy / d))
          }
        }
        const len = Math.hypot(mx, my)
        hero.moving = len > 0.01
        if (hero.moving) {
          if (len > 1) ((mx /= len), (my /= len))
          if (Math.abs(mx) > Math.abs(my) + 0.05) hero.dir = mx > 0 ? 'right' : 'left'
          else if (Math.abs(my) > 0.05) hero.dir = my > 0 ? 'down' : 'up'
          const st = T.speed * dt
          const ox = hero.x, oy = hero.y
          const bl = move(mx * st, my * st)
          // Corner assist: walking straight into the edge of a gap slides you into it.
          if (bl.y && Math.abs(mx) < 0.3 && my) {
            const tx = Math.floor(hero.x / TS), ny = Math.floor((my < 0 ? hero.y - HH - 1 : hero.y + 1) / TS)
            const cx = tx * TS + 8
            if (!solid(tx, ny) && Math.abs(cx - hero.x) <= T.cornerAssist) move(clamp(cx - hero.x, -st, st), 0)
          }
          if (bl.x && Math.abs(my) < 0.3 && mx) {
            const ty = Math.floor((hero.y - 3) / TS), nx = Math.floor((mx < 0 ? hero.x - HW - 1 : hero.x + HW + 1) / TS)
            const cy = ty * TS + 11
            if (!solid(nx, ty) && Math.abs(cy - hero.y) <= T.cornerAssist) move(0, clamp(cy - hero.y, -st, st))
          }
          // Leaning on a crate pushes it.
          const card = Math.abs(mx) > 0.7 || Math.abs(my) > 0.7
          const f = facingTile()
          if (card && (bl.x || bl.y) && crate && !crate.slide && f.tx === crate.tx && f.ty === crate.ty) {
            hero.push += dt
            if (hero.push >= T.pushHold) {
              hero.push = 0
              tryPush(...DIRV[hero.dir])
            }
          } else hero.push = 0
          // Path stuck guard
          if (path && Math.hypot(hero.x - ox, hero.y - oy) < st * 0.2) {
            stuckT += dt
            if (stuckT > 0.4) ((path = null), (stuckT = 0))
          } else stuckT = 0
          hero.anim += dt * T.walkFps
          const f4 = Math.floor(hero.anim) % 4
          hero.frame = [2, 1, 3, 1][f4]
          if ((f4 === 0 || f4 === 2) && f4 !== lastStep) sfx.step(f4)
          lastStep = f4
        } else {
          hero.frame = 0
          hero.anim = 0
          hero.push = 0
          lastStep = -1
        }

        if (input.pressed('a')) {
          const tg = target()
          if (tg) interact(tg.type === 'crate' ? { type: 'crate' } : tg)
        }

        // Walking through the open door
        if (hero.y < 13) {
          const door = objs.find((o) => o.type === 'door')
          if (door?.open) {
            roomsCleared++
            run.score += T.roomScore
            float(`+${T.roomScore}`, door.tx * TS + 8, 18, PAL.L)
            sfx.door()
            fade = { phase: 'out', t: 0.4 }
            path = null
          }
        }
      },
      draw(ctx) {
        const t = clock
        ctx.fillStyle = '#120e1e'
        ctx.fillRect(0, 0, W, H)
        // ---- world at native resolution ----
        g.clearRect(0, 0, NW, NH)
        g.drawImage(bg, 0, 0)
        const tf = Math.floor(t * 7)
        for (const o of objs) {
          if (o.type === 'torch') g.drawImage(TORCH[(tf + o.tx) % 3], o.tx * TS, o.ty * TS)
          if (o.type === 'door') g.drawImage(o.open ? DOOR_OPEN : DOOR, o.tx * TS, o.ty * TS)
          if (o.type === 'plate') g.drawImage(plateLatched ? PLATE_DOWN : PLATE_UP, o.tx * TS, o.ty * TS)
        }
        g.globalCompositeOperation = 'lighter'
        for (const o of objs) if (o.type === 'torch') g.drawImage(A.glow[(Math.floor(t * 5) + o.tx) % 2], o.tx * TS + 8 - 31, o.ty * TS + 6 - 31)
        g.globalCompositeOperation = 'source-over'

        const list = []
        for (const o of objs) {
          const x = o.tx * TS, y = o.ty * TS
          if (o.type === 'deco') list.push({ y: y + 15, d: () => g.drawImage(o.art, x, y) })
          else if (o.type === 'chest') list.push({ y: y + 14, d: () => (g.drawImage(o.open ? CHEST_OPEN : CHEST, x, y), o.locked && g.drawImage(PADLOCK, x + 6, y + 8)) })
          else if (o.type === 'lever') list.push({ y: y + 14, d: () => g.drawImage(o.on ? LEVER_ON : LEVER_OFF, x, y) })
          else if (o.type === 'bars') list.push({ y: y + 15, d: () => (o.open ? g.drawImage(BARS_UP, x, y - Math.round(o.anim * 2)) : g.drawImage(BARS, x, y)) })
          else if (o.type === 'key') {
            const bob = Math.round(Math.sin(t * 3) * 1.5)
            list.push({ y: y + 10, d: () => (shadow(g, x + 8, y + 13, 8), g.drawImage(KEY, x, y + 3 + bob), sparkle(g, x + 13, y + 2 + bob, Math.floor(t * 5) % 3)) })
          } else if (o.type === 'npc') {
            const frames = A[o.who]
            const blink = (t + o.tx) % 3.2 < 0.15 ? 1 : 0
            const bob = o.who === 'ghost' ? Math.round(Math.sin(t * 2.2) * 2) - 2 : Math.floor(t * 2) % 2 ? -1 : 0
            list.push({
              y: y + 14,
              d: () => {
                shadow(g, x + 8, y + 15, o.who === 'cat' ? 12 : 12)
                if (o.who === 'ghost') g.globalAlpha = 0.85
                g.drawImage(frames[blink], x, y + bob)
                g.globalAlpha = 1
                if (!o.talked) g.drawImage(BANG, x + 9, y - 8 + bob + (Math.floor(t * 3) % 2))
              }
            })
          }
        }
        for (const gm of gems) {
          if (gm.got) continue
          const bob = Math.round(Math.sin(t * 3 + gm.ph))
          list.push({
            y: gm.y,
            d: () => {
              shadow(g, gm.x, gm.y + 3, 6)
              g.drawImage(GEM, gm.x - 4, gm.y - 6 + bob)
              const sf = Math.floor(t * 6 + gm.ph) % 8
              if (sf < 3) sparkle(g, gm.x + 2, gm.y - 5 + bob, sf)
            }
          })
        }
        if (crate) {
          const k = crate.slide > 0 ? crate.slide / T.crateSlide : 0
          const cx = Math.round(crate.tx * TS + (crate.sx - crate.tx * TS) * k)
          const cy = Math.round(crate.ty * TS + (crate.sy - crate.ty * TS) * k)
          list.push({ y: cy + 15, d: () => (shadow(g, cx + 8, cy + 15, 14), g.drawImage(CRATE, cx, cy)) })
        }
        for (const sl of slimes) {
          const f = Math.floor(t * 4 + sl.ph) % 2
          list.push({ y: sl.y, d: () => (shadow(g, Math.round(sl.x), Math.round(sl.y) + 3, 12), g.drawImage(A.slime[f], Math.round(sl.x) - 8, Math.round(sl.y) - 12)) })
        }
        const blinkOff = hero.inv > 0 && Math.floor(hero.inv * 12) % 2 === 0
        list.push({
          y: hero.y,
          d: () => {
            const hx = Math.round(hero.x), hy = Math.round(hero.y)
            shadow(g, hx, hy + 1, 10)
            if (blinkOff) return
            const fr = A.hero[hero.dir][hero.frame]
            const bob = hero.frame >= 2 ? -1 : 0
            g.drawImage(fr, hx - 8, hy - 15 + bob)
            if (hero.hold > 0) {
              g.drawImage(A.keyGlow, hx - 14, hy - 34)
              g.drawImage(KEY, hx - 8, hy - 28)
              sparkle(g, hx + 6, hy - 29, Math.floor(t * 8) % 3)
            }
          }
        })
        list.sort((a, b) => a.y - b.y)
        for (const it of list) it.d()
        for (const p of parts) {
          g.globalAlpha = clamp(p.life * 2.5, 0, 1)
          g.fillStyle = p.c
          g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)
        }
        g.globalAlpha = 1
        // fade between rooms, in stepped bands (a pixel dissolve)
        let fk = 0
        if (fade.phase === 'out') fk = 1 - fade.t / 0.4
        else if (fade.phase === 'in') fk = fade.t / 0.35
        if (finished) fk = 0.5
        if (fk > 0) {
          g.fillStyle = '#120e1e'
          const lvl = Math.round(fk * 4)
          for (let y = 0; y < NH; y += 2) for (let x = 0; x < NW; x += 2) {
            const bayer = [0, 2, 3, 1][(x / 2 + (y / 2) * 2) % 4]
            if (bayer < lvl) g.fillRect(x, y, 2, 2)
          }
        }

        ctx.save()
        if (shake > 0 && !settings.data.reducedShake) ctx.translate(Math.round((Math.random() - 0.5) * 3) * SC, Math.round((Math.random() - 0.5) * 3) * SC)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(nat, OX, OY, NW * SC, NH * SC)
        ctx.restore()
        ctx.imageSmoothingEnabled = true

        // ---- full-res overlays ----
        for (const f of floats) {
          ctx.globalAlpha = clamp(2 - f.t * 2, 0, 1)
          pixText(ctx, f.str, f.x, f.y - f.t * 40, F20(), f.color, 'center')
        }
        ctx.globalAlpha = 1
        const tg = !talk && !fade.phase && !finished && hero.hold <= 0 && target()
        if (tg) {
          const str = `${input.label('a')} ${VERBS[tg.type]}`
          ctx.font = F20()
          const tw = Math.ceil(ctx.measureText(str).width / 4) * 4 + 32
          const bx = clamp(Math.round((OX + hero.x * SC - tw / 2) / 4) * 4, OX, OX + NW * SC - tw)
          // Above the hero's head, or below the feet when the thing is above (so it stays visible).
          const by = hero.dir === 'up' ? Math.round((OY + (hero.y + 3) * SC) / 4) * 4 : Math.max(OY + 8, Math.round((OY + (hero.y - 17) * SC - 52) / 4) * 4)
          pixelBox(ctx, bx, by, tw, 48, { fill: '#2a2342' })
          pixText(ctx, str, bx + 16, by + 14, F20(), PAL.L)
        }
        if (talk) drawTalk(ctx)
        // HUD
        const f20 = F20()
        pixText(ctx, `ROOM ${Math.min(roomIx + 1, 3)}/3`, OX, 24, f20, PAL.Y)
        pixText(ctx, room.name.toUpperCase(), OX, 56, f20, PAL[5])
        const secs = Math.ceil(time)
        const tstr = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
        pixText(ctx, tstr, W / 2, 28, font(400, 32, 'Press Start 2P'), timeFlash > 0 && Math.floor(timeFlash * 8) % 2 ? PAL.p : time < 15 ? PAL.R : PAL.o, 'center')
        pixText(ctx, `${String(run.score).padStart(4, '0')}`, 1120, 24, f20, PAL.L, 'right')
        const roomGems = gems.filter((gm) => gm.got).length
        ctx.save()
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(GEM, 1120 - 152, 52, 32, 32)
        if (hasKey) ctx.drawImage(KEY, 1120 - 232, 56, 64, 32)
        ctx.restore()
        pixText(ctx, `${roomGems}/${gems.length}`, 1120, 60, f20, PAL.i, 'right')
        if (finished) {
          pixelBox(ctx, W / 2 - 300, H / 2 - 110, 600, 220, { fill: '#2a2342' })
          pixText(ctx, 'ESCAPED!', W / 2, H / 2 - 70, font(400, 40, 'Press Start 2P'), PAL.L, 'center')
          pixText(ctx, `TIME BONUS +${bonus}`, W / 2, H / 2 + 4, f20, PAL.o, 'center')
          pixText(ctx, `GEMS ${gemsTotal}/12`, W / 2, H / 2 + 44, f20, PAL.i, 'center')
        }
      }
    }

    const wrapCache = new Map()
    function wrap(ctx, str, maxW) {
      const k = ctx.font + '|' + maxW + '|' + str
      if (wrapCache.has(k)) return wrapCache.get(k)
      const out = []
      let line = ''
      for (const word of str.split(' ')) {
        const tryL = line ? line + ' ' + word : word
        if (ctx.measureText(tryL).width > maxW && line) {
          out.push(line)
          line = word
        } else line = tryL
      }
      if (line) out.push(line)
      wrapCache.set(k, out)
      return out
    }
    function drawTalk(ctx) {
      const who = talk.who
      const bx = 96, bw = W - 192, bh = 176, by = 744 - bh - 16
      pixelBox(ctx, bx, by, bw, bh, { fill: '#1d1730' })
      let tx = bx + 32
      if (who.art) {
        pixelBox(ctx, bx + 24, by + 24, 112, 128, { fill: '#3a3058', edge: PAL[3], dark: PAL[1], alpha: 1 })
        ctx.save()
        ctx.imageSmoothingEnabled = false
        const fr = A[who.art][0]
        ctx.drawImage(fr, 0, 0, 16, 16, bx + 24 + 16, by + 24 + 20, 80, 80)
        ctx.restore()
        tx = bx + 160
      }
      if (who.name) {
        ctx.font = F20()
        const nw = Math.ceil(ctx.measureText(who.name).width / 4) * 4 + 32
        pixelBox(ctx, bx + 24, by - 36, nw, 48, { fill: '#5e1c3a', edge: PAL.R, dark: PAL.r, alpha: 1 })
        pixText(ctx, who.name, bx + 40, by - 22, F20(), PAL.L)
      }
      const line = talk.lines[talk.i]
      ctx.font = F20()
      const lines = wrap(ctx, line, bx + bw - 40 - tx)
      let left = Math.floor(talk.shown)
      lines.forEach((l, i) => {
        const part = l.slice(0, Math.max(0, left))
        left -= l.length + 1
        pixText(ctx, part, tx, by + 32 + i * 36, F20(), PAL.o)
      })
      if (talk.shown >= line.length && Math.floor(clock * 3) % 2 === 0) {
        const ax = bx + bw - 44, ay = by + bh - 36
        ctx.fillStyle = PAL.L
        ctx.fillRect(ax, ay, 16, 4)
        ctx.fillRect(ax + 4, ay + 4, 8, 4)
        ctx.fillStyle = PAL.Y
        ctx.fillRect(ax + 4, ay + 8, 8, 0)
      }
    }

    return run
  }
}

/** For screenshots of the sprites (not used by the game). */
export const _art = () => ({ art: art(), sprites: { GEM, KEY, CHEST, CHEST_OPEN, LEVER_OFF, LEVER_ON, CRATE, PLATE_UP, PLATE_DOWN, BARS, BARREL, PILLAR, SHELF, URN, DOOR, DOOR_OPEN, TORCH0: TORCH[0] }, bakeRoom: (i) => bakeRoom(ROOMS[i], i * 17 + 3) })
