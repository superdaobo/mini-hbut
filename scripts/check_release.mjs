import path from 'node:path'
import { runCheckPlan, runCommand, runNpm, rustChecksEnabled, repoRoot } from './check_runner.mjs'

// 客户端已迁移至 apps/client（#641）：客户端聚合器（check:all / audit:dependencies /
// check:release-config）与 cargo check 均在 apps/client 视角执行。
const clientDir = path.join(repoRoot, 'apps/client')
const websiteDir = path.join(repoRoot, 'website')
const steps = [
  // check:all 通过 apps/client 的 npm script（node ../../scripts/check_all.mjs）执行
  () => runNpm('Full project checks', ['run', 'check:all'], { cwd: clientDir })
]

if (rustChecksEnabled()) {
  steps.push(() => runCommand({
    label: 'Rust release check',
    command: 'cargo',
    args: ['check', '--release', '--manifest-path', 'apps/client/src-tauri/Cargo.toml', '--lib'],
    timeoutMs: 40 * 60 * 1000
  }))
}

steps.push(
  () => runNpm('Website docs IA contract', ['run', 'test:docs-ia'], { cwd: websiteDir }),
  () => runNpm('Website developer docs contract', ['run', 'test:docs-developer-content'], { cwd: websiteDir }),
  () => runNpm('Website user docs contract', ['run', 'test:docs-user-content'], { cwd: websiteDir }),
  () => runNpm('Website production build', ['run', 'build'], { cwd: websiteDir, timeoutMs: 30 * 60 * 1000 }),
  () => runNpm('All npm lockfile audits', ['run', 'audit:dependencies'], { cwd: clientDir, timeoutMs: 30 * 60 * 1000 }),
  () => runNpm('Release configuration verification', ['run', 'check:release-config'], { cwd: clientDir })
)

runCheckPlan(steps)
