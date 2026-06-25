# 启动 Tauri 开发环境：释放 1420 端口后执行 npx tauri dev
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

$port = 1420
$listeners = netstat -ano | Select-String ":$port\s+.*LISTENING"
foreach ($line in $listeners) {
    $pid = ($line -split '\s+')[-1]
    if ($pid -match '^\d+$' -and [int]$pid -gt 0) {
        Write-Host "释放端口 $port ：结束进程 PID $pid"
        Stop-Process -Id ([int]$pid) -Force -ErrorAction SilentlyContinue
    }
}

# Cursor 沙箱可能注入此变量，导致 cargo 编译异常
if ($env:CARGO_TARGET_DIR -like '*cursor-sandbox-cache*') {
    Remove-Item Env:CARGO_TARGET_DIR
    Write-Host '已清除沙箱 CARGO_TARGET_DIR'
}

Set-Location (Split-Path $PSScriptRoot -Parent)
npx tauri dev
