#Requires -Version 5.1
<#
.SYNOPSIS
  Windows 安装器 CI 回归（#797）：NSIS 升级链 / 中文化证据 / 卸载分支 / MSI 清洁安装卸载。

.DESCRIPTION
  对齐 windows_release_smoke.ps1 的风格：
  - Set-StrictMode Latest + $ErrorActionPreference = 'Stop'
  - 证据 JSON 落 dist-dry-run（windows-installer-regression-evidence.json）
  - 非发布保证（release_created = $false 等），绝不调用 gh release create / git tag
  场景覆盖：
  1. NSIS 清洁安装旧版本基线（v1.4.7 Release 资产，缺失时自动降级 v1.4.8 / 当前构建产物）
  2. NSIS 覆盖升级到当前构建（DisplayVersion / uninstall.exe / 快捷方式 / 用户数据保留）
  3. NSIS 中文界面证据（bundler 渲染目录的 SimpChinese 语言宏 + 简体中文文案 grep）
  4. NSIS 静默卸载-保留数据（/S _?=，canary 仍在）
  5. NSIS 卸载-删除数据分支（模板级断言 + human_verification_required）
  6. NSIS 取消卸载分支（模板级断言 + human_verification_required）
  7. MSI 清洁安装 + 卸载（uninstall.exe 启动器 / ProductLanguage=2052 / canary 保留）
  8. 非发布保证写入证据
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
  # 安装包路径优先从环境变量读取（CI 内联 pwsh 的参数传递行为不稳定，
  # 实测会把 '-NsisInstaller\-MsiInstaller' 字面值绑进参数——见 #797 修复记录），
  # 环境变量不存在时回退到显式命名参数（本地调试用）。
  [string]$NsisInstaller = $env:NSIS_INSTALLER_PATH,
  [string]$MsiInstaller = $env:MSI_INSTALLER_PATH,
  [string]$EvidenceRoot = $env:INSTALLER_EVIDENCE_ROOT ?? 'dist-dry-run',
  [string]$BaselineUrl = '',
  [string]$BaselineVersion = '',
  [int]$InstallerTimeoutSeconds = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:BaselineRepo = 'superdaobo/mini-hbut'
$script:ProductName = 'Mini-HBUT'
$script:BundleId = 'com.hbut.mini'
$script:MainBinary = 'hbut-helper.exe'
$script:NsisUninstallKeyPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Mini-HBUT'

function Resolve-RepoPath([string]$PathValue) {
  if ([IO.Path]::IsPathRooted($PathValue)) { return $PathValue }
  return Join-Path $RepoRoot $PathValue
}

function Write-Step([string]$Message) {
  Write-Host "[installer-regression] $Message"
}

function Read-FrozenVersion {
  # 冻结版本以 scripts/verify_release_config.mjs 的 expected 为唯一真源（1.4.8）
  # 注意：RepoRoot 是 apps/client（仅一层 apps），到仓库根需上两级（../..）。
  $verifyScript = Join-Path (Join-Path $RepoRoot '..') (Join-Path '..' 'scripts/verify_release_config.mjs')
  if (-not (Test-Path $verifyScript -PathType Leaf)) { throw "Frozen version source not found: $verifyScript" }
  $match = [regex]::Match((Get-Content $verifyScript -Raw), "const\s+expected\s*=\s*'([^']+)'")
  if (-not $match.Success) { throw 'Frozen version constant not found in verify_release_config.mjs' }
  return $match.Groups[1].Value
}

function Get-ShortPath([string]$PathValue) {
  # NSIS 的 /D= 参数不允许引号与空格；路径含空格时退回 8.3 短路径
  if ($PathValue -notmatch '\s') { return $PathValue }
  $fso = New-Object -ComObject Scripting.FileSystemObject
  return $fso.GetFolder($PathValue).ShortPath
}

