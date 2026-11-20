# goal-21 / T15：批量截取 12 个教师页面（亮/暗双模式）
# 通过 /debug/frontend-eval 导航 + Win32 PrintWindow 截图，全程不抢焦点。
param(
  [string]$Token = 'p4verify2026',
  [string]$OutDir = 'D:\wt\teacher-portal-probe-1120\data\teacher-portal-recon-1120\shots-t15',
  [int]$ProcId = 22872
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
if (-not ('Win32Capture' -as [type])) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Capture {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
}

[void][Win32Capture]::SetProcessDPIAware()
function Get-AppWindow([int]$procId) {
  $p = Get-Process -Id $procId -ErrorAction Stop
  return $p.MainWindowHandle
}

function Save-WindowShot([IntPtr]$hwnd, [string]$path) {
  $rect = New-Object Win32Capture+RECT
  [void][Win32Capture]::GetWindowRect($hwnd, [ref]$rect)
  $w = $rect.Right - $rect.Left
  $h = $rect.Bottom - $rect.Top
  if ($w -le 0 -or $h -le 0) { throw "窗口尺寸异常: ${w}x${h}" }
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $gfx.GetHdc()
  [void][Win32Capture]::PrintWindow($hwnd, $hdc, 2)  # 2 = PW_RENDERFULLCONTENT
  $gfx.ReleaseHdc($hdc)
  $gfx.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  return (Get-Item $path).Length
}

function Invoke-Eval([string]$js) {
  $body = @{ js = $js } | ConvertTo-Json -Compress
  $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:4399/debug/frontend-eval' -Method Post `
    -Headers @{ Authorization = "Bearer $Token" } -ContentType 'application/json' `
    -Body $body -TimeoutSec 15
  return $resp.data.result
}

$views = @(
  @{ id = 'teacherattendance';       slug = '01-attendance' },
  @{ id = 'teachercredits';          slug = '02-credits' },
  @{ id = 'teacherworkload';         slug = '04-workload' },
  @{ id = 'teacherworkflow';         slug = '05-workflow' },
  @{ id = 'teacherexamaffairs';      slug = '06-examaffairs' },
  @{ id = 'teacheradjustment';       slug = '07-adjustment' },
  @{ id = 'teacherroster';           slug = '08-roster' },
  @{ id = 'teachergradeentry';       slug = '09-gradeentry' },
  @{ id = 'teacherchaoxinganalytics';slug = '10-chaoxing' },
  @{ id = 'teacherportal';           slug = '11-portal' },
  @{ id = 'teacherclassschedule';    slug = '12-classschedule' },
  @{ id = 'teacherroomschedule';     slug = '13-roomschedule' }
)

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$hwnd = Get-AppWindow $ProcId
if ($hwnd -eq [IntPtr]::Zero) { throw "找不到 App 窗口" }
Write-Output ("窗口句柄: " + $hwnd)

$results = @()

foreach ($mode in @('light', 'dark')) {
  # 切换模式
  if ($mode -eq 'dark') {
    [void](Invoke-Eval '(() => { const el=document.documentElement; el.classList.add("dark"); el.setAttribute("data-theme","graphite_night"); return "dark"; })()')
  } else {
    [void](Invoke-Eval '(() => { const el=document.documentElement; el.classList.remove("dark"); el.removeAttribute("data-theme"); return "light"; })()')
  }
  Start-Sleep -Milliseconds 900

  foreach ($v in $views) {
    $js = 'import("/src/stores/navigation.ts").then(m => { m.useNavigationStore().navigate("' + $v.id + '"); return "ok"; })'
    $r = Invoke-Eval $js
    Start-Sleep -Milliseconds 1400
    $file = Join-Path $OutDir ("{0}-{1}.png" -f $v.slug, $mode)
    try {
      $size = Save-WindowShot $hwnd $file
      $results += [pscustomobject]@{ view = $v.id; mode = $mode; ok = $true; kb = [math]::Round($size / 1KB, 1) }
      Write-Output ("OK  {0,-24} {1,-6} {2,7} KB" -f $v.id, $mode, [math]::Round($size / 1KB, 1))
    } catch {
      $results += [pscustomobject]@{ view = $v.id; mode = $mode; ok = $false; kb = 0 }
      Write-Output ("FAIL {0} {1}: {2}" -f $v.id, $mode, $_.Exception.Message)
    }
  }
}

# 收尾：恢复亮色
[void](Invoke-Eval '(() => { const el=document.documentElement; el.classList.remove("dark"); el.removeAttribute("data-theme"); return "light"; })()')

Write-Output ''
Write-Output ('=== 完成: ' + ($results | Where-Object ok).Count + ' / ' + $results.Count + ' ===')
Get-ChildItem $OutDir -Filter '*.png' | Sort-Object Name | ForEach-Object { '  {0,-34} {1,7} KB' -f $_.Name, [math]::Round($_.Length / 1KB, 1) }
