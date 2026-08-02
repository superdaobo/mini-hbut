[CmdletBinding()]
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
  [string]$ReleaseRoot = 'src-tauri/target/release',
  [string]$BundleRoot = 'src-tauri/target/release/bundle/nsis',
  [string]$EvidenceRoot = 'dist-dry-run',
  [int]$BridgePort = 0,
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
$healthUrl = "http://127.0.0.1:$resolvedBridgePort/health"
$previousBridgeEnabled = $env:HBUT_HTTP_BRIDGE_ENABLED
$previousBridgePort = $env:HBUT_HTTP_BRIDGE_PORT

try {
  # Desktop release builds intentionally keep the Bridge disabled by default.
  # The dry run enables it only for this child process so /health can prove that
  # the release binary initialized its Tauri runtime and loopback Bridge.
  $env:HBUT_HTTP_BRIDGE_ENABLED = '1'
  $env:HBUT_HTTP_BRIDGE_PORT = [string]$resolvedBridgePort
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
  $env:HBUT_HTTP_BRIDGE_ENABLED = $previousBridgeEnabled
  $env:HBUT_HTTP_BRIDGE_PORT = $previousBridgePort
}
