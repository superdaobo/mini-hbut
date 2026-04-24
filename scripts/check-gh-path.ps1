$candidates = @(
  "$env:ProgramFiles\GitHub CLI\gh.exe",
  "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe",
  "$env:ProgramFiles(x86)\GitHub CLI\gh.exe"
)

$resolved = @()

foreach ($candidate in $candidates) {
  if ($candidate -and (Test-Path -LiteralPath $candidate)) {
    $resolved += (Resolve-Path -LiteralPath $candidate).Path
  }
}

if (-not $resolved.Count) {
  $pathEntries = @()
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  foreach ($entry in @($userPath, $machinePath)) {
    if (-not [string]::IsNullOrWhiteSpace($entry)) {
      $pathEntries += ($entry -split ";")
    }
  }

  foreach ($entry in ($pathEntries | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)) {
    $exePath = Join-Path $entry "gh.exe"
    if (Test-Path -LiteralPath $exePath) {
      $resolved += (Resolve-Path -LiteralPath $exePath).Path
    }
  }
}

if (-not $resolved.Count) {
  $command = Get-Command gh -ErrorAction SilentlyContinue
  if ($command) {
    $resolved += $command.Source
  }
}

if (-not $resolved.Count) {
  Write-Output "NOT_FOUND"
  exit 1
}

$resolved | Select-Object -Unique | ForEach-Object { Write-Output $_ }
