import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  normalizeAppVersion,
  stampCargoToml,
  stampPackageJson,
  stampTauriConf,
  stampWorkspaceFiles
} from './stamp_app_version.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function testNormalize() {
  assert.equal(normalizeAppVersion('v1.4.3-beta.1'), '1.4.3-beta.1')
  assert.equal(normalizeAppVersion('1.4.3'), '1.4.3')
  assert.throws(() => normalizeAppVersion(''), /required/)
  assert.throws(() => normalizeAppVersion('not-a-version'), /invalid/)
}

function testStampHelpers() {
  const pkg = stampPackageJson('{"name":"x","version":"1.0.0"}\n', '1.4.3-beta.9')
  assert.match(pkg, /"version": "1\.4\.3-beta\.9"/)

  const conf = stampTauriConf('{"productName":"Mini","version":"1.0.0"}\n', '1.4.3-beta.9')
  assert.match(conf, /"version": "1\.4\.3-beta\.9"/)

  const cargo = stampCargoToml(
    `[package]\nname = "hbut-helper"\nversion = "1.4.3"\nedition = "2021"\n\n[dependencies]\nserde = { version = "1.0" }\n`,
    '1.4.3-beta.9'
  )
  assert.match(cargo, /\[package\][\s\S]*version = "1\.4\.3-beta\.9"/)
  assert.match(cargo, /serde = \{ version = "1\.0" \}/)
  assert.doesNotMatch(
    cargo.replace(/\[package\][\s\S]*?(?=\n\[|$)/, ''),
    /version = "1\.4\.3-beta\.9"/
  )
}

function testWorkspaceStamp() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-app-version-'))
  try {
    fs.mkdirSync(path.join(tmp, 'src-tauri'), { recursive: true })
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'mini-hbut', version: '1.4.3' }, null, 2) + '\n',
      'utf8'
    )
    fs.writeFileSync(
      path.join(tmp, 'src-tauri', 'tauri.conf.json'),
      JSON.stringify({ productName: 'Mini-HBUT', version: '1.4.3' }, null, 2) + '\n',
      'utf8'
    )
    fs.writeFileSync(
      path.join(tmp, 'src-tauri', 'Cargo.toml'),
      `[package]\nname = "hbut-helper"\nversion = "1.4.3"\nedition = "2021"\n\n[dependencies]\nfoo = { version = "2.0" }\n`,
      'utf8'
    )

    const result = stampWorkspaceFiles(tmp, '1.4.3-beta.29143832544')
    assert.equal(result.version, '1.4.3-beta.29143832544')
    assert.deepEqual(result.files, [
      'package.json',
      path.join('src-tauri', 'tauri.conf.json'),
      path.join('src-tauri', 'Cargo.toml')
    ])

    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'))
    const conf = JSON.parse(
      fs.readFileSync(path.join(tmp, 'src-tauri', 'tauri.conf.json'), 'utf8')
    )
    const cargo = fs.readFileSync(path.join(tmp, 'src-tauri', 'Cargo.toml'), 'utf8')
    assert.equal(pkg.version, '1.4.3-beta.29143832544')
    assert.equal(conf.version, '1.4.3-beta.29143832544')
    assert.match(cargo, /^version = "1\.4\.3-beta\.29143832544"$/m)
    assert.match(cargo, /foo = \{ version = "2\.0" \}/)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

function testCliHelpPathExists() {
  const script = path.join(__dirname, 'stamp_app_version.mjs')
  assert.ok(fs.existsSync(script))
  // Ensure module stays importable as ESM from CI.
  assert.ok(pathToFileURL(script).href.startsWith('file:'))
}

testNormalize()
testStampHelpers()
testWorkspaceStamp()
testCliHelpPathExists()
console.log('stamp_app_version.spec.mjs: ok')