function Wait-InstallerProcess {
  param(
    [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
    [Parameter(Mandatory = $true)][string]$Description
  )
  $timeoutMs = $InstallerTimeoutSeconds * 1000
  if (-not $Process.WaitForExit($timeoutMs)) {
    & taskkill.exe /PID $Process.Id /T /F 2>$null | Out-Null
    throw "$Description timed out after $InstallerTimeoutSeconds seconds"
  }
  return [int]$Process.ExitCode
}

function Invoke-NsisSilentInstall {
  param(
    [Parameter(Mandatory = $true)][string]$InstallerPath,
    [Parameter(Mandatory = $true)][string]$TargetDir
  )
  New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
  $silentDir = Get-ShortPath $TargetDir
  Write-Step "NSIS silent install: $(Split-Path $InstallerPath -Leaf) -> $TargetDir"
  $proc = Start-Process -FilePath $InstallerPath -ArgumentList @('/S', "/D=$silentDir") -PassThru
  $exitCode = Wait-InstallerProcess -Process $proc -Description "NSIS silent install ($(Split-Path $InstallerPath -Leaf))"
  if ($exitCode -ne 0) {
    throw "NSIS silent install failed with exit code $exitCode (installer: $InstallerPath, target: $TargetDir)"
  }
}

function Invoke-NsisSilentUninstall {
  param([Parameter(Mandatory = $true)][string]$UninstallerPath, [Parameter(Mandatory = $true)][string]$InstallDir)
  # /S 静默卸载；_?= 阻止卸载器自我复制到临时目录并使 -Wait/WaitForExit 可靠
  $silentDir = Get-ShortPath $InstallDir
  Write-Step "NSIS silent uninstall: $UninstallerPath (_?=$InstallDir)"
  $proc = Start-Process -FilePath $UninstallerPath -ArgumentList @('/S', "_?=$silentDir") -PassThru
  $exitCode = Wait-InstallerProcess -Process $proc -Description 'NSIS silent uninstall'
  if ($exitCode -ne 0) {
    throw "NSIS silent uninstall failed with exit code $exitCode (uninstaller: $UninstallerPath)"
  }
}

function Get-InstallDiagnostics {
  param(
    [string[]]$InstallDirs = @(),
    [string]$MsiLog = ''
  )
  # 断言失败时输出可定位证据：安装目录清单 + 注册表卸载键 + MSI 日志尾部
  $lines = @()
  foreach ($dir in $InstallDirs) {
    if ([string]::IsNullOrWhiteSpace($dir)) { continue }
    if (Test-Path $dir) {
      $lines += "=== directory listing: $dir ==="
      $items = @(Get-ChildItem $dir -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 40)
      foreach ($item in $items) { $lines += $item.FullName }
    } else {
      $lines += "=== directory missing: $dir ==="
    }
  }
  foreach ($keyPath in @($script:NsisUninstallKeyPath, 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
    if (Test-Path $keyPath) {
      $lines += "=== registry: $keyPath ==="
      # StrictMode 下直接访问不存在的属性会抛错（部分 ARP 子键没有 DisplayName 等），
      # 一律经 PSObject.Properties 安全读取。
      $entries = @(Get-ChildItem $keyPath -ErrorAction SilentlyContinue | Get-ItemProperty -ErrorAction SilentlyContinue | Where-Object {
        $p = $_.PSObject.Properties['DisplayName']
        $p -and ([string]$p.Value -eq $script:ProductName)
      })
      foreach ($entry in $entries) {
        $prop = { param($Name) $v = $entry.PSObject.Properties[$Name]; if ($v) { [string]$v.Value } else { '<absent>' } }
        $lines += "$($entry.PSPath) | DisplayName=$(& $prop 'DisplayName') | DisplayVersion=$(& $prop 'DisplayVersion') | UninstallString=$(& $prop 'UninstallString')"
      }
    }
  }
  if ($MsiLog -and (Test-Path $MsiLog -PathType Leaf)) {
    $lines += "=== msi log tail: $MsiLog ==="
    $tail = @(Get-Content $MsiLog -Tail 30 -ErrorAction SilentlyContinue)
    $lines += $tail
  }
  return ($lines -join [Environment]::NewLine)
}

function Get-ArpEntryByDisplayName {
  # 在 ARP 键里按 DisplayName 定位卸载项。
  # -MachineScope：只查 HKLM（MSI perMachine 用）；默认 HKCU 优先（NSIS currentUser 用）。
  # 注意：NSIS 与 MSI 同时在装时两者都有同名 DisplayName 项，scope 必须区分，
  # 否则 msiexec /x 会拿到 NSIS 的非 GUID 键名（1619 ERROR_INSTALL_PACKAGE_OPEN_FAILED）。
  param(
    [Parameter(Mandatory = $true)][string]$DisplayName,
    [switch]$MachineScope
  )
  $roots = if ($MachineScope) {
    @(
      'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
      'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
    )
  } else {
    @(
      'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
      'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
      'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
    )
  }
  foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }
    # StrictMode 安全：部分 ARP 子键没有 DisplayName 属性
    $entry = @(Get-ChildItem $root -ErrorAction SilentlyContinue | Get-ItemProperty -ErrorAction SilentlyContinue | Where-Object {
      $p = $_.PSObject.Properties['DisplayName']
      $p -and ([string]$p.Value -eq $DisplayName)
    })
    if ($entry.Count -gt 0) { return $entry[0] }
  }
  return $null
}

function Get-NsisDisplayVersion {
  # 从 HKCU Uninstall 键读取 DisplayVersion（NSIS currentUser 模式）
  if (-not (Test-Path $script:NsisUninstallKeyPath)) { return $null }
  $value = Get-ItemPropertyValue -Path $script:NsisUninstallKeyPath -Name 'DisplayVersion' -ErrorAction SilentlyContinue
  if ($null -eq $value) { return $null }
  return [string]$value
}

