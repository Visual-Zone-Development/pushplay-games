import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import Ajv from 'ajv/dist/2020.js'
import { GAMES_DIR, MANIFEST_FILE, MIN_DESCRIPTION, WORK_DIR } from './config.mjs'

export const ROOT = resolve(import.meta.dirname, '..')
export const gamesRoot = join(ROOT, GAMES_DIR)
export const workRoot = join(ROOT, WORK_DIR)
export const outDir = (id) => join(workRoot, 'out', id)
export const distDir = join(workRoot, 'dist')

const schema = JSON.parse(readFileSync(join(import.meta.dirname, 'manifest.schema.json'), 'utf8'))
const validateSchema = new Ajv({ allErrors: true, strict: false }).compile(schema)

/** Every folder under games/ that has a manifest. */
export function listGames() {
  if (!existsSync(gamesRoot)) return []
  return readdirSync(gamesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(gamesRoot, d.name, MANIFEST_FILE)))
    .map((d) => d.name)
    .sort()
}

export function readManifest(id) {
  const file = join(gamesRoot, id, MANIFEST_FILE)
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    throw new GameError(id, `${GAMES_DIR}/${id}/${MANIFEST_FILE} is not valid JSON: ${err.message}`)
  }
}

export class GameError extends Error {
  constructor(id, message) {
    super(message)
    this.gameId = id
  }
}

/** Path inside root, or null if it escapes. */
export function inside(root, rel) {
  const target = resolve(root, rel)
  const fromRoot = relative(root, target)
  if (fromRoot.startsWith('..' + sep) || fromRoot === '..' || isAbsolute(fromRoot)) return null
  return target
}

/** The build preset: explicit in the manifest, else vite when the game has a package.json. */
export function presetFor(id, manifest) {
  if (manifest.build?.preset) return manifest.build.preset
  return existsSync(join(gamesRoot, id, 'package.json')) ? 'vite' : 'static'
}

/**
 * Validate a game's source manifest. Returns { errors, warnings } as readable sentences
 * aimed at whoever (or whatever AI) is fixing the game.
 */
export function validateManifest(id, manifest) {
  const errors = []
  const warnings = []
  const where = `${GAMES_DIR}/${id}/${MANIFEST_FILE}`

  if (!validateSchema(manifest)) {
    for (const e of validateSchema.errors ?? []) {
      const path = e.instancePath ? e.instancePath.slice(1).replaceAll('/', '.') : '(root)'
      const extra = e.params?.additionalProperty ? ` "${e.params.additionalProperty}"` : ''
      errors.push(`${where}: ${path} ${e.message}${extra}`)
    }
  }
  if (manifest.id !== id) errors.push(`${where}: "id" must match the folder name ("${id}")`)
  if (!manifest.description || manifest.description.trim().length < MIN_DESCRIPTION) {
    errors.push(`${where}: add a "description" of 1–3 sentences (at least ${MIN_DESCRIPTION} characters)`)
  }

  const gameDir = join(gamesRoot, id)
  const preset = presetFor(id, manifest)
  if (preset === 'godot') errors.push(`${where}: Godot builds aren't supported in games repos yet; use a web game`)
  if (preset === 'static') {
    const entry = manifest.entry?.web
    if (!entry) errors.push(`${where}: static games need "entry": { "web": "index.html" }`)
    else if (!inside(gameDir, entry) || !existsSync(join(gameDir, entry))) errors.push(`${where}: entry.web "${entry}" doesn't exist`)
  }
  if (preset === 'vite' && !existsSync(join(gameDir, 'package.json'))) {
    errors.push(`${where}: preset "vite" needs a package.json with a "build" script`)
  }

  for (const kind of ['cover', 'hero']) {
    const rel = manifest.art?.[kind]
    if (!rel) {
      warnings.push(`no art.${kind}: one will be generated from a screenshot, but custom art looks much better (see AGENTS.md)`)
      continue
    }
    if (!/\.(svg|html|png|jpe?g|webp)$/i.test(rel)) errors.push(`${where}: art.${kind} must be .svg, .html, .png, .jpg or .webp`)
    const file = inside(gameDir, rel)
    if (!file || !existsSync(file) || !statSync(file).isFile()) errors.push(`${where}: art.${kind} "${rel}" doesn't exist`)
    else if (/\.(svg|html)$/i.test(rel) && readFileSync(file, 'utf8').includes('PLACEHOLDER ART')) {
      errors.push(`${GAMES_DIR}/${id}/${rel} is still the placeholder. Design real ${kind} art for this game (AGENTS.md → Art)`)
    }
  }
  if (!manifest.controls) warnings.push(`set "controls": "gamepad" once the game works with a controller`)

  return { errors, warnings }
}

export function log(message = '') {
  process.stdout.write(message + '\n')
}

export function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')))
  const positional = argv.filter((a) => !a.startsWith('--'))
  return { flags, positional }
}
