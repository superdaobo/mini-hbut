import path from 'node:path'
import { runCheckPlan, runCommand, runNode, runNpm, rustChecksEnabled, repoRoot } from './check_runner.mjs'

const steps = [
  () => runNpm('Dependency alignment', ['run', 'check:dependency-alignment']),
  () => runNpm('RustSec acceptance scope', ['run', 'check:rustsec-acceptances']),
  () => runNode('npm CLI path contract', 'scripts/test_npm_cli_path.mjs'),
  () => runNode('Capacitor tar compatibility contract', 'scripts/test_capacitor_tar_compat.mjs'),
  () => runNode('Tauri CLI bootstrap contract', 'scripts/test_tauri_cli_bootstrap.mjs'),
  () => runNode('Post-merge workflow contract', 'scripts/test_post_merge_workflow_contract.mjs'),
  () => runNode('WebView mount smoke contract', 'scripts/ci/test_assert_webview_app_mounted.mjs'),
  () => runNpm('Frontend production build', ['run', 'build']),
  () => runNode('Strict CSP production bundle', 'scripts/check_strict_csp_bundle.mjs'),
  () => runNode('Strict CSP bundle guard contract', 'scripts/test_strict_csp_bundle.mjs'),
  () => runNpm('Frontend test suite', ['run', 'test:ci']),
  () => runNpm('Vue typecheck', ['run', 'typecheck']),
  () => runNode('Frontend safety guard', 'scripts/check-frontend-safety.mjs'),
  () => runNode('Design token guard', 'scripts/check-design-tokens.mjs'),
  () => runNode('Phase 3 architecture guard', 'scripts/check_arch_guards.mjs'),
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
