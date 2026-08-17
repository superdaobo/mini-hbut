import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { patchCapacitorTarTemplate } from './patch_capacitor_tar_compat.mjs'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-hbut-cap-tar-'))
try {
  const fixture = path.join(root, 'template.js')
  fs.writeFileSync(
    fixture,
    'async function extractTemplate(src, dir) {\n    await tar_1.default.extract({ file: src, cwd: dir });\n}\n',
    'utf8'
  )
  assert.equal(patchCapacitorTarTemplate(fixture).status, 'patched')
  assert.match(fs.readFileSync(fixture, 'utf8'), /\(tar_1\.default \?\? tar_1\)\.extract/)
  assert.equal(patchCapacitorTarTemplate(fixture).status, 'unchanged')

  const unexpected = path.join(root, 'unexpected.js')
  fs.writeFileSync(unexpected, 'export const untouched = true\n', 'utf8')
  assert.throws(() => patchCapacitorTarTemplate(unexpected), /拒绝修改未知源码/)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('Capacitor tar compatibility contract passed')
