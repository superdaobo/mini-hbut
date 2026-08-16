[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
chcp 65001 > $null

$env:HBUT_DEBUG_ENABLE_BRIDGE_TOOLS = 'true'
npm.cmd run tauri -- dev
