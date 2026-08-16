import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const MARKER = 'mini-hbut Tauri bootstrap'

export const buildWindowsTauriShim = () =>
  [
    '@ECHO off',
    `REM ${MARKER}`,
    'SETLOCAL',
    'IF EXIST "%~dp0\\node.exe" (',
    '  "%~dp0\\node.exe" "%~dp0\\..\\..\\scripts\\tauri_cli_bootstrap.mjs" %*',
    ') ELSE (',
    '  node "%~dp0\\..\\..\\scripts\\tauri_cli_bootstrap.mjs" %*',
    ')',
    'EXIT /B %ERRORLEVEL%',
    ''
  ].join('\r\n')

export const patchWindowsTauriShim = (filePath, platform = process.platform) => {
  if (platform !== 'win32') return { status: 'skipped', filePath }
  if (!fs.existsSync(filePath)) {
    throw new Error(`未找到 Tauri CLI shim：${filePath}。请先确认 @tauri-apps/cli 已安装。`)
  }

  const expected = buildWindowsTauriShim()
  const current = fs.readFileSync(filePath, 'utf8')
  if (current.includes(MARKER) && current === expected) return { status: 'unchanged', filePath }

  fs.writeFileSync(filePath, expected, 'utf8')
  return { status: 'patched', filePath }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  const filePath = path.join(repoRoot, 'node_modules', '.bin', 'tauri.cmd')
  const result = patchWindowsTauriShim(filePath)
  console.log(`[tauri-cli-shim] ${result.status}: ${result.filePath}`)
}
