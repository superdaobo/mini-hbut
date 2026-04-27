[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Drawing

$rootDir = Split-Path -Parent $PSScriptRoot
function Resolve-OfficialIconSource {
  $relativePaths = @(
    'src-tauri/icons/source/official_badge.png',
    'src-tauri/icons/source/official_badge.svg.png',
    'src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher_foreground.png'
  )

  foreach ($relativePath in $relativePaths) {
    try {
      $gitOutput = & git -C $rootDir checkout-index --temp -- $relativePath 2>$null
      if ($LASTEXITCODE -eq 0 -and $gitOutput) {
        $tempPath = ($gitOutput -split "`t")[0].Trim()
        if ($tempPath -and (Test-Path $tempPath)) {
          return @{
            Path   = $tempPath
            IsTemp = $true
          }
        }
      }
    } catch {
      # fall through to workspace file
    }

    $workspacePath = Join-Path $rootDir ($relativePath -replace '/', '\')
    if (Test-Path $workspacePath) {
      return @{
        Path   = $workspacePath
        IsTemp = $false
      }
    }
  }
  throw "Icon source not found in official source candidates"
}

$outputQuality = @{
  Interpolation = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  Smoothing     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  PixelOffset   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  Compositing   = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
}

function New-SizedBitmap {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Image]$Source,
    [Parameter(Mandatory = $true)][int]$Size
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = $outputQuality.Interpolation
    $graphics.SmoothingMode = $outputQuality.Smoothing
    $graphics.PixelOffsetMode = $outputQuality.PixelOffset
    $graphics.CompositingQuality = $outputQuality.Compositing
    $graphics.DrawImage($Source, 0, 0, $Size, $Size)
    return $bitmap
  } finally {
    $graphics.Dispose()
  }
}

function New-ScaledMasterBitmap {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Image]$Source,
    [Parameter(Mandatory = $true)][int]$CanvasSize,
    [Parameter(Mandatory = $true)][double]$Scale
  )

  $bitmap = [System.Drawing.Bitmap]::new($CanvasSize, $CanvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $contentSize = [int][Math]::Round($CanvasSize * $Scale)
    $offset = [int][Math]::Floor(($CanvasSize - $contentSize) / 2)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = $outputQuality.Interpolation
    $graphics.SmoothingMode = $outputQuality.Smoothing
    $graphics.PixelOffsetMode = $outputQuality.PixelOffset
    $graphics.CompositingQuality = $outputQuality.Compositing
    $graphics.DrawImage($Source, $offset, $offset, $contentSize, $contentSize)
    return $bitmap
  } finally {
    $graphics.Dispose()
  }
}

function Save-Png {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Image]$Source,
    [Parameter(Mandatory = $true)][string]$TargetPath,
    [Parameter(Mandatory = $true)][int]$Size
  )

  $targetDir = Split-Path -Parent $TargetPath
  if ($targetDir) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  }
  $bitmap = New-SizedBitmap -Source $Source -Size $Size
  try {
    $bitmap.Save($TargetPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $bitmap.Dispose()
  }
}

function Get-ExistingPngSize {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path $Path)) {
    return $null
  }
  $image = [System.Drawing.Image]::FromFile($Path)
  try {
    return [Math]::Max($image.Width, $image.Height)
  } finally {
    $image.Dispose()
  }
}

function Write-Ico {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Image]$Source,
    [Parameter(Mandatory = $true)][string]$TargetPath
  )

  $targetDir = Split-Path -Parent $TargetPath
  if ($targetDir) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  }

  $bitmap = New-SizedBitmap -Source $Source -Size 256
  $iconHandle = [IntPtr]::Zero
  $icon = $null
  $fileStream = $null
  try {
    $iconHandle = $bitmap.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($iconHandle)
    $fileStream = [System.IO.File]::Create($TargetPath)
    $icon.Save($fileStream)
    $fileStream.Flush()
    $writtenLength = (Get-Item $TargetPath).Length
    if ($writtenLength -lt 1024) {
      throw "Generated ICO is unexpectedly small: $writtenLength bytes"
    }
  } finally {
    if ($fileStream) {
      $fileStream.Dispose()
    }
    if ($icon) {
      $icon.Dispose()
    }
    if ($bitmap) {
      $bitmap.Dispose()
    }
  }
}

