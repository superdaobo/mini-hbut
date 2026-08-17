import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { patchWindowsTauriShim } from './patch_tauri_cli_shim.mjs'
import { resolveWindowsMsvcEnvironment } from './tauri_cli_bootstrap.mjs'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-hbut-tauri-bootstrap-'))
try {
  const visualStudioRoot = path.join(root, 'Microsoft Visual Studio', '2022', 'Community')
  const toolsetRoot = path.join(visualStudioRoot, 'VC', 'Tools', 'MSVC', '14.44.35207')
  const msvcBin = path.join(toolsetRoot, 'bin', 'Hostx64', 'x64')
  const windowsKitsRoot = path.join(root, 'Windows Kits', '10')
  const sdkVersion = '10.0.26100.0'
  const sdkBin = path.join(windowsKitsRoot, 'bin', sdkVersion, 'x64')

  for (const directory of [
    msvcBin,
    path.join(toolsetRoot, 'include'),
    path.join(toolsetRoot, 'lib', 'x64'),
    sdkBin,
    path.join(windowsKitsRoot, 'Lib', sdkVersion, 'ucrt', 'x64'),
    path.join(windowsKitsRoot, 'Lib', sdkVersion, 'um', 'x64'),
    path.join(windowsKitsRoot, 'Include', sdkVersion, 'ucrt'),
    path.join(windowsKitsRoot, 'Include', sdkVersion, 'shared'),
    path.join(windowsKitsRoot, 'Include', sdkVersion, 'um')
  ]) {
    fs.mkdirSync(directory, { recursive: true })
  }

  for (const filePath of [
    path.join(msvcBin, 'link.exe'),
    path.join(msvcBin, 'cl.exe'),
    path.join(msvcBin, 'lib.exe'),
    path.join(sdkBin, 'rc.exe'),
    path.join(windowsKitsRoot, 'Lib', sdkVersion, 'ucrt', 'x64', 'ucrt.lib'),
    path.join(windowsKitsRoot, 'Lib', sdkVersion, 'um', 'x64', 'kernel32.lib')
  ]) {
    fs.writeFileSync(filePath, '', 'utf8')
  }

  const resolved = resolveWindowsMsvcEnvironment({
    platform: 'win32',
    baseEnv: { Path: 'C:\\Windows\\System32' },
    visualStudioRoots: [visualStudioRoot],
    windowsKitsRoot
  })

  assert.equal(resolved.configured, true)
  assert.equal(resolved.msvcVersion, '14.44.35207')
  assert.equal(resolved.sdkVersion, sdkVersion)
  assert.match(resolved.env.Path, /Hostx64/)
  assert.match(resolved.env.LIB, /ucrt/)
  assert.equal(fs.existsSync(resolved.linkPath), true)

  const shimPath = path.join(root, 'tauri.cmd')
  fs.writeFileSync(shimPath, '@ECHO off\r\nnode old-tauri.js %*\r\n', 'utf8')
  assert.equal(patchWindowsTauriShim(shimPath, 'win32').status, 'patched')
  assert.match(fs.readFileSync(shimPath, 'utf8'), /tauri_cli_bootstrap\.mjs/)
  assert.equal(patchWindowsTauriShim(shimPath, 'win32').status, 'unchanged')

  console.log('Tauri CLI bootstrap contract passed')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
