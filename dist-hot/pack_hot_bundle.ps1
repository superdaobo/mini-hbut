$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $root
Compress-Archive -Path ".\dist\*" -DestinationPath ".\dist-hot\mini-hbut-web-1.2.7.zip" -Force