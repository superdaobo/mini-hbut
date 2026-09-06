# CI 脚本：构建 MSI 卸载启动器（uninstall.exe）并放到 tauri build 可稳定读取的位置。
#
# 背景（#798）：MSI 卸载走 msiexec，安装目录本身没有 uninstall.exe。
# 关键约束（实测发现）：Tauri bundler 在每次 MSI 打包开始时会 **清空重建**
# wix 工作目录（src-tauri/target/release/wix/<arch>/），任何提前放进去的
# uninstall.exe 都会在 candle/light 执行前被删掉。因此本脚本把 uninstall.exe
# 放到 **target/release/ 根目录**（bundler 从不清理该目录），
# main.wxs 中 CMP_UninstallLauncher 以相对路径 ..\..\uninstall.exe 引用
# （wix/x64/ 相对 target/release/ 正好是 ..\..\）。
#
# 用法（必须在 `tauri build --bundles msi` 之前执行）：
#   pwsh ./scripts/ci/build_msi_uninstall_launcher.ps1
#
# 产物：
#   src-tauri/target/release/uninstall.exe（由 msi-uninstall-launcher crate
#   编译而来，内嵌 requireAdministrator UAC manifest，约 0.2MB）

param()

$ErrorActionPreference = "Stop"

# 路径基准：本脚本位于 apps/client/scripts/ci/ 下
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$clientDir = Resolve-Path (Join-Path $scriptDir "../..")
$crateDir = Join-Path $clientDir "src-tauri/wix/msi-uninstall-launcher"

if (-not (Test-Path (Join-Path $crateDir "Cargo.toml"))) {
    throw "未找到卸载启动器 crate：$crateDir"
}

# 1) 独立编译该 crate（--manifest-path 不依赖当前目录；crate 自带 [workspace] 声明，独立于主 workspace）
Write-Host "==> cargo build --release (msi-uninstall-launcher)"
cargo build --release --manifest-path (Join-Path $crateDir "Cargo.toml")
if ($LASTEXITCODE -ne 0) {
    throw "cargo build --release 失败（exit=$LASTEXITCODE）"
}

$builtExe = Join-Path $crateDir "target/release/msi-uninstall-launcher.exe"
if (-not (Test-Path $builtExe)) {
    throw "编译产物不存在：$builtExe"
}

# 2) 放置到 target/release/ 根目录（bundler 清理 wix/x64 时不会波及）
$releaseRoot = Join-Path $clientDir "src-tauri/target/release"
if (-not (Test-Path $releaseRoot)) {
    # tauri build 尚未跑过时该目录可能不存在，提前创建
    New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
}
$destExe = Join-Path $releaseRoot "uninstall.exe"
Copy-Item -Path $builtExe -Destination $destExe -Force
Write-Host "==> 已复制 uninstall.exe -> $destExe"

# 3) 自检：确认 requireAdministrator manifest 已嵌入（防止链接参数静默失效）
$bytes = [System.IO.File]::ReadAllBytes($destExe)
$text = [System.Text.Encoding]::ASCII.GetString($bytes)
if ($text -notmatch 'requireAdministrator') {
    throw "uninstall.exe 缺少 requireAdministrator manifest，UAC 提权契约被破坏"
}
Write-Host "==> UAC manifest(requireAdministrator) 校验通过"

Write-Host "==> MSI 卸载启动器构建完成"
