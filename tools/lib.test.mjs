import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inside, listGames, readManifest, validateManifest } from './lib.mjs'

test('the sample game is valid', () => {
  assert.ok(listGames().includes('star-courier'))
  const { errors } = validateManifest('star-courier', readManifest('star-courier'))
  assert.deepEqual(errors, [])
})

test('reports a mismatched id, a missing description and schema problems', () => {
  const manifest = { ...readManifest('star-courier'), id: 'other', description: 'short', players: 4, surprise: true }
  const { errors } = validateManifest('star-courier', manifest)
  assert.ok(errors.some((e) => e.includes('"id" must match the folder name')))
  assert.ok(errors.some((e) => e.includes('add a "description"')))
  assert.ok(errors.some((e) => e.includes('players must be string')))
  assert.ok(errors.some((e) => e.includes('"surprise"')))
})

test('reports missing art and entry files', () => {
  const manifest = { ...readManifest('star-courier'), entry: { web: 'nope.html' }, art: { cover: 'art/missing.svg' } }
  const { errors, warnings } = validateManifest('star-courier', manifest)
  assert.ok(errors.some((e) => e.includes('entry.web "nope.html" doesn\'t exist')))
  assert.ok(errors.some((e) => e.includes('art.cover "art/missing.svg" doesn\'t exist')))
  assert.ok(warnings.some((w) => w.includes('no art.hero')))
})

test('inside() blocks paths that escape the folder', () => {
  assert.equal(inside('/g/a', 'index.html'), '/g/a/index.html')
  assert.equal(inside('/g/a', '../b'), null)
  assert.equal(inside('/g/a', '/etc/passwd'), null)
})
