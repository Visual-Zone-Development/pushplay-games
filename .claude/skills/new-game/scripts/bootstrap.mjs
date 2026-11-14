#!/usr/bin/env node
// Turns the current folder into a PushPlay game repo if it isn't one yet, then makes the game.
//
//   node <skill-dir>/scripts/bootstrap.mjs [--kit <kit.zip>] [--no-install] [<game-id> [new-game flags…]]
//
// With no build kit in the folder (.github/<slug>/), it installs everything a game repo starts
// with from the kit.zip next to this skill: the build kit and workflow, AGENTS.md, CLAUDE.md, the
// skills, tools/, and the npm scripts (added to an existing package.json; nothing the folder
// already has is overwritten). Then, with a game id, it runs the kit's own new-game with the flags
// given (--workshop, --vite, --online, --party, --phone portrait|landscape, --players, --name).
// In a folder that already has the kit it only runs new-game.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = process.cwd()
const args = process.argv.slice(2)
const take = (flag) => {
  const i = args.indexOf(flag)
  if (i < 0) return undefined
  return args.splice(i, 2)[1]
}
const has = (flag) => {
  const i = args.indexOf(flag)
  if (i >= 0) args.splice(i, 1)
  return i >= 0
}
const kitArg = take('--kit')
const noInstall = has('--no-install')
if (has('--help') || has('-h')) {
  console.log('Usage: node bootstrap.mjs [--kit <kit.zip>] [--no-install] [<game-id> [--workshop] [--vite] [--online | --party] [--phone portrait|landscape] [--players 2-4] [--name "Title"]]')
  process.exit(0)
}

const fail = (message) => {
  console.error(`bootstrap: ${message}`)
  process.exit(1)
}
const run = (cmd, cmdArgs, opts = {}) => {
  const result = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32', ...opts })
  if (result.status !== 0) fail(`\`${cmd} ${cmdArgs.join(' ')}\` failed`)
}

/** The kit folder of this repo, if it has one (.github/<slug>/ with a config). */
function installedKit() {
  const github = join(ROOT, '.github')
  for (const slug of ['pushplay']) if (existsSync(join(github, slug, 'config.mjs'))) return join(github, slug)
  return null
}

let kitDir = installedKit()
if (!kitDir) {
  const zip = resolve(kitArg ?? join(HERE, '../kit.zip'))
  if (!existsSync(zip)) {
    fail(`no kit.zip at ${zip}. Download it from https://github.com/Visual-Zone-Development/pushplay-releases/releases/latest and pass --kit <path>.`)
  }
  const scratch = mkdtempSync(join(tmpdir(), 'pushplay-bootstrap-'))
  try {
    const tar = spawnSync('tar', ['-xf', zip, '-C', scratch], { encoding: 'utf8' })
    if (tar.status !== 0) {
      const unzip = spawnSync('unzip', ['-q', zip, '-d', scratch], { encoding: 'utf8' })
      if (unzip.status !== 0) fail(`couldn't extract ${zip}: ${(tar.stderr || unzip.stderr || '').trim()}`)
    }
    if (!existsSync(join(scratch, 'kit/brand.json'))) fail(`${zip} isn't a PushPlay kit.zip`)
    const { slug } = JSON.parse(readFileSync(join(scratch, 'kit/brand.json'), 'utf8'))
    const { kit } = JSON.parse(readFileSync(join(scratch, 'kit.json'), 'utf8'))
    kitDir = join(ROOT, '.github', slug)
    console.log(`Setting up a PushPlay game repo here (build kit v${kit})…`)
    mkdirSync(kitDir, { recursive: true })
    cpSync(join(scratch, 'kit'), kitDir, { recursive: true })
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
  // The kit's own scripts need its dependencies before they can run.
  if (!noInstall || !existsSync(join(kitDir, 'node_modules'))) {
    run('npm', ['ci', '--prefix', kitDir, '--no-audit', '--no-fund'])
  }
  // One code path with later updates: the kit installs the workflow, prompts, skills and repo files.
  run('node', [join(kitDir, 'update-kit.mjs'), zip, '--no-install'], { env: { ...process.env, KIT_REPO_ROOT: ROOT } })
  if (!noInstall) run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'])
  if (!existsSync(join(ROOT, '.git'))) console.log('This folder is not a git repo yet: run `git init` and push it to GitHub so the games build and reach PushPlay.')
  console.log('The headless browser for `npm run check` is installed by `npm run setup`.')
}

if (args.length) run('node', [join(kitDir, 'new-game.mjs'), ...args], { env: { ...process.env, KIT_REPO_ROOT: ROOT } })
else console.log('No game id given: the repo is ready. Make a game with `npm run new-game <id>`.')
