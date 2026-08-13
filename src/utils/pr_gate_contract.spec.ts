import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n?/g, '\n')

describe('PR fast gate', () => {
  const workflow = read('.github/workflows/ci.yml')

  it('runs change-scope detection before conditional frontend/rust jobs', () => {
    expect(workflow).toContain('changes:')
    expect(workflow).toContain('dorny/paths-filter@v3')
    expect(workflow).toContain("'src/**'")
    expect(workflow).toContain("'src-tauri/**'")
    expect(workflow).toContain("frontend: ${{ github.event_name == 'pull_request' && steps.filter.outputs.frontend || 'true' }}")
    expect(workflow).toContain("rust: ${{ github.event_name == 'pull_request' && steps.filter.outputs.rust || 'true' }}")
  })

  it('keeps frontend/rust jobs conditional on PR but always active on push', () => {
    expect(workflow).toContain("if: github.event_name != 'pull_request' || needs.changes.outputs.frontend == 'true'")
    expect(workflow).toContain("if: github.event_name != 'pull_request' || needs.changes.outputs.rust == 'true'")
    // changes job 必须始终运行（不能在非 PR 事件 skip），否则 needs 链会把下游
    // job 一并跳过，导致 push main 全量验证静默失效
    expect(workflow).toContain("frontend: ${{ github.event_name == 'pull_request' && steps.filter.outputs.frontend || 'true' }}")
    expect(workflow).toContain("rust: ${{ github.event_name == 'pull_request' && steps.filter.outputs.rust || 'true' }}")
  })

  it('provides a Windows-only cargo check without packaging an installer', () => {
    expect(workflow).toContain('test-rust-windows:')
    expect(workflow).toContain('runs-on: windows-latest')
    expect(workflow).toContain('cargo check --manifest-path src-tauri/Cargo.toml --lib')
    expect(workflow).not.toContain('--bundles nsis')
  })

  it('always reports a stable PR Gate that only accepts success or skipped', () => {
    expect(workflow).toContain('pr-gate:')
    expect(workflow).toContain('if: always()')
    expect(workflow).toContain('success|skipped')
    // 禁止 continue-on-error 把真实失败伪装成成功（#598 非目标）
    expect(workflow).not.toContain('continue-on-error')
  })
})