$sourceInfo = Resolve-OfficialIconSource
$sourceBytes = [System.IO.File]::ReadAllBytes($sourceInfo.Path)
$sourceStream = [System.IO.MemoryStream]::new($sourceBytes)
$sourceImage = [System.Drawing.Image]::FromStream($sourceStream)
$masterBitmap = $null
$adaptiveForegroundBitmap = $null
try {
  $masterSize = 1024
  $masterScale = 0.74
  $androidAdaptiveForegroundScale = 0.58

  $masterBitmap = New-ScaledMasterBitmap -Source $sourceImage -CanvasSize $masterSize -Scale $masterScale
  $adaptiveForegroundBitmap =
    New-ScaledMasterBitmap -Source $sourceImage -CanvasSize $masterSize -Scale $androidAdaptiveForegroundScale

  $rootPngTargets = @(
    'src-tauri/icons/32x32.png',
    'src-tauri/icons/64x64.png',
    'src-tauri/icons/128x128.png',
    'src-tauri/icons/128x128@2x.png',
    'src-tauri/icons/icon-512.png',
    'src-tauri/icons/Square30x30Logo.png',
    'src-tauri/icons/Square44x44Logo.png',
    'src-tauri/icons/Square71x71Logo.png',
    'src-tauri/icons/Square89x89Logo.png',
    'src-tauri/icons/Square107x107Logo.png',
    'src-tauri/icons/Square142x142Logo.png',
    'src-tauri/icons/Square150x150Logo.png',
    'src-tauri/icons/Square284x284Logo.png',
    'src-tauri/icons/Square310x310Logo.png',
    'src-tauri/icons/StoreLogo.png',
    'src-tauri/icons/icon.png',
    'src-tauri/icons/icon.svg.png',
    'src-tauri/icons/icon.icns.png'
  )

  foreach ($relativePath in $rootPngTargets) {
    $targetPath = Join-Path $rootDir $relativePath
    $targetSize = Get-ExistingPngSize -Path $targetPath
    if (-not $targetSize) {
      if ($relativePath -like '*128x128@2x.png') {
        $targetSize = 256
      } elseif ($relativePath -like '*icon-512.png') {
        $targetSize = 512
      } elseif ($relativePath -like '*icon.png' -or $relativePath -like '*icon.svg.png' -or $relativePath -like '*icon.icns.png') {
        $targetSize = 1024
      } else {
        continue
      }
    }
    Save-Png -Source $masterBitmap -TargetPath $targetPath -Size $targetSize
  }

  $iosTargets = Get-ChildItem (Join-Path $rootDir 'src-tauri\icons\ios') -Filter '*.png' -File
  foreach ($file in $iosTargets) {
    $targetSize = Get-ExistingPngSize -Path $file.FullName
    if ($targetSize) {
      Save-Png -Source $masterBitmap -TargetPath $file.FullName -Size $targetSize
    }
  }

  $androidTargets = Get-ChildItem (Join-Path $rootDir 'src-tauri\icons\android') -Recurse -File |
    Where-Object { $_.Extension -eq '.png' -and $_.Name -like 'ic_launcher*.png' }
  foreach ($file in $androidTargets) {
    $targetSize = Get-ExistingPngSize -Path $file.FullName
    if ($targetSize) {
      $targetSource = if ($file.Name -eq 'ic_launcher_foreground.png') { $adaptiveForegroundBitmap } else { $masterBitmap }
      Save-Png -Source $targetSource -TargetPath $file.FullName -Size $targetSize
    }
  }

  $whiteBackgroundXml = @'
<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">#FFFFFF</color>
</resources>
'@
  Set-Content -Path (Join-Path $rootDir 'src-tauri\icons\android\values\ic_launcher_background.xml') -Value $whiteBackgroundXml -Encoding UTF8

  $iconStream = [System.IO.MemoryStream]::new()
  try {
    $masterBitmap.Save($iconStream, [System.Drawing.Imaging.ImageFormat]::Png)
    $iconBase64 = [Convert]::ToBase64String($iconStream.ToArray())
  } finally {
    $iconStream.Dispose()
  }

  $svg = @"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <image width="1024" height="1024" href="data:image/png;base64,$iconBase64" />
</svg>
"@
  Set-Content -Path (Join-Path $rootDir 'src-tauri\icons\icon.svg') -Value $svg -Encoding UTF8

  Write-Ico -Source $masterBitmap -TargetPath (Join-Path $rootDir 'src-tauri\icons\icon.ico')
} finally {
  $sourceImage.Dispose()
  $sourceStream.Dispose()
  if ($sourceInfo.IsTemp -and (Test-Path $sourceInfo.Path)) {
    Remove-Item -LiteralPath $sourceInfo.Path -Force
  }
  if ($masterBitmap) {
    $masterBitmap.Dispose()
  }
  if ($adaptiveForegroundBitmap) {
    $adaptiveForegroundBitmap.Dispose()
  }
}

Write-Output '[icon-gen] Official icon assets regenerated.'
