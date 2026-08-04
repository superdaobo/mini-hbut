[CmdletBinding()]
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
  [string]$ReleaseRoot = 'src-tauri/target/release',
  [string]$BundleRoot = 'src-tauri/target/release/bundle/nsis',
  [string]$EvidenceRoot = 'dist-dry-run',
  [int]$BridgePort = 0,
  [int]$CdpPort = 0,
  [int]$HealthTimeoutSeconds = 45
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-RepoPath([string]$PathValue) {
  if ([IO.Path]::IsPathRooted($PathValue)) { return $PathValue }
  return Join-Path $RepoRoot $PathValue
}

function Get-FreeLoopbackPort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Set-TemporaryRegistryStringValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $keyExisted = Test-Path $Path
  if (-not $keyExisted) {
    New-Item -Path $Path -Force | Out-Null
  }
  $propertyNames = @((Get-ItemProperty -Path $Path).PSObject.Properties | ForEach-Object { $_.Name })
  $valueExisted = $propertyNames -contains $Name
  $previousValue = if ($valueExisted) {
    [string](Get-ItemPropertyValue -Path $Path -Name $Name)
  } else {
    $null
  }
  New-ItemProperty -Path $Path -Name $Name -PropertyType String -Value $Value -Force | Out-Null
  return [pscustomobject]@{
    Path = $Path
    Name = $Name
    KeyExisted = $keyExisted
    ValueExisted = $valueExisted
    PreviousValue = $previousValue
  }
}

function Restore-TemporaryRegistryStringValue {
  param([Parameter(Mandatory = $true)]$State)

  if ($State.ValueExisted) {
    New-ItemProperty -Path $State.Path -Name $State.Name -PropertyType String -Value ([string]$State.PreviousValue) -Force | Out-Null
  } else {
    Remove-ItemProperty -Path $State.Path -Name $State.Name -ErrorAction SilentlyContinue
  }
  if (-not $State.KeyExisted -and (Test-Path $State.Path)) {
    $remaining = @((Get-Item $State.Path).Property)
    if ($remaining.Count -eq 0) {
      Remove-Item -Path $State.Path -Force -ErrorAction SilentlyContinue
    }
  }
}

