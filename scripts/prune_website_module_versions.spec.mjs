import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pruneModuleDir } from './prune_website_module_versions.mjs'

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

const touchDir = (dirPath, mtimeMs) => {
  fs.mkdirSync(dirPath, { recursive: true })
  fs.writeFileSync(path.join(dirPath, 'marker.txt'), 'ok')
  const when = new Date(mtimeMs)
  fs.utimesSync(dirPath, when, when)
}

test('keeps manifest-pointed version even when older name sorts lower', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'modules-prune-'))
  const moduleDir = path.join(root, 'hbut_2048')
  // 模拟事故：manifest 指向 1.4.3-beta.308，另有 2026 时间戳目录
  const beta = path.join(moduleDir, '1.4.3-beta.308')
  const stamp = path.join(moduleDir, '20260715181525-bbf6f6e')
  touchDir(beta, Date.now())
  touchDir(stamp, Date.now() - 60_000)
  fs.writeFileSync(path.join(beta, 'bundle.zip'), 'zip-beta')
  fs.writeFileSync(path.join(stamp, 'bundle.zip'), 'zip-stamp')
  writeJson(path.join(moduleDir, 'manifest.json'), {
    version: '1.4.3-beta.308',
    package_url: 'https://example.com/1.4.3-beta.308/bundle.zip'
  })

  const removed = pruneModuleDir(moduleDir, { keepVersions: 1 })
  assert.equal(removed, 1)
  assert.ok(fs.existsSync(path.join(beta, 'bundle.zip')), 'must keep manifest version dir')
  assert.equal(fs.existsSync(stamp), false, 'older non-manifest version should be pruned')
})

test('without manifest keeps newest mtime version', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'modules-prune-'))
  const moduleDir = path.join(root, 'demo')
  const older = path.join(moduleDir, 'a-old')
  const newer = path.join(moduleDir, 'b-new')
  touchDir(older, Date.now() - 120_000)
  touchDir(newer, Date.now())
  const removed = pruneModuleDir(moduleDir, { keepVersions: 1 })
  assert.equal(removed, 1)
  assert.ok(fs.existsSync(newer))
  assert.equal(fs.existsSync(older), false)
})
