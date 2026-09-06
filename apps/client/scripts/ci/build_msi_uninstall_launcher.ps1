# CI 脚本：构建 MSI 卸载启动器（uninstall.exe）并复制到 WiX 打包工作目录。
#
# 背景（#798）：MSI 卸载走 msiexec，安装目录本身没有 uninstall.exe。
# main.wxs 中的 CMP_UninstallLauncher 组件期望在 candle 工作目录
# （src-tauri/target/release/wix/<arch>/）下存在 uninstall.exe；
# Tauri bundler 不会自动编译该 crate，因此必须在执行 `tauri build`（bundles msi）
# 之前调用本脚本完成预编译与复制。
#
# 用法：
#   pwsh ./scripts/ci/build_msi_uninstall_launcher.ps1 [-WixOutputDir <dir>]
#
# 参数：
#   -WixOutputDir  uninstall.exe 的目标目录（默认：src-tauri/target/release/wix/x64）
#
# 产物：
#   <WixOutputDir>/uninstall.exe（由 msi-uninstall-launcher crate 编译而来，
#   内嵌 requireAdministrator UAC manifest，约 0.2MB）

param(
    [string]$WixOutputDir = ""
)

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

# 2) 定位 WiX 打包工作目录（bundler 执行 candle 的目录）
if ([string]::IsNullOrEmpty($WixOutputDir)) {
    $WixOutputDir = Join-Path $clientDir "src-tauri/target/release/wix/x64"
}
if (-not (Test-Path $WixOutputDir)) {
    New-Item -ItemType Directory -Path $WixOutputDir -Force | Out-Null
}

# 3) 复制并改名为 uninstall.exe（main.wxs 中 File/@Source="uninstall.exe"）
$destExe = Join-Path $WixOutputDir "uninstall.exe"
Copy-Item -Path $builtExe -Destination $destExe -Force
Write-Host "==> 已复制 uninstall.exe -> $destExe"

# 4) 自检：确认 requireAdministrator manifest 已嵌入（防止链接参数静默失效）
$bytes = [System.IO.File]::ReadAllBytes($destExe)
$text = [System.Text.Encoding]::ASCII.GetString($bytes)
if ($text -notmatch 'requireAdministrator') {
    throw "uninstall.exe 缺少 requireAdministrator manifest，UAC 提权契约被破坏"
}
Write-Host "==> UAC manifest(requireAdministrator) 校验通过"

Write-Host "==> MSI 卸载启动器构建完成"