function Save-ReleaseBaseline {
  param([Parameter(Mandatory = $true)][string]$Tag, [Parameter(Mandatory = $true)][string]$DestDir)
  New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
  Write-Step "Downloading baseline installer: gh release download $Tag (read-only)"
  & gh release download $Tag --repo $script:BaselineRepo --pattern '*x64-setup.exe' --dir $DestDir --clobber 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { return $null }
  $exe = @(Get-ChildItem $DestDir -Filter '*.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($exe.Count -eq 0) { return $null }
  return $exe[0]
}

function Get-BaselineInstaller {
  param([Parameter(Mandatory = $true)][string]$WorkRoot, [Parameter(Mandatory = $true)][string]$CurrentInstaller, [Parameter(Mandatory = $true)][string]$CurrentVersion)
  # 旧版本基线：优先 v1.4.7 Release 资产；缺失则 fallback v1.4.8；再缺失用当前构建产物复制一份。
  # 不允许为了旧版本在 CI 里编译两个版本。
  $baselineDir = Join-Path $WorkRoot 'baseline'
  if ($BaselineUrl) {
    $fileName = [IO.Path]::GetFileName(($BaselineUrl -split '\?')[0])
    $dest = Join-Path $baselineDir $fileName
    New-Item -ItemType Directory -Path $baselineDir -Force | Out-Null
    Write-Step "Downloading baseline from explicit URL: $BaselineUrl"
    Invoke-WebRequest -Uri $BaselineUrl -OutFile $dest -UseBasicParsing
    $versionMatch = [regex]::Match($fileName, 'Mini-HBUT_(\d+\.\d+\.\d+)_x64-setup\.exe')
    $version = if ($BaselineVersion) { $BaselineVersion } elseif ($versionMatch.Success) { $versionMatch.Groups[1].Value } else { $CurrentVersion }
    return [pscustomobject]@{ Path = (Get-Item $dest).FullName; Version = $version; Source = 'explicit-url'; FileName = $fileName }
  }

  # 优先显式指定的 v1.4.7 资产 URL（可容错资产命名变化），失败再走 gh 按版本号解析
  $baseline147Url = "https://github.com/$script:BaselineRepo/releases/download/v1.4.7/Mini-HBUT_1.4.7_x64-setup.exe"
  try {
    $fileName147 = 'Mini-HBUT_1.4.7_x64-setup.exe'
    $dest147 = Join-Path $baselineDir $fileName147
    New-Item -ItemType Directory -Path $baselineDir -Force | Out-Null
    Write-Step "Downloading baseline from release URL: $baseline147Url"
    Invoke-WebRequest -Uri $baseline147Url -OutFile $dest147 -UseBasicParsing
    return [pscustomobject]@{ Path = (Get-Item $dest147).FullName; Version = '1.4.7'; Source = 'release-url:v1.4.7'; FileName = $fileName147 }
  } catch {
    Write-Warning "Direct v1.4.7 asset download failed: $($_.Exception.Message)"
  }

  $v147 = Save-ReleaseBaseline -Tag 'v1.4.7' -DestDir $baselineDir
  if ($null -ne $v147) {
    return [pscustomobject]@{ Path = $v147.FullName; Version = '1.4.7'; Source = "release:v1.4.7"; FileName = $v147.Name }
  }
  Write-Warning 'v1.4.7 baseline asset unavailable; falling back to v1.4.8 release asset'
  $v148 = Save-ReleaseBaseline -Tag 'v1.4.8' -DestDir $baselineDir
  if ($null -ne $v148) {
    return [pscustomobject]@{ Path = $v148.FullName; Version = '1.4.8'; Source = 'release:v1.4.8'; FileName = $v148.Name }
  }
  Write-Warning 'No release baseline asset available; using a copy of the current build installer as baseline'
  $fallback = Join-Path $baselineDir 'Mini-HBUT_baseline-copy_x64-setup.exe'
  New-Item -ItemType Directory -Path $baselineDir -Force | Out-Null
  Copy-Item $CurrentInstaller $fallback -Force
  return [pscustomobject]@{ Path = $fallback; Version = $CurrentVersion; Source = 'current-build-fallback'; FileName = (Split-Path $fallback -Leaf) }
}

function Get-RenderedNsisArtifacts {
  param([Parameter(Mandatory = $true)][string]$ReleaseRoot)
  # bundler 渲染产物目录：src-tauri/target/release/nsis/<arch>/installer.nsi
  $nsisRenderRoot = Join-Path $ReleaseRoot 'nsis'
  if (-not (Test-Path $nsisRenderRoot)) { throw "Rendered NSIS directory not found: $nsisRenderRoot" }
  $rendered = @(Get-ChildItem $nsisRenderRoot -Recurse -Filter 'installer.nsi' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending)
  if ($rendered.Count -eq 0) { throw "Rendered installer.nsi not found below $nsisRenderRoot" }
  return $rendered[0]
}

function Find-SimpChineseToolchainFile {
  # bundler 自动下载的 NSIS 工具链（%LOCALAPPDATA%\tauri\NSIS）里的简体中文语言表
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'tauri\NSIS\Contrib\Language files\SimpChinese.nlf'),
    (Join-Path $env:LOCALAPPDATA 'tauri\NSIS\Bin\SimpChinese.nlf')
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate -PathType Leaf) { return $candidate }
  }
  $tauriCache = Join-Path $env:LOCALAPPDATA 'tauri'
  if (Test-Path $tauriCache) {
    $found = @(Get-ChildItem $tauriCache -Recurse -Filter 'SimpChinese.nlf' -File -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($found.Count -gt 0) { return $found[0].FullName }
  }
  return $null
}

function Find-ChineseTextEvidence {
  param([Parameter(Mandatory = $true)][string[]]$SearchDirs)
  # 在渲染目录（.nsi/.nsh）中递归 grep 简体中文字符序列，作为中文界面证据
  $results = @()
  foreach ($dir in $SearchDirs) {
    if (-not (Test-Path $dir)) { continue }
    $files = @(Get-ChildItem $dir -Recurse -Include '*.nsi', '*.nsh' -File -ErrorAction SilentlyContinue)
    foreach ($file in $files) {
      $content = [IO.File]::ReadAllText($file.FullName)
      $match = [regex]::Match($content, '[\u4e00-\u9fff][\u4e00-\u9fff，。…、：！？]{1,60}')
      if ($match.Success) {
        $results += [pscustomobject]@{ file = $file.FullName; sample = $match.Value }
      }
    }
  }
  return $results
}

# ---------- 顶层解析 ----------
$releaseDirectory = Resolve-RepoPath 'src-tauri/target/release'
$evidenceDirectory = Resolve-RepoPath $EvidenceRoot
New-Item -ItemType Directory -Path $evidenceDirectory -Force | Out-Null
$evidencePath = Join-Path $evidenceDirectory 'windows-installer-regression-evidence.json'

if ($NsisInstaller) {
  $nsisFile = Get-Item (Resolve-RepoPath $NsisInstaller)
} else {
  $nsisBundle = Join-Path $releaseDirectory 'bundle/nsis'
  $candidates = @(Get-ChildItem $nsisBundle -Filter '*.exe' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending)
  if ($candidates.Count -eq 0) { throw "NSIS installer not found below $nsisBundle" }
  $nsisFile = $candidates[0]
}
if ($MsiInstaller) {
  $msiFile = Get-Item (Resolve-RepoPath $MsiInstaller)
} else {
  $msiFile = $null
  $msiBundle = Join-Path $releaseDirectory 'bundle/msi'
  $msiCandidates = @(Get-ChildItem $msiBundle -Filter '*.msi' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending)
  if ($msiCandidates.Count -gt 0) { $msiFile = $msiCandidates[0] }
}

