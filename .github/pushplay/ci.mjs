// Runs in GitHub Actions: builds the games a push changed and publishes them to the rolling
// release the launcher watches, using the `gh` CLI with the workflow's token.
//
// The release holds one index (INDEX_ASSET) plus, per game: <id>-web.zip, <id>-cover.png,
// <id>-hero.png and <id>-screenshot.png. A failed build keeps the game's last good build
// and records the error, so the Deck can show "build failed" instead of losing the game.
//
// DRY_RUN=1 skips GitHub entirely and writes the index to the work folder (used by tests).
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { INDEX_ASSET, KIT_DIR, KIT_VERSION, RELEASE_TAG } from './config.mjs'
import { layout, listGames, log, ROOT, WORK_DIR } from './repo.mjs'
import { buildGame, launchBrowser } from './pipeline.mjs'

const env = process.env
const dryRun = Boolean(env.DRY_RUN)
const repo = env.GITHUB_REPOSITORY ?? 'local/dry-run'
const sha = env.GITHUB_SHA ?? spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim()
const branch = env.GITHUB_REF_NAME ?? 'local'
const defaultBranch = env.DEFAULT_BRANCH || 'main'
const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${repo}/actions/runs/${env.GITHUB_RUN_ID}` : null
const buildNumber = Number(env.GITHUB_RUN_NUMBER ?? 0)

const gh = (...args) => execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const ghOk = (...args) => spawnSync('gh', args, { cwd: ROOT }).status === 0
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

// --- Current index from the release (created on first run) ---
const scratch = join(WORK_DIR, 'release')
mkdirSync(scratch, { recursive: true })
const indexPath = join(scratch, INDEX_ASSET)
let index = { version: 1, games: {} }
if (dryRun) {
  if (existsSync(indexPath)) index = JSON.parse(readFileSync(indexPath, 'utf8'))
} else if (!ghOk('release', 'view', RELEASE_TAG)) {
  gh('release', 'create', RELEASE_TAG, '--prerelease', '--target', sha, '--title', 'Game builds', '--notes',
    'Rolling game builds, updated automatically on every push. Not a versioned release.')
  log(`Created release ${RELEASE_TAG}`)
} else if (ghOk('release', 'download', RELEASE_TAG, '--pattern', INDEX_ASSET, '--dir', scratch, '--clobber')) {
  index = JSON.parse(readFileSync(indexPath, 'utf8'))
}

// --- Which games to build ---
const games = listGames()
function changedFiles() {
  const before = env.BEFORE_SHA
  try {
    if (before && !/^0+$/.test(before)) return git('diff', '--name-only', before, sha).split('\n').filter(Boolean)
    // New branch: compare with where it left the default branch.
    return git('diff', '--name-only', git('merge-base', `origin/${defaultBranch}`, sha), sha).split('\n').filter(Boolean)
  } catch {
    return null // unknown history → build everything
  }
}
const changed = changedFiles()
const relevant = (file) => !file.endsWith('.md')
const kitChanged = changed?.some((f) => f.startsWith(`${KIT_DIR}/`) || f.startsWith('.github/workflows/') || f === 'package.json' || f === 'package-lock.json')
const buildAll = env.BUILD_ALL === 'true' || changed === null || kitChanged
const targets = games.filter((game) => {
  if (buildAll || !index.games[game.id] || index.games[game.id].error) return true
  return changed.some((f) => relevant(f) && (game.rel ? f.startsWith(`${game.rel}/`) : !f.startsWith('.github/')))
})
log(`${repo} · ${layout()} repo · branch ${branch} @ ${sha.slice(0, 7)} · build #${buildNumber}`)
log(targets.length ? `Building: ${targets.map((g) => g.id).join(', ')}` : 'No game changes to build.')

// --- Build and upload ---
const results = []
if (targets.length) {
  const browser = await launchBrowser()
  for (const game of targets) {
    const { id } = game
    log(`\n▶ ${id}`)
    try {
      const built = await buildGame(game, browser)
      for (const w of built.warnings) log(`  ⚠ ${w}`)
      if (!dryRun) gh('release', 'upload', RELEASE_TAG, '--clobber', ...Object.values(built.files).map((f) => f.path))
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
      log(`  ✓ ${dryRun ? 'built (dry run)' : 'published'}`)
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
  for (const id of Object.keys(index.games)) if (!games.some((g) => g.id === id)) delete index.games[id]
}

index.repo = repo // stays correct if the repo is renamed or transferred
index.layout = layout()
index.kit = KIT_VERSION
index.updatedAt = new Date().toISOString()
writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n')
if (!dryRun) gh('release', 'upload', RELEASE_TAG, '--clobber', indexPath)

// --- Summary on the workflow run page ---
if (env.GITHUB_STEP_SUMMARY && existsSync(env.GITHUB_STEP_SUMMARY)) {
  const rows = results.map((r) =>
    r.ok ? `| ${r.id} | ✅ published | ${r.warnings.join('<br>')} |` : `| ${r.id} | ❌ failed | ${r.message.replaceAll('\n', '<br>')} |`
  )
  appendFileSync(
    env.GITHUB_STEP_SUMMARY,
    `## Game builds (#${buildNumber}, ${branch})\n\n` +
      (rows.length ? `| Game | Result | Notes |\n|---|---|---|\n${rows.join('\n')}\n` : 'No game changes in this push.\n')
  )
}

process.exit(results.some((r) => !r.ok) ? 1 : 0)
