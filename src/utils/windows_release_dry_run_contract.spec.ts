import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n?/g, '\n')
const frozenVersion = read('scripts/verify_release_config.mjs').match(/const expected = '([^']+)'/)?.[1]

describe('Windows release dry run', () => {
  it('builds a release-profile NSIS artifact with read-only repository permissions', () => {
    const workflow = read('.github/workflows/windows-release-dry-run.yml')
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('pull_request:')
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('persist-credentials: false')
    expect(workflow).toContain('MINI_HBUT_BUILD_PROFILE: release')
    expect(workflow).toContain('npm run tauri build -- --bundles nsis')
    expect(workflow).toContain('./scripts/ci/windows_release_smoke.ps1')
    expect(workflow).toContain('actions/upload-artifact@v4')
    expect(workflow).toContain('retention-days: 7')
    expect(workflow).toContain('git diff --exit-code')
  })

  it('cannot publish, tag, or stamp a release', () => {
    const workflow = read('.github/workflows/windows-release-dry-run.yml')
    expect(workflow).not.toContain('contents: write')
    expect(workflow).not.toMatch(/softprops\/action-gh-release|gh\s+release|git\s+tag|npm\s+version|stamp_app_version|tauri-action/i)
  })

  it('launches the raw release executable and records reproducible smoke evidence', () => {
    const smoke = read('scripts/ci/windows_release_smoke.ps1')
    expect(smoke).toContain("'hbut-helper.exe'")
    expect(smoke).toContain('Get-FreeLoopbackPort')
    expect(smoke).toContain('http://127.0.0.1:$resolvedBridgePort/health')
    expect(smoke).toContain("$env:HBUT_HTTP_BRIDGE_ENABLED = '1'")
    expect(smoke).toContain('$env:HBUT_HTTP_BRIDGE_PORT = [string]$resolvedBridgePort')
    expect(smoke).toContain('bridge_enabled_by_test = $true')
    expect(smoke).toContain('$env:HBUT_HTTP_BRIDGE_ENABLED = $previousBridgeEnabled')
    expect(smoke).toContain('$env:HBUT_HTTP_BRIDGE_PORT = $previousBridgePort')
    expect(smoke).toContain('Start-Process')
    expect(smoke).toContain('Get-FileHash')
    expect(smoke).toContain('-Algorithm SHA256')
    expect(smoke).toContain('windows-release-dry-run-evidence.json')
    expect(smoke).toContain('release_created = $false')
    expect(smoke).toContain('tag_created = $false')
    expect(smoke).toContain('version_mutated = $false')
    expect(smoke).toContain("artifact_scope = 'ci-only'")
    expect(smoke).toContain('taskkill.exe')
    expect(smoke).toContain('/PID $process.Id')
    expect(smoke).not.toContain("Get-Process -Name 'hbut-helper'")
  })

  it('keeps all release version sources synchronized with the tracked frozen version', () => {
    const packageJson = JSON.parse(read('package.json'))
    const tauriConfig = JSON.parse(read('src-tauri/tauri.conf.json'))
    const cargoToml = read('src-tauri/Cargo.toml')
    expect(frozenVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(packageJson.version).toBe(frozenVersion)
    expect(tauriConfig.version).toBe(frozenVersion)
    expect(cargoToml).toContain(`version = "${frozenVersion}"`)
  })
})
