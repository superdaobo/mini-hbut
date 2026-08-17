import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const script = path.resolve('scripts/check_strict_csp_bundle.mjs')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-hbut-csp-bundle-'))
try {
  const good = path.join(root, 'good')
  fs.mkdirSync(good)
  fs.writeFileSync(path.join(good, 'app.js'), 'const value = JSON.parse("{}")\n', 'utf8')
  const goodResult = spawnSync(process.execPath, [script, good], { encoding: 'utf8' })
  assert.equal(goodResult.status, 0, goodResult.stderr)

  const bad = path.join(root, 'bad')
  fs.mkdirSync(bad)
  fs.writeFileSync(path.join(bad, 'app.js'), 'const compile = new Function("return true")\n', 'utf8')
  const badResult = spawnSync(process.execPath, [script, bad], { encoding: 'utf8' })
  assert.notEqual(badResult.status, 0)
  assert.match(badResult.stderr, /dynamic Function constructor/)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('strict CSP bundle guard contract passed')
