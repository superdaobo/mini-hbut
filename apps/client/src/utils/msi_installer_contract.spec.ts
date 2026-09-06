import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// MSI 安装器契约测试（#799 zh-CN + #798 uninstall.exe 启动器）：
// 锁定 tauri.conf.json 的 WiX zh-CN 配置、main.wxs 模板关键节点、
// 卸载启动器 crate 与 CI 构建脚本的存在性及关键内容，防止回退。

const root = process.cwd()
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n?/g, '\n')

const wixTemplate = read('src-tauri/wix/main.wxs')
const launcherCargoToml = read('src-tauri/wix/msi-uninstall-launcher/Cargo.toml')
const launcherBuildRs = read('src-tauri/wix/msi-uninstall-launcher/build.rs')
const launcherMainRs = read('src-tauri/wix/msi-uninstall-launcher/src/main.rs')
const buildScript = read('scripts/ci/build_msi_uninstall_launcher.ps1')
const releaseWorkflow = read('../../.github/workflows/release.yml')

describe('MSI installer contract (zh-CN + uninstall launcher)', () => {
  it('configures the WiX bundler with zh-CN language and the custom template', () => {
    const tauriConfig = JSON.parse(read('src-tauri/tauri.conf.json'))
    const wix = tauriConfig.bundle?.windows?.wix
    expect(wix?.language).toBe('zh-CN')
    expect(wix?.template).toBe('./wix/main.wxs')
  })

  it('keeps the zh-CN uninstall launcher component in the WiX template', () => {
    // #798：安装目录内卸载启动器组件（uninstall.exe 由 CI 放到 target/release/ 根目录，
    // bundler 会清空 wix/x64 工作目录，故模板用 ..\..\uninstall.exe 相对引用）
    expect(wixTemplate).toContain('CMP_UninstallLauncher')
    expect(wixTemplate).toContain('Source="..\\..\\uninstall.exe"')
    expect(wixTemplate).toContain('<ComponentRef Id="CMP_UninstallLauncher" />')
    // 开始菜单卸载快捷方式已中文化（handlebars 变量原文）
    expect(wixTemplate).toContain('Name="卸载 {{product_name}}"')
    expect(wixTemplate).toContain('Description="卸载 {{product_name}}"')
  })

  it('keeps the MSI in-place upgrade and downgrade-protection contract', () => {
    // 覆盖升级契约：同版本允许覆盖 + REINSTALLMODE=amus
    expect(wixTemplate).toContain('AllowSameVersionUpgrades="yes"')
    expect(wixTemplate).toContain('REINSTALLMODE')
    expect(wixTemplate).toContain('Value="amus"')
    // 降级保护：禁止安装更低版本
    expect(wixTemplate).toContain('!(loc.DowngradeErrorMessage)')
  })

  it('ships a standalone uninstall launcher crate with UAC elevation', () => {
    // crate 必须独立：末尾显式 [workspace] 空表，防止被上层 src-tauri workspace 捕获
    expect(launcherCargoToml.trim().endsWith('[workspace]')).toBe(true)
    // 唯一轻量依赖（注册表读取），不引入 tokio/winapi 等重依赖
    expect(launcherCargoToml).toContain('winreg = "0.55"')
    expect(launcherCargoToml).not.toMatch(/^\s*(tokio|winapi)\s*=/m)
    // release profile 极小化配置
    expect(launcherCargoToml).toContain('panic = "abort"')
    expect(launcherCargoToml).toContain('strip = true')
    // build.rs 通过 /MANIFEST:EMBED + /MANIFESTINPUT 嵌入 requireAdministrator manifest
    expect(launcherBuildRs).toContain('/MANIFEST:EMBED')
    expect(launcherBuildRs).toContain('/MANIFESTINPUT')
    expect(launcherBuildRs).toContain('requireAdministrator')
    // 启动器逻辑：枚举注册表卸载项 → /I 换 /X → msiexec 卸载；失败兜底打开「应用和功能」
    expect(launcherMainRs).toContain('UninstallString')
    expect(launcherMainRs).toContain('msiexec.exe')
    expect(launcherMainRs).toContain('ms-settings:appsfeatures')
  })

  it('provides the CI script that builds and copies uninstall.exe into the WiX working directory', () => {
    expect(buildScript).toContain('cargo build --release')
    expect(buildScript).toContain('uninstall.exe')
    expect(buildScript).toContain('requireAdministrator')
  })

  it('locks the zh-CN MSI artifact naming in the release workflow', () => {
    // #799：release 工作流将 MSI 产物重命名为 zh-CN 后缀（防止回退为无语言后缀命名）
    expect(releaseWorkflow).toContain('zh-CN.msi')
  })
})
