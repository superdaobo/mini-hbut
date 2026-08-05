import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveWindowsMsvcEnvironment } from './tauri_cli_bootstrap.mjs'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npmCli = process.env.npm_execpath

function formatCommand(command, args) {
  return [command, ...args].map((part) => (String(part).includes(' ') ? JSON.stringify(part) : part)).join(' ')
}

export function runCommand({ label, command, args = [], cwd = repoRoot, timeoutMs = 20 * 60 * 1000, env = {} }) {
  console.log(`\n[check] ${label}`)
  console.log(`[check] ${formatCommand(command, args)}`)
  const baseEnv = { ...process.env, ...env }
  const executable = path.basename(String(command)).toLowerCase()
  const commandEnv = process.platform === 'win32' && (executable === 'cargo' || executable === 'cargo.exe')
    ? resolveWindowsMsvcEnvironment({ baseEnv }).env
    : baseEnv
  const result = spawnSync(command, args, {
    cwd,
    env: commandEnv,
    stdio: 'inherit',
    shell: false,
    timeout: timeoutMs
  })
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      throw new Error(`${label} timed out after ${timeoutMs}ms`)
    }
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status ?? 'signal'}`)
  }
}

export function runNode(label, relativeScript, options = {}) {
  runCommand({
    label,
    command: process.execPath,
    args: [path.join(repoRoot, relativeScript)],
    ...options
  })
}

export function runNpm(label, args, options = {}) {
  if (!npmCli) throw new Error('npm_execpath is required; run checks through npm run')
  runCommand({
    label,
    command: process.execPath,
    args: [npmCli, ...args],
    ...options
  })
}

export function rustChecksEnabled() {
  const skip = process.env.CHECK_SKIP_RUST === '1'
  if (skip && process.env.CI) {
    throw new Error('CHECK_SKIP_RUST is forbidden in CI')
  }
  if (skip) console.warn('[check] Rust checks skipped by explicit local CHECK_SKIP_RUST=1')
  return !skip
}

export function runCheckPlan(steps) {
  const startedAt = Date.now()
  for (const step of steps) step()
  console.log(`\n[check] completed ${steps.length} steps in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
}
