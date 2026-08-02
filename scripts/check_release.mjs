import path from 'node:path'
import { runCheckPlan, runCommand, runNpm, rustChecksEnabled, repoRoot } from './check_runner.mjs'

const websiteDir = path.join(repoRoot, 'website')
const steps = [
  () => runNpm('Full project checks', ['run', 'check:all'])
]

if (rustChecksEnabled()) {
  steps.push(() => runCommand({
    label: 'Rust release check',
    command: 'cargo',
    args: ['check', '--release', '--manifest-path', 'src-tauri/Cargo.toml', '--lib'],
    timeoutMs: 40 * 60 * 1000
  }))
}

steps.push(
  () => runNpm('Website docs IA contract', ['run', 'test:docs-ia'], { cwd: websiteDir }),
  () => runNpm('Website developer docs contract', ['run', 'test:docs-developer-content'], { cwd: websiteDir }),
  () => runNpm('Website user docs contract', ['run', 'test:docs-user-content'], { cwd: websiteDir }),
  () => runNpm('Website production build', ['run', 'build'], { cwd: websiteDir, timeoutMs: 30 * 60 * 1000 }),
  () => runNpm('All npm lockfile audits', ['run', 'audit:dependencies'], { timeoutMs: 30 * 60 * 1000 }),
  () => runNpm('Release configuration verification', ['run', 'check:release-config'])
)

runCheckPlan(steps)