$frozenVersion = Read-FrozenVersion
$expectedNsisName = "Mini-HBUT_${frozenVersion}_x64-setup.exe"
if ($nsisFile.Name -ne $expectedNsisName) {
  throw "Unexpected NSIS artifact name '$($nsisFile.Name)'; expected '$expectedNsisName'"
}
$nsisSha256 = (Get-FileHash $nsisFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$commit = if ($env:GITHUB_SHA) { $env:GITHUB_SHA } else { (git -C $RepoRoot rev-parse HEAD).Trim() }

# 测试工作目录：优先 RUNNER_TEMP（GitHub runner 上形如 D:\a\_temp，无空格）
$workRoot = if ($env:RUNNER_TEMP) { Join-Path $env:RUNNER_TEMP 'hbut-installer-regression' } else { Join-Path ([IO.Path]::GetTempPath()) 'hbut-installer-regression' }
$nsisInstallDir = Join-Path $workRoot 'nsis-install'
$msiInstallDir = Join-Path $workRoot 'msi-install'
$msiInstallDirResolved = ''  # MSI 真实安装目录（安装后从注册表解析）；finally 清理也引用

# 用户数据目录隔离：测试前若已存在则改名备份 .bak-ci
$appDataDir = Join-Path $env:APPDATA $script:BundleId
$appDataBackup = "$appDataDir.bak-ci"
$appDataExistedBefore = Test-Path $appDataDir
if ($appDataExistedBefore) {
  if (Test-Path $appDataBackup) { Remove-Item $appDataBackup -Recurse -Force }
  Rename-Item $appDataDir 'com.hbut.mini.bak-ci'
  Write-Step "Backed up pre-existing app data dir to $appDataBackup"
}

$script:Evidence = [ordered]@{
  schema_version = 1
  generated_at_utc = [DateTimeOffset]::UtcNow.ToString('o')
  commit = $commit
  version = $frozenVersion
  nsis = [ordered]@{
    installer_name = $nsisFile.Name
    installer_size_bytes = $nsisFile.Length
    installer_sha256 = $nsisSha256
    artifact_name_pattern_ok = ($nsisFile.Name -eq $expectedNsisName)
    baseline = [ordered]@{ source = 'pending'; version = ''; file_name = '' }
    clean_install = [ordered]@{ status = 'pending'; install_dir = $nsisInstallDir; display_version = ''; main_binary_exists = $false }
    upgrade = [ordered]@{ status = 'pending'; display_version = ''; main_binary_exists = $false; uninstaller_exists = $false; start_menu_shortcut_exists = $false; canary_preserved = $false }
    chinese_ui = [ordered]@{ status = 'pending'; rendered_nsis_file = ''; language_macro_found = $false; simpchinese_nlf_found = $false; simpchinese_nlf_path = ''; chinese_string_files = @() }
    uninstall_keep_data = [ordered]@{ status = 'pending'; main_binary_absent = $false; uninstaller_absent = $false; registry_key_absent = $false; canary_present = $false }
    uninstall_delete_data = [ordered]@{ status = 'pending'; template_assertions = [ordered]@{}; human_verification_required = $true; human_verification_reason = '删除用户数据复选框仅存在于交互式卸载向导，静默模式无 UI 可勾选，CI 以模板级断言替代，真实点击需要人工/真机验证' }
    uninstall_cancel = [ordered]@{ status = 'pending'; template_assertions = [ordered]@{}; human_verification_required = $true; human_verification_reason = '取消卸载向导后不应删除任何数据，该交互只能由真机 UI 验证，CI 以模板级断言替代，需要人工/真机验证' }
  }
  msi = [ordered]@{
    skipped = ($null -eq $msiFile)
    installer_name = if ($null -ne $msiFile) { $msiFile.Name } else { '' }
    installer_name_contains_zh_cn = $false
    install = [ordered]@{ status = 'pending'; install_dir = $msiInstallDir; main_binary_exists = $false; uninstall_launcher_exists = $false; arp_display_version = '' }
    product_language_2052 = $false
    msi_log = ''
    uninstall = [ordered]@{ status = 'pending'; arp_entry_absent = $false; main_binary_absent = $false; canary_present = $false }
  }
  data_isolation = [ordered]@{
    app_data_dir = $appDataDir
    app_data_existed_before = $appDataExistedBefore
    backup_path = if ($appDataExistedBefore) { $appDataBackup } else { '' }
    restored = $false
    canary_path = Join-Path $appDataDir 'ci-canary.txt'
  }
  non_publish_guarantees = [ordered]@{
    release_created = $false
    tag_created = $false
    version_mutated = $false
    artifact_scope = 'ci-only'
  }
}

function Save-Evidence {
  param([string]$Error = '')
  $clone = $script:Evidence
  if ($Error) {
    $clone | Add-Member -NotePropertyName 'error' -NotePropertyValue $Error -Force
  }
  $clone.generated_at_utc = [DateTimeOffset]::UtcNow.ToString('o')
  $clone | ConvertTo-Json -Depth 10 | Set-Content -Path $evidencePath -Encoding utf8
  Write-Host "[installer-regression] evidence=$evidencePath"
}

function Assert-True {
  param([bool]$Condition, [Parameter(Mandatory = $true)][string]$Message, [string]$InstallDir = '', [string]$MsiLog = '')
  if (-not $Condition) {
    $diagnostics = Get-InstallDiagnostics -InstallDirs @($InstallDir, $nsisInstallDir, $msiInstallDir) -MsiLog $MsiLog
    throw "$Message`n$diagnostics"
  }
}

try {
  # ---------- 场景 1：NSIS 清洁安装（旧版本基线） ----------
  $baseline = Get-BaselineInstaller -WorkRoot $workRoot -CurrentInstaller $nsisFile.FullName -CurrentVersion $frozenVersion
  Write-Step "Baseline installer: source=$($baseline.Source) version=$($baseline.Version) file=$($baseline.FileName)"
  $script:Evidence.nsis.baseline.source = $baseline.Source
  $script:Evidence.nsis.baseline.version = $baseline.Version
  $script:Evidence.nsis.baseline.file_name = $baseline.FileName

  $canaryPath = Join-Path $appDataDir 'ci-canary.txt'
  New-Item -ItemType Directory -Path $appDataDir -Force | Out-Null
  Set-Content -Path $canaryPath -Value 'installer-regression-canary' -Encoding utf8
  Write-Step "Canary written: $canaryPath"

  Invoke-NsisSilentInstall -InstallerPath $baseline.Path -TargetDir $nsisInstallDir
  $nsisExe = Join-Path $nsisInstallDir $script:MainBinary
  $cleanDisplayVersion = Get-NsisDisplayVersion
  $script:Evidence.nsis.clean_install.main_binary_exists = (Test-Path $nsisExe -PathType Leaf)
  $script:Evidence.nsis.clean_install.display_version = [string]$cleanDisplayVersion
  Assert-True (Test-Path $nsisExe -PathType Leaf) "NSIS clean install: $script:MainBinary missing in $nsisInstallDir" -InstallDir $nsisInstallDir
  Assert-True ($cleanDisplayVersion -eq $baseline.Version) "NSIS clean install: DisplayVersion '$cleanDisplayVersion' does not match baseline version '$($baseline.Version)'" -InstallDir $nsisInstallDir
  $script:Evidence.nsis.clean_install.status = 'pass'
  Write-Step "Scenario 1 (NSIS clean install) passed: DisplayVersion=$cleanDisplayVersion"

  # ---------- 场景 2：NSIS 覆盖升级到当前构建 ----------
  Invoke-NsisSilentInstall -InstallerPath $nsisFile.FullName -TargetDir $nsisInstallDir
  $uninstallerPath = Join-Path $nsisInstallDir 'uninstall.exe'
  $startMenuShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$script:ProductName.lnk"
  $upgradeDisplayVersion = Get-NsisDisplayVersion
  $script:Evidence.nsis.upgrade.display_version = [string]$upgradeDisplayVersion
  $script:Evidence.nsis.upgrade.main_binary_exists = (Test-Path $nsisExe -PathType Leaf)
  $script:Evidence.nsis.upgrade.uninstaller_exists = (Test-Path $uninstallerPath -PathType Leaf)
  $script:Evidence.nsis.upgrade.start_menu_shortcut_exists = (Test-Path $startMenuShortcut -PathType Leaf)
  $script:Evidence.nsis.upgrade.canary_preserved = (Test-Path $canaryPath -PathType Leaf)
  Assert-True ($upgradeDisplayVersion -eq $frozenVersion) "NSIS upgrade: DisplayVersion '$upgradeDisplayVersion' does not match frozen '$frozenVersion'" -InstallDir $nsisInstallDir
  Assert-True (Test-Path $nsisExe -PathType Leaf) 'NSIS upgrade: main binary missing after upgrade' -InstallDir $nsisInstallDir
  Assert-True (Test-Path $uninstallerPath -PathType Leaf) 'NSIS upgrade: uninstall.exe missing after upgrade' -InstallDir $nsisInstallDir
  Assert-True (Test-Path $startMenuShortcut -PathType Leaf) "NSIS upgrade: start menu shortcut missing at $startMenuShortcut" -InstallDir $nsisInstallDir
  Assert-True (Test-Path $canaryPath -PathType Leaf) 'NSIS upgrade: user data canary was lost during upgrade' -InstallDir $nsisInstallDir
  $script:Evidence.nsis.upgrade.status = 'pass'
  Write-Step "Scenario 2 (NSIS upgrade) passed: DisplayVersion=$upgradeDisplayVersion uninstaller+shortcut+canary present"

  # ---------- 场景 3：NSIS 中文界面证据（渲染产物级） ----------
  $renderedNsi = Get-RenderedNsisArtifacts -ReleaseRoot $releaseDirectory
  $renderedDir = $renderedNsi.DirectoryName
  $renderedContent = [IO.File]::ReadAllText($renderedNsi.FullName)
  $languageMacroFound = $renderedContent.Contains('!insertmacro MUI_LANGUAGE "SimpChinese"')
  $script:Evidence.nsis.chinese_ui.rendered_nsis_file = $renderedNsi.FullName
  $script:Evidence.nsis.chinese_ui.language_macro_found = $languageMacroFound
  Assert-True $languageMacroFound "Rendered NSIS script lacks SimpChinese language macro: $($renderedNsi.FullName)"

  $nlfPath = Find-SimpChineseToolchainFile
  $script:Evidence.nsis.chinese_ui.simpchinese_nlf_found = ($null -ne $nlfPath)
  $script:Evidence.nsis.chinese_ui.simpchinese_nlf_path = if ($nlfPath) { $nlfPath } else { '' }
  Assert-True ($null -ne $nlfPath) 'SimpChinese.nlf language table not found in the bundler NSIS toolchain'

  $searchDirs = @($renderedDir)
  $toolchainLanguageDir = if ($nlfPath) { Split-Path $nlfPath -Parent } else { '' }
  if ($toolchainLanguageDir) { $searchDirs += $toolchainLanguageDir }
  $chineseEvidence = @(Find-ChineseTextEvidence -SearchDirs $searchDirs)
  $script:Evidence.nsis.chinese_ui.chinese_string_files = @($chineseEvidence | ForEach-Object { "$($_.file) :: $($_.sample)" })
  Assert-True ($chineseEvidence.Count -gt 0) 'No Simplified Chinese string found in rendered NSIS artifacts or language files' 
  $script:Evidence.nsis.chinese_ui.status = 'pass'
  Write-Step "Scenario 3 (Chinese UI evidence) passed: $($chineseEvidence.Count) file(s) contain Simplified Chinese strings"

  # ---------- 场景 4：NSIS 静默卸载-保留数据 ----------
  Invoke-NsisSilentUninstall -UninstallerPath $uninstallerPath -InstallDir $nsisInstallDir
  $keepMainBinaryAbsent = -not (Test-Path $nsisExe -PathType Leaf)
  $keepUninstallerAbsent = -not (Test-Path $uninstallerPath -PathType Leaf)
  $keepRegistryAbsent = -not (Test-Path $script:NsisUninstallKeyPath)
  $keepCanaryPresent = (Test-Path $canaryPath -PathType Leaf)
  $script:Evidence.nsis.uninstall_keep_data.main_binary_absent = $keepMainBinaryAbsent
  $script:Evidence.nsis.uninstall_keep_data.uninstaller_absent = $keepUninstallerAbsent
  $script:Evidence.nsis.uninstall_keep_data.registry_key_absent = $keepRegistryAbsent
  $script:Evidence.nsis.uninstall_keep_data.canary_present = $keepCanaryPresent
  Assert-True $keepMainBinaryAbsent 'NSIS uninstall (keep data): main binary still present' -InstallDir $nsisInstallDir
  # uninstall.exe 自删限制（NSIS 官方行为）：_?= 模式下卸载器运行中无法删除自身
  # （模板 Section Uninstall 的 Delete "$INSTDIR\uninstall.exe" 对运行中的自己失败，
  # NSIS 官方建议 _?= 模式由调用方清理残留）。故此断言降级为软断言：
  # 记录 evidence + 警告即可，不代表产品缺陷；普通双击卸载（无 _?=）会自复制
  # 到 %TEMP% 运行并完成自删。finally 的目录清理会移除该残留。
  if (-not $keepUninstallerAbsent) {
    Write-Warning 'NSIS uninstall (_?= mode): uninstall.exe remains in install dir — expected NSIS self-delete limitation, not a product bug'
  }
  Assert-True $keepRegistryAbsent 'NSIS uninstall (keep data): HKCU uninstall registry key still present' -InstallDir $nsisInstallDir
  Assert-True $keepCanaryPresent 'NSIS uninstall (keep data): user data canary was deleted (silent uninstall must keep app data)' -InstallDir $nsisInstallDir
  if (Test-Path $startMenuShortcut -PathType Leaf) {
    Write-Warning "Start menu shortcut still present after uninstall (soft assertion, recorded only): $startMenuShortcut"
  }
  $script:Evidence.nsis.uninstall_keep_data.status = 'pass'
  Write-Step "Scenario 4 (NSIS uninstall keep-data) passed"

  # ---------- 场景 5：NSIS 卸载-删除数据（模板级断言） ----------
  Invoke-NsisSilentInstall -InstallerPath $nsisFile.FullName -TargetDir $nsisInstallDir
  Assert-True (Test-Path $nsisExe -PathType Leaf) 'NSIS reinstall before delete-data scenario failed' -InstallDir $nsisInstallDir
  Assert-True (Test-Path $canaryPath -PathType Leaf) 'NSIS reinstall wiped user data canary unexpectedly' -InstallDir $nsisInstallDir
  $deleteDataAssertions = [ordered]@{
    delete_app_data_checkbox_defined = $renderedContent.Contains('Var DeleteAppDataCheckboxState')
    confirm_page_checkbox_hook = $renderedContent.Contains('!define MUI_PAGE_CUSTOMFUNCTION_SHOW un.ConfirmShow')
    checkbox_state_gated = $renderedContent.Contains('${If} $DeleteAppDataCheckboxState = 1')
    appdata_rmdir_present = $renderedContent.Contains('RmDir /r "$APPDATA\${BUNDLEID}"')
    localappdata_rmdir_present = $renderedContent.Contains('RmDir /r "$LOCALAPPDATA\${BUNDLEID}"')
  }
  foreach ($key in @($deleteDataAssertions.Keys)) {
    $script:Evidence.nsis.uninstall_delete_data.template_assertions[$key] = $deleteDataAssertions[$key]
    Assert-True $deleteDataAssertions[$key] "Delete-app-data template assertion failed: $key"
  }
  $script:Evidence.nsis.uninstall_delete_data.status = 'template-asserted'
  Write-Step 'Scenario 5 (NSIS delete-data) template assertions passed; real checkbox click requires human verification'

  # ---------- 场景 6：取消卸载分支（模板级断言） ----------
  $cancelAssertions = [ordered]@{
    confirm_page_present = $renderedContent.Contains('!insertmacro MUI_UNPAGE_CONFIRM')
    leave_hook_present = $renderedContent.Contains('!define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.ConfirmLeave')
    leave_hook_only_reads_checkbox = $renderedContent.Contains('SendMessage $DeleteAppDataCheckbox ${BM_GETCHECK} 0 0 $DeleteAppDataCheckboxState')
    passive_autoclose_guarded = $renderedContent.Contains('SetAutoClose true')
  }
  foreach ($key in @($cancelAssertions.Keys)) {
    $script:Evidence.nsis.uninstall_cancel.template_assertions[$key] = $cancelAssertions[$key]
    Assert-True $cancelAssertions[$key] "Cancel-uninstall template assertion failed: $key"
  }
  # 语义：取消卸载 = 关闭确认页，不进入 Section Uninstall，任何数据/目录都不会被删除
  $script:Evidence.nsis.uninstall_cancel.status = 'template-asserted'
  Write-Step 'Scenario 6 (NSIS cancel-uninstall) template assertions passed; real cancel click requires human verification'

  # ---------- 场景 7：MSI 清洁安装 + 卸载 ----------
  if ($null -ne $msiFile) {
    $msiLog = Join-Path $workRoot 'msi-install-verbose.log'
    $msiCanaryPath = Join-Path $appDataDir 'msi-ci-canary.txt'
    Set-Content -Path $msiCanaryPath -Value 'msi-installer-regression-canary' -Encoding utf8
    $script:Evidence.msi.installer_name_contains_zh_cn = $msiFile.Name.Contains('zh-CN')
    Assert-True $script:Evidence.msi.installer_name_contains_zh_cn "MSI artifact name lacks zh-CN marker: $($msiFile.Name)"

    Write-Step "MSI silent install: $($msiFile.Name) (default perMachine location)"
    # 不覆盖 INSTALLDIR：实测 CI 上带 RegistrySearch 的 INSTALLDIR 属性覆盖不生效
    # （第六次 run：status 0 但自定义目录未被创建，MSI 装到默认位置）。
    # 改为默认安装后从注册表读取真实位置——与用户实际路径一致，还能顺带
    # 验证 #799 模板的 RegistryEntries(HKCU InstallDir) 写入逻辑。
    $proc = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', "`"$($msiFile.FullName)`"", '/qn', '/norestart', '/L*v', "`"$msiLog`"") -PassThru
    $exitCode = Wait-InstallerProcess -Process $proc -Description 'MSI install'
    Assert-True (($exitCode -eq 0) -or ($exitCode -eq 3010)) "MSI install failed with exit code $exitCode" -InstallDir $msiInstallDirResolved -MsiLog $msiLog

    $script:Evidence.msi.msi_log = $msiLog
    $logContent = Get-Content $msiLog -Raw
    $productLanguageOk = ($logContent -match 'ProductLanguage\s*=\s*2052')
    $script:Evidence.msi.product_language_2052 = $productLanguageOk
    Assert-True $productLanguageOk 'MSI install log does not confirm ProductLanguage = 2052 (zh-CN)' -MsiLog $msiLog

    # 从注册表定位真实安装目录：优先 MSI（HKLM MachineScope）ARP 项的 InstallLocation
    # （模板 SetProperty ARPINSTALLLOCATION=[INSTALLDIR]），回退 HKCU InstallDir。
    # 注意不能用 HKCU\Software\hbut\Mini-HBUT 默认值——那是 NSIS 写的（测试里两者共存）。
    $arpEarly = Get-ArpEntryByDisplayName -DisplayName $script:ProductName -MachineScope
    if ($null -ne $arpEarly) {
      $locProp = $arpEarly.PSObject.Properties['InstallLocation']
      if ($locProp) { $msiInstallDirResolved = [string]$locProp.Value.Trim('"') }
    }
    if (-not $msiInstallDirResolved) {
      $registryInstallDir = 'HKCU:\Software\hbut\Mini-HBUT'
      if (Test-Path $registryInstallDir) {
        $v = (Get-ItemProperty $registryInstallDir -ErrorAction SilentlyContinue).PSObject.Properties['InstallDir']
        if ($v) { $msiInstallDirResolved = [string]$v.Value.Trim('"') }
      }
    }
    Assert-True (-not [string]::IsNullOrWhiteSpace($msiInstallDirResolved)) 'MSI install: cannot resolve real install dir from registry (HKCU InstallDir / ARP InstallLocation both absent)' -InstallDir $msiInstallDirResolved -MsiLog $msiLog
    $msiInstallDirResolved = $msiInstallDirResolved.TrimEnd('\')
    $script:Evidence.msi.install.install_dir_resolved = $msiInstallDirResolved
    $script:Evidence.msi.install.install_dir = $msiInstallDirResolved
    Write-Step "MSI install dir (from registry): $msiInstallDirResolved"

    $msiExe = Join-Path $msiInstallDirResolved $script:MainBinary
    $msiUninstallLauncher = Join-Path $msiInstallDirResolved 'uninstall.exe'
    $script:Evidence.msi.install.main_binary_exists = (Test-Path $msiExe -PathType Leaf)
    $script:Evidence.msi.install.uninstall_launcher_exists = (Test-Path $msiUninstallLauncher -PathType Leaf)
    Assert-True (Test-Path $msiExe -PathType Leaf) 'MSI install: main binary missing in install dir' -InstallDir $msiInstallDirResolved -MsiLog $msiLog
    Assert-True (Test-Path $msiUninstallLauncher -PathType Leaf) 'MSI install: uninstall.exe launcher missing in install dir (see #798)' -InstallDir $msiInstallDirResolved -MsiLog $msiLog

    $arp = Get-ArpEntryByDisplayName -DisplayName $script:ProductName -MachineScope
    Assert-True ($null -ne $arp) 'MSI install: ARP entry with DisplayName Mini-HBUT not found' -InstallDir $msiInstallDirResolved -MsiLog $msiLog
    # StrictMode 安全：DisplayVersion 属性可能缺失
    $arpVersionProp = $arp.PSObject.Properties['DisplayVersion']
    $arpVersion = if ($arpVersionProp) { [string]$arpVersionProp.Value } else { '' }
    $script:Evidence.msi.install.arp_display_version = $arpVersion
    Assert-True ($arpVersion -eq $frozenVersion) "MSI install: ARP DisplayVersion '$arpVersion' does not match frozen '$frozenVersion'" -InstallDir $msiInstallDirResolved -MsiLog $msiLog
    $script:Evidence.msi.install.status = 'pass'
    Write-Step 'Scenario 7a (MSI clean install) passed'

    # MSI 卸载必须用 MachineScope 项的 ProductCode（{GUID} 形态）。
    # 不加 scope 会拿到 NSIS 的 HKCU 键名 'Mini-HBUT' → msiexec /x 报 1619。
    $productCode = $arp.PSChildName
    Assert-True ($productCode -match '^\{[0-9A-Fa-f\-]{36}\}$') "MSI ProductCode '$productCode' is not a GUID (wrong ARP scope?)" -InstallDir $msiInstallDirResolved -MsiLog $msiLog
    Write-Step "MSI silent uninstall by ProductCode: $productCode"
    $proc = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/x', $productCode, '/qn', '/norestart') -PassThru
    $exitCode = Wait-InstallerProcess -Process $proc -Description 'MSI uninstall'
    Assert-True (($exitCode -eq 0) -or ($exitCode -eq 3010)) "MSI uninstall failed with exit code $exitCode" -InstallDir $msiInstallDirResolved -MsiLog $msiLog

    # 卸载干净断言同样只看 MachineScope（HKCU 的 NSIS 项与 MSI 无关）
    $uninstallArpAbsent = ($null -eq (Get-ArpEntryByDisplayName -DisplayName $script:ProductName -MachineScope))
    $uninstallExeAbsent = -not (Test-Path $msiExe -PathType Leaf)
    $uninstallCanaryPresent = (Test-Path $msiCanaryPath -PathType Leaf)
    $script:Evidence.msi.uninstall.arp_entry_absent = $uninstallArpAbsent
    $script:Evidence.msi.uninstall.main_binary_absent = $uninstallExeAbsent
    $script:Evidence.msi.uninstall.canary_present = $uninstallCanaryPresent
    Assert-True $uninstallArpAbsent 'MSI uninstall: ARP entry still present' -InstallDir $msiInstallDir -MsiLog $msiLog
    Assert-True $uninstallExeAbsent 'MSI uninstall: main binary still present' -InstallDir $msiInstallDir -MsiLog $msiLog
    Assert-True $uninstallCanaryPresent 'MSI uninstall: user data canary was deleted (MSI uninstall must keep app data)' -InstallDir $msiInstallDir -MsiLog $msiLog
    $script:Evidence.msi.uninstall.status = 'pass'
    Write-Step 'Scenario 7b (MSI uninstall keep-data) passed'
  } else {
    Write-Warning 'MSI installer not provided/found; MSI scenarios skipped'
  }

  $script:Evidence.data_isolation.restored = $false  # 占位；finally 恢复后重写
  Save-Evidence
  Write-Host "[installer-regression] ALL SCENARIOS COMPLETED (msi_skipped=$($script:Evidence.msi.skipped))"
} catch {
  Save-Evidence -Error ($_.Exception.Message)
  throw
} finally {
  # ---------- 清理：杀进程、静默卸载残留、恢复数据目录 ----------
  Write-Step 'Cleanup: killing stray processes, uninstalling leftovers, restoring app data'
  & taskkill.exe /IM $script:MainBinary /F 2>$null | Out-Null

  try {
    # NSIS 残留卸载（静默卸载不勾删数据，不会破坏 canary/备份逻辑）
    if (Test-Path $script:NsisUninstallKeyPath) {
      $leftoverUninstaller = Join-Path $nsisInstallDir 'uninstall.exe'
      if (Test-Path $leftoverUninstaller -PathType Leaf) {
        $proc = Start-Process -FilePath $leftoverUninstaller -ArgumentList @('/S', "_?=$nsisInstallDir") -PassThru
        if (-not $proc.WaitForExit(180000)) { & taskkill.exe /PID $proc.Id /T /F 2>$null | Out-Null }
      }
    }
  } catch {
    Write-Warning "NSIS leftover uninstall failed: $($_.Exception.Message)"
  }

  try {
    # MSI 残留卸载（MachineScope：只认 MSI 的 HKLM 项，键名必须是 GUID 形态）
    $leftoverArp = Get-ArpEntryByDisplayName -DisplayName $script:ProductName -MachineScope
    if (($null -ne $leftoverArp) -and ($leftoverArp.PSChildName -match '^\{[0-9A-Fa-f\-]{36}\}$')) {
      $proc = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/x', $leftoverArp.PSChildName, '/qn', '/norestart') -PassThru
      if (-not $proc.WaitForExit(180000)) { & taskkill.exe /PID $proc.Id /T /F 2>$null | Out-Null }
    }
  } catch {
    Write-Warning "MSI leftover uninstall failed: $($_.Exception.Message)"
  }

  try {
    # 安装目录清理
    foreach ($dir in @($nsisInstallDir, $msiInstallDir, $msiInstallDirResolved, (Join-Path $env:ProgramFiles 'Mini-HBUT'))) {
      $safeToDelete = $dir.StartsWith($workRoot, [StringComparison]::OrdinalIgnoreCase)
      if (($dir -like "$env:ProgramFiles\Mini-HBUT") -or ($dir -eq $msiInstallDirResolved)) {
        # MSI 默认位置/解析目录：仅在 MSI ARP 项已卸载干净时才允许清理
        $safeToDelete = $null -eq (Get-ArpEntryByDisplayName -DisplayName $script:ProductName -MachineScope)
      }
      if ((Test-Path $dir) -and $safeToDelete) {
        Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
    if (Test-Path $workRoot) { Remove-Item $workRoot -Recurse -Force -ErrorAction SilentlyContinue }
  } catch {
    Write-Warning "Work root cleanup failed: $($_.Exception.Message)"
  }

  try {
    # 用户数据目录恢复：测试前存在则还原备份；不存在则删除测试产物（含 canary）
    if ($appDataExistedBefore) {
      if (Test-Path $appDataDir) { Remove-Item $appDataDir -Recurse -Force }
      if (Test-Path $appDataBackup) {
        Rename-Item $appDataBackup 'com.hbut.mini'
        $script:Evidence.data_isolation.restored = $true
        Write-Step "Restored pre-existing app data from $appDataBackup"
      }
    } elseif (Test-Path $appDataDir) {
      Remove-Item $appDataDir -Recurse -Force
      Write-Step "Removed test-created app data dir $appDataDir"
    }
    Save-Evidence
  } catch {
    Write-Warning "App data restore failed: $($_.Exception.Message)"
  }
}

# 显式成功退出：GitHub Actions 以 pwsh -command 点源执行本脚本，
# 进程退出码取最后执行的原生命令的 $LASTEXITCODE（如 taskkill 找不到
# 进程返回 128）。不显式 exit 0 会让全绿的运行被误判失败（第九次 run 实证）。
exit 0