function Read-AppVersions {
  $packageJson = Get-Content (Join-Path $RepoRoot 'package.json') -Raw | ConvertFrom-Json
  $tauriConfig = Get-Content (Join-Path $RepoRoot 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
  $cargoToml = Get-Content (Join-Path $RepoRoot 'src-tauri/Cargo.toml') -Raw
  $cargoMatch = [regex]::Match($cargoToml, '(?m)^version\s*=\s*"([^"]+)"')
  if (-not $cargoMatch.Success) { throw 'Cargo package version not found' }

  $versions = [ordered]@{
    package_json = [string]$packageJson.version
    tauri_config = [string]$tauriConfig.version
    cargo_toml = [string]$cargoMatch.Groups[1].Value
  }
  $unique = @($versions.Values | Select-Object -Unique)
  if ($unique.Count -ne 1) {
    throw "Release version sources are inconsistent: $($versions | ConvertTo-Json -Compress)"
  }
  return [pscustomobject]@{ Version = $unique[0]; Sources = $versions }
}

$releaseDirectory = Resolve-RepoPath $ReleaseRoot
$bundleDirectory = Resolve-RepoPath $BundleRoot
$evidenceDirectory = Resolve-RepoPath $EvidenceRoot
$rawExecutable = Join-Path $releaseDirectory 'hbut-helper.exe'
if (-not (Test-Path $rawExecutable -PathType Leaf)) { throw "Release executable not found: $rawExecutable" }

$installer = Get-ChildItem $bundleDirectory -Filter '*.exe' -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
if (-not $installer) { throw "NSIS installer not found below $bundleDirectory" }

$versionInfo = Read-AppVersions
New-Item -ItemType Directory -Path $evidenceDirectory -Force | Out-Null
$artifactPath = Join-Path $evidenceDirectory ("Mini-HBUT_{0}_x64-setup.exe" -f $versionInfo.Version)
Copy-Item $installer.FullName $artifactPath -Force
$artifact = Get-Item $artifactPath
$artifactHash = (Get-FileHash $artifact.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$rawFile = Get-Item $rawExecutable
$commit = if ($env:GITHUB_SHA) { $env:GITHUB_SHA } else { (git -C $RepoRoot rev-parse HEAD).Trim() }
$startedAt = [DateTimeOffset]::UtcNow
$process = $null
$healthStatus = 0
$resolvedBridgePort = if ($BridgePort -gt 0) { $BridgePort } else { Get-FreeLoopbackPort }
$resolvedCdpPort = if ($CdpPort -gt 0) { $CdpPort } else {
  do { $candidate = Get-FreeLoopbackPort } while ($candidate -eq $resolvedBridgePort)
  $candidate
}
$healthUrl = "http://127.0.0.1:$resolvedBridgePort/health"
$webviewEvidencePath = Join-Path $evidenceDirectory 'windows-webview-mount-evidence.json'
$previousBridgeEnabled = $env:HBUT_HTTP_BRIDGE_ENABLED
$previousBridgePort = $env:HBUT_HTTP_BRIDGE_PORT
$previousWebViewArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$tauriConfig = Get-Content (Join-Path $RepoRoot 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
$webViewPolicyPath = 'HKLM:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$webViewPolicyNames = @($rawFile.Name, [string]$tauriConfig.identifier, '*') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
$webViewPolicyStates = @()
$hostIsElevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

try {
  # Desktop release builds intentionally keep the Bridge disabled by default.
  # The dry run enables it only for this child process so /health can prove that
  # the release binary initialized its Tauri runtime and loopback Bridge.
  $env:HBUT_HTTP_BRIDGE_ENABLED = '1'
  $env:HBUT_HTTP_BRIDGE_PORT = [string]$resolvedBridgePort
  $cdpArgument = "--remote-debugging-port=$resolvedCdpPort"
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = if ([string]::IsNullOrWhiteSpace($previousWebViewArguments)) {
    $cdpArgument
  } else {
    "$previousWebViewArguments $cdpArgument"
  }
  # GitHub's Windows runner can launch the host elevated. WebView2 ignores
  # environment and HKCU browser-argument overrides for elevated hosts, so try
  # the machine policy that WebView2 explicitly honors at High Integrity Level.
  # Ordinary local runs may not write HKLM; they keep the environment override.
  try {
    foreach ($policyName in $webViewPolicyNames) {
      $webViewPolicyStates += Set-TemporaryRegistryStringValue -Path $webViewPolicyPath -Name $policyName -Value $cdpArgument
    }
  } catch {
    for ($index = $webViewPolicyStates.Count - 1; $index -ge 0; $index--) {
      Restore-TemporaryRegistryStringValue -State $webViewPolicyStates[$index]
    }
    $webViewPolicyStates = @()
    if ($hostIsElevated) {
      throw "Elevated WebView2 host requires temporary HKLM debug policy, but it could not be configured: $($_.Exception.Message)"
    }
    Write-Warning "HKLM WebView2 debug policy unavailable; continuing with non-elevated environment override: $($_.Exception.Message)"
  }
  $registryPolicyApplied = $webViewPolicyStates.Count -gt 0
  Write-Host "[windows-release-smoke] cdp=$resolvedCdpPort elevated=$hostIsElevated registryPolicy=$registryPolicyApplied policyNames=$($webViewPolicyNames -join ',')"
  $process = Start-Process -FilePath $rawFile.FullName -WorkingDirectory $rawFile.DirectoryName -PassThru
  $deadline = [DateTimeOffset]::UtcNow.AddSeconds($HealthTimeoutSeconds)
  do {
    Start-Sleep -Milliseconds 750
    $process.Refresh()
    if ($process.HasExited) {
      throw "Release executable exited before Bridge health became ready (exit code $($process.ExitCode))"
    }
    try {
      $response = Invoke-WebRequest -Uri $healthUrl -Method Get -TimeoutSec 2 -UseBasicParsing
      $healthStatus = [int]$response.StatusCode
    } catch {
      $healthStatus = 0
    }
  } while ($healthStatus -ne 200 -and [DateTimeOffset]::UtcNow -lt $deadline)

  if ($healthStatus -ne 200) {
    throw "Bridge health did not return HTTP 200 at $healthUrl within $HealthTimeoutSeconds seconds"
  }

  $mountScript = Join-Path $RepoRoot 'scripts/ci/assert_webview_app_mounted.mjs'
  & node $mountScript --port $resolvedCdpPort --timeout-ms ($HealthTimeoutSeconds * 1000) --output $webviewEvidencePath
  if ($LASTEXITCODE -ne 0) {
    throw "WebView application mount smoke failed with exit code $LASTEXITCODE"
  }
  if (-not (Test-Path $webviewEvidencePath -PathType Leaf)) {
    throw "WebView mount evidence was not created: $webviewEvidencePath"
  }
  $webviewEvidence = Get-Content $webviewEvidencePath -Raw | ConvertFrom-Json
  if ([string]$webviewEvidence.status -ne 'mounted') {
    throw "WebView application did not report mounted status"
  }

  $observedAt = [DateTimeOffset]::UtcNow
  $evidence = [ordered]@{
    schema_version = 1
    generated_at_utc = $observedAt.ToString('o')
    commit = $commit
    build_profile = 'release'
    version = $versionInfo.Version
    version_sources = $versionInfo.Sources
    executable = [ordered]@{
      name = $rawFile.Name
      size_bytes = $rawFile.Length
      process_id = $process.Id
      observed_running_ms = [int][Math]::Round(($observedAt - $startedAt).TotalMilliseconds)
    }
    installer = [ordered]@{
      source_name = $installer.Name
      artifact_name = $artifact.Name
      size_bytes = $artifact.Length
      sha256 = $artifactHash
    }
    smoke = [ordered]@{
      health_url = $healthUrl
      status_code = $healthStatus
      bridge_enabled_by_test = $true
      bridge_port = $resolvedBridgePort
      cdp_port = $resolvedCdpPort
      cdp_environment_override = $true
      cdp_registry_policy_override = $registryPolicyApplied
      cdp_registry_policy_names = @($webViewPolicyNames)
      host_is_elevated = $hostIsElevated
      webview_status = [string]$webviewEvidence.status
      webview_root_children = [int]$webviewEvidence.snapshot.rootChildren
      webview_visible_elements = [int]$webviewEvidence.snapshot.visibleElements
      webview_strict_csp_eval_failures = [int]$webviewEvidence.strict_csp_eval_failures
      webview_csp_violations = [int]$webviewEvidence.csp_violations
      webview_evidence = [IO.Path]::GetFileName($webviewEvidencePath)
      observed_at_utc = $observedAt.ToString('o')
    }
    non_publish_guarantees = [ordered]@{
      release_created = $false
      tag_created = $false
      version_mutated = $false
      artifact_scope = 'ci-only'
    }
  }

  $evidencePath = Join-Path $evidenceDirectory 'windows-release-dry-run-evidence.json'
  $evidence | ConvertTo-Json -Depth 8 | Set-Content -Path $evidencePath -Encoding utf8
  Write-Host "[windows-release-smoke] health=$healthStatus url=$healthUrl version=$($versionInfo.Version)"
  Write-Host "[windows-release-smoke] artifact=$artifactPath sha256=$artifactHash"
  Write-Host "[windows-release-smoke] evidence=$evidencePath"
} finally {
  if ($null -ne $process) {
    $process.Refresh()
    if (-not $process.HasExited) {
      & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
    }
  }
  for ($index = $webViewPolicyStates.Count - 1; $index -ge 0; $index--) {
    Restore-TemporaryRegistryStringValue -State $webViewPolicyStates[$index]
  }
  $env:HBUT_HTTP_BRIDGE_ENABLED = $previousBridgeEnabled
  $env:HBUT_HTTP_BRIDGE_PORT = $previousBridgePort
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousWebViewArguments
}
