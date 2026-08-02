import path from 'node:path'
import { runCheckPlan, runCommand, runNode, runNpm, rustChecksEnabled, repoRoot } from './check_runner.mjs'

const steps = [
  () => runNpm('Dependency alignment', ['run', 'check:dependency-alignment']),
  () => runNpm('RustSec acceptance scope', ['run', 'check:rustsec-acceptances']),
  () => runNpm('Frontend production build', ['run', 'build']),
  () => runNpm('Frontend test suite', ['run', 'test:ci']),
  () => runNpm('Vue CI typecheck', ['exec', '--', 'vue-tsc', '--noEmit', '-p', 'tsconfig.ci.json']),
  () => runNode('Frontend safety guard', 'scripts/check-frontend-safety.mjs'),
  () => runNode('Design token guard', 'scripts/check-design-tokens.mjs'),
  () => runCommand({
    label: 'Sensitive upload guard (tracked files)',
    command: process.execPath,
    args: [path.join(repoRoot, 'scripts/guard_sensitive_uploads.mjs'), 'pre-commit']
  }),
  () => runNode('Dist boundary guard', 'scripts/check_dist_boundary.mjs')
]

if (rustChecksEnabled()) {
  steps.push(
    () => runCommand({
      label: 'Rust format check',
      command: 'cargo',
      args: ['fmt', '--manifest-path', 'src-tauri/Cargo.toml', '--all', '--', '--check']
    }),
    () => runCommand({
      label: 'Rust library tests',
      command: 'cargo',
      args: ['test', '--manifest-path', 'src-tauri/Cargo.toml', '--lib'],
      timeoutMs: 30 * 60 * 1000
    }),
    () => runCommand({
      label: 'Rust clippy',
      command: 'cargo',
      args: ['clippy', '--manifest-path', 'src-tauri/Cargo.toml', '--lib'],
      timeoutMs: 30 * 60 * 1000
    })
  )
}

runCheckPlan(steps)
