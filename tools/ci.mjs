// Runs in GitHub Actions: builds games that changed and publishes them to the rolling
// release the PushPlay launcher watches. Uses the `gh` CLI with the workflow's token.
//
// The release holds one index (INDEX_ASSET) plus, per game: <id>-web.zip, <id>-cover.png,
// <id>-hero.png and <id>-screenshot.png. A failed build keeps the game's last good build
// and records the error, so the Deck can say "build failed" instead of losing the game.
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GAMES_DIR, INDEX_ASSET, RELEASE_TAG } from './config.mjs'
import { listGames, log, ROOT, workRoot } from './lib.mjs'
import { buildGame, launchBrowser } from './pipeline.mjs'

const env = process.env
const repo = env.GITHUB_REPOSITORY
const sha = env.GITHUB_SHA
const branch = env.GITHUB_REF_NAME
const defaultBranch = env.DEFAULT_BRANCH || 'main'
const runUrl = `${env.GITHUB_SERVER_URL}/${repo}/actions/runs/${env.GITHUB_RUN_ID}`
const buildNumber = Number(env.GITHUB_RUN_NUMBER)

const gh = (...args) => execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()

// --- Current index from the release (created on first run) ---
const scratch = join(workRoot, 'release')
mkdirSync(scratch, { recursive: true })
let index = { version: 1, repo, updatedAt: null, games: {} }
if (spawnSync('gh', ['release', 'view', RELEASE_TAG], { cwd: ROOT }).status !== 0) {
  gh('release', 'create', RELEASE_TAG, '--prerelease', '--target', sha, '--title', 'Game builds', '--notes',
    'Rolling builds for the PushPlay launcher. Updated automatically on every push; not a versioned release.')
  log(`Created release ${RELEASE_TAG}`)
} else if (spawnSync('gh', ['release', 'download', RELEASE_TAG, '--pattern', INDEX_ASSET, '--dir', scratch, '--clobber'], { cwd: ROOT }).status === 0) {
  index = JSON.parse(readFileSync(join(scratch, INDEX_ASSET), 'utf8'))
}

// --- Which games to build ---
const games = listGames()
const toolsOrDepsChanged = (files) => files.some((f) => f.startsWith('tools/') || f === 'package.json' || f === 'package-lock.json')
function changedFiles() {
  const before = env.BEFORE_SHA
  try {
    if (before && !/^0+$/.test(before)) return git('diff', '--name-only', before, sha).split('\n')
    // New branch: compare with where it left the default branch.
    const base = git('merge-base', `origin/${defaultBranch}`, sha)
    return git('diff', '--name-only', base, sha).split('\n')
  } catch {
    return null // unknown history → build everything
  }
}
const changed = changedFiles()
const buildAll = env.BUILD_ALL === 'true' || changed === null || toolsOrDepsChanged(changed)
const targets = games.filter(
  (id) => buildAll || !index.games[id] || changed.some((f) => f.startsWith(`${GAMES_DIR}/${id}/`))
)
log(`Branch ${branch} @ ${sha.slice(0, 7)} · build #${buildNumber}`)
log(targets.length ? `Building: ${targets.join(', ')}` : 'No game changes to build.')

// --- Build and upload ---
const results = []
if (targets.length) {
  const browser = await launchBrowser()
  for (const id of targets) {
    log(`\n▶ ${id}`)
    try {
      const built = await buildGame(id, browser)
      for (const w of built.warnings) log(`  ⚠ ${w}`)
      gh('release', 'upload', RELEASE_TAG, '--clobber', ...Object.values(built.files).map((f) => f.path))
      const m = built.manifest
      index.games[id] = {
        id,
        name: m.name,
        description: m.description,
        version: m.version ?? null,
        players: m.players ?? null,
        controls: m.controls ?? null,
        online: m.online ?? false,
        platform: 'web',
        build: buildNumber,
        commit: sha,
        branch,
        builtAt: new Date().toISOString(),
        assets: Object.fromEntries(Object.entries(built.files).map(([k, f]) => [k, { name: f.name, size: f.size, sha256: f.sha256 }])),
        error: null
      }
      results.push({ id, ok: true, warnings: built.warnings })
      log(`  ✓ published`)
    } catch (err) {
      const message = String(err.message)
      log(`  ✗ ${message.replaceAll('\n', '\n  ✗ ')}`)
      // Keep the last good build playable; just flag the failure.
      index.games[id] = {
        ...(index.games[id] ?? { id, name: id, assets: null }),
        error: { message, commit: sha, branch, at: new Date().toISOString(), logUrl: runUrl }
      }
      results.push({ id, ok: false, message })
    }
  }
  await browser.close()
}

// Games deleted on the default branch disappear from the launcher.
if (branch === defaultBranch) {
  for (const id of Object.keys(index.games)) if (!games.includes(id)) delete index.games[id]
}

index.updatedAt = new Date().toISOString()
const indexPath = join(scratch, INDEX_ASSET)
writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n')
gh('release', 'upload', RELEASE_TAG, '--clobber', indexPath)

// --- Summary on the workflow run page ---
if (env.GITHUB_STEP_SUMMARY && existsSync(env.GITHUB_STEP_SUMMARY)) {
  const rows = results.map((r) =>
    r.ok ? `| ${r.id} | ✅ published | ${r.warnings.length ? r.warnings.join('<br>') : ''} |` : `| ${r.id} | ❌ failed | ${r.message.replaceAll('\n', '<br>')} |`
  )
  appendFileSync(
    env.GITHUB_STEP_SUMMARY,
    `## Game builds (#${buildNumber}, ${branch})\n\n` +
      (rows.length ? `| Game | Result | Notes |\n|---|---|---|\n${rows.join('\n')}\n` : 'No game changes in this push.\n')
  )
}

const failed = results.filter((r) => !r.ok)
process.exit(failed.length ? 1 : 0)
