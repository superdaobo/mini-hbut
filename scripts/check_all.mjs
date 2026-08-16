import path from 'node:path'
import { runCheckPlan, runCommand, runNode, runNpm, rustChecksEnabled, repoRoot } from './check_runner.mjs'

// 客户端已迁移至 apps/client（#641）：客户端 npm 命令与脚本统一以 apps/client 为 cwd / 路径前缀；
// guard_sensitive_uploads 为根级脚本，仍在仓库根执行。
const clientDir = path.join(repoRoot, 'apps/client')
const steps = [
  () => runNpm('Dependency alignment', ['run', 'check:dependency-alignment'], { cwd: clientDir }),
  () => runNpm('RustSec acceptance scope', ['run', 'check:rustsec-acceptances'], { cwd: clientDir }),
  () => runNode('npm CLI path contract', 'apps/client/scripts/test_npm_cli_path.mjs'),
  () => runNode('Capacitor tar compatibility contract', 'apps/client/scripts/test_capacitor_tar_compat.mjs'),
  () => runNode('Tauri CLI bootstrap contract', 'apps/client/scripts/test_tauri_cli_bootstrap.mjs'),
  () => runNode('Post-merge workflow contract', 'apps/client/scripts/test_post_merge_workflow_contract.mjs'),
  () => runNode('WebView mount smoke contract', 'apps/client/scripts/ci/test_assert_webview_app_mounted.mjs'),
  () => runNpm('Frontend production build', ['run', 'build'], { cwd: clientDir }),
  () => runNode('Strict CSP production bundle', 'apps/client/scripts/check_strict_csp_bundle.mjs'),
  () => runNode('Strict CSP bundle guard contract', 'apps/client/scripts/test_strict_csp_bundle.mjs'),
  () => runNpm('Frontend test suite', ['run', 'test:ci'], { cwd: clientDir }),
  () => runNpm('Vue typecheck', ['run', 'typecheck'], { cwd: clientDir }),
  () => runNode('Frontend safety guard', 'apps/client/scripts/check-frontend-safety.mjs'),
  () => runNode('Design token guard', 'apps/client/scripts/check-design-tokens.mjs'),
  () => runNode('Phase 3 architecture guard', 'apps/client/scripts/check_arch_guards.mjs'),
  () => runCommand({
    label: 'Sensitive upload guard (tracked files)',
    command: process.execPath,
    args: [path.join(repoRoot, 'scripts/guard_sensitive_uploads.mjs'), 'pre-commit']
  }),
  () => runNode('Dist boundary guard', 'apps/client/scripts/check_dist_boundary.mjs')
]

if (rustChecksEnabled()) {
  steps.push(
    () => runCommand({
      label: 'Rust format check',
      command: 'cargo',
      args: ['fmt', '--manifest-path', 'apps/client/src-tauri/Cargo.toml', '--all', '--', '--check']
    }),
    () => runCommand({
      label: 'Rust library tests',
      command: 'cargo',
      args: ['test', '--manifest-path', 'apps/client/src-tauri/Cargo.toml', '--lib'],
      timeoutMs: 30 * 60 * 1000
    }),
    () => runCommand({
      label: 'Rust clippy',
      command: 'cargo',
      args: ['clippy', '--manifest-path', 'apps/client/src-tauri/Cargo.toml', '--lib'],
      timeoutMs: 30 * 60 * 1000
    })
  )
}

runCheckPlan(steps)
