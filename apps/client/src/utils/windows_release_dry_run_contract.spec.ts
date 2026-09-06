import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n?/g, '\n')
const frozenVersion = read('../../scripts/verify_release_config.mjs').match(/const expected = '([^']+)'/)?.[1]

describe('Windows release dry run', () => {
  it('builds a release-profile NSIS artifact with read-only repository permissions', () => {
    const workflow = read('../../.github/workflows/windows-release-dry-run.yml')
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('pull_request:')
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('persist-credentials: false')
    expect(workflow).toContain('MINI_HBUT_BUILD_PROFILE: release')
    expect(workflow).toContain('npm run tauri build -- --bundles nsis')
    expect(workflow).toContain('./scripts/ci/windows_release_smoke.ps1')
    expect(workflow).toContain('actions/upload-artifact@v4')
    expect(workflow).toContain('if: always()')
    expect(workflow).toContain('retention-days: 7')
    expect(workflow).toContain('git diff --exit-code')
  })

  it('cannot publish, tag, or stamp a release', () => {
    const workflow = read('../../.github/workflows/windows-release-dry-run.yml')
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
    expect(smoke).toContain('--remote-debugging-port=$resolvedCdpPort')
    expect(smoke).toContain('HKLM:\\Software\\Policies\\Microsoft\\Edge\\WebView2\\AdditionalBrowserArguments')
    expect(smoke).toContain('Set-TemporaryRegistryStringValue')
    expect(smoke).toContain('.PSObject.Properties | ForEach-Object { $_.Name }')
    expect(smoke).toContain("[string]$tauriConfig.identifier, '*'")
    expect(smoke).toContain('Restore-TemporaryRegistryStringValue')
    expect(smoke).toContain('cdp_registry_policy_override = $registryPolicyApplied')
    expect(smoke).toContain('host_is_elevated = $hostIsElevated')
    expect(smoke).toContain('scripts/ci/assert_webview_app_mounted.mjs')
    expect(smoke).toContain('windows-webview-mount-evidence.json')
    expect(smoke).toContain("webview_status = [string]$webviewEvidence.status")
    expect(smoke).toContain('webview_root_children = [int]$webviewEvidence.snapshot.rootChildren')
    expect(smoke).toContain('webview_strict_csp_eval_failures = [int]$webviewEvidence.strict_csp_eval_failures')
    expect(smoke).toContain('webview_csp_violations = [int]$webviewEvidence.csp_violations')
    expect(smoke).toContain('bridge_enabled_by_test = $true')
    expect(smoke).toContain('$env:HBUT_HTTP_BRIDGE_ENABLED = $previousBridgeEnabled')
    expect(smoke).toContain('$env:HBUT_HTTP_BRIDGE_PORT = $previousBridgePort')
    expect(smoke).toContain('$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousWebViewArguments')
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

describe('Windows installer regression (#797)', () => {
  it('builds NSIS and MSI bundles and wires the installer regression into the dry-run workflow', () => {
    const workflow = read('../../.github/workflows/windows-release-dry-run.yml')
    expect(workflow).toContain('npm run tauri build -- --bundles nsis,msi')
    expect(workflow).toContain('windows_installer_regression.ps1')
    expect(workflow).toContain('build_msi_uninstall_launcher.ps1')
    expect(workflow).toContain('timeout-minutes: 100')
  })

  it('keeps the dry-run read-only: no release publishing, tagging, or write permissions', () => {
    const workflow = read('../../.github/workflows/windows-release-dry-run.yml')
    expect(workflow).not.toContain('contents: write')
    expect(workflow).not.toMatch(/softprops\/action-gh-release|gh\s+release\s+create|git\s+tag|npm\s+version|tauri-action/i)
  })

  it('triggers the dry run when installer templates or regression scripts change', () => {
    const workflow = read('../../.github/workflows/windows-release-dry-run.yml')
    expect(workflow).toContain('apps/client/src-tauri/nsis/**')
    expect(workflow).toContain('apps/client/src-tauri/wix/**')
  })

  it('regression script covers NSIS upgrade chain, silent uninstall, MSI lifecycle, and non-publish guarantees', () => {
    const regression = read('scripts/ci/windows_installer_regression.ps1')
    // NSIS 静默安装/卸载参数与升级断言
    expect(regression).toContain("'/S'")
    expect(regression).toContain('DisplayVersion')
    expect(regression).toContain('uninstall.exe')
    expect(regression).toContain('ci-canary')
    // MSI 清洁安装/卸载
    expect(regression).toContain('msiexec')
    expect(regression).toContain("'/qn'")
    expect(regression).toContain('/L*v')
    expect(regression).toContain('ProductLanguage')
    // 非发布保证（对齐 smoke 证据风格）
    expect(regression).toContain('release_created = $false')
    expect(regression).toContain('tag_created = $false')
    expect(regression).toContain("artifact_scope = 'ci-only'")
    // 无法无人值守验证的 UI 分支必须显式标记人工验证
    expect(regression).toContain('human_verification_required')
  })

  it('regression script asserts Simplified Chinese installer evidence from the rendered NSIS artifacts', () => {
    const regression = read('scripts/ci/windows_installer_regression.ps1')
    expect(regression).toContain('SimpChinese')
    expect(regression).toContain('!insertmacro MUI_LANGUAGE "SimpChinese"')
    expect(regression).toContain('zh-CN')
  })
})
