import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { evaluateGodFileGuard, scanGodFileViolations } from './lib/god_file_guard.mjs'

const makeRepo = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-hbut-god-files-'))
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src-tauri', 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs', 'architecture', 'god-file-removal'), { recursive: true })
  return root
}

const writeLines = (filePath, count, line = 'const value = 1') => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, Array.from({ length: count }, () => line).join('\n'))
}

test('detects an unregistered oversized Vue file', () => {
  const root = makeRepo()
  try {
    writeLines(path.join(root, 'src', 'FeatureView.vue'), 1501, '<div />')
    const result = evaluateGodFileGuard({
      repoRoot: root,
      debtPath: path.join(root, 'docs', 'architecture', 'god-file-removal', 'god_file_debt.json'),
    })
    assert.equal(result.ok, false)
    assert.match(result.errors.join('\n'), /FeatureView\.vue/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('accepts registered migration debt but strict mode rejects it', () => {
  const root = makeRepo()
  try {
    writeLines(path.join(root, 'src', 'FeatureView.vue'), 1501, '<div />')
    const debtPath = path.join(root, 'docs', 'architecture', 'god-file-removal', 'god_file_debt.json')
    fs.writeFileSync(debtPath, JSON.stringify([{
      key: 'size:src/FeatureView.vue',
      issue: '#999',
      owner: 'test-agent',
      deadline: '2099-12-31',
    }]))
    assert.equal(evaluateGodFileGuard({ repoRoot: root, debtPath }).ok, true)
    assert.equal(evaluateGodFileGuard({ repoRoot: root, debtPath, strict: true }).ok, false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('detects runtime bridges and production imports', () => {
  const root = makeRepo()
  try {
    writeLines(path.join(root, 'src', 'legacy.runtime.js'), 1)
    writeLines(path.join(root, 'src', 'facade.ts'), 1, "import * as legacy from './legacy.runtime.js'")
    const keys = scanGodFileViolations(root).violations.map((item) => item.key)
    assert(keys.includes('runtime-file:src/legacy.runtime.js'))
    assert(keys.includes('runtime-import:src/facade.ts'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('rejects stale debt after a violation has been fixed', () => {
  const root = makeRepo()
  try {
    writeLines(path.join(root, 'src', 'FeatureView.vue'), 20, '<div />')
    const debtPath = path.join(root, 'docs', 'architecture', 'god-file-removal', 'god_file_debt.json')
    fs.writeFileSync(debtPath, JSON.stringify([{
      key: 'size:src/FeatureView.vue',
      issue: '#999',
      owner: 'test-agent',
      deadline: '2099-12-31',
    }]))
    const result = evaluateGodFileGuard({ repoRoot: root, debtPath })
    assert.equal(result.ok, false)
    assert.match(result.errors.join('\n'), /必须删除/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
